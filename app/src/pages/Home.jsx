import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SourceIcon, IconAttach, IconMic } from '../components/Icons.jsx'
import { useSpeechToText } from '../hooks/useSpeechToText.js'

const SUGGESTIONS = [
  '김팀장 보고서 제출 완료로 표시해줘',
  '다음 주 월요일까지 계약서 검토 태스크 추가',
  '이번 주 주간 리포트 보여줘',
]

export default function Home() {
  const [value, setValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState(null) // { type: 'ok'|'err', message }
  const [recentItems, setRecentItems] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const dragCounter = useRef(0)
  const navigate = useNavigate()

  const { isListening, isProcessing, toggle: toggleMic } = useSpeechToText({
    onResult: (text) => setValue(v => (v + ' ' + text).trimStart()),
    onError: (msg) => {
      setResult({ type: 'err', message: msg })
      setTimeout(() => setResult(null), 4000)
    },
  })

  useEffect(() => {
    inputRef.current?.focus()

    // 최근 새 인박스 항목 로드 (최대 5개)
    window.tidy?.inbox.get({ limit: 10 }).then((data) => {
      if (Array.isArray(data)) {
        setRecentItems(data.filter((i) => i.status === 'new').slice(0, 5))
      }
    }).catch(() => {})

    // 실시간 새 항목 수신
    const unsub = window.tidy?.inbox.onNewItem((item) => {
      if (item?.status === 'new') {
        setRecentItems((prev) => [item, ...prev].slice(0, 5))
      }
    })
    return () => unsub?.()
  }, [])

  // 전체 화면 드래그 감지
  useEffect(() => {
    function onDragEnter(e) {
      if (!e.dataTransfer.types.includes('Files')) return
      dragCounter.current += 1
      if (dragCounter.current === 1) setIsDragging(true)
    }
    function onDragLeave() {
      dragCounter.current -= 1
      if (dragCounter.current === 0) setIsDragging(false)
    }
    function onDragOver(e) { e.preventDefault() }
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
  }, [])

  async function handleSubmit(e) {
    e?.preventDefault()
    const text = value.trim()
    if (!text || isLoading) return
    setIsLoading(true)
    setResult(null)
    try {
      const res = await window.tidy?.tasks.nlAction(text)
      if (res?.result?.message) {
        setResult({ type: 'ok', message: res.result.message })
      } else if (res?.error) {
        setResult({ type: 'err', message: res.error })
      } else {
        setResult({ type: 'ok', message: '처리 완료' })
      }
      setValue('')
    } catch (err) {
      setResult({ type: 'err', message: err.message })
    } finally {
      setIsLoading(false)
      setTimeout(() => setResult(null), 6000)
    }
  }

  async function handleFiles(files) {
    const arr = Array.from(files)
    if (!arr.length) return
    setIsLoading(true)
    setResult(null)
    try {
      const results = await Promise.all(arr.map((f) => window.tidy?.inbox.upload(f.path)))
      const ok = results.filter((r) => r?.success).length
      const fail = results.length - ok
      setResult({
        type: fail === 0 ? 'ok' : 'err',
        message: fail === 0 ? `${ok}개 파일 분석 완료 — 인박스에서 확인하세요` : `${ok}개 성공, ${fail}개 실패`,
      })
      setTimeout(() => setResult(null), 5000)
      // 인박스로 이동
      if (ok > 0) setTimeout(() => navigate('/inbox'), 1200)
    } catch (err) {
      setResult({ type: 'err', message: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#0f0f0f] text-[#e5e5e5] select-none px-4">
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-white/8 backdrop-blur-[1px]" />
          <div className="relative flex flex-col items-center gap-3 px-10 py-8 rounded-2xl border-2 border-dashed border-[#c8c8d0] bg-[#0d0d0d]/80">
            <IconAttach size={32} className="text-[#c8c8d0]" />
            <p className="text-sm font-medium text-[#c8c8d0]">파일을 놓으세요</p>
            <p className="text-xs text-[#555]">이미지, PDF, 문서, 이메일 등</p>
          </div>
        </div>
      )}

      <div className="w-full max-w-xl flex flex-col gap-6">
        {/* 로고 + 인사말 */}
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 18 18" fill="none" className="text-[#d4d4d8]">
              <rect x="2" y="4"  width="14" height="2" rx="1" fill="currentColor"/>
              <rect x="2" y="8"  width="10" height="2" rx="1" fill="currentColor" opacity="0.7"/>
              <rect x="2" y="12" width="6"  height="2" rx="1" fill="currentColor" opacity="0.4"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[#e5e5e5]">무엇을 도와드릴까요?</h1>
          <p className="text-xs text-[#404040] mt-1.5">태스크 명령, 파일 분석, 자연어로 입력하세요</p>
        </div>

        {/* 입력 영역 */}
        <div className="flex flex-col gap-2">
          <div className={`flex items-center gap-2 rounded-xl border ${isLoading ? 'border-[#c8c8d0]/50' : 'border-[#2a2a2a]'} bg-[#1a1a1a] px-3 py-2.5 transition-colors`}>
            {/* 파일 첨부 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="파일 첨부"
              className="flex-shrink-0 text-[#404040] hover:text-[#737373] disabled:opacity-30 transition-colors"
            >
              <IconAttach size={15} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".txt,.pdf,.docx,.eml,.md,.vtt,.jpg,.jpeg,.png,.gif,.webp,.heic"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
            />

            {/* 텍스트 입력 */}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지 입력..."
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-[#e5e5e5] placeholder-[#333] focus:outline-none disabled:opacity-50"
            />

            {/* 마이크 버튼 */}
            <button
              type="button"
              onClick={toggleMic}
              disabled={isLoading || isProcessing}
              title={isListening ? '녹음 중지 (다시 클릭)' : isProcessing ? '음성 분석중...' : '음성 입력'}
              className={`flex-shrink-0 p-1 rounded-md transition-colors disabled:opacity-30 ${
                isListening ? 'text-red-400 animate-pulse' : isProcessing ? 'text-yellow-400 animate-pulse' : 'text-[#888888] hover:text-[#c8c8d0]'
              }`}
            >
              <IconMic size={16} />
            </button>

            {/* 전송 버튼 */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!value.trim() || isLoading}
              className="flex-shrink-0 w-7 h-7 bg-[#d4d4d8] text-white text-xs rounded-lg hover:bg-[#b8b8c0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isLoading ? '•' : '↵'}
            </button>
          </div>

          {/* 결과 메시지 */}
          {result && (
            <p className={`text-xs px-1 fade-in ${result.type === 'err' ? 'text-red-400' : 'text-[#c8c8d0]'}`}>
              {result.message}
            </p>
          )}
        </div>

        {/* 추천 명령어 */}
        {!result && recentItems.length === 0 && (
          <div className="flex flex-col gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setValue(s)}
                className="text-left text-xs text-[#404040] hover:text-[#737373] px-3 py-2 rounded-lg hover:bg-[#1a1a1a] transition-colors truncate"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* 최근 새 인박스 항목 */}
        {recentItems.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#333] uppercase tracking-wider">새 항목</span>
              <button
                onClick={() => navigate('/inbox')}
                className="text-xs text-[#404040] hover:text-[#c8c8d0] transition-colors"
              >
                전체 보기 →
              </button>
            </div>
            {recentItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate('/inbox')}
                className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-[#1e1e1e] border border-[#222] hover:border-[#2a2a2a] transition-colors text-left"
              >
                <span className="flex-shrink-0 mt-0.5 text-[#737373]">
                  <SourceIcon source={item.source} size={13} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#a0a0a0] leading-relaxed truncate">
                    {item.summary?.trim() || item.raw_text?.trim()?.slice(0, 80) || '요약 없음'}
                  </p>
                  {item.people?.length > 0 && (
                    <p className="text-xs text-[#404040] mt-0.5">{item.people[0]}</p>
                  )}
                </div>
                {item.priority === 'high' && (
                  <span className="flex-shrink-0 text-xs text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">긴급</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
