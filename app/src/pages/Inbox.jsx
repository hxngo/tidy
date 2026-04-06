import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import InboxCard, { CATEGORY_DESC } from '../components/InboxCard.jsx'
import { SourceIcon } from '../components/Icons.jsx'

// 기본 소스 카테고리 (삭제 불가, label/icon은 설정에서 수정 가능)
const BUILTIN_SOURCES = [
  { id: 'gmail',    label: '이메일',   match: ['gmail'] },
  { id: 'slack',    label: '슬랙',     match: ['slack'] },
  { id: 'kakao',    label: '카카오톡', match: ['kakao'] },
  { id: 'imessage', label: 'iMessage', match: ['imessage'] },
  { id: 'file',     label: '파일',     match: ['file', 'manual'] },
  { id: 'meeting',  label: '회의록',   match: ['meeting'] },
  { id: 'gdrive',   label: 'Drive',    match: ['gdrive'] },
]

const STATUS_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'new', label: '새항목' },
  { value: 'done', label: '완료' },
  { value: 'trash', label: '휴지통' },
]

const SORT_OPTIONS = [
  { value: 'newest',   label: '최신순' },
  { value: 'oldest',   label: '오래된순' },
  { value: 'priority', label: '중요도순' },
  { value: 'source',   label: '소스순' },
]

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

// 초성 검색 유틸
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
function toChosung(str) {
  return [...(str || '')].map(ch => {
    const code = ch.charCodeAt(0)
    if (code >= 0xAC00 && code <= 0xD7A3) return CHOSUNG[Math.floor((code - 0xAC00) / 588)]
    return ch
  }).join('')
}
function matchesSearch(text, q) {
  if (!text || !q) return false
  const t = text.toLowerCase(), ql = q.toLowerCase()
  if (t.includes(ql)) return true
  if ([...q].some(ch => { const c = ch.charCodeAt(0); return c >= 0x3131 && c <= 0x314E })) {
    if (toChosung(t).includes(toChosung(ql))) return true
  }
  return false
}

function sortItems(items, sortBy) {
  const arr = [...items]
  if (sortBy === 'newest') {
    return arr.sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
  }
  if (sortBy === 'oldest') {
    return arr.sort((a, b) => new Date(a.received_at) - new Date(b.received_at))
  }
  if (sortBy === 'priority') {
    return arr.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 1
      const pb = PRIORITY_RANK[b.priority] ?? 1
      if (pa !== pb) return pa - pb
      return new Date(b.received_at) - new Date(a.received_at)
    })
  }
  if (sortBy === 'source') {
    return arr.sort((a, b) => {
      const sa = (a.source || '').toLowerCase()
      const sb = (b.source || '').toLowerCase()
      if (sa !== sb) return sa.localeCompare(sb)
      return new Date(b.received_at) - new Date(a.received_at)
    })
  }
  return arr
}

const PRIORITY_COLORS = {
  high: 'text-red-400 bg-red-900/30 border-red-700/50',
  medium: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/30',
  low: 'text-gray-400 bg-gray-800/30 border-gray-600/30',
}

