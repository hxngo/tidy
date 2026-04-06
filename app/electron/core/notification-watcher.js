/**
 * notification-watcher.js
 * macOS 알림 센터 DB + iMessage DB를 폴링해 새 메시지를 감지한다.
 * 특정 앱 화이트리스트 대신, 시스템 노이즈 번들만 제외하고 모든 앱 알림을 수집한다.
 *
 * 필요 권한:
 *   - macOS 시스템 설정 > 개인 정보 보호 및 보안 > 전체 디스크 접근
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const EventEmitter = require('events')
const store = require('../store')
const contacts = require('./contacts')

// 디버그 로그 파일 (패키지 앱에서도 확인 가능)
const LOG_FILE = path.join(os.homedir(), 'Library/Application Support/Tidy/notif-debug.log')
function dlog(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
  console.log(...args)
  try { fs.appendFileSync(LOG_FILE, line) } catch {}
}

// 앱 꺼져있는 동안 놓친 알림을 방지하기 위해 최대 24시간치만 소급
const MAX_CATCHUP_IDS = 500

const NOTIFICATION_DB = path.join(
  os.homedir(),
  'Library/Group Containers/group.com.apple.usernoted/db2/db'
)
const IMESSAGE_DB = path.join(os.homedir(), 'Library/Messages/chat.db')

// OS UI / 시스템 유틸 — 업무와 무관한 노이즈만 제외
const IGNORE_BUNDLES = new Set([
  // macOS 시스템 UI
  'com.apple.springboard',
  'com.apple.Spotlight',
  'com.apple.systempreferences',
  'com.apple.finder',
  'com.apple.SecurityAgent',
  'com.apple.notificationcenterui',
  'com.apple.loginwindow',
  'com.apple.dock',
  'com.apple.controlcenter',
  'com.apple.screensaver',
  'com.apple.dt.Xcode',
  'com.apple.installer',
  'com.apple.AppStore',
  // 반복성 시스템 알림 (Screen Time, Game Center, 정책 알림 등)
  'com.apple.screentimenotifications',
  'com.apple.ScreenTime',
  'com.apple.gamepolicyd',
  'com.apple.GameCenter',
  'com.apple.gamed',
  'com.apple.softwareupdate',
  'com.apple.Software Update',
  'com.apple.MobileSMS',   // 알림 전용 (실제 메시지는 iMessage로)
  'com.apple.coreduetd',
  'com.apple.mediaanalysisd',
  'com.apple.backgroundtaskmanagement',
  // Adobe — 마케팅/업데이트성 알림
  'com.adobe.acc.AdobeCreativeCloud',
  'com.adobe.accmac',
  'com.adobe.acc',
  'com.adobe.Creative Cloud',
  // 기타 마케팅성 업데이트 알림
  'com.microsoft.autoupdate2',
  'com.google.Keystone',
  // Tidy 자체 알림 제외 (개발 빌드 + 패키지 빌드)
  'com.github.electron',
  'com.tidy.app',
])

class NotificationWatcher extends EventEmitter {
  constructor() {
    super()
    this.notifDb = null
    this.imessageDb = null
    this.lastNotifId = 0
    this.lastMessageRowId = 0
    this.timer = null          // fallback 폴링 (60초)
    this.notifWatcher = null   // FSEvents 감시자 (알림 DB)
    this.imsgWatcher = null    // FSEvents 감시자 (iMessage DB)
    this._debounceTimer = null // 연속 변경 디바운스
    this.enabledSources = {}
  }

  /**
   * @param {Object} enabledSources - { enabled: bool, imessage: bool }
   */
  async start(enabledSources = {}) {
    this.stop()
    this.enabledSources = enabledSources

    const hasAny = enabledSources.enabled || enabledSources.imessage
    if (!hasAny) {
      console.log('[NotificationWatcher] 비활성화, 건너뜀')
      return
    }

    try {
      const Database = require('better-sqlite3')

      // macOS 알림 DB (전체 앱)
      const notifDbExists = fs.existsSync(NOTIFICATION_DB)
      dlog(`[NotificationWatcher] 알림 DB exists=${notifDbExists} enabled=${enabledSources.enabled}`)
      if (enabledSources.enabled && notifDbExists) {
        try {
          this.notifDb = new Database(NOTIFICATION_DB, { readonly: true, fileMustExist: true })
          const row = this.notifDb.prepare('SELECT MAX(rec_id) as maxId FROM record').get()
          const currentMax = row?.maxId || 0
          const savedId = store.get('lastNotifId') || 0
          // savedId가 currentMax보다 크면 DB가 초기화된 것 → currentMax로 리셋
          this.lastNotifId = savedId > 0 && savedId <= currentMax && currentMax - savedId <= MAX_CATCHUP_IDS
            ? savedId
            : currentMax
          dlog(`[NotificationWatcher] 알림 DB 연결 OK - lastNotifId=${this.lastNotifId} currentMax=${currentMax} savedId=${savedId}`)
        } catch (err) {
          dlog(`[NotificationWatcher] 알림 DB 오류: ${err.message}`)
          this.notifDb = null
        }
      }

      // iMessage DB
      if (enabledSources.imessage && fs.existsSync(IMESSAGE_DB)) {
        try {
          this.imessageDb = new Database(IMESSAGE_DB, { readonly: true, fileMustExist: true })
          const row = this.imessageDb.prepare('SELECT MAX(ROWID) as maxId FROM message').get()
          const currentMax = row?.maxId || 0
          const savedId = store.get('lastMessageRowId') || 0
          this.lastMessageRowId = savedId > 0 && currentMax - savedId <= MAX_CATCHUP_IDS
            ? savedId
            : currentMax
          console.log('[NotificationWatcher] iMessage DB 연결 - 소급 시작 ROWID:', this.lastMessageRowId, '(현재 max:', currentMax, ')')
        } catch (err) {
          console.log('[NotificationWatcher] iMessage DB 권한 없음:', err.message)
          this.imessageDb = null
        }
      }

      // FSEvents로 DB 파일 변경 즉시 감지
      const debouncedPoll = () => {
        clearTimeout(this._debounceTimer)
        this._debounceTimer = setTimeout(() => this._poll(), 200)
      }

      if (this.notifDb) {
        try {
          const walPath = NOTIFICATION_DB + '-wal'
          const watchTarget = fs.existsSync(walPath) ? walPath : NOTIFICATION_DB
          this.notifWatcher = fs.watch(watchTarget, debouncedPoll)
          dlog('[NotificationWatcher] FSEvents 감시 시작:', watchTarget)
        } catch (err) {
          dlog('[NotificationWatcher] FSEvents 실패, 폴링으로 대체:', err.message)
        }
      }

      if (this.imessageDb) {
        try {
          const walPath = IMESSAGE_DB + '-wal'
          const watchTarget = fs.existsSync(walPath) ? walPath : IMESSAGE_DB
          this.imsgWatcher = fs.watch(watchTarget, debouncedPoll)
          console.log('[NotificationWatcher] iMessage FSEvents 감시 시작:', watchTarget)
        } catch (err) {
          console.log('[NotificationWatcher] iMessage FSEvents 실패, 폴링으로 대체:', err.message)
        }
      }

      // fallback: 10초 폴링 (FSEvents 누락 대비)
      this.timer = setInterval(() => this._poll(), 10_000)
      dlog('[NotificationWatcher] 감시 시작 (FSEvents + 10초 fallback)')
    } catch (err) {
      console.log('[NotificationWatcher] 초기화 실패:', err.message)
    }
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    clearTimeout(this._debounceTimer)
    try { this.notifWatcher?.close() } catch {}
    try { this.imsgWatcher?.close() } catch {}
    this.notifWatcher = null
    this.imsgWatcher = null
    try { this.notifDb?.close() } catch {}
    try { this.imessageDb?.close() } catch {}
    this.notifDb = null
    this.imessageDb = null
    console.log('[NotificationWatcher] 중지됨')
  }

  async _poll() {
    await this._pollNotifications()
    await this._pollIMessages()
  }

  async _pollNotifications() {
    if (!this.notifDb) return

    try {
      const rows = this.notifDb.prepare(`
        SELECT r.rec_id, a.identifier as app, r.data
        FROM record r JOIN app a ON r.app_id = a.app_id
        WHERE r.rec_id > ? ORDER BY r.rec_id ASC LIMIT 100
      `).all(this.lastNotifId)
      if (rows.length > 0) dlog(`[NotificationWatcher] poll: lastId=${this.lastNotifId} 신규=${rows.length}개 앱들=${[...new Set(rows.map(r=>r.app.split('.').pop()))].join(',')}`)


      for (const row of rows) {
        this.lastNotifId = row.rec_id

        // 시스템 노이즈 제외
        if (IGNORE_BUNDLES.has(row.app)) continue

        // 사용자가 차단한 앱 제외
        const blockedBundles = store.get('blockedBundles') || []
        if (blockedBundles.includes(row.app)) continue

        const text = this._extractTextFromPlist(row.data, row.app.includes('kakao'))
        if (!text || text.length < 5) {
          dlog(`[NotificationWatcher] 텍스트 없음 rec_id=${row.rec_id} app=${row.app}`)
          continue
        }

        const appName = row.app?.split('.').pop() || row.app

        // seenApps 기록 (앱 필터 UI용)
        const seenApps = store.get('seenApps') || {}
        if (!seenApps[row.app]) {
          seenApps[row.app] = { name: appName, count: 0, firstSeen: new Date().toISOString() }
        }
        seenApps[row.app].count = (seenApps[row.app].count || 0) + 1
        seenApps[row.app].lastSeen = new Date().toISOString()
        store.set('seenApps', seenApps)

        // 알림 제목 = 발신자명 (메신저 앱은 title이 보낸 사람 이름)
        const colonIdx = text.indexOf(': ')
        let sender = (colonIdx > 0 && colonIdx <= 30) ? text.slice(0, colonIdx).trim() : null
        // 발신자가 전화번호 형태면 연락처 이름으로 변환
        if (sender && /^[\d\s\-+()]{7,}$/.test(sender)) {
          const contactName = await contacts.lookupName(sender)
          if (contactName) {
            console.log(`[NotificationWatcher] 전화번호 발신자 변환: ${sender} → ${contactName}`)
            sender = contactName
          }
        }
        dlog(`[NotificationWatcher] 알림 감지: ${row.app} - "${text.slice(0, 60)}"`)
        this.emit('message', { source: appName, bundleId: row.app, text, sender })
      }
      // 마지막 처리 ID 영속 저장 (앱 재시작 시 소급용)
      store.set('lastNotifId', this.lastNotifId)
    } catch {
      // WAL 충돌, DB 잠금 등 무시
    }
  }

  async _pollIMessages() {
    if (!this.imessageDb || !this.enabledSources.imessage) return

    try {
      const rows = this.imessageDb.prepare(`
        SELECT m.ROWID, m.text, h.id as handle_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.ROWID > ?
          AND m.is_from_me = 0
          AND m.text IS NOT NULL
          AND length(m.text) > 5
        ORDER BY m.ROWID ASC
        LIMIT 20
      `).all(this.lastMessageRowId)

      for (const row of rows) {
        this.lastMessageRowId = row.ROWID
        const handle = row.handle_id || ''
        // 연락처에 저장된 이름으로 변환 (없으면 handle 그대로)
        const contactName = await contacts.lookupName(handle)
        const sender = contactName || handle || '알 수 없는 연락처'
        const text = `[iMessage] ${sender}:\n${row.text}`
        console.log(`[NotificationWatcher] 새 iMessage: ${handle}${contactName ? ` → ${contactName}` : ''}`)
        this.emit('message', { source: 'imessage', text, sender })
      }
      // 마지막 처리 ROWID 영속 저장
      store.set('lastMessageRowId', this.lastMessageRowId)
    } catch {
      // 권한 없음 등 무시
    }
  }

  _extractTextFromPlist(buffer, debug = false) {
    if (!buffer || buffer.length < 4) return null
    try {
      const bplist = require('bplist-parser')
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
      const parsed = bplist.parseBuffer(buf)[0]
      const req = (parsed && parsed.req) ? parsed.req : parsed
      if (!req) return null

      if (debug) console.log('[NotificationWatcher] 카카오톡 plist 키:', JSON.stringify(Object.keys(req)), '/ 값 미리보기:', JSON.stringify(req).slice(0, 300))

      // 알려진 모든 키 시도 (앱마다 다름)
      const t = String(req.titl || req.title || req.app || '').trim()
      const b = String(req.body || req.subtitle || req.subt || req.msg || req.message || req.content || '').trim()
      const parts = [t, b].filter(s => s.length > 1)
      if (parts.length) return parts.join(': ').slice(0, 500)

      // 마지막 수단: 모든 문자열 값 중 가장 긴 것 추출
      const allStrings = Object.values(req)
        .filter(v => typeof v === 'string' && v.trim().length > 5)
        .sort((a, b) => b.length - a.length)
      if (allStrings.length) return allStrings[0].slice(0, 500)
    } catch (e) {
      console.log('[NotificationWatcher] plist 파싱 오류:', e.message)
    }
    return null
  }
}

module.exports = new NotificationWatcher()
