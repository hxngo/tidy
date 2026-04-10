const { randomUUID, createHash } = require('crypto')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { shell, Notification, dialog, app } = require('electron')
const store = require('./store')
const vault = require('./core/vault')
const { analyzeMessage, analyzeImageFile, processNlTaskAction, generateReplyDraft, generateWeeklyReport } = require('./core/ai')
const { fetchUnseenEmails, testConnection: testImapConnection } = require('./core/imap')
const { fetchNewMessages, testConnection: testSlackConnection } = require('./core/slack')
const { extractText, inferSource, isImageFile } = require('./core/parser')
const { handleEventFromAnalysis, getCalendars, createEvent } = require('./core/calendar')
const { ensureFullDiskAccess, checkFullDiskAccess, showFullDiskAccessDialog } = require('./core/permissions')
const vaultWatcher = require('./core/vault-watcher')
const gdrive = require('./core/gdrive')
const { syncGmail, syncSlack, syncNotifications } = require('./core/scheduler')

// ─── 한국어 초성 검색 ─────────────────────────────────────────
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']

function toChosung(str) {
  return [...(str || '')].map(ch => {
    const code = ch.charCodeAt(0)
    if (code >= 0xAC00 && code <= 0xD7A3) return CHOSUNG[Math.floor((code - 0xAC00) / 588)]
    return ch
  }).join('')
}

function isKoreanConsonant(ch) {
  const code = ch.charCodeAt(0)
  return code >= 0x3131 && code <= 0x314E // ㄱ-ㅎ 범위
}

// 쿼리가 초성만 포함하거나 음절+초성 혼합일 때도 매칭
function matchesQuery(text, q) {
  if (!text || !q) return false
  const textL = text.toLowerCase()
  const qL = q.toLowerCase()
  // 1) 일반 포함 검색
  if (textL.includes(qL)) return true
  // 2) 초성 검색: 쿼리에 한글 자음(초성)이 포함된 경우
  if ([...q].some(isKoreanConsonant)) {
    const textCho = toChosung(textL)
    const qCho = toChosung(qL)
    if (textCho.includes(qCho)) return true
  }
  return false
}

// ─── 자연어 날짜 → YYYY-MM-DD 변환 ────────────────────────────
const DAY_MAP = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 }
function resolveDateToISO(dateStr) {
  if (!dateStr) return null
  const ds = String(dateStr).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) return ds // 이미 ISO 형식

  const now = new Date()
  let date = new Date(now)

  if (/^(오늘|today)$/i.test(ds)) {
    // 오늘
  } else if (/^(내일|tomorrow)$/i.test(ds)) {
    date.setDate(date.getDate() + 1)
  } else if (/^모레$/.test(ds)) {
    date.setDate(date.getDate() + 2)
  } else if (/다음\s*주\s*([월화수목금토일])/.test(ds)) {
    const dayChar = ds.match(/다음\s*주\s*([월화수목금토일])/)[1]
    const target = DAY_MAP[dayChar]
    const d = new Date(now)
    d.setDate(d.getDate() + 7)
    while (d.getDay() !== target) d.setDate(d.getDate() + 1)
    date = d
  } else if (/다음\s*주/.test(ds)) {
    date.setDate(date.getDate() + 7)
  } else if (/이번\s*주\s*([월화수목금토일])/.test(ds)) {
    const dayChar = ds.match(/이번\s*주\s*([월화수목금토일])/)[1]
    const target = DAY_MAP[dayChar]
    const d = new Date(now)
    while (d.getDay() !== target) d.setDate(d.getDate() + 1)
    date = d
  } else if (/이번\s*주/.test(ds)) {
    // 이번 주 (요일 미지정) → 이번 주 금요일
    const d = new Date(now)
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
    date = d
  } else if (/다음\s*달/.test(ds)) {
    date = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  } else if (/^([월화수목금토일])요일$/.test(ds) || /^([월화수목금토일])$/.test(ds)) {
    const dayChar = ds.match(/^([월화수목금토일])/)[1]
    const target = DAY_MAP[dayChar]
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    while (d.getDay() !== target) d.setDate(d.getDate() + 1)
    date = d
  } else if (/(\d{1,2})월\s*(\d{1,2})일/.test(ds)) {
    const m = ds.match(/(\d{1,2})월\s*(\d{1,2})일/)
    date = new Date(now.getFullYear(), +m[1] - 1, +m[2])
    if (date < now) date.setFullYear(now.getFullYear() + 1)
  } else {
    return null
  }

  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

// ─── 중복 방지 (store에 영속 저장 — 앱 재시작 후에도 유지) ────
const MAX_HASH_ENTRIES = 1000

function getMessageHash(rawText, source) {
  return createHash('md5').update(`${source}:${(rawText || '').slice(0, 200)}`).digest('hex').slice(0, 16)
}

function isAlreadyProcessed(rawText, source) {
  const hash = getMessageHash(rawText, source)
  const hashes = store.get('processedHashes') || []
  if (hashes.includes(hash)) return true
  // 새 해시 추가, 최대 크기 초과 시 오래된 것부터 제거
  const updated = [...hashes, hash]
  if (updated.length > MAX_HASH_ENTRIES) updated.splice(0, updated.length - MAX_HASH_ENTRIES)
  store.set('processedHashes', updated)
  return false
}

// ─── 재처리 큐 (AI 실패 시 자동 재시도) ───────────────────────
const retryQueue = []
let retryTimer = null

function addToRetryQueue(rawText, source) {
  if (retryQueue.length >= 50) return  // 큐 최대 크기
  if (retryQueue.some(i => i.rawText === rawText && i.source === source)) return
  retryQueue.push({ rawText, source, retries: 0 })
  console.log('[RetryQueue] 추가됨, 현재 크기:', retryQueue.length)
}

function startRetryTimer(getWindow) {
  if (retryTimer) return
  retryTimer = setInterval(async () => {
    if (retryQueue.length === 0) return
    const win = getWindow()
    if (!win) return
    const item = retryQueue.shift()
    try {
      await processIncomingMessage(item.rawText, item.source, win, { isRetry: true })
      console.log('[RetryQueue] 재처리 성공:', item.source)
    } catch (err) {
      item.retries++
      if (item.retries < 3) {
        retryQueue.push(item)
        console.log(`[RetryQueue] 재처리 실패 (${item.retries}/3):`, err.message)
      } else {
        console.error('[RetryQueue] 최대 재시도 초과, 제거')
      }
    }
  }, 120_000)  // 2분마다 재시도
}

// 처리된 메시지에 대한 macOS 데스크탑 알림 전송
function sendDesktopNotification({ source, summary, people, hasEvent, eventTitle, priority, itemId, win, filePath }) {
  if (!Notification.isSupported()) return
  try {
    const who = people?.length > 0 ? people[0] : source
    const isUrgent = priority === 'high'

    // 파일 경로: vault 기준 상대 경로만 표시 (짧게)
    const vaultPath = require('./core/vault').getVaultPath()
    const relPath = filePath
      ? require('path').relative(vaultPath, filePath)
      : null

    let title, body
    if (isUrgent) {
      title = `[긴급] ${who}`
      body = (summary?.slice(0, 100) || '') + (relPath ? `\n📄 ${relPath}` : '')
    } else if (hasEvent) {
      title = `일정 등록 — ${who}`
      body = `${eventTitle || '새 일정'} · ${summary?.slice(0, 60) || ''}` + (relPath ? `\n📄 ${relPath}` : '')
    } else {
      title = who
      body = (summary?.slice(0, 100) || '') + (relPath ? `\n📄 ${relPath}` : '')
    }

    const notifOpts = { title, body, silent: !isUrgent }
    if (isUrgent) notifOpts.interruptionLevel = 'timeSensitive' // Focus 모드도 뚫고 표시
    const notif = new Notification(notifOpts)

    notif.on('click', () => {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        // 해당 인박스 아이템으로 이동
        if (itemId) {
          win.webContents.send('navigate:inbox-item', { itemId })
        }
      }
    })

    notif.show()
  } catch (err) {
    console.error('[Notification] 알림 전송 실패:', err.message)
  }
}

