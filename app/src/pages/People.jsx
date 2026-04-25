import { useState, useEffect, useRef, useContext } from 'react'
import { IconPeople, SourceIcon } from '../components/Icons.jsx'
import { AIContext } from '../App.jsx'

// ─── 초성 검색 ────────────────────────────────────────────────
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
  if (text.toLowerCase().includes(q.toLowerCase())) return true
  if ([...q].some(ch => { const c = ch.charCodeAt(0); return c >= 0x3131 && c <= 0x314E }))
    return toChosung(text).includes(toChosung(q))
  return false
}

// ─── 아바타 ───────────────────────────────────────────────────
const PALETTE = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#0891b2','#84cc16',
]
function avatarColor(name) {
  if (!name) return PALETTE[0]
  return PALETTE[name.charCodeAt(0) % PALETTE.length]
}
function Avatar({ name, size = 32 }) {
  const bg = avatarColor(name)
  const fs = Math.round(size * 0.4)
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: fs, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
        {(name || '?')[0]}
      </span>
    </div>
  )
}

// ─── 날짜 포맷 ────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff < 7) return `${diff}일 전`
  if (diff < 30) return `${Math.floor(diff / 7)}주 전`
  if (diff < 365) return `${Math.floor(diff / 30)}개월 전`
  return `${Math.floor(diff / 365)}년 전`
}

