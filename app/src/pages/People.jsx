import { useState, useEffect } from 'react'
import { IconPeople, IconClose, SourceIcon } from '../components/Icons.jsx'

// ─── 초성 검색 유틸 ────────────────────────────────────────────
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
  if ([...q].some(ch => { const c = ch.charCodeAt(0); return c >= 0x3131 && c <= 0x314E })) {
    return toChosung(text.toLowerCase()).includes(toChosung(q.toLowerCase()))
  }
  return false
}

const CATEGORY_COLORS = {
  업무: 'text-blue-300', 미팅: 'text-purple-300', 운영: 'text-yellow-300',
  여행: 'text-emerald-300', 정보: 'text-gray-300',
}


const AVATAR_COLORS = [
  'bg-violet-700', 'bg-blue-700', 'bg-green-700',
  'bg-yellow-700', 'bg-red-700', 'bg-pink-700', 'bg-indigo-700',
]

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function formatDate(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function People() {
  const [people, setPeople] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // 삭제 확인 대상 person
  const [editingPerson, setEditingPerson] = useState(null) // null | 'new' | person
  const [editForm, setEditForm] = useState({ name: '', org: '', role: '', email: '' })

  useEffect(() => {
    async function load() {
      try {
        const data = await window.tidy?.people.get()
        if (Array.isArray(data)) setPeople(data)
      } catch (error) {
        console.error('인물 로드 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
    // 새 인박스 아이템 도착 시 인물 목록 갱신 (알림에서 인물 자동 등록)
    const unsubInbox = window.tidy?.inbox.onNewItem(() => load())
    return () => { unsubInbox?.() }
  }, [])

  async function handleSelectPerson(person) {
    setSelectedPerson(person)
    setTimeline(null)
    setTimelineLoading(true)
    try {
      const result = await window.tidy?.people.getTimeline(person.name)
      if (result?.success) {
        setTimeline({ items: result.items || [], tasks: result.tasks || [] })
      }
    } catch {
      setTimelineLoading(false)
    } finally {
      setTimelineLoading(false)
    }
  }

  function startAddPerson() {
    setEditForm({ name: '', org: '', role: '', email: '' })
    setEditingPerson('new')
  }

  function startEditPerson(person) {
    setEditForm({ name: person.name, org: person.org || '', role: person.role || '', email: person.email || '' })
    setEditingPerson(person)
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
      if (editingPerson !== 'new' && selectedPerson?.id === editingPerson?.id) {
        setSelectedPerson(prev => prev ? { ...prev, ...editForm } : null)
      }
      setEditingPerson(null)
    }
  }

  async function handleDeletePerson(person) {
    const result = await window.tidy?.people.delete(person.name)
    if (result?.success) {
      setPeople((prev) => prev.filter((p) => p.id !== person.id))
      if (selectedPerson?.id === person.id) setSelectedPerson(null)
    }
    setConfirmDelete(null)
  }

  const filtered = people.filter(
    (p) =>
      matchesSearch(p.name, search) ||
      matchesSearch(p.email, search) ||
      matchesSearch(p.org, search)
  )

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="drag-region flex items-center justify-between px-6 h-11 border-b border-[#13141c] flex-shrink-0 bg-[#09090c]">
        <div className="no-drag flex items-center gap-2.5">
          <h1 className="text-[13px] font-semibold text-[#b8bacc] tracking-[-0.01em]">인물</h1>
          <span className="text-[11px] text-[#5a5c78]">{people.length}명</span>
        </div>
        <div className="no-drag flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..."
            className="bg-[#0f1018] border border-[#1a1c28] rounded-lg px-3 py-1.5 text-[12px] text-[#b8bacc] placeholder-[#2e3048] focus:outline-none focus:border-white/30 w-36 transition-colors"
          />
          <button
            onClick={startAddPerson}
            className="flex items-center gap-1 text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] bg-[#0f1018] border border-[#1a1c28] hover:border-[#252840] rounded-lg px-2.5 py-1.5 transition-colors"
            title="인물 추가"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 2v12M2 8h12"/>
            </svg>
            추가
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 인물 목록 */}
        <div className={`overflow-y-auto flex-shrink-0 ${selectedPerson ? 'w-56 border-r border-[#2a2a2a]' : 'flex-1'}`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[#8a8ca8]">불러오는 중...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <IconPeople size={36} className="text-[#404040] mx-auto mb-3" />
                <p className="text-sm font-medium text-[#e8e8f2]">
                  {search ? '검색 결과가 없습니다' : '등록된 인물이 없습니다'}
                </p>
                <p className="text-xs text-[#8a8ca8] mt-1">메시지를 분석하면 관련 인물이 자동 추가됩니다</p>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              {filtered.map((person) => (
                <div
                  key={person.id}
                  className={`group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all ${
                    selectedPerson?.id === person.id
                      ? 'border border-white/20 bg-white/6'
                      : 'border border-[#1a1c28] hover:border-[#252840]'
                  }`}
                  style={selectedPerson?.id !== person.id ? { background: 'var(--card-bg)' } : {}}
                >
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => handleSelectPerson(person)}
                  >
                    <div className={`w-8 h-8 rounded-full ${getAvatarColor(person.name)} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-xs font-semibold text-white">{person.name.slice(0, 1)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#d0d0e4] truncate">{person.name}</p>
                      {(person.org || person.role) && (
                        <p className="text-[11px] text-[#6b6e8c] truncate">
                          {person.org}{person.role ? ` · ${person.role}` : ''}
                        </p>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEditPerson(person) }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#404060] hover:text-[#9a9cb8] transition-all p-1 rounded"
                    title="편집"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 2l3 3L5 14H2v-3L11 2z"/>
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(person) }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#404060] hover:text-red-400 transition-all p-1 rounded"
                    title="삭제"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 타임라인 패널 */}
        {selectedPerson && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 패널 헤더 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
              <div className={`w-9 h-9 rounded-full ${getAvatarColor(selectedPerson.name)} flex items-center justify-center flex-shrink-0`}>
                <span className="text-sm font-semibold text-white">{selectedPerson.name.slice(0, 1)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#e8e8f2]">{selectedPerson.name}</p>
                {(selectedPerson.org || selectedPerson.email) && (
                  <p className="text-xs text-[#8a8ca8] truncate">
                    {selectedPerson.org}{selectedPerson.email ? ` · ${selectedPerson.email}` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                className="text-[#404040] hover:text-[#8a8ca8] transition-colors"
              >
                <IconClose size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {timelineLoading ? (
                <div className="flex items-center justify-center h-24">
                  <p className="text-sm text-[#8a8ca8] animate-pulse">불러오는 중...</p>
                </div>
              ) : timeline && (
                <div className="space-y-5">
                  {/* 관련 태스크 */}
                  {timeline.tasks.length > 0 && (
                    <div>
                      <p className="text-xs text-[#8a8ca8] font-medium uppercase tracking-wide mb-2">
                        태스크 ({timeline.tasks.length})
                      </p>
                      <div className="space-y-1.5">
                        {timeline.tasks.map((task) => (
                          <div
                            key={task.id}
                            className={`flex items-start gap-2.5 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg ${
                              task.status !== 'active' ? 'opacity-50' : ''
                            }`}
                          >
                            <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                              task.status === 'done' ? 'bg-[#d4d4d8] border-[#d4d4d8]' : 'border-[#404040]'
                            }`}>
                              {task.status === 'done' && (
                                <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs ${task.status !== 'active' ? 'line-through text-[#404040]' : 'text-[#e8e8f2]'}`}>
                                {task.title}
                              </p>
                              {task.due_date && (
                                <p className="text-xs text-[#8a8ca8] mt-0.5">~{task.due_date.slice(0, 10)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 메시지 히스토리 */}
                  {timeline.items.length > 0 && (
                    <div>
                      <p className="text-xs text-[#8a8ca8] font-medium uppercase tracking-wide mb-2">
                        메시지 히스토리 ({timeline.items.length})
                      </p>
                      <div className="space-y-1.5">
                        {timeline.items.map((item) => (
                          <div key={item.id} className="px-3 py-2.5 border border-[#1a1c28] rounded-xl" style={{ background: 'var(--card-bg)' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <SourceIcon source={item.source} size={12} className="text-[#737373]" />
                              <span className={`text-xs ${CATEGORY_COLORS[item.category] || 'text-gray-300'}`}>
                                {item.category}
                              </span>
                              <span className="text-xs text-[#404040] ml-auto">{formatDate(item.received_at)}</span>
                            </div>
                            <p className="text-xs text-[#b0b0c4] leading-relaxed line-clamp-2">
                              {item.summary || '요약 없음'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {timeline.items.length === 0 && timeline.tasks.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-[#8a8ca8]">아직 관련 메시지나 태스크가 없습니다</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 인물 추가/수정 모달 */}
      {editingPerson !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setEditingPerson(null)}
        >
          <div
            className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-80 p-5 shadow-2xl fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[13px] font-semibold text-[#e0e0f0] mb-4">
              {editingPerson === 'new' ? '인물 추가' : '인물 편집'}
            </p>
            <div className="space-y-2.5">
              {[
                { key: 'name', label: '이름 *', placeholder: '홍길동' },
                { key: 'org',  label: '소속',  placeholder: '회사 또는 팀' },
                { key: 'role', label: '직책',  placeholder: '개발자, 팀장 등' },
                { key: 'email',label: '이메일',placeholder: 'example@email.com' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-[10px] text-[#6b6e8c] font-medium uppercase tracking-wide">{label}</label>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    value={editForm[key]}
                    onChange={(e) => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="mt-1 w-full bg-[#09090c] border border-[#1a1c28] rounded-lg px-3 py-2 text-[12px] text-[#c8c8d8] placeholder-[#3a3c58] focus:outline-none focus:border-white/30 transition-colors"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePerson() }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditingPerson(null)}
                className="flex-1 text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] py-1.5 rounded-lg border border-[#1a1c28] hover:border-[#252840] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSavePerson}
                disabled={!editForm.name.trim()}
                className="flex-1 text-[12px] font-medium text-[#c8c8d0] bg-white/8 hover:bg-white/12 py-1.5 rounded-lg border border-white/10 transition-colors disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-80 p-5 shadow-2xl fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`w-9 h-9 rounded-full ${getAvatarColor(confirmDelete.name)} flex items-center justify-center mb-3`}>
              <span className="text-sm font-semibold text-white">{confirmDelete.name.slice(0, 1)}</span>
            </div>
            <p className="text-[13px] font-semibold text-[#e0e0f0] mb-1">{confirmDelete.name} 삭제</p>
            <p className="text-[12px] text-[#6b6e8c] mb-4">인물 파일이 Vault에서 영구 삭제됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] py-1.5 rounded-lg border border-[#1a1c28] hover:border-[#252840] transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDeletePerson(confirmDelete)}
                className="flex-1 text-[12px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 py-1.5 rounded-lg border border-red-500/20 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
