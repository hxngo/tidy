const fs = require('fs')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')
const store = require('../store')

// SQLite 인덱스 (lazy — initDb() 호출 전엔 null)
function getIndex() {
  try { return require('./db') } catch { return null }
}

function getVaultPath() {
  return store.get('vaultPath') || path.join(os.homedir(), 'tidy-vault')
}

// 시스템 폴더 (아이템 MD 파일이 없는 폴더 — 스캔 제외)
const SYSTEM_DIRS = new Set([
  'tasks', 'people', 'projects', 'channels',
  '.trash', '.obsidian', '.DS_Store', 'urgent',
])

const CATEGORY_ICONS = {
  '업무': '💼',
  '미팅': '📅',
  '여행': '✈️',
  '운영': '📋',
  '정보': '📌',
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// vault 폴더 구조 초기화 (시스템 폴더만 생성, 콘텐츠 폴더는 AI가 동적 생성)
function initVault() {
  const vaultPath = getVaultPath()
  const dirs = [
    vaultPath,
    path.join(vaultPath, 'urgent'),
    path.join(vaultPath, 'tasks', 'active'),
    path.join(vaultPath, 'tasks', 'archive'),
    path.join(vaultPath, 'people'),
    path.join(vaultPath, 'projects'),
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
  console.log('[Vault] 초기화 완료:', vaultPath)
  return vaultPath
}

// ─── Frontmatter 파싱/직렬화 ─────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(': ')
    if (colonIdx === -1) continue
    const k = line.slice(0, colonIdx).trim()
    const v = line.slice(colonIdx + 2).trim()
    if (k) meta[k] = v
  }
  return { meta, body: match[2] }
}

function serializeFrontmatter(meta, body) {
  const lines = []
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) {
      lines.push(`${k}:`)
    } else if (typeof v === 'object') {
      lines.push(`${k}: ${JSON.stringify(v)}`)
    } else {
      lines.push(`${k}: ${v}`)
    }
  }
  return `---\n${lines.join('\n')}\n---\n${body}`
}

function updateFrontmatterField(filePath, key, value) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  meta[key] = value
  if (meta.updated_at !== undefined) meta.updated_at = new Date().toISOString()
  fs.writeFileSync(filePath, serializeFrontmatter(meta, body), 'utf-8')
}

// ─── Item 경로 라우팅 ─────────────────────────────────────────

