import { useState, useRef, useEffect } from 'react'
import { IconAttach, IconMic } from './Icons.jsx'
import { useSpeechToText } from '../hooks/useSpeechToText.js'

export default function NLInput({ onSubmit, onUpload, placeholder = '자연어로 명령하세요...' }) {
  const [value, setValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const dragCounter = useRef(0)

  const { isListening, isProcessing, toggle: toggleMic } = useSpeechToText({
    onResult: (text) => setValue(v => (v + ' ' + text).trimStart()),
    onError: (msg) => {
      setResult({ type: 'error', message: msg })
      setTimeout(() => setResult(null), 4000)
    },
  })

  // 전체 화면 드래그 감지
  useEffect(() => {
    if (!onUpload) return

    function onDragEnter(e) {
      if (!e.dataTransfer.types.includes('Files')) return
      dragCounter.current += 1
      if (dragCounter.current === 1) setIsDragging(true)
    }

    function onDragLeave() {
      dragCounter.current -= 1
      if (dragCounter.current === 0) setIsDragging(false)
    }

    function onDragOver(e) {
      e.preventDefault()
    }

    function onDrop(e) {
      e.preventDefault()
      dragCounter.current = 0
      setIsDragging(false)
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [onUpload])

  async function handleSubmit(e) {
    e.preventDefault()
    const text = value.trim()
    if (!text || isLoading) return

    setIsLoading(true)
    setResult(null)
    try {
      const response = await onSubmit(text)
      if (response?.result?.message) {
        setResult({ type: 'success', message: response.result.message })
      } else if (response?.error) {
        setResult({ type: 'error', message: response.error })
      }
      setValue('')
    } catch (error) {
      setResult({ type: 'error', message: error.message })
    } finally {
      setIsLoading(false)
      setTimeout(() => setResult(null), 6000)
    }
  }

  async function handleFiles(files) {
    if (!files.length || !onUpload) return
    setIsUploading(true)
    setResult(null)
    try {
      const res = await onUpload(Array.from(files))
      if (res?.message) {
        setResult({ type: 'success', message: res.message })
        setTimeout(() => setResult(null), 5000)
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message })
      setTimeout(() => setResult(null), 6000)
    } finally {
      setIsUploading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleFileInput(e) {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const busy = isLoading || isUploading || isProcessing

  return (
    <>
      {/* 전체 화면 드래그 오버레이 */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-white/8 backdrop-blur-[1px]" />
          <div className="relative flex flex-col items-center gap-3 px-10 py-8 rounded-2xl border-2 border-dashed border-[#c8c8d0] bg-[#0d0d0d]/80">
            <IconAttach size={32} className="text-[#c8c8d0]" />
            <p className="text-sm font-medium text-[#c8c8d0]">파일을 놓으세요</p>
            <p className="text-xs text-[#737373]">이미지, PDF, 문서, 이메일 등</p>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex gap-1.5 items-center rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] transition-colors">
          {/* 파일 첨부 버튼 */}
          {onUpload && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="파일/이미지 첨부"
                className="flex-shrink-0 pl-3 text-[#404040] hover:text-[#737373] disabled:opacity-30 transition-colors"
              >
                <IconAttach size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".txt,.pdf,.docx,.eml,.md,.jpg,.jpeg,.png,.gif,.webp,.heic"
                onChange={handleFileInput}
              />
            </>
          )}

          {/* 텍스트 입력 */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={busy}
            className="flex-1 bg-transparent px-2 py-2 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none disabled:opacity-50"
          />

          {/* 마이크 버튼 */}
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy}
            title={isListening ? '녹음 중지 (다시 클릭)' : isProcessing ? '음성 분석중...' : '음성 입력'}
            className={`flex-shrink-0 p-1.5 rounded-md transition-colors disabled:opacity-30 ${
              isListening
                ? 'text-red-400 animate-pulse'
                : isProcessing
                  ? 'text-yellow-400 animate-pulse'
                  : 'text-[#888888] hover:text-[#c8c8d0]'
            }`}
          >
            <IconMic size={16} />
          </button>

          {/* 실행/상태 버튼 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim() || busy}
            className="flex-shrink-0 mr-1.5 px-2.5 py-1.5 bg-[#d4d4d8] text-[#0f0f0f] text-xs rounded-md hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '•••' : isUploading ? '분석중' : '↵'}
          </button>
        </div>

        {/* 결과 메시지 */}
        {result && (
          <p className={`text-xs px-1 fade-in ${result.type === 'error' ? 'text-red-400' : 'text-[#c8c8d0]'}`}>
            {result.message}
          </p>
        )}
      </div>
    </>
  )
}
