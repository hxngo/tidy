import { useState, useEffect, useRef } from 'react'
import {
  IconCheck, IconLock,
  IconKakao, IconIMessage, IconTelegram, IconLine,
} from '../components/Icons.jsx'

const TOTAL_STEPS = 6

const DEPT_PRESETS = ['개발팀', '마케팅팀', '영업팀', '디자인팀', '인사팀', '재무팀', '기획팀', '운영팀', '고객지원팀']

// 빈 프로필 초기값
const EMPTY_PROFILE = {
  name: '', title: '', department: '', company: '', industry: '',
  projects: [], workTypes: [], teammates: [], clients: [],
  communication: '', domain_keywords: [], summary: '',
}

function arrToStr(v) {
  if (!v) return ''
  return Array.isArray(v) ? v.filter(Boolean).join(', ') : v
}
function strToArr(v) {
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1)
  const [apiKey, setApiKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fdaStatus, setFdaStatus] = useState(null)
  const [isMac, setIsMac] = useState(false)
  const [requestingFda, setRequestingFda] = useState(false)

  // ── Step 3: 조직 설정 ─────────────────────────────────────────
  const [orgCompany, setOrgCompany] = useState('')
  const [orgDept, setOrgDept]       = useState('')
  const [orgSharedPath, setOrgSharedPath] = useState('')
  const [orgPickingFolder, setOrgPickingFolder] = useState(false)

  // ── Step 4: 자료 제공 모드 ────────────────────────────────────
  // mode: 'select' | 'files' | 'qa'
  const [step4Mode, setStep4Mode] = useState('select')
  const [fileList, setFileList] = useState([])       // [{ path, name }]
  const [scanLoading, setScanLoading] = useState(false)
  const [scanFound, setScanFound] = useState([])      // what AI found
  const fileInputRef = useRef(null)

  // ── Step 4 Q&A 모드 ───────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [questionsDone, setQuestionsDone] = useState(false)
  const chatEndRef = useRef(null)

  // ── Step 5: 편집 가능한 프로필 검증 ──────────────────────────
  const [editedProfile, setEditedProfile] = useState(null)  // 편집 중인 프로필
  const [analyzing, setAnalyzing] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)

  // FDA (Step 6)
  useEffect(() => {
    if (step === 6) {
      window.tidy?.permissions.check().then((res) => {
        setIsMac(res?.platform === 'darwin')
        setFdaStatus(res?.hasAccess ?? true)
      })
    }
  }, [step])

  // Step 4 Q&A 모드 진입 시 첫 질문
  useEffect(() => {
    if (step === 4 && step4Mode === 'qa' && chatHistory.length === 0) {
      loadNextQuestion([])
    }
  }, [step, step4Mode])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // ── Q&A 로직 ─────────────────────────────────────────────────
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
    } catch {
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

  // ── Step 3 저장 ───────────────────────────────────────────────
  async function handleSaveOrg() {
    await window.tidy?.org.setConfig({
      company: orgCompany.trim(),
      department: orgDept.trim(),
      sharedVaultPath: orgSharedPath.trim(),
    })
    if (orgSharedPath.trim()) {
      await window.tidy?.org.initSharedVault(orgSharedPath.trim())
    }
    setStep(4)
  }

  async function handlePickOrgFolder() {
    setOrgPickingFolder(true)
    try {
      const folderPath = await window.tidy?.org.pickFolder()
      if (folderPath) setOrgSharedPath(folderPath)
    } finally {
      setOrgPickingFolder(false)
    }
  }

  // ── Step 4 파일 관련 ──────────────────────────────────────────
  async function handleAddFolder() {
    const folderPath = await window.tidy?.dialog.openFolder()
    if (folderPath) {
      const name = folderPath.split('/').pop() || folderPath
      setFileList(prev => prev.some(f => f.path === folderPath) ? prev : [...prev, { path: folderPath, name, type: 'folder' }])
    }
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files || [])
    const newItems = files.map(f => ({ path: f.path, name: f.name, type: 'file' }))
    setFileList(prev => {
      const existPaths = new Set(prev.map(f => f.path))
      return [...prev, ...newItems.filter(f => !existPaths.has(f.path))]
    })
    e.target.value = ''
  }

  function removeFile(fp) {
    setFileList(prev => prev.filter(f => f.path !== fp))
  }

  async function handleScanFiles() {
    if (fileList.length === 0) return
    setScanLoading(true)
    setError(null)
    try {
      const paths = fileList.map(f => f.path)
      const res = await window.tidy?.profile.scanFiles(paths)
      if (res?.error) { setError(res.error); return }
      setScanFound(res.found || [])
      const merged = { ...EMPTY_PROFILE, ...res.profile }
      // null → '' 변환
      Object.keys(merged).forEach(k => { if (merged[k] === null) merged[k] = Array.isArray(EMPTY_PROFILE[k]) ? [] : '' })
      setEditedProfile(merged)
      setStep(5)
    } catch (e) {
      setError('파일 분석 오류: ' + e.message)
    } finally {
      setScanLoading(false)
    }
  }

  // ── Q&A → 분석 ───────────────────────────────────────────────
  async function handleAnalyzeQA() {
    setAnalyzing(true)
    try {
      const res = await window.tidy?.profile.analyze({ history: chatHistory })
      if (res?.profile) {
        const merged = { ...EMPTY_PROFILE, ...res.profile }
        Object.keys(merged).forEach(k => { if (merged[k] === null) merged[k] = Array.isArray(EMPTY_PROFILE[k]) ? [] : '' })
        setEditedProfile(merged)
        setStep(5)
      }
    } catch (e) {
      setError('프로필 분석 오류: ' + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Step 5 → 저장 + 재합성 ───────────────────────────────────
  async function handleConfirmProfile() {
    if (!editedProfile) return
    setSynthesizing(true)
    try {
      // 1. 검증된 프로필 저장
      await window.tidy?.profile.save(editedProfile)
      // 2. 팀원 people vault 등록
      for (const name of editedProfile.teammates || []) {
        if (name) await window.tidy?.people.upsert({ name })
      }
      // 3. 원본 대화 폐기
      setChatHistory([])
      setScanFound([])
      // 4. 지식 베이스 재합성 (profile_context.md)
      await window.tidy?.profile.synthesize(editedProfile)
      setStep(6)
    } catch (e) {
      setError('저장 오류: ' + e.message)
    } finally {
      setSynthesizing(false)
    }
  }

  async function handleComplete() {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await window.tidy?.onboarding.complete({
        apiKey: apiKey.trim(),
        workTypes: editedProfile?.workTypes || [],
        vaultPath: '',
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

  // ── 프로필 필드 편집 헬퍼 ────────────────────────────────────
  function setProfileField(key, value) {
    setEditedProfile(prev => ({ ...prev, [key]: value }))
  }

  function ProfileField({ label, fieldKey, isArray = false, placeholder = '' }) {
    const val = editedProfile?.[fieldKey]
    const displayVal = isArray ? arrToStr(val) : (val || '')
    return (
      <div className="flex gap-3 py-2 border-b border-[#1e1e1e]">
        <span className="text-[11px] text-[#505050] w-20 flex-shrink-0 pt-1.5">{label}</span>
        <input
          type="text"
          value={displayVal}
          onChange={e => setProfileField(fieldKey, isArray ? strToArr(e.target.value) : e.target.value)}
          placeholder={placeholder || (isArray ? '쉼표로 구분' : '없음')}
          className="flex-1 bg-transparent text-[12px] text-[#c8c8d8] outline-none border-b border-transparent focus:border-[#3a3a5a] placeholder-[#333] py-0.5 transition-colors"
        />
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

        <div className={`bg-[#161616] border border-[#2a2a2a] rounded-2xl ${step === 4 && step4Mode === 'qa' ? 'p-0 overflow-hidden' : 'p-8'}`}>
          <p className={`text-xs text-[#404040] mb-6 text-center ${step === 4 && step4Mode === 'qa' ? 'pt-6' : ''}`}>
            {step} / {TOTAL_STEPS}
          </p>

          {error && (
            <div className="mb-4 mx-0 px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ─── Step 1: 환영 ──────────────────────────────────── */}
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
                업무 메시지를 자동으로 분류하고 태스크를 추출합니다.
                <br />
                처음 설정 시 업무 맥락을 파악해 개인 비서로 초기화합니다.
              </p>
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 bg-[#d4d4d8] text-[#111111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] transition-colors"
              >
                시작하기
              </button>
            </div>
          )}

          {/* ─── Step 2: API 키 ─────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">Claude API 키 설정</h2>
              <p className="text-sm text-[#737373] mb-6">메시지 분석·요약·태스크 추출에 사용됩니다.</p>
              <div>
                <label className="block text-xs text-[#737373] mb-1.5">Anthropic API 키</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-white/40 transition-colors"
                />
                <p className="text-xs text-[#404040] mt-1.5">console.anthropic.com에서 발급받을 수 있습니다</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                <button onClick={() => setStep(3)} disabled={!apiKey.trim()} className="flex-1 py-2.5 bg-[#d4d4d8] text-[#111111] text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">다음</button>
              </div>
              <button onClick={() => setStep(3)} className="w-full mt-2 text-xs text-[#404040] hover:text-[#737373] transition-colors py-1">나중에 설정하기</button>
            </div>
          )}

          {/* ─── Step 3: 조직 설정 ─────────────────────────────── */}
          {step === 3 && (
            <div>
              <div className="w-12 h-12 rounded-xl bg-[#1a1c2e] flex items-center justify-center mx-auto mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#818cf8]">
                  <path d="M3 21h18M3 7v1m0 4v1m0 4v1M21 7v1m0 4v1m0 4v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <rect x="9" y="13" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="2" y="3" width="20" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-1 text-center">조직 정보 설정</h2>
              <p className="text-sm text-[#737373] mb-6 text-center">전사 공지, 부서 공유 자료를 자동으로 받아볼 수 있습니다</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#737373] mb-1.5">회사 / 조직명</label>
                  <input type="text" value={orgCompany} onChange={e => setOrgCompany(e.target.value)} placeholder="예: 주식회사 티디"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-[#4a4c68] transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-[#737373] mb-1.5">소속 부서</label>
                  <input type="text" value={orgDept} onChange={e => setOrgDept(e.target.value)} placeholder="예: 개발팀"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-[#4a4c68] transition-colors" />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {DEPT_PRESETS.map(d => (
                      <button key={d} onClick={() => setOrgDept(d)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${orgDept === d ? 'bg-[#818cf8]/20 border-[#818cf8]/50 text-[#818cf8]' : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#555] hover:text-[#737373] hover:border-[#3a3a3a]'}`}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#737373] mb-1">회사 공유 폴더 <span className="text-[#404040]">(선택)</span></label>
                  <div className="flex gap-2">
                    <input type="text" value={orgSharedPath} onChange={e => setOrgSharedPath(e.target.value)} placeholder="/Volumes/Company 또는 ~/Dropbox/Company"
                      className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-[#4a4c68] transition-colors font-mono" />
                    <button onClick={handlePickOrgFolder} disabled={orgPickingFolder}
                      className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-[#737373] rounded-lg hover:text-[#e5e5e5] hover:border-[#3a3a3a] disabled:opacity-40 transition-colors whitespace-nowrap">
                      {orgPickingFolder ? '…' : '폴더 선택'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-7">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                <button onClick={handleSaveOrg} className="flex-[2] py-2.5 bg-[#d4d4d8] text-[#111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] transition-colors">다음</button>
              </div>
              <button onClick={() => setStep(4)} className="w-full mt-2 text-xs text-[#404040] hover:text-[#737373] transition-colors py-1">나중에 설정하기</button>
            </div>
          )}

          {/* ─── Step 4: 업무 파악 ─────────────────────────────── */}
          {step === 4 && (

            /* ── 4-A: 방법 선택 ── */
            step4Mode === 'select' ? (
              <div>
                <h2 className="text-xl font-bold text-[#e5e5e5] mb-1">업무 파악</h2>
                <p className="text-sm text-[#737373] mb-6">AI가 당신의 업무 맥락을 초기화합니다.</p>
                <div className="space-y-3">
                  {/* 파일 제공 */}
                  <button
                    onClick={() => setStep4Mode('files')}
                    className="w-full flex items-start gap-4 p-4 bg-[#0f1420] border border-[#2a3050] rounded-xl hover:border-[#3a4070] transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#1a2040] flex items-center justify-center flex-shrink-0 group-hover:bg-[#2a3060] transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7c0-1.1.9-2 2-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#e5e5e5] mb-0.5">파일·폴더 제공 <span className="text-[10px] text-[#818cf8] font-normal ml-1">추천</span></p>
                      <p className="text-xs text-[#555] leading-relaxed">업무 폴더, 연락처(.vcf), 이메일 내보내기, 채팅 내역 등을 주면 AI가 자동으로 분석합니다</p>
                    </div>
                  </button>

                  {/* 직접 Q&A */}
                  <button
                    onClick={() => setStep4Mode('qa')}
                    className="w-full flex items-start gap-4 p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl hover:border-[#3a3a3a] transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#222] flex items-center justify-center flex-shrink-0 group-hover:bg-[#2a2a2a] transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#e5e5e5] mb-0.5">직접 질문 답변</p>
                      <p className="text-xs text-[#555]">AI가 5~7가지 질문을 드립니다. 파일이 없을 때 사용하세요.</p>
                    </div>
                  </button>
                </div>
                <button onClick={() => setStep(3)} className="w-full mt-6 text-xs text-[#404040] hover:text-[#737373] transition-colors py-1">이전</button>
              </div>

            /* ── 4-B: 파일 제공 ── */
            ) : step4Mode === 'files' ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => setStep4Mode('select')} className="text-[#404040] hover:text-[#737373] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
                  </button>
                  <h2 className="text-base font-bold text-[#e5e5e5]">파일·폴더 제공</h2>
                </div>
                <p className="text-xs text-[#555] mb-4">업무 폴더, 연락처, 이메일·채팅 내보내기 파일 등을 추가하세요.</p>

                {/* 파일 목록 */}
                <div className="space-y-1.5 mb-3 min-h-[60px]">
                  {fileList.length === 0 && (
                    <div className="text-center py-4 text-xs text-[#333]">추가된 파일이 없습니다</div>
                  )}
                  {fileList.map(f => (
                    <div key={f.path} className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                      <span className="text-[11px] mr-0.5">{f.type === 'folder' ? '📁' : '📄'}</span>
                      <span className="flex-1 text-[11px] text-[#9a9cb8] truncate">{f.name}</span>
                      <button onClick={() => removeFile(f.path)} className="text-[#333] hover:text-[#737373] transition-colors flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* 추가 버튼 */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={handleAddFolder}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a1a1a] border border-[#2a2a2a] border-dashed text-xs text-[#555] hover:text-[#e5e5e5] hover:border-[#3a3a3a] rounded-lg transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                    폴더 추가
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#1a1a1a] border border-[#2a2a2a] border-dashed text-xs text-[#555] hover:text-[#e5e5e5] hover:border-[#3a3a3a] rounded-lg transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                    파일 추가
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.csv,.vcf,.md,.eml,.json,.xlsx,.docx"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>

                <p className="text-[10px] text-[#333] mb-5 leading-relaxed">
                  권장: 업무 폴더 전체, 연락처.vcf, 이메일 내보내기.eml, 카카오톡 대화 내역.txt
                </p>

                <div className="flex gap-3">
                  <button onClick={() => setStep4Mode('select')} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                  <button
                    onClick={handleScanFiles}
                    disabled={fileList.length === 0 || scanLoading}
                    className="flex-[2] py-2.5 bg-[#818cf8] text-white text-sm font-medium rounded-xl hover:bg-[#6366f1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {scanLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        AI 분석 중...
                      </span>
                    ) : 'AI 자동 분석'}
                  </button>
                </div>
              </div>

            /* ── 4-C: Q&A ── */
            ) : (
              <div className="flex flex-col h-[480px]">
                <div className="px-6 pb-3 border-b border-[#222] flex items-center gap-2">
                  <button onClick={() => setStep4Mode('select')} className="text-[#404040] hover:text-[#737373] transition-colors">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-[#e5e5e5]">업무 파악</h2>
                    <p className="text-[10px] text-[#555]">AI가 5~7가지 질문을 드립니다</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user' ? 'bg-[#d4d4d8] text-[#111] rounded-br-sm' : 'bg-[#1e1e2e] text-[#c8c8d8] rounded-bl-sm'
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
                      <div className="text-xs text-[#555] bg-[#1a1a1a] px-3 py-1.5 rounded-full">질문 완료</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-[#222]">
                  {!questionsDone ? (
                    <form onSubmit={handleChatSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        disabled={chatLoading}
                        placeholder="답변을 입력하세요..."
                        className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-[#404040] disabled:opacity-40 transition-colors"
                        autoFocus
                      />
                      <button type="submit" disabled={!chatInput.trim() || chatLoading}
                        className="w-9 h-9 bg-[#d4d4d8] text-[#111] rounded-xl disabled:opacity-30 flex items-center justify-center transition-colors">↵</button>
                    </form>
                  ) : (
                    <button onClick={handleAnalyzeQA} disabled={analyzing}
                      className="w-full py-2.5 bg-[#d4d4d8] text-[#111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 transition-colors">
                      {analyzing ? '분석 중...' : '프로필 분석 →'}
                    </button>
                  )}
                </div>
              </div>
            )
          )}

          {/* ─── Step 5: 검증 + 편집 ───────────────────────────── */}
          {step === 5 && editedProfile && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-1">분석 결과 확인</h2>
              <p className="text-sm text-[#737373] mb-1">잘못된 내용은 바로 수정하세요. 확인 후 원본 데이터는 삭제됩니다.</p>

              {scanFound.length > 0 && (
                <div className="mb-3 px-3 py-2 bg-[#0f1a10] border border-[#1a3020] rounded-lg">
                  <p className="text-[10px] text-[#4a8a5a] font-semibold mb-1">📄 파일에서 찾은 정보</p>
                  {scanFound.slice(0, 3).map((s, i) => (
                    <p key={i} className="text-[10px] text-[#3a6a4a]">{s}</p>
                  ))}
                </div>
              )}

              <div className="bg-[#111] border border-[#222] rounded-xl px-4 py-2 mb-4 max-h-64 overflow-y-auto">
                <ProfileField label="이름"     fieldKey="name"            placeholder="홍길동" />
                <ProfileField label="직책"     fieldKey="title"           placeholder="팀장" />
                <ProfileField label="부서"     fieldKey="department"      placeholder="개발팀" />
                <ProfileField label="회사"     fieldKey="company"         placeholder="주식회사 ..." />
                <ProfileField label="업계"     fieldKey="industry"        placeholder="IT / 교육 ..." />
                <ProfileField label="프로젝트" fieldKey="projects"        isArray placeholder="프로젝트A, 프로젝트B" />
                <ProfileField label="주요업무" fieldKey="workTypes"       isArray placeholder="보고서 작성, 기획" />
                <ProfileField label="팀원"     fieldKey="teammates"       isArray placeholder="김철수, 이영희" />
                <ProfileField label="거래처"   fieldKey="clients"         isArray placeholder="A회사, B기관" />
                <ProfileField label="소통방식" fieldKey="communication"   placeholder="슬랙 + 주간 회의" />
                <ProfileField label="키워드"   fieldKey="domain_keywords" isArray placeholder="AI, UX, 예산" />
                <ProfileField label="한줄요약" fieldKey="summary"         placeholder="..." />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setStep(4); setStep4Mode('select'); setEditedProfile(null); setScanFound([]) }}
                  className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors"
                >
                  다시 제공
                </button>
                <button
                  onClick={handleConfirmProfile}
                  disabled={synthesizing}
                  className="flex-[2] py-2.5 bg-[#d4d4d8] text-[#111] text-sm font-medium rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 transition-colors"
                >
                  {synthesizing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      지식 베이스 생성 중...
                    </span>
                  ) : '확인 · 저장 →'}
                </button>
              </div>
              <p className="text-[10px] text-[#333] text-center mt-2">확인 시 원본 대화/파일 분석은 삭제되고 검증된 정보만 저장됩니다</p>
            </div>
          )}

          {/* ─── Step 6: 알림 권한 ─────────────────────────────── */}
          {step === 6 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">알림 자동 감지</h2>
              <p className="text-sm text-[#737373] mb-6">
                카카오톡, iMessage, 텔레그램 등의 알림을 Tidy가 자동으로 읽어 분류합니다.
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
                          <button onClick={handleRequestFDA} disabled={requestingFda}
                            className="px-4 py-2 bg-[#d4d4d8] text-[#111] text-xs font-medium rounded-lg hover:bg-[#b8b8c0] disabled:opacity-40 transition-colors">
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
                </div>
              ) : (
                <div className="p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
                  <p className="text-sm text-[#737373]">
                    알림 자동 감지는 macOS에서만 지원됩니다. Gmail, Slack은 설정에서 연결할 수 있습니다.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(5)} className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors">이전</button>
                <button onClick={handleComplete} disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-[#d4d4d8] text-[#111] text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