// 소스 → 한국어/표준 플랫폼 폴더명
function getPlatformName(source = '', bundleId = '') {
  const src = source.toLowerCase()
  const bid = (bundleId || '').toLowerCase()
  if (src === 'gmail'    || bid.includes('gmail'))   return 'Gmail'
  if (src === 'slack'    || bid.includes('slack'))   return 'Slack'
  if (src.includes('kakao') || bid.includes('kakao')) return '카카오톡'
  if (src === 'imessage' || bid.includes('imessage') || bid === 'com.apple.mobilesms') return 'iMessage'
  if (src === 'file' || src === 'manual')            return '파일'
  if (src === 'meeting')                             return '회의록'
  if (src === 'gdrive'   || bid.includes('gdrive'))  return 'Google Drive'
  if (src.includes('telegram') || bid.includes('telegram')) return 'Telegram'
  if (src.includes('line') || bid.includes('line'))  return 'LINE'
  // 알 수 없는 앱: 번들 ID 마지막 세그먼트를 폴더명으로 사용
  const name = source.split('.').pop() || source
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function safeName(name) {
  return (name || '').replace(/[/\\:*?"<>|]/g, '_').trim() || '_'
}

// 구조: {vault}/{플랫폼}/{발신자}/YYYY-MM-DD-{id}.md
// 발신자가 없으면: {vault}/{플랫폼}/YYYY-MM-DD-{id}.md
// urgent는 {vault}/urgent/ 에 별도 보관 (빠른 접근용)
function routeItemPath(item) {
  const vaultPath = getVaultPath()
  const datePrefix = new Date(item.received_at || item.created_at).toISOString().slice(0, 10)

  // 긴급 항목도 플랫폼 폴더 하위에 저장 (urgent 폴더로 분산되지 않도록)
  // 플랫폼 폴더 (부모 노드) — bundleId까지 활용해 정확히 매칭
  const platform = safeName(getPlatformName(item.source, item.bundleId))

  // 발신자 서브폴더 (자식 노드) — people 배열의 첫 번째 인물 또는 notifSender
  const people = Array.isArray(item.people) ? item.people : JSON.parse(item.people || '[]')
  const senderName = people[0] || item.notifSender || null
  const sender = senderName ? safeName(senderName) : null

  const dir = sender
    ? path.join(vaultPath, platform, sender)
    : path.join(vaultPath, platform)
  ensureDir(dir)
  const filePath = path.join(dir, `${datePrefix}-${item.id}.md`)
  console.log(`[Vault] 경로 결정: ${path.relative(vaultPath, filePath)} (source=${item.source}, bundle=${item.bundleId || '-'})`)
  return filePath
}

// ─── MD 본문 템플릿 ───────────────────────────────────────────

function buildItemBody(item, people, actionItems) {
  const category = item.category || '정보'
  const icon = item.priority === 'high' ? '🚨' : (CATEGORY_ICONS[category] || '📄')
  const title = item.summary?.slice(0, 60) || '새 항목'

  const peopleLinks = people.map(p => `[[${p}]]`).join(', ')
  const projectLink = item.project_id ? `[[projects/${item.project_id}]]` : ''
  const actionLines = actionItems.length > 0
    ? actionItems.map(a => `- [ ] ${a}`).join('\n')
    : '(없음)'
  const sourceLabel = item.source ? ` \`${item.source}\`` : ''

  // 카테고리별 특수 섹션 (이벤트 정보가 있을 때)
  let specificSection = ''
  const hint = item.event_hint
  if (hint?.has_event) {
    if (category === '미팅') {
      const attendees = peopleLinks || '(미정)'
      specificSection = [
        '',
        '## 일정',
        `- 날짜: ${hint.event_date || '(미정)'}`,
        `- 시간: ${hint.event_time || '(미정)'}`,
        hint.location ? `- 장소: ${hint.location}` : '',
        `- 참석자: ${attendees}`,
        '',
      ].filter(l => l !== null).join('\n')
    } else if (category === '여행') {
      const duration = hint.duration_minutes ? `${hint.duration_minutes}분` : ''
      specificSection = [
        '',
        '## 여행 정보',
        `- 편명/일정: ${hint.event_title || '(미정)'}`,
        `- 날짜: ${hint.event_date || '(미정)'}`,
        `- 시간: ${hint.event_time || '(미정)'}`,
        duration ? `- 소요: ${duration}` : '',
        '',
      ].filter(l => l !== null).join('\n')
    }
  }

  const relatedLines = []
  if (peopleLinks) relatedLines.push(`인물: ${peopleLinks}`)
  if (projectLink) relatedLines.push(`프로젝트: ${projectLink}`)
  const relatedSection = relatedLines.length > 0
    ? `\n## 관련\n${relatedLines.join('\n')}\n`
    : ''

  return [
    `# ${icon} ${title}`,
    '',
    '## 요약',
    item.summary || '',
    specificSection,
    '## 액션 아이템',
    actionLines,
    relatedSection,
    `## 원본${sourceLabel}`,
    item.raw_text || '',
    '',
  ].join('\n')
}

// ─── Items ────────────────────────────────────────────────────

function insertItem(item) {
  const people = Array.isArray(item.people) ? item.people : JSON.parse(item.people || '[]')
  const actionItems = Array.isArray(item.action_items)
    ? item.action_items
    : JSON.parse(item.action_items || '[]')

  const tags = [item.category].filter(Boolean)
  if (item.project_id) tags.push(item.project_id)
  const hint = item.event_hint || {}

  const meta = {
    id: item.id,
    source: item.source || 'file',
    category: item.category || '정보',
    tags: JSON.stringify(tags),
    people: JSON.stringify(people),
    project: item.project_id || null,
    priority: item.priority || 'medium',
    status: item.status || 'new',
    received_at: item.received_at || item.created_at,
  }
  if (hint.has_event && hint.event_date) meta.event_date = hint.event_date
  if (hint.has_event && hint.event_time) meta.event_time = hint.event_time

  const body = buildItemBody(item, people, actionItems)
  const filePath = routeItemPath(item)
  fs.writeFileSync(filePath, serializeFrontmatter(meta, body), 'utf-8')
  console.log(`[Vault] 아이템 저장: ${path.relative(getVaultPath(), filePath)}`)

  // SQLite 인덱스 동기화
  try {
    getIndex()?.insertItem({ ...item, people, action_items: actionItems, file_path: filePath })
  } catch (e) { console.error('[Vault] index insertItem 오류:', e.message) }

  return { ...item, _filePath: filePath }
}

// 재귀적으로 MD 파일 경로 수집 (숨김 폴더 및 .trash 제외)
function collectMdFiles(dir, result) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // 숨김 폴더(.으로 시작) 및 .trash 계열 제외
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectMdFiles(fullPath, result)
    } else if (entry.name.endsWith('.md')) {
      result.push(fullPath)
    }
  }
}

