const { Notification, powerMonitor } = require('electron')
const store = require('../store')
const { fetchUnseenEmails } = require('./imap')
const { fetchNewMessages } = require('./slack')
// 순환 의존성 방지: 호출 시점에 lazy require
function processIncomingMessage(...args) {
  return require('../ipc-handlers').processIncomingMessage(...args)
}
function processFileUpload(...args) {
  return require('../ipc-handlers').processFileUpload(...args)
}
const notificationWatcher = require('./notification-watcher')
const watchFolder = require('./watch-folder')
const vault = require('./vault')

let emailTimer = null
let slackTimer = null
let dailySummaryTimer = null
let urgentReminderTimer = null

// ─── 긴급 알림 재전송 ─────────────────────────────────────────
// 스케줄: 1차 즉시 → 2~4차 10분 간격 (30분) → 이후 30분 간격 → 2시간 후 중단
const REMINDER_PHASE1_INTERVAL = 10 * 60 * 1000   // 10분
const REMINDER_PHASE2_INTERVAL = 30 * 60 * 1000   // 30분
const REMINDER_MAX_DURATION    =  2 * 60 * 60 * 1000 // 2시간
const REMINDER_PHASE1_COUNT    = 3  // 2~4차 (10분 간격)

function checkUrgentReminders() {
  if (!Notification.isSupported()) return

  const now = Date.now()
  const state = store.get('urgentReminders') || {}   // { [itemId]: { firstAt, count, lastAt } }
  const highItems = vault.getItems({ limit: 200 }).filter(
    i => i.priority === 'high' && i.status === 'new'
  )
  const activeIds = new Set(highItems.map(i => i.id))

  // 완료됐거나 만료된 항목 정리
  for (const id of Object.keys(state)) {
    if (!activeIds.has(id) || now - state[id].firstAt > REMINDER_MAX_DURATION) {
      delete state[id]
    }
  }

  for (const item of highItems) {
    const s = state[item.id]
    if (!s) continue  // 처음 감지는 sendDesktopNotification에서 이미 전송됨

    const elapsed = now - s.firstAt
    if (elapsed > REMINDER_MAX_DURATION) continue

    const interval = s.count <= REMINDER_PHASE1_COUNT
      ? REMINDER_PHASE1_INTERVAL
      : REMINDER_PHASE2_INTERVAL

    if (now - s.lastAt < interval) continue

    // 리마인더 전송
    let peopleArr = []
    try { peopleArr = JSON.parse(item.people || '[]') } catch (_) {}
    const who = (Array.isArray(peopleArr) ? peopleArr[0] : null) || item.source || '긴급'
    const notif = new Notification({
      title: `[긴급 리마인더] ${who}`,
      body: item.summary?.slice(0, 120) || '',
      silent: false,
    })
    notif.on('click', () => {
      const win = _getWindow?.()
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send('navigate:inbox-item', { itemId: item.id })
      }
    })
    notif.show()
    s.count += 1
    s.lastAt = now
    console.log(`[UrgentReminder] ${item.id} 재전송 (${s.count}회차)`)
  }

  store.set('urgentReminders', state)
}

// 긴급 아이템 최초 감지 시 리마인더 추적 시작
function registerUrgentReminder(itemId) {
  const state = store.get('urgentReminders') || {}
  if (!state[itemId]) {
    state[itemId] = { firstAt: Date.now(), count: 1, lastAt: Date.now() }
    store.set('urgentReminders', state)
    console.log(`[UrgentReminder] 등록: ${itemId}`)
  }
}

// registerUrgentReminder는 아래 module.exports에서 함께 export됨

// ─── 메시지 그룹화 버퍼 ──────────────────────────────────────
// 첫 메시지: 200ms 후 처리 (거의 즉시)
// 연타(200ms 내 추가 메시지): 타이머 리셋해서 마지막 메시지 기준 2초 후 묶어서 처리
const msgBuffer = {}

// 버퍼 진입 전 사전 필터 — AI 호출 없이 즉시 버림
const TRIVIAL_PATTERN = /^(네|넵|넹|ㅇㅋ|ㅇㅇ|ㅇ|ok|okay|알겠어|알겠습니다|알겠어요|알겠다|알겠음|고마워|감사합니다|감사해요|고맙습니다|수고하세요|수고하셨습니다|확인했어요|확인했습니다|확인함|확인|ㄱㅅ|ㄳ|👍|🙏)[.!~ㅋ\s]*$/i

async function flushBuffer(key) {
  const buf = msgBuffer[key]
  if (!buf) return
  delete msgBuffer[key]
  const combinedText = buf.texts.length > 1
    ? buf.texts.map((t, i) => `[메시지 ${i + 1}] ${t}`).join('\n\n')
    : buf.texts[0]
  const w = _getWindow?.()
  try {
    await processIncomingMessage(combinedText, buf.source, w, {
      bundleId: buf.bundleId,
      notifSender: buf.sender,
    })
  } catch (err) {
    console.error('[Scheduler] 알림 처리 오류:', err.message)
  }
}

