import { useState, useEffect, createContext } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { setCustomSkillsCache } from './components/SkillPanel.jsx'

export const ThemeContext = createContext({ theme: 'auto', setTheme: () => {} })
export const FontSizeContext = createContext({ fontSize: 1, setFontSize: () => {} })
export const AIContext = createContext({ ctx: null, setCtx: () => {} })

function useThemeManager() {
  const [theme, setTheme] = useState(() => localStorage.getItem('tidy-theme') || 'auto')

  useEffect(() => {
    const apply = (prefersDark) => {
      const resolved = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme
      document.documentElement.setAttribute('data-theme', resolved)
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)
    if (theme === 'auto') {
      const handler = (e) => apply(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  function updateTheme(val) {
    localStorage.setItem('tidy-theme', val)
    setTheme(val)
  }

  return [theme, updateTheme]
}

function useFontSizeManager() {
  const [fontSize, setFontSize] = useState(() => {
    const saved = parseFloat(localStorage.getItem('tidy-font-size') || '1')
    // 저장된 줌을 즉시 적용 (렌더러 레벨 줌 — 레이아웃에 영향 없음)
    window.tidy?.app?.setZoom(saved)
    return saved
  })

  function updateFontSize(val) {
    const clamped = Math.min(1.4, Math.max(0.8, val))
    localStorage.setItem('tidy-font-size', String(clamped))
    window.tidy?.app?.setZoom(clamped)
    setFontSize(clamped)
  }

  return [fontSize, updateFontSize]
}
import Onboarding from './pages/Onboarding.jsx'
import TopBar from './components/TopBar.jsx'
import Home from './pages/Home.jsx'
import Inbox from './pages/Inbox.jsx'
import Tasks from './pages/Tasks.jsx'
import People from './pages/People.jsx'
import Settings from './pages/Settings.jsx'
import Calendar from './pages/Calendar.jsx'
import Skills from './pages/Skills.jsx'
import OrgAdmin from './pages/OrgAdmin.jsx'
import FileDropZone from './components/FileDropZone.jsx'
import Document from './pages/Document.jsx'
import GestureOverlay from './components/GestureOverlay.jsx'

function MainLayout({ setCtx }) {
  const [syncStatus, setSyncStatus] = useState({})
  const [newCount, setNewCount] = useState(0)
  const [urgentAlerts, setUrgentAlerts] = useState([])
  const [highlightItemId, setHighlightItemId] = useState(null)
  const navigate = useNavigate()

  // 전역 키보드 캡처: INPUT/TEXTAREA/contenteditable 외부에서 출력 가능한 키를 누르면
  // tidy:openCommandBar 커스텀 이벤트 발생
  useEffect(() => {
    function handleGlobalKey(e) {
      // 메타/컨트롤 조합, 특수 키 제외
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1) return
      // 이미 포커스된 입력 요소에서는 무시
      const active = document.activeElement
      if (!active) return
      const tag = active.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (active.isContentEditable) return
      // 커맨드 바 열기 이벤트 발생
      window.dispatchEvent(new CustomEvent('tidy:openCommandBar', { detail: { char: e.key } }))
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [])

  // Dock 배지 업데이트
  useEffect(() => {
    window.tidy?.badge.set(newCount)
  }, [newCount])

  useEffect(() => {
    // 초기 새 항목 수 로드
    window.tidy?.inbox.get({ limit: 200 }).then((data) => {
      if (Array.isArray(data)) {
        setNewCount(data.filter((i) => i.status === 'new').length)
      }
    }).catch(() => {})

    const unsubInbox = window.tidy?.inbox.onNewItem((item) => {
      setNewCount((prev) => prev + 1)
      if (item?.priority === 'high') {
        setUrgentAlerts((prev) => [...prev, { ...item, alertId: Date.now() }])
      }
    })
    const unsubStatus = window.tidy?.channel.onStatus((data) => {
      setSyncStatus((prev) => ({ ...prev, [data.type]: data }))
    })
    const unsubError = window.tidy?.channel.onError((data) => {
      setSyncStatus((prev) => ({ ...prev, [data.type]: { status: 'error', error: data.error } }))
    })
    // 알림 클릭 → 인박스 아이템으로 이동
    const unsubNav = window.tidy?.navigate.onInboxItem(({ itemId }) => {
      setHighlightItemId(itemId)
      navigate('/inbox')
    })
    return () => { unsubInbox?.(); unsubStatus?.(); unsubError?.(); unsubNav?.() }
  }, [])

  return (
    <FileDropZone>
    <div className="h-screen flex flex-col select-none overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>
      <TopBar
        syncStatus={syncStatus}
        newCount={newCount}
        onNavigateToItem={(itemId) => { setHighlightItemId(itemId); navigate('/inbox') }}
      />

      {urgentAlerts.length > 0 && (
        <div className="flex-shrink-0 space-y-1 px-3 pt-2">
          {urgentAlerts.map((alert) => (
            <div key={alert.alertId} className="flex items-start gap-2.5 px-3.5 py-2.5 bg-red-950/40 border border-red-900/50 rounded-xl fade-in">
              <svg className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3L1.5 13.5h13L8 3z"/>
                <path d="M8 7v3M8 11.5v.5"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-red-300 mb-0.5 tracking-wide uppercase">
                  긴급{alert.people?.length > 0 && <span className="font-normal normal-case tracking-normal text-red-400 ml-1.5">— {alert.people[0]}</span>}
                </p>
                <p className="text-[12px] text-red-200/80 leading-relaxed truncate">{alert.summary}</p>
              </div>
              <button
                onClick={() => setUrgentAlerts((prev) => prev.filter((a) => a.alertId !== alert.alertId))}
                className="flex-shrink-0 text-red-600 hover:text-red-400 transition-colors p-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l12 12M14 2L2 14"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/inbox" element={<Inbox highlightItemId={highlightItemId} onHighlightConsumed={() => setHighlightItemId(null)} />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/people" element={<People />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/org" element={<OrgAdmin />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/document" element={<Document />} />
        </Routes>
      </div>
      <GestureOverlay />
    </div>
    </FileDropZone>
  )
}

export default function App() {
  const [theme, setTheme] = useThemeManager()
  const [fontSize, setFontSize] = useFontSizeManager()
  const [onboardingDone, setOnboardingDone] = useState(null)
  const [ctx, setCtx] = useState(null)

  // 전역 드래그앤드롭 방어: 파일을 앱에 드롭했을 때 Electron이 file:// URL로 이동해
  // 앱 화면이 검정/빈 화면으로 교체되는 것을 방지
  useEffect(() => {
    const preventNav = (e) => e.preventDefault()
    document.addEventListener('dragover', preventNav)
    document.addEventListener('drop', preventNav)
    return () => {
      document.removeEventListener('dragover', preventNav)
      document.removeEventListener('drop', preventNav)
    }
  }, [])

  useEffect(() => {
    window.tidy?.onboarding.get()
      .then((r) => setOnboardingDone(r?.done === true))
      .catch(() => setOnboardingDone(true))
  }, [])

  // 줌 초기 적용 (useState 초기화 시 window.tidy가 준비 안 됐을 경우 대비)
  useEffect(() => {
    window.tidy?.app?.setZoom(fontSize)
  }, [])

  // 커스텀 스킬 전역 캐시 초기 로드 — 앱 시작 시 한 번 로드해
  // Inbox / People 등 모든 페이지에서 SkillPanel이 custom skill을 찾을 수 있게 함
  useEffect(() => {
    window.tidy?.skills.listCustom?.()
      .then(list => { if (Array.isArray(list)) setCustomSkillsCache(list) })
      .catch(() => {})
  }, [])

  if (onboardingDone === null) {
    return (
      <div className="h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-[#2a2a2a] text-sm">•••</div>
      </div>
    )
  }

  if (!onboardingDone) {
    return (
      <HashRouter>
        <Onboarding onComplete={() => setOnboardingDone(true)} />
      </HashRouter>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
        <AIContext.Provider value={{ ctx, setCtx }}>
          <HashRouter>
            <MainLayout setCtx={setCtx} />
          </HashRouter>
        </AIContext.Provider>
      </FontSizeContext.Provider>
    </ThemeContext.Provider>
  )
}