// ─── 컨텍스트 캐시 (30초 TTL) ────────────────────────────────
// 인물/프로젝트/폴더 목록은 자주 바뀌지 않으므로 메모리에 캐시
let _ctxCache = null
let _ctxCacheAt = 0
const CTX_CACHE_TTL = 30_000

function getContextCached() {
  const now = Date.now()
  if (_ctxCache && now - _ctxCacheAt < CTX_CACHE_TTL) return _ctxCache
  const scanPaths = store.get('scanPaths') || []
  _ctxCache = {
    people: vault.getPeople(),
    projects: vault.getProjects(),
    workTypes: store.get('workTypes') || [],
    existingFolders: vault.getExistingFolderNames(scanPaths),
  }
  _ctxCacheAt = now
  return _ctxCache
}

// 인물/프로젝트 저장 후 캐시 무효화
function invalidateContextCache() { _ctxCache = null }

// 에이전트 루프: 기존 vault 컨텍스트 읽기 → AI 분석 → 노드 업데이트
// opts.preAnalyzed: 이미 완료된 AI 분석 결과 (이미지 업로드 시 사용)
// opts.forceCalendar: true이면 calendarEnabled 설정 무관하게 캘린더 이벤트 생성
// opts.isRetry: true이면 retry 큐에서 호출된 것 (dedup 건너뜀)
async function processIncomingMessage(rawText, source, win, opts = {}) {
  const { preAnalyzed, forceCalendar = false, isRetry = false, bundleId, notifSender, skillHint, originalFilePath } = opts

  // 중복 방지 (retry는 이미 등록된 항목이므로 건너뜀)
  if (!isRetry && !preAnalyzed && isAlreadyProcessed(rawText, source)) {
    console.log('[Agent] 중복 메시지 건너뜀:', source, rawText.slice(0, 40))
    return null
  }

  // ── 사전 필터 (AI 호출 전 코드로 차단) ──────────────────────────────
  const trimmed = rawText.trim()
  const effectiveSource = (source || '').toLowerCase()
  const effectiveBundleId = (bundleId || '').toLowerCase()

  // 1. 단순 인사/감사/반응 패턴 (짧은 메시지)
  const TRIVIAL_PATTERN = /^(네|넵|넹|ㅇㅋ|ㅇㅇ|ㅇ|ok|okay|알겠어|알겠습니다|알겠어요|알겠다|알겠음|고마워|감사합니다|감사해요|고맙습니다|수고하세요|수고하셨습니다|확인했어요|확인했습니다|확인함|확인|ㄱㅅ|ㄳ|👍|🙏)[.!~ㅋ\s]*$/i
  if (!preAnalyzed && trimmed.length <= 30 && TRIVIAL_PATTERN.test(trimmed)) {
    console.log('[Agent] 단순 반응 메시지 건너뜀 (사전 필터):', trimmed)
    return null
  }

  // 2. 카카오톡 전용 필터 — 메시지 내용 추출 후 모두 trivial이면 스킵
  if (!preAnalyzed && effectiveSource === 'kakaotalkmac') {
    // "[메시지 N] 발신자: 내용" 배치 형식 or "발신자: 내용" 단일 형식에서 내용만 추출
    const KAKAO_BATCH_RE = /^\[메시지\s*\d+\]\s*[^:]+:\s*(.+)$/
    const KAKAO_SINGLE_RE = /^[^:]+:\s*(.+)$/
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
    const contents = lines.map(l => {
      const batch = KAKAO_BATCH_RE.exec(l)
      if (batch) return batch[1].trim()
      const single = KAKAO_SINGLE_RE.exec(l)
      if (single) return single[1].trim()
      return l
    })
    // trivial 판별: 이모티콘 알림, ㅋ/ㅎ 반복, 짧은 반응어, 의미없는 텍스트
    const KAKAO_TRIVIAL_RE = /^(이모티콘을 보냈습니다|사진을 보냈습니다|동영상을 보냈습니다|파일을 보냈습니다|스티커를 보냈습니다|보이스톡|페이스톡|ㅋ+ㅎ*|ㅎ+ㅋ*|ㅠ+|ㅜ+|ㄷ+|아하|오케|ㅇㅋ|넵|네+|ㄱㄷ|굿+|ㄴㄴ|노노|맞아|그렇구나|그런 느낌이구나|롸키요|헐|ㄹㅇ|ㅇㅈ|ㄹㅇㅋㅋ|오|오오|ㄱ+|ㅅ+ㅂ+|😂|🤣|👍|🙏|😊|ㅜㅜ|ㅠㅠ)[ㅋㅎ\s!~.]*$/i
    const allTrivial = contents.length > 0 && contents.every(c =>
      KAKAO_TRIVIAL_RE.test(c) ||
      /^[ㅋㅎㅜㅠ\s]+$/.test(c) ||   // ㅋㅋ/ㅎㅎ 반복
      c.length <= 2                     // 2글자 이하 반응
    )
    if (allTrivial) {
      console.log('[Agent] 카카오톡 trivial 메시지 건너뜀:', trimmed.slice(0, 60))
      return null
    }
  }

  // 3. 미디어/콘텐츠 앱 소스 — 인증번호/비밀번호가 없으면 즉시 스킵
  const NOISE_SOURCES = new Set([
    'alertnotificationservice', // YouTube, 뉴스, 앱 알림 집합체
    'claudefordesktop',         // Claude 앱 자체 알림
    'com.apple.notificationcenterui', // macOS 시스템 알림
  ])
  const isNoiseSource = NOISE_SOURCES.has(effectiveSource) || NOISE_SOURCES.has(effectiveBundleId)

  if (!preAnalyzed && isNoiseSource) {
    // 인증번호/OTP/비밀번호가 포함된 경우만 예외적으로 통과
    const hasImportantCode = /인증번호|인증코드|otp|비밀번호|password|pin\b|계좌번호|카드번호/i.test(trimmed)
    if (!hasImportantCode) {
      console.log('[Agent] 노이즈 소스 알림 건너뜀:', effectiveSource, trimmed.slice(0, 50))
      return null
    }
  }
  const itemId = randomUUID()
  const now = new Date().toISOString()

  // 1. 기존 vault 컨텍스트 수집 (캐시 사용, 30초 TTL)
  const { people: existingPeople, projects: existingProjects, workTypes, existingFolders } = getContextCached()

  console.log(`[Agent] 컨텍스트 로드: 인물 ${existingPeople.length}명, 프로젝트 ${existingProjects.length}개, 기존폴더 ${existingFolders.length}개`)

  // 2. AI 분석 — 기존 노드 컨텍스트 포함 (preAnalyzed가 있으면 재사용)
  let analysis = null
  try {
    if (preAnalyzed) {
      analysis = preAnalyzed
    } else {
      // 소스 정보를 rawText 앞에 붙여 AI가 출처를 파악할 수 있게 함
      const textWithSource = source ? `[출처: ${source}]\n${rawText}` : rawText
      analysis = await analyzeMessage(textWithSource, {
        people: existingPeople,
        projects: existingProjects,
        workTypes,
        existingFolders,
      })
    }
  } catch (error) {
    console.error('[Agent] AI 분석 오류:', error.message)
    // API 키 오류가 아닌 경우 retry 큐에 추가
    if (!isRetry && !error.message.includes('API 키')) {
      addToRetryQueue(rawText, source)
    }
    // 알림/앱 소스에서 AI 실패 시 저장 안 함 (노이즈 방지)
    const trustedSources = new Set(['gmail', 'slack', 'gdrive', 'file', 'manual', 'meeting', 'imessage', 'kakaotalkmac'])
    if (!trustedSources.has((source || '').toLowerCase())) {
      console.log('[Agent] AI 실패 + 신뢰되지 않은 소스 → 저장 건너뜀:', source)
      return null
    }
    analysis = {
      skip: false,
      summary: rawText.slice(0, 100),
      category: '정보',
      people: [],
      action_items: [],
      project_hint: null,
      priority: 'low',
    }
  }

  console.log(`[Agent] 분석 완료: skip=${analysis.skip}, 카테고리=${analysis.category}, 인물=${(analysis.people||[]).join(',')}, 프로젝트=${analysis.project_hint}`)

  // AI가 skip=true로 판단한 경우 저장 건너뜀
  // 기본값: skip=true (마감·요청·약속·중요참조 정보가 있을 때만 skip=false로 저장)
  if (analysis.skip === true) {
    console.log('[Agent] skip=true — 저장 건너뜀:', rawText.slice(0, 60))
    return null
  }

  // 2차 안전망: skip=false임에도 아무 내용도 추출 못한 경우 저장 안 함
  const hasNoValue = !analysis.summary && !(analysis.action_items?.length) && !(analysis.people?.length) && analysis.priority !== 'high'
  if (hasNoValue) {
    console.log('[Agent] 내용 없음 — 저장 건너뜀:', source)
    return null
  }

  // 3. 프로젝트 노드 처리 — 기존 매칭 또는 신규 생성
  let projectName = null
  if (analysis.project_hint) {
    const existing = vault.getProjectByName(analysis.project_hint)
    if (existing) {
      projectName = existing.name
      console.log(`[Agent] 기존 프로젝트 매칭: ${projectName}`)
    } else {
      projectName = analysis.project_hint
      vault.upsertProject({
        id: randomUUID(),
        name: projectName,
        status: 'active',
        created_at: now,
      })
      console.log(`[Agent] 신규 프로젝트 생성: ${projectName}`)
      invalidateContextCache()
    }
  }

  // 4. 인물 노드 처리 — 기존 매칭 또는 신규 생성
  const resolvedPeople = []
  for (const name of analysis.people || []) {
    const trimmed = name.trim()
    if (!trimmed) continue
    vault.upsertPerson({
      id: randomUUID(),
      name: trimmed,
      org: null,
      role: null,
      email: null,
      notes: null,
      created_at: now,
    })
    resolvedPeople.push(trimmed)
  }

  if (resolvedPeople.length > 0) invalidateContextCache()

  // AI가 인물을 추출하지 못했고 알림 발신자가 있으면 발신자를 인물로 등록
  if (resolvedPeople.length === 0 && notifSender) {
    const trimmed = notifSender.trim()
    if (trimmed) {
      vault.upsertPerson({
        id: randomUUID(),
        name: trimmed,
        org: null,
        role: null,
        email: null,
        notes: null,
        created_at: now,
      })
      resolvedPeople.push(trimmed)
      console.log(`[Agent] 알림 발신자를 인물로 등록: ${trimmed}`)
    }
  }

  // 5. 아이템 MD 생성 — 카테고리·우선순위에 따라 적절한 폴더에 자동 배치
  const item = {
    id: itemId,
    source,
    bundleId: bundleId || null,
    notifSender: notifSender || null,
    raw_text: rawText,
    summary: analysis.summary,
    category: analysis.category,
    people: JSON.stringify(resolvedPeople),
    action_items: JSON.stringify((analysis.action_items || []).map(a =>
      typeof a === 'object' ? { ...a, due_date: resolveDateToISO(a.due_date) || a.due_date || null } : a
    )),
    project_id: projectName,
    folder: analysis.folder || null,
    event_hint: analysis.event_hint ? {       // 상대 날짜("내일", "이번 주 금요일" 등)를 수신 시각 기준 ISO로 변환
      ...analysis.event_hint,
      event_date: resolveDateToISO(analysis.event_hint.event_date) || analysis.event_hint.event_date || null,
    } : null,
    priority: analysis.priority || 'medium',
    status: 'new',
    received_at: now,
    created_at: now,
  }
  const savedItem = vault.insertItem(item)

  // 6. backlink 계산 — 실제 저장된 파일 위치 기준 wikilink
  const vaultPath = vault.getVaultPath()
  const relativePath = savedItem._filePath
    ? path.relative(vaultPath, savedItem._filePath).replace(/\\/g, '/').replace(/\.md$/, '')
    : `inbox/${now.slice(0, 10)}-${itemId}`
  const itemLink = `[[${relativePath}]] — ${analysis.summary?.slice(0, 60) || ''}...`

  // 8. 태스크 due_date 계산
  const autoDueDate = resolveDateToISO(
    analysis.event_hint?.has_event ? analysis.event_hint?.event_date : null
  )
  const priorityFallbackDate = analysis.priority === 'high' ? resolveDateToISO('오늘') : null
  console.log(`[Agent] action_items raw:`, JSON.stringify(analysis.action_items))
  console.log(`[Agent] autoDueDate=${autoDueDate}, priorityFallback=${priorityFallbackDate}`)

  // 6~8 병렬: backlink(인물/프로젝트) + 태스크 생성 + renderer 알림을 동시에 실행
  await Promise.all([
    // backlink — 인물 노드
    ...resolvedPeople.map(name => {
      vault.appendToPersonNote(name, itemLink)
      console.log(`[Agent] 인물 노드 업데이트: ${name}`)
      return Promise.resolve()
    }),
    // backlink — 프로젝트 노드
    projectName
      ? (vault.appendToProjectNote(projectName, itemLink), console.log(`[Agent] 프로젝트 노드 업데이트: ${projectName}`), Promise.resolve())
      : Promise.resolve(),
    // 태스크 생성
    ...(analysis.action_items || []).map(actionItem => {
      const title = (typeof actionItem === 'object' ? actionItem.text : actionItem)?.trim()
      if (!title) return Promise.resolve()
      const itemDueDate = resolveDateToISO(typeof actionItem === 'object' ? actionItem.due_date : null)
      const dueDate = itemDueDate || autoDueDate || priorityFallbackDate
      console.log(`[Agent] 태스크: "${title}" → due_date=${dueDate}`)
      vault.insertTask({
        id: randomUUID(),
        item_id: itemId,
        title,
        status: 'active',
        person: resolvedPeople[0] || null,
        due_date: dueDate,
        created_at: now,
        updated_at: now,
      })
      return Promise.resolve()
    }),
  ])

  console.log(`[Agent] 처리 완료: 아이템 ${itemId}, 카테고리=${analysis.category}, 태스크 ${(analysis.action_items||[]).length}개 생성`)

  // 9. renderer에 새 아이템 알림
  if (win && !win.isDestroyed()) {
    win.webContents.send('inbox:new-item', {
      ...savedItem,
      people: resolvedPeople,
      action_items: analysis.action_items || [],
      skill_hint: skillHint || null,
      original_file_path: originalFilePath || null,
    })
  }

  // 10+11 병렬: 캘린더 생성과 무관한 데스크탑 알림은 먼저 보내고, 캘린더는 백그라운드에서 처리
  let calendarResult = null
  if (analysis.event_hint?.has_event) {
    // 캘린더 생성을 기다리지 않고 알림 먼저 전송
    handleEventFromAnalysis(analysis, rawText, { forceCalendar }).then(result => {
      calendarResult = result
      if (result?.success) {
        console.log(`[Agent] 캘린더 이벤트 생성: "${result.title}"`)
      }
    }).catch(() => {})
  }

  // 11. macOS 데스크탑 알림 전송 (캘린더 완료 안 기다림)
  sendDesktopNotification({
    source,
    summary: analysis.summary,
    people: resolvedPeople,
    hasEvent: analysis.event_hint?.has_event || false,
    eventTitle: analysis.event_hint?.event_title,
    priority: analysis.priority,
    itemId,
    win,
    filePath: savedItem._filePath || null,
  })

  // 12. 긴급 아이템이면 리마인더 추적 시작
  if (analysis.priority === 'high') {
    try {
      const { registerUrgentReminder } = require('./core/scheduler')
      registerUrgentReminder(itemId)
    } catch {}
  }

  savedItem._calendarEvent = null  // 캘린더는 백그라운드 처리이므로 즉시 반환
  return savedItem
}

