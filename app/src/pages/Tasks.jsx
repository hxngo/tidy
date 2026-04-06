import { useState, useEffect, useCallback, useRef } from 'react'
import TaskItem from '../components/TaskItem.jsx'
import NLInput from '../components/NLInput.jsx'

// focus 탭: overdue + today + tomorrow + week (later/none 제외)
// backlog 탭: later + none
const FOCUS_GROUPS  = ['overdue', 'today', 'tomorrow', 'week']
const BACKLOG_GROUPS = ['later', 'none']

function getDateGroup(dueDateStr) {
  if (!dueDateStr) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDateStr)
  due.setHours(0, 0, 0, 0)
  const diff = Math.round((due - today) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'week'
  return 'later'
}

const GROUP_META = {
  overdue:  { label: '기한 초과', color: 'text-red-400',    dot: 'bg-red-400',    defaultOpen: true  },
  today:    { label: '오늘',      color: 'text-yellow-400', dot: 'bg-yellow-400', defaultOpen: true  },
  tomorrow: { label: '내일',      color: 'text-blue-400',   dot: 'bg-blue-400',   defaultOpen: true  },
  week:     { label: '이번 주',   color: 'text-purple-400', dot: 'bg-purple-400', defaultOpen: false },
  later:    { label: '나중에',    color: 'text-[#737373]',  dot: 'bg-[#404040]',  defaultOpen: true  },
  none:     { label: '기한 없음', color: 'text-[#404040]',  dot: 'bg-[#333]',     defaultOpen: true  },
}

// overdue 전용 강조 배경
const OVERDUE_BG = 'var(--card-bg-overdue)'
const DEFAULT_BG = 'var(--card-bg)'

