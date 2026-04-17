import { useState, useEffect, useContext } from 'react'
import { ThemeContext, FontSizeContext } from '../App.jsx'
import { IconMail, IconMessage, IconKakao, IconIMessage, IconFile, IconClose, SourceIcon } from '../components/Icons.jsx'

const TABS = [
  { id: 'ai', label: 'AI' },
  { id: 'channels', label: '채널' },
  { id: 'vault', label: '저장소' },
  { id: 'notifications', label: '알림' },
  { id: 'sources', label: '소스' },
  { id: 'gdrive', label: 'Drive' },
  { id: 'marketplace', label: '마켓' },
  { id: 'backup', label: '백업' },
]

const BUILTIN_SOURCE_IDS = new Set(['gmail', 'slack', 'kakao', 'imessage', 'file'])

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 overflow-hidden ${value ? 'bg-[#d4d4d8]' : 'bg-[#2a2a2a]'}`}
    >
      <span className={`absolute top-[2px] w-4 h-4 rounded-full bg-white transition-all duration-200 ${value ? 'left-[22px]' : 'left-[2px]'}`} />
    </button>
  )
}

export default function Settings({ embedded = false }) {
  const { theme: currentTheme, setTheme } = useContext(ThemeContext)
  const { fontSize, setFontSize } = useContext(FontSizeContext)
  const [tab, setTab] = useState('ai')

  const [settings, setSettings] = useState({
    hasAnthropicKey: false,
    gmailEmail: '',
    hasGmailPassword: false,
    hasSlackToken: false,
    vaultPath: '',
    calendarEnabled: false,
    calendarName: '',
    notificationSources: { enabled: false, imessage: false },
    scanPaths: [],
  })

  const [anthropicKey, setAnthropicKey] = useState('')
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailPassword, setGmailPassword] = useState('')
  const [slackToken, setSlackToken] = useState('')
  const [calendarName, setCalendarName] = useState('')
  const [availableCalendars, setAvailableCalendars] = useState([])

  const [channelStatus, setChannelStatus] = useState({ gmail: 'disconnected', slack: 'disconnected' })
  const [channelLastSynced, setChannelLastSynced] = useState({})

  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState({})
  const [feedback, setFeedback] = useState(null)
  const [vaultInput, setVaultInput] = useState('')
  const [vaultScanResult, setVaultScanResult] = useState(null)
  const [scanPaths, setScanPaths] = useState([])
  const [scanPreview, setScanPreview] = useState({})
  const [detectedVaults, setDetectedVaults] = useState([])
  const [watchFolderPath, setWatchFolderPath] = useState('')
  const [seenApps, setSeenApps] = useState({})
  const [blockedBundles, setBlockedBundles] = useState([])

  // 소스 카테고리
  const [customSources, setCustomSources] = useState([])
  const [editingSource, setEditingSource] = useState(null) // { id, label, icon } or null
  const [newSource, setNewSource] = useState({ id: '', label: '' })
  const [showAddSource, setShowAddSource] = useState(false)

  // 마켓플레이스
  const [marketUrl, setMarketUrl]           = useState('')
  const [marketAuthorName, setMarketAuthorName] = useState('')
  const [marketSaving, setMarketSaving]     = useState(false)
  const [marketTestStatus, setMarketTestStatus] = useState(null) // null|'ok'|'fail'
  const [marketTestMsg, setMarketTestMsg]   = useState('')

  // 사용자 프로필 (Cold Start)
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState({})

  // 개발용 테스트
  const [testText, setTestText] = useState('')
  const [testSource, setTestSource] = useState('test')

  // 인박스 카테고리
  const DEFAULT_CATEGORIES = ['업무', '미팅', '여행', '운영', '정보']
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddCategory, setShowAddCategory] = useState(false)

  const [syncIntervalEmail, setSyncIntervalEmail] = useState(5)
  const [syncIntervalSlack, setSyncIntervalSlack] = useState(2)
  const [fdaGranted, setFdaGranted] = useState(null) // null=unknown, true=granted, false=not granted

  // Google Drive
  const [gdriveClientId, setGdriveClientId] = useState('')
  const [gdriveClientSecret, setGdriveClientSecret] = useState('')
  const [gdriveConnected, setGdriveConnected] = useState(false)
  const [gdriveConnecting, setGdriveConnecting] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await window.tidy?.settings.get()
        if (data) {
          setSettings(data)
          setGmailEmail(data.gmailEmail || '')
          setCalendarName(data.calendarName || '')
          setScanPaths(data.scanPaths || [])
          setGdriveConnected(data.gdriveConnected || false)
          setWatchFolderPath(data.watchFolderPath || '')
          setSeenApps(data.seenApps || {})
          setBlockedBundles(data.blockedBundles || [])
          if (data.syncIntervalEmail) setSyncIntervalEmail(data.syncIntervalEmail)
          if (data.syncIntervalSlack) setSyncIntervalSlack(data.syncIntervalSlack)
        }
      } catch (e) { console.error('설정 로드 실패:', e) }
      try {
        const res = await window.tidy?.calendar.getCalendars()
        if (res?.calendars?.length) setAvailableCalendars(res.calendars)
      } catch {}
      try {
        const res = await window.tidy?.vault.detectObsidian()
        if (res?.vaults?.length) setDetectedVaults(res.vaults)
      } catch {}
      try {
        const cats = await window.tidy?.sources.getAll()
        if (Array.isArray(cats)) setCustomSources(cats)
      } catch {}
      try {
        const cats = await window.tidy?.categories.get()
        if (Array.isArray(cats)) setCategories(cats)
      } catch {}
      try {
        const url    = await window.tidy?.marketplace.getUrl?.()
        const author = await window.tidy?.marketplace.getAuthor?.()
        if (url)           setMarketUrl(url)
        if (author?.authorName) setMarketAuthorName(author.authorName)
      } catch {}
      try {
        const profile = await window.tidy?.profile.get?.()
        if (profile) { setUserProfile(profile); setProfileDraft(profile) }
        setProfileLoaded(true)
      } catch { setProfileLoaded(true) }
    }
    loadSettings()

    // FDA 상태 초기 확인
    window.tidy?.permissions.check().then(res => {
      if (res !== undefined) setFdaGranted(res?.hasAccess === true)
    }).catch(() => {})
    const unsubFda = window.tidy?.permissions.onFdaStatus?.((data) => setFdaGranted(data?.granted === true))

    const unsubStatus = window.tidy?.channel.onStatus((data) => {
      setChannelStatus((prev) => ({ ...prev, [data.type]: data.status }))
      if (data.lastSynced) setChannelLastSynced((prev) => ({ ...prev, [data.type]: data.lastSynced }))
    })
    const unsubError = window.tidy?.channel.onError((data) => {
      setChannelStatus((prev) => ({ ...prev, [data.type]: 'error' }))
    })
    return () => { unsubFda?.(); unsubStatus?.(); unsubError?.() }
  }, [])

  function showFeedback(type, message) {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function handleSaveApiKey(e) {
    e.preventDefault()
    if (!anthropicKey.trim()) return
    setSaving(true)
    try {
      const result = await window.tidy?.settings.save({ anthropicKey: anthropicKey.trim() })
      if (result?.success) {
        setAnthropicKey('')
        setSettings((prev) => ({ ...prev, hasAnthropicKey: true }))
        showFeedback('success', 'API 키가 저장되었습니다')
      } else showFeedback('error', result?.error || '저장 실패')
    } catch (e) { showFeedback('error', e.message) }
    finally { setSaving(false) }
  }

  async function handleGmailConnect(e) {
    e.preventDefault()
    if (!gmailEmail.trim() || !gmailPassword.trim()) return
    setConnecting((prev) => ({ ...prev, gmail: true }))
    try {
      const result = await window.tidy?.channel.connect({ type: 'gmail', config: { email: gmailEmail.trim(), password: gmailPassword } })
      if (result?.success) {
        setChannelStatus((prev) => ({ ...prev, gmail: 'connected' }))
        setSettings((prev) => ({ ...prev, gmailEmail: gmailEmail.trim(), hasGmailPassword: true }))
        setGmailPassword('')
        showFeedback('success', 'Gmail 연결 성공!')
      } else showFeedback('error', `Gmail 연결 실패: ${result?.error || '알 수 없는 오류'}`)
    } catch (e) { showFeedback('error', e.message) }
    finally { setConnecting((prev) => ({ ...prev, gmail: false })) }
  }

  async function handleSlackConnect(e) {
    e.preventDefault()
    if (!slackToken.trim()) return
    setConnecting((prev) => ({ ...prev, slack: true }))
    try {
      const result = await window.tidy?.channel.connect({ type: 'slack', config: { token: slackToken.trim() } })
      if (result?.success) {
        setChannelStatus((prev) => ({ ...prev, slack: 'connected' }))
        setSettings((prev) => ({ ...prev, hasSlackToken: true }))
        setSlackToken('')
        showFeedback('success', `Slack 연결 성공! (${result.user} @ ${result.team})`)
      } else showFeedback('error', `Slack 연결 실패: ${result?.error || '알 수 없는 오류'}`)
    } catch (e) { showFeedback('error', e.message) }
    finally { setConnecting((prev) => ({ ...prev, slack: false })) }
  }

  async function handleSetVaultPath(e) {
    e.preventDefault()
    if (!vaultInput.trim()) return
    try {
      const result = await window.tidy?.vault.setPath(vaultInput.trim())
      if (result?.success) {
        setSettings((prev) => ({ ...prev, vaultPath: vaultInput.trim() }))
        setVaultScanResult({ people: result.people, projects: result.projects })
        showFeedback('success', `Vault 연결 완료 — 인물 ${result.people}명, 프로젝트 ${result.projects}개 로드`)
        setVaultInput('')
      } else showFeedback('error', result?.error || 'Vault 연결 실패')
    } catch (e) { showFeedback('error', e.message) }
  }

  async function handleSaveCalendar(e) {
    e.preventDefault()
    try {
      const result = await window.tidy?.settings.save({ calendarEnabled: settings.calendarEnabled, calendarName: calendarName.trim() })
      if (result?.success) {
        setSettings((prev) => ({ ...prev, calendarName: calendarName.trim() }))
        showFeedback('success', '캘린더 설정이 저장되었습니다')
      }
    } catch (e) { showFeedback('error', e.message) }
  }

  async function handleAddScanPath() {
    const result = await window.tidy?.dialog.openFolder()
    if (result?.canceled || !result?.paths?.length) return
    const newPaths = [...new Set([...scanPaths, ...result.paths])]
    setScanPaths(newPaths)
    await window.tidy?.settings.save({ scanPaths: newPaths })
    for (const p of result.paths) {
      const preview = await window.tidy?.dialog.previewFolders(p)
      if (preview?.folders?.length) setScanPreview((prev) => ({ ...prev, [p]: preview.folders }))
    }
    showFeedback('success', `${result.paths.length}개 경로 추가됨`)
  }

  async function handleRemoveScanPath(p) {
    const newPaths = scanPaths.filter((sp) => sp !== p)
    setScanPaths(newPaths)
    setScanPreview((prev) => { const next = { ...prev }; delete next[p]; return next })
    await window.tidy?.settings.save({ scanPaths: newPaths })
  }

  async function handleNotifSourceToggle(source) {
    const updated = { ...settings.notificationSources, [source]: !settings.notificationSources[source] }
    setSettings((prev) => ({ ...prev, notificationSources: updated }))
    try { await window.tidy?.settings.save({ notificationSources: updated }) }
    catch (e) { showFeedback('error', e.message) }
  }

  // 채널 상태 도우미
  function gmailConnected() { return settings.hasGmailPassword && channelStatus.gmail !== 'disconnected' }
  function slackConnected() { return settings.hasSlackToken && channelStatus.slack !== 'disconnected' }

  const inputCls = 'w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-white/40 transition-colors'
  const btnOutlineCls = 'px-4 py-2 bg-[#141414] border border-[#2a2a2a] text-[#e5e5e5] text-sm rounded-lg hover:border-[#c8c8d0] hover:text-[#c8c8d0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 + 탭 */}
      <div className="drag-region flex-shrink-0 border-b border-[#2a2a2a]">
        <div className="flex items-center px-6 h-12">
          <h1 className="no-drag text-sm font-semibold text-[#e5e5e5]">설정</h1>
        </div>
        <div className="no-drag flex px-6 gap-1 pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 ${
                tab === t.id
                  ? 'text-[#c8c8d0] border-[#c8c8d0]'
                  : 'text-[#737373] border-transparent hover:text-[#e5e5e5]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 피드백 토스트 */}
      {feedback && (
        <div className={`mx-6 mt-3 px-4 py-2.5 rounded-lg text-xs flex-shrink-0 ${
          feedback.type === 'error'
            ? 'bg-red-900/30 text-red-300 border border-red-700/50'
            : 'bg-green-900/30 text-green-300 border border-green-700/50'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-lg mx-auto px-6 py-5 space-y-6">

          {/* ── AI 탭 ── */}
          {tab === 'ai' && (
            <>
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-[#e5e5e5]">Claude AI</h2>
                    <p className="text-xs text-[#737373] mt-0.5">메시지 분류·요약·태스크 추출에 사용됩니다</p>
                  </div>
                  {settings.hasAnthropicKey && (
                    <span className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded-full border border-green-700/30 flex-shrink-0">✓ 연결됨</span>
                  )}
                </div>
                <form onSubmit={handleSaveApiKey} className="space-y-3">
                  <div>
                    <input
                      type="password"
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder={settings.hasAnthropicKey ? '새 API 키로 교체하려면 입력' : 'sk-ant-...'}
                      className={inputCls}
                    />
                    <p className="text-xs text-[#404040] mt-1">console.anthropic.com에서 발급</p>
                  </div>
                  <button
                    type="submit"
                    disabled={!anthropicKey.trim() || saving}
                    className="px-4 py-2 bg-[#d4d4d8] text-[#111111] text-sm rounded-lg hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </form>
              </div>

              {/* ── 사용자 프로필 (Cold Start) ── */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#e5e5e5]">내 프로필</h2>
                    <p className="text-xs text-[#737373] mt-0.5">AI가 나를 더 잘 이해할 수 있도록 도와줍니다</p>
                  </div>
                  {userProfile && !editingProfile && (
                    <button
                      onClick={() => { setProfileDraft({ ...userProfile }); setEditingProfile(true) }}
                      className="text-xs text-[#6366f1] hover:text-[#818cf8] border border-[#6366f1]/30 hover:border-[#6366f1]/60 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      수정
                    </button>
                  )}
                </div>

                {!profileLoaded ? (
                  <div className="flex gap-1 py-4"><span className="w-1.5 h-1.5 rounded-full bg-[#303050] animate-pulse" /><span className="w-1.5 h-1.5 rounded-full bg-[#303050] animate-pulse" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 rounded-full bg-[#303050] animate-pulse" style={{ animationDelay: '300ms' }} /></div>
                ) : !userProfile && !editingProfile ? (
                  <div className="p-4 bg-[#0d0e16] border border-dashed border-[#1c1e2c] rounded-xl text-center">
                    <p className="text-xs text-[#404060] mb-3">프로필이 없습니다. 온보딩을 다시 실행해 프로필을 만드세요.</p>
                    <button
                      onClick={async () => {
                        await window.tidy?.onboarding.reset()
                        window.location.reload()
                      }}
                      className="text-xs text-[#6366f1] hover:text-[#818cf8] border border-[#6366f1]/30 hover:border-[#6366f1]/60 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      온보딩 다시 실행
                    </button>
                  </div>
                ) : editingProfile ? (
                  <div className="space-y-3">
                    {[
                      { key: 'name',         label: '이름' },
                      { key: 'title',        label: '직책' },
                      { key: 'department',   label: '부서' },
                      { key: 'company',      label: '회사' },
                      { key: 'industry',     label: '업계' },
                      { key: 'communication',label: '소통 방식' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-[10px] font-semibold text-[#505272] uppercase tracking-wide mb-1">{label}</label>
                        <input
                          value={profileDraft[key] || ''}
                          onChange={e => setProfileDraft(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full bg-[#09090c] border border-[#1a1c28] rounded-lg px-3 py-1.5 text-xs text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#6366f1]/40"
                          placeholder={label}
                        />
                      </div>
                    ))}
                    {[
                      { key: 'domain_keywords', label: '전문 키워드', placeholder: '키워드1, 키워드2' },
                      { key: 'projects',        label: '진행 중인 프로젝트', placeholder: '프로젝트1, 프로젝트2' },
                      { key: 'teammates',       label: '팀원 이름', placeholder: '홍길동, 김영희' },
                      { key: 'clients',         label: '주요 거래처', placeholder: '클라이언트A, B사' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="block text-[10px] font-semibold text-[#505272] uppercase tracking-wide mb-1">{label}</label>
                        <input
                          value={Array.isArray(profileDraft[key]) ? profileDraft[key].join(', ') : (profileDraft[key] || '')}
                          onChange={e => {
                            const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                            setProfileDraft(p => ({ ...p, [key]: arr }))
                          }}
                          className="w-full bg-[#09090c] border border-[#1a1c28] rounded-lg px-3 py-1.5 text-xs text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#6366f1]/40"
                          placeholder={placeholder}
                        />
                        <p className="text-[10px] text-[#303050] mt-0.5">쉼표로 구분</p>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setEditingProfile(false)}
                        className="flex-1 py-1.5 text-xs text-[#505272] hover:text-[#9a9cb8] border border-[#1a1c28] hover:border-[#252840] rounded-lg transition-colors"
                      >취소</button>
                      <button
                        onClick={async () => {
                          setProfileSaving(true)
                          try {
                            const res = await window.tidy?.profile.save(profileDraft)
                            if (res?.success) {
                              setUserProfile(res.profile || profileDraft)
                              setEditingProfile(false)
                              showFeedback('ok', '프로필이 저장됐습니다')
                            } else showFeedback('error', res?.error || '저장 실패')
                          } catch (e) { showFeedback('error', e.message) }
                          finally { setProfileSaving(false) }
                        }}
                        disabled={profileSaving}
                        className="flex-[2] py-1.5 text-xs font-semibold text-white bg-[#6366f1] hover:bg-[#5254cc] disabled:opacity-40 rounded-lg transition-colors"
                      >{profileSaving ? '저장 중...' : '저장'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userProfile.name && (
                      <div className="flex items-center gap-3 p-3 bg-[#0d0e16] border border-[#1c1e2c] rounded-xl">
                        <div className="w-9 h-9 rounded-full bg-[#6366f1]/20 flex items-center justify-center text-sm font-semibold text-[#818cf8] flex-shrink-0">
                          {userProfile.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#e0e0f0]">{userProfile.name}</p>
                          <p className="text-xs text-[#6b6e8c]">
                            {[userProfile.title, userProfile.department, userProfile.company].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {userProfile.industry && (
                        <div className="p-2.5 bg-[#09090c] border border-[#1a1c28] rounded-lg">
                          <p className="text-[9px] text-[#404060] uppercase tracking-wide mb-1">업계</p>
                          <p className="text-[11px] text-[#9a9cb8]">{userProfile.industry}</p>
                        </div>
                      )}
                      {userProfile.communication && (
                        <div className="p-2.5 bg-[#09090c] border border-[#1a1c28] rounded-lg">
                          <p className="text-[9px] text-[#404060] uppercase tracking-wide mb-1">소통 방식</p>
                          <p className="text-[11px] text-[#9a9cb8]">{userProfile.communication}</p>
                        </div>
                      )}
                    </div>
                    {Array.isArray(userProfile.domain_keywords) && userProfile.domain_keywords.length > 0 && (
                      <div className="p-2.5 bg-[#09090c] border border-[#1a1c28] rounded-lg">
                        <p className="text-[9px] text-[#404060] uppercase tracking-wide mb-1.5">전문 키워드</p>
                        <div className="flex flex-wrap gap-1">
                          {userProfile.domain_keywords.map(k => (
                            <span key={k} className="text-[10px] text-[#6366f1] bg-[#6366f1]/10 border border-[#6366f1]/20 px-1.5 py-0.5 rounded">{k}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(userProfile.projects) && userProfile.projects.length > 0 && (
                      <div className="p-2.5 bg-[#09090c] border border-[#1a1c28] rounded-lg">
                        <p className="text-[9px] text-[#404060] uppercase tracking-wide mb-1.5">프로젝트</p>
                        <div className="flex flex-wrap gap-1">
                          {userProfile.projects.map(p => (
                            <span key={p} className="text-[10px] text-[#9a9cb8] bg-[#1c1e2c] px-1.5 py-0.5 rounded">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(userProfile.teammates) && userProfile.teammates.length > 0 && (
                      <div className="p-2.5 bg-[#09090c] border border-[#1a1c28] rounded-lg">
                        <p className="text-[9px] text-[#404060] uppercase tracking-wide mb-1.5">팀원</p>
                        <div className="flex flex-wrap gap-1">
                          {userProfile.teammates.map(t => (
                            <span key={t} className="text-[10px] text-[#c8c8d8] bg-[#1c1e2c] px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={async () => {
                        if (!window.confirm('온보딩을 다시 실행하면 현재 프로필이 초기화됩니다. 계속할까요?')) return
                        await window.tidy?.onboarding.reset()
                        window.location.reload()
                      }}
                      className="text-[10px] text-[#404060] hover:text-[#6b6e8c] transition-colors"
                    >
                      온보딩 다시 실행 →
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[#2a2a2a] space-y-3">
                <div>
                  <p className="text-xs text-[#404040] mb-2">개발용 테스트</p>
                  <textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    rows={3}
                    className="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#404040] focus:outline-none focus:border-white/30 resize-none mb-2"
                    placeholder="테스트할 메시지를 입력하세요..."
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const res = await window.tidy?.dev.injectTest({ text: testText || undefined, source: testSource })
                        if (res?.success) showFeedback('success', '테스트 메시지 주입 완료 — 인박스 확인')
                        else showFeedback('error', res?.error || '실패')
                      }}
                      className="px-3 py-1.5 bg-[#1a1a2e] border border-[#3a3a5a] text-[#8a8cb8] text-xs rounded-lg hover:border-[#6a6c98] hover:text-[#c8c8d0] transition-colors"
                    >
                      주입
                    </button>
                    <select
                      value={testSource}
                      onChange={(e) => setTestSource(e.target.value)}
                      className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#737373] focus:outline-none"
                    >
                      <option value="test">test</option>
                      <option value="kakao">kakao</option>
                      <option value="imessage">imessage</option>
                      <option value="gmail">gmail</option>
                      <option value="slack">slack</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-[#404040]">Tidy v0.1.0 · MVP</p>
              </div>
            </>
          )}

          {/* ── 채널 탭 ── */}
          {tab === 'channels' && (
            <div className="space-y-4">
              {/* Gmail */}
              <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#141414]">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <IconMail size={16} className="text-[#737373]" />
                    <div>
                      <p className="text-sm font-medium text-[#e5e5e5]">Gmail</p>
                      <div className="flex items-center gap-1">
                        <select
                          value={syncIntervalEmail}
                          onChange={async (e) => {
                            const v = Number(e.target.value)
                            setSyncIntervalEmail(v)
                            await window.tidy?.settings.save({ syncIntervalEmail: v })
                          }}
                          className="bg-transparent text-xs text-[#404040] focus:outline-none cursor-pointer appearance-none"
                        >
                          {[1,2,3,5,10,15,30].map(m => <option key={m} value={m} style={{ background: '#141414' }}>{m}분</option>)}
                        </select>
                        <span className="text-xs text-[#404040]">마다 자동 체크</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {gmailConnected() && (
                      <button
                        type="button"
                        onClick={() => window.tidy?.channel.sync('gmail')}
                        className="text-xs text-[#c8c8d0] hover:text-[#818cf8] transition-colors"
                      >
                        동기화
                      </button>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      gmailConnected()
                        ? 'text-green-400 bg-green-900/20 border border-green-700/30'
                        : 'text-[#737373] bg-[#1a1a1a] border border-[#2a2a2a]'
                    }`}>
                      {gmailConnected() ? '연결됨' : '미연결'}
                    </span>
                  </div>
                </div>
                <form onSubmit={handleGmailConnect} className="px-4 py-4 space-y-3">
                  <input
                    type="email"
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="your@gmail.com"
                    className={inputCls}
                  />
                  <div>
                    <input
                      type="password"
                      value={gmailPassword}
                      onChange={(e) => setGmailPassword(e.target.value)}
                      placeholder="앱 비밀번호 (xxxx xxxx xxxx xxxx)"
                      className={inputCls}
                    />
                    <p className="text-xs text-[#404040] mt-1">Google 계정 › 보안 › 2단계 인증 › 앱 비밀번호</p>
                  </div>
                  <button type="submit" disabled={!gmailEmail.trim() || !gmailPassword.trim() || connecting.gmail} className={btnOutlineCls}>
                    {connecting.gmail ? '연결 중...' : gmailConnected() ? '재연결' : '연결 테스트 & 저장'}
                  </button>
                </form>
              </div>

              {/* Slack */}
              <div className="border border-[#2a2a2a] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#141414]">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-base">#</span>
                    <div>
                      <p className="text-sm font-medium text-[#e5e5e5]">Slack</p>
                      <div className="flex items-center gap-1">
                        <select
                          value={syncIntervalSlack}
                          onChange={async (e) => {
                            const v = Number(e.target.value)
                            setSyncIntervalSlack(v)
                            await window.tidy?.settings.save({ syncIntervalSlack: v })
                          }}
                          className="bg-transparent text-xs text-[#404040] focus:outline-none cursor-pointer appearance-none"
                        >
                          {[1,2,3,5,10,15,30].map(m => <option key={m} value={m} style={{ background: '#141414' }}>{m}분</option>)}
                        </select>
                        <span className="text-xs text-[#404040]">마다 자동 체크</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {slackConnected() && (
                      <button
                        type="button"
                        onClick={() => window.tidy?.channel.sync('slack')}
                        className="text-xs text-[#c8c8d0] hover:text-[#818cf8] transition-colors"
                      >
                        동기화
                      </button>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      slackConnected()
                        ? 'text-green-400 bg-green-900/20 border border-green-700/30'
                        : 'text-[#737373] bg-[#1a1a1a] border border-[#2a2a2a]'
                    }`}>
                      {slackConnected() ? '연결됨' : '미연결'}
                    </span>
                  </div>
                </div>
                <form onSubmit={handleSlackConnect} className="px-4 py-4 space-y-3">
                  <div>
                    <input
                      type="password"
                      value={slackToken}
                      onChange={(e) => setSlackToken(e.target.value)}
                      placeholder="xoxp-..."
                      className={inputCls}
                    />
                    <p className="text-xs text-[#404040] mt-1">api.slack.com/apps · channels:history, users:read 권한 필요</p>
                  </div>
                  <button type="submit" disabled={!slackToken.trim() || connecting.slack} className={btnOutlineCls}>
                    {connecting.slack ? '연결 중...' : slackConnected() ? '재연결' : '연결 테스트 & 저장'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ── 저장소 탭 ── */}
          {tab === 'vault' && (
            <div className="space-y-6">
              {/* Obsidian Vault */}
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">Obsidian Vault</h2>
                <p className="text-xs text-[#737373] mb-3">MD 파일을 저장할 Vault 폴더를 지정합니다</p>

                {/* 자동 감지된 Vault */}
                {detectedVaults.length > 0 && (
                  <div className="mb-3 p-3 bg-[#141414] border border-white/20 rounded-lg">
                    <p className="text-xs text-[#c8c8d0] font-medium mb-2">감지된 Obsidian Vault</p>
                    <div className="space-y-2">
                      {detectedVaults.map((vault) => (
                        <div key={vault.path} className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-[#e5e5e5] font-medium">{vault.name}</p>
                            <p className="text-xs text-[#404040] font-mono truncate">{vault.path}</p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                const newPaths = [...new Set([...scanPaths, vault.path])]
                                setScanPaths(newPaths)
                                await window.tidy?.settings.save({ scanPaths: newPaths })
                                const preview = await window.tidy?.dialog.previewFolders(vault.path)
                                if (preview?.folders?.length) setScanPreview((prev) => ({ ...prev, [vault.path]: preview.folders }))
                                showFeedback('success', `${vault.name} 스캔 경로에 추가됨`)
                              }}
                              className="px-2 py-1 text-xs text-[#737373] border border-[#2a2a2a] rounded hover:border-[#c8c8d0] hover:text-[#c8c8d0] transition-colors"
                            >
                              폴더 학습
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const result = await window.tidy?.vault.setPath(vault.path)
                                if (result?.success) {
                                  setSettings((prev) => ({ ...prev, vaultPath: vault.path }))
                                  setVaultScanResult({ people: result.people, projects: result.projects })
                                  showFeedback('success', `${vault.name} Vault 연결 완료`)
                                } else showFeedback('error', result?.error || 'Vault 연결 실패')
                              }}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                settings.vaultPath === vault.path
                                  ? 'text-green-400 bg-green-900/20 border border-green-700/30 cursor-default'
                                  : 'text-white bg-[#d4d4d8] hover:bg-[#b8b8c0]'
                              }`}
                            >
                              {settings.vaultPath === vault.path ? '✓ 사용 중' : 'Vault 설정'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 현재 Vault 상태 */}
                {settings.vaultPath && (
                  <div className="mb-3 p-3 bg-[#141414] border border-[#2a2a2a] rounded-lg flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-[#737373] mb-0.5">현재 Vault</p>
                      <p className="text-xs text-[#e5e5e5] font-mono break-all">{settings.vaultPath}</p>
                      {vaultScanResult && (
                        <p className="text-xs text-green-400 mt-1">인물 {vaultScanResult.people}명 · 프로젝트 {vaultScanResult.projects}개</p>
                      )}
                    </div>
                    <button onClick={() => window.tidy?.obsidian.openVault()} className="flex-shrink-0 text-xs text-[#c8c8d0] hover:text-[#818cf8] transition-colors whitespace-nowrap">
                      Obsidian 열기
                    </button>
                  </div>
                )}

                {/* 수동 경로 입력 */}
                <form onSubmit={handleSetVaultPath} className="flex gap-2">
                  <input
                    type="text"
                    value={vaultInput}
                    onChange={(e) => setVaultInput(e.target.value)}
                    placeholder="/Users/me/Documents/MyVault"
                    className={`${inputCls} font-mono flex-1`}
                  />
                  <button type="submit" disabled={!vaultInput.trim()} className="px-3 py-2 bg-[#141414] border border-[#2a2a2a] text-[#e5e5e5] text-sm rounded-lg hover:border-[#c8c8d0] hover:text-[#c8c8d0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                    연결
                  </button>
                </form>
                <p className="text-xs text-[#404040] mt-1">기존 파일은 보존됩니다</p>
              </div>

              {/* 폴더 학습 */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">폴더 구조 학습</h2>
                <p className="text-xs text-[#737373] mb-3">AI가 기존 폴더명을 학습해 새 파일을 같은 이름 폴더에 분류합니다</p>

                {scanPaths.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {scanPaths.map((p) => (
                      <div key={p} className="p-3 bg-[#141414] border border-[#2a2a2a] rounded-lg">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-[#e5e5e5] font-mono break-all flex-1">{p}</p>
                          <button onClick={() => handleRemoveScanPath(p)} className="flex-shrink-0 text-[#404040] hover:text-red-400 transition-colors"><IconClose size={11} /></button>
                        </div>
                        {scanPreview[p]?.length > 0 && (
                          <p className="text-xs text-[#404040] mt-1.5 leading-relaxed">
                            {scanPreview[p].slice(0, 10).join(' · ')}
                            {scanPreview[p].length > 10 && ` 외 ${scanPreview[p].length - 10}개`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleAddScanPath}
                  className="w-full px-4 py-2.5 bg-[#141414] border border-dashed border-[#2a2a2a] text-[#737373] text-sm rounded-lg hover:border-[#c8c8d0] hover:text-[#c8c8d0] transition-colors"
                >
                  + 폴더 추가
                </button>
              </div>
            </div>
          )}

          {/* ── 알림 탭 ── */}
          {tab === 'notifications' && (
            <div className="space-y-6">
              {/* 테마 */}
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">화면 테마</h2>
                <p className="text-xs text-[#737373] mb-3">앱의 색상 테마를 선택합니다</p>
                <div className="flex gap-2">
                  {[
                    { value: 'auto', label: '시스템', icon: '◐' },
                    { value: 'dark', label: '다크',   icon: '●' },
                    { value: 'light', label: '라이트', icon: '○' },
                  ].map(({ value, label, icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] transition-colors ${
                        currentTheme === value
                          ? 'border-[#d4d4d8]/40 bg-[#d4d4d8]/10 text-[#d4d4d8]'
                          : 'border-[#2a2a2a] text-[#737373] hover:text-[#9a9cb8] hover:border-[#3a3a3a]'
                      }`}
                    >
                      <span className="text-[11px]">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 글씨 크기 */}
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">글씨 크기</h2>
                <p className="text-xs text-[#737373] mb-3">앱 전체 텍스트 크기를 조절합니다</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFontSize(fontSize - 0.1)}
                    disabled={fontSize <= 0.8}
                    className="w-7 h-7 rounded-lg border border-[#2a2a2a] text-[#9a9cb8] hover:border-[#3a3a3a] hover:text-white disabled:opacity-30 flex items-center justify-center text-base transition-colors"
                  >−</button>
                  <div className="flex-1 relative h-1.5 bg-[#2a2a2a] rounded-full">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-[#d4d4d8] transition-all"
                      style={{ width: `${((fontSize - 0.8) / 0.6) * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0.8} max={1.4} step={0.05}
                      value={fontSize}
                      onChange={e => setFontSize(parseFloat(e.target.value))}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                    />
                  </div>
                  <button
                    onClick={() => setFontSize(fontSize + 0.1)}
                    disabled={fontSize >= 1.4}
                    className="w-7 h-7 rounded-lg border border-[#2a2a2a] text-[#9a9cb8] hover:border-[#3a3a3a] hover:text-white disabled:opacity-30 flex items-center justify-center text-base transition-colors"
                  >+</button>
                  <span className="text-[12px] text-[#737373] w-10 text-right">{Math.round(fontSize * 100)}%</span>
                  <button
                    onClick={() => setFontSize(1)}
                    className="text-[11px] text-[#505272] hover:text-[#9a9cb8] transition-colors"
                  >초기화</button>
                </div>
                <div className="mt-3 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
                  <p className="text-[#9a9cb8]" style={{ fontSize: `${fontSize * 13}px` }}>미리보기 — 안녕하세요, Tidy입니다.</p>
                </div>
              </div>

              {/* 캘린더 */}
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">캘린더 자동 등록</h2>
                <p className="text-xs text-[#737373] mb-3">미팅·약속·마감이 감지되면 macOS 캘린더에 자동으로 추가합니다</p>

                <form onSubmit={handleSaveCalendar} className="space-y-3">
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-sm text-[#e5e5e5] flex-1 min-w-0">캘린더 자동 등록</span>
                    <Toggle
                      value={settings.calendarEnabled}
                      onChange={() => setSettings((prev) => ({ ...prev, calendarEnabled: !prev.calendarEnabled }))}
                    />
                  </div>
                  {settings.calendarEnabled && (
                    <div>
                      <input
                        type="text"
                        value={calendarName}
                        onChange={(e) => setCalendarName(e.target.value)}
                        placeholder={availableCalendars.length > 0 ? availableCalendars[0] : '홈'}
                        className={inputCls}
                      />
                      {availableCalendars.length > 0 && (
                        <p className="text-xs text-[#404040] mt-1">감지된 캘린더: {availableCalendars.join(', ')}</p>
                      )}
                    </div>
                  )}
                  <button type="submit" className={btnOutlineCls}>저장</button>
                </form>
              </div>

              {/* 앱 알림 감지 */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">앱 알림 감지</h2>
                <p className="text-xs text-[#737373] mb-3">
                  맥에 설치된 모든 앱의 알림을 자동으로 수집합니다.
                  카카오톡, 텔레그램, LINE, Discord, Teams 등 별도 설정 없이 바로 동작합니다.
                </p>

                <div className="space-y-2">
                  {/* 항상 활성 */}
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-[#1e1e1e] rounded-lg">
                    <div>
                      <p className="text-sm text-[#e5e5e5]">모든 앱 알림</p>
                      <p className="text-xs text-[#404040]">카카오톡, Telegram, LINE, Discord 등</p>
                    </div>
                    <span className="text-xs text-[#c8c8d0] bg-white/8 px-2 py-1 rounded">항상 켜짐</span>
                  </div>
                  {/* FDA 상태 표시 */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                    fdaGranted === true
                      ? 'bg-green-900/10 border-green-800/30'
                      : 'bg-yellow-900/10 border-yellow-700/30'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${fdaGranted === true ? 'text-green-400' : 'text-yellow-500'}`}>
                        {fdaGranted === true ? '✓ 전체 디스크 접근 허용됨' : '⚠ 전체 디스크 접근 필요'}
                      </span>
                      {fdaGranted !== true && (
                        <span className="text-[10px] text-[#505070]">알림 감지가 비활성화됩니다</span>
                      )}
                    </div>
                    {fdaGranted !== true && (
                      <button
                        onClick={() => window.tidy?.permissions.requestFDA()}
                        className="text-[11px] text-yellow-400 hover:text-yellow-200 border border-yellow-700/40 hover:border-yellow-500/60 px-2.5 py-1 rounded-md transition-colors flex-shrink-0"
                      >
                        권한 요청
                      </button>
                    )}
                  </div>

                  {/* iMessage는 별도 opt-in */}
                  <div className="flex items-center justify-between gap-3 p-3 bg-[#141414] border border-[#2a2a2a] rounded-lg mt-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#e5e5e5]">iMessage</p>
                      <p className="text-xs text-[#404040]">Apple 메시지 앱 (메시지 DB 직접 접근)</p>
                    </div>
                    <Toggle
                      value={settings.notificationSources.imessage}
                      onChange={() => handleNotifSourceToggle('imessage')}
                    />
                  </div>
                </div>
              </div>

              {/* 파일 감시 폴더 */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">파일 감시 폴더</h2>
                <p className="text-xs text-[#737373] mb-3">
                  지정한 폴더에 파일을 넣으면 자동으로 분석해 인박스에 추가합니다.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={watchFolderPath}
                    onChange={(e) => setWatchFolderPath(e.target.value)}
                    placeholder="예: /Users/me/Downloads/tidy-inbox"
                    className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#333] focus:outline-none focus:border-white/30"
                  />
                  <button
                    onClick={async () => {
                      const folder = await window.tidy?.dialog.openFolder()
                      if (folder) setWatchFolderPath(folder)
                    }}
                    className="flex-shrink-0 px-3 py-2 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg text-xs text-[#9a9cb8] hover:text-[#d4d4d8] hover:border-[#3a3a3a] transition-colors"
                  >
                    찾기
                  </button>
                  <button
                    onClick={async () => {
                      const res = await window.tidy?.settings.save({ watchFolderPath: watchFolderPath.trim() })
                      if (res?.success) showFeedback('success', watchFolderPath.trim() ? '감시 폴더가 설정되었습니다' : '감시 폴더가 해제되었습니다')
                    }}
                    className="flex-shrink-0 px-3 py-2 bg-[#d4d4d8] hover:bg-[#b8b8c0] text-white rounded-lg text-xs transition-colors"
                  >
                    저장
                  </button>
                </div>
                {watchFolderPath && (
                  <p className="text-xs text-[#404040] mt-1.5">감시 중: {watchFolderPath}</p>
                )}
              </div>

              {/* 앱별 알림 필터 */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-[#e5e5e5]">앱별 알림 필터</h2>
                  <button
                    onClick={async () => {
                      const apps = await window.tidy?.notifications.getSeenApps()
                      if (apps) setSeenApps(apps)
                    }}
                    className="text-xs text-[#505272] hover:text-[#9a9cb8] transition-colors"
                  >
                    새로고침
                  </button>
                </div>
                <p className="text-xs text-[#737373] mb-3">
                  알림이 감지된 앱 목록입니다. 차단하면 해당 앱의 알림을 무시합니다.
                </p>
                {Object.keys(seenApps).length === 0 ? (
                  <p className="text-xs text-[#333] px-1">아직 감지된 앱이 없습니다. 알림이 오면 자동으로 표시됩니다.</p>
                ) : (
                  <div className="space-y-1.5">
                    {Object.entries(seenApps)
                      .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
                      .map(([bundleId, info]) => {
                        const isBlocked = blockedBundles.includes(bundleId)
                        return (
                          <div key={bundleId} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${isBlocked ? 'bg-[#1a1010] border-[#2a1a1a]' : 'bg-[#141414] border-[#1e1e1e]'}`}>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${isBlocked ? 'text-[#505050] line-through' : 'text-[#e5e5e5]'}`}>
                                {info.name}
                              </p>
                              <p className="text-xs text-[#333] truncate">{bundleId}</p>
                            </div>
                            <span className="text-xs text-[#404040] flex-shrink-0">{info.count || 0}회</span>
                            <Toggle
                              value={!isBlocked}
                              onChange={async () => {
                                const newBlocked = isBlocked
                                  ? blockedBundles.filter(b => b !== bundleId)
                                  : [...blockedBundles, bundleId]
                                setBlockedBundles(newBlocked)
                                await window.tidy?.notifications.setBlocked(newBlocked)
                              }}
                            />
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Google Drive 탭 ──────────────────────────── */}
          {tab === 'gdrive' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">Google Drive 연동</h2>
                <p className="text-xs text-[#404040] mb-4">
                  Drive에 새로 추가된 파일을 자동으로 분석해 인박스에 추가합니다.
                  <br />
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); window.open?.('https://console.cloud.google.com/apis/credentials', '_blank') }}
                    className="text-[#c8c8d0] hover:underline"
                  >Google Cloud Console</a>에서 OAuth 2.0 클라이언트 ID를 발급받으세요.
                </p>

                {/* 연결 상태 */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-4 ${gdriveConnected ? 'bg-green-900/20 border border-green-700/30' : 'bg-[#1a1a1a] border border-[#2a2a2a]'}`}>
                  <span className="text-base">{gdriveConnected ? '🟢' : '⚪'}</span>
                  <span className="text-xs text-[#a0a0a0]">{gdriveConnected ? 'Google Drive에 연결됨' : '연결되지 않음'}</span>
                  {gdriveConnected && (
                    <button
                      onClick={async () => {
                        await window.tidy?.gdrive.disconnect()
                        setGdriveConnected(false)
                        showFeedback('ok', 'Google Drive 연결이 해제되었습니다')
                      }}
                      className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
                    >연결 해제</button>
                  )}
                </div>

                {/* Client ID / Secret 입력 */}
                {!gdriveConnected && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-[#737373] mb-1.5">Client ID</label>
                      <input
                        type="text"
                        value={gdriveClientId}
                        onChange={(e) => setGdriveClientId(e.target.value)}
                        placeholder="xxxx.apps.googleusercontent.com"
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#333] focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#737373] mb-1.5">Client Secret</label>
                      <input
                        type="password"
                        value={gdriveClientSecret}
                        onChange={(e) => setGdriveClientSecret(e.target.value)}
                        placeholder="GOCSPX-..."
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#333] focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <button
                      disabled={!gdriveClientId.trim() || !gdriveClientSecret.trim() || gdriveConnecting}
                      onClick={async () => {
                        setGdriveConnecting(true)
                        try {
                          // 먼저 credentials 저장
                          await window.tidy?.settings.save({
                            gdriveClientId: gdriveClientId.trim(),
                            gdriveClientSecret: gdriveClientSecret.trim(),
                          })
                          // OAuth 흐름 시작 (브라우저 열기)
                          const res = await window.tidy?.gdrive.authStart()
                          if (res?.success) {
                            setGdriveConnected(true)
                            showFeedback('ok', 'Google Drive 연결 완료!')
                          } else {
                            showFeedback('error', res?.error || '연결 실패')
                          }
                        } catch (err) {
                          showFeedback('error', err.message)
                        } finally {
                          setGdriveConnecting(false)
                        }
                      }}
                      className="w-full py-2 bg-[#d4d4d8] hover:bg-[#b8b8c0] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {gdriveConnecting ? '브라우저에서 인증 중...' : 'Google 계정으로 연결'}
                    </button>
                  </div>
                )}

                <p className="text-xs text-[#333] mt-4">
                  리디렉션 URI: <code className="text-[#555]">http://localhost:3141/oauth/callback</code>
                  <br />
                  Google Cloud Console의 승인된 리디렉션 URI에 위 주소를 추가하세요.
                </p>
              </div>
            </div>
          )}

          {/* ── 소스 카테고리 탭 ──────────────────────────── */}
          {tab === 'sources' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">소스 카테고리</h2>
                <p className="text-xs text-[#737373] mb-4">
                  인박스 필터 탭에 표시될 소스 이름과 아이콘을 관리합니다.
                  새 앱에서 알림이 오면 자동으로 추가됩니다.
                </p>

                {/* 기본 소스 목록 (수정 불가) */}
                <div className="mb-4">
                  <p className="text-xs text-[#404040] uppercase tracking-wider mb-2">기본 소스</p>
                  <div className="space-y-1">
                    {[
                      { id: 'gmail',    Icon: IconMail,     label: '이메일' },
                      { id: 'slack',    Icon: IconMessage,  label: '슬랙' },
                      { id: 'kakao',    Icon: IconKakao,    label: '카카오톡' },
                      { id: 'imessage', Icon: IconIMessage, label: 'iMessage' },
                      { id: 'file',     Icon: IconFile,     label: '파일' },
                    ].map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-[#141414] border border-[#222] rounded-lg">
                        <s.Icon size={14} className="text-[#737373]" />
                        <span className="text-sm text-[#a0a0a0] flex-1">{s.label}</span>
                        <span className="text-xs text-[#333]">기본</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 커스텀/자동감지 소스 */}
                {customSources.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-[#404040] uppercase tracking-wider mb-2">커스텀 소스</p>
                    <div className="space-y-1">
                      {customSources.map(s => (
                        <div key={s.id}>
                          {editingSource?.id === s.id ? (
                            // 수정 폼
                            <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-white/25 rounded-lg">
                              <SourceIcon source={editingSource.id} size={14} className="text-[#737373] flex-shrink-0" />
                              <input
                                type="text"
                                value={editingSource.label}
                                onChange={(e) => setEditingSource(prev => ({ ...prev, label: e.target.value }))}
                                className="flex-1 bg-[#2a2a2a] text-sm border border-[#333] rounded px-2 py-1 text-[#e5e5e5] focus:outline-none"
                                placeholder="이름"
                              />
                              <button
                                onClick={async () => {
                                  await window.tidy?.sources.save({ id: editingSource.id, label: editingSource.label })
                                  setCustomSources(prev => prev.map(c => c.id === editingSource.id ? { ...c, label: editingSource.label } : c))
                                  setEditingSource(null)
                                }}
                                className="text-xs text-[#c8c8d0] hover:text-[#818cf8] px-2 py-1"
                              >저장</button>
                              <button
                                onClick={() => setEditingSource(null)}
                                className="text-xs text-[#404040] hover:text-[#737373] px-2 py-1"
                              >취소</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 px-3 py-2 bg-[#141414] border border-[#222] rounded-lg hover:border-[#2a2a2a] group">
                              <SourceIcon source={s.id} size={14} className="text-[#737373]" />
                              <span className="text-sm text-[#e5e5e5] flex-1">{s.label}</span>
                              {s.autoDetected && (
                                <span className="text-xs text-[#404040] mr-1">자동감지</span>
                              )}
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setEditingSource({ id: s.id, label: s.label, icon: s.icon })}
                                  className="text-xs text-[#737373] hover:text-[#e5e5e5] px-2 py-0.5 rounded transition-colors"
                                >수정</button>
                                <button
                                  onClick={async () => {
                                    await window.tidy?.sources.delete(s.id)
                                    setCustomSources(prev => prev.filter(c => c.id !== s.id))
                                  }}
                                  className="text-xs text-[#737373] hover:text-red-400 px-2 py-0.5 rounded transition-colors"
                                >삭제</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 새 소스 추가 */}
                {showAddSource ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-white/25 rounded-lg">
                    <input
                      type="text"
                      value={newSource.label}
                      onChange={(e) => setNewSource(prev => ({ ...prev, label: e.target.value }))}
                      className="flex-1 bg-[#2a2a2a] text-sm border border-[#333] rounded px-2 py-1 text-[#e5e5e5] focus:outline-none"
                      placeholder="이름 (예: Discord)"
                    />
                    <input
                      type="text"
                      value={newSource.id}
                      onChange={(e) => setNewSource(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                      className="w-24 bg-[#2a2a2a] text-xs border border-[#333] rounded px-2 py-1 text-[#737373] focus:outline-none"
                      placeholder="키 (discord)"
                    />
                    <button
                      onClick={async () => {
                        if (!newSource.id || !newSource.label) return
                        if (BUILTIN_SOURCE_IDS.has(newSource.id)) {
                          showFeedback('error', '기본 소스 ID는 사용할 수 없습니다')
                          return
                        }
                        await window.tidy?.sources.save({ id: newSource.id, label: newSource.label })
                        setCustomSources(prev => [...prev.filter(c => c.id !== newSource.id), { id: newSource.id, label: newSource.label, match: [newSource.id] }])
                        setNewSource({ id: '', label: '' })
                        setShowAddSource(false)
                      }}
                      className="text-xs text-[#c8c8d0] hover:text-[#818cf8] px-2 py-1"
                    >추가</button>
                    <button
                      onClick={() => { setShowAddSource(false); setNewSource({ id: '', label: '' }) }}
                      className="text-xs text-[#404040] hover:text-[#737373] px-2 py-1"
                    >취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddSource(true)}
                    className="w-full text-xs text-[#404040] hover:text-[#737373] border border-dashed border-[#2a2a2a] hover:border-[#404040] rounded-lg py-2.5 transition-colors"
                  >
                    + 새 소스 추가
                  </button>
                )}
              </div>

              {/* ─── 카테고리 관리 ─── */}
              <div className="mt-6 pt-6 border-t border-[#1a1a1a]">
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">인박스 카테고리</h2>
                <p className="text-xs text-[#737373] mb-4">
                  AI가 분류에 사용하는 카테고리를 관리합니다. <span className="text-[#404040]">정보</span>는 기본 카테고리로 삭제할 수 없습니다.
                </p>

                <div className="space-y-1 mb-3">
                  {categories.map((cat) => (
                    <div key={cat} className="flex items-center gap-3 px-3 py-2 bg-[#141414] border border-[#222] rounded-lg group">
                      <span className="text-sm text-[#e5e5e5] flex-1">{cat}</span>
                      {cat === '정보' ? (
                        <span className="text-xs text-[#333]">기본</span>
                      ) : (
                        <button
                          onClick={async () => {
                            if (!confirm(`"${cat}" 카테고리를 삭제하시겠습니까?\n해당 카테고리 항목은 "정보"로 이동됩니다.`)) return
                            const res = await window.tidy?.categories.delete(cat)
                            if (res?.success) {
                              setCategories(res.categories)
                              showFeedback('success', `"${cat}" 삭제됨${res.reassigned > 0 ? ` (${res.reassigned}개 항목 → 정보)` : ''}`)
                            } else {
                              showFeedback('error', res?.error || '삭제 실패')
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-xs text-[#737373] hover:text-red-400 px-2 py-0.5 rounded transition-all"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {showAddCategory ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-white/25 rounded-lg">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const res = await window.tidy?.categories.add(newCategoryName)
                          if (res?.success) { setCategories(res.categories); setNewCategoryName(''); setShowAddCategory(false) }
                          else showFeedback('error', res?.error || '추가 실패')
                        }
                      }}
                      className="flex-1 bg-[#2a2a2a] text-sm border border-[#333] rounded px-2 py-1 text-[#e5e5e5] focus:outline-none"
                      placeholder="카테고리 이름 (예: 건강)"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        const res = await window.tidy?.categories.add(newCategoryName)
                        if (res?.success) { setCategories(res.categories); setNewCategoryName(''); setShowAddCategory(false) }
                        else showFeedback('error', res?.error || '추가 실패')
                      }}
                      className="text-xs text-[#c8c8d0] hover:text-[#818cf8] px-2 py-1"
                    >추가</button>
                    <button
                      onClick={() => { setShowAddCategory(false); setNewCategoryName('') }}
                      className="text-xs text-[#404040] hover:text-[#737373] px-2 py-1"
                    >취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddCategory(true)}
                    className="w-full text-xs text-[#404040] hover:text-[#737373] border border-dashed border-[#2a2a2a] hover:border-[#404040] rounded-lg py-2.5 transition-colors"
                  >
                    + 카테고리 추가
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 마켓플레이스 탭 ──────────────────────────── */}
          {tab === 'marketplace' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">스킬 마켓플레이스</h2>
                <p className="text-xs text-[#737373] mb-5">
                  커스텀 스킬을 공유하고 탐색하는 마켓 서버 설정입니다.
                </p>

                {/* 서버 URL */}
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 mb-3">
                  <h3 className="text-xs font-semibold text-[#c8c8d0] mb-1">서버 주소</h3>
                  <p className="text-xs text-[#505050] mb-3">
                    마켓플레이스 서버 URL입니다. 로컬 서버 또는 공유 서버 주소를 입력하세요.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={marketUrl}
                      onChange={e => { setMarketUrl(e.target.value); setMarketTestStatus(null) }}
                      placeholder="http://localhost:3333"
                      className={inputCls}
                    />
                    <button
                      onClick={async () => {
                        setMarketTestStatus(null); setMarketTestMsg('')
                        try {
                          const res = await fetch(`${marketUrl.replace(/\/$/, '')}/health`)
                          if (res.ok) {
                            const data = await res.json()
                            setMarketTestStatus('ok')
                            setMarketTestMsg(`연결 성공 — 스킬 ${data.skills}개`)
                          } else {
                            setMarketTestStatus('fail'); setMarketTestMsg(`서버 오류: ${res.status}`)
                          }
                        } catch (e) {
                          setMarketTestStatus('fail'); setMarketTestMsg(e.message)
                        }
                      }}
                      className="px-3 py-2 bg-[#141414] border border-[#2a2a2a] text-[#e5e5e5] text-sm rounded-lg hover:border-[#c8c8d0] whitespace-nowrap transition-colors"
                    >연결 테스트</button>
                  </div>
                  {marketTestStatus === 'ok' && <p className="text-xs text-green-400 mt-2">✓ {marketTestMsg}</p>}
                  {marketTestStatus === 'fail' && <p className="text-xs text-red-400 mt-2">✗ {marketTestMsg}</p>}
                </div>

                {/* 작성자 이름 */}
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 mb-3">
                  <h3 className="text-xs font-semibold text-[#c8c8d0] mb-1">작성자 이름</h3>
                  <p className="text-xs text-[#505050] mb-3">스킬을 공유할 때 표시되는 이름입니다.</p>
                  <input
                    value={marketAuthorName}
                    onChange={e => setMarketAuthorName(e.target.value)}
                    placeholder="닉네임 또는 이름"
                    className={inputCls}
                  />
                </div>

                {/* 저장 버튼 */}
                <button
                  onClick={async () => {
                    setMarketSaving(true)
                    try {
                      await window.tidy?.marketplace.setUrl?.(marketUrl.trim() || 'http://localhost:3333')
                      // authorName은 publish 시점에 저장되므로 여기선 로컬 상태만 유지
                      showFeedback('success', '마켓플레이스 설정이 저장되었습니다')
                    } catch (e) {
                      showFeedback('error', e.message)
                    } finally { setMarketSaving(false) }
                  }}
                  disabled={marketSaving}
                  className={btnOutlineCls}
                >{marketSaving ? '저장 중...' : '저장'}</button>

                {/* 로컬 서버 안내 */}
                <div className="mt-4 p-4 rounded-xl bg-[#0d0e14] border border-[#1a1c28]">
                  <p className="text-[11px] font-semibold text-[#6b6e8c] mb-2">로컬 마켓 서버 실행 방법</p>
                  <pre className="text-[11px] text-[#c026d3] font-mono leading-relaxed bg-[#09090c] border border-[#1a1c28] rounded-lg px-3 py-2.5">{`cd tidy/server
npm install
npm start`}</pre>
                  <p className="text-[10px] text-[#404060] mt-2">기본 포트: 3333 · SQLite 로컬 DB 사용</p>
                </div>
              </div>
            </div>
          )}

          {/* ── 백업/복구 탭 ──────────────────────────────── */}
          {tab === 'backup' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-[#e5e5e5] mb-1">설정 백업 및 복구</h2>
                <p className="text-xs text-[#737373] mb-5">
                  API 키, 채널 설정, 알림 설정을 JSON 파일로 내보내거나 가져올 수 있습니다.
                </p>

                {/* 내보내기 */}
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 mb-3">
                  <h3 className="text-xs font-semibold text-[#c8c8d0] mb-1">내보내기</h3>
                  <p className="text-xs text-[#505050] mb-3">현재 설정을 JSON 파일로 다운로드합니다. API 키가 포함됩니다.</p>
                  <button
                    onClick={async () => {
                      try {
                        const res = await window.tidy?.settings.export()
                        if (!res?.success) { showFeedback('error', res?.error || '내보내기 실패'); return }
                        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
                        const url  = URL.createObjectURL(blob)
                        const a    = document.createElement('a')
                        a.href     = url
                        a.download = `tidy-settings-${new Date().toISOString().slice(0, 10)}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                        showFeedback('ok', '설정을 내보냈습니다')
                      } catch (e) { showFeedback('error', e.message) }
                    }}
                    className="px-4 py-2 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-xs text-[#c8c8d0] rounded-lg transition-colors border border-[#2a2a2a]"
                  >
                    JSON으로 내보내기
                  </button>
                </div>

                {/* 가져오기 */}
                <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-[#c8c8d0] mb-1">가져오기</h3>
                  <p className="text-xs text-[#505050] mb-3">백업 파일을 선택하면 설정이 복원됩니다. 앱 재시작이 필요합니다.</p>
                  <label className="inline-block px-4 py-2 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-xs text-[#c8c8d0] rounded-lg transition-colors border border-[#2a2a2a] cursor-pointer">
                    JSON 파일 선택
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = async (ev) => {
                          try {
                            const data = JSON.parse(ev.target.result)
                            const res  = await window.tidy?.settings.import(data)
                            if (res?.success) {
                              showFeedback('ok', '설정을 가져왔습니다. 앱을 재시작해 주세요.')
                            } else {
                              showFeedback('error', res?.error || '가져오기 실패')
                            }
                          } catch { showFeedback('error', '파일을 읽을 수 없습니다') }
                        }
                        reader.readAsText(file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
