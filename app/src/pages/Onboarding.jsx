import { useState, useEffect, useRef } from 'react'
import {
  IconSearch, IconBook, IconList, IconLayers,
  IconCheck, IconLock,
  IconKakao, IconIMessage, IconTelegram, IconLine,
} from '../components/Icons.jsx'

const TOTAL_STEPS = 5

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1)
  const [apiKey, setApiKey] = useState('')
  const [vaultPath, setVaultPath] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fdaStatus, setFdaStatus] = useState(null)
  const [isMac, setIsMac] = useState(false)
  const [requestingFda, setRequestingFda] = useState(false)

  // ── Step 3: user_question_generator ──────────────────────────
  const [chatHistory, setChatHistory] = useState([])   // { role, content }
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [questionsDone, setQuestionsDone] = useState(false)
  const chatEndRef = useRef(null)

  // ── Step 4: Cold Start 확인 ───────────────────────────────────
  const [analyzedProfile, setAnalyzedProfile] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [profileConfirmed, setProfileConfirmed] = useState(false)

  // FDA 권한 확인 (Step 5)
  useEffect(() => {
    if (step === 5) {
      window.tidy?.permissions.check().then((res) => {
        setIsMac(res?.platform === 'darwin')
        setFdaStatus(res?.hasAccess ?? true)
      })
    }
  }, [step])

  // Step 3 진입 시 첫 질문 자동 생성
  useEffect(() => {
    if (step === 3 && chatHistory.length === 0) {
      loadNextQuestion([])
    }
  }, [step])

  // 챗 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  async function loadNextQuestion(history) {
    setChatLoading(true)
    try {
      const answeredCount = history.filter(m => m.role === 'user').length
      const res = await window.tidy?.profile.nextQuestion({ history, answeredCount })
      if (res?.done) {
        setQuestionsDone(true)
      } else if (res?.question) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: res.question }])
      }
    } catch (e) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: '질문 생성 중 오류가 발생했습니다. 다음으로 진행해 주세요.',
      }])
      setQuestionsDone(true)
    } finally {
      setChatLoading(false)
    }
  }

  async function handleChatSubmit(e) {
    e?.preventDefault()
    const text = chatInput.trim()
    if (!text || chatLoading) return
    setChatInput('')
    const newHistory = [...chatHistory, { role: 'user', content: text }]
    setChatHistory(newHistory)
    await loadNextQuestion(newHistory)
  }

  // Step 4: 대화 기반 프로필 분석
  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await window.tidy?.profile.analyze({ history: chatHistory })
      if (res?.profile) {
        setAnalyzedProfile(res.profile)
        setStep(4)
      }
    } catch (e) {
      setError('프로필 분석 중 오류: ' + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // Step 4: 프로필 확인 후 저장
  async function handleConfirmProfile() {
    if (!analyzedProfile) return
    await window.tidy?.profile.save(analyzedProfile)
    // people vault에 팀원 등록
    for (const name of analyzedProfile.teammates || []) {
      if (name) await window.tidy?.people.upsert({ name })
    }
    setProfileConfirmed(true)
    setStep(5)
  }

  async function handleComplete() {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.tidy?.onboarding.complete({
        apiKey: apiKey.trim(),
        workTypes: analyzedProfile?.workTypes || [],
        vaultPath: vaultPath.trim(),
      })
      if (result?.error) { setError(result.error); setIsSubmitting(false); return }
      onComplete()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRequestFDA() {
    setRequestingFda(true)
    try {
      const res = await window.tidy?.permissions.requestFDA()
      setFdaStatus(res?.hasAccess ?? false)
    } finally {
      setRequestingFda(false)
    }
  }

  // 프로필 항목 렌더 헬퍼
  function ProfileRow({ label, value }) {
    if (!value || (Array.isArray(value) && value.length === 0)) return null
    return (
      <div className="flex gap-3 py-2 border-b border-[#222]">
        <span className="text-xs text-[#555] w-20 flex-shrink-0 pt-0.5">{label}</span>
        <span className="text-xs text-[#c8c8d8] flex-1">
          {Array.isArray(value) ? value.join(', ') : value}
        </span>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#0f0f0f] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* 진행 바 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i + 1 <= step ? 'w-8 bg-[#d4d4d8]' : 'w-4 bg-[#2a2a2a]'
              }`}
            />
          ))}
        </div>

        <div className={`bg-[#161616] border border-[#2a2a2a] rounded-2xl ${step === 3 ? 'p-0 overflow-hidden' : 'p-8'}`}>
          <p className={`text-xs text-[#404040] mb-6 text-center ${step === 3 ? 'pt-6' : ''}`}>
            {step} / {TOTAL_STEPS}
          </p>

          {error && (
            <div className="mb-4 mx-8 px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ─── Step 1: 환영 ───────────────────────────────── */}
          {step === 1 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg width="44" height="44" viewBox="0 0 18 18" fill="none" className="text-[#d4d4d8]">
                  <rect x="2" y="4"  width="14" height="2" rx="1" fill="currentColor"/>
                  <rect x="2" y="8"  width="10" height="2" rx="1" fill="currentColor" opacity="0.7"/>
                  <rect x="2" y="12" width="6"  height="2" rx="1" fill="currentColor" opacity="0.4"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-[#e5e5e5] mb-3">Tidy에 오신 것을 환영합니다</h1>
              <p className="text-sm text-[#737373] leading-relaxed mb-8">
                업무 메시지를 자동으로 분류하고 태스크를 추출해드립니다.
                <br />
                Obsidian 호환 마크다운으로 모든 데이터를 저장합니다.
              </p>
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 bg-[#d4d4d8] text-[#111111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] transition-colors"
              >
                시작하기
              </button>
            </div>
          )}

          {/* ─── Step 2: API 키 ──────────────────────────────── */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">Claude API 키 설정</h2>
              <p className="text-sm text-[#737373] mb-6">
                메시지 분석·요약·태스크 추출에 사용됩니다.
              </p>
              <div>
                <label className="block text-xs text-[#737373] mb-1.5">Anthropic API 키</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-white/40 transition-colors"
                />
                <p className="text-xs text-[#404040] mt-1.5">
                  console.anthropic.com에서 발급받을 수 있습니다
                </p>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                <button onClick={() => setStep(3)} disabled={!apiKey.trim()} className="flex-1 py-2.5 bg-[#d4d4d8] text-[#111111] text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">다음</button>
              </div>
              <button onClick={() => setStep(3)} className="w-full mt-2 text-xs text-[#404040] hover:text-[#737373] transition-colors py-1">나중에 설정하기</button>
            </div>
          )}

          {/* ─── Step 3: user_question_generator ────────────── */}
          {step === 3 && (
            <div className="flex flex-col h-[480px]">
              <div className="px-6 pb-3 border-b border-[#222]">
                <h2 className="text-base font-semibold text-[#e5e5e5]">업무 파악</h2>
                <p className="text-xs text-[#555] mt-0.5">AI가 몇 가지 질문을 드릴게요 (5~7개)</p>
              </div>

              {/* 챗 영역 */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#d4d4d8] text-[#111] rounded-br-sm'
                        : 'bg-[#1e1e2e] text-[#c8c8d8] rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#1e1e2e] text-[#555] px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm">
                      <span className="animate-pulse">···</span>
                    </div>
                  </div>
                )}

                {questionsDone && !chatLoading && (
                  <div className="flex justify-center pt-2">
                    <div className="text-xs text-[#555] bg-[#1a1a1a] px-3 py-1.5 rounded-full">
                      질문이 완료됐습니다
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* 입력 영역 */}
              <div className="px-4 pb-4 pt-2 border-t border-[#222]">
                {!questionsDone ? (
                  <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading}
                      placeholder="답변을 입력하세요..."
                      className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-[#404040] disabled:opacity-40 transition-colors"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chatLoading}
                      className="w-9 h-9 bg-[#d4d4d8] text-[#111] rounded-xl disabled:opacity-30 flex items-center justify-center transition-colors"
                    >
                      ↵
                    </button>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setStep(2)} className="flex-1 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="flex-[2] py-2 bg-[#d4d4d8] text-[#111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 transition-colors"
                    >
                      {analyzing ? '분석 중...' : '프로필 분석'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Step 4: Cold Start 확인 루프 ───────────────── */}
          {step === 4 && analyzedProfile && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-1">분석 결과 확인</h2>
              <p className="text-sm text-[#737373] mb-5">AI가 파악한 내용이 맞나요?</p>

              <div className="bg-[#111] border border-[#222] rounded-xl px-4 py-3 mb-5 space-y-0 max-h-56 overflow-y-auto">
                <ProfileRow label="이름" value={analyzedProfile.name} />
                <ProfileRow label="직책" value={analyzedProfile.title} />
                <ProfileRow label="부서" value={analyzedProfile.department} />
                <ProfileRow label="회사" value={analyzedProfile.company} />
                <ProfileRow label="업계" value={analyzedProfile.industry} />
                <ProfileRow label="프로젝트" value={analyzedProfile.projects} />
                <ProfileRow label="주요 업무" value={analyzedProfile.workTypes} />
                <ProfileRow label="팀원" value={analyzedProfile.teammates} />
                <ProfileRow label="거래처" value={analyzedProfile.clients} />
                <ProfileRow label="소통 방식" value={analyzedProfile.communication} />
                <ProfileRow label="키워드" value={analyzedProfile.domain_keywords} />
              </div>

              {analyzedProfile.summary && (
                <p className="text-xs text-[#6366f1] bg-[#1a1c2e] border border-[#2a2c40] px-3 py-2 rounded-lg mb-5">
                  💡 {analyzedProfile.summary}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(3); setQuestionsDone(false) }}
                  className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors"
                >
                  다시 입력
                </button>
                <button
                  onClick={handleConfirmProfile}
                  className="flex-[2] py-2.5 bg-[#d4d4d8] text-[#111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] transition-colors"
                >
                  맞습니다 →
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 5: 알림 권한 ──────────────────────────── */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">알림 자동 감지</h2>
              <p className="text-sm text-[#737373] mb-6">
                카카오톡, iMessage, 텔레그램 등의 알림을 Tidy가 자동으로 읽어 분류하고 캘린더에 등록합니다.
              </p>

              {isMac ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border transition-colors ${fdaStatus ? 'bg-green-900/20 border-green-700/40' : 'bg-[#1a1a1a] border-[#2a2a2a]'}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-[#737373]">
                        {fdaStatus ? <IconCheck size={20} className="text-green-400" /> : <IconLock size={20} />}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#e5e5e5] mb-1">
                          전체 디스크 접근
                          {fdaStatus && <span className="ml-2 text-xs text-green-400 font-normal">허용됨</span>}
                        </p>
                        <p className="text-xs text-[#737373] mb-3">
                          {fdaStatus
                            ? '권한이 허용되어 있습니다. 알림 자동 감지를 사용할 수 있습니다.'
                            : 'macOS 시스템 설정 → 개인 정보 보호 및 보안 → 전체 디스크 접근에서 Tidy를 허용해 주세요.'}
                        </p>
                        {!fdaStatus && (
                          <button onClick={handleRequestFDA} disabled={requestingFda} className="px-4 py-2 bg-[#d4d4d8] text-[#111] text-xs font-medium rounded-lg hover:bg-[#b8b8c0] disabled:opacity-40 transition-colors">
                            {requestingFda ? '시스템 설정 열는 중...' : '시스템 설정 열기'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { Icon: IconKakao,    name: '카카오톡' },
                      { Icon: IconIMessage, name: 'iMessage' },
                      { Icon: IconTelegram, name: '텔레그램' },
                      { Icon: IconLine,     name: 'LINE' },
                    ].map(({ Icon: AppIcon, name }) => (
                      <div key={name} className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                        <AppIcon size={14} className="text-[#737373]" />
                        <span className="text-xs text-[#737373]">{name}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[#404040]">
                    권한 허용 후 앱을 재시작하면 자동 감지가 활성화됩니다.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
                  <p className="text-sm text-[#737373]">
                    알림 자동 감지는 macOS에서만 지원됩니다. Gmail, Slack은 설정에서 연결할 수 있습니다.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(4)} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                <button onClick={handleComplete} disabled={isSubmitting} className="flex-1 py-2.5 bg-[#d4d4d8] text-[#111] text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {isSubmitting ? '저장 중...' : fdaStatus ? '완료' : '나중에 설정'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
