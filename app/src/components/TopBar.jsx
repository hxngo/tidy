import { useState, useEffect, useRef, useContext } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import SkillPanel, { MarkdownOutput } from './SkillPanel'
import { AIContext } from '../App.jsx'

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
  org: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="13" rx="1"/>
      <path d="M5 5h2M9 5h2M5 8h2M9 8h2M5 11h2M9 11h2"/>
      <path d="M6 15v-4h4v4"/>
    </svg>
  ),
  document: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V6L9 1.5z"/>
      <path d="M9 1.5V6h4.5"/>
      <path d="M5.5 9h5M5.5 11.5h3"/>
    </svg>
  ),
}

const NAV_ITEMS = [
  { to: '/inbox', label: '인박스', icon: 'inbox' },
  { to: '/tasks', label: '태스크', icon: 'tasks' },
  { to: '/people', label: '인물', icon: 'people' },
  { to: '/calendar', label: '캘린더', icon: 'calendar' },
  { to: '/document', label: '문서', icon: 'document' },
]

// 명령 히스토리 — 패턴 감지용 (localStorage)
const CMD_HISTORY_KEY = 'tidy-cmd-history'
function loadCmdHistory() {
  try { return JSON.parse(localStorage.getItem(CMD_HISTORY_KEY) || '[]') } catch { return [] }
}
function saveCmdHistory(entry) {
  const history = loadCmdHistory()
  const updated = [entry, ...history].slice(0, 50) // 최대 50개 보관
  localStorage.setItem(CMD_HISTORY_KEY, JSON.stringify(updated))
  return updated
}
function detectPattern(history, skillId) {
  if (!skillId) return false
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recent = history.filter(h => h.skillId === skillId && h.ts > oneWeekAgo)
  return recent.length >= 3
}