function getAllItemFiles() {
  const vaultPath = getVaultPath()
  if (!fs.existsSync(vaultPath)) return []
  const files = []
  // vault 루트의 모든 디렉토리 스캔 (시스템 폴더 제외)
  for (const entry of fs.readdirSync(vaultPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (SYSTEM_DIRS.has(entry.name)) continue
    collectMdFiles(path.join(vaultPath, entry.name), files)
  }
  return files
}

function getItems({ limit = 50, offset = 0 } = {}) {
  // SQLite 인덱스 우선 사용
  try {
    const idx = getIndex()
    if (idx) return idx.getItems({ limit, offset })
  } catch (e) { console.error('[Vault] index getItems 오류:', e.message) }
  // fallback: 파일 스캔
  return _getItemsFromFiles({ limit, offset })
}

function _getItemsFromFiles({ limit = 50, offset = 0 } = {}) {
  const allFiles = getAllItemFiles()
  allFiles.sort((a, b) => path.basename(b).localeCompare(path.basename(a)))
  const sliced = allFiles.slice(offset, offset + limit)
  return sliced.map(_readItemFile).filter(Boolean)
}

function _readItemFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { meta, body } = parseFrontmatter(content)
    const summaryMatch = body.match(/## 요약\n([\s\S]*?)(?=\n\n## |\n## |$)/) ||
                         body.match(/## 요약\n([\s\S]*)$/)
    const rawMatch = body.match(/## 원본(?:\s*`[^`]*`)?\n([\s\S]*)$/)
    const actionMatch = body.match(/## 액션 아이템\n([\s\S]*?)(?=\n\n## |\n## |$)/) ||
                        body.match(/## 액션 아이템\n([\s\S]*)$/)
    const actionLines = actionMatch ? actionMatch[1].trim().split('\n') : []
    const actionItems = actionLines
      .filter(l => l.startsWith('- [ ] ') || l.startsWith('- [x] '))
      .map(l => l.replace(/^- \[.\] /, '').trim())
    return {
      id: meta.id || path.basename(filePath, '.md'),
      source: meta.source || 'file',
      category: meta.category || '정보',
      people: JSON.parse(meta.people || '[]'),
      action_items: actionItems,
      project_id: meta.project === 'null' || !meta.project ? null : meta.project,
      priority: meta.priority || 'medium',
      status: meta.status || 'new',
      received_at: meta.received_at || null,
      created_at: meta.received_at || null,
      summary: summaryMatch ? summaryMatch[1].trim() : '',
      raw_text: rawMatch ? rawMatch[1].trim() : '',
      _filePath: filePath,
    }
  } catch (e) {
    console.error('[Vault] item 읽기 오류:', filePath, e.message)
    return null
  }
}

function updateItemStatus(id, status) {
  // SQLite로 file_path 즉시 조회 → O(1)
  try {
    const idx = getIndex()
    if (idx) {
      const item = idx.getItemById(id)
      if (item?._filePath && fs.existsSync(item._filePath)) {
        updateFrontmatterField(item._filePath, 'status', status)
        idx.updateItemStatus(id, status)
        return
      }
    }
  } catch (e) { console.error('[Vault] index updateItemStatus 오류:', e.message) }
  // fallback: 파일 스캔
  for (const filePath of getAllItemFiles()) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const { meta } = parseFrontmatter(content)
      if (meta.id === id) {
        updateFrontmatterField(filePath, 'status', status)
        try { getIndex()?.updateItemStatus(id, status) } catch {}
        return
      }
    } catch {}
  }
}

function deleteItem(id) {
  try {
    const idx = getIndex()
    if (idx) {
      const item = idx.getItemById(id)
      if (item?._filePath && fs.existsSync(item._filePath)) {
        fs.unlinkSync(item._filePath)
        idx.deleteItemById(id)
        console.log('[Vault] 아이템 삭제 (index):', id)
        return true
      }
    }
  } catch (e) { console.error('[Vault] index deleteItem 오류:', e.message) }
  for (const filePath of getAllItemFiles()) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const { meta } = parseFrontmatter(content)
      if (meta.id === id) {
        fs.unlinkSync(filePath)
        try { getIndex()?.deleteItemById(id) } catch {}
        console.log('[Vault] 아이템 삭제:', filePath)
        return true
      }
    } catch {}
  }
  return false
}