function groupByDate(taskList) {
  const groups = {}
  for (const task of taskList) {
    const key = getDateGroup(task.due_date)
    if (!groups[key]) groups[key] = []
    groups[key].push(task)
  }
  return groups
}

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [activeTab, setActiveTab] = useState('focus')
  const [isLoading, setIsLoading] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('tasks:collapsedGroups')
      return saved ? new Set(JSON.parse(saved)) : new Set(['week'])
    } catch { return new Set(['week']) }
  })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [personFilter, setPersonFilter] = useState('all')
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false)
  const [undoToast, setUndoToast] = useState(null) // { id, title, timer }
  const [overdueDismissed, setOverdueDismissed] = useState(false)
  const undoTimerRef = useRef(null)

  const loadTasks = useCallback(async () => {
    try {
      const data = await window.tidy?.tasks.get({})
      if (Array.isArray(data)) setTasks(data)
    } catch (error) {
      console.error('태스크 로드 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
    const unsub = window.tidy?.vault.onTaskDone(({ id }) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done' } : t)))
    })
    // 새 인박스 아이템 도착 시 태스크 목록 갱신 (알림에서 태스크 자동 생성)
    const unsubInbox = window.tidy?.inbox.onNewItem(() => loadTasks())
    return () => { unsub?.(); unsubInbox?.() }
  }, [loadTasks])

  async function handleStatusChange(id, status) {
    const prevTask = tasks.find(t => t.id === id)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    // Undo 토스트 (완료 처리 시만)
    if (status === 'done' && prevTask) {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000)
      setUndoToast({ id, title: prevTask.title, timer: undoTimerRef.current })
    }
    try {
      await window.tidy?.tasks.update({ id, status })
    } catch {
      loadTasks()
    }
  }

  async function handleUndoDone(id) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoToast(null)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'active' } : t)))
    try { await window.tidy?.tasks.update({ id, status: 'active' }) } catch { loadTasks() }
  }

  function handleTaskUpdate(updated) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkAction(status) {
    const ids = [...selectedIds]
    setSelectedIds(new Set())
    setTasks((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, status } : t))
    for (const id of ids) {
      try { await window.tidy?.tasks.update({ id, status }) } catch {}
    }
  }

  async function handleNlAction(text) {
    const result = await window.tidy?.tasks.nlAction(text)
    if (result && !result.error) await loadTasks()
    return result
  }

  async function handleUpload(files) {
    let successCount = 0
    for (const file of files) {
      try {
        const result = await window.tidy?.inbox.upload(file.path)
        if (result?.success) successCount++
      } catch {}
    }
    if (successCount > 0) await loadTasks()
    return { message: successCount > 0 ? `${successCount}개 파일 분석 완료` : '분석 실패' }
  }

  function toggleGroup(key) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem('tasks:collapsedGroups', JSON.stringify([...next]))
      return next
    })
  }

  const allActiveTasks = tasks.filter((t) => t.status === 'active')
  const doneTasks    = tasks.filter((t) => t.status === 'done')
  const trashedTasks = tasks.filter((t) => t.status === 'trashed')

  // 담당자 필터
  const allPersons = [...new Set(allActiveTasks.map(t => t.person).filter(Boolean))].sort()
  const activeTasks = personFilter === 'all'
    ? allActiveTasks
    : allActiveTasks.filter(t => t.person === personFilter)

  const allGroups   = groupByDate(activeTasks)
  const focusGroups  = FOCUS_GROUPS.filter(k => allGroups[k]?.length > 0)
  const backlogGroups = BACKLOG_GROUPS.filter(k => allGroups[k]?.length > 0)

  const focusCount   = FOCUS_GROUPS.reduce((n, k) => n + (allGroups[k]?.length || 0), 0)
  const backlogCount = BACKLOG_GROUPS.reduce((n, k) => n + (allGroups[k]?.length || 0), 0)

  const TABS = [
    { value: 'focus',   label: '포커스', count: focusCount   },
    { value: 'backlog', label: '나중에', count: backlogCount },
    { value: 'done',    label: '완료',   count: doneTasks.length },
    { value: 'trash',   label: '휴지통', count: trashedTasks.length },
  ]

  function SelectAllBar({ taskIds }) {
    const allSelected = taskIds.length > 0 && taskIds.every(id => selectedIds.has(id))
    function toggle() {
      if (allSelected) {
        setSelectedIds(prev => { const n = new Set(prev); taskIds.forEach(id => n.delete(id)); return n })
      } else {
        setSelectedIds(prev => new Set([...prev, ...taskIds]))
      }
    }
    return (
      <div className="flex justify-end px-4 pt-3 pb-0">
        <button
          onClick={toggle}
          className="text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] transition-colors"
        >
          {allSelected ? '선택 해제' : '전체 선택'}
        </button>
      </div>
    )
  }

  function renderGroups(groupKeys) {
    if (groupKeys.length === 0) return null
    const allTaskIds = groupKeys.flatMap(k => allGroups[k] || []).map(t => t.id)
    return (
      <>
        <SelectAllBar taskIds={allTaskIds} />
        <div className="p-4 space-y-4">
        {groupKeys.map(key => {
          const groupTasks = allGroups[key]
          const meta = GROUP_META[key]
          const isCollapsed = collapsedGroups.has(key)
          const isOverdue = key === 'overdue'
          return (
            <div key={key}>
              <button
                onClick={() => toggleGroup(key)}
                className="flex items-center gap-2 mb-2 w-full text-left group"
              >
                {isOverdue ? (
                  <span className="text-[9px] font-bold text-red-400 tracking-widest uppercase bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                    OVERDUE
                  </span>
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                )}
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.color}`}>
                  {isOverdue ? '' : meta.label}
                </span>
                <span className="text-[11px] text-[#252838]">{groupTasks.length}</span>
                <span className="text-[#252838] group-hover:text-[#35374e] ml-auto transition-colors text-[10px]">
                  {isCollapsed ? '▸' : '▾'}
                </span>
              </button>
              {!isCollapsed && (
                <div
                  className={`rounded-xl border divide-y divide-[#14151e] ${isOverdue ? 'border-red-900/30' : 'border-[#1a1c28]'}`}
                  style={{ background: isOverdue ? OVERDUE_BG : DEFAULT_BG }}
                >
                  {groupTasks.map((task) => (
                    <TaskItem key={task.id} task={task} onStatusChange={handleStatusChange}
                      onUpdate={handleTaskUpdate} selected={selectedIds.has(task.id)} onSelect={toggleSelect} people={allPersons} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        </div>
      </>
    )
  }

  function renderFocus() {
    if (focusGroups.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-[#0f1018] border border-[#1c1e2a] flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2e3048" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <p className="text-[13px] font-medium text-[#3d3f52]">지금 처리할 항목이 없습니다</p>
            <p className="text-[11px] text-[#252838] mt-1">나중에 탭에서 오늘 할 일을 가져오세요</p>
          </div>
        </div>
      )
    }
    return renderGroups(focusGroups)
  }

  function renderBacklog() {
    if (backlogGroups.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-[13px] font-medium text-[#3d3f52]">백로그가 비어있습니다</p>
          </div>
        </div>
      )
    }
    return renderGroups(backlogGroups)
  }

  function renderDone() {
    if (doneTasks.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-[13px] font-medium text-[#3d3f52]">완료된 태스크가 없습니다</p>
          </div>
        </div>
      )
    }
    return (
      <div className="p-4">
        <div className="flex justify-end mb-2 px-1">
          <button
            onClick={async () => {
              for (const t of doneTasks) await handleStatusChange(t.id, 'trashed')
            }}
            className="text-[11px] text-[#505272] hover:text-red-400 transition-colors"
          >
            전체 삭제
          </button>
        </div>
        <div className="rounded-xl border border-[#1a1c28] divide-y divide-[#14151e]" style={{ background: DEFAULT_BG }}>
          {doneTasks.map((task) => (
            <div key={task.id} className="group flex items-center">
              <div className="flex-1 min-w-0">
                <TaskItem task={task} onStatusChange={handleStatusChange}
                  selected={selectedIds.has(task.id)} onSelect={toggleSelect} />
              </div>
              <button
                onClick={() => handleStatusChange(task.id, 'trashed')}
                className="flex-shrink-0 mr-4 opacity-0 group-hover:opacity-100 text-[#404060] hover:text-red-400 transition-all p-0.5"
                title="휴지통으로"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  async function handlePermanentDelete(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    try {
      await window.tidy?.tasks.update({ id, status: 'deleted' })
    } catch {
      loadTasks()
    }
  }

  function renderTrash() {
    if (trashedTasks.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-[#0f1018] border border-[#1c1e2a] flex items-center justify-center mx-auto mb-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#2e3048" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
              </svg>
            </div>
            <p className="text-[13px] font-medium text-[#3d3f52]">휴지통이 비어있습니다</p>
          </div>
        </div>
      )
    }
    return (
      <div className="p-4 space-y-1">
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-[11px] text-[#505272]">호버하면 복구 버튼이 나타납니다</p>
          <button
            onClick={async () => {
              for (const t of trashedTasks) await handlePermanentDelete(t.id)
            }}
            className="text-[11px] text-[#7a4040] hover:text-red-400 transition-colors"
          >
            전체 삭제
          </button>
        </div>
        <div className="rounded-xl border border-[#1a1c28] divide-y divide-[#14151e]" style={{ background: DEFAULT_BG }}>
          {trashedTasks.map((task) => (
            <div key={task.id} className="group flex items-center">
              <div className="flex-1 min-w-0">
                <TaskItem task={task} onStatusChange={handleStatusChange} />
              </div>
              <button
                onClick={() => handlePermanentDelete(task.id)}
                className="flex-shrink-0 mr-4 opacity-0 group-hover:opacity-100 text-[#7a4040] hover:text-red-400 transition-all text-[10px]"
                title="완전 삭제"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const overdueCount = allGroups['overdue']?.length || 0

  return (
    <div className="h-full flex flex-col">
      {/* Overdue 배너 */}
      {!overdueDismissed && overdueCount > 0 && activeTab === 'focus' && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-red-950/30 border-b border-red-900/30">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3L1.5 13.5h13L8 3z"/><path d="M8 7v3M8 11.5v.5"/>
            </svg>
            <span className="text-[11px] text-red-400">기한 초과 태스크 {overdueCount}개</span>
          </div>
          <button onClick={() => setOverdueDismissed(true)} className="text-red-700 hover:text-red-400 transition-colors">
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
          </button>
        </div>
      )}
      {/* 헤더 */}
      <div className="drag-region flex items-center justify-between px-6 h-11 border-b border-[#13141c] flex-shrink-0 bg-[#09090c]">
        <div className="no-drag flex items-center gap-2.5">
          <h1 className="text-[13px] font-semibold text-[#9a9cb8] tracking-[-0.01em]">태스크</h1>
          {/* 담당자 필터 */}
          {allPersons.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setPersonDropdownOpen(v => !v)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  personFilter !== 'all'
                    ? 'bg-white/10 text-[#a8a8b4] border-white/20'
                    : 'text-[#6b6e8c] border-[#1a1c28] hover:text-[#9a9cb8]'
                }`}
              >
                {personFilter === 'all' ? '담당자 ▾' : `${personFilter} ✕`}
              </button>
              {personDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 z-30 bg-[#0f1018] border border-[#1c1e2a] rounded-xl py-1 shadow-2xl min-w-[120px]"
                  onMouseLeave={() => setPersonDropdownOpen(false)}
                >
                  <button
                    onClick={() => { setPersonFilter('all'); setPersonDropdownOpen(false) }}
                    className={`block w-full text-left px-3 py-1.5 text-[11px] transition-colors ${personFilter === 'all' ? 'text-[#a8a8b4]' : 'text-[#6b6e8c] hover:text-[#9a9cb8]'}`}
                  >
                    전체
                  </button>
                  {allPersons.map(name => (
                    <button
                      key={name}
                      onClick={() => { setPersonFilter(name); setPersonDropdownOpen(false) }}
                      className={`block w-full text-left px-3 py-1.5 text-[11px] transition-colors ${personFilter === name ? 'text-[#a8a8b4]' : 'text-[#6b6e8c] hover:text-[#9a9cb8]'}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="no-drag flex gap-0.5">
          {TABS.map(({ value, label, count }) => (
            <button
              key={value}
              onClick={() => { setActiveTab(value); setSelectedIds(new Set()) }}
              className={`text-[12px] px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === value
                  ? 'bg-[#1c1c22] text-[#9a9cc0]'
                  : 'text-[#35374e] hover:text-[#6b6e8c]'
              }`}
            >
              <span>{label}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none ${
                  value === 'trash'
                    ? activeTab === value ? 'bg-red-500/20 text-red-400' : 'bg-red-500/10 text-red-500/60'
                    : activeTab === value ? 'bg-white/12 text-[#a8a8b4]' : 'bg-[#14151e] text-[#35374e]'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 자연어 입력창 */}
      {activeTab !== 'done' && activeTab !== 'trash' && (
        <div className="px-6 py-3 border-b border-[#13141c]">
          <NLInput
            onSubmit={handleNlAction}
            onUpload={handleUpload}
            placeholder="예: '홍길동 태스크 완료해줘' / '보고서 마감일 내일로 바꿔줘'"
          />
        </div>
      )}

      {/* 태스크 목록 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[#737373]">불러오는 중...</p>
          </div>
        ) : activeTab === 'focus' ? renderFocus()
          : activeTab === 'backlog' ? renderBacklog()
          : activeTab === 'done' ? renderDone()
          : renderTrash()
        }
      </div>

      {/* 완료 Undo 토스트 */}
      {undoToast && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-[#1a1c28] bg-[#0d0e15] fade-in">
          <span className="text-[11px] text-[#8a8ca8] truncate max-w-[200px]">"{undoToast.title}" 완료 처리됨</span>
          <button
            onClick={() => handleUndoDone(undoToast.id)}
            className="text-[11px] text-[#c8c8d0] hover:text-white font-medium ml-3 flex-shrink-0"
          >
            실행 취소
          </button>
        </div>
      )}
      {/* 일괄 처리 액션 바 */}
      {selectedIds.size > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-[#1a1c28] bg-[#0d0e15]">
          <span className="text-[12px] text-[#6b6e8c]">{selectedIds.size}개 선택됨</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-[12px] text-[#505272] hover:text-[#9a9cb8] px-3 py-1.5 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => handleBulkAction('trashed')}
              className="flex items-center gap-1.5 text-[12px] text-[#9a4040] hover:text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
              </svg>
              휴지통
            </button>
            <button
              onClick={() => handleBulkAction('done')}
              className="flex items-center gap-1.5 text-[12px] text-[#a8a8b4] bg-white/10 hover:bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