function bufferMessage({ source, bundleId, text, sender }) {
  // 단순 반응 메시지는 버퍼 진입 전에 즉시 버림 (200ms 대기 불필요)
  const trimmed = text.trim()
  if (trimmed.length <= 30 && TRIVIAL_PATTERN.test(trimmed)) {
    console.log('[Scheduler] 단순 반응 사전 필터:', trimmed.slice(0, 20))
    return
  }

  const key = `${bundleId}:${sender || '_'}`
  if (msgBuffer[key]) {
    // 연타 — 타이머 리셋, 2초 후 묶어서 처리
    clearTimeout(msgBuffer[key].timer)
    msgBuffer[key].texts.push(text)
    msgBuffer[key].timer = setTimeout(() => flushBuffer(key), 2_000)
  } else {
    // 첫 메시지 — 200ms 후 처리 (거의 즉시)
    msgBuffer[key] = { texts: [text], source, bundleId, sender }
    msgBuffer[key].timer = setTimeout(() => flushBuffer(key), 200)
  }
}

let _getWindow = null

// win이 null이어도 동기화는 실행, webContents.send만 조건부
function send(win, channel, data) {
  try {
    if (win && !win.isDestroyed()) win.webContents.send(channel, data)
  } catch {}
}

async function syncGmail(win) {
  if (!store.get('gmailEmail') || !store.get('gmailAppPassword')) return
  try {
    send(win, 'sync:status', { type: 'gmail', status: 'syncing' })
    await fetchUnseenEmails(async (emailData, source) => {
      await processIncomingMessage(emailData.rawText, source, win)
    })
    send(win, 'sync:status', { type: 'gmail', status: 'done', lastSynced: new Date().toISOString() })
  } catch (error) {
    console.error('[Scheduler] Gmail 오류:', error.message)
    send(win, 'sync:error', { type: 'gmail', error: error.message })
  }
}

// ─── 일일 요약 ────────────────────────────────────────────────
// 매일 오전 9시에 당일 할 일 목록을 데스크탑 알림으로 전송

function sendDailySummary() {
  try {
    const allTasks = vault.getTasks({ status: 'active' })
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // 오늘 마감 태스크
    const todayTasks = allTasks.filter(t => t.due_date && t.due_date.startsWith(todayStr))
    // 마감 없는 태스크 (전체 active 중 오늘 마감 제외, 최대 3개)
    const noDateTasks = allTasks.filter(t => !t.due_date).slice(0, 3)

    const total = allTasks.length
    const todayCount = todayTasks.length

    let body = ''
    if (todayCount > 0) {
      body += `오늘 마감 ${todayCount}개: ${todayTasks.slice(0, 3).map(t => t.title).join(', ')}`
      if (todayCount > 3) body += ` 외 ${todayCount - 3}개`
    } else if (total > 0) {
      body += `진행 중 ${total}개`
      if (noDateTasks.length > 0) {
        body += `: ${noDateTasks.map(t => t.title).join(', ')}`
      }
    } else {
      body = '오늘 할 일이 없습니다 🎉'
    }

    const notif = new Notification({
      title: `Tidy — 일일 요약`,
      body,
      silent: false,
    })
    notif.show()
    store.set('lastDailySummary', new Date().toISOString())
    console.log('[Scheduler] 일일 요약 알림 전송:', body)
  } catch (err) {
    console.error('[Scheduler] 일일 요약 오류:', err.message)
  }
}