// ─── Trash ────────────────────────────────────────────────────

function getTrashDir() {
  return path.join(getVaultPath(), '.trash')
}

function trashItem(id) {
  // SQLite로 file_path 조회
  let targetFile = null
  let targetMeta = null
  let targetBody = null
  try {
    const idx = getIndex()
    if (idx) {
      const item = idx.getItemById(id)
      if (item?._filePath && fs.existsSync(item._filePath)) {
        const content = fs.readFileSync(item._filePath, 'utf-8')
        const parsed = parseFrontmatter(content)
        if (parsed.meta.id === id) {
          targetFile = item._filePath
          targetMeta = parsed.meta
          targetBody = parsed.body
        }
      }
    }
  } catch {}

  const filesToSearch = targetFile ? [] : getAllItemFiles()

  const doTrash = (filePath, meta, body) => {
    const trashDir = getTrashDir()
    ensureDir(trashDir)
    meta.trashed_at = new Date().toISOString()
    meta.original_path = filePath
    fs.writeFileSync(path.join(trashDir, `${id}.md`), serializeFrontmatter(meta, body), 'utf-8')
    fs.unlinkSync(filePath)
    try { getIndex()?.deleteItemById(id) } catch {}
    console.log('[Vault] 휴지통 이동:', id)
    return true
  }

  if (targetFile) return doTrash(targetFile, targetMeta, targetBody)

  for (const filePath of filesToSearch) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const { meta, body } = parseFrontmatter(content)
      if (meta.id !== id) continue
      const trashDir = getTrashDir()
      ensureDir(trashDir)
      meta.trashed_at = new Date().toISOString()
      meta.original_path = filePath
      fs.writeFileSync(path.join(trashDir, `${id}.md`), serializeFrontmatter(meta, body), 'utf-8')
      fs.unlinkSync(filePath)
      try { getIndex()?.deleteItemById(id) } catch {}
      console.log('[Vault] 휴지통 이동:', id)
      return true
    } catch {}
  }
  return false
}