const CATEGORY_COLORS = {
  업무: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  미팅: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  운영: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  여행: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  정보: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

// 소스 문자열 → source config 매핑
function resolveSourceConfig(source = '', allSources = []) {
  const src = source.toLowerCase()
  for (const s of allSources) {
    if ((s.match || [src]).some(m => src.includes(m.toLowerCase()))) {
      return { label: s.label }
    }
  }
  // 전혀 알 수 없는 소스 — 이름 자동 추출
  const name = source.split('.').pop() || source
  return { label: name || '알림' }
}

// item.source가 sourceFilter에 매치되는지 판별
function matchesSourceFilter(item, filter, allSources) {
  if (filter === 'all') return true
  const src = (item.source || '').toLowerCase()
  const config = allSources.find(s => s.id === filter)
  if (!config) return src.includes(filter)
  return (config.match || [filter]).some(m => src.includes(m.toLowerCase()))
}

// item.source → 대표 소스 id (어느 그룹에 속하는지)
function getSourceId(source = '', allSources = []) {
  const src = source.toLowerCase()
  for (const s of allSources) {
    if ((s.match || [s.id]).some(m => src.includes(m.toLowerCase()))) return s.id
  }
  return null // 알 수 없는 신규 소스
}

export default function Inbox({ highlightItemId, onHighlightConsumed }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('inbox:sortBy') || 'newest')
  const [isLoading, setIsLoading] = useState(true)
  const [modalItem, setModalItem] = useState(null)
  const [replyState, setReplyState] = useState({ loading: false, draft: null, copied: false })
  const [taskCreating, setTaskCreating] = useState(false)
  const [taskCreated, setTaskCreated] = useState(false)
  const [modalChecked, setModalChecked] = useState({})
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [trashItems, setTrashItems] = useState([])
  const [trashLoading, setTrashLoading] = useState(false)
  // 커스텀/자동감지 소스 카테고리 (BUILTIN과 병합해서 사용)
  const [customSources, setCustomSources] = useState([])

  // 현재 활성화된 전체 소스 목록 (builtin + custom)
  const allSources = [...BUILTIN_SOURCES, ...customSources]

  const loadItems = useCallback(async () => {
    try {
      const data = await window.tidy?.inbox.get({ limit: 200 })
      if (Array.isArray(data)) setItems(data)
    } catch (error) {
      console.error('인박스 로드 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 커스텀 소스 카테고리 로드
  const loadSources = useCallback(async () => {
    try {
      const data = await window.tidy?.sources.getAll()
      if (Array.isArray(data)) setCustomSources(data)
    } catch {}
  }, [])

  // 아이템 목록에서 알 수 없는 소스를 감지해 자동 등록
  const autoDetectSources = useCallback(async (itemList, currentSources) => {
    const combined = [...BUILTIN_SOURCES, ...currentSources]
    const newSources = []

    for (const item of itemList) {
      if (!item.source) continue
      const knownId = getSourceId(item.source, combined)
      if (knownId !== null) continue // 이미 알려진 소스

      // 신규 소스 - 이름 추출
      const rawName = item.source.split('.').pop() || item.source
      const id = rawName.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
      if (!id || combined.find(s => s.id === id) || newSources.find(s => s.id === id)) continue

      const label = rawName.charAt(0).toUpperCase() + rawName.slice(1)
      newSources.push({ id, label, match: [id], autoDetected: true })
    }

    if (newSources.length > 0) {
      // 자동 등록 (IPC)
      for (const s of newSources) {
        await window.tidy?.sources.register({ id: s.id, label: s.label })
      }
      setCustomSources(prev => [...prev, ...newSources])
    }
  }, [])

  useEffect(() => {
    loadSources().then(() => loadItems())

    const unsub = window.tidy?.inbox.onNewItem((newItem) => {
      const item = {
        ...newItem,
        people: Array.isArray(newItem.people) ? newItem.people : [],
        action_items: Array.isArray(newItem.action_items) ? newItem.action_items : [],
      }
      setItems((prev) => [item, ...prev])
      // 새 아이템 소스도 자동 감지
      setCustomSources(current => {
        const combined = [...BUILTIN_SOURCES, ...current]
        if (item.source && getSourceId(item.source, combined) === null) {
          const rawName = item.source.split('.').pop() || item.source
          const id = rawName.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
          if (id && !combined.find(s => s.id === id)) {
            const label = rawName.charAt(0).toUpperCase() + rawName.slice(1)
            const newSrc = { id, label, match: [id], autoDetected: true }
            window.tidy?.sources.register({ id, label })
            return [...current, newSrc]
          }
        }
        return current
      })
    })
    // Obsidian에서 inbox 항목 상태 변경 시 UI 동기화
    const unsubVault = window.tidy?.vault.onItemStatusChanged(({ id, status }) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
    })

    return () => { unsub?.(); unsubVault?.() }
  }, [loadItems, loadSources])

  // 아이템 로드 후 자동 감지 실행
  useEffect(() => {
    if (items.length > 0) {
      autoDetectSources(items, customSources)
    }
  }, [items.length]) // eslint-disable-line

  // 휴지통 탭 진입 시 로드
  useEffect(() => {
    if (statusFilter !== 'trash') return
    setTrashLoading(true)
    window.tidy?.inbox.getTrash().then(data => {
      if (Array.isArray(data)) setTrashItems(data)
      setTrashLoading(false)
    }).catch(() => setTrashLoading(false))
  }, [statusFilter])

  // 알림 클릭 → 해당 아이템 모달 자동 열기
  useEffect(() => {
    if (!highlightItemId || items.length === 0) return
    const target = items.find(i => i.id === highlightItemId)
    if (target) {
      setStatusFilter('all')  // 필터 초기화해서 아이템이 보이도록
      setModalItem(target)
      onHighlightConsumed?.()
    }
  }, [highlightItemId, items])

  async function handleMarkDone(id) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'done' } : item)))
    try {
      await window.tidy?.inbox.updateStatus?.({ id, status: 'done' })
    } catch (error) {
      console.error('상태 업데이트 실패:', error)
    }
  }

  async function handleRestore(id) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'read' } : item)))
    if (modalItem?.id === id) setModalItem(prev => prev ? { ...prev, status: 'read' } : null)
    try {
      await window.tidy?.inbox.updateStatus?.({ id, status: 'read' })
    } catch (error) {
      console.error('복구 실패:', error)
    }
  }

  async function handleDelete(id) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    if (modalItem?.id === id) handleCloseModal()
    try { await window.tidy?.inbox.trash(id) } catch {}
  }

  async function handleRestoreTrash(id) {
    setTrashItems((prev) => prev.filter((item) => item.id !== id))
    try { await window.tidy?.inbox.restoreTrash(id) } catch {}
    // 인박스 목록 새로고침
    const data = await window.tidy?.inbox.get({ limit: 200 })
    if (Array.isArray(data)) setItems(data)
  }

  async function handleDeletePermanent(id) {
    setTrashItems((prev) => prev.filter((item) => item.id !== id))
    try { await window.tidy?.inbox.deletePermanent(id) } catch {}
  }

  async function handleEmptyTrash() {
    for (const item of trashItems) {
      try { await window.tidy?.inbox.deletePermanent(item.id) } catch {}
    }
    setTrashItems([])
  }

  async function handleMarkAllDone() {
    const ids = activeItems.map(i => i.id)
    if (ids.length === 0) return
    setItems(prev => prev.map(item => ids.includes(item.id) ? { ...item, status: 'done' } : item))
    for (const id of ids) {
      try { await window.tidy?.inbox.updateStatus?.({ id, status: 'done' }) } catch {}
    }
  }

  async function handleGenerateReply(item) {
    setReplyState({ loading: true, draft: null, copied: false })
    try {
      const result = await window.tidy?.inbox.draftReply({
        itemId: item.id, rawText: item.raw_text, source: item.source,
      })
      if (result?.success) {
        setReplyState({ loading: false, draft: result.draft, copied: false })
      } else {
        setReplyState({ loading: false, draft: '답장 초안 생성에 실패했습니다.', copied: false })
      }
    } catch {
      setReplyState({ loading: false, draft: '오류가 발생했습니다.', copied: false })
    }
  }

  function handleCopyDraft() {
    if (replyState.draft) {
      navigator.clipboard.writeText(replyState.draft)
      setReplyState(prev => ({ ...prev, copied: true }))
      setTimeout(() => setReplyState(prev => ({ ...prev, copied: false })), 2000)
      // 복사 후 저장된 초안 제거
      if (modalItem) localStorage.removeItem(`inbox:draft:${modalItem.id}`)
    }
  }

  function handleCloseModal() {
    // 작성 중인 초안 localStorage에 자동 저장
    if (modalItem && replyState.draft) {
      localStorage.setItem(`inbox:draft:${modalItem.id}`, replyState.draft)
    }
    setModalItem(null)
    setReplyState({ loading: false, draft: null, copied: false })
    setModalChecked({})
    setTaskCreating(false)
    setTaskCreated(false)
  }

  function openModal(item) {
    const savedDraft = localStorage.getItem(`inbox:draft:${item.id}`) || null
    setModalItem(item)
    setReplyState({ loading: false, draft: savedDraft, copied: false })
    setTaskCreated(false)
    // 새 항목 → 읽음으로 자동 처리
    if (item.status === 'new') {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'read' } : i))
      window.tidy?.inbox.updateStatus?.({ id: item.id, status: 'read' }).catch(() => {})
    }
  }

  // 현재 아이템에 실제 존재하는 소스만 필터 탭에 표시
  const presentSourceIds = new Set(items.map(item => getSourceId(item.source, allSources) || item.source?.toLowerCase()))
  const visibleSourceFilters = allSources.filter(s => presentSourceIds.has(s.id))
  const MAX_VISIBLE_SOURCES = 4
  const inlineSourceFilters = visibleSourceFilters.slice(0, MAX_VISIBLE_SOURCES)
  const overflowSourceFilters = visibleSourceFilters.slice(MAX_VISIBLE_SOURCES)

  function handleSortChange(value) {
    setSortBy(value)
    localStorage.setItem('inbox:sortBy', value)
  }

  // 검색 + 소스 필터 적용 (useMemo로 성능 최적화)
  const searchFiltered = useMemo(() => searchQuery
    ? items.filter(item =>
        matchesSearch(item.summary, searchQuery) ||
        matchesSearch(item.raw_text, searchQuery) ||
        (Array.isArray(item.people) && item.people.some(p => matchesSearch(p, searchQuery)))
      )
    : items,
  [items, searchQuery])

  const sourceFiltered = useMemo(
    () => searchFiltered.filter((item) => matchesSourceFilter(item, sourceFilter, allSources)),
    [searchFiltered, sourceFilter, allSources]
  )

  const activeItems = useMemo(
    () => sortItems(sourceFiltered.filter((item) => item.status !== 'done'), sortBy),
    [sourceFiltered, sortBy]
  )
  const doneItems = useMemo(
    () => sortItems(sourceFiltered.filter((item) => item.status === 'done'), sortBy),
    [sourceFiltered, sortBy]
  )

  // 상단 탭이 '완료'일 때는 완료 항목만, 그 외엔 미완료만
  const filteredItems = statusFilter === 'done' ? doneItems : activeItems

  const newCount = useMemo(() => items.filter((i) => i.status === 'new').length, [items])

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="drag-region flex items-center justify-between px-6 h-11 border-b border-[#13141c] flex-shrink-0 bg-[#09090c]">
        <div className="no-drag flex items-center gap-2.5">
          <h1 className="text-[13px] font-semibold text-[#b8bacc] tracking-[-0.01em]">인박스</h1>
          {newCount > 0 && (
            <span className="text-[10px] font-semibold bg-[#3a3a3e] text-[#e2e2ea] px-1.5 py-0.5 rounded-full leading-none">
              {newCount}
            </span>
          )}
        </div>
        <div className="no-drag flex items-center gap-2">
          {/* 모두 완료 */}
          {activeItems.length > 0 && statusFilter !== 'done' && statusFilter !== 'trash' && (
            <button
              onClick={handleMarkAllDone}
              className="text-[11px] text-[#505272] hover:text-[#9a9cb8] transition-colors px-2 py-1 rounded-md hover:bg-[#14151e] whitespace-nowrap"
            >
              모두 완료
            </button>
          )}
          {/* 검색창 */}
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#505272" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5"/><path d="M11 11l2.5 2.5"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="검색..."
              className="bg-[#0f1018] border border-[#1c1e2a] rounded-lg pl-6 pr-3 py-1 text-[11px] text-[#9a9cc0] placeholder-[#404060] focus:outline-none focus:border-[#2e3048] w-28 focus:w-40 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#505272] hover:text-[#9a9cc0]">
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
              </button>
            )}
          </div>
          <div className="w-px h-4 bg-[#1e1e26]" />
          <div className="flex gap-0.5">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`text-[12px] px-2.5 py-1.5 rounded-md transition-colors ${
                  statusFilter === value
                    ? 'bg-[#1c1c22] text-[#9a9cc0]'
                    : 'text-[#6b6e8c] hover:text-[#6b6e8c]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-[#1e1e26]" />
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
            className="bg-transparent text-[11px] text-[#6b6e8c] hover:text-[#9a9cc0] focus:outline-none cursor-pointer transition-colors appearance-none pr-3"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 16 16'%3E%3Cpath d='M3 6l5 5 5-5' stroke='%236b6e8c' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0px center' }}
          >
            {SORT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value} style={{ background: '#0f1018' }}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 소스 필터 */}
      {visibleSourceFilters.length > 0 && statusFilter !== 'trash' && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#13141c] flex-shrink-0 bg-[#09090c]">
          <button
            onClick={() => setSourceFilter('all')}
            className={`text-[11px] px-2.5 py-1 rounded-md whitespace-nowrap transition-colors flex-shrink-0 border ${
              sourceFilter === 'all'
                ? 'bg-white/10 text-[#a8a8b4] border-white/20'
                : 'text-[#6b6e8c] hover:text-[#6b6e8c] border-transparent'
            }`}
          >
            전체
          </button>
          {inlineSourceFilters.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSourceFilter(id)}
              className={`text-[11px] px-2.5 py-1 rounded-md whitespace-nowrap transition-colors flex-shrink-0 border ${
                sourceFilter === id
                  ? 'bg-white/10 text-[#a8a8b4] border-white/20'
                  : 'text-[#6b6e8c] hover:text-[#6b6e8c] border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
          {overflowSourceFilters.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setSourceDropdownOpen(v => !v)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                  overflowSourceFilters.some(s => s.id === sourceFilter)
                    ? 'bg-white/10 text-[#a8a8b4] border-white/20'
                    : 'text-[#6b6e8c] border-transparent hover:text-[#9a9cb8]'
                }`}
              >
                {overflowSourceFilters.some(s => s.id === sourceFilter)
                  ? overflowSourceFilters.find(s => s.id === sourceFilter)?.label
                  : `+${overflowSourceFilters.length}`} ▾
              </button>
              {sourceDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 z-30 bg-[#0f1018] border border-[#1c1e2a] rounded-xl py-1 shadow-2xl min-w-[110px]"
                  onMouseLeave={() => setSourceDropdownOpen(false)}
                >
                  {overflowSourceFilters.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => { setSourceFilter(id); setSourceDropdownOpen(false) }}
                      className={`block w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                        sourceFilter === id ? 'text-[#a8a8b4]' : 'text-[#6b6e8c] hover:text-[#9a9cb8]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 아이템 목록 */}
      <div className="flex-1 overflow-y-auto">
        {statusFilter === 'trash' ? (
          /* ── 휴지통 뷰 ── */
          trashLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-2xl mb-3 animate-pulse">•••</div>
                <p className="text-sm text-[#8a8ca8]">불러오는 중...</p>
              </div>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#0f1018] border border-[#1c1e2a] flex items-center justify-center mx-auto mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2e3048" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-[#6b6e8c]">휴지통이 비어 있습니다</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#505272]">{trashItems.length}개 항목</span>
                <button
                  onClick={handleEmptyTrash}
                  className="text-[11px] text-red-500/60 hover:text-red-500 transition-colors"
                >
                  전체 삭제
                </button>
              </div>
              {trashItems.map((item) => (
                <div key={item.id} className="bg-[#0f1018] border border-[#1c1e2a] rounded-xl px-4 py-3 flex items-start gap-3 opacity-70">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#8a8ca8] leading-relaxed line-clamp-2">{item.summary || '내용 없음'}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-[#404060]">{resolveSourceConfig(item.source, allSources).label}</span>
                      {item.trashed_at && (
                        <span className="text-[10px] text-[#404060]">· {formatTime(item.trashed_at)} 삭제</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleRestoreTrash(item.id)}
                      className="text-[11px] text-[#6b6e8c] hover:text-[#9a9cc0] px-2.5 py-1 rounded-md hover:bg-[#1a1c28] transition-colors whitespace-nowrap"
                    >
                      복구
                    </button>
                    <button
                      onClick={() => handleDeletePermanent(item.id)}
                      className="text-[11px] text-[#6b6e8c] hover:text-red-500 px-2.5 py-1 rounded-md hover:bg-red-500/5 transition-colors whitespace-nowrap"
                    >
                      영구삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-3 animate-pulse">•••</div>
              <p className="text-sm text-[#8a8ca8]">불러오는 중...</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-[#0f1018] border border-[#1c1e2a] flex items-center justify-center mx-auto mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e3048" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
                </svg>
              </div>
              <p className="text-[13px] font-medium text-[#6b6e8c]">
                {searchQuery ? `"${searchQuery}" 검색 결과 없음` : statusFilter === 'new' ? '새 메시지가 없습니다' : '항목이 없습니다'}
              </p>
              <p className="text-[11px] text-[#505272] mt-1">
                {searchQuery ? '다른 검색어를 입력해보세요' : '채널을 연결하거나 파일을 드래그&드롭하세요'}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-2.5">
            {filteredItems.map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                sourceConfig={resolveSourceConfig(item.source, allSources)}
                onMarkDone={handleMarkDone}
                onRestore={handleRestore}
                onDelete={handleDelete}
                onClick={() => openModal(item)}
              />
            ))}

            {/* 완료 항목 섹션 (전체/새항목 탭에서만 표시) */}
            {statusFilter !== 'done' && doneItems.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setDoneExpanded(v => !v)}
                  className="flex items-center gap-2 w-full px-1 py-2 text-left group"
                >
                  <div className="flex-1 h-px bg-[#13141e]" />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <svg
                      width="10" height="10" viewBox="0 0 16 16" fill="none"
                      stroke="#2e3048" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`transition-transform duration-200 ${doneExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M3 6l5 5 5-5"/>
                    </svg>
                    <span className="text-[11px] text-[#5a5c78] group-hover:text-[#8082a0] transition-colors">
                      완료 {doneItems.length}개
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-[#13141e]" />
                </button>

                {doneExpanded && (
                  <div className="space-y-2.5 fade-in">
                    {doneItems.map((item) => (
                      <InboxCard
                        key={item.id}
                        item={item}
                        sourceConfig={resolveSourceConfig(item.source, allSources)}
                        onMarkDone={handleMarkDone}
                        onRestore={handleRestore}
                        onDelete={handleDelete}
                        onClick={() => {
                          setModalItem(item)
                          setReplyState({ loading: false, draft: null, copied: false })
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {modalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div
            className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-lg max-h-[82vh] flex flex-col shadow-2xl fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-[#181a26] flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-[#7a7c98] uppercase tracking-wide">
                  {resolveSourceConfig(modalItem.source, allSources).label}
                </span>
                <span className="relative group/cat">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-default ${CATEGORY_COLORS[modalItem.category] || CATEGORY_COLORS['정보']}`}>
                    {modalItem.category || '정보'}
                  </span>
                  {CATEGORY_DESC[modalItem.category] && (
                    <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 whitespace-nowrap rounded-lg bg-[#1a1c2e] border border-[#252840] px-2.5 py-1.5 text-[10px] text-[#8b8fa8] opacity-0 group-hover/cat:opacity-100 transition-opacity duration-150 shadow-xl">
                      {CATEGORY_DESC[modalItem.category]}
                    </span>
                  )}
                </span>
                {modalItem.priority === 'high' && (
                  <span className="text-[9px] font-bold text-red-400 tracking-widest uppercase">URGENT</span>
                )}
                <span className="text-[11px] text-[#505272]">{formatTime(modalItem.received_at)}</span>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-[#5a5c78] hover:text-[#9a9cc0] transition-colors ml-2 flex-shrink-0 p-1 rounded"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l12 12M14 2L2 14"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* AI 요약 */}
              <div>
                <p className="text-[10px] text-[#6b6e8c] mb-1.5 font-semibold uppercase tracking-widest">요약</p>
                <p className="text-[13px] text-[#c8c8d8] leading-relaxed">{modalItem.summary || '요약 없음'}</p>
              </div>

              {/* 관련 인물 */}
              {(Array.isArray(modalItem.people) ? modalItem.people : []).length > 0 && (
                <div>
                  <p className="text-[10px] text-[#6b6e8c] mb-1.5 font-semibold uppercase tracking-widest">관련 인물</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(modalItem.people) ? modalItem.people : []).map((name, i) => (
                      <button
                        key={i}
                        onClick={() => { handleCloseModal(); navigate('/people') }}
                        className="text-[11px] text-[#8a8ca8] bg-[#141520] hover:bg-[#1e2030] hover:text-[#b8bacа] px-2.5 py-1 rounded-full border border-[#1e2030] hover:border-[#2e3050] transition-colors cursor-pointer"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 액션 아이템 */}
              {(Array.isArray(modalItem.action_items) ? modalItem.action_items : []).length > 0 && (
                <div>
                  <p className="text-[10px] text-[#6b6e8c] mb-1.5 font-semibold uppercase tracking-widest">해야 할 일</p>
                  <ul className="space-y-1.5">
                    {(Array.isArray(modalItem.action_items) ? modalItem.action_items : []).map((action, i) => {
                      const checked = !!modalChecked[i]
                      const label = typeof action === 'object' ? action.text : action
                      return (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 cursor-pointer group/chk"
                          onClick={() => setModalChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                        >
                          <div className={`mt-[3px] w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            checked ? 'bg-[#4a4c6a] border-[#6a6c98]' : 'border-[#252840] group-hover/chk:border-[#3a3c58]'
                          }`}>
                            {checked && (
                              <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="#a0a2c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1.5 5l2.5 2.5 4.5-4"/>
                              </svg>
                            )}
                          </div>
                          <span className={`text-[12px] transition-colors ${
                            checked ? 'line-through text-[#4a4c68]' : 'text-[#8a8ca8]'
                          }`}>{label}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* 답장 초안 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-[#6b6e8c] font-semibold uppercase tracking-widest">답장 초안</p>
                  {!replyState.draft && (
                    <button
                      onClick={() => handleGenerateReply(modalItem)}
                      disabled={replyState.loading}
                      className="text-[11px] text-[#c8c8d0] hover:text-[#818cf8] disabled:text-[#5a5c78] transition-colors"
                    >
                      {replyState.loading ? '생성 중…' : 'AI로 생성'}
                    </button>
                  )}
                </div>
                {replyState.loading && (
                  <div className="flex gap-1.5 py-2">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1 h-1 rounded-full bg-[#d4d4d8] animate-pulse" style={{ animationDelay: `${i*150}ms` }} />
                    ))}
                  </div>
                )}
                {replyState.draft && (
                  <div className="bg-[#0a0b12] border border-[#1a1c28] rounded-xl p-3.5">
                    {localStorage.getItem(`inbox:draft:${modalItem?.id}`) === replyState.draft && (
                      <p className="text-[10px] text-[#6b6e8c] mb-2 flex items-center gap-1">
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 1v7l3 3"/><circle cx="8" cy="8" r="7"/></svg>
                        이전에 작성한 초안이 복원되었습니다
                        <button onClick={() => { localStorage.removeItem(`inbox:draft:${modalItem?.id}`); setReplyState(prev => ({ ...prev, draft: null })) }} className="ml-1 text-[#404060] hover:text-[#6b6e8c]">✕</button>
                      </p>
                    )}
                    <textarea
                      value={replyState.draft}
                      onChange={(e) => setReplyState(prev => ({ ...prev, draft: e.target.value }))}
                      className="text-[11px] text-[#7a7c94] whitespace-pre-wrap leading-relaxed font-sans w-full bg-transparent resize-none focus:outline-none min-h-[80px]"
                      rows={Math.max(4, replyState.draft.split('\n').length)}
                    />
                    <div className="flex gap-3 mt-2 pt-2.5 border-t border-[#14151e]">
                      <button onClick={handleCopyDraft} className="text-[11px] text-[#c8c8d0] hover:text-[#818cf8] transition-colors">
                        {replyState.copied ? '✓ 복사됨' : '복사'}
                      </button>
                      <button onClick={() => handleGenerateReply(modalItem)} className="text-[11px] text-[#6b6e8c] hover:text-[#6b6e8c] transition-colors">
                        다시 생성
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 원본 */}
              <div>
                <p className="text-[10px] text-[#6b6e8c] mb-1.5 font-semibold uppercase tracking-widest">원본</p>
                <div className="bg-[#08090e] border border-[#14151e] rounded-xl p-3 max-h-40 overflow-y-auto">
                  <pre className="text-[11px] text-[#6b6e8c] whitespace-pre-wrap leading-relaxed font-mono">
                    {modalItem.raw_text || '원본 내용 없음'}
                  </pre>
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="flex gap-1.5 px-5 py-3 border-t border-[#181a26] flex-shrink-0">
              <button
                onClick={() => { if (modalItem._filePath) window.tidy?.obsidian.open(modalItem._filePath) }}
                className="flex items-center gap-1.5 text-[11px] text-[#5a5c78] hover:text-[#6b6e8c] px-2 py-1 rounded-md hover:bg-[#14151e] transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5L8 1.5z"/>
                </svg>
                Vault
              </button>
              {/* 태스크로 변환 */}
              {(Array.isArray(modalItem.action_items) ? modalItem.action_items : []).length > 0 && (
                <button
                  disabled={taskCreating || taskCreated}
                  onClick={async () => {
                    setTaskCreating(true)
                    const actions = Array.isArray(modalItem.action_items) ? modalItem.action_items : []
                    for (const action of actions) {
                      const label = typeof action === 'object' ? action.text : action
                      if (label) {
                        await window.tidy?.tasks.create({ title: label, item_id: modalItem.id }).catch(() => {})
                      }
                    }
                    setTaskCreating(false)
                    setTaskCreated(true)
                  }}
                  className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-colors ${
                    taskCreated
                      ? 'text-green-400'
                      : 'text-[#5a5c78] hover:text-[#6b6e8c] hover:bg-[#14151e]'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {taskCreated ? <path d="M2 8l4 4 8-7"/> : <><path d="M8 1v14M1 8h14"/></>}
                  </svg>
                  {taskCreated ? '태스크 추가됨' : taskCreating ? '추가 중...' : '태스크 추가'}
                </button>
              )}
              <button
                onClick={() => handleDelete(modalItem.id)}
                className="flex items-center gap-1.5 text-[11px] text-[#5a5c78] hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-500/5 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
                </svg>
                삭제
              </button>
              {modalItem.status === 'done' ? (
                <button
                  onClick={() => handleRestore(modalItem.id)}
                  className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-[#8a8ca8] bg-white/5 hover:bg-white/10 px-3 py-1 rounded-md transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 4v5h5M1.5 9A7 7 0 1 0 4 4.5"/>
                  </svg>
                  복구
                </button>
              ) : (
                <button
                  onClick={() => { handleMarkDone(modalItem.id); setModalItem(prev => prev ? { ...prev, status: 'done' } : null) }}
                  className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-[#c8c8d0] bg-white/8 hover:bg-white/12 px-3 py-1 rounded-md transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 8l4 4 8-7"/>
                  </svg>
                  완료
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
