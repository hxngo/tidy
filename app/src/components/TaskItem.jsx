import { useState, useEffect } from 'react'

const IcPerson = (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5" r="3"/>
    <path d="M2 14c0-3.31 2.69-6 6-6s6 2.69 6 6"/>
  </svg>
)
const IcCal = (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/>
    <path d="M1.5 6.5h13M5 1v3M11 1v3"/>
  </svg>
)
const IcTrash = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
  </svg>
)
const IcRestore = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8a5 5 0 1 0 1.5-3.5L2 7"/>
    <path d="M2 3v4h4"/>
  </svg>
)
const IcPencil = (
  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-9 9H2v-3L11 2z"/>
  </svg>
)

function isOverdueDate(dueDateStr) {
  if (!dueDateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dueDateStr) < today
}

export default function TaskItem({ task, onStatusChange, onUpdate, selected, onSelect, people = [] }) {
  const isDone    = task.status === 'done'
  const isTrashed = task.status === 'trashed'
  const faded     = isDone || isTrashed
  const selectable = !isDone && !isTrashed
  const dateOverdue = selectable && isOverdueDate(task.due_date)

  const [editingField, setEditingField] = useState(null) // 'title' | 'date' | 'person' | null
  const [editTitle, setEditTitle] = useState(task.title || '')
  const [editDate,  setEditDate]  = useState(task.due_date ? task.due_date.slice(0, 10) : '')
  const [editPerson, setEditPerson] = useState(task.person || '')
  const [personQuery, setPersonQuery] = useState('')
  const [memoOpen, setMemoOpen] = useState(false)
  const [editMemo, setEditMemo] = useState(task.memo || '')

  // task prop이 바뀌면 로컬 편집 상태도 동기화
  useEffect(() => {
    if (editingField !== 'title') setEditTitle(task.title || '')
  }, [task.title]) // eslint-disable-line

  useEffect(() => {
    if (editingField !== 'date') setEditDate(task.due_date ? task.due_date.slice(0, 10) : '')
  }, [task.due_date]) // eslint-disable-line

  useEffect(() => {
    if (editingField !== 'person') setEditPerson(task.person || '')
  }, [task.person]) // eslint-disable-line

  useEffect(() => {
    if (!memoOpen) setEditMemo(task.memo || '')
  }, [task.memo]) // eslint-disable-line

  async function saveTitle() {
    const t = editTitle.trim()
    setEditingField(null)
    if (t && t !== task.title) {
      onUpdate?.({ id: task.id, title: t })
      try { await window.tidy?.tasks.update({ id: task.id, title: t }) } catch {}
    } else {
      setEditTitle(task.title || '')
    }
  }

  async function saveDate() {
    setEditingField(null)
    const d = editDate || null
    const prev = task.due_date ? task.due_date.slice(0, 10) : null
    if (d !== prev) {
      onUpdate?.({ id: task.id, due_date: d })
      try { await window.tidy?.tasks.update({ id: task.id, due_date: d }) } catch {}
    }
  }

  async function savePerson(value) {
    const p = (value ?? editPerson).trim() || null
    setEditingField(null)
    setPersonQuery('')
    if (p !== (task.person || null)) {
      onUpdate?.({ id: task.id, person: p })
      try { await window.tidy?.tasks.update({ id: task.id, person: p }) } catch {}
    } else {
      setEditPerson(task.person || '')
    }
  }

  async function saveMemo() {
    const m = editMemo.trim() || null
    setMemoOpen(false)
    if (m !== (task.memo || null)) {
      onUpdate?.({ id: task.id, memo: m })
      try { await window.tidy?.tasks.update({ id: task.id, memo: m }) } catch {}
    }
  }

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 transition-opacity ${faded ? 'opacity-50' : ''} ${selected ? 'bg-white/3' : ''}`}>
      {/* Checkbox / Select */}
      <button
        onClick={() => selectable ? onSelect?.(task.id) : onStatusChange?.(task.id, 'active')}
        className={`group/cb mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
          selected
            ? 'bg-[#d4d4d8] border-[#d4d4d8]'
            : isDone
              ? 'bg-[#d4d4d8] border-[#d4d4d8]'
              : isTrashed
                ? 'border-[#252840] text-[#404060]'
                : 'border-[#252840] hover:border-white/40 hover:bg-white/5'
        }`}
      >
        {(selected || isDone) && (
          <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {!selected && !isDone && !isTrashed && (
          <svg className="w-2 h-2 text-white/0 group-hover/cb:text-white/30 transition-colors" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {isTrashed && IcTrash}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editingField === 'title' ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditTitle(task.title || ''); setEditingField(null) } }}
            onClick={(e) => e.stopPropagation()}
            className="text-[13px] bg-transparent border-b border-[#252840] focus:border-[#6a6c98] focus:outline-none text-[#d8d8e8] w-full leading-snug"
          />
        ) : (
          <div className="flex items-center gap-1.5 group/title flex-wrap">
            {/* Scope badge */}
            {task.scope === 'company' && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border text-indigo-300 bg-indigo-500/10 border-indigo-500/30 flex-shrink-0">🏢 전사</span>
            )}
            {task.scope === 'department' && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border text-teal-300 bg-teal-500/10 border-teal-500/30 flex-shrink-0">👥 부서</span>
            )}
            <p
              className={`text-[13px] leading-snug ${isDone || isTrashed ? 'line-through text-[#4a4c68]' : 'text-[#d8d8e8]'} ${selectable && !task._readonly ? 'cursor-text' : ''}`}
              onDoubleClick={() => { if (selectable && !task._readonly) { setEditTitle(task.title || ''); setEditingField('title') } }}
              title={selectable && !task._readonly ? '더블클릭으로 제목 편집' : undefined}
            >
              {task.title}
            </p>
            {selectable && !task._readonly && (
              <span className="opacity-0 group-hover/title:opacity-40 text-[#6b6e8c] transition-opacity flex-shrink-0">
                {IcPencil}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-3 mt-1">
          {/* 담당자 (클릭 편집 + 자동완성) */}
          {editingField === 'person' ? (
            <div className="relative">
              <input
                autoFocus
                value={editPerson}
                onChange={(e) => { setEditPerson(e.target.value); setPersonQuery(e.target.value) }}
                onBlur={() => setTimeout(() => savePerson(), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') savePerson()
                  if (e.key === 'Escape') { setEditPerson(task.person || ''); setPersonQuery(''); setEditingField(null) }
                }}
                placeholder="담당자 이름"
                className="text-[11px] bg-transparent border-b border-[#252840] focus:border-[#6a6c98] focus:outline-none text-[#6b6e8c] w-24"
              />
              {personQuery && people.filter(p => p.toLowerCase().includes(personQuery.toLowerCase())).length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-[#0f1018] border border-[#1c1e2a] rounded-lg py-1 shadow-xl min-w-[120px]">
                  {people.filter(p => p.toLowerCase().includes(personQuery.toLowerCase())).slice(0, 5).map(name => (
                    <button
                      key={name}
                      onMouseDown={(e) => { e.preventDefault(); savePerson(name) }}
                      className="block w-full text-left px-3 py-1 text-[11px] text-[#8a8ca8] hover:text-[#c8c8d8] hover:bg-[#1a1c28] transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : task.person ? (
            <span
              className={`flex items-center gap-1 text-[11px] text-[#6b6e8c] ${selectable ? 'cursor-pointer hover:text-[#9a9cb8]' : ''}`}
              onClick={() => { if (selectable) { setEditPerson(task.person || ''); setPersonQuery(''); setEditingField('person') } }}
              title={selectable ? '클릭으로 담당자 편집' : undefined}
            >
              {IcPerson}
              {task.person}
            </span>
          ) : selectable ? (
            <span
              className="flex items-center gap-1 text-[11px] text-[#404060] opacity-0 group-hover:opacity-100 cursor-pointer hover:text-[#6b6e8c] transition-all"
              onClick={() => { setEditPerson(''); setPersonQuery(''); setEditingField('person') }}
            >
              {IcPerson}
            </span>
          ) : null}
          {editingField === 'date' ? (
            <input
              type="date"
              autoFocus
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              onBlur={saveDate}
              onKeyDown={(e) => { if (e.key === 'Enter') saveDate(); if (e.key === 'Escape') { setEditDate(task.due_date ? task.due_date.slice(0, 10) : ''); setEditingField(null) } }}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] bg-transparent border-b border-[#252840] focus:border-[#6a6c98] focus:outline-none text-[#6b6e8c]"
            />
          ) : (
            <span
              className={`group/date flex items-center gap-1 text-[11px] ${
                dateOverdue ? 'text-red-500' : 'text-[#6b6e8c]'
              } ${selectable ? 'cursor-pointer hover:text-[#9a9cb8]' : ''}`}
              onClick={(e) => { if (selectable) { e.stopPropagation(); setEditDate(task.due_date ? task.due_date.slice(0, 10) : ''); setEditingField('date') } }}
              title={selectable ? '클릭으로 날짜 편집' : undefined}
            >
              {IcCal}
              {task.due_date
                ? <>{formatDate(task.due_date)} <span className="opacity-0 group-hover/date:opacity-60 transition-opacity">{IcPencil}</span></>
                : selectable ? <span className="opacity-0 group-hover:opacity-30 transition-opacity">날짜 추가</span> : null
              }
            </span>
          )}
          <span className="text-[11px] text-[#505272]">{formatRelativeTime(task.created_at)}</span>
          {/* 메모 토글 */}
          {selectable && (
            <button
              onClick={(e) => { e.stopPropagation(); setMemoOpen(v => !v) }}
              className={`flex items-center gap-1 text-[11px] transition-colors ${
                task.memo || memoOpen ? 'text-[#6b6e8c]' : 'text-[#303048] hover:text-[#505070]'
              }`}
              title="메모"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h12M2 7h8M2 11h6"/>
              </svg>
              {task.memo && !memoOpen && <span className="opacity-60 max-w-[140px] truncate">{task.memo}</span>}
            </button>
          )}
        </div>
        {/* 메모 입력창 */}
        {memoOpen && (
          <div className="mt-1.5">
            <textarea
              autoFocus
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              onBlur={saveMemo}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditMemo(task.memo || ''); setMemoOpen(false) } }}
              placeholder="메모 입력..."
              rows={2}
              className="w-full text-[11px] text-[#8a8ca8] bg-[#0a0b12] border border-[#1c1e2a] rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:border-[#2e3048] placeholder-[#303048]"
            />
          </div>
        )}
      </div>

      {/* Right action */}
      {isTrashed ? (
        <button
          onClick={() => onStatusChange?.(task.id, 'active')}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#505272] hover:text-[#c8c8d0] transition-all p-0.5 mt-0.5"
          title="복구"
        >
          {IcRestore}
        </button>
      ) : selectable && !selected ? (
        <button
          onClick={() => onStatusChange?.(task.id, 'trashed')}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#404060] hover:text-red-400 transition-all p-0.5 mt-0.5"
          title="삭제"
        >
          {IcTrash}
        </button>
      ) : null}
    </div>
  )
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const days = Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일 전`
}