function getTrashItems() {
  const trashDir = getTrashDir()
  if (!fs.existsSync(trashDir)) return []
  const results = []
  for (const file of fs.readdirSync(trashDir).filter(f => f.endsWith('.md'))) {
    try {
      const content = fs.readFileSync(path.join(trashDir, file), 'utf-8')
      const { meta, body } = parseFrontmatter(content)
      const summaryMatch = body.match(/## 요약\n([\s\S]*?)(?=\n\n## |\n## |$)/)
      const rawMatch = body.match(/## 원본(?:\s*`[^`]*`)?\n([\s\S]*)$/)
      const actionMatch = body.match(/## 액션 아이템\n([\s\S]*?)(?=\n\n## |\n## |$)/)
      const actionLines = actionMatch ? actionMatch[1].trim().split('\n') : []
      const actionItems = actionLines
        .filter(l => l.startsWith('- [ ] ') || l.startsWith('- [x] '))
        .map(l => l.replace(/^- \[.\] /, '').trim())
      results.push({
        id: meta.id || file.replace('.md', ''),
        source: meta.source || 'file',
        category: meta.category || '정보',
        people: JSON.parse(meta.people || '[]'),
        action_items: actionItems,
        priority: meta.priority || 'medium',
        status: meta.status || 'new',
        received_at: meta.received_at || null,
        trashed_at: meta.trashed_at || null,
        summary: summaryMatch ? summaryMatch[1].trim() : '',
        raw_text: rawMatch ? rawMatch[1].trim() : '',
      })
    } catch (e) {
      console.error('[Vault] trash 읽기 오류:', file, e.message)
    }
  }
  results.sort((a, b) => new Date(b.trashed_at) - new Date(a.trashed_at))
  return results
}

function restoreTrashItem(id) {
  const trashDir = getTrashDir()
  const trashFile = path.join(trashDir, `${id}.md`)
  if (!fs.existsSync(trashFile)) return false
  try {
    const content = fs.readFileSync(trashFile, 'utf-8')
    const { meta, body } = parseFrontmatter(content)
    const originalPath = meta.original_path
    delete meta.trashed_at
    delete meta.original_path
    if (originalPath) {
      ensureDir(path.dirname(originalPath))
      fs.writeFileSync(originalPath, serializeFrontmatter(meta, body), 'utf-8')
    } else {
      // 원본 경로 없으면 item 정보로 재라우팅
      const item = {
        id: meta.id,
        source: meta.source,
        received_at: meta.received_at,
        people: JSON.parse(meta.people || '[]'),
        notifSender: null,
      }
      const newPath = routeItemPath(item)
      fs.writeFileSync(newPath, serializeFrontmatter(meta, body), 'utf-8')
    }
    fs.unlinkSync(trashFile)
    console.log('[Vault] 휴지통 복구:', id)
    return true
  } catch (e) {
    console.error('[Vault] 복구 오류:', e.message)
    return false
  }
}

function deleteTrashItem(id) {
  const trashFile = path.join(getTrashDir(), `${id}.md`)
  if (!fs.existsSync(trashFile)) return false
  fs.unlinkSync(trashFile)
  console.log('[Vault] 영구 삭제:', id)
  return true
}

// ─── Tasks ────────────────────────────────────────────────────

function taskFilePath(id, isArchive = false) {
  const vaultPath = getVaultPath()
  const subDir = isArchive
    ? path.join(vaultPath, 'tasks', 'archive')
    : path.join(vaultPath, 'tasks', 'active')
  return path.join(subDir, `${id}.md`)
}

function insertTask(task) {
  const meta = {
    id: task.id,
    item_id: task.item_id || null,
    person: task.person || null,
    due_date: task.due_date || null,
    memo: task.memo || null,
    status: task.status || 'active',
    created_at: task.created_at,
    updated_at: task.updated_at,
  }
  const body = `# ${task.title}\n`
  const filePath = taskFilePath(task.id, false)
  fs.writeFileSync(filePath, serializeFrontmatter(meta, body), 'utf-8')
  try { getIndex()?.insertTask({ ...task, file_path: filePath }) } catch (e) { console.error('[Vault] index insertTask 오류:', e.message) }
  return task
}

function readTaskFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  const titleMatch = body.match(/^# (.+)$/m)
  return {
    id: meta.id || path.basename(filePath, '.md'),
    item_id: meta.item_id === 'null' || !meta.item_id ? null : meta.item_id,
    person: meta.person === 'null' || !meta.person ? null : meta.person,
    due_date: meta.due_date === 'null' || !meta.due_date ? null : meta.due_date,
    memo: meta.memo === 'null' || !meta.memo ? null : meta.memo,
    status: meta.status || 'active',
    created_at: meta.created_at || null,
    updated_at: meta.updated_at || null,
    title: titleMatch ? titleMatch[1].trim() : '',
  }
}

function getTasks({ status = null } = {}) {
  // SQLite 인덱스 우선 사용
  try {
    const idx = getIndex()
    if (idx) return idx.getTasks({ status })
  } catch (e) { console.error('[Vault] index getTasks 오류:', e.message) }
  // fallback: 파일 스캔
  return _getTasksFromFiles({ status })
}

function _getTasksFromFiles({ status = null } = {}) {
  const vaultPath = getVaultPath()
  const activeDir = path.join(vaultPath, 'tasks', 'active')
  const archiveDir = path.join(vaultPath, 'tasks', 'archive')
  const results = []
  for (const dir of [activeDir, archiveDir]) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      try { results.push(readTaskFile(path.join(dir, file))) } catch {}
    }
  }
  results.sort((a, b) => (new Date(b.created_at) - new Date(a.created_at)))
  return status ? results.filter(t => t.status === status) : results
}

function updateTaskStatus(id, status) {
  const vaultPath = getVaultPath()
  const activeFile = taskFilePath(id, false)
  const archiveFile = taskFilePath(id, true)
  const goesToArchive = status === 'done' || status === 'trashed'

  // 완전 삭제
  if (status === 'deleted') {
    if (fs.existsSync(activeFile)) fs.unlinkSync(activeFile)
    if (fs.existsSync(archiveFile)) fs.unlinkSync(archiveFile)
    return
  }

  if (goesToArchive) {
    if (fs.existsSync(activeFile)) {
      const content = fs.readFileSync(activeFile, 'utf-8')
      const { meta, body } = parseFrontmatter(content)
      meta.status = status
      meta.updated_at = new Date().toISOString()
      fs.writeFileSync(archiveFile, serializeFrontmatter(meta, body), 'utf-8')
      fs.unlinkSync(activeFile)
    } else if (fs.existsSync(archiveFile)) {
      updateFrontmatterField(archiveFile, 'status', status)
    }
  } else {
    // active 복구
    if (fs.existsSync(archiveFile)) {
      const content = fs.readFileSync(archiveFile, 'utf-8')
      const { meta, body } = parseFrontmatter(content)
      meta.status = status
      meta.updated_at = new Date().toISOString()
      fs.writeFileSync(activeFile, serializeFrontmatter(meta, body), 'utf-8')
      fs.unlinkSync(archiveFile)
    } else if (fs.existsSync(activeFile)) {
      updateFrontmatterField(activeFile, 'status', status)
    }
  }
  try { getIndex()?.updateTaskStatus(id, status) } catch (e) { console.error('[Vault] index updateTaskStatus 오류:', e.message) }
}

// 태스크 필드 업데이트 (title, due_date, memo, person)
function updateTaskFields(id, fields) {
  const activeFile = taskFilePath(id, false)
  const archiveFile = taskFilePath(id, true)
  const file = fs.existsSync(activeFile) ? activeFile : fs.existsSync(archiveFile) ? archiveFile : null
  if (!file) return false
  const content = fs.readFileSync(file, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  if (fields.title !== undefined) meta.title = fields.title
  if (fields.due_date !== undefined) meta.due_date = fields.due_date || null
  if (fields.memo !== undefined) meta.memo = fields.memo || null
  if (fields.person !== undefined) meta.person = fields.person || null
  meta.updated_at = new Date().toISOString()
  let newBody = body
  if (fields.title !== undefined) newBody = body.replace(/^# .+/m, `# ${fields.title}`)
  fs.writeFileSync(file, serializeFrontmatter(meta, newBody), 'utf-8')
  try { getIndex()?.updateTaskFields(id, fields) } catch (e) { console.error('[Vault] index updateTaskFields 오류:', e.message) }
  return true
}

// ─── People ───────────────────────────────────────────────────

function personFilePath(name) {
  const vaultPath = getVaultPath()
  const safeName = name.replace(/[/\\:*?"<>|]/g, '_')
  return path.join(vaultPath, 'people', `${safeName}.md`)
}

function upsertPerson(person) {
  const filePath = personFilePath(person.name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  let existingId = person.id
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { meta } = parseFrontmatter(content)
    existingId = meta.id || existingId
  }
  if (!existingId) existingId = require('crypto').randomUUID()
  const meta = {
    id: existingId,
    name: person.name,
    org: person.org || null,
    role: person.role || null,
    email: person.email || null,
    created_at: person.created_at || new Date().toISOString(),
  }
  const body = `# ${person.name}\n`
  fs.writeFileSync(filePath, serializeFrontmatter(meta, body), 'utf-8')
  try { getIndex()?.upsertPerson({ ...meta }) } catch (e) { console.error('[Vault] index upsertPerson 오류:', e.message) }
  return { ...person, id: existingId }
}

function deletePerson(name) {
  const filePath = personFilePath(name)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

function getPeople() {
  const vaultPath = getVaultPath()
  const peopleDir = path.join(vaultPath, 'people')
  if (!fs.existsSync(peopleDir)) return []

  const results = []
  for (const file of fs.readdirSync(peopleDir).filter(f => f.endsWith('.md'))) {
    try {
      const content = fs.readFileSync(path.join(peopleDir, file), 'utf-8')
      const { meta } = parseFrontmatter(content)
      results.push({
        id: meta.id || file.replace('.md', ''),
        name: meta.name || file.replace('.md', ''),
        org: meta.org === 'null' || !meta.org ? null : meta.org,
        role: meta.role === 'null' || !meta.role ? null : meta.role,
        email: meta.email === 'null' || !meta.email ? null : meta.email,
        created_at: meta.created_at || null,
      })
    } catch (e) {
      console.error('[Vault] person 읽기 오류:', file, e.message)
    }
  }
  results.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
  return results
}

// ─── Projects ─────────────────────────────────────────────────

function projectFilePath(name) {
  const vaultPath = getVaultPath()
  const safeName = name.replace(/[/\\:*?"<>|]/g, '_')
  return path.join(vaultPath, 'projects', `${safeName}.md`)
}

function upsertProject(project) {
  const filePath = projectFilePath(project.name)
  if (fs.existsSync(filePath)) return project
  const meta = {
    id: project.id,
    name: project.name,
    status: project.status || 'active',
    created_at: project.created_at,
  }
  fs.writeFileSync(filePath, serializeFrontmatter(meta, `# ${project.name}\n`), 'utf-8')
  return project
}

function getProjectByName(name) {
  const filePath = projectFilePath(name)
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf-8')
  const { meta } = parseFrontmatter(content)
  return {
    id: meta.id || null,
    name: meta.name || name,
    status: meta.status || 'active',
    created_at: meta.created_at || null,
  }
}

function getProjects() {
  const vaultPath = getVaultPath()
  const projectsDir = path.join(vaultPath, 'projects')
  if (!fs.existsSync(projectsDir)) return []

  const results = []
  for (const file of fs.readdirSync(projectsDir).filter(f => f.endsWith('.md'))) {
    try {
      const content = fs.readFileSync(path.join(projectsDir, file), 'utf-8')
      const { meta } = parseFrontmatter(content)
      results.push({
        id: meta.id || file.replace('.md', ''),
        name: meta.name || file.replace('.md', ''),
        status: meta.status || 'active',
        created_at: meta.created_at || null,
      })
    } catch (e) {
      console.error('[Vault] project 읽기 오류:', file, e.message)
    }
  }
  return results
}

// ─── Backlinks ────────────────────────────────────────────────

// 인물 노드에 아이템 참조 추가 (업무 히스토리)
function appendToPersonNote(name, itemRef) {
  const filePath = personFilePath(name)
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  const section = '## 업무 히스토리'
  const updatedBody = body.includes(section)
    ? body + `- ${itemRef}\n`
    : body + `\n${section}\n- ${itemRef}\n`
  fs.writeFileSync(filePath, serializeFrontmatter(meta, updatedBody), 'utf-8')
}

// 프로젝트 노드에 아이템 참조 추가
function appendToProjectNote(name, itemRef) {
  const filePath = projectFilePath(name)
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  const section = '## 관련 아이템'
  const updatedBody = body.includes(section)
    ? body + `- ${itemRef}\n`
    : body + `\n${section}\n- ${itemRef}\n`
  fs.writeFileSync(filePath, serializeFrontmatter(meta, updatedBody), 'utf-8')
}

// ─── Channels (stub) ─────────────────────────────────────────

function upsertChannel(channel) { return channel }
function getChannel(type) { return null }
function updateChannelStatus(type, status, lastSynced = null) { return null }

// ─── Obsidian vault 자동 감지 ────────────────────────────────

// macOS: ~/Library/Application Support/obsidian/obsidian.json 에서 등록된 vault 경로 추출
function detectObsidianVaults() {
  const configPath = path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json')
  if (!fs.existsSync(configPath)) return []
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (!data.vaults) return []
    return Object.values(data.vaults)
      .filter(v => v.path && fs.existsSync(v.path))
      .map(v => ({ path: v.path, name: path.basename(v.path) }))
  } catch {
    return []
  }
}

// ─── 기존 폴더 구조 스캔 ──────────────────────────────────────

// 사용자가 지정한 경로들에서 폴더명 수집 (depth 2까지)
// AI에게 기존 폴더명을 컨텍스트로 제공해 일관성 있는 분류 유도
function getExistingFolderNames(scanPaths = []) {
  const names = new Set()

  function scanDir(dir, depth) {
    if (depth > 2 || !fs.existsSync(dir)) return
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        names.add(entry.name)
        if (depth < 2) scanDir(path.join(dir, entry.name), depth + 1)
      }
    } catch {}
  }

  for (const p of scanPaths) {
    if (p && typeof p === 'string') scanDir(p, 1)
  }

  return [...names].slice(0, 50)
}

// 특정 인물과 관련된 아이템 목록 반환
function getItemsByPerson(name) {
  try {
    const idx = getIndex()
    if (idx) return idx.getItemsByPerson(name)
  } catch (e) { console.error('[Vault] index getItemsByPerson 오류:', e.message) }
  // fallback
  const allFiles = getAllItemFiles()
  allFiles.sort((a, b) => path.basename(b).localeCompare(path.basename(a)))
  const results = []
  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const { meta, body } = parseFrontmatter(content)
      const people = JSON.parse(meta.people || '[]')
      if (!people.includes(name)) continue
      const summaryMatch = body.match(/## 요약\n([\s\S]*?)(?:\n\n##|\n##)/)
      results.push({
        id: meta.id || path.basename(filePath, '.md'),
        source: meta.source || 'file',
        category: meta.category || '정보',
        priority: meta.priority || 'medium',
        status: meta.status || 'new',
        received_at: meta.received_at || null,
        summary: summaryMatch ? summaryMatch[1].trim() : '',
        _filePath: filePath,
      })
    } catch {}
  }
  return results
}

// 전체 텍스트 검색 (인덱스 우선)
function searchItems(q, limit = 30) {
  try {
    const idx = getIndex()
    if (idx) return idx.searchItems(q, limit)
  } catch {}
  return _getItemsFromFiles({ limit: 200 }).filter(i =>
    i.summary?.includes(q) || i.raw_text?.includes(q)
  ).slice(0, limit)
}

// 특정 인물과 관련된 태스크 목록 반환
function getTasksByPerson(name) {
  try {
    const idx = getIndex()
    if (idx) return idx.getTasksByPerson(name)
  } catch {}
  return getTasks().filter(t => t.person === name)
}

// ─── 인덱스 빌드 (앱 시작 시 .md → SQLite) ──────────────────────

function buildIndex() {
  const idx = getIndex()
  if (!idx) return

  const start = Date.now()
  console.log('[Vault] 인덱스 빌드 시작...')

  try {
    // Items
    const mdCount = getAllItemFiles().length
    const dbCount = idx.getItemCount()
    if (mdCount !== dbCount) {
      console.log(`[Vault] 항목 불일치 (md:${mdCount} db:${dbCount}) — 전체 재빌드`)
      idx.clearItems()
      const items = _getItemsFromFiles({ limit: 10000, offset: 0 })
      const rows = items.map(item => ({
        id: item.id,
        file_path: item._filePath,
        source: item.source,
        bundle_id: null,
        notif_sender: null,
        raw_text: item.raw_text || null,
        summary: item.summary || null,
        category: item.category,
        folder: null,
        people: JSON.stringify(item.people || []),
        action_items: JSON.stringify(item.action_items || []),
        project_id: item.project_id,
        event_hint: null,
        priority: item.priority,
        status: item.status,
        received_at: item.received_at,
        created_at: item.created_at,
      }))
      idx.bulkInsertItems(rows)
    }

    // Tasks
    const taskMdCount = _getTasksFromFiles().length
    const taskDbCount = idx.getTaskCount()
    if (taskMdCount !== taskDbCount) {
      console.log(`[Vault] 태스크 불일치 (md:${taskMdCount} db:${taskDbCount}) — 전체 재빌드`)
      idx.clearTasks()
      const tasks = _getTasksFromFiles()
      const vaultPath = getVaultPath()
      const rows = tasks.map(task => {
        const activeFile = taskFilePath(task.id, false)
        const archiveFile = taskFilePath(task.id, true)
        return {
          id: task.id,
          file_path: fs.existsSync(activeFile) ? activeFile : fs.existsSync(archiveFile) ? archiveFile : null,
          item_id: task.item_id,
          title: task.title,
          status: task.status,
          person: task.person,
          due_date: task.due_date,
          memo: task.memo,
          created_at: task.created_at,
          updated_at: task.updated_at,
        }
      })
      idx.bulkInsertTasks(rows)
    }

    console.log(`[Vault] 인덱스 빌드 완료 (${Date.now() - start}ms)`)
  } catch (e) {
    console.error('[Vault] 인덱스 빌드 오류:', e.message)
  }
}

module.exports = {
  initVault,
  buildIndex,
  getVaultPath,
  detectObsidianVaults,
  getExistingFolderNames,
  insertItem,
  getItems,
  searchItems,
  updateItemStatus,
  deleteItem,
  trashItem,
  getTrashItems,
  restoreTrashItem,
  deleteTrashItem,
  getItemsByPerson,
  insertTask,
  getTasks,
  updateTaskStatus,
  updateTaskFields,
  getTasksByPerson,
  upsertPerson,
  deletePerson,
  getPeople,
  appendToPersonNote,
  upsertProject,
  getProjectByName,
  getProjects,
  appendToProjectNote,
  upsertChannel,
  getChannel,
  updateChannelStatus,
  updateItemField: updateFrontmatterField,
}
