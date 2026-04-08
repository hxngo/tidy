import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SourceIcon, IconAttach, IconMic } from '../components/Icons.jsx'
import { useSpeechToText } from '../hooks/useSpeechToText.js'
import { SKILLS, AI_SKILLS, NLM_SKILLS } from '../components/SkillPanel.jsx'
import SkillPanel from '../components/SkillPanel.jsx'

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

  // 스킬 팝업
  const [showSkillPicker, setShowSkillPicker] = useState(false)

  // 스킬 실행 모달
  const [skillRunnerOpen, setSkillRunnerOpen] = useState(false)
  const [selectedSkillId, setSelectedSkillId] = useState(null)
  const [skillRunnerText, setSkillRunnerText] = useState('')
  const [skillRunnerFile, setSkillRunnerFile] = useState(null) // { name }
  const skillRunnerTextRef = useRef(null)
  const skillFileInputRef = useRef(null)

  // 스킬 출력 패널
  const [skillPanelOpen, setSkillPanelOpen] = useState(false)
  const [skillPanelInput, setSkillPanelInput] = useState('')

  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const pickerRef = useRef(null)
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

    window.tidy?.inbox.get({ limit: 10 }).then((data) => {
      if (Array.isArray(data)) {
        setRecentItems(data.filter((i) => i.status === 'new').slice(0, 5))
      }
    }).catch(() => {})

    const unsub = window.tidy?.inbox.onNewItem((item) => {
      if (item?.status === 'new') {
        setRecentItems((prev) => [item, ...prev].slice(0, 5))
      }
    })
    return () => unsub?.()
  }, [])

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!showSkillPicker) return
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSkillPicker(false)
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setShowSkillPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showSkillPicker])

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
    setShowSkillPicker(false)
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

  // 스킬 선택 → 실행 모달 열기
  function openSkillRunner(skillId) {
    setSelectedSkillId(skillId)
    setSkillRunnerText(value.trim())
    setSkillRunnerFile(null)
    setSkillRunnerOpen(true)
    setShowSkillPicker(false)
    setTimeout(() => skillRunnerTextRef.current?.focus(), 50)
  }

  // 스킬 모달 파일 첨부 처리
  async function handleSkillFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const res = await window.tidy?.skills.readFile(file.path)
    if (res?.success && res.text) {
      setSkillRunnerText(res.text)
      setSkillRunnerFile({ name: res.name })
      setTimeout(() => skillRunnerTextRef.current?.focus(), 50)
    } else {
      alert(res?.error || '파일을 읽을 수 없습니다')
    }
  }

  // 스킬 실행 → 출력 패널 열기
  function runSkill() {
    const text = skillRunnerText.trim()
    if (!text) return
    setSkillPanelInput(text)
    setSkillPanelOpen(true)
    setSkillRunnerOpen(false)
  }

  const selectedSkill = SKILLS.find(s => s.id === selectedSkillId)

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
        <div className="flex flex-col gap-2 relative">

          {/* ── 스킬 픽커 팝업 ── */}
          {showSkillPicker && (
            <div
              ref={pickerRef}
              className="absolute bottom-full mb-2 left-0 right-0 z-40 bg-[#131318] border border-[#1e2030] rounded-2xl shadow-2xl overflow-hidden fade-in"
            >
              {/* AI 스킬 섹션 */}
              <div className="px-4 pt-3.5 pb-2 border-b border-[#1a1c28]">
                <div className="flex items-center gap-2 mb-2.5">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
                  </svg>
                  <span className="text-[10px] font-semibold text-[#6b6e8c] tracking-wide uppercase">AI 스킬</span>
                  <span className="text-[10px] text-[#2a2c3a]">로컬 · 빠름</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {AI_SKILLS.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => openSkillRunner(skill.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-[#1a1c28] transition-colors text-left group"
                    >
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] flex-shrink-0"
                        style={{ background: skill.color + '20', color: skill.color }}>
                        {skill.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[#9a9cb8] group-hover:text-[#d0d2e4] transition-colors truncate">{skill.label}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* NotebookLM 스킬 섹션 */}
              <div className="px-4 pt-3 pb-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="6.5"/>
                    <path d="M8 5v3l2 1.5"/>
                  </svg>
                  <span className="text-[10px] font-semibold text-[#4285f4] tracking-wide uppercase">NotebookLM</span>
                  <span className="text-[10px] text-[#2a2c3a]">클라우드 · Google 계정 필요</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {NLM_SKILLS.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => openSkillRunner(skill.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-[#1a1c28] transition-colors text-left group"
                    >
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] flex-shrink-0"
                        style={{ background: skill.color + '20', color: skill.color }}>
                        {skill.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[#9a9cb8] group-hover:text-[#d0d2e4] transition-colors truncate">{skill.label}</p>
                        <p className="text-[9px] text-[#2a2c3a] truncate">.{skill.ext}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 입력 박스 */}
          <div className={`flex items-center gap-2 rounded-xl border ${
            showSkillPicker ? 'border-[#2e3060]' : isLoading ? 'border-[#c8c8d0]/50' : 'border-[#2a2a2a]'
          } bg-[#1a1a1a] px-3 py-2.5 transition-colors`}>
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
              onClick={() => setShowSkillPicker(true)}
              onFocus={() => setShowSkillPicker(true)}
              placeholder="메시지 입력 또는 스킬 선택..."
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
        {!result && recentItems.length === 0 && !showSkillPicker && (
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
        {recentItems.length > 0 && !showSkillPicker && (
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

      {/* ── 스킬 실행 모달 ── */}
      {skillRunnerOpen && selectedSkill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSkillRunnerOpen(false)}
          onDragEnter={(e) => e.stopPropagation()}
          onDragOver={(e) => e.stopPropagation()}
          onDragLeave={(e) => e.stopPropagation()}
          onDrop={(e) => e.stopPropagation()}
        >
          <div
            className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-lg shadow-2xl fade-in"
            onClick={(e) => e.stopPropagation()}
            onDragEnter={(e) => e.stopPropagation()}
            onDragOver={(e) => { e.stopPropagation(); e.preventDefault() }}
            onDragLeave={(e) => e.stopPropagation()}
            onDrop={async (e) => {
              e.stopPropagation()
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (!file) return
              const res = await window.tidy?.skills.readFile(file.path)
              if (res?.success && res.text) {
                setSkillRunnerText(res.text)
                setSkillRunnerFile({ name: res.name })
              } else {
                alert(res?.error || '파일을 읽을 수 없습니다')
              }
            }}
          >
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#181a26]">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: selectedSkill.color + '20', color: selectedSkill.color }}
              >
                {selectedSkill.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#e0e0f0]">{selectedSkill.label}</p>
                <p className="text-[11px] text-[#505272]">{selectedSkill.desc}</p>
              </div>
              <button
                onClick={() => setSkillRunnerOpen(false)}
                className="text-[#505272] hover:text-[#9a9cb8] p-1 rounded transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l12 12M14 2L2 14"/>
                </svg>
              </button>
            </div>

            {/* 텍스트 입력 영역 */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest">
                  처리할 텍스트
                </label>
                <div className="flex items-center gap-2">
                  {skillRunnerFile && (
                    <span className="flex items-center gap-1 text-[10px] text-[#6366f1] bg-[#6366f1]/10 border border-[#6366f1]/20 px-2 py-0.5 rounded-full">
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v4h4"/>
                      </svg>
                      {skillRunnerFile.name}
                      <button onClick={() => { setSkillRunnerFile(null); setSkillRunnerText('') }} className="ml-0.5 hover:text-red-400">×</button>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => skillFileInputRef.current?.click()}
                    className="flex items-center gap-1 text-[10px] text-[#505272] hover:text-[#9a9cb8] border border-[#1a1c28] hover:border-[#252840] px-2 py-1 rounded-lg transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 2h6l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v4h4"/>
                    </svg>
                    파일 첨부
                  </button>
                  <input
                    ref={skillFileInputRef}
                    type="file"
                    className="hidden"
                    accept=".txt,.md,.pdf,.docx,.hwp,.csv,.eml,.vtt"
                    onChange={handleSkillFile}
                  />
                </div>
              </div>
              <div className="relative">
                <textarea
                  ref={skillRunnerTextRef}
                  value={skillRunnerText}
                  onChange={(e) => setSkillRunnerText(e.target.value)}
                  placeholder="텍스트를 입력하거나 붙여넣기하세요... 또는 파일을 드래그하세요"
                  rows={6}
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-3 text-[13px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#2e3060] resize-none leading-relaxed transition-colors"
                />
                {!skillRunnerText && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0">
                    <span className="text-[11px] text-[#505272]">파일을 여기에 드래그하세요</span>
                  </div>
                )}
              </div>
            </div>

            {/* 실행 버튼 */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setSkillRunnerOpen(false)}
                className="flex-1 text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] py-2 rounded-xl border border-[#1a1c28] hover:border-[#252840] transition-colors"
              >
                취소
              </button>
              <button
                onClick={runSkill}
                disabled={!skillRunnerText.trim()}
                className="flex-[2] flex items-center justify-center gap-2 text-[12px] font-semibold text-white py-2 rounded-xl transition-colors disabled:opacity-40"
                style={{ background: skillRunnerText.trim() ? selectedSkill.color : undefined, backgroundColor: !skillRunnerText.trim() ? '#1a1c28' : undefined }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
                </svg>
                {selectedSkill.label} 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 스킬 출력 패널 ── */}
      <SkillPanel
        open={skillPanelOpen}
        onClose={() => setSkillPanelOpen(false)}
        skillId={selectedSkillId}
        input={skillPanelInput}
        sourceItemId={null}
      />
    </div>
  )
}
