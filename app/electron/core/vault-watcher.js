/**
 * vault-watcher.js
 * Obsidian 양방향 동기화 — vault 파일 변경 감지 후 Tidy DB 업데이트
 *
 * 감지 대상:
 *  - tasks/active/*.md  → status: done 으로 바뀌면 완료 처리
 *  - tasks/active/*.md  → 파일 삭제 시 archived 처리
 *  - inbox 항목 MD → status 필드 변경 시 반영
 */

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')
const { getVaultPath, updateTaskStatus, updateItemStatus } = require('./vault')

// frontmatter 파싱 (간단 버전 — yaml 의존성 없음)
function parseFrontmatterStatus(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const block = match[1]
  const statusMatch = block.match(/^status:\s*(.+)$/m)
  return statusMatch ? statusMatch[1].trim() : null
}

function parseItemId(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const block = match[1]
  const idMatch = block.match(/^id:\s*(.+)$/m)
  return idMatch ? idMatch[1].trim() : null
}

function parseItemType(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const block = match[1]
  const typeMatch = block.match(/^type:\s*(.+)$/m)
  return typeMatch ? typeMatch[1].trim() : null
}

class VaultWatcher extends EventEmitter {
  constructor() {
    super()
    this._watchers = []
    this._debounceTimers = {}
    this._running = false
  }

  start() {
    if (this._running) return
    this._running = true

    const vaultPath = getVaultPath()
    const tasksActiveDir = path.join(vaultPath, 'tasks', 'active')
    const urgentDir = path.join(vaultPath, 'urgent')

    // tasks/active 폴더 감시
    this._watchDir(tasksActiveDir, 'task')

    // vault 루트 감시 (플랫폼 폴더들 포함 — 동적으로 생성되는 폴더 대응)
    this._watchRoot(vaultPath)

    console.log('[VaultWatcher] 시작됨 -', vaultPath)
  }

  stop() {
    for (const w of this._watchers) {
      try { w.close() } catch {}
    }
    this._watchers = []
    for (const t of Object.values(this._debounceTimers)) clearTimeout(t)
    this._debounceTimers = {}
    this._running = false
    console.log('[VaultWatcher] 중지됨')
  }

  // 특정 디렉토리의 .md 파일 변경 감시
  _watchDir(dirPath, hint) {
    if (!fs.existsSync(dirPath)) return

    try {
      const watcher = fs.watch(dirPath, { persistent: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return
        const filePath = path.join(dirPath, filename)
        this._debounce(filePath, () => this._handleChange(filePath, eventType, hint))
      })
      this._watchers.push(watcher)
    } catch (err) {
      console.warn('[VaultWatcher] 감시 실패:', dirPath, err.message)
    }
  }

  // vault 루트 감시 — 새 플랫폼 폴더 생성 시 그 안도 감시
  _watchRoot(vaultPath) {
    const SYSTEM_DIRS = new Set(['tasks', 'people', 'projects', 'channels', 'urgent', '.obsidian'])

    if (!fs.existsSync(vaultPath)) return

    // 이미 존재하는 비시스템 디렉토리들 감시
    try {
      const entries = fs.readdirSync(vaultPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !SYSTEM_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          this._watchPlatformDir(path.join(vaultPath, entry.name))
        }
      }
    } catch {}

    // 루트 자체를 감시해서 새 폴더 생성 시 감시 추가
    try {
      const watcher = fs.watch(vaultPath, { persistent: false }, (eventType, name) => {
        if (!name || name.startsWith('.') || SYSTEM_DIRS.has(name)) return
        const fullPath = path.join(vaultPath, name)
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          this._watchPlatformDir(fullPath)
        }
      })
      this._watchers.push(watcher)
    } catch (err) {
      console.warn('[VaultWatcher] 루트 감시 실패:', err.message)
    }
  }

  // 플랫폼 폴더 (e.g. Gmail/, 카카오톡/) 및 그 하위 감시
  _watchPlatformDir(platformDir) {
    try {
      // 이미 감시 중인지 확인 (단순 경로 비교로 중복 방지)
      if (this._watchedPaths && this._watchedPaths.has(platformDir)) return
      if (!this._watchedPaths) this._watchedPaths = new Set()
      this._watchedPaths.add(platformDir)

      const watcher = fs.watch(platformDir, { recursive: true, persistent: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return
        const filePath = path.join(platformDir, filename)
        this._debounce(filePath, () => this._handleChange(filePath, eventType, 'inbox'))
      })
      this._watchers.push(watcher)
    } catch (err) {
      console.warn('[VaultWatcher] 플랫폼 폴더 감시 실패:', platformDir, err.message)
    }
  }

  _debounce(key, fn, delay = 300) {
    if (this._debounceTimers[key]) clearTimeout(this._debounceTimers[key])
    this._debounceTimers[key] = setTimeout(() => {
      delete this._debounceTimers[key]
      fn()
    }, delay)
  }

  _handleChange(filePath, eventType, hint) {
    // 파일 삭제
    if (!fs.existsSync(filePath)) {
      if (hint === 'task') {
        // tasks/active/에서 삭제 → archive의 실제 status 확인
        const id = path.basename(filePath, '.md')
        const vaultPath = getVaultPath()
        const archiveFile = path.join(vaultPath, 'tasks', 'archive', path.basename(filePath))
        if (fs.existsSync(archiveFile)) {
          try {
            const content = fs.readFileSync(archiveFile, 'utf-8')
            const status = parseFrontmatterStatus(content)
            // trashed는 taskDone으로 처리하지 않음
            if (status === 'trashed') return
            if (status === 'done' || status === 'completed') {
              this.emit('taskDone', { id, source: 'vault-delete' })
            }
          } catch {}
        } else {
          // archive에 없으면 Obsidian에서 직접 삭제한 것으로 간주 → 완료 처리
          this.emit('taskDone', { id, source: 'vault-delete' })
        }
      }
      return
    }

    let content
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch {
      return
    }

    const status = parseFrontmatterStatus(content)
    const id = parseItemId(content)
    const type = parseItemType(content)

    if (!id || !status) return

    if (hint === 'task' || type === 'task') {
      if (status === 'done' || status === 'completed') {
        try {
          updateTaskStatus(id, 'done')
        } catch (err) {
          console.warn('[VaultWatcher] task 상태 업데이트 실패:', err.message)
        }
        this.emit('taskDone', { id, filePath })
      }
    } else if (hint === 'inbox' || type === 'inbox') {
      const validStatuses = ['new', 'read', 'done', 'archived']
      if (validStatuses.includes(status)) {
        try {
          updateItemStatus(id, status)
        } catch (err) {
          console.warn('[VaultWatcher] inbox 상태 업데이트 실패:', err.message)
        }
        this.emit('itemStatusChanged', { id, status, filePath })
      }
    }
  }
}

module.exports = new VaultWatcher()
