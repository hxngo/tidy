import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ─── AI 스킬 (로컬, 빠름) ──────────────────────────────────────
export const AI_SKILLS = [
  { id: 'summary',    label: '요약',     icon: '✦',  desc: '핵심 내용 3줄 요약',         color: '#6366f1', type: 'ai',
    detail: '이메일·문서·대화 내용을 핵심 내용 3줄로 압축합니다. 긴 텍스트를 빠르게 파악하고 싶을 때 사용하세요.',
    examples: ['긴 이메일·보고서 핵심 파악', '회의 대화 내용 요약', '뉴스·문서 빠르게 훑기'],
    tip: '요약 후 "더 자세히", "3줄을 1줄로" 같은 추가 질문으로 계속 조정할 수 있어요.' },
  { id: 'translate',  label: '번역',     icon: '⇄',  desc: '한↔영 자동 번역',            color: '#0ea5e9', type: 'ai',
    detail: '한국어→영어, 영어→한국어를 자동으로 감지하여 번역합니다. 자연스러운 문맥을 유지하며 번역합니다.',
    examples: ['이메일·슬랙 메시지 영문 번역', '영어 문서·기사 한글화', '계약서·공문 번역'],
    tip: '번역 후 "더 격식체로", "단어 X를 Y로 바꿔줘" 같은 추가 질문으로 계속 다듬을 수 있어요.' },
  { id: 'minutes',    label: '회의록',   icon: '◉',  desc: '대화를 회의록으로 정리',      color: '#8b5cf6', type: 'ai',
    detail: '대화 내용이나 녹취록을 참석자·안건·결정사항·액션아이템이 담긴 회의록 형식으로 자동 정리합니다.',
    examples: ['회의 녹취록 → 공식 회의록', '채팅 대화 → 결정사항 정리', '인터뷰 내용 구조화'],
    tip: '날짜·참석자 정보를 함께 붙여넣으면 더 완성도 높은 회의록이 만들어져요.' },
  { id: 'report',     label: '보고서',   icon: '▤',  desc: '업무 보고서 작성',            color: '#3b82f6', type: 'ai',
    detail: '업무 내용을 현황·분석·결론·건의사항 구조의 공식 보고서 형식으로 변환합니다.',
    examples: ['주간·월간 업무 보고서', '프로젝트 진행 현황 보고', '이슈·장애 보고서'],
    tip: '핵심 수치나 배경 설명을 함께 넣으면 더 구체적인 보고서가 완성돼요.' },
  { id: 'kpi',        label: 'KPI',      icon: '◈',  desc: 'KPI 수치를 표로 정리',        color: '#f59e0b', type: 'ai',
    detail: '텍스트 안의 수치·지표·목표치를 추출해 KPI 현황표로 정리합니다. Numbers나 Excel에서 바로 활용 가능합니다.',
    examples: ['성과 지표 현황 정리', '목표 대비 달성률 표', '팀별 KPI 비교표'],
    tip: '목표값과 실적값을 같이 넣으면 달성률까지 자동으로 계산해줘요.' },
  { id: 'budget',     label: '예산표',   icon: '◫',  desc: '비용 항목을 표로 정리',       color: '#10b981', type: 'ai',
    detail: '비용·예산 관련 내용을 항목·금액·비고 형태의 표로 정리하고 CSV 파일로 저장합니다.',
    examples: ['프로젝트 비용 항목 정리', '행사·출장 예산표 작성', '월간 운영비 요약'],
    tip: '금액 단위(원·달러 등)와 기간을 명시하면 더 정확한 표가 만들어져요.' },
  { id: 'notebook',   label: '노트',     icon: '◻',  desc: '노트 형식으로 정리',          color: '#84cc16', type: 'ai',
    detail: '내용을 제목·소제목·핵심 포인트·메모 구조의 노트 형식으로 깔끔하게 정리합니다.',
    examples: ['강의·세미나 내용 정리', '책·아티클 독서 노트', '회의 중 메모 구조화'],
    tip: '나중에 참고하기 좋게 핵심 개념과 메모를 섹션별로 나눠줘요.' },
  { id: 'onboarding', label: '온보딩',   icon: '▷',  desc: '온보딩 가이드 생성',          color: '#f97316', type: 'ai',
    detail: '업무 내용을 신규 팀원이 이해하기 쉬운 단계별 온보딩 가이드 문서로 변환합니다.',
    examples: ['팀 업무 방식 → 신규 입사자 가이드', '프로젝트 인수인계 문서', '툴·시스템 사용 안내'],
    tip: '기존 팀원한테 공유하던 내용을 붙여넣으면 바로 온보딩 문서로 변환해줘요.' },
  { id: 'hwp',        label: 'HWP',      icon: '文',  desc: 'HWP 공문서 형식으로 변환',    color: '#64748b', type: 'ai',
    detail: '내용을 수신·발신·제목·본문·붙임 형식의 공문서 양식으로 변환하고 HWP 파일로 저장합니다. 개조식 규칙·Cheju Halla University 표기 자동 적용.',
    examples: ['업무 요청 → 공문서 변환', '협조 요청 공문 작성', '행정 문서 표준 양식화'],
    tip: '수신처·발신처·날짜를 함께 입력하면 완성도 높은 공문서가 만들어져요.' },
  // Phase 2: anchor-filing
  { id: 'filing',     label: '파일 분류', icon: '⊕',  desc: '파일을 프로젝트 폴더로 자동 분류', color: '#06b6d4', type: 'filing',
    detail: '파일명·발신자·유형 기반 점수 알고리즘으로 적합한 폴더를 제안합니다. 앵커 사업단 폴더 구조를 기본으로 사용합니다.',
    examples: ['교육부 수신 공문 → admin/official-docs/', '예산 집행 내역 → admin/budget/', '회의 녹취록 → meetings/'],
    tip: '파일명, 발신자, 파일 유형을 함께 입력하면 더 정확한 폴더를 제안해요.' },
  // Phase 3: anchor-agent
  { id: 'agent',      label: '행정 에이전트', icon: '◎', desc: '출장보고서·공문·주간보고 자동 작성', color: '#a855f7', type: 'ai',
    detail: '앵커 사업단 행정 업무를 자동화합니다. 출장보고서·공문 초안·주간보고 취합·예산 집행 분석·KPI 현황 보고를 개조식으로 작성합니다.',
    examples: ['출장보고서: 출장지·기간·목적·결과 입력', '공문 초안: 수신처·제목·내용 요점 입력', '주간보고 취합: 본부별 실적 붙여넣기'],
    tip: '"출장보고서 작성해줘", "공문 써줘", "주간보고 취합해줘" 처럼 자연어로 요청하세요.' },
  // Phase 4: slides-html (visual-explainer)
  { id: 'slides-html', label: '슬라이드 HTML', icon: '⧇', desc: '브라우저 발표자료 HTML 생성', color: '#2f4cb3', type: 'slides-html',
    detail: '앵커 브랜드 색상(#2f4cb3, #4af2c8)으로 완성된 HTML 프레젠테이션을 생성합니다. 키보드 탐색·전체화면 지원. 외부 앱 불필요.',
    examples: ['보고서 → 즉석 발표자료', '사업 현황 → 브리핑 슬라이드', '회의 내용 → 요약 프레젠테이션'],
    tip: '생성 후 브라우저에서 F키로 전체화면, ←/→로 슬라이드 이동. Ctrl+P로 PDF 저장.' },
]

