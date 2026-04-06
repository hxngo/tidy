import { useState, useEffect } from 'react'
import {
  IconSearch, IconBook, IconList, IconLayers,
  IconCheck, IconLock, IconClose, IconFolder,
  IconKakao, IconIMessage, IconTelegram, IconLine,
} from '../components/Icons.jsx'

const WORK_TYPES = [
  { id: 'research', label: '리서치',    Icon: IconSearch },
  { id: 'teaching', label: '티칭',      Icon: IconBook },
  { id: 'project',  label: '프로젝트',  Icon: IconList },
  { id: 'admin',    label: '운영',      Icon: IconLayers },
]

const TOTAL_STEPS = 5

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1)
  const [apiKey, setApiKey] = useState('')
  const [selectedWorkTypes, setSelectedWorkTypes] = useState([])
  const [vaultPath, setVaultPath] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [importFiles, setImportFiles] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // FDA 권한 상태: null=미확인, true=허용됨, false=미허용
  const [fdaStatus, setFdaStatus] = useState(null)
  const [isMac, setIsMac] = useState(false)
  const [requestingFda, setRequestingFda] = useState(false)

  // Step 4 진입 시 권한 상태 확인
  useEffect(() => {
    if (step === 4) {
      window.tidy?.permissions.check().then((res) => {
        setIsMac(res?.platform === 'darwin')
        setFdaStatus(res?.hasAccess ?? true)
      })
    }
  }, [step])

  function toggleWorkType(id) {
    setSelectedWorkTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    setImportFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path))
      const newFiles = files.filter((f) => !existing.has(f.path))
      return [...prev, ...newFiles]
    })
  }

  function removeImportFile(index) {
    setImportFiles((prev) => prev.filter((_, i) => i !== index))
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

  async function handleComplete(skip = false) {
    setIsSubmitting(true)
    setError(null)
    try {
      // 온보딩 데이터 저장
      const result = await window.tidy?.onboarding.complete({
        apiKey: apiKey.trim(),
        workTypes: selectedWorkTypes,
        vaultPath: vaultPath.trim(),
      })

      if (result?.error) {
        setError(result.error)
        setIsSubmitting(false)
        return
      }

      // 파일 가져오기 (스킵하지 않았고 파일이 있을 때)
      if (!skip && importFiles.length > 0) {
        await window.tidy?.onboarding.import({
          filePaths: importFiles.map((f) => f.path),
        })
      }

      onComplete()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-screen bg-[#0f0f0f] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* 단계 표시 */}
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

        {/* 카드 */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-8">
          {/* 단계 레이블 */}
          <p className="text-xs text-[#404040] mb-6 text-center">
            {step} / {TOTAL_STEPS}
          </p>

          {/* 에러 */}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ─── Step 1: 환영 ─── */}
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
                className="w-full py-3 bg-[#d4d4d8] text-white text-sm font-medium rounded-xl hover:bg-[#b8b8c0] transition-colors"
              >
                시작하기
              </button>
            </div>
          )}

          {/* ─── Step 2: API 설정 ─── */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">Claude API 키 설정</h2>
              <p className="text-sm text-[#737373] mb-6">
                메시지 분석·요약·태스크 추출에 사용됩니다.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#737373] mb-1.5">
                    Anthropic API 키
                  </label>
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
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!apiKey.trim()}
                  className="flex-1 py-2.5 bg-[#d4d4d8] text-white text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                </button>
              </div>
              <button
                onClick={() => setStep(3)}
                className="w-full mt-2 text-xs text-[#404040] hover:text-[#737373] transition-colors py-1"
              >
                나중에 설정하기
              </button>
            </div>
          )}

          {/* ─── Step 3: 업무 프로필 ─── */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">업무 프로필</h2>
              <p className="text-sm text-[#737373] mb-6">
                어떤 유형의 업무를 주로 처리하시나요? (복수 선택 가능)
              </p>

              {/* 업무 유형 체크박스 */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {WORK_TYPES.map(({ id, label, Icon: WorkIcon }) => {
                  const isSelected = selectedWorkTypes.includes(id)
                  return (
                    <button
                      key={id}
                      onClick={() => toggleWorkType(id)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm transition-colors ${
                        isSelected
                          ? 'bg-white/10 border-white/30 text-[#c8c8d0]'
                          : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#737373] hover:border-[#404040] hover:text-[#e5e5e5]'
                      }`}
                    >
                      <WorkIcon size={14} />
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>

              {/* vault 경로 */}
              <div>
                <label className="block text-xs text-[#737373] mb-1.5">
                  Vault 저장 경로
                  <span className="ml-1 text-[#404040]">(선택사항)</span>
                </label>
                <input
                  type="text"
                  value={vaultPath}
                  onChange={(e) => setVaultPath(e.target.value)}
                  placeholder="~/tidy-vault (기본값)"
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-white/40 transition-colors"
                />
                <p className="text-xs text-[#404040] mt-1.5">
                  Obsidian vault와 동일한 경로 사용 가능
                </p>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 py-2.5 bg-[#d4d4d8] text-white text-sm rounded-xl hover:bg-[#b8b8c0] transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 4: 알림 권한 ─── */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">알림 자동 감지</h2>
              <p className="text-sm text-[#737373] mb-6">
                카카오톡, iMessage, 텔레그램 등의 알림을 Tidy가 자동으로 읽어 분류하고 캘린더에 등록합니다.
              </p>

              {isMac ? (
                <div className="space-y-4">
                  {/* 권한 상태 카드 */}
                  <div className={`p-4 rounded-xl border transition-colors ${
                    fdaStatus
                      ? 'bg-green-900/20 border-green-700/40'
                      : 'bg-[#1a1a1a] border-[#2a2a2a]'
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-[#737373]">{fdaStatus ? <IconCheck size={20} className="text-green-400" /> : <IconLock size={20} />}</span>
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
                          <button
                            onClick={handleRequestFDA}
                            disabled={requestingFda}
                            className="px-4 py-2 bg-[#d4d4d8] text-white text-xs font-medium rounded-lg hover:bg-[#b8b8c0] disabled:opacity-40 transition-colors"
                          >
                            {requestingFda ? '시스템 설정 열는 중...' : '시스템 설정 열기'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 지원 앱 목록 */}
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
                    설정 → 알림 자동 감지에서 개별 앱을 켜고 끌 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
                  <p className="text-sm text-[#737373]">
                    알림 자동 감지는 macOS에서만 지원됩니다.
                    Gmail, Slack은 설정에서 연결할 수 있습니다.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="flex-1 py-2.5 bg-[#d4d4d8] text-white text-sm rounded-xl hover:bg-[#b8b8c0] transition-colors"
                >
                  {fdaStatus ? '다음' : '나중에 설정'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 5: 데이터 가져오기 ─── */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-[#e5e5e5] mb-2">데이터 가져오기</h2>
              <p className="text-sm text-[#737373] mb-6">
                기존 연락처, 카카오톡, 이메일 파일을 가져올 수 있습니다.
              </p>

              {/* 드래그&드롭 영역 */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-[#c8c8d0] bg-white/8'
                    : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#404040]'
                }`}
              >
                <IconFolder size={32} className="text-[#404040] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#e5e5e5] mb-1">
                  파일을 여기에 드래그하세요
                </p>
                <p className="text-xs text-[#404040]">
                  TXT (카카오톡), EML (이메일), PDF, DOCX 지원
                </p>
              </div>

              {/* 가져올 파일 목록 */}
              {importFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {importFiles.map((file, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2"
                    >
                      <span className="text-xs text-[#a0a0a0] truncate max-w-[280px]">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeImportFile(i)}
                        className="text-[#404040] hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                      >
                        <IconClose size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#737373] text-sm rounded-xl hover:text-[#e5e5e5] transition-colors"
                  disabled={isSubmitting}
                >
                  이전
                </button>
                {importFiles.length > 0 ? (
                  <button
                    onClick={() => handleComplete(false)}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 bg-[#d4d4d8] text-white text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? '처리 중...' : `${importFiles.length}개 파일 가져오기`}
                  </button>
                ) : (
                  <button
                    onClick={() => handleComplete(true)}
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 bg-[#d4d4d8] text-white text-sm rounded-xl hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? '저장 중...' : '완료'}
                  </button>
                )}
              </div>

              <button
                onClick={() => handleComplete(true)}
                disabled={isSubmitting}
                className="w-full mt-2 text-xs text-[#404040] hover:text-[#737373] transition-colors py-1 disabled:opacity-40"
              >
                가져오기 건너뛰기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