export default function TopBar({ syncStatus = {}, newCount = 0, onNavigateToItem }) {
  const { ctx } = useContext(AIContext)
  const [reportState, setReportState] = useState({ loading: false, report: null })
  const [showReport, setShowReport] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [customSkillsForSearch, setCustomSkillsForSearch] = useState([])
  // AI 명령 모드
  const [aiMode, setAiMode] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)    // { output, usedSkill }
  const [lastQuery, setLastQuery] = useState('')     // 마지막 실행 쿼리 (스킬 저장용)
  // 스킬 저장 인라인 모달
  const [saveSkillPanel, setSaveSkillPanel] = useState({ open: false, generating: false, skill: null })
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
      window.tidy?.skills.listCustom?.().then(list => {
        if (Array.isArray(list)) setCustomSkillsForSearch(list)
      }).catch(() => {})
    } else {
      setSearchQuery('')
      setSearchResults(null)
      setAiMode(false)
      setAiResult(null)
      setSaveSkillPanel({ open: false, generating: false, skill: null })
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
    function handleOpenCommandBar(e) {
      setSearchOpen(true)
      if (e.detail?.char) {
        setSearchQuery(e.detail.char)
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('tidy:openCommandBar', handleOpenCommandBar)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('tidy:openCommandBar', handleOpenCommandBar)
    }
  }, [])

  function handleSearchInput(value) {
    setSearchQuery(value)
    if (aiMode) { setAiMode(false); setAiResult(null); setSaveSkillPanel({ open: false, generating: false, skill: null }) }
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

  function buildContextText(ctx) {
    if (!ctx) return null
    if (ctx.type === 'inbox' && ctx.item) {
      return `[현재 선택된 인박스 아이템]\n제목: ${ctx.item.summary || ''}\n내용: ${(ctx.item.raw_text || '').slice(0, 800)}`
    }
    if (ctx.type === 'person' && ctx.person) {
      return `[현재 선택된 인물]\n이름: ${ctx.person.name}\n조직: ${ctx.person.org || ''}\n역할: ${ctx.person.role || ''}`
    }
    if (ctx.type === 'task' && ctx.task) {
      return `[현재 선택된 태스크]\n제목: ${ctx.task.title}\n상태: ${ctx.task.status || ''}`
    }
    return null
  }

  async function handleAiCommand() {
    const q = searchQuery.trim()
    if (!q) return
    await handleAiCommandWith(q)
  }

  async function handleAiCommandWith(q) {
    if (!q.trim()) return
    setAiMode(true)
    setAiLoading(true)
    setAiResult(null)
    setSaveSkillPanel({ open: false, generating: false, skill: null })
    setLastQuery(q.trim())
    let contextualQuery = q
    if (ctx) {
      const ctxText = buildContextText(ctx)
      if (ctxText) contextualQuery = `${q}\n\n${ctxText}`
    }
    try {
      const res = await window.tidy?.skills.command(contextualQuery)
      if (res?.success) {
        setAiResult({ output: res.output, usedSkill: res.usedSkill ?? null })
        saveCmdHistory({ q, skillId: res.usedSkill?.id || null, ts: Date.now() })
      } else {
        setAiResult({ output: `오류: ${res?.error || '알 수 없는 오류'}`, usedSkill: null })
      }
    } catch (e) {
      setAiResult({ output: `오류: ${e.message}`, usedSkill: null })
    }
    setAiLoading(false)
  }

  async function handleOpenSaveSkill() {
    if (!lastQuery) return
    setSaveSkillPanel({ open: true, generating: true, skill: null })
    try {
      const res = await window.tidy?.skills.generate({ description: lastQuery })
      if (res?.skill) {
        setSaveSkillPanel({ open: true, generating: false, skill: res.skill })
      } else {
        setSaveSkillPanel({ open: true, generating: false, skill: {
          label: lastQuery.slice(0, 8),
          icon: '⚡',
          color: '#c026d3',
          desc: lastQuery.slice(0, 30),
          detail: '',
          systemPrompt: lastQuery,
        }})
      }
    } catch {
      setSaveSkillPanel({ open: true, generating: false, skill: {
        label: lastQuery.slice(0, 8),
        icon: '⚡',
        color: '#c026d3',
        desc: lastQuery.slice(0, 30),
        detail: '',
        systemPrompt: lastQuery,
      }})
    }
  }

  async function handleConfirmSaveSkill() {
    const { skill } = saveSkillPanel
    if (!skill) return
    const res = await window.tidy?.skills.saveCustom(skill)
    if (res?.success) {
      setSaveSkillPanel({ open: false, generating: false, skill: null })
      window.tidy?.skills.listCustom?.().then(list => {
        if (Array.isArray(list)) setCustomSkillsForSearch(list)
      }).catch(() => {})
    }
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

  // 검색어에 맞는 커스텀 스킬 필터링 (클라이언트 측)
  const matchedSkills = searchQuery
    ? customSkillsForSearch.filter(s =>
        s.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.desc?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 3)
    : []

  const hasResults = (searchResults && (
    searchResults.items?.length > 0 || searchResults.tasks?.length > 0 || searchResults.people?.length > 0
  )) || matchedSkills.length > 0

  // 퀵 액션 버튼 목록 (컨텍스트 기반)
  const quickActions = []
  if (ctx?.type === 'inbox' && ctx.item) {
    quickActions.push(
      { label: '요약', query: '이 항목 요약해줘' },
      { label: '번역', query: '이 항목 영어로 번역해줘' },
      { label: '답장 초안', query: '이 항목에 대한 답장 초안 작성해줘' },
      { label: '회의록', query: '이 항목으로 회의록 작성해줘' },
    )
  } else if (ctx?.type === 'person' && ctx.person) {
    quickActions.push(
      { label: '타임라인 요약', query: `${ctx.person.name}과의 주요 이력 요약해줘` },
      { label: '연락 초안', query: `${ctx.person.name}에게 보낼 메시지 초안 작성해줘` },
    )
  }
  quickActions.push(
    { label: '주간 보고서', query: '이번 주 활동 보고서 작성해줘' },
    { label: '오늘 할 일', query: '오늘 처리해야 할 업무 정리해줘' },
  )

  // 컨텍스트 레이블
  const ctxLabel = ctx?.type === 'inbox' && ctx.item
    ? `인박스: ${ctx.item.summary?.slice(0, 40) || '선택된 항목'}`
    : ctx?.type === 'person' && ctx.person
      ? `인물: ${ctx.person.name}`
      : ctx?.type === 'task' && ctx.task
        ? `태스크: ${ctx.task.title}`
        : null

  // 스킬 실행 패널 (검색에서)
  const [searchSkillPanel, setSearchSkillPanel] = useState({ open: false, skillId: null })

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

      {/* AI Command Bar Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[80px] bg-black/60 backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-lg shadow-2xl fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 입력창 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#181a26]">
              {aiLoading ? (
                <div className="flex gap-1 flex-shrink-0">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#c026d3]/60 animate-pulse" style={{ animationDelay: `${i*150}ms` }} />
                  ))}
                </div>
              ) : (
                <span className="text-[#505272] flex-shrink-0">{Ic.search}</span>
              )}
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) handleAiCommand() }}
                onDrop={(e) => {
                  e.preventDefault()
                  const files = Array.from(e.dataTransfer.files)
                  if (files.length > 0) {
                    const paths = files.map(f => f.path).join(' ')
                    const newQ = (searchQuery + ' ' + paths).trim()
                    handleSearchInput(newQ)
                    setTimeout(() => searchInputRef.current?.setSelectionRange(0, 0), 0)
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                placeholder="검색하거나 AI에게 명령하세요… 파일 드롭 가능  (Enter로 AI 실행)"
                className="flex-1 bg-transparent text-[13px] text-[#d0d0e4] placeholder-[#3a3c58] focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults(null); setAiMode(false); setAiResult(null); searchInputRef.current?.focus() }}
                  className="text-[#505272] hover:text-[#9a9cb8] flex-shrink-0"
                >
                  {Ic.close}
                </button>
              )}
            </div>

            {/* AI 결과 패널 */}
            {aiMode && (
              <div className="border-b border-[#181a26]">
                {aiLoading ? (
                  <div className="flex items-center gap-3 px-4 py-5">
                    <div className="w-6 h-6 rounded-lg bg-[#c026d3]/10 flex items-center justify-center flex-shrink-0">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#c026d3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
                      </svg>
                    </div>
                    <p className="text-[12px] text-[#505272] animate-pulse">AI가 명령을 처리하는 중…</p>
                  </div>
                ) : aiResult && (
                  <div className="px-4 py-4">
                    {/* 사용된 스킬 배지 */}
                    {aiResult.usedSkill && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-[#505272]">사용된 스킬</span>
                        <span className="text-[10px] bg-[#c026d3]/10 border border-[#c026d3]/25 text-[#e879f9] px-2 py-0.5 rounded-full">
                          {aiResult.usedSkill.type === 'custom' ? '⚡ ' : ''}{aiResult.usedSkill.label}
                        </span>
                      </div>
                    )}
                    {/* 결과 텍스트 */}
                    <div className="max-h-[260px] overflow-y-auto">
                      <MarkdownOutput text={aiResult.output} />
                    </div>

                    {/* 스킬 저장 버튼 / 인라인 저장 UI */}
                    {!saveSkillPanel.open ? (
                      <div className="mt-3 pt-3 border-t border-[#181a26] flex items-center gap-2">
                        <button
                          onClick={handleOpenSaveSkill}
                          className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg bg-[#c026d3]/8 border border-[#c026d3]/20 text-[#e879f9] hover:bg-[#c026d3]/15 transition-colors"
                        >
                          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
                          </svg>
                          스킬로 저장
                        </button>
                        <span className="text-[10px] text-[#3a3c50]">반복 작업이면 버튼 하나로 실행할 수 있어요</span>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-[#181a26]">
                        {saveSkillPanel.generating ? (
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex gap-1">
                              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#c026d3]/60 animate-pulse" style={{ animationDelay: `${i*150}ms` }}/>)}
                            </div>
                            <span className="text-[11px] text-[#505272]">AI가 스킬 생성 중…</span>
                          </div>
                        ) : saveSkillPanel.skill && (
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                                style={{ background: (saveSkillPanel.skill.color || '#c026d3') + '22' }}>
                                {saveSkillPanel.skill.icon || '⚡'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <input
                                  value={saveSkillPanel.skill.label || ''}
                                  onChange={e => setSaveSkillPanel(p => ({ ...p, skill: { ...p.skill, label: e.target.value } }))}
                                  className="w-full bg-transparent text-[13px] font-semibold text-[#d0d0e4] focus:outline-none border-b border-[#252840] pb-0.5"
                                  placeholder="스킬 이름"
                                />
                                <p className="text-[10px] text-[#505272] mt-0.5 truncate">{saveSkillPanel.skill.desc}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setSaveSkillPanel({ open: false, generating: false, skill: null })}
                                className="flex-1 text-[11px] text-[#6b6e8c] py-1.5 rounded-lg border border-[#1a1c28] hover:border-[#252840] transition-colors"
                              >취소</button>
                              <button
                                onClick={handleConfirmSaveSkill}
                                disabled={!saveSkillPanel.skill.label?.trim()}
                                className="flex-1 text-[11px] font-medium text-[#e879f9] py-1.5 rounded-lg bg-[#c026d3]/10 border border-[#c026d3]/25 hover:bg-[#c026d3]/18 transition-colors disabled:opacity-40"
                              >저장</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 검색 결과 (AI 모드 아닐 때) */}
            {!aiMode && (
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
                  <div className="text-center py-6">
                    <p className="text-[13px] text-[#505272]">검색 결과 없음</p>
                    <p className="text-[11px] text-[#2a2c40] mt-1">Enter를 누르면 AI에게 물어봅니다</p>
                  </div>
                )}

                {!searchLoading && hasResults && (
                  <>
                    {searchResults?.items?.length > 0 && (
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
                    {searchResults?.tasks?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-[#505272] font-semibold uppercase tracking-widest px-4 py-1.5">태스크</p>
                        {searchResults.tasks.map(task => (
                          <button
                            key={task.id}
                            onClick={() => { setSearchOpen(false); navigate('/tasks') }}
                            className="w-full text-left px-4 py-2 hover:bg-[#14151e] transition-colors"
                          >
                            <p className="text-[12px] text-[#c8c8d8] truncate">{task.title}</p>
                            {task.due_date && <p className="text-[10px] text-[#505272] mt-0.5">~{task.due_date.slice(0, 10)}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults?.people?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-[#505272] font-semibold uppercase tracking-widest px-4 py-1.5">인물</p>
                        {searchResults.people.map(person => (
                          <button
                            key={person.id}
                            onClick={() => { setSearchOpen(false); navigate('/people') }}
                            className="w-full text-left px-4 py-2 hover:bg-[#14151e] transition-colors"
                          >
                            <p className="text-[12px] text-[#c8c8d8]">{person.name}</p>
                            {(person.org || person.role) && <p className="text-[10px] text-[#505272] mt-0.5">{person.org}{person.role ? ` · ${person.role}` : ''}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                    {matchedSkills.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-[#505272] font-semibold uppercase tracking-widest px-4 py-1.5">스킬</p>
                        {matchedSkills.map(skill => (
                          <button
                            key={skill.id}
                            onClick={() => { setSearchOpen(false); setSearchSkillPanel({ open: true, skillId: skill.id }) }}
                            className="w-full text-left px-4 py-2 hover:bg-[#14151e] transition-colors flex items-center gap-2.5"
                          >
                            <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] flex-shrink-0"
                              style={{ background: (skill.color || '#c026d3') + '20', color: skill.color || '#c026d3' }}>
                              {skill.icon || '★'}
                            </span>
                            <div>
                              <p className="text-[12px] text-[#c8c8d8]">{skill.label}</p>
                              {skill.desc && <p className="text-[10px] text-[#505272] mt-0.5">{skill.desc}</p>}
                            </div>
                            <span className="ml-auto text-[9px] text-[#303050] bg-[#c026d3]/10 border border-[#c026d3]/20 px-1.5 py-0.5 rounded">커스텀</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {!searchQuery && (
                  <div className="px-4 py-3 space-y-3">
                    {/* 컨텍스트 레이블 */}
                    {ctxLabel && (
                      <p className="text-[10px] text-[#505272]">현재 컨텍스트: {ctxLabel}</p>
                    )}

                    {/* 내 커스텀 스킬 */}
                    {customSkillsForSearch.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5">내 스킬</p>
                        <div className="flex flex-wrap gap-1.5">
                          {customSkillsForSearch.slice(0, 8).map(skill => (
                            <button
                              key={skill.id}
                              onClick={() => {
                                const q = skill.systemPrompt || skill.desc || skill.label
                                setSearchQuery(q)
                                handleAiCommandWith(q)
                              }}
                              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-[#c026d3]/20 text-[#e879f9] hover:bg-[#c026d3]/12 transition-colors"
                              style={{ background: (skill.color || '#c026d3') + '10' }}
                            >
                              <span className="text-[12px]">{skill.icon || '⚡'}</span>
                              {skill.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 퀵 액션 */}
                    <div>
                      {customSkillsForSearch.length > 0 && (
                        <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5">빠른 실행</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {quickActions.map(action => (
                          <button
                            key={action.label}
                            onClick={() => { setSearchQuery(action.query); handleAiCommandWith(action.query) }}
                            className="text-[11px] px-3 py-1.5 rounded-lg bg-[#13141c] border border-[#1c1e2a] text-[#9a9cb8] hover:bg-[#1c1e2a] hover:text-[#c8c8d8] transition-colors"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] text-[#2a2c40]">타이핑 후 Enter → AI 자동 실행  ·  ⌘F로 열기</p>
                  </div>
                )}
              </div>
            )}
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

      {/* 검색에서 스킬 실행 패널 */}
      <SkillPanel
        open={searchSkillPanel.open}
        onClose={() => setSearchSkillPanel({ open: false, skillId: null })}
        skillId={searchSkillPanel.skillId}
        input=""
        sourceItemId={null}
      />
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