// ─── 리스트 아이템 ────────────────────────────────────────────
function PersonRow({ person, selected, onSelect, onDelete }) {
  const lastContact = person.last_contact || person.updated_at
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={() => onSelect(person)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative ${
        selected
          ? 'bg-white/7 border border-white/10'
          : 'border border-transparent hover:bg-[#0d0e14]'
      }`}
    >
      <Avatar name={person.name} size={34} />
      <div className="flex-1 min-w-0">
        <p className={`text-[12.5px] font-medium truncate leading-tight ${selected ? 'text-[#e0e0f0]' : 'text-[#c8c8d8]'}`}>
          {person.name}
        </p>
        {(person.org || person.role) && (
          <p className="text-[11px] text-[#505272] truncate mt-0.5 leading-tight">
            {[person.org, person.role].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {/* 오른쪽: 날짜 or 삭제 버튼 */}
      <div className="flex-shrink-0 flex items-center">
        {hover ? (
          <button
            onClick={e => { e.stopPropagation(); onDelete(person) }}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[#505272] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        ) : lastContact ? (
          <span className="text-[10px] text-[#3a3c50]">{formatDate(lastContact)}</span>
        ) : null}
      </div>
    </button>
  )
}

// ─── 빈 상태 (우측 패널) ──────────────────────────────────────
function EmptyDetail({ total }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#0d0e14] border border-[#1a1c28] flex items-center justify-center">
        <IconPeople size={20} className="text-[#2a2c40]" />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-medium text-[#3a3c50]">{total}명 등록됨</p>
        <p className="text-[11px] text-[#2a2c3a] mt-1">목록에서 인물을 선택하세요</p>
      </div>
    </div>
  )
}

// ─── 상세 패널 ────────────────────────────────────────────────
function DetailPanel({ person, timeline, loading, onEdit, onDelete, onAI }) {
  const lastContact = person.last_contact || person.updated_at
  const msgCount = person.message_count ?? 0

  const grouped = []
  if (timeline) {
    const all = [...(timeline.items || [])].sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
    all.forEach(item => {
      const day = item.received_at?.slice(0, 10) || '날짜 없음'
      const last = grouped[grouped.length - 1]
      if (last && last.date === day) last.items.push(item)
      else grouped.push({ date: day, items: [item] })
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* 프로필 헤더 */}
      <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-[#13141c]">
        {/* 아바타 + 이름 */}
        <div className="flex items-start gap-4 mb-5">
          <Avatar name={person.name} size={56} />
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-[17px] font-semibold text-[#e8e8f8] leading-tight">{person.name}</h2>
            {person.org && <p className="text-[12px] text-[#6b6e8c] mt-1">{person.org}</p>}
            {person.role && <p className="text-[11px] text-[#505272] mt-0.5">{person.role}</p>}
            {person.email && (
              <p className="text-[11px] text-[#3a3c5a] mt-1.5 font-mono tracking-tight">{person.email}</p>
            )}
          </div>
        </div>

        {/* 스탯 */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {msgCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#6b6e8c] bg-[#0d0e16] border border-[#1c1e2a] px-2.5 py-1 rounded-lg">
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 3h14v9a1 1 0 01-1 1H2a1 1 0 01-1-1V3zM1 3l7 5 7-5"/>
              </svg>
              메시지 {msgCount}
            </span>
          )}
          {(timeline?.tasks?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#6b6e8c] bg-[#0d0e16] border border-[#1c1e2a] px-2.5 py-1 rounded-lg">
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4.5l1.5 1.5 2.5-3M2 9l1.5 1.5 2.5-3M8 5h6M8 9.5h5"/>
              </svg>
              태스크 {timeline.tasks.length}
            </span>
          )}
          {lastContact && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#505272] bg-[#0d0e16] border border-[#1c1e2a] px-2.5 py-1 rounded-lg ml-auto">
              최근 연락 {formatDate(lastContact)}
            </span>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onAI}
            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#c026d3]/10 border border-[#c026d3]/25 text-[#e879f9] hover:bg-[#c026d3]/18 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
            </svg>
            AI
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1c1e2a] text-[#6b6e8c] hover:text-[#c8c8d8] hover:border-[#2a2c3a] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 2l3 3L5 14H2v-3L11 2z"/>
            </svg>
            편집
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1c1e2a] text-[#505272] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-colors ml-auto"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
            </svg>
            삭제
          </button>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="flex gap-1.5">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#252840] animate-pulse" style={{ animationDelay: `${i*150}ms` }}/>)}
            </div>
          </div>
        ) : !timeline ? null : (
          <div className="space-y-6">
            {/* 태스크 */}
            {timeline.tasks?.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-2.5">태스크</p>
                <div className="space-y-1.5">
                  {timeline.tasks.map(task => (
                    <div key={task.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${task.status === 'done' ? 'border-[#1a1c28] opacity-40' : 'border-[#1c1e2a] bg-[#0a0b10]'}`}>
                      <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        task.status === 'done' ? 'bg-[#d4d4d8] border-[#d4d4d8]' : 'border-[#3a3c50]'
                      }`}>
                        {task.status === 'done' && (
                          <svg className="w-2 h-2 text-[#0f0f0f]" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <p className={`text-[12px] flex-1 min-w-0 truncate ${task.status === 'done' ? 'line-through text-[#3a3c50]' : 'text-[#c8c8d8]'}`}>
                        {task.title}
                      </p>
                      {task.due_date && (
                        <span className="text-[10px] text-[#3a3c50] flex-shrink-0">~{task.due_date.slice(5,10)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 메시지 히스토리 */}
            {grouped.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-3">메시지 히스토리</p>
                <div className="space-y-5">
                  {grouped.map(({ date, items }) => (
                    <div key={date}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-[#13141c]" />
                        <span className="text-[9px] text-[#2e3048] font-medium tracking-wide">{date}</span>
                        <div className="h-px flex-1 bg-[#13141c]" />
                      </div>
                      <div className="space-y-1.5">
                        {items.map(item => (
                          <div key={item.id} className="px-3 py-2.5 rounded-xl border border-[#1a1c28] bg-[#0a0b10] hover:border-[#252840] transition-colors cursor-default">
                            <div className="flex items-center gap-1.5 mb-1">
                              <SourceIcon source={item.source} size={10} className="text-[#505272]"/>
                              <span className="text-[10px] text-[#505272]">{item.category || item.source}</span>
                              {item.priority === 'high' && (
                                <span className="text-[9px] text-red-400 font-bold ml-1">긴급</span>
                              )}
                              <span className="text-[10px] text-[#2e3048] ml-auto">{formatDate(item.received_at)}</span>
                            </div>
                            <p className="text-[12px] text-[#9a9cb8] leading-relaxed line-clamp-2">
                              {item.summary || '요약 없음'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {grouped.length === 0 && !timeline.tasks?.length && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <p className="text-[12px] text-[#2e3048]">관련 메시지나 태스크가 없습니다</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 ─────────────────────────────────────────────────────
export default function People() {
  const { setCtx } = useContext(AIContext)
  const [people, setPeople] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editingPerson, setEditingPerson] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', org: '', role: '', email: '' })
  const searchRef = useRef(null)

  useEffect(() => {
    if (selectedPerson) setCtx({ type: 'person', person: selectedPerson })
    else setCtx(null)
  }, [selectedPerson, setCtx])
  useEffect(() => () => setCtx(null), [setCtx])

  useEffect(() => {
    async function load() {
      try {
        const data = await window.tidy?.people.get()
        if (Array.isArray(data)) setPeople(data)
      } finally { setIsLoading(false) }
    }
    load()
    const unsub = window.tidy?.inbox.onNewItem(() => load())
    return () => unsub?.()
  }, [])

  async function handleSelectPerson(person) {
    if (selectedPerson?.id === person.id) { setSelectedPerson(null); return }
    setSelectedPerson(person)
    setTimeline(null)
    setTimelineLoading(true)
    try {
      const result = await window.tidy?.people.getTimeline(person.name)
      if (result?.success) setTimeline({ items: result.items || [], tasks: result.tasks || [] })
    } finally { setTimelineLoading(false) }
  }

  async function handleSavePerson() {
    if (!editForm.name.trim()) return
    const result = await window.tidy?.people.upsert({
      name: editForm.name.trim(),
      org: editForm.org.trim() || null,
      role: editForm.role.trim() || null,
      email: editForm.email.trim() || null,
    })
    if (result?.success) {
      const data = await window.tidy?.people.get()
      if (Array.isArray(data)) setPeople(data)
      if (editingPerson !== 'new' && selectedPerson?.id === editingPerson?.id)
        setSelectedPerson(prev => prev ? { ...prev, ...editForm } : null)
      setEditingPerson(null)
    }
  }

  async function handleDeletePerson(person) {
    const result = await window.tidy?.people.delete(person.name)
    if (result?.success) {
      setPeople(prev => prev.filter(p => p.id !== person.id))
      if (selectedPerson?.id === person.id) setSelectedPerson(null)
    }
    setConfirmDelete(null)
  }

  function openAI(person) {
    setCtx({ type: 'person', person })
    window.dispatchEvent(new CustomEvent('tidy:openCommandBar', { detail: { char: '' } }))
  }

  const filtered = search.trim()
    ? people.filter(p =>
        matchesSearch(p.name, search) ||
        matchesSearch(p.email, search) ||
        matchesSearch(p.org, search))
    : people

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* ── 왼쪽 리스트 패널 ──────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-[#13141c]">

        {/* 헤더 */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#b8bacc]">인물</span>
              <span className="text-[10px] text-[#3a3c50] bg-[#0d0e16] border border-[#1a1c28] px-1.5 py-0.5 rounded-full leading-none">
                {filtered.length}
              </span>
            </div>
            <button
              onClick={() => { setEditForm({ name: '', org: '', role: '', email: '' }); setEditingPerson('new') }}
              className="w-6 h-6 flex items-center justify-center rounded-lg border border-[#1a1c28] text-[#505272] hover:text-[#c8c8d8] hover:border-[#252840] transition-colors"
              title="인물 추가"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3v10M3 8h10"/>
              </svg>
            </button>
          </div>

          {/* 검색 */}
          <div className="relative">
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름, 소속 검색…"
              className="w-full bg-[#0a0b10] border border-[#1a1c28] rounded-lg pl-7 pr-3 py-1.5 text-[11.5px] text-[#b8bacc] placeholder-[#2a2c40] focus:outline-none focus:border-[#252840] transition-colors"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3a3c58] pointer-events-none" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4 4"/>
            </svg>
          </div>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <div className="flex justify-center pt-8">
              <div className="flex gap-1.5">
                {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#252840] animate-pulse" style={{ animationDelay: `${i*150}ms` }}/>)}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-12 gap-2 px-4 text-center">
              <IconPeople size={24} className="text-[#2a2c40]" />
              <p className="text-[11px] text-[#3a3c50]">
                {search ? `"${search}" 검색 결과 없음` : '등록된 인물이 없습니다'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  selected={selectedPerson?.id === person.id}
                  onSelect={handleSelectPerson}
                  onDelete={setConfirmDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 오른쪽 상세 패널 ──────────────────────────────────── */}
      {selectedPerson ? (
        <DetailPanel
          person={selectedPerson}
          timeline={timeline}
          loading={timelineLoading}
          onEdit={() => {
            setEditForm({ name: selectedPerson.name, org: selectedPerson.org||'', role: selectedPerson.role||'', email: selectedPerson.email||'' })
            setEditingPerson(selectedPerson)
          }}
          onDelete={() => setConfirmDelete(selectedPerson)}
          onAI={() => openAI(selectedPerson)}
        />
      ) : (
        <EmptyDetail total={people.length} />
      )}

      {/* ── 인물 추가/수정 모달 ───────────────────────────────── */}
      {editingPerson !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditingPerson(null)}>
          <div className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-80 p-5 shadow-2xl fade-in" onClick={e => e.stopPropagation()}>
            <p className="text-[13px] font-semibold text-[#e0e0f0] mb-4">
              {editingPerson === 'new' ? '인물 추가' : '인물 편집'}
            </p>
            <div className="space-y-2.5">
              {[
                { key: 'name',  label: '이름 *',  placeholder: '홍길동' },
                { key: 'org',   label: '소속',    placeholder: '회사 또는 팀' },
                { key: 'role',  label: '직책',    placeholder: '개발자, 팀장 등' },
                { key: 'email', label: '이메일',  placeholder: 'example@email.com' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-[10px] text-[#6b6e8c] font-medium uppercase tracking-wide">{label}</label>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    value={editForm[key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    onKeyDown={e => { if (e.key === 'Enter') handleSavePerson() }}
                    className="mt-1 w-full bg-[#09090c] border border-[#1a1c28] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d8] placeholder-[#3a3c58] focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingPerson(null)}
                className="flex-1 text-[12px] text-[#6b6e8c] py-1.5 rounded-lg border border-[#1a1c28] hover:border-[#252840] transition-colors">
                취소
              </button>
              <button onClick={handleSavePerson} disabled={!editForm.name.trim()}
                className="flex-1 text-[12px] font-medium text-[#c8c8d0] bg-white/8 hover:bg-white/12 py-1.5 rounded-lg border border-white/10 transition-colors disabled:opacity-40">
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 모달 ────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-72 p-5 shadow-2xl fade-in" onClick={e => e.stopPropagation()}>
            <Avatar name={confirmDelete.name} size={36} />
            <p className="text-[13px] font-semibold text-[#e0e0f0] mt-3 mb-1">{confirmDelete.name} 삭제</p>
            <p className="text-[12px] text-[#6b6e8c] mb-4">Vault에서 영구 삭제됩니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 text-[12px] text-[#6b6e8c] py-1.5 rounded-lg border border-[#1a1c28] hover:border-[#252840] transition-colors">
                취소
              </button>
              <button onClick={() => handleDeletePerson(confirmDelete)}
                className="flex-1 text-[12px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 py-1.5 rounded-lg border border-red-500/20 transition-colors">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
