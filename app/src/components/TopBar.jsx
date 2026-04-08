import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { MarkdownOutput } from './SkillPanel'

function Tooltip({ label, shortcut, children }) {
  const [visible, setVisible] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 pointer-events-none">
          <div className="flex items-center gap-1.5 whitespace-nowrap bg-[#1a1c2a] border border-[#252840] rounded-lg px-2.5 py-1.5 shadow-xl">
            <span className="text-[11px] text-[#c8c8d8]">{label}</span>
            {shortcut && (
              <kbd className="text-[10px] text-[#6b6e8c] bg-[#0f1018] border border-[#252840] rounded px-1 py-px font-mono leading-none">
                {shortcut}
              </kbd>
            )}
          </div>
          {/* 화살표 */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1a1c2a] border-t border-l border-[#252840] rotate-45" />
        </div>
      )}
    </div>
  )
}

// ─── Inline SVG icons ────────────────────────────────────────────────────────

const Ic = {
  inbox: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="10" rx="1.5"/>
      <path d="M1 9h3.5l1.5 2h4l1.5-2H15"/>
    </svg>
  ),
  tasks: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5l1.5 1.5 2.5-3"/>
      <path d="M2 9l1.5 1.5 2.5-3"/>
      <path d="M8 5h6M8 9.5h5"/>
    </svg>
  ),
  people: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5"/>
      <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5"/>
      <path d="M11.5 4a2 2 0 010 4M14 14c0-1.86-1.08-3.45-2.62-4.1"/>
    </svg>
  ),
  chart: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14V9M6 14V5M10 14V8M14 14V3"/>
    </svg>
  ),
  sync: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2.5A7 7 0 002.3 9.5"/>
      <path d="M2 13.5A7 7 0 0013.7 6.5"/>
      <path d="M14 2.5V6.5M14 2.5H10"/>
      <path d="M2 13.5V9.5M2 13.5H6"/>
    </svg>
  ),
  vault: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5L8 1.5z"/>
      <path d="M8 5.5L11.5 7.5v3L8 12.5 4.5 10.5v-3L8 5.5z" strokeOpacity="0.4"/>
    </svg>
  ),
  settings: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4l1.4-1.4M11 5l1.4-1.4"/>
    </svg>
  ),
  close: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 2l12 12M14 2L2 14"/>
    </svg>
  ),
  search: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="4.5"/>
      <path d="M10 10l4 4"/>
    </svg>
  ),
  calendar: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/>
      <path d="M1.5 6.5h13"/>
      <path d="M5 1.5v2M11 1.5v2"/>
      <path d="M4.5 9.5h1M7.5 9.5h1M10.5 9.5h1"/>
      <path d="M4.5 12h1M7.5 12h1M10.5 12h1"/>
    </svg>
  ),
  skills: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
    </svg>
  ),
}

const NAV_ITEMS = [
  { to: '/inbox', label: '인박스', icon: 'inbox' },
  { to: '/tasks', label: '태스크', icon: 'tasks' },
  { to: '/people', label: '인물', icon: 'people' },
  { to: '/calendar', label: '캘린더', icon: 'calendar' },
]