// ─── NotebookLM 스킬 (클라우드, Google 계정 필요) ─────────────
export const NLM_SKILLS = [
  { id: 'nlm-slides',      label: '슬라이드',    icon: '⧉',  desc: '발표자료 PPTX 생성',         color: '#4285f4', type: 'nlm', ext: 'pptx', app: 'PowerPoint',
    detail: 'Google NotebookLM이 내용을 분석해 발표자료 PPTX 파일을 생성합니다. Google One AI Premium 유료 계정 필요.',
    examples: ['보고서 → 발표 슬라이드', '회의 자료 PPTX 변환', '프레젠테이션 초안 생성'],
    tip: 'Google One AI Premium 유료 계정이 필요합니다. PowerPoint 또는 Keynote에서 열 수 있어요.' },
  { id: 'nlm-quiz',        label: '퀴즈',        icon: '？',  desc: '학습 퀴즈 생성',              color: '#f4b400', type: 'nlm', ext: 'md',   app: 'TextEdit',
    detail: '내용 기반의 객관식 퀴즈를 생성합니다. 보기 순서는 랜덤으로 섞이며, Tidy 앱 안에서 바로 풀고 점수를 확인할 수 있습니다.',
    examples: ['학습 자료 복습 퀴즈', '교육 콘텐츠 이해도 확인', '팀 트레이닝 퀴즈'],
    tip: 'Tidy 앱 안에서 바로 풀고 점수를 확인할 수 있어요.' },
  { id: 'nlm-datatable',   label: '데이터 표',   icon: '⊞',  desc: '구조화된 CSV 표 생성',        color: '#0f9d58', type: 'nlm', ext: 'csv',  app: 'Numbers',
    detail: '텍스트에서 구조화된 데이터를 추출해 CSV 표로 저장합니다. Numbers나 Excel에서 바로 열 수 있습니다.',
    examples: ['텍스트 속 데이터 → 표 변환', '비정형 데이터 구조화', '리스트 → CSV 추출'],
    tip: 'Numbers나 Excel에서 바로 열 수 있는 CSV 파일로 저장돼요.' },
  { id: 'nlm-mindmap',     label: '마인드맵',    icon: '⊛',  desc: '마인드맵 시각화 생성',         color: '#ab47bc', type: 'nlm', ext: 'html', app: 'Safari',
    detail: '내용의 개념과 관계를 마인드맵으로 시각화합니다. 브라우저에서 열 수 있는 인터랙티브 HTML 파일로 저장됩니다.',
    examples: ['개념 관계 시각화', '아이디어 구조 정리', '복잡한 내용 한눈에 파악'],
    tip: '브라우저에서 열 수 있는 인터랙티브 HTML로 저장돼요.' },
]

// 전체 스킬 (기존 코드 호환용)
export const SKILLS = [...AI_SKILLS, ...NLM_SKILLS]

export function skillById(id) {
  return SKILLS.find(s => s.id === id) || { id, label: id, icon: '·', color: '#6b7280', type: 'ai' }
}

// 커스텀 스킬 캐시 (Home.jsx에서 로드한 커스텀 스킬)
let _customSkillsCache = []
export function setCustomSkillsCache(skills) { _customSkillsCache = skills || [] }
export function skillByIdWithCustom(id) {
  return SKILLS.find(s => s.id === id) || _customSkillsCache.find(s => s.id === id) || { id, label: id, icon: '·', color: '#6b7280', type: 'ai' }
}

