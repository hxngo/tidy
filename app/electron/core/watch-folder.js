/**
 * watch-folder.js
 * 지정 폴더에 파일이 추가되면 자동으로 분석 이벤트를 emit한다.
 */

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

const SUPPORTED_EXTS = new Set([
  '.txt', '.pdf', '.docx', '.eml', '.md', '.vtt',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
])

class WatchFolder extends EventEmitter {
  constructor() {
    super()
    this._watcher = null
    this._debounceTimers = {}
    this._processedFiles = new Set()
    this._folderPath = null
  }

  start(folderPath) {
    if (!folderPath) return
    if (!fs.existsSync(folderPath)) {
      console.warn('[WatchFolder] 경로가 존재하지 않음:', folderPath)
      return
    }
    if (this._folderPath === folderPath && this._watcher) return
    this.stop()
    this._folderPath = folderPath

    try {
      this._watcher = fs.watch(folderPath, { persistent: false }, (_, filename) => {
        if (!filename) return
        const filePath = path.join(folderPath, filename)
        if (this._debounceTimers[filePath]) clearTimeout(this._debounceTimers[filePath])
        this._debounceTimers[filePath] = setTimeout(() => {
          delete this._debounceTimers[filePath]
          this._handleFile(filePath)
        }, 1500)
      })
      console.log('[WatchFolder] 감시 시작:', folderPath)
    } catch (err) {
      console.warn('[WatchFolder] 감시 실패:', err.message)
    }
  }

  stop() {
    try { this._watcher?.close() } catch {}
    this._watcher = null
    for (const t of Object.values(this._debounceTimers)) clearTimeout(t)
    this._debounceTimers = {}
    this._folderPath = null
  }

  _handleFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return
      if (!fs.statSync(filePath).isFile()) return
      if (!SUPPORTED_EXTS.has(path.extname(filePath).toLowerCase())) return
      if (this._processedFiles.has(filePath)) return
      this._processedFiles.add(filePath)
      if (this._processedFiles.size > 500) {
        const [first] = this._processedFiles
        this._processedFiles.delete(first)
      }
      console.log('[WatchFolder] 새 파일 감지:', filePath)
      this.emit('newFile', { filePath })
    } catch (err) {
      console.warn('[WatchFolder] 처리 오류:', err.message)
    }
  }
}

module.exports = new WatchFolder()