export default function TopBar({ syncStatus = {}, newCount = 0, onNavigateToItem }) {
  const [reportState, setReportState] = useState({ loading: false, report: null })
  const [showReport, setShowReport] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef(null)
  const searchTimerRef = useRef(null)
  const navigate = useNavigate()

  const isSyncing = Object.values(syncStatus).some(s => s.status === 'syncing')
  const lastSync = Object.values(syncStatus).reduce((latest, s) => {
    if (!s.lastSynced) return latest
    return !latest || s.lastSynced > latest ? s.lastSynced : latest
  }, null)

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setSearchQuery('')
      setSearchResults(null)
    }
  }, [searchOpen])

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function handleSearchInput(value) {
    setSearchQuery(value)
    clearTimeout(searchTimerRef.current)
    if (!value.trim()) { setSearchResults(null); return }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const results = await window.tidy?.search.global(value.trim())
        setSearchResults(results)
      } catch {}
      setSearchLoading(false)
    }, 250)
  }

  async function handleWeeklyReport() {
    setReportState({ loading: true, report: null })
    setShowReport(true)
    try {
      const result = await window.tidy?.report.weekly()
      setReportState({ loading: false, report: result?.success ? result.report : `오류: ${result?.error}` })
    } catch (err) {
      setReportState({ loading: false, report: `오류: ${err.message}` })
    }
  }

  const hasResults = searchResults && (
    searchResults.items?.length > 0 || searchResults.tasks?.length > 0 || searchResults.people?.length > 0
  )

  return (
    <>
      <header className="drag-region h-11 flex items-center pl-[76px] pr-3 border-b border-[#13141c] flex-shrink-0 bg-[#09090c]">

        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="no-drag flex items-center gap-2 mr-4 flex-shrink-0 group"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[#d4d4d8] flex-shrink-0">
            <rect x="2" y="4"   width="14" height="2" rx="1" fill="currentColor"/>
            <rect x="2" y="8"   width="10" height="2" rx="1" fill="currentColor" opacity="0.7"/>
            <rect x="2" y="12"  width="6"  height="2" rx="1" fill="currentColor" opacity="0.4"/>
          </svg>
          <span className="text-[13px] font-semibold text-[#a8aac4] tracking-[-0.015em] group-hover:text-[#d0d0e4] transition-colors">
            Tidy
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-3.5 bg-[#1a1c28] mr-4 flex-shrink-0" />

        {/* Navigation */}
        <nav className="no-drag flex items-center gap-0.5 flex-1">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md transition-all ${
                  isActive
                    ? 'bg-[#1c1c22] text-[#b8bacc]'
                    : 'text-[#6b6e8c] hover:text-[#a0a2bc] hover:bg-[#0e0f16]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`transition-colors flex-shrink-0 ${isActive ? 'text-[#c8c8d0]' : ''}`}>
                    {Ic[icon]}
                  </span>
                  <span className="tracking-[-0.01em]">{label}</span>
                  {to === '/inbox' && newCount > 0 && (
                    <span className="min-w-[15px] h-[15px] text-[9px] rounded-full flex items-center justify-center font-semibold bg-[#3a3a3e] text-[#e2e2ea] px-1 leading-none">
                      {newCount > 9 ? '9+' : newCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right controls */}
        <div className="no-drag flex items-center gap-0.5 flex-shrink-0">
          {isSyncing ? (
            <span className="text-[11px] text-[#6b6e8c] animate-pulse mr-2 tracking-wide">sync</span>
          ) : lastSync ? (
            <span className="text-[11px] text-[#505272] mr-2">{formatRelativeTime(lastSync)}</span>
          ) : null}

          {/* Search button */}
          <Tooltip label="전체 검색" shortcut="⌘F">
            <button
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#0e0f16] transition-colors"
            >
              {Ic.search}
            </button>
          </Tooltip>

          <Tooltip label="주간 리포트">
            <button
              onClick={handleWeeklyReport}
              disabled={reportState.loading}
              className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#0e0f16] transition-colors disabled:opacity-30"
            >
              {Ic.chart}
            </button>
          </Tooltip>

          <Tooltip label="지금 동기화">
            <button
              onClick={() => window.tidy?.channel.sync('all')}
              className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#0e0f16] transition-colors"
            >
              {Ic.sync}
            </button>
          </Tooltip>

          <Tooltip label="Vault 열기">
            <button
              onClick={() => window.tidy?.obsidian.openVault()}
              className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#0e0f16] transition-colors"
            >
              {Ic.vault}
            </button>
          </Tooltip>

          <Tooltip label="설정">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `p-1.5 rounded-md transition-colors block ${
                  isActive ? 'text-[#c8c8d0] bg-[#1c1c22]' : 'text-[#505272] hover:text-[#9a9cb8] hover:bg-[#0e0f16]'
                }`
              }
            >
              {Ic.settings}
            </NavLink>
          </Tooltip>
        </div>
      </header>

      {/* Global Search Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[80px] bg-black/60 backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-lg shadow-2xl fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#181a26]">
              <span className="text-[#505272] flex-shrink-0">{Ic.search}</span>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="인박스, 태스크, 인물 검색..."
                className="flex-1 bg-transparent text-[13px] text-[#d0d0e4] placeholder-[#3a3c58] focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults(null); searchInputRef.current?.focus() }}
                  className="text-[#505272] hover:text-[#9a9cb8] flex-shrink-0"
                >
                  {Ic.close}
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto py-2">
              {searchLoading && (
                <div className="flex justify-center py-6">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#3a3c58] animate-pulse" style={{ animationDelay: `${i*150}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              {!searchLoading && searchQuery && !hasResults && (
                <div className="text-center py-8">
                  <p className="text-[13px] text-[#505272]">결과가 없습니다</p>
                </div>
              )}

              {!searchLoading && hasResults && (
                <>
                  {searchResults.items?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] text-[#505272] font-semibold uppercase tracking-widest px-4 py-1.5">인박스</p>
                      {searchResults.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => { setSearchOpen(false); onNavigateToItem?.(item.id) }}
                          className="w-full text-left px-4 py-2 hover:bg-[#14151e] transition-colors"
                        >
                          <p className="text-[12px] text-[#c8c8d8] truncate">{item.summary || item.raw_text?.slice(0, 80)}</p>
                          <p className="text-[10px] text-[#505272] mt-0.5">{item.source} · {item.category}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.tasks?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] text-[#505272] font-semibold uppercase tracking-widest px-4 py-1.5">태스크</p>
                      {searchResults.tasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => { setSearchOpen(false); navigate('/tasks') }}
                          className="w-full text-left px-4 py-2 hover:bg-[#14151e] transition-colors"
                        >
                          <p className="text-[12px] text-[#c8c8d8] truncate">{task.title}</p>
                          {task.due_date && (
                            <p className="text-[10px] text-[#505272] mt-0.5">~{task.due_date.slice(0, 10)}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.people?.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] text-[#505272] font-semibold uppercase tracking-widest px-4 py-1.5">인물</p>
                      {searchResults.people.map(person => (
                        <button
                          key={person.id}
                          onClick={() => { setSearchOpen(false); navigate('/people') }}
                          className="w-full text-left px-4 py-2 hover:bg-[#14151e] transition-colors"
                        >
                          <p className="text-[12px] text-[#c8c8d8]">{person.name}</p>
                          {(person.org || person.role) && (
                            <p className="text-[10px] text-[#505272] mt-0.5">{person.org}{person.role ? ` · ${person.role}` : ''}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!searchQuery && (
                <div className="text-center py-6">
                  <p className="text-[12px] text-[#3a3c58]">인박스, 태스크, 인물을 통합 검색합니다</p>
                  <p className="text-[11px] text-[#2a2c40] mt-1">⌘F로 언제든 열기</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Report Modal */}
      {showReport && (
        <WeeklyReportModal
          reportState={reportState}
          onClose={() => setShowReport(false)}
          onRefresh={handleWeeklyReport}
        />
      )}
    </>
  )
}

// ─── 주간 리포트 모달 ─────────────────────────────────────────
function WeeklyReportModal({ reportState, onClose, onRefresh }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(reportState.report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 오늘 날짜 기준 주 범위
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`
  const weekRange = `${fmt(monday)} – ${fmt(sunday)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0e16] border border-[#1c1e2c] rounded-2xl w-full max-w-2xl max-h-[82vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-[#1c1e2c] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#6366f1]/15 flex items-center justify-center text-[#6366f1]">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="14" height="11" rx="1.5"/>
                <path d="M5 1v4M11 1v4M1 7h14"/>
                <path d="M4 10h2M7 10h2M10 10h2M4 13h2M7 13h2"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-[#e0e0f0]">주간 리포트</h3>
              <p className="text-[10px] text-[#3a3c50]">{weekRange}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#14151e] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {reportState.loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-4">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#6366f1] animate-pulse"
                    style={{ animationDelay: `${i * 160}ms` }} />
                ))}
              </div>
              <p className="text-[12px] text-[#6b6e8c]">AI가 이번 주 활동을 분석하는 중…</p>
            </div>
          ) : reportState.report ? (
            <div className="prose prose-sm prose-invert max-w-none">
              <MarkdownOutput text={reportState.report} />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {reportState.report && !reportState.loading && (
          <div className="px-5 py-3 border-t border-[#1c1e2c] flex-shrink-0 flex items-center gap-2">
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
              onClick={onRefresh}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border text-[#9a9cb8] bg-[#14151e] border-[#1c1e2c] hover:border-[#252840] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 8a7 7 0 1114 0"/>
                <path d="M15 4v4h-4"/>
              </svg>
              다시 생성
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  return `${Math.floor(mins / 60)}시간 전`
}