// ─── SkillPanel ───────────────────────────────────────────────
export default function SkillPanel({ open, onClose, skillId, input, sourceItemId, skillDef }) {
  const [state, setState] = useState('idle') // idle | running | done | done-file | error | setup-required
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [nlmProgress, setNlmProgress] = useState(null)   // { progress, step, total }
  const [nlmResult, setNlmResult] = useState(null)        // { path, ext, label, app }
  const [nlmContent, setNlmContent] = useState(null)      // quiz/flashcard markdown text
  const [setupStatus, setSetupStatus] = useState(null)    // { step, message, python }
  const [installLog, setInstallLog] = useState('')
  const [installing, setInstalling] = useState(false)
  const [elapsed, setElapsed] = useState(0)  // 경과 시간 (초)
  // ── 번역 채팅 상태 ──
  const [chatMessages, setChatMessages] = useState([])   // [{role:'user'|'ai'|'error', text}]
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)
  const chatInputRef = useRef(null)
  const prevSkillRef = useRef(null)
  const progressUnsubRef = useRef(null)
  const elapsedTimerRef = useRef(null)

  const skill = skillDef || skillByIdWithCustom(skillId)
  const isNlm = skill.type === 'nlm'
  const isFiling = skill.type === 'filing'
  const isSlidesHtml = skillId === 'slides-html'
  const isTranslate = skillId === 'translate'
  const isSummary = skillId === 'summary'
  const isChatSkill = isTranslate || isSummary

  // filing 파싱용 상태
  const [filingResult, setFilingResult] = useState(null)

  // 대화 히스토리 (Claude API messages 형식, 서버 전송용)
  const [apiMessages, setApiMessages] = useState([])

  // 번역/요약 채팅 메시지 전송
  const sendChatMessage = useCallback(async (text, currentApiMessages) => {
    if (!text?.trim() || chatLoading) return
    const trimmed = text.trim()
    setChatMessages(prev => [...prev, { role: 'user', text: trimmed }])
    setChatInput('')
    setChatLoading(true)
    try {
      const customPrompt = skill.type === 'custom' ? (skill.systemPrompt || null) : null
      const res = await window.tidy?.skills.run({
        skillId,
        input: trimmed,
        messages: currentApiMessages || [],
        customPrompt,
      })
      if (res?.success) {
        setChatMessages(prev => [...prev, { role: 'ai', text: res.output }])
        setApiMessages(res.messages || [])
      } else {
        setChatMessages(prev => [...prev, { role: 'error', text: res?.error || '오류가 발생했습니다' }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'error', text: err.message }])
    }
    setChatLoading(false)
  }, [chatLoading, skillId])

  // 채팅 스크롤 자동 하단
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // 스킬 실행
  useEffect(() => {
    if (!open || !skillId || !input) return
    const key = `${skillId}::${input}`
    if (prevSkillRef.current === key) return
    prevSkillRef.current = key

    // 번역/요약 스킬: 채팅 모드로 초기 메시지 전송
    if (isChatSkill) {
      setChatMessages([])
      setChatInput('')
      setChatLoading(false)
      setApiMessages([])
      sendChatMessage(input, [])
      return
    }

    setState('running')
    setOutput('')
    setNlmProgress(null)
    setNlmResult(null)
    setNlmContent(null)
    setSetupStatus(null)
    setFilingResult(null)
    setCopied(false)
    setSaved(false)
    setElapsed(0)
    clearInterval(elapsedTimerRef.current)
    if (isNlm || isSlidesHtml) {
      elapsedTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    }

    // Phase 2: 파일 분류 스킬
    if (isFiling) {
      // input 형식: "파일명: xxx\n발신자: xxx\n유형: xxx" 또는 자유 텍스트
      const lines = input.split('\n').filter(Boolean)
      const fileInfo = {}
      for (const line of lines) {
        const m = line.match(/^(.+?)[:：]\s*(.+)$/)
        if (!m) { if (!fileInfo.fileName) fileInfo.fileName = line.trim(); continue }
        const key = m[1].trim().toLowerCase()
        const val = m[2].trim()
        if (key.includes('파일') || key.includes('file')) fileInfo.fileName = val
        else if (key.includes('발신') || key.includes('sender') || key.includes('domain')) fileInfo.senderDomain = val
        else if (key.includes('유형') || key.includes('type') || key.includes('확장')) fileInfo.fileType = val
        else if (key.includes('설명') || key.includes('desc')) fileInfo.description = val
      }
      if (!fileInfo.fileName && lines.length > 0) fileInfo.fileName = lines[0]
      window.tidy?.skills.runFiling(fileInfo)
        .then(res => {
          if (res?.success) {
            setFilingResult(res)
            setState('done-filing')
          } else {
            setOutput(res?.error || '분류 실패')
            setState('error')
          }
        })
        .catch(err => { setOutput(err.message); setState('error') })
      return
    }

    // Phase 4: 슬라이드 HTML
    if (isSlidesHtml) {
      window.tidy?.skills.runSlidesHtml({ input, sourceItemId })
        .then(res => {
          if (res?.success) {
            setOutput(`HTML 파일이 생성되어 브라우저에서 열렸습니다.\n\n저장 위치: ${res.filePath}`)
            setState('done-slides-html')
          } else {
            setOutput(res?.error || '생성 실패')
            setState('error')
          }
        })
        .catch(err => { setOutput(err.message); setState('error') })
      return
    }

    if (isNlm) {
      // NotebookLM 스킬 — 먼저 설치 상태 확인
      window.tidy?.nlm.checkSetup().then(status => {
        if (!status.ok) {
          setSetupStatus(status)
          setState('setup-required')
          return
        }

        // 진행 상황 수신
        const unsub = window.tidy?.nlm.onProgress((msg) => setNlmProgress(msg))
        progressUnsubRef.current = unsub

        window.tidy?.nlm.runSkill({ skillId, content: input, title: 'Tidy Input' })
          .then(res => {
            unsub?.()
            if (res.success) {
              setNlmResult(res)
              if (res.content) setNlmContent(res.content)
              setState('done-file')
            } else {
              setOutput(res.error || '알 수 없는 오류')
              if (res.setupStep) setSetupStatus({ step: res.setupStep, message: res.error })
              setState(res.setupStep ? 'setup-required' : 'error')
            }
          })
          .catch(err => {
            unsub?.()
            setOutput(err.message)
            setState('error')
          })
      })
    } else {
      // AI 스킬 (로컬) — 커스텀 스킬이면 systemPrompt 포함
      const customPrompt = skill.type === 'custom' ? (skill.systemPrompt || null) : null
      window.tidy?.skills.run({ skillId, input, sourceItemId, customPrompt })
        .then(res => {
          if (res?.success) {
            setOutput(res.output)
            setState('done')
          } else {
            setOutput(res?.error || '알 수 없는 오류')
            setState('error')
          }
        })
        .catch(err => {
          setOutput(err.message)
          setState('error')
        })
    }
  }, [open, skillId, input, sourceItemId])

  // 완료/오류 시 타이머 정지
  useEffect(() => {
    if (state !== 'running') {
      clearInterval(elapsedTimerRef.current)
    }
  }, [state])

  // 패널 닫히면 리셋
  useEffect(() => {
    if (!open) {
      prevSkillRef.current = null
      progressUnsubRef.current?.()
      progressUnsubRef.current = null
      clearInterval(elapsedTimerRef.current)
      setChatMessages([])
      setChatInput('')
      setChatLoading(false)
      setApiMessages([])
      setFilingResult(null)
    }
  }, [open])

  function handleCopy() {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSaveVault() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleInstall() {
    setInstalling(true)
    setInstallLog('')
    const unsub = window.tidy?.nlm.onInstallProgress(({ message }) => {
      setInstallLog(prev => prev + message)
    })
    await window.tidy?.nlm.install()
    unsub?.()
    setInstalling(false)
    // 재확인
    const status = await window.tidy?.nlm.checkSetup()
    if (status?.ok) {
      setState('idle')
      prevSkillRef.current = null
    } else {
      setSetupStatus(status)
    }
  }

  async function handleLogin() {
    await window.tidy?.nlm.login()
  }

  if (!open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-11 bottom-0 z-50 w-[480px] flex flex-col bg-[#0d0e16] border-l border-[#1c1e2c] shadow-2xl slide-in-right">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#1c1e2c] flex-shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: skill.color + '22', color: skill.color }}
          >
            {skill.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-[#e0e0f0]">{skill.label}</h3>
              {isNlm && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: '#4285f422', color: '#4285f4', border: '1px solid #4285f440' }}>
                  NotebookLM
                </span>
              )}
            </div>
            {input && (
              <p className="text-[11px] text-[#505272] truncate mt-0.5">
                {input.slice(0, 60)}{input.length > 60 ? '…' : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#14151e] transition-colors flex-shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        {/* ── 번역/요약 채팅 모드 ── */}
        {isChatSkill && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {/* 안내 헤더 */}
              <div className="flex items-center gap-2 pb-2 border-b border-[#1c1e2c]">
                <span className="text-[10px] text-[#3a3c50]">
                  {isSummary ? '요약 결과 · 추가 질문 가능' : '한↔영 자동 감지 번역 · 계속 입력 가능'}
                </span>
              </div>

              {/* 메시지 목록 */}
              {chatMessages.map((msg, i) => (
                <ChatMessage key={i} msg={msg} />
              ))}

              {/* 로딩 중 */}
              {chatLoading && (
                <div className="flex items-start gap-2">
                  <div className="bg-[#14151e] border border-[#1c1e2c] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ background: isSummary ? skill.color : '#0ea5e9', animationDelay: `${i * 180}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* 채팅 입력창 */}
            <div className="px-4 pb-4 pt-2 border-t border-[#1c1e2c] flex-shrink-0">
              <div className="flex items-end gap-2 bg-[#12131e] border border-[#1c1e2c] rounded-xl px-3 py-2 transition-colors"
                style={{ '--tw-border-opacity': 1 }}
                onFocus={e => e.currentTarget.style.borderColor = (isSummary ? skill.color : '#0ea5e9') + '66'}
                onBlur={e => e.currentTarget.style.borderColor = '#1c1e2c'}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendChatMessage(chatInput, apiMessages)
                    }
                  }}
                  placeholder={isSummary ? '요약 결과에 대해 질문하세요 (Enter로 전송)' : '번역할 텍스트 입력 (Enter로 전송, Shift+Enter 줄바꿈)'}
                  rows={2}
                  className="flex-1 bg-transparent text-[12px] text-[#c0c2d8] placeholder-[#3a3c50] resize-none outline-none leading-relaxed min-h-[40px] max-h-[120px]"
                  style={{ fieldSizing: 'content' }}
                  disabled={chatLoading}
                />
                <button
                  onClick={() => sendChatMessage(chatInput, apiMessages)}
                  disabled={chatLoading || !chatInput.trim()}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
                  style={{ background: chatInput.trim() && !chatLoading ? (isSummary ? skill.color : '#0ea5e9') : '#1c1e2c' }}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2L2 8l5 2 2 5 5-13z"/>
                  </svg>
                </button>
              </div>
              <p className="text-[9px] text-[#2a2c3a] mt-1.5 text-right">Enter 전송 · Shift+Enter 줄바꿈</p>
            </div>
          </>
        )}

        {/* Body */}
        {!isChatSkill && <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── 스킬 설명 카드 ── */}
          {skill.detail && state !== 'setup-required' && (
            <div className="flex items-start gap-3 p-3 rounded-xl border mb-4 flex-shrink-0"
              style={{ background: skill.color + '08', borderColor: skill.color + '25' }}>
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
                style={{ background: skill.color + '20', color: skill.color }}>
                {skill.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold mb-0.5" style={{ color: skill.color }}>{skill.label}</p>
                <p className="text-[11px] text-[#7a7c98] leading-relaxed">{skill.detail}</p>
                {isNlm && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: '#4285f415', color: '#4285f4', border: '1px solid #4285f430' }}>
                      Google NotebookLM
                    </span>
                    <span className="text-[9px] text-[#3a3c50]">· 처리에 수분 소요</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 설치/로그인 안내 ── */}
          {state === 'setup-required' && setupStatus && (
            <NlmSetupGuide
              status={setupStatus}
              installLog={installLog}
              installing={installing}
              onInstall={handleInstall}
              onLogin={handleLogin}
            />
          )}

          {/* ── 실행 중 (AI) ── */}
          {state === 'running' && !isNlm && !isSlidesHtml && (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: skill.color, animationDelay: `${i * 180}ms` }} />
                ))}
              </div>
              <p className="text-[12px] text-[#6b6e8c]">AI가 {skill.label}을 생성하는 중…</p>
            </div>
          )}

          {/* ── 실행 중 (슬라이드 HTML — Sonnet 사용으로 수십 초 소요) ── */}
          {state === 'running' && isSlidesHtml && (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center animate-spin flex-shrink-0"
                style={{ border: `2px solid ${skill.color}30`, borderTopColor: skill.color }}>
              </div>
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[#c0c2d8]">HTML 슬라이드 생성 중</p>
                <p className="text-[11px] text-[#505272] mt-1">Claude Sonnet이 발표자료를 디자인하는 중입니다</p>
                <p className="text-[14px] font-mono font-semibold mt-2" style={{ color: skill.color }}>
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </p>
              </div>
            </div>
          )}

          {/* ── 실행 중 (NLM) — 단계별 진행 ── */}
          {state === 'running' && isNlm && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center animate-spin flex-shrink-0"
                  style={{ border: `2px solid ${skill.color}30`, borderTopColor: skill.color }}>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#c0c2d8]">NotebookLM 처리 중</p>
                  <p className="text-[11px] text-[#505272]">Google 서버에서 AI가 처리 중입니다 — 수분 소요</p>
                </div>
                {/* 경과 시간 */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-[14px] font-mono font-semibold" style={{ color: elapsed > 120 ? '#f59e0b' : '#505272' }}>
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                  </p>
                  <p className="text-[9px] text-[#3a3c50]">경과</p>
                </div>
              </div>

              {/* 진행 단계 */}
              {[
                '노트북 생성 중...',
                '콘텐츠 업로드 중...',
                `${skill.label} 생성 중...`,
                '생성 완료 대기 중...',
                '파일 다운로드 중...',
              ].map((step, i) => {
                const stepNum = i + 1
                const current = nlmProgress?.step ?? 0
                const isDone = stepNum < current
                const isActive = stepNum === current
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] transition-all ${
                      isDone ? 'bg-emerald-500/20 text-emerald-400' :
                      isActive ? 'bg-[#4285f4]/20 text-[#4285f4]' :
                      'bg-[#1a1c28] text-[#3a3c50]'
                    }`}>
                      {isDone ? '✓' : stepNum}
                    </div>
                    <span className={`text-[12px] transition-colors flex-1 ${
                      isDone ? 'text-[#505272] line-through' :
                      isActive ? 'text-[#d0d2e4]' : 'text-[#3a3c50]'
                    }`}>
                      {nlmProgress?.step === stepNum ? nlmProgress.progress : step}
                    </span>
                    {isActive && (
                      <span className="text-[10px] text-[#505272] flex-shrink-0 animate-pulse">진행 중</span>
                    )}
                  </div>
                )
              })}

              {/* 오래 걸릴 때 안내 */}
              {elapsed > 60 && (
                <div className="rounded-lg bg-[#1a1c28] px-3 py-2 mt-1">
                  <p className="text-[10px] text-[#505272] leading-relaxed">
                    💡 NotebookLM은 Google 서버에서 브라우저 자동화로 처리되어 시간이 걸립니다.
                    {elapsed > 180 && ' 조금만 더 기다려 주세요.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── 오류 ── */}
          {state === 'error' && (
            <div className="rounded-xl bg-red-900/20 border border-red-800/40 p-4">
              <p className="text-[12px] text-red-400 font-medium mb-1">오류 발생</p>
              <p className="text-[11px] text-red-300/70 whitespace-pre-wrap">{output}</p>
            </div>
          )}

          {/* ── AI 스킬 완료 — 텍스트 출력 ── */}
          {state === 'done' && (
            <div className="prose prose-sm prose-invert max-w-none">
              <MarkdownOutput text={output} />
            </div>
          )}

          {/* ── Phase 2: 파일 분류 결과 ── */}
          {state === 'done-filing' && filingResult && (
            <FilingResult result={filingResult} skill={skill} />
          )}

          {/* ── Phase 4: 슬라이드 HTML 완료 ── */}
          {state === 'done-slides-html' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[#2f4cb3]/10 border border-[#2f4cb3]/30">
                <div className="w-8 h-8 rounded-full bg-[#2f4cb3]/20 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#4af2c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 8l4 4 8-7"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: '#4af2c8' }}>슬라이드 HTML 생성 완료</p>
                  <p className="text-[11px] text-[#8892a0]">브라우저에서 열렸습니다 · F키 전체화면 · ←/→ 이동</p>
                </div>
              </div>
              <div className="rounded-xl bg-[#12131e] border border-[#1c1e2c] p-3">
                <p className="text-[10px] text-[#3a3c50] mb-1 uppercase tracking-wider">파일 위치</p>
                <p className="text-[11px] text-[#6b6e8c] font-mono break-all">{output.split('\n').find(l => l.includes('/'))?.replace('저장 위치: ', '') || ''}</p>
              </div>
              <p className="text-[11px] text-[#505272]">브라우저에서 Ctrl+P → PDF로 저장하면 인쇄용 발표자료로 활용할 수 있어요.</p>
            </div>
          )}

          {/* ── NLM 퀴즈 — 인터랙티브 뷰어 ── */}
          {state === 'done-file' && skillId === 'nlm-quiz' && nlmContent && (
            <QuizViewer content={nlmContent} skill={skill} filePath={nlmResult?.path} />
          )}

          {/* ── NLM 플래시카드 — 인터랙티브 뷰어 ── */}
          {state === 'done-file' && skillId === 'nlm-flashcards' && nlmContent && (
            <FlashcardViewer content={nlmContent} skill={skill} filePath={nlmResult?.path} />
          )}

          {/* ── NLM 스킬 완료 — 파일 열림 ── */}
          {state === 'done-file' && nlmResult && skillId !== 'nlm-quiz' && skillId !== 'nlm-flashcards' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 8l4 4 8-7"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-emerald-400">{nlmResult.label} 생성 완료</p>
                  <p className="text-[11px] text-emerald-300/60">{nlmResult.app}에서 파일을 열었습니다</p>
                </div>
              </div>

              <div className="rounded-xl bg-[#12131e] border border-[#1c1e2c] p-3">
                <p className="text-[10px] text-[#3a3c50] mb-1 uppercase tracking-wider">저장 위치</p>
                <p className="text-[11px] text-[#6b6e8c] font-mono break-all">{nlmResult.path}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => window.tidy?.skills.openInApp({ skillId, content: nlmResult.path, fileName: nlmResult.label })}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1c1e2c] hover:border-[#252840] text-[#9a9cb8] bg-[#14151e] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V9"/>
                    <path d="M10 1h5v5M15 1L8 8"/>
                  </svg>
                  다시 열기
                </button>
              </div>
            </div>
          )}
        </div>}

        {/* Footer — AI 스킬 완료 시만 표시 (번역/요약 제외) */}
        {!isChatSkill && state === 'done' && (
          <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[#1c1e2c] flex-shrink-0">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                copied
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-[#9a9cb8] bg-[#14151e] border-[#1c1e2c] hover:border-[#252840]'
              }`}
            >
              {copied ? (
                <><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l4 4 8-7"/></svg>복사됨</>
              ) : (
                <><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/></svg>복사</>
              )}
            </button>

            <button
              onClick={handleSaveVault}
              className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                saved
                  ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
                  : 'text-[#9a9cb8] bg-[#14151e] border-[#1c1e2c] hover:border-[#252840]'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5L8 1.5z"/>
              </svg>
              {saved ? 'Vault 저장됨' : 'Vault에 저장'}
            </button>

            <button
              onClick={() => window.tidy?.skills.openInApp({ skillId, content: output, fileName: `${skill.label}_output` })}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border text-[#9a9cb8] bg-[#14151e] border-[#1c1e2c] hover:border-[#252840] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V9"/>
                <path d="M10 1h5v5M15 1L8 8"/>
              </svg>
              앱에서 열기
            </button>

            <div className="flex-1" />
            <span className="text-[10px] text-[#3a3c50]">자동 저장됨</span>
          </div>
        )}
      </div>
    </>,
    document.body
  )
}

// ─── 번역 채팅 말풍선 ─────────────────────────────────────────
function ChatMessage({ msg }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(msg.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      <span className="text-[9px] text-[#3a3c50] px-1">
        {msg.role === 'user' ? '원문' : msg.role === 'error' ? '오류' : '번역'}
      </span>
      <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap ${
        msg.role === 'user'
          ? 'bg-[#0ea5e9]/15 text-[#7dd3fc] rounded-tr-sm border border-[#0ea5e9]/20'
          : msg.role === 'error'
          ? 'bg-red-900/20 text-red-400 border border-red-800/30 rounded-tl-sm'
          : 'bg-[#14151e] text-[#d0d2e4] rounded-tl-sm border border-[#1c1e2c]'
      }`}>
        {msg.text}
      </div>
      {/* 복사 버튼 (번역 결과 & 원문 모두) */}
      {msg.role !== 'error' && (
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-all ${
            copied
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-[#3a3c50] hover:text-[#9a9cb8] hover:bg-[#1a1c28]'
          }`}
        >
          {copied ? (
            <>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8l4 4 8-7"/>
              </svg>
              복사됨
            </>
          ) : (
            <>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1"/>
                <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/>
              </svg>
              복사
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ─── NotebookLM 설치 가이드 ───────────────────────────────────
function NlmSetupGuide({ status, installLog, installing, onInstall, onLogin }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#4285f4]/8 border border-[#4285f4]/20">
        <div className="w-8 h-8 rounded-full bg-[#4285f4]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="8" cy="8" r="6.5"/>
            <path d="M8 5v4M8 11v1"/>
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#4285f4] mb-1">NotebookLM 설정 필요</p>
          <p className="text-[12px] text-[#6b8cc8] leading-relaxed">{status.message}</p>
        </div>
      </div>

      {/* 단계별 가이드 */}
      <div className="flex flex-col gap-3">
        {/* Step 1: Python */}
        <SetupStep
          num={1}
          title="Python 3.10+"
          done={status.step !== 'python'}
          active={status.step === 'python'}
          desc={status.step === 'python' ? 'python.org에서 설치 후 앱을 재시작하세요' : `발견: ${status.python || 'python3'}`}
        />

        {/* Step 2: Install */}
        <SetupStep
          num={2}
          title="notebooklm-py 설치"
          done={status.step === 'login'}
          active={status.step === 'install'}
          desc="pip install notebooklm-py[browser]"
          action={status.step === 'install' ? (
            <button
              onClick={onInstall}
              disabled={installing}
              className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ background: '#4285f420', color: '#4285f4', border: '1px solid #4285f440' }}
            >
              {installing ? '설치 중...' : '자동 설치'}
            </button>
          ) : null}
        />

        {/* Step 3: Login */}
        <SetupStep
          num={3}
          title="Google 계정 로그인"
          done={false}
          active={status.step === 'login'}
          desc="브라우저에서 Google 계정으로 1회 인증"
          action={status.step === 'login' ? (
            <button
              onClick={onLogin}
              className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: '#4285f420', color: '#4285f4', border: '1px solid #4285f440' }}
            >
              Terminal에서 로그인
            </button>
          ) : null}
        />
      </div>

      {/* 설치 로그 */}
      {installLog && (
        <div className="rounded-xl bg-[#0a0b10] border border-[#1a1c28] p-3 max-h-40 overflow-y-auto">
          <pre className="text-[10px] text-[#5a5c78] font-mono whitespace-pre-wrap leading-relaxed">{installLog}</pre>
        </div>
      )}

      {status.step === 'login' && (
        <p className="text-[10px] text-[#3a3c50] leading-relaxed">
          로그인 완료 후 다시 스킬을 실행하세요. 이후 로그인은 불필요합니다.
        </p>
      )}
    </div>
  )
}

