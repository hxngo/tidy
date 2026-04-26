const { randomUUID, createHash } = require('crypto')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { shell, Notification, dialog, app } = require('electron')
const store = require('./store')
const vault = require('./core/vault')
const { analyzeMessage, analyzeImageFile, processNlTaskAction, generateReplyDraft, generateWeeklyReport } = require('./core/ai')
const { getLLMClient, hasAuth, isCliMode } = require('./core/llm')
const { checkCli: checkClaudeCli } = require('./core/claude-cli')
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
    userProfile: vault.getUserProfile() || null,
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
  const { people: existingPeople, projects: existingProjects, workTypes, existingFolders, userProfile } = getContextCached()

  console.log(`[Agent] 컨텍스트 로드: 인물 ${existingPeople.length}명, 프로젝트 ${existingProjects.length}개, 기존폴더 ${existingFolders.length}개${userProfile ? ', 프로필 있음' : ''}`)

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
        userProfile,
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

  // 요약이 비어 있으면 원본 텍스트로 대체 (요약없음 방지)
  if (!analysis.summary) {
    analysis.summary = rawText.slice(0, 120)
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
      const personal = vault.getItems({ limit, offset })
      const shared   = vault.getSharedItems()
      // 공유 아이템(전사·부서)을 앞에 배치, 개인 아이템 뒤에
      const all = [...shared, ...(Array.isArray(personal) ? personal : [])]
      return all.slice(0, limit + shared.length)
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
      const personal = vault.getTasks({ status })
      const shared   = vault.getSharedTasks().filter(t => !status || t.status === status)
      return [...shared, ...(Array.isArray(personal) ? personal : [])]
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

  ipcMain.handle('onboarding:reset', () => {
    store.set('onboardingDone', false)
    return { success: true }
  })

  // ─── Org Config (회사/부서/공유 볼트) ────────────────────────────
  ipcMain.handle('org:get-config', () => vault.getOrgConfig())

  ipcMain.handle('org:set-config', (_event, config) => {
    const updated = vault.setOrgConfig(config)
    require('./core/mcp-client').reconnect()
    return updated
  })

  ipcMain.handle('org:init-shared-vault', (_event, vaultPath) => {
    const ok = vault.initSharedVault(vaultPath)
    return { success: ok }
  })

  ipcMain.handle('org:pick-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '회사 공유 폴더 선택',
      buttonLabel: '선택',
    })
    return canceled ? null : filePaths[0]
  })

  // 중앙 관리: 공유 인박스 공지 목록
  ipcMain.handle('org:list-items', (_event, { scope, department } = {}) => {
    try { return vault.listSharedItemsAdmin(scope, department) } catch (e) { return [] }
  })

  // 중앙 관리: 공유 태스크 목록
  ipcMain.handle('org:list-tasks', (_event, { scope, department } = {}) => {
    try { return vault.listSharedTasksAdmin(scope, department) } catch (e) { return [] }
  })

  // 중앙 관리: 공유 인박스 공지 생성
  ipcMain.handle('org:create-item', (_event, params) => {
    try { return { success: true, item: vault.createSharedItem(params) } }
    catch (e) { return { success: false, error: e.message } }
  })

  // 중앙 관리: 공유 태스크 생성
  ipcMain.handle('org:create-task', (_event, params) => {
    try { return { success: true, task: vault.createSharedTask(params) } }
    catch (e) { return { success: false, error: e.message } }
  })

  // 중앙 관리: 공유 아이템/태스크 삭제 (파일 경로로)
  ipcMain.handle('org:delete-file', (_event, { filePath }) => {
    try { return { success: vault.deleteSharedFile(filePath) } }
    catch (e) { return { success: false, error: e.message } }
  })

  // ─── User Profile (Cold Start) ────────────────────────────────

  ipcMain.handle('profile:get', () => {
    return vault.getUserProfile() || {}
  })

  ipcMain.handle('profile:save', (_event, profileFields) => {
    try {
      const updated = vault.saveUserProfile(profileFields)
      return { success: true, profile: updated }
    } catch (e) {
      return { error: e.message }
    }
  })

  // user_question_generator: 대화 히스토리를 받아 다음 질문 생성
  // history: [{ role: 'assistant'|'user', content: string }]
  // answeredCount: 지금까지 답변 완료된 질문 수
  ipcMain.handle('profile:next-question', async (_event, { history = [], answeredCount = 0 }) => {
    try {
      if (!hasAuth()) return { error: 'Claude 인증 없음' }
      const client = getLLMClient()

      const SYSTEM = `당신은 기업용 AI 에이전트의 온보딩 도우미입니다.
새 사용자가 에이전트를 처음 사용할 때 그 사람의 업무 맥락을 최대한 깊이 파악해야 합니다.

파악해야 할 정보 레이어:
- Layer 1 (기본 신원): 이름, 직책, 소속 팀/부서, 회사
- Layer 2 (업무 맥락): 현재 진행 프로젝트, 반복 업무, 자주 쓰는 문서 형식
- Layer 3 (관계망): 상사/팀원/협업 부서, 외부 거래처/클라이언트
- Layer 4 (커뮤니케이션): 주요 보고 방식, 의사결정 권한 범위
- Layer 5 (도메인): 직무 전문 용어, 업계/산업군

규칙:
1. 총 5~7개의 질문으로 위 레이어를 커버한다
2. 이전 답변을 바탕으로 자연스럽게 이어지는 질문을 생성한다
3. 한 번에 한 가지만 묻는다 (복합 질문 금지)
4. 이미 답변된 내용은 다시 묻지 않는다
5. ${answeredCount}개의 질문이 이미 완료됐다
6. 5개 이상 완료되고 Layer 1~3이 모두 파악됐으면 JSON: {"done": true} 반환
7. 그 외에는 JSON: {"question": "질문 내용", "layer": 1~5} 형식으로만 반환`

      const messages = history.length > 0 ? history : []
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM,
        messages: messages.length > 0 ? messages : [{ role: 'user', content: '시작해주세요' }],
      })

      const raw = response.content[0]?.text?.trim() || '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { question: raw }
      return { success: true, ...result }
    } catch (e) {
      console.error('[Profile] 질문 생성 오류:', e.message)
      return { error: e.message }
    }
  })

  // Cold Start 분석: 수집된 대화 히스토리 → 구조화된 프로필 생성
  ipcMain.handle('profile:analyze', async (_event, { history = [] }) => {
    try {
      if (!hasAuth()) return { error: 'Claude 인증 없음' }
      const client = getLLMClient()

      const conversation = history
        .map(m => `${m.role === 'assistant' ? 'AI' : '사용자'}: ${m.content}`)
        .join('\n')

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: '대화 내용을 분석해서 아래 JSON 형식으로만 반환하세요. 없는 정보는 null.',
        messages: [{
          role: 'user',
          content: `대화:\n${conversation}\n\n위 대화에서 다음 정보를 추출하세요:\n{\n  "name": "이름",\n  "title": "직책",\n  "department": "부서",\n  "company": "회사",\n  "industry": "업계",\n  "projects": ["진행중 프로젝트"],\n  "workTypes": ["주요 업무 유형"],\n  "teammates": ["팀원 이름"],\n  "clients": ["거래처/클라이언트"],\n  "communication": "주요 보고/소통 방식",\n  "domain_keywords": ["전문 용어/키워드"],\n  "summary": "한 줄 요약"\n}`,
        }],
      })

      const raw = response.content[0]?.text?.trim() || '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const profile = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
      return { success: true, profile }
    } catch (e) {
      return { error: e.message }
    }
  })

  // 파일/폴더 분석 → 프로필 초안 생성 (Cold Start)
  ipcMain.handle('profile:scan-files', async (_event, { filePaths = [] }) => {
    try {
      if (!hasAuth()) return { error: 'Claude 인증 없음' }

      const fileContents = []
      for (const fp of filePaths.slice(0, 10)) {
        try {
          const stat = fs.statSync(fp)
          if (stat.isDirectory()) {
            const entries = fs.readdirSync(fp, { withFileTypes: true })
            const list = entries.slice(0, 300).map(e =>
              e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`
            )
            fileContents.push(`[폴더: ${path.basename(fp)}]\n${list.join('\n')}`)
          } else {
            const buf = fs.readFileSync(fp)
            const text = buf.toString('utf-8').slice(0, 40000)
            fileContents.push(`[파일: ${path.basename(fp)}]\n${text}`)
          }
        } catch (e) {
          fileContents.push(`[읽기 실패: ${path.basename(fp)}]`)
        }
      }

      if (fileContents.length === 0) return { error: '읽을 수 있는 파일이 없습니다' }

      const combined = fileContents.join('\n\n---\n\n').slice(0, 200000)
      const client = getLLMClient()

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `사용자가 제공한 파일/폴더를 분석하여 업무 프로필을 추출합니다.
파일 목록·이메일·연락처·채팅 등에서 이름, 직책, 회사, 팀원, 프로젝트, 업무 유형 등을 찾아냅니다.
확실한 정보만 포함하고, 불확실한 것은 null로 표시하세요.
반드시 JSON만 반환하세요.`,
        messages: [{
          role: 'user',
          content: `다음 파일들을 분석하여 사용자 업무 프로필을 추출하세요:\n\n${combined}\n\n반환 형식:\n{\n  "name": "이름 또는 null",\n  "title": "직책 또는 null",\n  "department": "부서 또는 null",\n  "company": "회사 또는 null",\n  "industry": "업계 또는 null",\n  "projects": ["현재 프로젝트명"],\n  "workTypes": ["주요 업무 유형 (예: 개발, 기획, 보고서 작성)"],\n  "teammates": ["동료/팀원 이름"],\n  "clients": ["거래처/클라이언트명"],\n  "communication": "주요 소통 방식 또는 null",\n  "domain_keywords": ["업무 전문 용어"],\n  "summary": "한 줄 요약",\n  "found_sources": ["파일명: 찾은 정보 요약"]\n}`,
        }],
      })

      const raw = response.content[0]?.text?.trim() || '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
      const { found_sources, ...profileData } = parsed
      return { success: true, profile: profileData, found: found_sources || [] }
    } catch (e) {
      console.error('[Profile] scan-files 오류:', e.message)
      return { error: e.message }
    }
  })

  // 검증된 프로필로 지식 베이스 재합성 (원본 대화 폐기 후 호출)
  ipcMain.handle('profile:synthesize', async (_event, profile) => {
    try {
      if (!hasAuth()) return { error: 'Claude 인증 없음' }

      const client = getLLMClient()
      const profileText = JSON.stringify(profile, null, 2)

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: '검증된 사용자 프로필을 바탕으로 AI 에이전트가 참조할 업무 맥락 문서를 마크다운으로 작성합니다.',
        messages: [{
          role: 'user',
          content: `다음 프로필을 바탕으로 AI 에이전트용 업무 맥락 문서를 작성하세요:\n\n${profileText}\n\n형식: 마크다운, 500자 이내, # 업무 맥락 으로 시작`,
        }],
      })

      const markdown = response.content[0]?.text?.trim() || `# 업무 맥락\n\n${profile.summary || ''}`
      vault.saveProfileContext(markdown)
      return { success: true }
    } catch (e) {
      console.error('[Profile] synthesize 오류:', e.message)
      return { error: e.message }
    }
  })

  // ─── AI 자연어 명령 라우팅 ────────────────────────────────────

  ipcMain.handle('skill:command', async (_event, { query }) => {
    try {
      const mcpClient = require('./core/mcp-client')
      const cfg = getMcpClientConfig()

      // 쿼리에서 로컬 파일 경로 감지 → 내용 자동 삽입
      // 파일 경로 감지 → 내용 추출 (라우팅은 원본 짧은 쿼리로, 실행은 파일 내용 포함)
      const filePathRe = /(?:^|\s)((?:\/|~\/)[^\s'"]+\.[a-zA-Z0-9]+)/g
      let match
      const fileParts = []
      const fileErrors = []
      while ((match = filePathRe.exec(query)) !== null) {
        const rawPath = match[1].replace(/^~/, require('os').homedir())
        try {
          const text = await extractText(rawPath)
          fileParts.push(`[파일: ${path.basename(rawPath)}]\n${text}`)
        } catch (e) {
          fileErrors.push(`${path.basename(rawPath)}: ${e.message}`)
        }
      }
      if (fileErrors.length > 0 && fileParts.length === 0) {
        return { success: false, error: `파일을 읽을 수 없습니다 — ${fileErrors.join(', ')}` }
      }

      // 파일 경로 제거한 순수 명령어 (라우팅용)
      const cleanQuery = query.replace(filePathRe, '').trim() || query.trim()
      // 스킬 실행용 입력 (파일 내용 + 명령어)
      const fullInput = fileParts.length > 0
        ? `${fileParts.join('\n\n')}\n\n지시: ${cleanQuery}`
        : query

      const customSkillsJson = JSON.stringify(vault.getCustomSkills())
      const { output, meta } = await mcpClient.callTool(
        'smart_command',
        { query: cleanQuery, file_input: fullInput, custom_skills: customSkillsJson },
        cfg,
      )
      return { success: true, output, usedSkill: meta?.usedSkill || null }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // ─── Custom Skills ─────────────────────────────────────────────

  ipcMain.handle('skill:list-custom', () => {
    return vault.getCustomSkills()
  })

  ipcMain.handle('skill:save-custom', (_event, skill) => {
    try {
      const saved = vault.saveCustomSkill(skill)
      require('./core/mcp-client').reconnect()   // 커스텀 스킬 변경 → MCP 재연결
      return { success: true, skill: saved }
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('skill:delete-custom', (_event, { id }) => {
    const ok = vault.deleteCustomSkill(id)
    require('./core/mcp-client').reconnect()     // 커스텀 스킬 변경 → MCP 재연결
    return { success: ok }
  })

  // 자연어 → 스킬 자동 생성
  ipcMain.handle('skill:generate', async (_event, { description, existingSkill = null }) => {
    try {
      if (!hasAuth()) return { error: 'Claude 인증 없음' }
      const client = getLLMClient()

      const action = existingSkill ? '수정' : '생성'
      const baseInfo = existingSkill
        ? `\n\n기존 스킬:\n${JSON.stringify(existingSkill, null, 2)}`
        : ''

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `당신은 AI 스킬 빌더입니다. 사용자의 요청을 분석해서 업무 자동화 스킬을 ${action}해 주세요.
스킬은 텍스트 입력을 받아 특정 형식/목적으로 변환하는 AI 프롬프트입니다.

반드시 아래 JSON 형식으로만 반환하세요:
{
  "label": "스킬 이름 (2~6글자)",
  "icon": "단일 이모지 또는 특수문자",
  "color": "#hex색상",
  "desc": "한 줄 설명 (10자 이내)",
  "detail": "상세 설명 (30자 이내)",
  "systemPrompt": "이 스킬의 AI 시스템 프롬프트 (핵심, 구체적으로)",
  "examples": ["입력 예시 1", "입력 예시 2", "입력 예시 3"],
  "tip": "사용 팁 (선택)"
}`,
        messages: [{
          role: 'user',
          content: `요청: ${description}${baseInfo}`,
        }],
      })

      const raw = response.content[0]?.text?.trim() || '{}'
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { error: '스킬 생성 실패: 응답 파싱 오류' }

      const skillDef = JSON.parse(jsonMatch[0])
      // 기존 스킬 수정이면 id 유지
      if (existingSkill?.id) skillDef.id = existingSkill.id

      return { success: true, skill: skillDef }
    } catch (e) {
      console.error('[Skill] 생성 오류:', e.message)
      return { error: e.message }
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
        useClaudeCli: !!store.get('useClaudeCli'),
        claudeCliPath: store.get('claudeCliPath') || '',
        hasAuth: hasAuth(),
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
        // 숨긴 기본 스킬
        hiddenSkills: store.get('hiddenSkills') || [],
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
      if (params.useClaudeCli !== undefined) {
        store.set('useClaudeCli', !!params.useClaudeCli)
      }
      if (params.claudeCliPath !== undefined) {
        store.set('claudeCliPath', params.claudeCliPath)
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
      if (params.hiddenSkills !== undefined) {
        store.set('hiddenSkills', params.hiddenSkills)
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

  // ─── Claude CLI 점검 ──────────────────────────────────────
  ipcMain.handle('ai:check-cli', async (_event, { path: cliPath } = {}) => {
    try {
      if (cliPath !== undefined) {
        const prev = store.get('claudeCliPath')
        store.set('claudeCliPath', cliPath || '')
        const res = await checkClaudeCli()
        if (!res.ok) store.set('claudeCliPath', prev || '')
        return res
      }
      return await checkClaudeCli()
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // ─── 설정 내보내기/가져오기 ──────────────────────────────
  ipcMain.handle('settings:export', async () => {
    try {
      return {
        success: true,
        data: {
          anthropicKey:        store.get('anthropicKey') || '',
          useClaudeCli:        !!store.get('useClaudeCli'),
          claudeCliPath:       store.get('claudeCliPath') || '',
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
        'anthropicKey', 'useClaudeCli', 'claudeCliPath',
        'gmailEmail', 'gmailAppPassword', 'slackToken',
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
    const { shell } = require('electron')
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
    )
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
  // ─── MCP 클라이언트 설정 헬퍼 ────────────────────────────────

  function getMcpClientConfig() {
    const orgConfig = vault.getOrgConfig()
    return {
      apiKey:         store.get('anthropicKey'),
      customSkills:   vault.getCustomSkills(),
      orgName:        orgConfig.company        || '',
      customGlossary: orgConfig.customGlossary || '',
      customFolders:  orgConfig.customFolders  || [],
    }
  }

  const SKILL_LABELS = {
    summary: '요약', translate: '번역', minutes: '회의록', report: '보고서',
    kpi: 'KPI 현황', slides: '슬라이드', budget: '예산표', notebook: '노트',
    onboarding: '온보딩', hwp: '공문서(HWP)', filing: '파일 분류', agent: '행정 에이전트',
  }

  ipcMain.handle('skill:run', async (_event, { skillId, input, sourceItemId, messages, customPrompt }) => {
    try {
      const mcpClient = require('./core/mcp-client')
      const cfg = getMcpClientConfig()

      let toolName, toolArgs

      if (skillId?.startsWith('custom-')) {
        toolName = 'run_custom'
        toolArgs = {
          skill_id:      skillId,
          input,
          system_prompt: customPrompt || undefined,
          messages:      messages || [],
        }
      } else {
        toolName = skillId
        toolArgs = { input, messages: messages || [] }
      }

      const { output, messages: nextMessages } = await mcpClient.callTool(toolName, toolArgs, cfg)

      // 첫 번째 호출(messages 없음)에만 vault에 저장
      let savedId = null
      if (!messages || messages.length === 0) {
        if (skillId?.startsWith('custom-')) {
          const found = cfg.customSkills.find(s => s.id === skillId)
          if (found) SKILL_LABELS[skillId] = found.label
        }
        const skillLabel = SKILL_LABELS[skillId] || skillId
        const saved = vault.saveSkillOutput({ skillId, skillLabel, input, output, sourceItemId })
        savedId = saved.id
      }

      // nextMessages: MCP _meta에서 반환된 대화 히스토리, 없으면 직접 구성
      const retMessages = nextMessages || [
        ...(messages || []),
        { role: 'user', content: input },
        { role: 'assistant', content: output },
      ]

      return { success: true, output, messages: retMessages, id: savedId }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 파일 분류 스킬 (MCP) ────────────────────────────────────
  ipcMain.handle('skill:run-filing', async (_event, fileInfo) => {
    try {
      const mcpClient = require('./core/mcp-client')
      const cfg = getMcpClientConfig()
      const { output } = await mcpClient.callTool('filing', fileInfo, cfg)
      const result = JSON.parse(output)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ─── 슬라이드 HTML 생성 (MCP) ────────────────────────────────
  ipcMain.handle('skill:run-slides-html', async (_event, { input, sourceItemId }) => {
    try {
      const mcpClient = require('./core/mcp-client')
      const os = require('os')
      const cfg = getMcpClientConfig()

      const { output: html } = await mcpClient.callTool('slides_html', { input }, cfg)

      const ts = Date.now()
      const tmpPath = path.join(os.tmpdir(), `tidy-slides-${ts}.html`)
      fs.writeFileSync(tmpPath, html, 'utf-8')

      const saved = vault.saveSkillOutput({ skillId: 'slides-html', skillLabel: '슬라이드 HTML', input, output: html, sourceItemId })

      // macOS: open, Windows: start
      const { exec } = require('child_process')
      const openCmd = process.platform === 'win32' ? `start "" "${tmpPath}"` : `open "${tmpPath}"`
      exec(openCmd)

      return { success: true, filePath: tmpPath, id: saved.id }
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
        agent:      { app: 'Pages',             ext: 'txt' },
        filing:     { app: 'TextEdit',          ext: 'txt' },
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

  // ─── 스킬 마켓플레이스 ──────────────────────────────────────────

  const DEFAULT_MARKET_URL = 'http://localhost:3333'
  function getMarketUrl() {
    return (store.get('marketplaceUrl') || DEFAULT_MARKET_URL).replace(/\/$/, '')
  }

  ipcMain.handle('marketplace:get-url', () => getMarketUrl())

  ipcMain.handle('marketplace:set-url', (_event, { url }) => {
    store.set('marketplaceUrl', url)
    return { success: true }
  })

  ipcMain.handle('marketplace:list', async (_event, { q = '', category = 'all', sort = 'popular', page = 1 } = {}) => {
    try {
      const base = getMarketUrl()
      const params = new URLSearchParams({ q, category, sort, page: String(page), limit: '24' })
      const res = await fetch(`${base}/api/skills?${params}`)
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`)
      return await res.json()
    } catch (e) {
      return { error: e.message, skills: [], total: 0, pages: 0, page: 1 }
    }
  })

  async function publishSkillToMarketplace(skill, authorName) {
    const base = getMarketUrl()
    const authorId    = store.get('marketAuthorId')    || (() => { const id = require('crypto').randomUUID(); store.set('marketAuthorId', id); return id })()
    const authorToken = store.get('marketAuthorToken') || (() => { const tk = require('crypto').randomUUID(); store.set('marketAuthorToken', tk); return tk })()
    const body = {
      label: skill.label, icon: skill.icon, color: skill.color,
      desc: skill.desc, detail: skill.detail,
      system_prompt: skill.systemPrompt,
      examples: skill.examples || [], tip: skill.tip || '',
      author_name: authorName || store.get('marketAuthorName') || '익명',
      author_id: authorId, author_token: authorToken,
      category: skill.category || 'general', tags: skill.tags || [],
    }
    const res = await fetch(`${base}/api/skills`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || '등록 실패' }
    if (authorName) store.set('marketAuthorName', authorName)
    return { success: true, marketId: data.id }
  }

  ipcMain.handle('marketplace:publish', async (_event, { skill, authorName }) => {
    try {
      return await publishSkillToMarketplace(skill, authorName)
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('skill:publish-custom', async (_event, { id, category = 'general', tags = [], authorName = '' }) => {
    try {
      const skill = vault.getCustomSkills().find(s => s.id === id)
      if (!skill) return { error: '공유할 커스텀 스킬을 찾을 수 없습니다' }
      if (!skill.systemPrompt?.trim()) return { error: '시스템 프롬프트가 비어 있어 공유할 수 없습니다' }
      const publishTarget = { ...skill, category, tags }
      const result = await publishSkillToMarketplace(publishTarget, authorName)
      if (result.error) return result
      const saved = vault.saveCustomSkill({
        ...skill,
        category,
        tags,
        marketId: result.marketId,
        publishedAt: new Date().toISOString(),
        authorName: authorName || store.get('marketAuthorName') || '익명',
        source: skill.source || 'user',
      })
      return { success: true, marketId: result.marketId, skill: saved }
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('marketplace:install', async (_event, { id }) => {
    try {
      const base = getMarketUrl()
      const res  = await fetch(`${base}/api/skills/${id}`)
      if (!res.ok) throw new Error('스킬을 불러올 수 없습니다')
      const data = await res.json()
      const saved = vault.saveCustomSkill({
        label: data.label, icon: data.icon, color: data.color,
        desc: data.desc, detail: data.detail,
        systemPrompt: data.system_prompt,
        examples: data.examples, tip: data.tip,
        type: 'custom', source: 'marketplace', marketId: data.id,
        category: data.category || 'general', tags: data.tags || [],
        publishedAt: data.created_at || null, authorName: data.author_name || '',
      })
      fetch(`${base}/api/skills/${id}/install`, { method: 'POST' }).catch(() => {})
      return { success: true, skill: saved }
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('marketplace:like', async (_event, { id }) => {
    try {
      const base     = getMarketUrl()
      const clientId = store.get('marketAuthorId') || (() => { const cid = require('crypto').randomUUID(); store.set('marketAuthorId', cid); return cid })()
      const res = await fetch(`${base}/api/skills/${id}/like`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      return await res.json()
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('marketplace:unpublish', async (_event, { marketId }) => {
    try {
      const base = getMarketUrl()
      const authorToken = store.get('marketAuthorToken')
      if (!authorToken) return { error: '삭제 권한 없음' }
      const res = await fetch(`${base}/api/skills/${marketId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_token: authorToken }),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error || '삭제 실패' }
      return { success: true }
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('marketplace:get-author', () => ({
    authorId:   store.get('marketAuthorId'),
    authorName: store.get('marketAuthorName') || '',
  }))

  // ─── 문서 편집기 ───────────────────────────────────────────────────────────
  ipcMain.handle('document:open-file', async (_event) => {
    const win = getWindow() || null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '문서 열기',
      filters: [
        { name: '지원 문서', extensions: ['hwp', 'docx', 'pdf', 'txt', 'md', 'html', 'htm'] },
        { name: 'HWP 문서',  extensions: ['hwp'] },
        { name: 'Word 문서', extensions: ['docx'] },
        { name: 'PDF 문서',  extensions: ['pdf'] },
        { name: '텍스트',    extensions: ['txt', 'md'] },
        { name: 'HTML',     extensions: ['html', 'htm'] },
      ],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return null
    return { filePath: filePaths[0] }
  })

  // 일반 파일 읽기 (텍스트/HTML/MD 용)
  ipcMain.handle('document:read-text', async (_event, filePath) => {
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch (e) {
      throw new Error('파일 읽기 실패: ' + e.message)
    }
  })

  ipcMain.handle('document:read-file', async (_event, filePath) => {
    try {
      const buf = fs.readFileSync(filePath)
      const arr = new Uint8Array(buf.byteLength)
      arr.set(buf)
      return arr
    } catch (e) {
      console.error('[Document] 파일 읽기 오류:', e.message)
      return null
    }
  })

  ipcMain.handle('document:fetch-template-url', async (_event, inputUrl) => {
    const rawUrl = String(inputUrl || '').trim()
    let parsed
    try {
      parsed = new URL(rawUrl)
    } catch {
      throw new Error('올바른 URL을 입력하세요.')
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('http 또는 https URL만 가져올 수 있습니다.')
    }
    const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
    if (blockedHosts.has(parsed.hostname.toLowerCase())) {
      throw new Error('로컬 주소는 인터넷 템플릿으로 가져올 수 없습니다.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    try {
      const res = await fetch(parsed.href, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/json,text/markdown,text/plain,text/css;q=0.9,*/*;q=0.5',
          'User-Agent': 'Tidy Document Template Importer',
        },
      })
      if (!res.ok) throw new Error(`가져오기 실패: HTTP ${res.status}`)
      const contentLength = Number(res.headers.get('content-length') || 0)
      if (contentLength > 1_500_000) {
        throw new Error('템플릿 파일이 너무 큽니다. 1.5MB 이하의 HTML/CSS/JSON 파일을 사용하세요.')
      }
      const content = await res.text()
      if (content.length > 1_500_000) {
        throw new Error('템플릿 파일이 너무 큽니다. 1.5MB 이하의 HTML/CSS/JSON 파일을 사용하세요.')
      }
      return {
        url: res.url || parsed.href,
        contentType: res.headers.get('content-type') || '',
        content,
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('템플릿 가져오기 시간이 초과되었습니다.')
      throw new Error(e?.message || '템플릿을 가져오지 못했습니다.')
    } finally {
      clearTimeout(timeout)
    }
  })

  // DOCX → HTML (mammoth) — filePath(string) 또는 bytes(Uint8Array) 모두 지원
  ipcMain.handle('document:import-docx', async (_event, filePathOrBytes) => {
    try {
      const mammoth = require('mammoth')
      let result
      if (typeof filePathOrBytes === 'string') {
        result = await mammoth.convertToHtml({ path: filePathOrBytes })
      } else {
        // Renderer에서 Uint8Array로 전달된 경우 (드래그앤드롭)
        result = await mammoth.convertToHtml({ buffer: Buffer.from(filePathOrBytes) })
      }
      const html = result.value || ''
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return { html, text }
    } catch (e) {
      console.error('[Document] DOCX 변환 오류:', e.message)
      throw new Error('DOCX 변환 실패: ' + e.message)
    }
  })

  // PDF → HTML/text/IR — 회의 중 빠르게 쓸 수 있도록 텍스트 기반 구조를 즉시 만든다.
  ipcMain.handle('document:import-pdf', async (_event, filePathOrBytes) => {
    try {
      const pdfParse = require('pdf-parse')
      const buffer = typeof filePathOrBytes === 'string'
        ? fs.readFileSync(filePathOrBytes)
        : Buffer.from(filePathOrBytes)
      let data
      if (typeof pdfParse === 'function') {
        data = await pdfParse(buffer)
      } else {
        const parser = new pdfParse.PDFParse({ data: buffer })
        try { data = await parser.getText() }
        finally { await parser.destroy?.() }
      }
      const text = String(data?.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
      if (!text) throw new Error('PDF에서 텍스트를 추출할 수 없습니다')
      return {
        text,
        html: documentTextToHtmlForImport(text),
        ir: documentTextToIrForImport(text, { format: 'pdf' }),
      }
    } catch (e) {
      console.error('[Document] PDF 변환 오류:', e.message)
      throw new Error('PDF 변환 실패: ' + e.message)
    }
  })

  function documentEscapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function documentTextToIrForImport(text, meta = {}) {
    const blocks = []
    const lines = String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
    for (const line of lines) {
      const cells = line.includes('\t')
        ? line.split('\t').map(s => s.trim()).filter(Boolean)
        : (/\S\s{2,}\S/.test(line) ? line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean) : [])
      if (cells.length >= 2) {
        blocks.push({ type: 'table', rows: [cells.map(text => ({ text }))] })
      } else if (/^(#{1,6})\s+/.test(line) || (/^\d+(?:\.\d+)*[.)]?\s+/.test(line) && line.length <= 90)) {
        blocks.push({ type: 'heading', level: 2, text: line.replace(/^#{1,6}\s+/, '') })
      } else if (/^([-*•]|\d+[.)])\s+/.test(line)) {
        blocks.push({ type: 'list', ordered: /^\d/.test(line), items: [line.replace(/^([-*•]|\d+[.)])\s+/, '')] })
      } else {
        blocks.push({ type: 'paragraph', text: line })
      }
    }
    return {
      version: '1.0',
      source: meta,
      blocks,
      stats: {
        headings: blocks.filter(b => b.type === 'heading').length,
        paragraphs: blocks.filter(b => b.type === 'paragraph').length,
        tables: blocks.filter(b => b.type === 'table').length,
        lists: blocks.filter(b => b.type === 'list').length,
      },
    }
  }

  function documentTextToHtmlForImport(text) {
    const ir = documentTextToIrForImport(text)
    const body = ir.blocks.map(block => {
      if (block.type === 'heading') return `<h2>${documentEscapeHtml(block.text)}</h2>`
      if (block.type === 'paragraph') return `<p>${documentEscapeHtml(block.text)}</p>`
      if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul'
        return `<${tag}>${block.items.map(item => `<li>${documentEscapeHtml(item)}</li>`).join('')}</${tag}>`
      }
      if (block.type === 'table') {
        return `<table>${block.rows.map(row => `<tr>${row.map(cell => `<td>${documentEscapeHtml(cell.text)}</td>`).join('')}</tr>`).join('')}</table>`
      }
      return ''
    }).join('\n')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 10pt; line-height: 1.8; padding: 50px 70px; color: #111; }
h1 { text-align:center; font-size:15pt; } h2 { font-size:12pt; margin:20px 0 8px; border-bottom:1.5px solid #333; padding-bottom:3px; }
p { margin:5px 0; } table { border-collapse:collapse; width:100%; margin:10px 0; } td, th { border:1px solid #555; padding:5px 9px; font-size:9.5pt; }
ul, ol { margin:6px 0 6px 22px; }
</style></head><body>${body}</body></html>`
  }

  function buildDocumentKnowledgeContext(kbContext = null) {
    const orgConfig = { ...(vault.getOrgConfig?.() || {}), ...(kbContext || {}) }
    const sections = []
    const orgLines = [
      orgConfig.company ? `회사/기관: ${orgConfig.company}` : '',
      orgConfig.department ? `부서: ${orgConfig.department}` : '',
      orgConfig.orgName ? `조직명: ${orgConfig.orgName}` : '',
    ].filter(Boolean)
    if (orgLines.length) sections.push(`[조직 정보]\n${orgLines.join('\n')}`)
    if (orgConfig.customGlossary?.trim()) sections.push(`[용어집/고유명사]\n${orgConfig.customGlossary.trim().slice(0, 2500)}`)
    if (Array.isArray(orgConfig.customFolders) && orgConfig.customFolders.length) {
      sections.push(`[조직 폴더/업무 구조]\n${orgConfig.customFolders.slice(0, 30).map(v => `- ${v}`).join('\n')}`)
    }
    try {
      const profilePath = path.join(vault.getVaultPath(), 'profile_context.md')
      if (fs.existsSync(profilePath)) {
        sections.push(`[검증된 사용자 업무 맥락]\n${fs.readFileSync(profilePath, 'utf-8').slice(0, 2500)}`)
      }
    } catch {}
    return sections.join('\n\n').trim()
  }

  // AI 재편집 — Claude가 템플릿에 맞게 HTML 재구성
  ipcMain.handle('document:reorganize', async (_event, {
    text, sourceHtml, documentIr, mode, kbContext, templateId, instruction,
    templateStructure, templateCss, templateName,
  }) => {
    const TEMPLATES_MAP = {
      report:   { name: '보고서',   prompt: '보고서 형식. 숫자는 표로, 현황·성과 비교는 가로 막대 차트로, 시계열 데이터는 세로 막대 차트로. 핵심은 글머리기호.' },
      gongmun:  { name: '공문',     prompt: '공문 형식. 격식체 사용. 수신·참조·제목·본문·붙임 구조. 통계 자료는 표와 차트 동시 활용.' },
      minutes:  { name: '회의록',   prompt: '회의록 형식. 결정사항은 담당자·기한 표로. 안건별 투표·찬반 비율은 가로 막대 차트.' },
      proposal: { name: '제안서',   prompt: '제안서 형식. 배경→목표→방법→효과→예산. 예산·비용은 표+가로 막대 차트, 추진 일정은 절차도(flow).' },
      notice:   { name: '안내문',   prompt: '안내문 형식. 대상·일시·장소 표로. 프로그램 순서나 일정은 절차도(flow)로 시각화.' },
    }
    const tpl = TEMPLATES_MAP[templateId] || TEMPLATES_MAP.report
    if (templateName) tpl.name = templateName

    const BASE_CSS = `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: '맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; font-size: 10pt; line-height: 1.9; color: #111; background: #fff; padding: 50px 70px; max-width: 820px; margin: 0 auto; }
h1 { font-size: 15pt; font-weight: 700; text-align: center; margin: 12px 0 18px; }
h2 { font-size: 12pt; font-weight: 700; margin: 20px 0 8px; padding-bottom: 3px; border-bottom: 1.5px solid #333; }
h3 { font-size: 11pt; font-weight: 600; margin: 14px 0 6px; }
p { margin: 5px 0; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
th, td { border: 1px solid #555; padding: 5px 9px; font-size: 9.5pt; }
th { background: #e6e6e6; font-weight: 600; text-align: center; }
ul, ol { margin: 6px 0 6px 22px; }
li { margin: 3px 0; }
.center { text-align: center; } .right { text-align: right; } .bold { font-weight: 700; }
.meta { font-size: 9pt; color: #555; }
hr { border: none; border-top: 1px solid #ccc; margin: 18px 0; }

/* ── 도표: CSS 바 차트 ─────────────────── */
.chart { margin: 14px 0; padding: 14px 16px; border: 1px solid #ccc; background: #fafafa; page-break-inside: avoid; }
.chart-title { font-size: 10.5pt; font-weight: 700; margin-bottom: 10px; text-align: center; }
.chart-caption { font-size: 9pt; color: #666; margin-top: 8px; text-align: center; }
.bar-row { display: flex; align-items: center; margin: 5px 0; gap: 8px; }
.bar-label { width: 110px; font-size: 9.5pt; text-align: right; flex-shrink: 0; }
.bar-track { flex: 1; height: 20px; background: #e5e5e5; border: 1px solid #bbb; position: relative; }
.bar-fill  { height: 100%; background: #4a5cdb; display: flex; align-items: center; padding: 0 8px; color: #fff; font-size: 8.5pt; font-weight: 600; }
.bar-fill.c2 { background: #10a765; } .bar-fill.c3 { background: #d97706; }
.bar-fill.c4 { background: #be185d; } .bar-fill.c5 { background: #0891b2; }
.bar-value { width: 70px; font-size: 9.5pt; text-align: left; flex-shrink: 0; }

/* ── 도표: 세로 막대 차트 (간단) ─────────── */
.vbar-chart { display: flex; align-items: flex-end; gap: 12px; height: 180px; padding: 10px; border-bottom: 2px solid #333; }
.vbar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.vbar-bar { width: 100%; background: #4a5cdb; display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; color: #fff; font-size: 8.5pt; font-weight: 600; }
.vbar-col:nth-child(2n) .vbar-bar { background: #10a765; }
.vbar-col:nth-child(3n) .vbar-bar { background: #d97706; }
.vbar-label { font-size: 9pt; margin-top: 5px; text-align: center; }

/* ── 도표: 플로우 박스 (절차도) ─────────── */
.flow { display: flex; gap: 0; flex-wrap: wrap; align-items: stretch; margin: 12px 0; }
.flow-box { flex: 1; min-width: 120px; border: 1.5px solid #333; padding: 10px 8px; background: #fff; text-align: center; font-size: 9.5pt; position: relative; }
.flow-box + .flow-box::before { content: "▶"; position: absolute; left: -10px; top: 50%; transform: translateY(-50%); font-size: 11pt; color: #555; background: #fff; padding: 0 2px; }
.flow-box.highlight { background: #fff7d6; font-weight: 600; }`

    const activeMode = mode === 'preserve' ? 'preserve' : 'template'
    const hasTemplate = activeMode === 'template' && !!templateStructure
    const knowledgeContext = buildDocumentKnowledgeContext(kbContext)
    const irHint = documentIr ? `\n[구조화 JSON IR — 제목/문단/표/리스트/강조 분석 결과]\n${JSON.stringify(documentIr).slice(0, 6000)}\n` : ''
    const kbHint = knowledgeContext ? `\n[Knowledge Base — 고유명사/조직/사업 정보. 충돌 시 이 내용을 우선]\n${knowledgeContext}\n` : ''

    const systemPrompt = activeMode === 'preserve' ? `당신은 한국 비즈니스 문서 전문 편집자입니다.
원본 HTML 구조를 최대한 유지하면서 사용자의 자연어 지시사항만 반영합니다.

[규칙]
1. 출력은 반드시 <!DOCTYPE html>부터 </html>까지 완전한 HTML
2. 원본의 제목, 표, 리스트, 강조, 정렬 구조를 가능한 한 유지
3. 사용자가 요구한 부분만 수정하고 불필요한 재작성 금지
4. Knowledge Base의 조직명, 고유명사, 용어는 임의로 바꾸지 말 것
5. 마크다운 코드블록 없이 순수 HTML만 반환`
    : hasTemplate ? `당신은 한국 비즈니스 문서 전문 편집자입니다.
사용자가 "템플릿 구조 HTML"을 제공합니다. 당신의 유일한 임무는:
**제공된 템플릿 HTML을 그대로 복사한 뒤, 빈 자리(<td></td>, <p></p>, <li></li>)에 원본 내용을 채워 넣는 것** 입니다.

[❗❗❗ 절대 규칙 — 위반 시 실패]
① 템플릿에 있는 모든 <h1>, <h2>, <h3>, <table>, <tr>, <th>, <td>, <ul>, <ol>, <li>, <p>, <hr> 태그와 그 순서를 **바이트 단위로 동일하게** 유지할 것
② 템플릿에 <ol>이 있으면 <ol>을 그대로 사용 (<ul>로 바꾸지 말 것). 템플릿에 <ul>이면 <ul> 그대로
③ 템플릿에 없는 <h2> 섹션을 절대 추가하지 말 것 (예: 템플릿에 없는 "6. 특이사항", "5. 결정 사항 및 후속 과제" 같은 자기만의 구조 금지)
④ 템플릿에 없는 차트(<div class="chart">), 플로우(<div class="flow">) 삽입 금지
⑤ 내용이 없어도 템플릿 섹션을 삭제하지 말 것 — "해당 없음" 또는 빈 채로 유지
⑥ 템플릿 표의 행 수가 부족하면 <tr>을 복제해 추가 가능 (구조는 동일)
⑦ 마크다운 코드블록 없이, <!DOCTYPE html>...</html> 순수 HTML만 반환
⑧ <head>의 <style>은 제공된 CSS 그대로 사용 (수정·추가 금지)

[작업 절차]
1. 템플릿 HTML 전체를 출력 버퍼에 그대로 복사
2. 원본 내용을 섹션별로 분류 (참석자, 안건, 토의내용, 결정사항 등)
3. 해당 섹션의 빈 태그에만 텍스트 삽입
4. 섹션이 비면 "해당 없음" 기입
5. 새 섹션·차트·그림·아이콘·이모지 추가 금지`
: `당신은 한국 비즈니스 문서 전문 편집자입니다.
주어진 내용을 ${tpl.name} 형식의 완전한 HTML 문서로 재편집하여 반환하세요.

[규칙]
1. <!DOCTYPE html>부터 </html>까지 완전한 HTML 문서 반환
2. <head>에 <meta charset="utf-8">와 <style> 태그
3. 숫자·비교는 <table>로, 핵심은 <ul>로
4. 마크다운 코드블록 없이 순수 HTML만 반환`

    const structureHint = sourceHtml
      ? `\n[원본 HTML 구조 — 참고용, 표·리스트 맥락 이해에 활용]:\n${sourceHtml.slice(0, 4000)}\n`
      : ''

    const cssToUse = templateCss || BASE_CSS

    const userPrompt = activeMode === 'preserve' ? `## 작업: 원본 구조를 유지한 채 자연어 지시사항 반영

### 1) 사용할 CSS
\`\`\`css
${cssToUse}
\`\`\`

### 2) 원본 HTML
\`\`\`html
${String(sourceHtml || '').slice(0, 12000)}
\`\`\`

### 3) 원본 텍스트
${text.slice(0, 8000)}
${irHint}
${kbHint}
### 4) 지시사항
${instruction || '원본 구조를 유지하면서 읽기 좋게 정리'}

### 5) 출력: <!DOCTYPE html> ... </html> 순수 HTML만`
    : hasTemplate ? `## 작업: 아래 템플릿 HTML을 복사해서 빈 자리에 원본 내용을 채워 넣기

### 1) 반드시 사용할 CSS (<style> 태그 안에 그대로)
\`\`\`css
${cssToUse}
\`\`\`

### 2) ❗ 반드시 이 뼈대를 그대로 유지할 템플릿 HTML
\`\`\`html
${templateStructure}
\`\`\`

### 3) 위 템플릿의 빈 자리에 채울 원본 내용
${text.slice(0, 8000)}
${structureHint}
${irHint}
${kbHint}
### 4) 작업 방법
- 위 템플릿의 <h1>, <h2>, <h3>, <table>, <ol>, <ul>, <p>, <hr> 태그와 계층·순서를 **그대로** 유지
- 각 섹션 제목(<h2>참석자</h2> 등)은 **한 글자도 바꾸지 말 것**
- <td></td>, <p></p>, <li></li> 같은 빈 태그 안에 원본에서 추출한 해당 내용을 넣기
- 템플릿 표의 행이 부족하면 <tr>을 복제해 추가 (단, 열 구조·class는 동일)
- 템플릿에 없는 <h2> 섹션·차트·플로우·번호체계("1. 개요", "2. 논의") 추가 금지
- 추가 지시사항: ${instruction || '(없음)'}

### 5) 출력: <!DOCTYPE html> ... </html> 순수 HTML만 (설명·코드펜스 없이)`
    : `원본 내용을 "${tpl.name}" 형식으로 재편집해주세요.

형식 지침: ${tpl.prompt}
추가 지시사항: ${instruction || '기본 형식으로 깔끔하게 정리해주세요'}

CSS:
<style>${cssToUse}</style>
${structureHint}
${irHint}
${kbHint}
원본 내용:
${text.slice(0, 8000)}`

    try {
      if (!hasAuth()) throw new Error('Claude 인증이 설정되지 않았습니다 (Settings > AI)')
      const client = getLLMClient()
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        temperature: 0.2,    // 결정적 출력 — 템플릿에서 이탈 최소화
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
      let html = response.content[0]?.text || ''
      // 마크다운 코드블록 제거 (AI가 실수로 감쌌을 경우)
      html = html.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      if (!html.toLowerCase().includes('<!doctype') && !html.toLowerCase().includes('<html')) {
        html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${cssToUse}</style></head><body>${html}</body></html>`
      }
      return html
    } catch (e) {
      throw new Error('AI 처리 실패: ' + e.message)
    }
  })

  // 현재 HTML 또는 선택 영역에 자연어 명령을 적용한다.
  ipcMain.handle('document:edit-html', async (_event, {
    html, selectedHtml, selectedText, instruction, documentIr, kbContext,
  }) => {
    try {
      if (!hasAuth()) throw new Error('Claude 인증이 설정되지 않았습니다 (Settings > AI)')
      const client = getLLMClient()
      const hasSelection = !!String(selectedText || selectedHtml || '').trim()
      const knowledgeContext = buildDocumentKnowledgeContext(kbContext)
      const system = `당신은 HTML 기반 문서 자동화 편집 엔진입니다.
사용자의 자연어 명령을 HTML 구조 변경으로 변환합니다.

[규칙]
1. 표, 리스트, 제목, 볼드, 정렬 같은 구조 정보를 유지하거나 명령에 맞게 변경
2. Knowledge Base의 조직명, 고유명사, 사업 정보는 임의 변경 금지
3. 설명 없이 JSON만 반환
4. 선택 영역이 있으면 {"replacementHtml":"..."}만 반환
5. 선택 영역이 없으면 {"html":"<!DOCTYPE html>..."}만 반환`

      const user = `## 명령
${instruction}

## 선택 영역 여부
${hasSelection ? '있음 — 선택 영역만 수정' : '없음 — 문서 전체 수정'}

## 선택 영역 HTML
\`\`\`html
${String(selectedHtml || '').slice(0, 5000)}
\`\`\`

## 선택 영역 텍스트
${String(selectedText || '').slice(0, 3000)}

## 전체 문서 HTML
\`\`\`html
${String(html || '').slice(0, 16000)}
\`\`\`

## 구조 JSON IR
\`\`\`json
${documentIr ? JSON.stringify(documentIr).slice(0, 6000) : '{}'}
\`\`\`

## Knowledge Base
${knowledgeContext || '(없음)'}`

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: hasSelection ? 4096 : 8192,
        temperature: 0.15,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const raw = String(response.content[0]?.text || '').trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
      let payload = null
      try { payload = JSON.parse(raw) }
      catch { payload = parseProcessJson(raw) }

      if (hasSelection) {
        const replacementHtml = payload?.replacementHtml || raw
        return {
          replacementHtml: String(replacementHtml)
            .replace(/^```html?\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim(),
        }
      }

      let nextHtml = payload?.html || raw
      nextHtml = String(nextHtml).replace(/^```html?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      if (!/^<!doctype|<html/i.test(nextHtml)) {
        nextHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${nextHtml}</body></html>`
      }
      return { html: nextHtml }
    } catch (e) {
      throw new Error('자연어 수정 실패: ' + e.message)
    }
  })

  // HTML → DOCX 내보내기
  ipcMain.handle('document:export-docx', async (_event, { html, fileName }) => {
    try {
      const HTMLtoDOCX = require('html-to-docx')
      const win = getWindow()
      const baseName = (fileName || '문서').replace(/\.[^.]+$/, '')
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: baseName + '.docx',
        filters: [{ name: 'Word 문서', extensions: ['docx'] }],
      })
      if (canceled || !filePath) return { success: false }
      const docxBuf = await HTMLtoDOCX(html, null, {
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false,
      })
      fs.writeFileSync(filePath, Buffer.from(docxBuf))
      return { success: true, filePath }
    } catch (e) {
      throw new Error('DOCX 내보내기 실패: ' + e.message)
    }
  })

  // HTML → HWPX 내보내기 (편집 가능한 텍스트/표 기반)
  ipcMain.handle('document:export-hwp', async (_event, { html, fileName, templateId }) => {
    // 1) 번들된 JRE + hwpxlib 경로 탐지 (dev / packaged 양쪽 지원)
    const resourceRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'hwpx')
      : path.join(__dirname, '..', 'resources', 'hwpx')
    const javaBin = path.join(resourceRoot, 'jre', 'bin', 'java')
    const hwpxJar = path.join(resourceRoot, 'hwpxlib-1.0.5.jar')
    const writerClassDir = resourceRoot  // HwpxWriter.class 가 여기 있음
    const missingBuiltinResources = [javaBin, hwpxJar, path.join(writerClassDir, 'HwpxWriter.class')]
      .filter(p => !fs.existsSync(p))

    const win = getWindow() || null
    const baseName = (fileName || '문서').replace(/\.[^.]+$/, '')
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: baseName + '.hwpx',
      filters: [
        { name: '한글 문서 (HWPX)', extensions: ['hwpx'] },
        { name: '한글 문서 (HWP)',  extensions: ['hwp'] },
      ],
    })
    if (canceled || !filePath) return { success: false }

    // 2) 배포 환경에서도 동일하게 동작하도록 번들된 JRE + JS HWPX XML 엔진을 기본 경로로 사용한다.
    // 사용자의 Python/pandoc 설치 여부와 무관하게 표 병합/선/글자 크기를 같은 방식으로 생성한다.
    const bundledResult = missingBuiltinResources.length
      ? { success: false, error: `HWP 생성기 파일 누락: ${missingBuiltinResources.join(', ')}\n앱 재설치 또는 resources/hwpx/ 확인 필요` }
      : await tryBuiltinHwpxExport(html, filePath, javaBin, hwpxJar, writerClassDir)
    if (bundledResult.success) {
      return { success: true, filePath, engine: bundledResult.engine }
    }

    // 3) 개발 환경에서만 더 풍부한 템플릿 채우기 엔진을 폴백으로 사용한다.
    // 이 경로는 python-hwpx가 설치된 사용자에게만 동작하므로 기본 품질 기준에는 포함하지 않는다.
    const templateResult = await tryTemplateHwpxExport(html, filePath, templateId, resourceRoot)
    if (templateResult.success) {
      return { success: true, filePath, engine: templateResult.engine, bundledError: bundledResult.error || null }
    }

    // 4) Pandoc 기반 변환기를 추가 폴백으로 사용한다.
    // 생성 후 HWPX XML을 보정해 템플릿의 표/정렬/글자 크기를 가능한 한 유지한다.
    const externalResult = await tryExternalHwpxExport(html, filePath)
    if (externalResult.success) {
      return {
        success: true,
        filePath,
        engine: externalResult.engine,
        bundledError: bundledResult.error || null,
        templateError: templateResult.error || null,
      }
    }

    throw new Error(`HWPX 생성 실패\n${bundledResult.error || templateResult.error || externalResult.error || '알 수 없는 오류'}`)
  })

  async function tryTemplateHwpxExport(html, outputPath, templateId, resourceRoot) {
    const tmpPath = path.join(os.tmpdir(), `tidy-doc-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
    try {
      const safeTemplateId = safeFileStem(templateId || 'report')
      const templatePath = path.join(resourceRoot, 'templates', `${safeTemplateId}.hwpx`)
      const scriptPath = path.join(resourceRoot, 'hwpx_template_export.py')
      if (!fs.existsSync(templatePath)) {
        return { success: false, error: `템플릿 HWPX 파일 없음: ${templatePath}` }
      }
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: `템플릿 HWPX helper 없음: ${scriptPath}` }
      }

      const pythonPath = await findPythonWithModule('hwpx')
      if (!pythonPath) {
        return { success: false, error: 'python-hwpx 모듈을 import할 수 있는 Python을 찾을 수 없음' }
      }

      fs.writeFileSync(tmpPath, html, 'utf-8')
      const result = await runProcess(pythonPath, [
        scriptPath,
        '--input-html', tmpPath,
        '--output', outputPath,
        '--template-path', templatePath,
        '--template-id', safeTemplateId,
      ])
      const payload = parseProcessJson(result.stdout)
      if (result.ok && payload?.success && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        await enhanceFilledTemplateHwpx(outputPath, html)
        return { success: true, engine: payload.engine || 'python-hwpx-template' }
      }
      const errorMessage = payload?.error || result.stderr || result.stdout || '템플릿 HWPX 변환 실패'
      console.warn('[Document] 템플릿 HWPX 변환 실패, 외부 변환 사용:', errorMessage)
      return { success: false, error: errorMessage }
    } catch (e) {
      console.warn('[Document] 템플릿 HWPX 변환 실패, 외부 변환 사용:', e.message)
      return { success: false, error: e.message }
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  }

  async function tryBuiltinHwpxExport(html, filePath, javaBin, hwpxJar, writerClassDir) {
    const { spawn } = require('child_process')
    try {
      const blocks = htmlToHwpxBlocks(html)
      const classpath = `${hwpxJar}${process.platform === 'win32' ? ';' : ':'}${writerClassDir}`
      await new Promise((resolve, reject) => {
        const proc = spawn(javaBin, ['-cp', classpath, 'HwpxWriter', filePath], {
          timeout: 30000,
        })
        let stderr = ''
        proc.stderr?.on('data', d => { stderr += d.toString() })
        proc.stdin.write('P:\n', 'utf-8')
        proc.stdin.end()
        proc.on('exit', code => code === 0
          ? resolve()
          : reject(new Error(`HWPX 기본 파일 생성 실패 (종료 코드 ${code})\n${stderr}`)))
        proc.on('error', reject)
      })
      await rewriteHwpxWithBlocks(filePath, blocks)
      return { success: true, engine: 'bundled-hwpx-js' }
    } catch (e) {
      console.warn('[Document] 내장 HWPX 변환 실패, 외부 변환 사용:', e.message)
      return { success: false, error: e.message }
    }
  }

  async function tryExternalHwpxExport(html, outputPath) {
    const tmpPath = path.join(os.tmpdir(), `tidy-doc-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
    try {
      fs.writeFileSync(tmpPath, html, 'utf-8')

      const cliPath = findExecutable('pypandoc-hwpx')
      if (cliPath) {
        const result = await runProcess(cliPath, [tmpPath, '-o', outputPath])
        if (result.ok && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          await enhanceEditableHwpxStyles(outputPath, html)
          return { success: true, engine: 'pypandoc-hwpx-enhanced' }
        }
        console.warn('[Document] pypandoc-hwpx CLI 실패, 내장 변환 사용:', result.stderr || result.stdout)
      }

      const pythonPath = await findPythonWithModule('pypandoc_hwpx')
      if (pythonPath) {
        const result = await runProcess(pythonPath, ['-m', 'pypandoc_hwpx.cli', tmpPath, '-o', outputPath])
        if (result.ok && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          await enhanceEditableHwpxStyles(outputPath, html)
          return { success: true, engine: 'pypandoc-hwpx-enhanced' }
        }
        console.warn('[Document] pypandoc_hwpx 모듈 변환 실패, 내장 변환 사용:', result.stderr || result.stdout)
      }
    } catch (e) {
      console.warn('[Document] 외부 HWPX 변환 실패, 내장 변환 사용:', e.message)
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
    return { success: false }
  }

  const HWPX_STYLE = {
    char: {
      body: 7,
      title: 8,
      heading2: 9,
      heading3: 10,
      boldBody: 11,
      meta: 12,
      sectionLabel: 13,
      tableBody: 14,
      tableHeader: 15,
      tableSmall: 16,
    },
    para: {
      title: 20,
      heading: 21,
      body: 22,
      right: 23,
      list: 24,
      tableLeft: 25,
      tableCenter: 26,
      tableRight: 27,
    },
    border: {
      tableBody: 4,
      tableHeader: 5,
      noteBox: 6,
      separator: 7,
    },
  }

  async function enhanceEditableHwpxStyles(filePath, html) {
    const JSZip = require('jszip')
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
    const sectionFile = zip.file('Contents/section0.xml')
    const headerFile = zip.file('Contents/header.xml')
    const mimeFile = zip.file('mimetype')
    if (!sectionFile || !headerFile) return

    const tableBlocks = extractHtmlTableBlocks(html)
    let sectionXml = await sectionFile.async('string')
    sectionXml = sectionXml.replace(/<\/hp:tr>\s*<\/hp:tr>/g, '</hp:tr>')

    const usedTableBlocks = new Set()
    sectionXml = sectionXml.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, tableXml => {
      const block = selectHtmlTableBlockForHwpx(tableXml, tableBlocks, usedTableBlocks)
      return block ? styleEditableTableXml(tableXml, block) : tableXml
    })

    zip.file('Contents/header.xml', ensureHwpxHeaderStyles(await headerFile.async('string')))
    zip.file('Contents/section0.xml', sectionXml)
    if (mimeFile) {
      zip.file('mimetype', await mimeFile.async('string'), { compression: 'STORE' })
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(filePath, output)
  }

  async function enhanceFilledTemplateHwpx(filePath, html) {
    const JSZip = require('jszip')
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
    const sectionFile = zip.file('Contents/section0.xml')
    const headerFile = zip.file('Contents/header.xml')
    const mimeFile = zip.file('mimetype')
    if (!sectionFile || !headerFile) return

    const tableBlocks = extractHtmlTableBlocks(html)
    let sectionXml = await sectionFile.async('string')
    sectionXml = sectionXml.replace(/<\/hp:tr>\s*<\/hp:tr>/g, '</hp:tr>')

    const usedTableBlocks = new Set()
    sectionXml = sectionXml.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, tableXml => {
      const block = selectHtmlTableBlockForHwpx(tableXml, tableBlocks, usedTableBlocks)
      return block ? styleEditableTableXml(tableXml, block) : tableXml
    })
    sectionXml = styleTemplateParagraphsXml(sectionXml, html)

    zip.file('Contents/header.xml', ensureHwpxHeaderStyles(await headerFile.async('string')))
    zip.file('Contents/section0.xml', sectionXml)
    if (mimeFile) {
      zip.file('mimetype', await mimeFile.async('string'), { compression: 'STORE' })
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(filePath, output)
  }

  function styleTemplateParagraphsXml(sectionXml, html = '') {
    const tables = []
    const protectedXml = sectionXml.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, tableXml => {
      const token = `@@TIDY_HWPX_TABLE_${tables.length}@@`
      tables.push(tableXml)
      return token
    })
    const sourceStyles = extractParagraphStyleHints(html)
    let firstContentParagraph = true
    const styledXml = protectedXml.replace(/<hp:p\b[\s\S]*?<\/hp:p>/g, paragraphXml => {
      if (paragraphXml.includes('<hp:secPr') || paragraphXml.includes('<hp:tbl')) return paragraphXml

      const text = decodeXmlEntities(
        Array.from(paragraphXml.matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g))
          .map(match => match[1])
          .join('')
      ).replace(/\s+/g, ' ').trim()
      if (!text) return paragraphXml

      const hinted = sourceStyles.get(normalizeStyleHintText(text))
      let paraPr = hinted?.paraPr || HWPX_STYLE.para.body
      let charPr = hinted?.charPr || HWPX_STYLE.char.body
      if (hinted) {
        firstContentParagraph = false
      } else if (firstContentParagraph) {
        paraPr = HWPX_STYLE.para.title
        charPr = HWPX_STYLE.char.title
        firstContentParagraph = false
      } else if (isTemplateHeadingText(text)) {
        paraPr = HWPX_STYLE.para.heading
        charPr = HWPX_STYLE.char.heading2
      } else if (/^[•-]\s+|^\d+\.\s+/.test(text)) {
        paraPr = HWPX_STYLE.para.list
        charPr = HWPX_STYLE.char.body
      }

      let next = paragraphXml.replace(/<hp:p\b[^>]*>/, tag => {
        let out = setAttrOnTag(tag, 'paraPrIDRef', paraPr)
        out = setAttrOnTag(out, 'styleIDRef', '0')
        return out
      })
      next = next.replace(/<hp:run\b[^>]*>/g, tag => setAttrOnTag(tag, 'charPrIDRef', charPr))
      return next
    })
    return styledXml.replace(/@@TIDY_HWPX_TABLE_(\d+)@@/g, (_token, index) => tables[Number(index)] || '')
  }

  function extractParagraphStyleHints(html) {
    const hints = new Map()
    for (const block of htmlToHwpxBlocks(html)) {
      if (block.type !== 'p' && block.type !== 'box') continue
      const key = normalizeStyleHintText(block.text)
      if (!key || hints.has(key)) continue
      hints.set(key, paragraphStyleForBlock(block))
    }
    return hints
  }

  function normalizeStyleHintText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
  }

  function isTemplateHeadingText(text) {
    return isLikelySectionHeadingText(text)
      || /^(참석자|불참자|안건|토의 내용|결정 사항|차기 회의|신청 방법|유의 사항|문의처|현황|소요 예산|추진 일정)$/.test(text)
  }

  function isLikelySectionHeadingText(text) {
    const value = normalizeStyleHintText(text)
    if (!value || value.length > 60) return false
    return /^\d+\.\s+/.test(value)
      && /(개요|배경|현황|분석|검토|제안|개선|결론|계획|목적|목표|방안|효과|예산|일정|필요성|추진|성과|문제|대응|향후|요약|주요|내용)/.test(value)
  }

  function decodeXmlEntities(value) {
    return String(value || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  }

  function extractHtmlTableBlocks(html) {
    try {
      const { parseDOM } = require('htmlparser2')
      const dom = parseDOM(String(html || ''), {
        decodeEntities: true,
        lowerCaseAttributeNames: true,
        lowerCaseTags: true,
      })
      const body = findFirstTag(dom, 'body')
      const roots = body?.children || dom
      const tables = []
      const walk = (node, context = emptyHtmlContext()) => {
        if (!node || node.type !== 'tag') return
        const tag = String(node.name || '').toLowerCase()
        if (['script', 'style', 'head', 'meta', 'title', 'link'].includes(tag)) return
        const nextContext = mergeHtmlContext(context, node)
        if (tag === 'table') {
          const tableBlock = parseHtmlTableNode(node, nextContext)
          if (tableBlock.rows.length) tables.push(tableBlock)
          return
        }
        for (const child of node.children || []) walk(child, nextContext)
      }
      for (const root of roots) walk(root)
      return tables
    } catch (e) {
      console.warn('[Document] HWPX 표 스타일 추출 실패:', e.message)
      return []
    }
  }

  function selectHtmlTableBlockForHwpx(tableXml, tableBlocks, usedTableBlocks) {
    if (!tableBlocks.length) return null
    const targetCols = readHwpxTableColumnCount(tableXml)
    const targetHeader = extractHwpxTableFirstRowTexts(tableXml)
    let best = null

    tableBlocks.forEach((block, index) => {
      if (usedTableBlocks.has(index)) return
      const blockCols = buildTableLayout(block.rows || []).colCnt
      if (targetCols && blockCols !== targetCols) return
      const sourceHeader = tableBlockFirstRowTexts(block)
      const headerScore = sharedHeaderScore(targetHeader, sourceHeader)
      const rowScore = Math.min(3, Math.abs(readHwpxTableRowCount(tableXml) - (block.rows?.length || 0)) === 0 ? 3 : 0)
      const orderScore = Math.max(0, 2 - Math.abs(index - usedTableBlocks.size))
      const score = headerScore * 10 + rowScore + orderScore + (targetCols === blockCols ? 4 : 0)
      if (!best || score > best.score) best = { index, block, score, headerScore }
    })

    if (!best) return null
    usedTableBlocks.add(best.index)
    return best.block
  }

  function readHwpxTableColumnCount(tableXml) {
    return Number(String(tableXml || '').match(/<hp:tbl\b[^>]*\bcolCnt="(\d+)"/)?.[1] || 0)
  }

  function readHwpxTableRowCount(tableXml) {
    return Number(String(tableXml || '').match(/<hp:tbl\b[^>]*\browCnt="(\d+)"/)?.[1] || 0)
  }

  function extractHwpxTableFirstRowTexts(tableXml) {
    const firstRow = String(tableXml || '').match(/<hp:tr>[\s\S]*?<\/hp:tr>/)?.[0] || ''
    return Array.from(firstRow.matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g))
      .map(match => extractHwpxCellText(match[0]))
  }

  function tableBlockFirstRowTexts(block) {
    const layoutRow = buildTableLayout(block.rows || []).rows[0] || []
    return layoutRow.map(item => item.cell?.text || '')
  }

  function sharedHeaderScore(left, right) {
    const leftSet = new Set(left.map(normalizeTableToken).filter(Boolean))
    const rightSet = new Set(right.map(normalizeTableToken).filter(Boolean))
    let score = 0
    for (const value of rightSet) {
      if (leftSet.has(value)) score += 1
    }
    return score
  }

  function normalizeTableToken(value) {
    return String(value || '').replace(/\s+/g, '').replace(/[:：]+$/, '').toLowerCase()
  }

  function styleEditableTableXml(tableXml, block) {
    const rows = block.rows || []
    if (!rows.length) return tableXml
    return tableElementHwpxXml(block, extractHwpxTableId(tableXml) || 1000)
  }

  function styleEditableCellXml(cellXml, cell, row, width, rowHeight, variant = 'default', layoutCell = null) {
    const existingText = extractHwpxCellText(cellXml)
    const cellStyle = tableCellStyle(cell, row, existingText)
    const isHeader = cellStyle.highlight
    const align = cell.align || (isHeader ? 'center' : 'left')
    const paraPr = align === 'right'
      ? HWPX_STYLE.para.tableRight
      : align === 'center' ? HWPX_STYLE.para.tableCenter : HWPX_STYLE.para.tableLeft
    const charPr = variant === 'sign'
      ? HWPX_STYLE.char.tableSmall
      : isHeader || cell.bold ? HWPX_STYLE.char.tableHeader : HWPX_STYLE.char.tableBody
    const borderFill = isHeader ? HWPX_STYLE.border.tableHeader : HWPX_STYLE.border.tableBody
    const margin = variant === 'sign'
      ? { left: 160, right: 160, top: 120, bottom: 120 }
      : { left: 500, right: 500, top: 180, bottom: 180 }

    let xml = cellXml
    xml = xml.replace(/<hp:tc\b[^>]*>/, tag => {
      let next = tag
      next = setAttrOnTag(next, 'header', cellStyle.structuralHeader ? '1' : '0')
      next = setAttrOnTag(next, 'hasMargin', '0')
      next = setAttrOnTag(next, 'dirty', '1')
      next = setAttrOnTag(next, 'borderFillIDRef', borderFill)
      return next
    })
    xml = xml.replace(/<hp:subList\b[^>]*>/g, tag => {
      let next = tag
      next = setAttrOnTag(next, 'vertAlign', 'CENTER')
      next = setAttrOnTag(next, 'textWidth', Math.max(1, width - margin.left - margin.right))
      next = setAttrOnTag(next, 'textHeight', Math.max(1, rowHeight - margin.top - margin.bottom))
      next = setAttrOnTag(next, 'lineWrap', 'BREAK')
      return next
    })
    xml = xml.replace(/<hp:p\b[^>]*>/g, tag => {
      let next = tag
      next = setAttrOnTag(next, 'paraPrIDRef', paraPr)
      next = setAttrOnTag(next, 'styleIDRef', '0')
      return next
    })
    xml = xml.replace(/<hp:run\b[^>]*>/g, tag => setAttrOnTag(tag, 'charPrIDRef', charPr))
    xml = xml.replace(/<hp:cellSz\b[^>]*\/>/, tag => {
      let next = tag
      next = setAttrOnTag(next, 'width', width)
      next = setAttrOnTag(next, 'height', rowHeight)
      return next
    })
    if (layoutCell) {
      xml = xml.replace(/<hp:cellAddr\b[^>]*\/>/, tag => {
        let next = tag
        next = setAttrOnTag(next, 'colAddr', layoutCell.colAddr)
        next = setAttrOnTag(next, 'rowAddr', layoutCell.rowAddr)
        return next
      })
      xml = xml.replace(/<hp:cellSpan\b[^>]*\/>/, tag => {
        let next = tag
        next = setAttrOnTag(next, 'colSpan', layoutCell.colspan)
        next = setAttrOnTag(next, 'rowSpan', layoutCell.rowspan)
        return next
      })
    }
    xml = xml.replace(
      /<hp:cellMargin\b[^>]*\/>/,
      `<hp:cellMargin left="${margin.left}" right="${margin.right}" top="${margin.top}" bottom="${margin.bottom}"/>`
    )
    return xml
  }

  function resolveHwpxTableWidth(block) {
    const pageTextWidth = 42520
    if (block.variant === 'sign') return Math.min(12240, pageTextWidth)
    if (block.widthPercent && block.widthPercent < 100) {
      return Math.max(8000, Math.min(block.width || pageTextWidth, pageTextWidth))
    }
    const requested = block.width || pageTextWidth
    return Math.max(30000, Math.min(requested, pageTextWidth))
  }

  function extractHwpxCellText(cellXml) {
    return decodeXmlEntities(
      Array.from(String(cellXml || '').matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g))
        .map(match => match[1])
        .join('')
    ).replace(/\s+/g, ' ').trim()
  }

  function extractHwpxTableId(tableXml) {
    return String(tableXml || '').match(/<hp:tbl\b[^>]*\bid="([^"]+)"/)?.[1] || null
  }

  function isLikelyTableLabel(text) {
    const value = String(text || '').replace(/\s+/g, '').replace(/[:：]+$/, '')
    if (!value) return false
    return /^(보고일자|보고부서|보고자|결재라인|수신|참조|제목|회의명|일시|장소|사회|기록|대상|내용|참가비|담당|팀장|기관장|No\.?|결정사항|담당자|기한|비고|구분|항목|금액|합계|단계|일정|추진사항|1월|2월|3월|4월)$/.test(value)
  }

  function isTableHeaderCell(cell, row = [], fallbackText = '') {
    const text = cell?.text || fallbackText
    const rowKind = classifyTableRow(row)
    if (rowKind === 'keyValue') return isLikelyTableLabel(text)
    if (rowKind === 'header') return true
    return !!cell?.header
  }

  function tableCellStyle(cell, row = [], fallbackText = '') {
    const rowKind = classifyTableRow(row)
    const highlight = isTableHeaderCell(cell, row, fallbackText)
    return {
      highlight,
      structuralHeader: rowKind === 'header' && highlight,
    }
  }

  function classifyTableRow(row = []) {
    if (!row.length) return 'body'
    if (isKeyValueTableRow(row)) return 'keyValue'
    if (row.every(cell => cell.header)) return 'header'
    if (row.length > 1 && row.every(cell => isLikelyTableLabel(cell.text))) return 'header'
    return 'body'
  }

  function isKeyValueTableRow(row = []) {
    if (row.length < 2) return false
    const labels = row.map(cell => isLikelyTableLabel(cell.text))
    if (!labels[0] || !labels.some(Boolean) || !labels.some(label => !label)) return false

    const alternatingFromFirst = labels.every((isLabel, index) => (
      index % 2 === 0 ? isLabel : !isLabel
    ))
    if (alternatingFromFirst) return true

    const labelCount = labels.filter(Boolean).length
    return labelCount <= Math.ceil(row.length / 2)
  }

  function buildTableLayout(rows) {
    const layoutRows = []
    let active = []
    let colCnt = 0

    rows.forEach((row, rowIndex) => {
      const nextActive = active.map(value => Math.max(0, value - 1))
      const layoutRow = []
      let col = 0

      for (const cell of row) {
        while ((active[col] || 0) > 0) col += 1
        const colspan = Math.max(1, cell.colspan || 1)
        const rowspan = Math.max(1, cell.rowspan || 1)
        layoutRow.push({ cell, rowIndex, colAddr: col, colspan, rowspan })
        for (let offset = 0; offset < colspan; offset += 1) {
          nextActive[col + offset] = Math.max(nextActive[col + offset] || 0, rowspan - 1)
        }
        col += colspan
      }

      colCnt = Math.max(colCnt, col, activeTableWidth(active), activeTableWidth(nextActive))
      layoutRows.push(layoutRow)
      active = nextActive
    })

    return { rows: layoutRows, colCnt: Math.max(1, colCnt) }
  }

  function activeTableWidth(active) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if ((active[index] || 0) > 0) return index + 1
    }
    return 0
  }

  function countHwpxCells(rowXml) {
    return (String(rowXml || '').match(/<hp:tc\b/g) || []).length
  }

  function setFirstTagAttr(xml, tagName, attrName, value) {
    const re = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`)
    return xml.replace(re, tag => setAttrOnTag(tag, attrName, value))
  }

  function setTagAttr(xml, tagName, attrName, value) {
    return setFirstTagAttr(xml, tagName, attrName, value)
  }

  function setAttrOnTag(tag, attrName, value) {
    const attrRe = new RegExp(`\\s${escapeRegExp(attrName)}="[^"]*"`)
    const serialized = ` ${attrName}="${escapeXmlAttr(value)}"`
    return attrRe.test(tag)
      ? tag.replace(attrRe, serialized)
      : tag.replace(/\/?>$/, end => `${serialized}${end}`)
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function escapeXmlAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function safeFileStem(value) {
    const stem = String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80)
    return stem || 'report'
  }

  function parseProcessJson(stdout) {
    const text = String(stdout || '').trim()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {}
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1))
      } catch {}
    }
    return null
  }

  async function findPythonWithModule(moduleName) {
    const pythonNames = process.platform === 'win32'
      ? ['python.exe', 'python3.exe', 'python']
      : ['python3', 'python']
    const explicitCandidates = process.platform === 'win32' ? [] : [
      '/usr/local/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
      path.join(os.homedir(), 'miniconda3', 'bin', 'python3'),
      path.join(os.homedir(), 'miniconda3', 'bin', 'python'),
      '/opt/homebrew/bin/python3',
      '/usr/bin/python3',
    ]
    const candidates = []
    for (const name of pythonNames) candidates.push(...findExecutables(name))
    candidates.push(...explicitCandidates)

    const seen = new Set()
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate) || !fs.existsSync(candidate)) continue
      seen.add(candidate)
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
      } catch {
        continue
      }
      const result = await runProcess(candidate, [
        '-c',
        `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`,
      ])
      if (result.ok) return candidate
    }
    return null
  }

  function findExecutables(name) {
    const pathExts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : ['']
    const pathParts = [
      ...(process.env.PATH || '').split(path.delimiter),
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'Library', 'Python', '3.13', 'bin'),
      path.join(os.homedir(), 'Library', 'Python', '3.12', 'bin'),
      path.join(os.homedir(), 'Library', 'Python', '3.11', 'bin'),
      '/Library/Frameworks/Python.framework/Versions/3.13/bin',
      '/Library/Frameworks/Python.framework/Versions/3.12/bin',
      '/Library/Frameworks/Python.framework/Versions/3.11/bin',
      path.join(os.homedir(), 'miniconda3', 'bin'),
    ].filter(Boolean)

    const results = []
    const seen = new Set()
    for (const dir of pathParts) {
      for (const ext of pathExts) {
        const fullPath = path.join(dir, name + ext)
        if (seen.has(fullPath)) continue
        seen.add(fullPath)
        try {
          fs.accessSync(fullPath, fs.constants.X_OK)
          results.push(fullPath)
        } catch {}
      }
    }
    return results
  }

  function findExecutable(name) {
    const pathExts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : ['']
    const pathParts = [
      ...(process.env.PATH || '').split(path.delimiter),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'Library', 'Python', '3.13', 'bin'),
      path.join(os.homedir(), 'Library', 'Python', '3.12', 'bin'),
      path.join(os.homedir(), 'Library', 'Python', '3.11', 'bin'),
      '/Library/Frameworks/Python.framework/Versions/3.13/bin',
      '/Library/Frameworks/Python.framework/Versions/3.12/bin',
      '/Library/Frameworks/Python.framework/Versions/3.11/bin',
    ].filter(Boolean)

    for (const dir of pathParts) {
      for (const ext of pathExts) {
        const fullPath = path.join(dir, name + ext)
        try {
          fs.accessSync(fullPath, fs.constants.X_OK)
          return fullPath
        } catch {}
      }
    }
    return null
  }

  function runProcess(command, args) {
    const { spawn } = require('child_process')
    return new Promise(resolve => {
      const proc = spawn(command, args, { timeout: 60000 })
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', d => { stdout += d.toString() })
      proc.stderr?.on('data', d => { stderr += d.toString() })
      proc.on('error', err => resolve({ ok: false, stdout, stderr: err.message }))
      proc.on('exit', code => resolve({ ok: code === 0, stdout, stderr, code }))
    })
  }

  // HTML 문서 → HWPX 구조 블록
  function htmlToHwpxBlocks(html) {
    try {
      const { parseDOM } = require('htmlparser2')
      const dom = parseDOM(String(html || ''), {
        decodeEntities: true,
        lowerCaseAttributeNames: true,
        lowerCaseTags: true,
      })
      const body = findFirstTag(dom, 'body')
      const roots = body?.children || dom
      const blocks = []
      roots.forEach(node => appendHtmlNodeBlocks(node, blocks, emptyHtmlContext()))
      if (blocks.length) return blocks
    } catch (e) {
      console.warn('[Document] HTML 파서 변환 실패, 레거시 변환 사용:', e.message)
    }
    return legacyHtmlToHwpxBlocks(html)
  }

  function legacyHtmlToHwpxBlocks(html) {
    let s = String(html || '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    const body = s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
    if (body) s = body[1]

    const tables = []
    s = s.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) => {
      const token = `@@TIDY_TABLE_${tables.length}@@`
      tables.push(parseHtmlTable(tableHtml))
      return `\n${token}\n`
    })
    s = s
      .replace(/<hr\b[^>]*\/?>/gi, '\n@@TIDY_HR@@\n')
      .replace(/<div\b[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '\n')

    const blocks = []
    const blockRe = /@@TIDY_TABLE_(\d+)@@|@@TIDY_HR@@|<(h[1-6]|p|ul|ol)\b([^>]*)>([\s\S]*?)<\/\2>/gi
    let m
    while ((m = blockRe.exec(s)) !== null) {
      if (m[1] !== undefined) {
        blocks.push(tables[Number(m[1])])
        continue
      }
      if (m[0] === '@@TIDY_HR@@') {
        blocks.push({ type: 'hr' })
        continue
      }
      const tag = m[2].toLowerCase()
      const attrs = m[3] || ''
      const inner = m[4] || ''
      if (tag === 'ul' || tag === 'ol') {
        const items = []
        inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_li, liInner) => {
          const text = stripTags(liInner)
          if (text) items.push(text)
          return ''
        })
        items.forEach((text, index) => blocks.push({
          type: 'p',
          tag: 'li',
          text: tag === 'ol' ? `${index + 1}. ${text}` : `• ${text}`,
        }))
        continue
      }
      const text = stripTags(inner)
      if (!text && tag !== 'p') continue
      blocks.push({
        type: 'p',
        tag,
        text,
        align: htmlAlign(attrs, inner),
        bold: /<(b|strong)\b/i.test(inner),
      })
    }

    if (blocks.length === 0) {
      const text = stripTags(s).replace(/\n{3,}/g, '\n\n').trim()
      text.split(/\n+/).forEach(p => blocks.push({ type: 'p', tag: 'p', text: p }))
    }
    return blocks.length ? blocks : [{ type: 'p', tag: 'p', text: '' }]
  }

  function emptyHtmlContext() {
    return { classes: new Set(), tableAlign: null }
  }

  function findFirstTag(nodes, tagName) {
    for (const node of nodes || []) {
      if (isTag(node, tagName)) return node
      const found = findFirstTag(node.children, tagName)
      if (found) return found
    }
    return null
  }

  function appendHtmlNodeBlocks(node, blocks, context) {
    if (!node) return
    if (node.type === 'text') {
      const text = normalizeInlineText(node.data)
      if (text) blocks.push({ type: 'p', tag: 'p', text })
      return
    }
    if (node.type !== 'tag') return

    const tag = String(node.name || '').toLowerCase()
    if (['script', 'style', 'head', 'meta', 'title', 'link'].includes(tag)) return
    if (tag === 'br') return
    if (tag === 'hr') {
      blocks.push({ type: 'hr' })
      return
    }

    const nextContext = mergeHtmlContext(context, node)
    if (/^h[1-6]$/.test(tag)) {
      const text = textFromNode(node)
      if (text) blocks.push(paragraphBlock(node, tag, text, nextContext))
      return
    }
    if (tag === 'p') {
      blocks.push(paragraphBlock(node, tag, textFromNode(node), nextContext))
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      appendListBlocks(node, blocks, tag, nextContext)
      return
    }
    if (tag === 'table') {
      const tableBlock = parseHtmlTableNode(node, nextContext)
      if (tableBlock.rows.length) blocks.push(tableBlock)
      return
    }
    if (tag === 'div' && shouldRenderAsBox(node)) {
      blocks.push({
        type: 'box',
        text: textFromNode(node),
        align: htmlAlignFromNode(node, nextContext),
      })
      return
    }

    const before = blocks.length
    for (const child of node.children || []) appendHtmlNodeBlocks(child, blocks, nextContext)
    if (blocks.length === before && isBlockLike(tag)) {
      const text = textFromNode(node)
      if (text) blocks.push(paragraphBlock(node, 'p', text, nextContext))
    }
  }

  function mergeHtmlContext(context, node) {
    const classes = new Set(context.classes || [])
    for (const cls of classList(node)) classes.add(cls)
    const style = attr(node, 'style').toLowerCase()
    const classNames = attr(node, 'class').toLowerCase()
    const tableAlign = classNames.includes('sign-wrap') || /justify-content\s*:\s*flex-end|text-align\s*:\s*right/.test(style)
      ? 'right'
      : context.tableAlign
    return { classes, tableAlign }
  }

  function appendListBlocks(node, blocks, tag, context) {
    const items = (node.children || []).filter(child => isTag(child, 'li'))
    const targets = items.length ? items : node.children || []
    let index = 1
    for (const item of targets) {
      if (!isTag(item, 'li')) {
        appendHtmlNodeBlocks(item, blocks, context)
        continue
      }
      const text = textFromNode(item)
      blocks.push({
        type: 'p',
        tag: 'li',
        text: tag === 'ol' ? `${index}. ${text || ' '}` : `• ${text || ' '}`,
        align: 'left',
      })
      index += 1
    }
  }

  function paragraphBlock(node, tag, text, context) {
    return {
      type: 'p',
      tag,
      text: text || '',
      align: htmlAlignFromNode(node, context),
      bold: hasBoldIntent(node, context),
      meta: hasClass(node, 'meta'),
      className: classList(node).join(' '),
    }
  }

  function parseHtmlTableNode(tableNode, context) {
    const rows = []
    const tableClasses = classList(tableNode)
    const variant = tableClasses.includes('sign-table') || context.classes?.has('sign-wrap') ? 'sign' : 'default'
    const align = htmlAlignFromNode(tableNode, context)
    const widthPercent = readCssPercent(tableNode, 'width')
    const tableWidth = variant === 'sign'
      ? 12240
      : Math.round(42520 * (widthPercent || 100) / 100)
    for (const rowNode of directTableRowNodes(tableNode)) {
      const cells = []
      for (const cellNode of (rowNode.children || []).filter(child => isTag(child, 'th') || isTag(child, 'td'))) {
        const cellClasses = classList(cellNode)
        const header = isTag(cellNode, 'th')
        const text = textFromNode(cellNode)
        const cellAlign = variant === 'sign'
          ? 'center'
          : htmlAlignFromNode(cellNode, emptyHtmlContext())
        cells.push({
          text,
          lines: splitTextLines(text),
          header,
          colspan: readSpan(attr(cellNode, 'colspan'), 'colspan'),
          rowspan: readSpan(attr(cellNode, 'rowspan'), 'rowspan'),
          align: cellAlign,
          bold: header || hasBoldIntent(cellNode, context),
          className: cellClasses.join(' '),
          widthPercent: readCssPercent(cellNode, 'width'),
        })
      }
      if (cells.length) rows.push(cells)
    }
    return {
      type: 'table',
      rows,
      align,
      variant,
      width: tableWidth,
      widthPercent,
      columnPercents: readTableColumnPercents(tableNode),
      className: tableClasses.join(' '),
    }
  }

  function directTableRowNodes(tableNode) {
    const rows = []
    const collect = node => {
      for (const child of node?.children || []) {
        if (isTag(child, 'tr')) {
          rows.push(child)
          continue
        }
        const name = String(child?.name || '').toLowerCase()
        if (['thead', 'tbody', 'tfoot'].includes(name)) collect(child)
      }
    }
    collect(tableNode)
    return rows
  }

  function readTableColumnPercents(tableNode) {
    const percents = []
    for (const child of tableNode?.children || []) {
      if (!isTag(child, 'colgroup')) continue
      for (const col of child.children || []) {
        if (isTag(col, 'col')) percents.push(readCssPercent(col, 'width'))
      }
    }
    return percents.some(Boolean) ? percents : null
  }

  function findDescendantTags(node, tagName) {
    const found = []
    function walk(current) {
      for (const child of current?.children || []) {
        if (isTag(child, tagName)) found.push(child)
        else walk(child)
      }
    }
    walk(node)
    return found
  }

  function textFromNode(node) {
    return splitTextLines(rawTextFromNode(node)).join('\n')
  }

  function rawTextFromNode(node, root = node) {
    if (!node) return ''
    if (node.type === 'text') return node.data || ''
    if (node.type !== 'tag') return ''
    const tag = String(node.name || '').toLowerCase()
    if (['script', 'style', 'head'].includes(tag)) return ''
    if (tag === 'br') return '\n'

    const blockBreak = node !== root && ['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
    let text = blockBreak ? '\n' : ''
    for (const child of node.children || []) text += rawTextFromNode(child, root)
    if (blockBreak) text += '\n'
    return text
  }

  function splitTextLines(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .split(/\n+/)
      .map(line => normalizeInlineText(line))
      .filter(Boolean)
  }

  function normalizeInlineText(text) {
    return String(text || '').replace(/[ \t\r\f]+/g, ' ').trim()
  }

  function htmlAlignFromNode(node, context = emptyHtmlContext()) {
    const source = `${attr(node, 'class')} ${attr(node, 'style')}`.toLowerCase()
    if (/text-align\s*:\s*center|\bcenter\b/.test(source)) return 'center'
    if (/text-align\s*:\s*right|\bright\b/.test(source)) return 'right'
    return context.tableAlign || 'left'
  }

  function hasBoldIntent(node, context = emptyHtmlContext()) {
    if (hasClass(node, 'bold')) return true
    if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(attr(node, 'style'))) return true
    if (context.classes?.has('bold')) return true
    return hasDescendantTag(node, 'b') || hasDescendantTag(node, 'strong')
  }

  function hasDescendantTag(node, tagName) {
    for (const child of node?.children || []) {
      if (isTag(child, tagName) || hasDescendantTag(child, tagName)) return true
    }
    return false
  }

  function shouldRenderAsBox(node) {
    const classes = classList(node)
    return classes.includes('box') || classes.includes('contact-box')
  }

  function isBlockLike(tag) {
    return ['section', 'article', 'main', 'header', 'footer', 'blockquote', 'div'].includes(tag)
  }

  function isTag(node, tagName) {
    return node?.type === 'tag' && String(node.name || '').toLowerCase() === tagName
  }

  function attr(node, name) {
    return String(node?.attribs?.[name] || '')
  }

  function classList(node) {
    return attr(node, 'class').split(/\s+/).map(c => c.trim()).filter(Boolean)
  }

  function hasClass(node, className) {
    return classList(node).includes(className)
  }

  function parseHtmlTable(tableHtml) {
    const rows = []
    tableHtml.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_tr, trInner) => {
      const cells = []
      trInner.replace(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_cell, tag, attrs, inner) => {
        const text = stripTags(inner)
        cells.push({
          text,
          header: tag.toLowerCase() === 'th',
          colspan: readSpan(attrs, 'colspan'),
          rowspan: readSpan(attrs, 'rowspan'),
          align: htmlAlign(attrs, inner),
          bold: tag.toLowerCase() === 'th' || /<(b|strong)\b/i.test(inner),
        })
        return ''
      })
      if (cells.length) rows.push(cells)
      return ''
    })
    return { type: 'table', rows }
  }

  function readSpan(attrs, name) {
    if (/^\d+$/.test(String(attrs || '').trim())) {
      return Math.max(1, Math.min(12, Number(String(attrs).trim())))
    }
    const m = String(attrs || '').match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'))
    return Math.max(1, Math.min(12, Number(m?.[1] || 1)))
  }

  function htmlAlign(attrs, inner = '') {
    const source = `${attrs || ''} ${inner || ''}`.toLowerCase()
    if (/text-align\s*:\s*center|class\s*=\s*["'][^"']*center/.test(source)) return 'center'
    if (/text-align\s*:\s*right|class\s*=\s*["'][^"']*right/.test(source)) return 'right'
    return 'left'
  }

  function readCssPercent(node, propName) {
    const attrs = `${attr(node, 'style')} ${attr(node, propName)}`.toLowerCase()
    const escaped = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const styleMatch = attrs.match(new RegExp(`${escaped}\\s*:\\s*([\\d.]+)\\s*%`))
    if (styleMatch) return clampPercent(Number(styleMatch[1]))
    const attrMatch = attrs.match(/(^|\s)([\d.]+)\s*%/)
    return attrMatch ? clampPercent(Number(attrMatch[2])) : null
  }

  function clampPercent(value) {
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(100, value)) : null
  }

  async function rewriteHwpxWithBlocks(filePath, blocks) {
    const JSZip = require('jszip')
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
    const sectionFile = zip.file('Contents/section0.xml')
    const headerFile = zip.file('Contents/header.xml')
    const mimeFile = zip.file('mimetype')
    if (!sectionFile || !headerFile) throw new Error('HWPX 기본 XML을 찾을 수 없습니다')

    const sectionXml = await sectionFile.async('string')
    const headerXml = await headerFile.async('string')
    const rootMatch = sectionXml.match(/^(<\?xml[^>]*\?>\s*)?(<hs:sec\b[^>]*>)/)
    const firstPara = sectionXml.match(/<hp:p\b[\s\S]*?<\/hp:p>/)?.[0]
    if (!rootMatch || !firstPara) throw new Error('HWPX section XML 구조를 해석할 수 없습니다')

    zip.file('Contents/header.xml', ensureHwpxHeaderStyles(headerXml))
    zip.file(
      'Contents/section0.xml',
      `${rootMatch[1] || ''}${rootMatch[2]}${firstPara}${blocksToHwpxXml(blocks)}</hs:sec>`
    )
    if (mimeFile) {
      zip.file('mimetype', await mimeFile.async('string'), { compression: 'STORE' })
    }
    const output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    fs.writeFileSync(filePath, output)
  }

  function ensureHwpxHeaderStyles(headerXml) {
    let xml = headerXml
    if (!xml.includes(`id="${HWPX_STYLE.char.body}" height="1000"`)) {
      xml = bumpItemCnt(xml, 'hh:charProperties', 7)
      xml = xml.replace('</hh:charProperties>', [
        charPrXml(HWPX_STYLE.char.body, 1000, false),
        charPrXml(HWPX_STYLE.char.title, 1500, true),
        charPrXml(HWPX_STYLE.char.heading2, 1200, true),
        charPrXml(HWPX_STYLE.char.heading3, 1100, true),
        charPrXml(HWPX_STYLE.char.boldBody, 1000, true),
        charPrXml(HWPX_STYLE.char.meta, 900, false, '#555555'),
        charPrXml(HWPX_STYLE.char.sectionLabel, 950, true),
        '</hh:charProperties>',
      ].join(''))
    }
    if (!xml.includes(`id="${HWPX_STYLE.char.tableBody}" height="950"`)) {
      xml = bumpItemCnt(xml, 'hh:charProperties', 3)
      xml = xml.replace('</hh:charProperties>', [
        charPrXml(HWPX_STYLE.char.tableBody, 950, false),
        charPrXml(HWPX_STYLE.char.tableHeader, 950, true),
        charPrXml(HWPX_STYLE.char.tableSmall, 850, false),
        '</hh:charProperties>',
      ].join(''))
    }
    if (!xml.includes(`id="${HWPX_STYLE.para.title}" tabPrIDRef="0"`)) {
      xml = bumpItemCnt(xml, 'hh:paraProperties', 5)
      xml = xml.replace('</hh:paraProperties>', [
        paraPrXml(HWPX_STYLE.para.title, 'CENTER', 0, 400),
        paraPrXml(HWPX_STYLE.para.heading, 'LEFT', 900, 300),
        paraPrXml(HWPX_STYLE.para.body, 'LEFT', 120, 120),
        paraPrXml(HWPX_STYLE.para.right, 'RIGHT', 120, 120),
        paraPrXml(HWPX_STYLE.para.list, 'LEFT', 80, 80, 900),
        '</hh:paraProperties>',
      ].join(''))
    }
    if (!xml.includes(`id="${HWPX_STYLE.para.tableLeft}" tabPrIDRef="0"`)) {
      xml = bumpItemCnt(xml, 'hh:paraProperties', 3)
      xml = xml.replace('</hh:paraProperties>', [
        paraPrXml(HWPX_STYLE.para.tableLeft, 'LEFT', 0, 0, 0, 135),
        paraPrXml(HWPX_STYLE.para.tableCenter, 'CENTER', 0, 0, 0, 135),
        paraPrXml(HWPX_STYLE.para.tableRight, 'RIGHT', 0, 0, 0, 135),
        '</hh:paraProperties>',
      ].join(''))
    }
    if (!xml.includes(`<hh:borderFill id="${HWPX_STYLE.border.tableBody}"`)) {
      xml = bumpItemCnt(xml, 'hh:borderFills', 3)
      xml = xml.replace('</hh:borderFills>', [
        borderFillXml(HWPX_STYLE.border.tableBody, '#FFFFFF'),
        borderFillXml(HWPX_STYLE.border.tableHeader, '#E6E6E6'),
        borderFillXml(HWPX_STYLE.border.noteBox, '#F5F5F5'),
        '</hh:borderFills>',
      ].join(''))
    }
    if (!xml.includes(`<hh:borderFill id="${HWPX_STYLE.border.separator}"`)) {
      xml = bumpItemCnt(xml, 'hh:borderFills', 1)
      xml = xml.replace('</hh:borderFills>', [
        separatorBorderFillXml(HWPX_STYLE.border.separator),
        '</hh:borderFills>',
      ].join(''))
    }
    return xml
  }

  function bumpItemCnt(xml, elementName, add) {
    const re = new RegExp(`(<${elementName}\\b[^>]*itemCnt=")(\\d+)(")`)
    return xml.replace(re, (_m, a, n, b) => `${a}${Number(n) + add}${b}`)
  }

  function charPrXml(id, height, bold, color = '#000000') {
    return `<hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '<hh:bold/>' : ''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>`
  }

  function paraPrXml(id, align, prev, next, left = 0, lineSpacing = 160) {
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="1" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="1" eAsianNum="1"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="${left}" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="${prev}" unit="HWPUNIT"/><hc:next value="${next}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${lineSpacing}" unit="HWPUNIT"/><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`
  }

  function borderFillXml(id, faceColor) {
    return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#555555"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#555555"/><hh:topBorder type="SOLID" width="0.12 mm" color="#555555"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#555555"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="${faceColor}" hatchColor="#FF000000" alpha="0"/></hc:fillBrush></hh:borderFill>`
  }

  function separatorBorderFillXml(id) {
    return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#999999"/><hh:rightBorder type="NONE" width="0.1 mm" color="#999999"/><hh:topBorder type="NONE" width="0.1 mm" color="#999999"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#999999"/><hh:diagonal type="NONE" width="0.1 mm" color="#999999"/><hc:fillBrush><hc:winBrush faceColor="#8C8C8C" hatchColor="#FF000000" alpha="0"/></hc:fillBrush></hh:borderFill>`
  }

  function blocksToHwpxXml(blocks) {
    const output = []
    const sectionHeadingIndexes = blocks
      .map((block, index) => isSectionDividerHeadingBlock(block) ? index : -1)
      .filter(index => index >= 0)
    const lastSectionHeadingIndex = sectionHeadingIndexes[sectionHeadingIndexes.length - 1] ?? -1

    blocks.forEach((block, index) => {
      if (block.type === 'table') {
        output.push(tableToHwpxXml(block, index))
        return
      }
      if (block.type === 'box') {
        output.push(boxToHwpxXml(block, index))
        return
      }
      if (block.type === 'hr') {
        output.push(separatorXml(index))
        return
      }
      const tag = block.tag || 'p'
      const { paraPr, charPr } = paragraphStyleForBlock(block)
      const lines = splitTextLines(block.text)
      const paragraph = lines.length <= 1
        ? paragraphXml(block.text || '', paraPr, charPr)
        : lines.map(line => paragraphXml(line, paraPr, charPr)).join('')
      const isDividerHeading = isSectionDividerHeadingBlock(block)
      output.push(paragraph)
      if (isDividerHeading && index !== lastSectionHeadingIndex) {
        output.push(separatorXml(index, { compact: true }))
      }
    })

    return output.join('')
  }

  function paragraphStyleForBlock(block) {
    const tag = block.tag || 'p'
    const className = String(block.className || '')
    const isMainTitle = tag === 'h1' || hasClassToken(className, 'notice-title') || hasClassToken(className, 'gong-header')
    const isSubTitle = isTemplateSubtitleBlock(block)
    const isSectionHeading = isSectionHeadingBlock(block)
    const charPr = isMainTitle ? HWPX_STYLE.char.title
      : isSectionHeading ? (tag === 'h3' ? HWPX_STYLE.char.heading3 : HWPX_STYLE.char.heading2)
      : block.meta || isSubTitle ? HWPX_STYLE.char.meta
      : block.bold ? HWPX_STYLE.char.boldBody
      : HWPX_STYLE.char.body
    const paraPr = isMainTitle || isSubTitle ? HWPX_STYLE.para.title
      : block.align === 'right' ? HWPX_STYLE.para.right
      : isSectionHeading ? HWPX_STYLE.para.heading
      : tag === 'li' ? HWPX_STYLE.para.list
      : HWPX_STYLE.para.body
    return { paraPr, charPr }
  }

  function isSectionHeadingBlock(block) {
    const tag = block.tag || 'p'
    if (tag === 'h2' || tag === 'h3') return true
    if (tag === 'li') return false
    return isTemplateHeadingText(block.text)
  }

  function isSectionDividerHeadingBlock(block) {
    const tag = block.tag || 'p'
    if (tag === 'h2') return true
    if (tag === 'li' || tag === 'h3') return false
    return isTemplateHeadingText(block.text)
  }

  function isTemplateSubtitleBlock(block) {
    const className = String(block.className || '')
    if (hasClassToken(className, 'notice-sub')) return true
    if (hasClassToken(className, 'center') && hasClassToken(className, 'meta')) return true
    if (hasClassToken(className, 'center') && hasClassToken(className, 'bold') && normalizeStyleHintText(block.text).length <= 80) return true
    if (!block.meta || block.align !== 'center') return false
    return isLikelyDocumentSubtitleText(block.text)
  }

  function hasClassToken(className, token) {
    return String(className || '').split(/\s+/).includes(token)
  }

  function isLikelyDocumentSubtitleText(text) {
    const value = normalizeStyleHintText(text)
    return value.length <= 140
      && /(제안일|제안부서|제안자|작성일|작성부서|작성자|보고일자|보고부서|보고자|부제목|슬로건)/.test(value)
  }

  function paragraphXml(text, paraPrIDRef = HWPX_STYLE.para.body, charPrIDRef = HWPX_STYLE.char.body) {
    return `<hp:p paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPrIDRef}"><hp:t>${escapeXml(text)}</hp:t></hp:run></hp:p>`
  }

  function separatorXml(index, options = {}) {
    const width = 42520
    const height = options.compact ? 140 : 220
    const bottomMargin = options.compact ? 420 : 850
    const tableId = 3000 + Number(index || 0)
    return `<hp:p paraPrIDRef="${HWPX_STYLE.para.body}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${HWPX_STYLE.char.body}"><hp:tbl id="${tableId}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="${HWPX_STYLE.border.separator}" noAdjust="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="${bottomMargin}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${HWPX_STYLE.border.separator}"><hp:subList textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="${width}" textHeight="${height}" hasTextRef="0" hasNumRef="0">${paragraphXml(' ', HWPX_STYLE.para.body, HWPX_STYLE.char.body)}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`
  }

  function tableToHwpxXml(block, index) {
    const rows = block.rows || []
    if (!rows.length) return ''
    const tableParaPr = block.align === 'right'
      ? HWPX_STYLE.para.right
      : block.align === 'center' ? HWPX_STYLE.para.title : HWPX_STYLE.para.body
    return `<hp:p paraPrIDRef="${tableParaPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${HWPX_STYLE.char.body}">${tableElementHwpxXml(block, 1000 + index)}</hp:run></hp:p>`
  }

  function tableElementHwpxXml(block, tableId) {
    const rows = block.rows || []
    if (!rows.length) return ''
    const layout = buildTableLayout(rows)
    const colCnt = layout.colCnt
    const tableWidth = resolveHwpxTableWidth(block)
    const colWidths = resolveTableColumnWidths(rows, colCnt, tableWidth, block)
    const baseRowHeight = block.variant === 'sign' ? 1350 : 1550
    const rowHeights = tableRowHeights(rows, baseRowHeight)
    const horzAlign = block.align === 'right' || block.variant === 'sign' ? 'RIGHT' : block.align === 'center' ? 'CENTER' : 'LEFT'
    let tableRows = ''
    layout.rows.forEach((layoutRow, rowIndex) => {
      const row = rows[rowIndex] || []
      const cells = layoutRow.map(({ cell, colAddr, colspan, rowspan }) => {
        const width = Math.max(1800, sumColumnWidths(colWidths, colAddr, colspan))
        const height = spannedRowHeight(rowHeights, rowIndex, rowspan)
        const cellStyle = tableCellStyle(cell, row)
        const isHeader = cellStyle.highlight
        const borderFill = isHeader
          ? HWPX_STYLE.border.tableHeader
          : HWPX_STYLE.border.tableBody
        const paraPr = cell.align === 'right'
          ? HWPX_STYLE.para.tableRight
          : (cell.align === 'center' || isHeader ? HWPX_STYLE.para.tableCenter : HWPX_STYLE.para.tableLeft)
        const charPr = block.variant === 'sign'
          ? HWPX_STYLE.char.tableSmall
          : isHeader || cell.bold ? HWPX_STYLE.char.tableHeader : HWPX_STYLE.char.tableBody
        const cellParas = cellParagraphsXml(cell, paraPr, charPr)
        const margin = block.variant === 'sign'
          ? { left: 160, right: 160, top: 120, bottom: 120 }
          : { left: 500, right: 500, top: 180, bottom: 180 }
        return `<hp:tc name="" header="${cellStyle.structuralHeader ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${borderFill}"><hp:subList textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="${Math.max(1, width - margin.left - margin.right)}" textHeight="${Math.max(1, height - margin.top - margin.bottom)}" hasTextRef="0" hasNumRef="0">${cellParas}</hp:subList><hp:cellAddr colAddr="${colAddr}" rowAddr="${rowIndex}"/><hp:cellSpan colSpan="${colspan}" rowSpan="${rowspan}"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="${margin.left}" right="${margin.right}" top="${margin.top}" bottom="${margin.bottom}"/></hp:tc>`
      }).join('')
      tableRows += `<hp:tr>${cells}</hp:tr>`
    })
    const height = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0)
    return `<hp:tbl id="${escapeXmlAttr(tableId)}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="${hasHeaderRow(rows) ? 1 : 0}" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${HWPX_STYLE.border.tableBody}" noAdjust="0"><hp:sz width="${tableWidth}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${horzAlign}" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="850"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${tableRows}</hp:tbl>`
  }

  function resolveTableColumnWidths(rows, colCnt, tableWidth, block = {}) {
    const explicitPercents = Array(colCnt).fill(null)
    if (Array.isArray(block.columnPercents)) {
      block.columnPercents.slice(0, colCnt).forEach((width, index) => {
        if (width) explicitPercents[index] = width
      })
    }

    for (const layoutRow of buildTableLayout(rows).rows) {
      for (const { cell, colAddr, colspan } of layoutRow) {
        if (!cell.widthPercent) continue
        if (colspan === 1) {
          explicitPercents[colAddr] = cell.widthPercent
          continue
        }
        const perColumn = cell.widthPercent / colspan
        for (let offset = 0; offset < colspan; offset += 1) {
          if (!explicitPercents[colAddr + offset]) explicitPercents[colAddr + offset] = perColumn
        }
      }
    }
    const explicitTotal = explicitPercents.reduce((sum, width) => sum + (width || 0), 0)
    const emptyCount = explicitPercents.filter(width => !width).length
    const inferredPercents = explicitTotal === 0 ? inferTableColumnPercents(rows, colCnt) : null
    const fallbackPercent = emptyCount ? Math.max(1, 100 - Math.min(95, explicitTotal)) / emptyCount : 0
    const percents = explicitPercents.map((width, index) => width || inferredPercents?.[index] || fallbackPercent)
    const total = percents.reduce((sum, width) => sum + width, 0) || 100
    const raw = percents.map(width => Math.max(1600, Math.floor(tableWidth * width / total)))
    const diff = tableWidth - raw.reduce((sum, width) => sum + width, 0)
    raw[raw.length - 1] = Math.max(1600, raw[raw.length - 1] + diff)
    return raw
  }

  function inferTableColumnPercents(rows, colCnt) {
    if (colCnt === 4 && rows.some(row => isLikelyTableLabel(row[0]?.text) && isLikelyTableLabel(row[2]?.text))) {
      return [18, 32, 18, 32]
    }
    if (colCnt === 2 && rows.some(row => isLikelyTableLabel(row[0]?.text))) {
      return [24, 76]
    }
    if (colCnt === 5 && rows.some(row => /^No\.?$/i.test(String(row[0]?.text || '').trim()))) {
      return [10, 40, 18, 16, 16]
    }
    if (colCnt === 6 && rows.some(row => String(row[0]?.text || '').includes('추진사항'))) {
      return [28, 12, 12, 12, 12, 24]
    }
    return null
  }

  function sumColumnWidths(widths, start, span) {
    return widths.slice(start, start + span).reduce((sum, width) => sum + width, 0)
  }

  function tableRowHeights(rows, baseHeight) {
    return rows.map(row => tableRowHeight(row, baseHeight))
  }

  function spannedRowHeight(rowHeights, rowIndex, rowspan) {
    return rowHeights
      .slice(rowIndex, rowIndex + Math.max(1, rowspan || 1))
      .reduce((sum, height) => sum + height, 0)
  }

  function tableRowHeight(row, baseHeight) {
    const maxLines = Math.max(1, ...row.map(cell => (cell.lines?.length || splitTextLines(cell.text).length || 1)))
    return Math.max(baseHeight, baseHeight + (maxLines - 1) * 850)
  }

  function hasHeaderRow(rows) {
    return rows.some(row => classifyTableRow(row) === 'header')
  }

  function boxToHwpxXml(block, index) {
    const width = 42520
    const lines = splitTextLines(block.text)
    const paras = (lines.length ? lines : ['']).map((line, i) =>
      paragraphXml(
        line,
        block.align === 'center' ? HWPX_STYLE.para.title : block.align === 'right' ? HWPX_STYLE.para.right : HWPX_STYLE.para.body,
        i === 0 ? HWPX_STYLE.char.boldBody : HWPX_STYLE.char.body
      )
    ).join('')
    const height = Math.max(1700, Math.max(1, lines.length) * 1300)
    return `<hp:p paraPrIDRef="${HWPX_STYLE.para.body}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${HWPX_STYLE.char.body}"><hp:tbl id="${2000 + index}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="${HWPX_STYLE.border.noteBox}" noAdjust="0"><hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="1417"/><hp:inMargin left="510" right="510" top="141" bottom="141"/><hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${HWPX_STYLE.border.noteBox}"><hp:subList textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="${width - 720}" textHeight="0" hasTextRef="0" hasNumRef="0">${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`
  }

  function cellParagraphsXml(cell, paraPr, charPr) {
    const lines = cell.lines?.length ? cell.lines : splitTextLines(cell.text)
    if (!lines.length) return paragraphXml('', paraPr, charPr)
    return lines.map(line => paragraphXml(line, paraPr, charPr)).join('')
  }

  function escapeXml(value) {
    return String(value || '')
      .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  function stripTags(s) {
    return String(s)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  // HTML → PDF 내보내기 (숨겨진 BrowserWindow 사용)
  ipcMain.handle('document:export-pdf', async (_event, { html, fileName }) => {
    const { BrowserWindow: BW } = require('electron')
    const tmpPath = path.join(os.tmpdir(), 'tidy-doc-' + Date.now() + '.html')
    let hiddenWin = null
    try {
      fs.writeFileSync(tmpPath, html)
      const win = getWindow()
      const baseName = (fileName || '문서').replace(/\.[^.]+$/, '')
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: baseName + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return { success: false }

      hiddenWin = new BW({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
      await hiddenWin.loadFile(tmpPath)
      const pdfData = await hiddenWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      fs.writeFileSync(filePath, pdfData)
      return { success: true, filePath }
    } catch (e) {
      throw new Error('PDF 내보내기 실패: ' + e.message)
    } finally {
      try { hiddenWin?.close() } catch {}
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  })

} // end setupIpcHandlers

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
  }

  // 일반 텍스트/문서 파일
  const extracted = await extractText(filePath)
  const rawText = typeof extracted === 'string' ? extracted : String(extracted)
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
