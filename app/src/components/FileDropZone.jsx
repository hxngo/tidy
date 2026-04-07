import { useState, useEffect, useCallback, useRef } from 'react'

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.txt', '.md', '.docx', '.doc', '.xlsx', '.xls', '.csv',
  '.pptx', '.ppt', '.hwp', '.jpg', '.jpeg', '.png', '.gif', '.webp',
]

function getFileExt(name) {
  const m = name.match(/(\.[^.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

function isAccepted(file) {
  return ACCEPTED_EXTENSIONS.includes(getFileExt(file.name))
}

export default function FileDropZone({ onFilesDropped, children }) {
  const [dragging, setDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([]) // { name, status }[]
  const [showResults, setShowResults] = useState(false)
  const counterRef = useRef(0)

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    counterRef.current++
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    counterRef.current--
    if (counterRef.current <= 0) {
      counterRef.current = 0
      setDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    counterRef.current = 0
    setDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const accepted = files.filter(isAccepted)
    const rejected = files.filter(f => !isAccepted(f))

    if (accepted.length === 0) {
      setResults(rejected.map(f => ({ name: f.name, status: 'rejected' })))
      setShowResults(true)
      setTimeout(() => setShowResults(false), 4000)
      return
    }

    setUploading(true)
    setResults([])
    setShowResults(false)

    const newResults = []
    for (const file of accepted) {
      try {
        const res = await window.tidy?.inbox.upload(file.path)
        newResults.push({ name: file.name, status: res?.success ? 'ok' : 'error', error: res?.error })
      } catch (err) {
        newResults.push({ name: file.name, status: 'error', error: err.message })
      }
    }

    for (const f of rejected) {
      newResults.push({ name: f.name, status: 'rejected' })
    }

    setUploading(false)
    setResults(newResults)
    setShowResults(true)
    onFilesDropped?.(newResults)
    setTimeout(() => setShowResults(false), 5000)
  }, [onFilesDropped])

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop])

  return (
    <>
      {children}

      {/* Drag Overlay */}
      {dragging && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#06070e]/85 backdrop-blur-sm" />

          {/* Drop target area */}
          <div className="relative z-10 flex flex-col items-center gap-4 px-16 py-12 rounded-2xl border-2 border-dashed border-[#4a4c6a] bg-[#0d0e18]/90 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-[#1c1e30] flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold text-[#e0e0f0]">파일 놓기</p>
              <p className="text-[12px] text-[#6b6e8c] mt-1">인박스에 추가하고 AI가 분석합니다</p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {['.pdf', '.txt', '.md', '.docx', '.xlsx', '.jpg', '.png', '.hwp'].map(ext => (
                <span key={ext} className="text-[10px] text-[#505272] bg-[#14151e] border border-[#1c1e2c] rounded px-1.5 py-0.5 font-mono">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload spinner overlay */}
      {uploading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#0d0e18] border border-[#1c1e2c] rounded-xl px-5 py-3 shadow-2xl">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <p className="text-[12px] text-[#a0a2bc]">AI가 파일을 분석하는 중…</p>
        </div>
      )}

      {/* Results toast */}
      {showResults && results.length > 0 && !uploading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 fade-in">
          {results.slice(0, 5).map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-xl text-[12px] ${
                r.status === 'ok'
                  ? 'bg-[#0d1a12] border-emerald-800/50 text-emerald-300'
                  : r.status === 'rejected'
                  ? 'bg-[#1a1410] border-amber-800/40 text-amber-400'
                  : 'bg-[#1a0d0d] border-red-800/40 text-red-400'
              }`}
            >
              <span className="flex-shrink-0">
                {r.status === 'ok' ? '✓' : r.status === 'rejected' ? '–' : '✕'}
              </span>
              <span className="max-w-[280px] truncate">{r.name}</span>
              {r.status === 'rejected' && <span className="text-[10px] text-amber-600 flex-shrink-0">지원 안 됨</span>}
            </div>
          ))}
          {results.length > 5 && (
            <div className="text-center text-[11px] text-[#505272]">외 {results.length - 5}개</div>
          )}
        </div>
      )}
    </>
  )
}