// IPC 핸들러 등록
function setupIpcHandlers(ipcMain, getWindow) {
  // retry 타이머 시작 (앱 시작 시 1회)
  startRetryTimer(getWindow)

  // ─── Obsidian vault 양방향 동기화 감시 시작 ───────────────────
  vaultWatcher.start()

  // Obsidian에서 task를 완료(done)로 바꾼 경우 → renderer에 알림
  vaultWatcher.on('taskDone', ({ id }) => {
    const win = getWindow()
    if (win) win.webContents.send('vault:taskDone', { id })
  })

  // Obsidian에서 inbox 항목 상태 변경 시 → renderer에 알림
  vaultWatcher.on('itemStatusChanged', ({ id, status }) => {
    const win = getWindow()
    if (win) win.webContents.send('vault:itemStatusChanged', { id, status })
  })

  // ─── 인박스 ───────────────────────────────────────────────

  ipcMain.handle('inbox:get', async (_event, { limit = 50, offset = 0 } = {}) => {
    try {
      return vault.getItems({ limit, offset })
    } catch (error) {
      return { error: error.message }
    }
  })

  // 파일 업로드 처리 (이미지/문서 → AI 분석 → vault + 캘린더)
  ipcMain.handle('inbox:upload', async (_event, { filePath }) => {
    try {
      const item = await processFileUpload(filePath, getWindow())
      return {
        success: true,
        item,
        calendarEvent: item?._calendarEvent || null,
        isUrgent: item?.priority === 'high',
      }
    } catch (error) {
      console.error('[Upload] 오류:', error.message)
      return { error: error.message }
    }
  })

  // 인박스 상태 업데이트
  ipcMain.handle('inbox:update-status', async (_event, { id, status }) => {
    try {
      vault.updateItemStatus(id, status)
      return { success: true }
    } catch (error) {
      return { error: error.message }
    }
  })

  // 인박스 아이템 삭제
  ipcMain.handle('inbox:delete', async (_event, { id }) => {
    try {
      const deleted = vault.deleteItem(id)
      return { success: deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 인박스 아이템 → 휴지통 이동
  ipcMain.handle('inbox:trash', async (_event, { id }) => {
    try {
      return { success: vault.trashItem(id) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 휴지통 목록 조회
  ipcMain.handle('inbox:get-trash', async () => {
    try {
      return vault.getTrashItems()
    } catch (error) {
      return []
    }
  })

  // 휴지통 → 인박스 복구
  ipcMain.handle('inbox:restore-trash', async (_event, { id }) => {
    try {
      return { success: vault.restoreTrashItem(id) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 휴지통에서 영구 삭제
  ipcMain.handle('inbox:delete-permanent', async (_event, { id }) => {
    try {
      return { success: vault.deleteTrashItem(id) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 답장 초안 생성
  ipcMain.handle('inbox:draft-reply', async (_event, { itemId, rawText, source }) => {
    try {
      const draft = await generateReplyDraft(rawText, source)
      return { success: true, draft }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 태스크 ───────────────────────────────────────────────

  ipcMain.handle('tasks:get', async (_event, { status } = {}) => {
    try {
      return vault.getTasks({ status })
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('tasks:update', async (_event, { id, status, title, due_date, memo }) => {
    try {
      if (status !== undefined) vault.updateTaskStatus(id, status)
      if (title !== undefined || due_date !== undefined || memo !== undefined) {
        const fields = {}
        if (title !== undefined) fields.title = title
        if (due_date !== undefined) fields.due_date = due_date
        if (memo !== undefined) fields.memo = memo
        vault.updateTaskFields(id, fields)
      }
      return { success: true }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('tasks:create', async (_event, { title, person, due_date, item_id, memo } = {}) => {
    try {
      const now = new Date().toISOString()
      const task = vault.insertTask({
        id: randomUUID(),
        title: title || '새 태스크',
        person: person || null,
        due_date: due_date || null,
        item_id: item_id || null,
        memo: memo || null,
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      return { success: true, task }
    } catch (error) {
      return { error: error.message }
    }
  })

  // 자연어로 태스크 처리 ("오늘 마케팅 회의 준비 완료했어")
  // action=none이면 새 인박스 아이템으로 자동 처리 (묻지 않고 바로 분류·저장)
  ipcMain.handle('tasks:nl-action', async (_event, { text }) => {
    try {
      const win = getWindow()
      const activeTasks = vault.getTasks({ status: 'active' })
      const result = await processNlTaskAction(text, activeTasks)

      if (result.action === 'complete' && result.task_ids?.length > 0) {
        for (const taskId of result.task_ids) {
          vault.updateTaskStatus(taskId, 'done')
        }
        return { success: true, result }
      }

      if (result.action === 'archive' && result.task_ids?.length > 0) {
        for (const taskId of result.task_ids) {
          vault.updateTaskStatus(taskId, 'archived')
        }
        return { success: true, result }
      }

      if (result.action === 'update' && result.task_ids?.length > 0 && result.updates) {
        const resolvedUpdates = { ...result.updates }
        if (resolvedUpdates.due_date !== undefined && resolvedUpdates.due_date !== null) {
          resolvedUpdates.due_date = resolveDateToISO(resolvedUpdates.due_date) || resolvedUpdates.due_date
        }
        for (const taskId of result.task_ids) {
          vault.updateTaskFields(taskId, resolvedUpdates)
        }
        return { success: true, result }
      }

      // action=none: 태스크와 무관 → 인박스 아이템으로 자동 분류·저장
      const item = await processIncomingMessage(text, 'manual', win)
      return {
        success: true,
        result: {
          action: 'inbox',
          task_ids: [],
          message: `📥 "${item.summary?.slice(0, 40) || text.slice(0, 40)}" — ${item.category || '정보'}로 분류됨`,
        },
      }
    } catch (error) {
      return { error: error.message }
    }
  })

  // ─── 인물 ─────────────────────────────────────────────────

  ipcMain.handle('people:get', async () => {
    try {
      return vault.getPeople()
    } catch (error) {
      return { error: error.message }
    }
  })

  // 인물 타임라인 (관련 인박스 아이템 + 태스크)
  ipcMain.handle('people:get-timeline', async (_event, { name }) => {
    try {
      const items = vault.getItemsByPerson(name)
      const tasks = vault.getTasksByPerson(name)
      return { success: true, items, tasks }
    } catch (error) {
      return { success: false, items: [], tasks: [], error: error.message }
    }
  })

  // 인물 삭제
  ipcMain.handle('people:delete', async (_event, { name }) => {
    try {
      const deleted = vault.deletePerson(name)
      return { success: deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 인물 추가/수정
  ipcMain.handle('people:upsert', async (_event, { name, org, role, email }) => {
    try {
      vault.upsertPerson({ name, org, role, email, created_at: new Date().toISOString() })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 전체 검색 (인박스 + 태스크 + 인물) — SQLite 인덱스 활용
  ipcMain.handle('search:global', async (_event, { q }) => {
    try {
      const items = vault.searchItems(q, 5)
      const tasks = vault.getTasks().filter(t => matchesQuery(t.title, q)).slice(0, 5)
      const people = vault.getPeople().filter(p =>
        matchesQuery(p.name, q) || matchesQuery(p.org, q)
      ).slice(0, 5)
      return { items, tasks, people }
    } catch {
      return { items: [], tasks: [], people: [] }
    }
  })

  ipcMain.handle('projects:get', async () => {
    try {
      return vault.getProjects()
    } catch (error) {
      return { error: error.message }
    }
  })

  // ─── 온보딩 ───────────────────────────────────────────────

  ipcMain.handle('onboarding:get', async () => {
    try {
      const done = store.get('onboardingDone') || false
      return { done }
    } catch (error) {
      return { done: false }
    }
  })

  ipcMain.handle('onboarding:complete', async (_event, { apiKey, workTypes, vaultPath }) => {
    try {
      if (apiKey && apiKey.trim()) {
        store.set('anthropicKey', apiKey.trim())
      }
      if (workTypes) {
        store.set('workTypes', workTypes)
      }
      if (vaultPath && vaultPath.trim()) {
        store.set('vaultPath', vaultPath.trim())
      }
      store.set('onboardingDone', true)
      // vault 재초기화 (경로 변경 반영)
      vault.initVault()
      return { success: true }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('onboarding:import', async (_event, { filePaths }) => {
    try {
      const win = getWindow()
      const results = []
      for (const filePath of filePaths || []) {
        try {
          let item
          if (isImageFile(filePath)) {
            const context = {
              people: vault.getPeople(),
              projects: vault.getProjects(),
              workTypes: store.get('workTypes') || [],
            }
            const analysis = await analyzeImageFile(filePath, context)
            const fileName = require('path').basename(filePath)
            const rawText = `[이미지: ${fileName}] ${analysis.summary || ''}`
            item = await processIncomingMessage(rawText, 'file', win, { preAnalyzed: analysis, forceCalendar: true })
          } else {
            const rawText = await extractText(filePath)
            const source = inferSource(filePath, rawText)
            item = await processIncomingMessage(rawText, source, win, { forceCalendar: true })
          }
          results.push({ filePath, success: true, itemId: item.id })
        } catch (err) {
          results.push({ filePath, success: false, error: err.message })
        }
      }
      return { success: true, results }
    } catch (error) {
      return { error: error.message }
    }
  })

  // ─── 소스 카테고리 관리 ────────────────────────────────────

  // 커스텀/자동감지 소스 카테고리 목록 반환
  ipcMain.handle('sources:get', async () => {
    return store.get('sourceCategories') || []
  })

  // 소스 카테고리 저장 (신규 또는 수정)
  ipcMain.handle('sources:save', async (_event, { id, label, icon }) => {
    const cats = store.get('sourceCategories') || []
    const idx = cats.findIndex(c => c.id === id)
    if (idx >= 0) {
      cats[idx] = { ...cats[idx], label, icon }
    } else {
      cats.push({ id, label, icon, match: [id] })
    }
    store.set('sourceCategories', cats)
    return { success: true }
  })

  // 소스 카테고리 삭제 (빌트인은 삭제 불가, 커스텀만)
  ipcMain.handle('sources:delete', async (_event, { id }) => {
    const cats = (store.get('sourceCategories') || []).filter(c => c.id !== id)
    store.set('sourceCategories', cats)
    return { success: true }
  })

  // 알 수 없는 소스 자동 등록 (이미 존재하면 무시)
  ipcMain.handle('sources:register', async (_event, { id, label, icon }) => {
    const cats = store.get('sourceCategories') || []
    if (!cats.find(c => c.id === id)) {
      cats.push({ id, label, icon, match: [id], autoDetected: true })
      store.set('sourceCategories', cats)
    }
    return { success: true }
  })

  // ─── Google Drive ──────────────────────────────────────────

  const GDRIVE_EXT_MAP = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt',
    'message/rfc822': '.eml',
  }

  async function handleGdriveFile({ buffer, name, mimeType, sender }) {
    const win = getWindow()
    if (!win) return
    const ext = GDRIVE_EXT_MAP[mimeType] || '.txt'
    const tmpPath = path.join(os.tmpdir(), `tidy-gdrive-${Date.now()}${ext}`)
    try {
      fs.writeFileSync(tmpPath, buffer)
      const text = await require('./core/parser').extractText(tmpPath)
      await processIncomingMessage(text, 'gdrive', win, { sender })
    } catch (err) {
      console.error('[GDrive] 파일 처리 오류:', name, err.message)
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  }

  // 저장된 토큰이 있으면 앱 시작 시 자동 폴링 시작
  if (gdrive.isConnected()) {
    gdrive.on('file', handleGdriveFile)
    gdrive.on('error', (err) => {
      const win = getWindow()
      if (win) win.webContents.send('sync:error', { type: 'gdrive', error: err.message })
    })
    gdrive.startPolling()
  }

  ipcMain.handle('gdrive:auth-start', async () => {
    try {
      await gdrive.authStart()
      gdrive.removeAllListeners('file')
      gdrive.on('file', handleGdriveFile)
      gdrive.startPolling()
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('gdrive:status', async () => {
    return { connected: gdrive.isConnected() }
  })

  ipcMain.handle('gdrive:disconnect', async () => {
    gdrive.disconnect()
    return { success: true }
  })

  // ─── 설정 ─────────────────────────────────────────────────

  ipcMain.handle('settings:get', async () => {
    try {
      return {
        anthropicKey: store.get('anthropicKey') ? '●●●●●●●●' : '',
        hasAnthropicKey: !!store.get('anthropicKey'),
        gmailEmail: store.get('gmailEmail') || '',
        hasGmailPassword: !!store.get('gmailAppPassword'),
        hasSlackToken: !!store.get('slackToken'),
        slackChannels: store.get('slackChannels') || [],
        vaultPath: store.get('vaultPath') || '',
        // 캘린더
        calendarEnabled: store.get('calendarEnabled') || false,
        calendarName: store.get('calendarName') || '',
        // 알림 소스 (macOS 앱 모니터링)
        notificationSources: store.get('notificationSources') || {
          kakao: false, imessage: false, telegram: false, line: false,
        },
        // 기존 폴더 스캔 경로
        scanPaths: store.get('scanPaths') || [],
        // 파일 감시 폴더
        watchFolderPath: store.get('watchFolderPath') || '',
        // 앱 필터
        seenApps: store.get('seenApps') || {},
        blockedBundles: store.get('blockedBundles') || [],
        // 동기화 간격 (분 단위로 반환)
        syncIntervalEmail: Math.round((store.get('syncIntervalEmail') || 300000) / 60000),
        syncIntervalSlack: Math.round((store.get('syncIntervalSlack') || 120000) / 60000),
        // Google Drive
        hasGdriveClientId: !!store.get('gdriveClientId'),
        hasGdriveClientSecret: !!store.get('gdriveClientSecret'),
        gdriveConnected: gdrive.isConnected(),
      }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('settings:save', async (_event, params) => {
    try {
      if (params.anthropicKey && params.anthropicKey !== '●●●●●●●●') {
        store.set('anthropicKey', params.anthropicKey)
      }
      if (params.gmailEmail !== undefined) {
        store.set('gmailEmail', params.gmailEmail)
      }
      if (params.gmailAppPassword) {
        store.set('gmailAppPassword', params.gmailAppPassword)
      }
      if (params.slackToken) {
        store.set('slackToken', params.slackToken)
      }
      if (params.slackChannels) {
        store.set('slackChannels', params.slackChannels)
      }
      if (params.calendarEnabled !== undefined) {
        store.set('calendarEnabled', params.calendarEnabled)
      }
      if (params.calendarName !== undefined) {
        store.set('calendarName', params.calendarName)
      }
      if (params.notificationSources !== undefined) {
        // enabled는 항상 true (모든 알림 감지) — iMessage만 opt-in
        const merged = { ...params.notificationSources, enabled: true }
        if (merged.imessage) {
          const win = getWindow()
          if (win) await ensureFullDiskAccess(win)
        }
        store.set('notificationSources', merged)
        // watcher 재시작
        const watcher = require('./core/notification-watcher')
        watcher.stop()
        watcher.start(merged)
      }
      if (params.scanPaths !== undefined) {
        store.set('scanPaths', params.scanPaths)
      }
      if (params.watchFolderPath !== undefined) {
        store.set('watchFolderPath', params.watchFolderPath)
        const wf = require('./core/watch-folder')
        wf.stop()
        if (params.watchFolderPath) wf.start(params.watchFolderPath)
      }
      if (params.blockedBundles !== undefined) {
        store.set('blockedBundles', params.blockedBundles)
      }
      if (params.syncIntervalEmail !== undefined) {
        store.set('syncIntervalEmail', params.syncIntervalEmail * 60 * 1000)
      }
      if (params.syncIntervalSlack !== undefined) {
        store.set('syncIntervalSlack', params.syncIntervalSlack * 60 * 1000)
      }
      if (params.gdriveClientId !== undefined) {
        store.set('gdriveClientId', params.gdriveClientId)
      }
      if (params.gdriveClientSecret !== undefined) {
        store.set('gdriveClientSecret', params.gdriveClientSecret)
      }
      return { success: true, hasFullDiskAccess: checkFullDiskAccess() }
    } catch (error) {
      return { error: error.message }
    }
  })

  // ─── Dock 배지 ───────────────────────────────────────────
  ipcMain.handle('badge:set', (_event, count) => {
    try {
      if (app.setBadgeCount) app.setBadgeCount(count || 0)
    } catch {}
  })

  // ─── 설정 내보내기/가져오기 ──────────────────────────────
  ipcMain.handle('settings:export', async () => {
    try {
      return {
        success: true,
        data: {
          anthropicKey:        store.get('anthropicKey') || '',
          gmailEmail:          store.get('gmailEmail') || '',
          gmailAppPassword:    store.get('gmailAppPassword') || '',
          slackToken:          store.get('slackToken') || '',
          slackChannels:       store.get('slackChannels') || [],
          vaultPath:           store.get('vaultPath') || '',
          calendarEnabled:     store.get('calendarEnabled') || false,
          calendarName:        store.get('calendarName') || '',
          notificationSources: store.get('notificationSources') || {},
          scanPaths:           store.get('scanPaths') || [],
          watchFolderPath:     store.get('watchFolderPath') || '',
          blockedBundles:      store.get('blockedBundles') || [],
          gdriveClientId:      store.get('gdriveClientId') || '',
          gdriveClientSecret:  store.get('gdriveClientSecret') || '',
          exportedAt:          new Date().toISOString(),
        },
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('settings:import', async (_event, data) => {
    try {
      const keys = [
        'anthropicKey', 'gmailEmail', 'gmailAppPassword', 'slackToken',
        'slackChannels', 'vaultPath', 'calendarEnabled', 'calendarName',
        'notificationSources', 'scanPaths', 'watchFolderPath',
        'blockedBundles', 'gdriveClientId', 'gdriveClientSecret',
      ]
      for (const k of keys) {
        if (data[k] !== undefined && data[k] !== '') store.set(k, data[k])
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // ─── 채널 연결 ────────────────────────────────────────────

  ipcMain.handle('channel:connect', async (_event, { type, config }) => {
    try {
      if (type === 'gmail') {
        const { email, password } = config
        const result = await testImapConnection(email, password)
        if (result.success) {
          store.set('gmailEmail', email)
          store.set('gmailAppPassword', password)
          vault.upsertChannel({
            id: 'gmail',
            type: 'gmail',
            config: JSON.stringify({ email }),
            status: 'connected',
            last_synced: null,
          })
        }
        return result
      }

      if (type === 'slack') {
        const { token } = config
        const result = await testSlackConnection(token)
        if (result.success) {
          store.set('slackToken', token)
          vault.upsertChannel({
            id: 'slack',
            type: 'slack',
            config: JSON.stringify({ user: result.user, team: result.team }),
            status: 'connected',
            last_synced: null,
          })
        }
        return result
      }

      return { success: false, error: '지원하지 않는 채널 타입' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 수동 동기화 트리거
  ipcMain.handle('channel:sync', async (_event, { type }) => {
    const win = getWindow()
    try {
      if (type === 'all') {
        await Promise.all([
          syncGmail(win),
          syncSlack(win),
          syncNotifications(win),
        ])
        return { success: true }
      }
      if (type === 'gmail')         { await syncGmail(win);         return { success: true } }
      if (type === 'slack')         { await syncSlack(win);         return { success: true } }
      if (type === 'notifications') { await syncNotifications(win); return { success: true } }

      return { success: false, error: '지원하지 않는 채널 타입' }
    } catch (error) {
      win?.webContents.send('sync:error', { type, error: error.message })
      return { success: false, error: error.message }
    }
  })

  // ─── 캘린더 ───────────────────────────────────────────────

  ipcMain.handle('calendar:get-calendars', async () => {
    try {
      const cals = await getCalendars()
      return { success: true, calendars: cals }
    } catch (error) {
      return { success: false, calendars: [], error: error.message }
    }
  })

  ipcMain.handle('calendar:create', async (_event, { title, startDate, endDate, notes }) => {
    try {
      const result = await createEvent({
        title,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        notes,
      })
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 폴더 선택 다이얼로그 ────────────────────────────────────

  ipcMain.handle('dialog:open-folder', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections'],
      title: '스캔할 폴더 선택',
    })
    if (result.canceled) return { canceled: true, paths: [] }
    return { canceled: false, paths: result.filePaths }
  })

  // 폴더 내 하위 폴더 목록 미리보기
  ipcMain.handle('vault:preview-folders', async (_event, { scanPath }) => {
    try {
      const folders = vault.getExistingFolderNames([scanPath])
      return { success: true, folders }
    } catch (error) {
      return { success: false, folders: [], error: error.message }
    }
  })

  // ─── 권한 관리 ────────────────────────────────────────────

  ipcMain.handle('permissions:check-fda', () => {
    return {
      platform: process.platform,
      hasAccess: checkFullDiskAccess(),
    }
  })

  ipcMain.handle('permissions:request-fda', async () => {
    const win = getWindow()
    if (win) await showFullDiskAccessDialog(win)
    return { hasAccess: checkFullDiskAccess() }
  })

  // ─── 인박스 카테고리 관리 ─────────────────────────────────

  const DEFAULT_CATEGORIES = ['업무', '미팅', '여행', '운영', '정보']

  ipcMain.handle('categories:get', () => {
    const cats = store.get('categories')
    return Array.isArray(cats) ? cats : DEFAULT_CATEGORIES
  })

  // 카테고리 삭제: 해당 카테고리 아이템들 → '정보'로 일괄 변경
  ipcMain.handle('categories:delete', async (_event, { name }) => {
    try {
      const cats = store.get('categories') || DEFAULT_CATEGORIES
      if (name === '정보') return { success: false, error: '기본 카테고리는 삭제할 수 없습니다' }
      const next = cats.filter(c => c !== name)
      store.set('categories', next)

      // 해당 카테고리 vault 아이템들 → '정보'로 재분류
      const items = vault.getItems({ limit: 5000 })
      let reassigned = 0
      for (const item of items) {
        if (item.category === name && item._filePath) {
          try {
            vault.updateItemField(item._filePath, 'category', '정보')
            reassigned++
          } catch {}
        }
      }
      return { success: true, categories: next, reassigned }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 카테고리 추가
  ipcMain.handle('categories:add', async (_event, { name }) => {
    try {
      if (!name || name.trim().length < 1) return { success: false, error: '이름을 입력하세요' }
      const trimmed = name.trim()
      const cats = store.get('categories') || DEFAULT_CATEGORIES
      if (cats.includes(trimmed)) return { success: false, error: '이미 존재하는 카테고리입니다' }
      const next = [...cats, trimmed]
      store.set('categories', next)
      return { success: true, categories: next }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 음성 인식 (STT) — 로컬 Whisper 모델 ────────────────
  let _whisperPipeline = null
  let _whisperLoading  = false

  async function getWhisperPipeline(win) {
    if (_whisperPipeline) return _whisperPipeline
    if (_whisperLoading) {
      while (_whisperLoading) await new Promise(r => setTimeout(r, 200))
      return _whisperPipeline
    }
    _whisperLoading = true
    try {
      const { pipeline, env } = require('@xenova/transformers')
      env.allowLocalModels = false
      env.useBrowserCache   = false
      // 모델 로딩 진행 상황을 렌더러로 전송
      const sendProgress = (msg) => {
        if (win && !win.isDestroyed()) win.webContents.send('stt:model-progress', msg)
      }
      sendProgress('모델 로딩 중... (최초 실행 시 약 150MB 다운로드)')
      _whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny',
        { quantized: true }
      )
      sendProgress(null)
      _whisperLoading = false
      return _whisperPipeline
    } catch (e) {
      _whisperLoading = false
      throw e
    }
  }

  // WAV 버퍼 → Float32Array PCM 샘플 디코딩
  function decodeWAV(buf) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const sampleRate = view.getUint32(24, true)
    const numSamples = (buf.length - 44) / 2
    const samples = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) {
      samples[i] = view.getInt16(44 + i * 2, true) / 32768.0
    }
    return { data: samples, sampling_rate: sampleRate }
  }

  ipcMain.handle('stt:transcribe', async (_event, { wavBuffer }) => {
    try {
      const pipe = await getWhisperPipeline(win)
      const buf  = Buffer.from(wavBuffer)
      const { data, sampling_rate } = decodeWAV(buf)
      const result = await pipe(
        { data, sampling_rate },
        { language: 'korean', task: 'transcribe' }
      )
      const text = (result?.text || '').trim()
      // 인식 완료 후 모델 메모리 해제 (~150-300MB 회수)
      _whisperPipeline = null
      if (text) return { success: true, text }
      return { success: false, error: '음성을 인식하지 못했습니다' }
    } catch (e) {
      _whisperPipeline = null
      return { success: false, error: e.message }
    }
  })

  // ─── 테스트 메시지 주입 (개발용) ─────────────────────────
  ipcMain.handle('dev:injectTest', async (_event, { text, source } = {}) => {
    const testText = text || `[테스트] 내일 오후 3시 팀 미팅 있습니다. 준비사항: 주간 보고서 작성, 슬라이드 공유. 참석자: 김철수, 이영희`
    const testSource = source || 'test'
    try {
      await processIncomingMessage(testText, testSource, getWindow())
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // ─── 주간 리포트 ──────────────────────────────────────────

  ipcMain.handle('report:weekly', async () => {
    try {
      const now = Date.now()
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
      const allItems = vault.getItems({ limit: 200 })
      const recentItems = allItems.filter(i => (i.received_at || i.created_at || '') >= weekAgo)
      const allTasks = vault.getTasks()
      const report = await generateWeeklyReport(recentItems, allTasks)
      return { success: true, report, itemCount: recentItems.length, taskCount: allTasks.length }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── Obsidian 연동 ────────────────────────────────────────

  // vault 경로 + 파일 경로를 받아 Obsidian에서 열기
  ipcMain.handle('obsidian:open', async (_event, { filePath }) => {
    try {
      const vaultPath = vault.getVaultPath()
      const vaultName = path.basename(vaultPath)
      // vault 내 상대 경로 계산 (확장자 제거)
      const relative = path.relative(vaultPath, filePath).replace(/\\/g, '/').replace(/\.md$/, '')
      const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relative)}`
      await shell.openExternal(uri)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // vault 폴더 자체를 Finder/Explorer에서 열기
  ipcMain.handle('obsidian:open-vault', async () => {
    try {
      const vaultPath = vault.getVaultPath()
      await shell.openPath(vaultPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 기존 Obsidian vault 스캔: 이미 있는 people/projects 노드 로드
  ipcMain.handle('vault:scan', async () => {
    try {
      const people = vault.getPeople()
      const projects = vault.getProjects()
      return { success: true, people: people.length, projects: projects.length }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Obsidian vault 자동 감지
  ipcMain.handle('vault:detect-obsidian', async () => {
    try {
      const vaults = vault.detectObsidianVaults()
      return { success: true, vaults }
    } catch (error) {
      return { success: false, vaults: [], error: error.message }
    }
  })

  // ─── 앱 알림 필터 ─────────────────────────────────────────

  ipcMain.handle('notifications:seen-apps', async () => {
    return store.get('seenApps') || {}
  })

  ipcMain.handle('notifications:set-blocked', async (_event, { blockedBundles }) => {
    store.set('blockedBundles', blockedBundles || [])
    return { success: true }
  })

  // vault 경로 변경 (기존 Obsidian vault 폴더 지정)
  ipcMain.handle('vault:set-path', async (_event, { vaultPath: newPath }) => {
    try {
      store.set('vaultPath', newPath)
      vault.initVault()  // 폴더 구조 생성 (기존 파일 보존)
      const people = vault.getPeople()
      const projects = vault.getProjects()
      return { success: true, people: people.length, projects: projects.length }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 스킬 실행 & 출력물 관리 ────────────────────────────────
  ipcMain.handle('skill:run', async (_event, { skillId, input, sourceItemId }) => {
    try {
      const { runSkill } = require('./core/ai')
      const SKILL_LABELS = {
        summary: '요약', translate: '번역', minutes: '회의록', report: '보고서',
        kpi: 'KPI 현황', slides: '슬라이드', budget: '예산표', notebook: '노트', onboarding: '온보딩', hwp: '공문서(HWP)',
      }
      const output = await runSkill(skillId, input)
      const skillLabel = SKILL_LABELS[skillId] || skillId
      const saved = vault.saveSkillOutput({ skillId, skillLabel, input, output, sourceItemId })
      return { success: true, output, id: saved.id }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('skill:outputs:get', async () => {
    try {
      return vault.getSkillOutputs()
    } catch { return [] }
  })

  // 스킬 입력용 파일 읽기 — 인박스 저장 없이 텍스트만 추출
  ipcMain.handle('skill:read-file', async (_event, { filePath }) => {
    try {
      const text = await extractText(filePath)
      const name = path.basename(filePath)
      return { success: true, text, name }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('skill:outputs:delete', async (_event, { id }) => {
    try {
      vault.deleteSkillOutput(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 스킬 출력 → 파일 저장 & 앱 실행 ────────────────────────
  ipcMain.handle('skill:open-in-app', async (_event, { skillId, content, fileName }) => {
    try {
      const os = require('os')
      const { exec } = require('child_process')

      // 스킬별 앱 및 확장자 설정
      const SKILL_APP_MAP = {
        hwp:        { app: 'Hancom Office HWP', ext: 'txt' },
        report:     { app: 'Pages',             ext: 'txt' },
        minutes:    { app: 'Pages',             ext: 'txt' },
        onboarding: { app: 'Pages',             ext: 'txt' },
        slides:     { app: 'Keynote',           ext: 'txt' },
        budget:     { app: 'Numbers',           ext: 'csv' },
        kpi:        { app: 'Numbers',           ext: 'csv' },
        notebook:   { app: 'Obsidian',          ext: 'md'  },
        summary:    { app: 'TextEdit',          ext: 'txt' },
        translate:  { app: 'TextEdit',          ext: 'txt' },
      }

      const cfg = SKILL_APP_MAP[skillId] || { app: 'TextEdit', ext: 'txt' }
      const safeName = (fileName || `tidy-${skillId}`).replace(/[^a-zA-Z0-9가-힣_\-]/g, '_')
      const tmpPath = path.join(os.tmpdir(), `${safeName}.${cfg.ext}`)

      // CSV 스킬(예산표·KPI)은 마크다운 표 → 진짜 CSV 변환
      // HWP 스킬은 마크다운 잔여 문법 제거
      let fileContent = content
      if (cfg.ext === 'csv') {
        fileContent = markdownTableToCsv(content)
      } else if (skillId === 'hwp') {
        fileContent = content
          // 1) 마크다운 헤더 제거 (# ~ ######)
          .replace(/^#{1,6}\s*/gm, '')
          // 2) 수평선 제거 (---, ***, ___)
          .replace(/^[-*_]{3,}\s*$/gm, '')
          // 3) 표 구분선 제거 (|---|---| 형태)
          .replace(/^\|[\s|:=-]+\|\s*$/gm, '')
          // 4) 표 행 → 공백 정렬 텍스트 변환 (| a | b | → a    b)
          .replace(/^\|(.+)\|\s*$/gm, (_m, inner) =>
            inner.split('|').map(c => c.trim()).filter(Boolean).join('    ')
          )
          // 5) **굵게** 제거
          .replace(/\*\*(.+?)\*\*/g, '$1')
          // 6) *기울임* 제거
          .replace(/\*(.+?)\*/g, '$1')
          // 7) `코드` 제거
          .replace(/`([^`]+)`/g, '$1')
          // 8) 불릿 들여쓰기 통일
          .replace(/^[ \t]*[-*]\s+/gm, '  - ')
          // 9) 연속 빈줄 정리
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }
      fs.writeFileSync(tmpPath, fileContent, 'utf-8')

      // 앱이 설치된 경우 해당 앱으로, 없으면 기본 앱으로 열기
      const cmd = `open -a "${cfg.app}" "${tmpPath}" 2>/dev/null || open "${tmpPath}"`
      exec(cmd)

      return { success: true, filePath: tmpPath, app: cfg.app }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── HWP 파일 직접 열기 ─────────────────────────────────────
  ipcMain.handle('skill:open-hwp-file', async (_event, { filePath: hwpPath }) => {
    try {
      const { exec } = require('child_process')
      exec(`open -a "Hancom Office HWP" "${hwpPath}" 2>/dev/null || open "${hwpPath}"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── NotebookLM 스킬 ─────────────────────────────────────────
  const nlm = require('./core/notebooklm')

  // 설치/로그인 상태 확인
  ipcMain.handle('nlm:check-setup', async () => {
    return nlm.checkSetup()
  })

  // pip install notebooklm-py[browser] + playwright chromium
  ipcMain.handle('nlm:install', async (event) => {
    const python = nlm.findPython()
    if (!python) return { success: false, error: 'Python 3.10+을 찾을 수 없습니다.' }

    event.sender.send('nlm:install-progress', { message: 'notebooklm-py 설치 중...\n' })
    const r1 = await nlm.install(python, (msg) => {
      event.sender.send('nlm:install-progress', { message: msg })
    })
    if (!r1.success) return { success: false, error: 'pip install 실패' }

    event.sender.send('nlm:install-progress', { message: '\nPlaywright Chromium 설치 중...\n' })
    const r2 = await nlm.installPlaywright(python, (msg) => {
      event.sender.send('nlm:install-progress', { message: msg })
    })

    return { success: r2.success }
  })

  // 브라우저 로그인 (Terminal 창 열기)
  ipcMain.handle('nlm:login', async () => {
    try {
      nlm.openLogin()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 스킬 실행 → 파일 생성 → 앱으로 열기
  ipcMain.handle('nlm:run-skill', async (event, { skillId, content, title }) => {
    // pptx: PowerPoint 우선, 없으면 Keynote 폴백
    const { execSync, exec } = require('child_process')

    function appExists(appName) {
      try {
        execSync(`osascript -e 'id of application "${appName}"' 2>/dev/null`, { timeout: 2000 })
        return true
      } catch { return false }
    }

    const pptxApp = appExists('Microsoft PowerPoint') ? 'Microsoft PowerPoint' : 'Keynote'

    const NLM_APP_MAP = {
      pptx: pptxApp,
      pdf:  'Preview',
      mp3:  'QuickTime Player',
      mp4:  'QuickTime Player',
      png:  'Preview',
      md:   'TextEdit',
      csv:  'Numbers',
      json: 'TextEdit',
      html: 'Safari',
    }

    try {
      // 콘텐츠 길이 제한: 텍스트가 길수록 Google AI 처리 시간 증가
      // 4000자 = 약 A4 2장 분량으로 충분한 컨텍스트
      const MAX_NLM_CHARS = 4000
      const trimmedContent = content && content.length > MAX_NLM_CHARS
        ? content.slice(0, MAX_NLM_CHARS) + '\n\n[이하 생략]'
        : content

      const result = await nlm.runSkill(skillId, trimmedContent, {
        title: title || 'Tidy Input',
        language: 'ko',
        onProgress: (msg) => event.sender.send('nlm:progress', msg),
      })

      // 앱 내 인터랙티브 뷰어 스킬은 외부 앱으로 열지 않음
      const IN_APP_SKILLS = ['nlm-quiz', 'nlm-flashcards']
      const appName = NLM_APP_MAP[result.ext] || 'Finder'
      if (!IN_APP_SKILLS.includes(skillId)) {
        exec(`open -a "${appName}" "${result.path}" 2>/dev/null || open "${result.path}"`)
      }

      return {
        success: true,
        path: result.path,
        ext: result.ext,
        label: result.label,
        app: appName,
        content: result.content || null,  // quiz/flashcard 마크다운 내용 (인터랙티브 뷰어용)
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        setupStep: error.setupStep || null,
      }
    }
  })

}

// 파일 업로드 처리 공통 함수 (IPC + WatchFolder 모두 사용)
async function processFileUpload(filePath, win) {
  const existingPeople = vault.getPeople()
  const existingProjects = vault.getProjects()
  const workTypes = store.get('workTypes') || []
  const context = { people: existingPeople, projects: existingProjects, workTypes }

  if (isImageFile(filePath)) {
    const fileName = path.basename(filePath)
    const analysis = await analyzeImageFile(filePath, context)
    const rawText = `[이미지: ${fileName}] ${analysis.summary || ''}`
    return processIncomingMessage(rawText, 'file', win, { preAnalyzed: analysis, forceCalendar: true })
  } else {
    const rawText = await extractText(filePath)
    const source = inferSource(filePath, rawText)
    const ext = path.extname(filePath).toLowerCase()

    // 파일 타입별 자동 스킬 힌트
    const SKILL_HINT_MAP = {
      '.hwp':  'hwp',
      '.hwpx': 'hwp',
      '.vtt':  'minutes',
      '.pdf':  'summary',
      '.docx': 'summary',
    }
    const skillHint = SKILL_HINT_MAP[ext] || null
    const originalFilePath = ['.hwp', '.hwpx'].includes(ext) ? filePath : null

    return processIncomingMessage(rawText, source, win, {
      forceCalendar: true,
      skillHint,
      originalFilePath,
    })
  }
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

/**
 * 마크다운 표 → CSV 변환
 * "| 항목 | 금액 |" 형태의 마크다운을 진짜 CSV로 변환.
 * 표가 없으면 원본 텍스트 반환.
 */
function markdownTableToCsv(content) {
  const lines = content.split('\n')
  const csvRows = []
  let hasTable = false

  for (const line of lines) {
    const trimmed = line.trim()
    // 구분선 (|---|---|) 은 건너뜀
    if (/^\|[\s\-:|]+\|/.test(trimmed)) continue

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      hasTable = true
      // | 셀1 | 셀2 | → ['셀1', '셀2']
      const cells = trimmed
        .slice(1, -1)          // 앞뒤 | 제거
        .split('|')
        .map(c => c.trim())

      // 쉼표·줄바꿈 포함 셀은 큰따옴표로 감쌈
      const csvLine = cells
        .map(c => (c.includes(',') || c.includes('"') || c.includes('\n'))
          ? `"${c.replace(/"/g, '""')}"` : c)
        .join(',')
      csvRows.push(csvLine)
    } else if (trimmed && hasTable) {
      // 표 밖 텍스트(제목·설명 등)는 첫 번째 컬럼에 그대로
      csvRows.push(`"${trimmed.replace(/"/g, '""')}"`)
    }
  }

  return hasTable ? csvRows.join('\n') : content
}

module.exports = { setupIpcHandlers, processIncomingMessage, processFileUpload }