// 다음 오전 9시까지 남은 ms 계산
function msUntilNextNineAM() {
  const now = new Date()
  const next = new Date(now)
  next.setHours(9, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

function scheduleDailySummary() {
  if (dailySummaryTimer) { clearTimeout(dailySummaryTimer); dailySummaryTimer = null }
  const delay = msUntilNextNineAM()
  console.log(`[Scheduler] 일일 요약 예약: ${Math.round(delay / 60000)}분 후`)
  dailySummaryTimer = setTimeout(() => {
    sendDailySummary()
    // 이후 24시간마다 반복
    dailySummaryTimer = setInterval(sendDailySummary, 24 * 60 * 60 * 1000)
  }, delay)
}

async function syncSlack(win) {
  const channels = store.get('slackChannels') || []
  if (!store.get('slackToken') || channels.length === 0) return
  try {
    send(win, 'sync:status', { type: 'slack', status: 'syncing' })
    await fetchNewMessages(channels, async (msgData, source) => {
      await processIncomingMessage(msgData.rawText, source, win)
    })
    send(win, 'sync:status', { type: 'slack', status: 'done', lastSynced: new Date().toISOString() })
  } catch (error) {
    console.error('[Scheduler] Slack 오류:', error.message)
    send(win, 'sync:error', { type: 'slack', error: error.message })
  }
}

// 스케줄러 시작: 앱 시작 즉시 1회 실행 + 주기적 반복
// 창이 없어도(백그라운드) 동기화는 실행됨 — vault에 저장되고 창 열면 즉시 반영
function startScheduler(getWindow) {
  _getWindow = getWindow
  stopScheduler()

  const emailInterval = store.get('syncIntervalEmail') || 300000  // 5분
  const slackInterval = store.get('syncIntervalSlack') || 120000  // 2분

  // 앱 시작 3초 후 미읽음 긴급 아이템 알림
  setTimeout(() => {
    if (!Notification.isSupported()) return
    try {
      const urgentItems = vault.getItems({ limit: 200 }).filter(
        i => i.priority === 'high' && i.status === 'new'
      )
      if (urgentItems.length === 0) return
      const win = _getWindow?.()
      const summary = urgentItems.length === 1
        ? urgentItems[0].summary?.slice(0, 80) || '처리가 필요합니다'
        : `${urgentItems.length}개의 긴급 항목이 처리를 기다리고 있습니다`
      const notif = new Notification({
        title: `[긴급] Tidy`,
        body: summary,
        silent: false,
        interruptionLevel: 'timeSensitive',
      })
      notif.on('click', () => {
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore()
          win.show(); win.focus()
          if (urgentItems.length === 1) {
            win.webContents.send('navigate:inbox-item', { itemId: urgentItems[0].id })
          }
        }
      })
      notif.show()
      console.log(`[Scheduler] 긴급 알림 전송: ${urgentItems.length}개`)
    } catch (err) {
      console.error('[Scheduler] 긴급 시작 알림 오류:', err.message)
    }
  }, 3000)

  // 앱 시작 5초 후 즉시 1회 동기화
  setTimeout(async () => {
    const win = getWindow()
    await syncGmail(win)
    await syncSlack(win)

    // 알림 감시 시작 — 창 없이도 항상 실행
    const sources = store.get('notificationSources') || {}
    const effectiveSources = { ...sources, enabled: true }

    // 메시지 그룹화 버퍼를 통해 처리 (90초 내 같은 발신자 묶기)
    notificationWatcher.on('message', (msg) => bufferMessage(msg))
    await notificationWatcher.start(effectiveSources)

    // 파일 감시 폴더 시작
    const watchFolderPath = store.get('watchFolderPath')
    if (watchFolderPath) {
      watchFolder.on('newFile', async ({ filePath }) => {
        try {
          await processFileUpload(filePath, getWindow())
          console.log('[WatchFolder] 처리 완료:', filePath)
        } catch (err) {
          console.error('[WatchFolder] 처리 오류:', err.message)
        }
      })
      watchFolder.start(watchFolderPath)
    }
  }, 5000)

  // 이후 주기적 반복 (창 유무와 무관하게 실행)
  emailTimer = setInterval(async () => {
    await syncGmail(getWindow())
  }, emailInterval)

  slackTimer = setInterval(async () => {
    await syncSlack(getWindow())
  }, slackInterval)

  // 일일 요약 (매일 오전 9시)
  scheduleDailySummary()

  // 긴급 알림 리마인더 (10분마다 체크)
  urgentReminderTimer = setInterval(checkUrgentReminders, REMINDER_PHASE1_INTERVAL)

  // 잠자기 해제 시 즉시 동기화 (절전 중 누락된 메시지 수집)
  powerMonitor.on('resume', async () => {
    console.log('[Scheduler] 잠자기 해제 감지 — 즉시 동기화 시작')
    const win = _getWindow?.()
    // 3초 대기 (네트워크 연결 복구 시간)
    await new Promise(r => setTimeout(r, 3000))
    await syncGmail(win)
    await syncSlack(win)
    // 알림 폴러도 즉시 1회 실행
    notificationWatcher._poll?.()
    console.log('[Scheduler] 잠자기 해제 후 동기화 완료')
  })

  console.log('[Scheduler] 시작됨 - 이메일:', emailInterval / 1000 + 's, Slack:', slackInterval / 1000 + 's')
}

function stopScheduler() {
  if (emailTimer) { clearInterval(emailTimer); emailTimer = null }
  if (slackTimer) { clearInterval(slackTimer); slackTimer = null }
  if (dailySummaryTimer) { clearTimeout(dailySummaryTimer); clearInterval(dailySummaryTimer); dailySummaryTimer = null }
  if (urgentReminderTimer) { clearInterval(urgentReminderTimer); urgentReminderTimer = null }
  notificationWatcher.stop()
  watchFolder.stop()
  // 버퍼에 남은 타이머 정리
  for (const key of Object.keys(msgBuffer)) {
    clearTimeout(msgBuffer[key].timer)
    delete msgBuffer[key]
  }
  console.log('[Scheduler] 중지됨')
}

async function syncNotifications(win) {
  if (!notificationWatcher.notifDb && !notificationWatcher.imessageDb) return
  try {
    send(win, 'sync:status', { type: 'notifications', status: 'syncing' })
    await notificationWatcher._poll()
    send(win, 'sync:status', { type: 'notifications', status: 'done', lastSynced: new Date().toISOString() })
  } catch (error) {
    console.error('[Scheduler] 알림 폴 오류:', error.message)
    send(win, 'sync:error', { type: 'notifications', error: error.message })
  }
}

module.exports = { startScheduler, stopScheduler, registerUrgentReminder, syncGmail, syncSlack, syncNotifications }
