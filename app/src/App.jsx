import { useState, useEffect, createContext, useContext } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'

export const ThemeContext = createContext({ theme: 'auto', setTheme: () => {} })

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
import Onboarding from './pages/Onboarding.jsx'
import TopBar from './components/TopBar.jsx'
import Home from './pages/Home.jsx'
import Inbox from './pages/Inbox.jsx'
import Tasks from './pages/Tasks.jsx'
import People from './pages/People.jsx'
import Settings from './pages/Settings.jsx'
import Calendar from './pages/Calendar.jsx'

function MainLayout() {
  const [syncStatus, setSyncStatus] = useState({})
  const [newCount, setNewCount] = useState(0)
  const [urgentAlerts, setUrgentAlerts] = useState([])
  const [highlightItemId, setHighlightItemId] = useState(null)
  const navigate = useNavigate()

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
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useThemeManager()
  const [onboardingDone, setOnboardingDone] = useState(null)

  useEffect(() => {
    window.tidy?.onboarding.get()
      .then((r) => setOnboardingDone(r?.done === true))
      .catch(() => setOnboardingDone(true))
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
      <HashRouter>
        <MainLayout />
      </HashRouter>
    </ThemeContext.Provider>
  )
}
