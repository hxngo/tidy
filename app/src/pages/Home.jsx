import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SourceIcon, IconAttach, IconMic } from '../components/Icons.jsx'
import { useSpeechToText } from '../hooks/useSpeechToText.js'
import { SKILLS, AI_SKILLS, NLM_SKILLS, setCustomSkillsCache } from '../components/SkillPanel.jsx'
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

  // 스킬 소개 화면
  const [showSkillIntro, setShowSkillIntro] = useState(false)

  // 스킬 출력 패널
  const [skillPanelOpen, setSkillPanelOpen] = useState(false)
  const [skillPanelInput, setSkillPanelInput] = useState('')

  const [attachedFiles, setAttachedFiles] = useState([]) // { path, name }

  // 커스텀 스킬
  const [customSkills, setCustomSkills] = useState([])
  const [showCreateSkill, setShowCreateSkill] = useState(false)
  const [editingSkill, setEditingSkill] = useState(null) // 수정 중인 커스텀 스킬

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

  // 커스텀 스킬 로드 헬퍼
  async function loadCustomSkills() {
    const list = await window.tidy?.skills.listCustom?.() || []
    setCustomSkills(list)
    setCustomSkillsCache(list)
  }

  useEffect(() => {
    inputRef.current?.focus()

    window.tidy?.inbox.get({ limit: 10 }).then((data) => {
      if (Array.isArray(data)) {
        setRecentItems(data.filter((i) => i.status === 'new').slice(0, 5))
      }
    }).catch(() => {})

    loadCustomSkills()

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
    if ((!text && attachedFiles.length === 0) || isLoading) return
    setShowSkillPicker(false)
    setIsLoading(true)
    setResult(null)
    try {
      // 파일이 있으면 먼저 업로드
      if (attachedFiles.length > 0) {
        const results = await Promise.all(attachedFiles.map(f => window.tidy?.inbox.upload(f.path, text || undefined)))
        const ok = results.filter(r => r?.success).length
        const fail = results.length - ok
        setResult({
          type: fail === 0 ? 'ok' : 'err',
          message: fail === 0 ? `${ok}개 파일 분석 완료 — 인박스에서 확인하세요` : `${ok}개 성공, ${fail}개 실패`,
        })
        setAttachedFiles([])
        setValue('')
        if (ok > 0) setTimeout(() => navigate('/inbox'), 1200)
      } else {
        // 텍스트만 있는 경우
        const res = await window.tidy?.tasks.nlAction(text)
        if (res?.result?.message) {
          setResult({ type: 'ok', message: res.result.message })
        } else if (res?.error) {
          setResult({ type: 'err', message: res.error })
        } else {
          setResult({ type: 'ok', message: '처리 완료' })
        }
        setValue('')
      }
    } catch (err) {
      setResult({ type: 'err', message: err.message })
    } finally {
      setIsLoading(false)
      setTimeout(() => setResult(null), 6000)
    }
  }

  function handleFiles(files) {
    const arr = Array.from(files)
    if (!arr.length) return
    setAttachedFiles(prev => {
      const existing = new Set(prev.map(f => f.path))
      const newFiles = arr.filter(f => !existing.has(f.path)).map(f => ({ path: f.path, name: f.name }))
      return [...prev, ...newFiles]
    })
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // 스킬 선택 → 소개 화면 먼저
  function openSkillRunner(skillId) {
    setSelectedSkillId(skillId)
    setSkillRunnerText(value.trim())
    setSkillRunnerFile(null)
    setSkillRunnerOpen(true)
    setShowSkillIntro(true) // 모든 스킬 소개 화면 먼저
    setShowSkillPicker(false)
  }

  // 스킬 모달 파일 첨부 처리
  async function handleSkillFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const res = await window.tidy?.skills.readFile(file.path)
    // res.text가 객체인 경우(오디오 파일 등) 문자열로 변환
    const text = typeof res?.text === 'string' ? res.text : null
    if (res?.success && text) {
      setSkillRunnerText(text)
      setSkillRunnerFile({ name: res.name })
      setTimeout(() => skillRunnerTextRef.current?.focus(), 50)
    } else if (res?.success && !text) {
      alert('이 파일 형식은 지원하지 않습니다')
    } else {
      alert(res?.error || '파일을 읽을 수 없습니다')
    }
  }

  // 스킬 실행 → 출력 패널 열기
  function runSkill() {
    const text = (typeof skillRunnerText === 'string' ? skillRunnerText : '').trim()
    if (!text) return
    setSkillPanelInput(text)
    setSkillPanelOpen(true)
    setSkillRunnerOpen(false)
  }

  const selectedSkill = SKILLS.find(s => s.id === selectedSkillId) || customSkills.find(s => s.id === selectedSkillId)

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
              className="absolute bottom-full mb-2 left-0 right-0 z-40 bg-[#131318] border border-[#1e2030] rounded-2xl shadow-2xl fade-in"
            >
              {/* AI 스킬 섹션 */}
              <div className="px-4 pt-3.5 pb-2 border-b border-[#1a1c28] rounded-t-2xl">
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

              {/* 커스텀 스킬 섹션 */}
              {(customSkills.length > 0) && (
                <div className="px-4 pt-3 pb-2 border-b border-[#1a1c28]">
                  <div className="flex items-center gap-2 mb-2.5">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#e879f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 6l6-4 6 4v8H2V6z"/><path d="M6 14V9h4v5"/>
                    </svg>
                    <span className="text-[10px] font-semibold text-[#c026d3] tracking-wide uppercase">내 스킬</span>
                    <span className="text-[10px] text-[#2a2c3a]">커스텀</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {customSkills.map(skill => (
                      <div key={skill.id} className="relative group">
                        <button
                          onClick={() => openSkillRunner(skill.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-[#1a1c28] transition-colors text-left"
                        >
                          <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] flex-shrink-0"
                            style={{ background: (skill.color || '#c026d3') + '20', color: skill.color || '#c026d3' }}>
                            {skill.icon || '★'}
                          </span>
                          <p className="text-[11px] font-medium text-[#9a9cb8] group-hover:text-[#d0d2e4] transition-colors truncate">{skill.label}</p>
                        </button>
                        {/* 수정 / 삭제 버튼 */}
                        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-all">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingSkill(skill); setShowCreateSkill(true); setShowSkillPicker(false) }}
                            title="수정"
                            className="p-0.5 rounded bg-[#1a1c28] text-[#c026d3] hover:bg-[#252840] hover:text-[#e879f9] transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 2l3 3-9 9H2v-3L11 2z"/>
                            </svg>
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (!confirm(`"${skill.label}" 스킬을 삭제할까요?`)) return
                              await window.tidy?.skills.deleteCustom(skill.id)
                              await loadCustomSkills()
                            }}
                            title="삭제"
                            className="p-0.5 rounded bg-[#1a1c28] text-[#6b3040] hover:bg-[#2a1020] hover:text-red-400 transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NotebookLM 스킬 섹션 */}
              <div className="px-4 pt-3 pb-3.5 rounded-b-2xl">
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

                {/* 스킬 만들기 버튼 */}
                <button
                  onClick={() => { setEditingSkill(null); setShowCreateSkill(true); setShowSkillPicker(false) }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-[#2a2c40] hover:border-[#c026d3]/40 text-[#404060] hover:text-[#c026d3] transition-colors text-[11px]"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 3v10M3 8h10"/>
                  </svg>
                  스킬 만들기
                </button>
              </div>
            </div>
          )}

          {/* 첨부 파일 태그 */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {attachedFiles.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-[10px] text-[#9a9cb8] bg-[#1a1c28] border border-[#2a2c40] px-2 py-0.5 rounded-full">
                  <IconAttach size={9} />
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="ml-0.5 hover:text-red-400 transition-colors">×</button>
                </span>
              ))}
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
              disabled={(!value.trim() && attachedFiles.length === 0) || isLoading}
              className="flex-shrink-0 w-7 h-7 bg-[#d4d4d8] text-[#111111] text-xs rounded-lg hover:bg-[#b8b8c0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
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
            {/* Option B: 번역 소개 화면 */}
            {showSkillIntro ? (
              <>
                <div className="flex justify-end px-4 pt-4">
                  <button onClick={() => setSkillRunnerOpen(false)} className="text-[#505272] hover:text-[#9a9cb8] transition-colors">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l12 12M14 2L2 14"/>
                    </svg>
                  </button>
                </div>
                <div className="flex flex-col items-center pt-2 pb-6 px-8 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
                    style={{ background: selectedSkill.color + '20', color: selectedSkill.color }}>
                    {selectedSkill.icon}
                  </div>
                  <h2 className="text-[16px] font-semibold text-[#e0e0f0] mb-1">{selectedSkill.label}</h2>
                  <p className="text-[12px] text-[#6b6e8c] leading-relaxed">{selectedSkill.detail}</p>
                </div>
                {selectedSkill.examples && (
                  <div className="mx-6 mb-5 p-4 rounded-xl bg-[#0a0b12] border border-[#1c1e2c]">
                    <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-wide mb-2.5">이런 경우에 사용하세요</p>
                    <div className="flex flex-col gap-1.5">
                      {selectedSkill.examples.map((ex, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: selectedSkill.color }} />
                          <span className="text-[11px] text-[#9a9cb8]">{ex}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedSkill.tip && (
                  <div className="mx-6 mb-5 flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: selectedSkill.color + '0d', border: `1px solid ${selectedSkill.color}20` }}>
                    <span className="text-[10px] mt-0.5" style={{ color: selectedSkill.color }}>💡</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: selectedSkill.color + 'cc' }}>{selectedSkill.tip}</p>
                  </div>
                )}
                <div className="px-6 pb-6">
                  <button
                    onClick={() => { setShowSkillIntro(false); setTimeout(() => skillRunnerTextRef.current?.focus(), 50) }}
                    className="w-full text-[13px] font-medium text-white py-2.5 rounded-xl transition-all"
                    style={{ background: selectedSkill.color }}
                  >
                    시작하기
                  </button>
                </div>
              </>
            ) : (
              <>
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
              <button onClick={() => setShowSkillIntro(true)}
                className="text-[10px] text-[#505272] hover:text-[#9a9cb8] px-2 py-1 rounded-lg hover:bg-[#14151e] transition-colors mr-1">
                설명 보기
              </button>
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
                disabled={!(typeof skillRunnerText === 'string' && skillRunnerText.trim())}
                className="flex-[2] flex items-center justify-center gap-2 text-[12px] font-semibold text-white py-2 rounded-xl transition-colors disabled:opacity-40"
                style={{ background: (typeof skillRunnerText === 'string' && skillRunnerText.trim()) ? selectedSkill.color : undefined, backgroundColor: !(typeof skillRunnerText === 'string' && skillRunnerText.trim()) ? '#1a1c28' : undefined }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
                </svg>
                {selectedSkill.label} 실행
              </button>
            </div>
            </>
            )}
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
        skillDef={customSkills.find(s => s.id === selectedSkillId) || null}
      />

      {/* ── 스킬 만들기 / 수정 모달 ── */}
      {showCreateSkill && (
        <CreateSkillModal
          skill={editingSkill}
          onClose={() => { setShowCreateSkill(false); setEditingSkill(null) }}
          onSaved={async () => {
            await loadCustomSkills()
            setShowCreateSkill(false)
            setEditingSkill(null)
          }}
          onDeleted={async () => {
            await loadCustomSkills()
            setShowCreateSkill(false)
            setEditingSkill(null)
          }}
        />
      )}
    </div>
  )
}

// ─── 스킬 만들기 / 수정 모달 ────────────────────────────────────
const SKILL_COLORS = ['#6366f1','#0ea5e9','#8b5cf6','#3b82f6','#f59e0b','#10b981','#84cc16','#f97316','#ef4444','#c026d3','#0891b2','#65a30d']
const SKILL_ICONS  = ['★','◈','▤','✦','⇄','◉','▷','◻','◫','⊞','⊛','⧉','◆','▲','●','♦','⬟','⬡','✿','❋']

function CreateSkillModal({ skill, onClose, onSaved, onDeleted }) {
  const isEdit = !!skill
  const [tab, setTab] = useState('nl')            // 'nl' | 'manual'
  const [nlDesc, setNlDesc] = useState('')        // 자연어 설명
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  // 스킬 필드
  const [label, setLabel]   = useState(skill?.label || '')
  const [icon, setIcon]     = useState(skill?.icon  || '★')
  const [color, setColor]   = useState(skill?.color || '#6366f1')
  const [desc, setDesc]     = useState(skill?.desc  || '')
  const [detail, setDetail] = useState(skill?.detail || '')
  const [systemPrompt, setSystemPrompt] = useState(skill?.systemPrompt || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // AI로 스킬 생성
  async function handleGenerate() {
    if (!nlDesc.trim()) return
    setGenerating(true)
    setGenError('')
    try {
      const res = await window.tidy?.skills.generate({ description: nlDesc.trim() })
      if (res?.skill) {
        const s = res.skill
        setLabel(s.label || '')
        setIcon(s.icon || '★')
        setColor(s.color || '#6366f1')
        setDesc(s.desc || '')
        setDetail(s.detail || '')
        setSystemPrompt(s.systemPrompt || '')
        setTab('manual')  // 결과 확인 탭으로 전환
      } else {
        setGenError(res?.error || '생성 실패. 다시 시도해주세요.')
      }
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!label.trim() || !systemPrompt.trim()) return
    setSaving(true)
    try {
      const skillObj = {
        id: skill?.id || null,
        label: label.trim(),
        icon,
        color,
        desc: desc.trim(),
        detail: detail.trim(),
        systemPrompt: systemPrompt.trim(),
        type: 'custom',
        source: 'user',
      }
      await window.tidy?.skills.saveCustom(skillObj)
      onSaved()
    } catch (e) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!skill?.id) return
    setDeleting(true)
    try {
      await window.tidy?.skills.deleteCustom(skill.id)
      onDeleted()
    } catch (e) {
      alert('삭제 실패: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-lg shadow-2xl fade-in flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#181a26] flex-shrink-0">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: color + '20', color }}>
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#e0e0f0]">{isEdit ? '스킬 수정' : '새 스킬 만들기'}</p>
            <p className="text-[11px] text-[#505272]">AI가 스킬을 자동으로 설계합니다</p>
          </div>
          <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] p-1 rounded transition-colors">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[#181a26] flex-shrink-0">
          <button
            onClick={() => setTab('nl')}
            className={`flex-1 py-2.5 text-[11px] font-medium transition-colors ${tab === 'nl' ? 'text-[#c026d3] border-b-2 border-[#c026d3]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}
          >
            ✦ AI로 생성
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 py-2.5 text-[11px] font-medium transition-colors ${tab === 'manual' ? 'text-[#c026d3] border-b-2 border-[#c026d3]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}
          >
            ✎ 직접 입력
          </button>
        </div>

        {/* 스크롤 컨텐츠 */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* AI 생성 탭 */}
          {tab === 'nl' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">
                  어떤 스킬이 필요한가요?
                </label>
                <textarea
                  value={nlDesc}
                  onChange={e => setNlDesc(e.target.value)}
                  placeholder={'예시:\n"이메일을 받으면 핵심 요청 사항과 기한을 추출해서 태스크 형태로 정리해줘"\n"계약서 문서를 분석해서 리스크 항목과 주요 조건을 요약해줘"\n"고객 피드백을 긍정/부정/개선요청으로 분류해줘"'}
                  rows={5}
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-3 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 resize-none leading-relaxed transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
                />
              </div>
              {genError && <p className="text-[11px] text-red-400">{genError}</p>}
              <button
                onClick={handleGenerate}
                disabled={!nlDesc.trim() || generating}
                className="w-full py-2.5 rounded-xl text-[12px] font-semibold text-white transition-colors disabled:opacity-40"
                style={{ background: (!nlDesc.trim() || generating) ? '#1a1c28' : '#c026d3' }}
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2a6 6 0 1 0 6 6"/></svg>
                    AI가 스킬을 설계 중...
                  </span>
                ) : '✦ 스킬 자동 생성 (⌘+Enter)'}
              </button>
              {!isEdit && (
                <p className="text-[10px] text-[#303050] text-center">
                  생성 후 "직접 입력" 탭에서 세부 내용을 확인하고 수정할 수 있어요
                </p>
              )}
            </div>
          )}

          {/* 직접 입력 탭 */}
          {tab === 'manual' && (
            <div className="space-y-3.5">
              {/* 아이콘 + 색상 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">아이콘</label>
                  <div className="flex flex-wrap gap-1 w-[136px]">
                    {SKILL_ICONS.map(ic => (
                      <button
                        key={ic}
                        onClick={() => setIcon(ic)}
                        className={`w-7 h-7 rounded-lg text-[13px] flex items-center justify-center transition-colors ${icon === ic ? 'ring-2 ring-[#c026d3]' : 'hover:bg-[#1a1c28]'}`}
                        style={{ color: icon === ic ? color : '#505272' }}
                      >{ic}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">색상</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/30' : 'hover:scale-110'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  {/* 미리보기 */}
                  <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-[#0a0b12] border border-[#1c1e2c]">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0"
                      style={{ background: color + '20', color }}>
                      {icon}
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-[#9a9cb8]">{label || '스킬 이름'}</p>
                      <p className="text-[9px] text-[#404060]">{desc || '설명'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 이름 */}
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">스킬 이름 *</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="예: 이메일 태스크 추출"
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 transition-colors"
                />
              </div>

              {/* 설명 */}
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">짧은 설명</label>
                <input
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="예: 이메일에서 요청 태스크와 기한 추출"
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 transition-colors"
                />
              </div>

              {/* 상세 설명 */}
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">상세 설명 (선택)</label>
                <textarea
                  value={detail}
                  onChange={e => setDetail(e.target.value)}
                  placeholder="스킬 소개 화면에 표시될 설명..."
                  rows={2}
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 resize-none transition-colors"
                />
              </div>

              {/* 시스템 프롬프트 */}
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">
                  AI 지시문 (System Prompt) *
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder={'AI에게 전달할 지시문을 입력하세요.\n예:\n당신은 이메일 분석 전문가입니다. 입력된 이메일에서:\n1. 요청 사항을 태스크 형태로 추출\n2. 기한이 있다면 날짜 형식으로 명시\n3. 우선순위(높음/보통/낮음) 분류'}
                  rows={6}
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-3 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 resize-none leading-relaxed transition-colors font-mono"
                />
                <p className="mt-1 text-[10px] text-[#303050]">이 내용이 Claude에게 전달되어 스킬의 동작 방식을 결정합니다</p>
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-2 px-5 pb-5 pt-3 border-t border-[#181a26] flex-shrink-0">
          {isEdit && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-xl transition-colors"
            >
              삭제
            </button>
          )}
          {confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-red-400">정말 삭제할까요?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-[11px] bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >{deleting ? '삭제 중...' : '삭제'}</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-[11px] text-[#505272] hover:text-[#9a9cb8] rounded-lg transition-colors">취소</button>
            </div>
          )}
          {!confirmDelete && (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2 text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] border border-[#1a1c28] hover:border-[#252840] rounded-xl transition-colors"
              >취소</button>
              {tab === 'manual' && (
                <button
                  onClick={handleSave}
                  disabled={!label.trim() || !systemPrompt.trim() || saving}
                  className="flex-[2] py-2 text-[12px] font-semibold text-white rounded-xl transition-colors disabled:opacity-40"
                  style={{ background: (!label.trim() || !systemPrompt.trim() || saving) ? '#1a1c28' : '#c026d3' }}
                >
                  {saving ? '저장 중...' : (isEdit ? '수정 저장' : '스킬 저장')}
                </button>
              )}
              {tab === 'nl' && (
                <button
                  onClick={() => setTab('manual')}
                  disabled={!label}
                  className="flex-[2] py-2 text-[12px] font-medium text-[#c026d3] border border-[#c026d3]/30 hover:border-[#c026d3]/60 rounded-xl transition-colors disabled:opacity-30"
                >
                  {label ? '결과 확인 →' : '생성 후 확인 가능'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