function SetupStep({ num, title, done, active, desc, action }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
      done ? 'border-emerald-500/20 bg-emerald-500/5' :
      active ? 'border-[#4285f4]/30 bg-[#4285f4]/5' :
      'border-[#1c1e2c] bg-[#0d0e16]'
    }`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
        done ? 'bg-emerald-500/20 text-emerald-400' :
        active ? 'bg-[#4285f4]/20 text-[#4285f4]' :
        'bg-[#1a1c28] text-[#3a3c50]'
      }`}>
        {done ? '✓' : num}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-medium ${done ? 'text-emerald-400' : active ? 'text-[#c0c2d8]' : 'text-[#3a3c50]'}`}>
          {title}
        </p>
        <p className={`text-[11px] mt-0.5 font-mono ${done ? 'text-[#3a3c50]' : active ? 'text-[#505272]' : 'text-[#2a2c3a]'}`}>
          {desc}
        </p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

// ─── Phase 2: 파일 분류 결과 컴포넌트 ────────────────────────
function FilingResult({ result, skill }) {
  const [copied, setCopied] = useState(false)
  const confidence = result.confidence ?? 0
  const confColor = confidence >= 80 ? '#10b981' : confidence >= 55 ? '#f59e0b' : '#ef4444'

  function handleCopy() {
    navigator.clipboard.writeText(result.path || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 신뢰도 + 제안 경로 */}
      <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: confColor + '40', background: confColor + '08' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: confColor }}>
            {result.confidential ? '⚠ 기밀 파일' : result.needs_review ? '검토 필요' : '분류 완료'}
          </span>
          <span className="text-[13px] font-bold font-mono" style={{ color: confColor }}>{confidence}%</span>
        </div>
        {/* 신뢰도 바 */}
        <div className="h-1.5 rounded-full bg-[#1a1c28] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${confidence}%`, background: confColor }} />
        </div>
        {/* 제안 경로 */}
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[12px] font-mono text-[#e0e0f0] bg-[#12131e] rounded-lg px-3 py-2 break-all">
            {result.path}
          </code>
          <button onClick={handleCopy} className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-[#1c1e2c] bg-[#14151e] hover:border-[#252840] transition-colors text-[#6b6e8c]">
            {copied
              ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l4 4 8-7"/></svg>
              : <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/></svg>
            }
          </button>
        </div>
        {/* 분류 근거 */}
        {result.reason && (
          <p className="text-[11px] text-[#8892a0]">{result.reason}</p>
        )}
      </div>

      {/* 점수 breakdown */}
      {result.score_breakdown && (
        <div className="rounded-xl bg-[#12131e] border border-[#1c1e2c] p-3">
          <p className="text-[10px] text-[#3a3c50] uppercase tracking-wider mb-2">점수 분석</p>
          <div className="flex gap-3">
            {[
              { label: '발신자', key: 'sender', max: 3 },
              { label: '키워드', key: 'keyword', max: 2 },
              { label: '파일 유형', key: 'filetype', max: 1 },
            ].map(({ label, key, max }) => {
              const val = result.score_breakdown[key] ?? 0
              return (
                <div key={key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[11px] font-mono font-semibold" style={{ color: val > 0 ? skill.color : '#3a3c50' }}>
                    {val}/{max}
                  </div>
                  <div className="text-[10px] text-[#505272]">{label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 대안 경로 */}
      {result.alternatives?.length > 0 && (
        <div className="rounded-xl bg-[#12131e] border border-[#1c1e2c] p-3">
          <p className="text-[10px] text-[#3a3c50] uppercase tracking-wider mb-2">대안 경로</p>
          <div className="flex flex-col gap-1.5">
            {result.alternatives.map((alt, i) => (
              <button
                key={i}
                onClick={() => navigator.clipboard.writeText(alt)}
                className="text-left text-[11px] font-mono text-[#6b6e8c] hover:text-[#9a9cb8] px-2 py-1 rounded-lg hover:bg-[#1a1c28] transition-colors"
              >
                {alt}
              </button>
            ))}
          </div>
        </div>
      )}

      {result.confidential && (
        <div className="rounded-xl bg-red-900/20 border border-red-800/40 p-3">
          <p className="text-[12px] text-red-400 font-medium">⚠ 개인정보 포함 의심</p>
          <p className="text-[11px] text-red-300/60 mt-0.5">admin/confidential/ 폴더에 격리 후 담당자 확인이 필요합니다.</p>
        </div>
      )}
    </div>
  )
}

// ─── 마크다운 렌더러 ──────────────────────────────────────────
export function MarkdownOutput({ text }) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-[13px] font-semibold text-[#e0e0f0] mt-5 mb-2 first:mt-0">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-[15px] font-semibold text-[#e8e8f8] mt-4 mb-3 first:mt-0">{line.slice(2)}</h1>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-[12px] font-semibold text-[#c8c8d8] mt-3 mb-1.5">{line.slice(4)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 mb-1">
          <span className="text-[#505272] mt-[5px] text-[8px]">●</span>
          <span className="text-[12px] text-[#b0b2cc] leading-relaxed flex-1">{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\./)[1]
      elements.push(
        <div key={i} className="flex items-start gap-2 mb-1">
          <span className="text-[10px] text-[#505272] min-w-[16px] mt-[3px] font-mono">{num}.</span>
          <span className="text-[12px] text-[#b0b2cc] leading-relaxed flex-1">{renderInline(line.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      )
    } else if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="border-l-2 border-[#252840] pl-3 my-2">
          <p className="text-[11px] text-[#6b6e8c] italic">{line.slice(2)}</p>
        </div>
      )
    } else if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].replace(/\|/g, '').replace(/-/g, '').trim()) { i++; continue }
        tableLines.push(lines[i])
        i++
      }
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
          <table className="w-full text-[11px] border-collapse">
            {tableLines.map((tl, ti) => {
              const cells = tl.split('|').slice(1, -1).map(c => c.trim())
              return (
                <tr key={ti} className={ti === 0 ? 'border-b border-[#252840]' : ''}>
                  {cells.map((c, ci) => (
                    ti === 0
                      ? <th key={ci} className="text-left text-[#8082a0] font-semibold py-1.5 px-2 first:pl-0">{c}</th>
                      : <td key={ci} className="text-[#b0b2cc] py-1 px-2 first:pl-0 border-b border-[#1a1c28]">{c}</td>
                  ))}
                </tr>
              )
            })}
          </table>
        </div>
      )
      continue
    } else if (line.startsWith('---') || line.startsWith('***')) {
      elements.push(<hr key={i} className="border-[#1c1e2c] my-3" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />)
    } else {
      elements.push(<p key={i} className="text-[12px] text-[#b0b2cc] leading-relaxed mb-1">{renderInline(line)}</p>)
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="text-[#e0e0f0] font-semibold">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-[#1a1c2e] text-[#a78bfa] px-1 py-0.5 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="text-[#9a9cb8] italic">{part.slice(1, -1)}</em>
    return part
  })
}

// ─── 배열 셔플 (Fisher-Yates) ─────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── 퀴즈 파서 ───────────────────────────────────────────────
// NotebookLM 실제 출력 포맷:
//   ## Question N
//   질문 내용?
//   - [x] 정답
//   - [ ] 오답1
//   - [ ] 오답2
//   - [ ] 오답3
//   **Hint:** 힌트
function parseQuiz(markdown) {
  const questions = []
  const text = markdown.replace(/\r\n/g, '\n')
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

  // ## Question N 또는 ## 문제 N 으로 블록 분리
  const blocks = text.split(/\n(?=##\s+(?:Question|문제)\s*\d+)/i)

  for (const block of blocks) {
    if (!block.trim()) continue

    const lines = block.split('\n')
    let questionLines = []
    const options = []
    let correctIndex = -1
    let hint = ''
    let pastHeader = false

    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue

      // ## Question N 헤더 — 이후를 질문으로 파싱 시작
      if (/^##\s+(?:Question|문제)\s*\d+/i.test(line)) {
        pastHeader = true
        continue
      }

      // 최상위 제목(#) 스킵
      if (/^#[^#]/.test(line)) continue

      // 보기: - [x] 정답  /  - [ ] 오답
      const optMatch = line.match(/^-\s+\[([x ])\]\s+(.+)/i)
      if (optMatch) {
        const isCorrect = optMatch[1].toLowerCase() === 'x'
        if (isCorrect) correctIndex = options.length
        options.push(optMatch[2].trim())
        continue
      }

      // Hint / 설명 라인
      const hintMatch = line.match(/^\*\*(?:Hint|힌트|설명|Explanation)[:\s]\*\*\s*(.+)/i)
                     || line.match(/^\*\*(?:Hint|힌트|설명|Explanation):\*\*\s*(.*)/i)
      if (hintMatch) {
        hint = hintMatch[1].replace(/\*\*/g, '').trim()
        continue
      }

      // 질문 본문 (헤더 이후, 보기 이전)
      if (pastHeader && options.length === 0) {
        const cleaned = line.replace(/\*\*/g, '').trim()
        if (cleaned) questionLines.push(cleaned)
      }
    }

    const questionText = questionLines.join(' ').trim()
    if (questionText && options.length >= 2 && correctIndex >= 0) {
      const correctText = options[correctIndex]
      const shuffled = shuffleArray(options)
      const newCorrectIndex = shuffled.indexOf(correctText)
      questions.push({
        question: questionText,
        options: shuffled.map((t, i) => ({ letter: LETTERS[i], text: t })),
        answer: LETTERS[newCorrectIndex],
        explanation: hint,
      })
    }
  }

  // 블록 분리 실패 시 --- 구분자로 재시도
  if (questions.length === 0) {
    const fallbackBlocks = text.split(/\n\s*---+\s*\n/)
    for (const block of fallbackBlocks) {
      const lines = block.split('\n')
      let questionLines = []
      const options = []
      let correctIndex = -1
      let hint = ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        if (/^#/.test(line)) continue
        const optMatch = line.match(/^-\s+\[([x ])\]\s+(.+)/i)
        if (optMatch) {
          if (optMatch[1].toLowerCase() === 'x') correctIndex = options.length
          options.push(optMatch[2].trim())
          continue
        }
        const hintMatch = line.match(/^\*\*(?:Hint|힌트|설명)[:\s]\*\*\s*(.+)/i)
        if (hintMatch) { hint = hintMatch[1]; continue }
        if (options.length === 0) {
          const cleaned = line.replace(/^\*?\*?(?:Question|문제)\s*\d*[.):]?\s*\*?\*?/i, '').replace(/\*\*/g, '').trim()
          if (cleaned) questionLines.push(cleaned)
        }
      }
      const questionText = questionLines.join(' ').trim()
      if (questionText && options.length >= 2 && correctIndex >= 0) {
        const correctText = options[correctIndex]
        const shuffled = shuffleArray(options)
        const newCorrectIndex = shuffled.indexOf(correctText)
        questions.push({
          question: questionText,
          options: shuffled.map((t, i) => ({ letter: ['A','B','C','D'][i], text: t })),
          answer: ['A','B','C','D'][newCorrectIndex],
          explanation: hint,
        })
      }
    }
  }

  return questions
}

// ─── 플래시카드 파서 ─────────────────────────────────────────
function parseFlashcards(markdown) {
  const cards = []
  const text = markdown.replace(/\r\n/g, '\n')
  const blocks = text.split(/\n\s*---+\s*\n/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)

    // 형식 1: **Front:** ... / **Back:** ...
    // 형식 2: **질문:** ... / **답:** ...
    // 형식 3: 첫 줄 = front, 나머지 = back
    let front = ''
    let back = ''
    const frontRe = /^\*?\*?\s*(?:front|앞면|질문|term|개념)[:\s：]\s*\*?\*?\s*(.*)/i
    const backRe  = /^\*?\*?\s*(?:back|뒷면|답|answer|definition|정의)[:\s：]\s*\*?\*?\s*(.*)/i

    let hasFrontBack = false
    const backLines = []

    for (const line of lines) {
      const fm = line.match(frontRe)
      const bm = line.match(backRe)
      if (fm) { front = fm[1].replace(/\*\*/g, '').trim(); hasFrontBack = true }
      else if (bm) { back = bm[1].replace(/\*\*/g, '').trim(); hasFrontBack = true }
      else if (hasFrontBack && back === '') { backLines.push(line.replace(/\*\*/g, '')) }
    }

    if (hasFrontBack) {
      if (back === '' && backLines.length) back = backLines.join(' ')
    } else {
      // 형식 3: 첫 줄 = front (굵게 or 그냥), 나머지 = back
      const nonEmpty = lines.filter(l => l)
      if (nonEmpty.length >= 2) {
        front = nonEmpty[0].replace(/\*\*/g, '').trim()
        back = nonEmpty.slice(1).join(' ').replace(/\*\*/g, '').trim()
      }
    }

    if (front && back) cards.push({ front, back })
  }
  return cards
}

// ─── 퀴즈 뷰어 ───────────────────────────────────────────────
function QuizViewer({ content, skill, filePath }) {
  const questions = parseQuiz(content)
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answers, setAnswers] = useState([]) // { correct: bool }
  const [finished, setFinished] = useState(false)

  if (!questions.length) {
    return (
      <div className="text-center py-8 text-[12px] text-[#505272]">
        퀴즈를 파싱하지 못했습니다.<br/>
        {filePath && <span className="text-[11px] font-mono text-[#3a3c50]">{filePath}</span>}
      </div>
    )
  }

  const q = questions[current]
  const total = questions.length
  const isAnswered = selected !== null
  const correctLetter = q?.answer?.toUpperCase()

  function handleSelect(letter) {
    if (isAnswered) return
    setSelected(letter)
  }

  function handleNext() {
    const isCorrect = selected?.toUpperCase() === correctLetter
    const newAnswers = [...answers, { correct: isCorrect }]
    setAnswers(newAnswers)
    if (current + 1 >= total) {
      setFinished(true)
    } else {
      setCurrent(c => c + 1)
      setSelected(null)
    }
  }

  function handleRestart() {
    setCurrent(0)
    setSelected(null)
    setAnswers([])
    setFinished(false)
  }

  const score = answers.filter(a => a.correct).length

  if (finished) {
    const pct = Math.round((score / total) * 100)
    const grade = pct >= 90 ? '🏆 완벽!' : pct >= 70 ? '👍 잘했어요' : pct >= 50 ? '📚 복습 필요' : '💪 다시 도전'
    return (
      <div className="flex flex-col items-center gap-5 py-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
          style={{ background: skill.color + '20', color: skill.color, border: `2px solid ${skill.color}40` }}>
          {pct}%
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#e0e0f0]">{grade}</p>
          <p className="text-[12px] text-[#6b6e8c] mt-1">{total}문제 중 {score}개 정답</p>
        </div>
        {/* 문제별 결과 */}
        <div className="w-full flex flex-wrap gap-2 justify-center">
          {answers.map((a, i) => (
            <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
              a.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {a.correct ? '○' : '×'}
            </div>
          ))}
        </div>
        <button
          onClick={handleRestart}
          className="px-5 py-2 rounded-xl text-[12px] font-medium transition-colors"
          style={{ background: skill.color + '20', color: skill.color, border: `1px solid ${skill.color}40` }}
        >
          다시 풀기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 진행 표시 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#1a1c28] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(current / total) * 100}%`, background: skill.color }} />
        </div>
        <span className="text-[11px] text-[#505272] flex-shrink-0">{current + 1} / {total}</span>
      </div>

      {/* 질문 */}
      <div className="rounded-xl bg-[#12131e] border border-[#1c1e2c] p-4">
        <p className="text-[13px] font-medium text-[#d0d2e4] leading-relaxed">{q.question}</p>
      </div>

      {/* 보기 */}
      <div className="flex flex-col gap-2">
        {q.options.map((opt) => {
          const isSelected = selected === opt.letter
          const isCorrect = opt.letter.toUpperCase() === correctLetter
          let btnStyle = 'border-[#1c1e2c] bg-[#0d0e16] text-[#9a9cb8] hover:border-[#252840]'
          if (isAnswered) {
            if (isCorrect) btnStyle = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
            else if (isSelected && !isCorrect) btnStyle = 'border-red-500/50 bg-red-500/10 text-red-300'
            else btnStyle = 'border-[#1c1e2c] bg-[#0d0e16] text-[#505272]'
          } else if (isSelected) {
            btnStyle = 'border-[#4285f4]/50 bg-[#4285f4]/10 text-[#7ab3ff]'
          }
          return (
            <button
              key={opt.letter}
              onClick={() => handleSelect(opt.letter)}
              className={`flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl border transition-all ${btnStyle} ${!isAnswered ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                style={{ background: isAnswered && isCorrect ? '#10b98120' : '#1a1c28', color: isAnswered && isCorrect ? '#10b981' : 'inherit' }}>
                {opt.letter}
              </span>
              <span className="text-[12px] leading-relaxed">{opt.text}</span>
            </button>
          )
        })}
      </div>

      {/* 설명 */}
      {isAnswered && q.explanation && (
        <div className="rounded-xl bg-[#4285f4]/8 border border-[#4285f4]/20 p-3">
          <p className="text-[10px] text-[#4285f4] font-semibold mb-1 uppercase tracking-wider">설명</p>
          <p className="text-[12px] text-[#8ab3e8] leading-relaxed">{q.explanation}</p>
        </div>
      )}

      {/* 다음 버튼 */}
      {isAnswered && (
        <button
          onClick={handleNext}
          className="w-full py-2.5 rounded-xl text-[12px] font-semibold transition-colors"
          style={{ background: skill.color + '20', color: skill.color, border: `1px solid ${skill.color}40` }}
        >
          {current + 1 >= total ? '결과 보기' : '다음 문제 →'}
        </button>
      )}
    </div>
  )
}

// ─── 플래시카드 뷰어 ─────────────────────────────────────────
function FlashcardViewer({ content, skill, filePath }) {
  const cards = parseFlashcards(content)
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState(new Set())
  const [finished, setFinished] = useState(false)

  if (!cards.length) {
    return (
      <div className="text-center py-8 text-[12px] text-[#505272]">
        플래시카드를 파싱하지 못했습니다.
      </div>
    )
  }

  const card = cards[current]
  const total = cards.length

  function handleKnow(isKnown) {
    const newKnown = new Set(known)
    if (isKnown) newKnown.add(current)
    setKnown(newKnown)
    if (current + 1 >= total) {
      setFinished(true)
    } else {
      setCurrent(c => c + 1)
      setFlipped(false)
    }
  }

  function handleRestart() {
    setCurrent(0)
    setFlipped(false)
    setKnown(new Set())
    setFinished(false)
  }

  if (finished) {
    const knownCount = known.size
    const pct = Math.round((knownCount / total) * 100)
    return (
      <div className="flex flex-col items-center gap-5 py-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
          style={{ background: skill.color + '20', color: skill.color, border: `2px solid ${skill.color}40` }}>
          {pct}%
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#e0e0f0]">
            {pct >= 80 ? '완벽해요! 🎉' : pct >= 50 ? '잘 하고 있어요 👍' : '조금 더 연습해요 💪'}
          </p>
          <p className="text-[12px] text-[#6b6e8c] mt-1">{total}장 중 {knownCount}장 알고 있음</p>
        </div>
        <button
          onClick={handleRestart}
          className="px-5 py-2 rounded-xl text-[12px] font-medium transition-colors"
          style={{ background: skill.color + '20', color: skill.color, border: `1px solid ${skill.color}40` }}
        >
          처음부터
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 진행 표시 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#1a1c28] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(current / total) * 100}%`, background: skill.color }} />
        </div>
        <span className="text-[11px] text-[#505272] flex-shrink-0">{current + 1} / {total}</span>
      </div>

      {/* 카드 */}
      <div
        onClick={() => setFlipped(f => !f)}
        className="relative cursor-pointer rounded-2xl border transition-all duration-300 select-none"
        style={{
          minHeight: '200px',
          border: `1px solid ${flipped ? skill.color + '40' : '#1c1e2c'}`,
          background: flipped ? skill.color + '08' : '#12131e',
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3">
          <span className="text-[10px] uppercase tracking-widest font-semibold"
            style={{ color: flipped ? skill.color : '#3a3c50' }}>
            {flipped ? '뒷면 (답)' : '앞면 (클릭하여 뒤집기)'}
          </span>
          <p className="text-[14px] font-medium leading-relaxed"
            style={{ color: flipped ? '#e0e0f0' : '#b0b2cc' }}>
            {flipped ? card.back : card.front}
          </p>
        </div>

        {/* 뒤집기 힌트 */}
        {!flipped && (
          <div className="absolute bottom-3 right-3 opacity-30">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={skill.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6"/>
              <path d="M10 12l4 2-2-4"/>
            </svg>
          </div>
        )}
      </div>

      {/* 알고 있는지 버튼 (뒤집은 후에만) */}
      {flipped && (
        <div className="flex gap-2">
          <button
            onClick={() => handleKnow(false)}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors"
          >
            모르겠어요
          </button>
          <button
            onClick={() => handleKnow(true)}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 transition-colors"
          >
            알고 있어요
          </button>
        </div>
      )}
    </div>
  )
}
