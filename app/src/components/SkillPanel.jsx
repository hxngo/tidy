import { useState, useEffect, useRef } from 'react'

// ─── AI 스킬 (로컬, 빠름) ──────────────────────────────────────
export const AI_SKILLS = [
  { id: 'summary',    label: '요약',     icon: '✦',  desc: '핵심 내용 3줄 요약',          color: '#6366f1', type: 'ai' },
  { id: 'translate',  label: '번역',     icon: '⇄',  desc: '한↔영 자동 번역',             color: '#0ea5e9', type: 'ai' },
  { id: 'minutes',    label: '회의록',   icon: '◉',  desc: '대화를 회의록으로 정리',        color: '#8b5cf6', type: 'ai' },
  { id: 'report',     label: '보고서',   icon: '▤',  desc: '업무 보고서 작성',              color: '#3b82f6', type: 'ai' },
  { id: 'kpi',        label: 'KPI',      icon: '◈',  desc: 'KPI 수치를 표로 정리',          color: '#f59e0b', type: 'ai' },
  { id: 'slides',     label: '슬라이드', icon: '▨',  desc: '발표자료 구조로 변환',          color: '#ec4899', type: 'ai' },
  { id: 'budget',     label: '예산표',   icon: '◫',  desc: '비용 항목을 표로 정리',         color: '#10b981', type: 'ai' },
  { id: 'notebook',   label: '노트',     icon: '◻',  desc: '노트 형식으로 정리',            color: '#84cc16', type: 'ai' },
  { id: 'onboarding', label: '온보딩',   icon: '▷',  desc: '온보딩 가이드 생성',            color: '#f97316', type: 'ai' },
  { id: 'hwp',        label: '공문서',   icon: '文',  desc: 'HWP 공문서 형식으로 변환',      color: '#64748b', type: 'ai' },
]

// ─── NotebookLM 스킬 (클라우드, Google 계정 필요) ─────────────
export const NLM_SKILLS = [
  { id: 'nlm-slides',      label: '슬라이드',    icon: '⧉',  desc: '발표자료 PPTX 생성',          color: '#4285f4', type: 'nlm', ext: 'pptx', app: 'Keynote' },
  { id: 'nlm-audio',       label: '오디오 요약', icon: '◎',  desc: '팟캐스트 형식 MP3 생성',       color: '#ea4335', type: 'nlm', ext: 'mp3',  app: 'QuickTime' },
  { id: 'nlm-video',       label: '영상 요약',   icon: '▶',  desc: '설명 영상 MP4 생성',           color: '#db4437', type: 'nlm', ext: 'mp4',  app: 'QuickTime' },
  { id: 'nlm-infographic', label: '인포그래픽',  icon: '◑',  desc: '시각화 이미지 PNG 생성',       color: '#0f9d58', type: 'nlm', ext: 'png',  app: 'Preview' },
  { id: 'nlm-quiz',        label: '퀴즈',        icon: '？',  desc: '학습 퀴즈 생성',              color: '#f4b400', type: 'nlm', ext: 'md',   app: 'TextEdit' },
  { id: 'nlm-flashcards',  label: '플래시카드',  icon: '⊟',  desc: '암기 카드 생성',              color: '#ff6d00', type: 'nlm', ext: 'md',   app: 'TextEdit' },
  { id: 'nlm-datatable',   label: '데이터 표',   icon: '⊞',  desc: '구조화된 CSV 표 생성',        color: '#0f9d58', type: 'nlm', ext: 'csv',  app: 'Numbers' },
  { id: 'nlm-report',      label: '브리핑 문서', icon: '≡',  desc: '브리핑 Markdown 문서 생성',    color: '#4285f4', type: 'nlm', ext: 'md',   app: 'TextEdit' },
  { id: 'nlm-mindmap',     label: '마인드맵',    icon: '⊛',  desc: '마인드맵 JSON 생성',           color: '#ab47bc', type: 'nlm', ext: 'json', app: 'TextEdit' },
]

// 전체 스킬 (기존 코드 호환용)
export const SKILLS = [...AI_SKILLS, ...NLM_SKILLS]

export function skillById(id) {
  return SKILLS.find(s => s.id === id) || { id, label: id, icon: '·', color: '#6b7280', type: 'ai' }
}

// ─── SkillPanel ───────────────────────────────────────────────
export default function SkillPanel({ open, onClose, skillId, input, sourceItemId }) {
  const [state, setState] = useState('idle') // idle | running | done | done-file | error | setup-required
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [nlmProgress, setNlmProgress] = useState(null)   // { progress, step, total }
  const [nlmResult, setNlmResult] = useState(null)        // { path, ext, label, app }
  const [setupStatus, setSetupStatus] = useState(null)    // { step, message, python }
  const [installLog, setInstallLog] = useState('')
  const [installing, setInstalling] = useState(false)
  const prevSkillRef = useRef(null)
  const progressUnsubRef = useRef(null)

  const skill = skillById(skillId)
  const isNlm = skill.type === 'nlm'

  // 스킬 실행
  useEffect(() => {
    if (!open || !skillId || !input) return
    const key = `${skillId}::${input}`
    if (prevSkillRef.current === key) return
    prevSkillRef.current = key

    setState('running')
    setOutput('')
    setNlmProgress(null)
    setNlmResult(null)
    setSetupStatus(null)
    setCopied(false)
    setSaved(false)

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
      // AI 스킬 (로컬)
      window.tidy?.skills.run({ skillId, input, sourceItemId })
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

  // 패널 닫히면 리셋
  useEffect(() => {
    if (!open) {
      prevSkillRef.current = null
      progressUnsubRef.current?.()
      progressUnsubRef.current = null
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] flex flex-col bg-[#0d0e16] border-l border-[#1c1e2c] shadow-2xl slide-in-right">

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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

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
          {state === 'running' && !isNlm && (
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

          {/* ── 실행 중 (NLM) — 단계별 진행 ── */}
          {state === 'running' && isNlm && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center animate-spin"
                  style={{ border: `2px solid ${skill.color}30`, borderTopColor: skill.color }}>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#c0c2d8]">NotebookLM 처리 중</p>
                  <p className="text-[11px] text-[#505272]">완료까지 30초~수분 소요될 수 있습니다</p>
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
                    <span className={`text-[12px] transition-colors ${
                      isDone ? 'text-[#505272] line-through' :
                      isActive ? 'text-[#d0d2e4]' : 'text-[#3a3c50]'
                    }`}>
                      {nlmProgress?.step === stepNum ? nlmProgress.progress : step}
                    </span>
                  </div>
                )
              })}
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

          {/* ── NLM 스킬 완료 — 파일 열림 ── */}
          {state === 'done-file' && nlmResult && (
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
                <button
                  onClick={() => {
                    const { exec } = require?.('child_process') // Electron 환경 아님
                    window.tidy?.obsidian?.open?.(nlmResult.path)
                  }}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1c1e2c] hover:border-[#252840] text-[#9a9cb8] bg-[#14151e] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/>
                  </svg>
                  Finder에서 보기
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — AI 스킬 완료 시만 표시 */}
        {state === 'done' && (
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
    </>
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

// ─── 마크다운 렌더러 ──────────────────────────────────────────
function MarkdownOutput({ text }) {
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
