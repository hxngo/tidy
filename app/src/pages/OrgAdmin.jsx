import { useState, useEffect, useCallback } from 'react'

// ─── Icons ──────────────────────────────────────────────────────
const IcPlus = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M8 2v12M2 8h12"/>
  </svg>
)
const IcTrash = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
  </svg>
)
const IcBuilding = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="12" height="13" rx="1"/>
    <path d="M5 5h2M9 5h2M5 8h2M9 8h2M5 11h2M9 11h2"/>
    <path d="M6 15v-4h4v4"/>
  </svg>
)
const IcDept = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="5" r="2.5"/>
    <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5"/>
    <path d="M11.5 4a2 2 0 010 4M14 14c0-1.86-1.08-3.45-2.62-4.1"/>
  </svg>
)
const IcInbox = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5"/>
    <path d="M1 9h3.5l1.5 2h4l1.5-2H15"/>
  </svg>
)
const IcTask = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4.5l1.5 1.5 2.5-3M2 9l1.5 1.5 2.5-3M8 5h6M8 9.5h5"/>
  </svg>
)
const IcWarning = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1L15 14H1L8 1z"/>
    <path d="M8 6v4M8 12v.5"/>
  </svg>
)

// ─── 날짜 포맷 ───────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
function fmtRelative(iso) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일 전`
}

// ─── 빈 상태 컴포넌트 ────────────────────────────────────────────
function EmptyState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2">
      <p className="text-[12px] text-[#303050]">{label}</p>
    </div>
  )
}

// ─── 인박스 공지 생성 폼 ─────────────────────────────────────────
function CreateItemForm({ scope, department, onCreated, onCancel }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await window.tidy?.org.createItem({ title: title.trim(), body: body.trim(), scope, department })
      if (res?.success) {
        onCreated(res.item)
      } else {
        setError(res?.error || '생성 실패')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#0d0e16] border border-[#1c1e2c] rounded-xl p-4 mb-3 space-y-3">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="공지 제목"
        className="w-full bg-transparent text-[13px] text-[#d8d8e8] placeholder-[#303050] border-b border-[#1c1e2c] focus:border-[#3a3c58] focus:outline-none pb-1"
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="내용 (선택)"
        rows={3}
        className="w-full bg-[#09090c] border border-[#1a1c28] rounded-lg px-3 py-2 text-[12px] text-[#a0a2b8] placeholder-[#303050] resize-none focus:outline-none focus:border-[#2e3048]"
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !title.trim()}
          className="flex-1 text-[12px] py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-colors disabled:opacity-30">
          {saving ? '저장 중…' : '공지 등록'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 text-[12px] py-1.5 rounded-lg bg-[#12131c] border border-[#1c1e2c] text-[#6b6e8c] hover:text-[#9a9cb8] transition-colors">
          취소
        </button>
      </div>
    </form>
  )
}

// ─── 태스크 생성 폼 ──────────────────────────────────────────────
function CreateTaskForm({ scope, department, onCreated, onCancel }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [person, setPerson] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await window.tidy?.org.createTask({
        title: title.trim(),
        due_date: dueDate || null,
        person: person.trim() || null,
        scope,
        department,
      })
      if (res?.success) {
        onCreated(res.task)
      } else {
        setError(res?.error || '생성 실패')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#0d0e16] border border-[#1c1e2c] rounded-xl p-4 mb-3 space-y-3">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="태스크 제목"
        className="w-full bg-transparent text-[13px] text-[#d8d8e8] placeholder-[#303050] border-b border-[#1c1e2c] focus:border-[#3a3c58] focus:outline-none pb-1"
      />
      <div className="flex gap-3">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="bg-[#09090c] border border-[#1a1c28] rounded-lg px-2.5 py-1.5 text-[12px] text-[#a0a2b8] focus:outline-none focus:border-[#2e3048]"
        />
        <input
          value={person}
          onChange={e => setPerson(e.target.value)}
          placeholder="담당자 (선택)"
          className="flex-1 bg-[#09090c] border border-[#1a1c28] rounded-lg px-2.5 py-1.5 text-[12px] text-[#a0a2b8] placeholder-[#303050] focus:outline-none focus:border-[#2e3048]"
        />
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !title.trim()}
          className="flex-1 text-[12px] py-1.5 rounded-lg bg-teal-600/20 border border-teal-500/30 text-teal-300 hover:bg-teal-600/30 transition-colors disabled:opacity-30">
          {saving ? '저장 중…' : '태스크 등록'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 text-[12px] py-1.5 rounded-lg bg-[#12131c] border border-[#1c1e2c] text-[#6b6e8c] hover:text-[#9a9cb8] transition-colors">
          취소
        </button>
      </div>
    </form>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────
export default function OrgAdmin() {
  const [orgConfig, setOrgConfigState] = useState(null)
  const [scope, setScope] = useState('company') // 'company' | 'department'
  const [contentTab, setContentTab] = useState('items') // 'items' | 'tasks'
  const [items, setItems] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [creatingItem, setCreatingItem] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [deptInput, setDeptInput] = useState('')

  // 조직 설정 로드
  useEffect(() => {
    window.tidy?.org.getConfig().then(cfg => {
      setOrgConfigState(cfg)
      setDeptInput(cfg?.department || '')
    }).catch(() => {})
  }, [])

  // 현재 scope + dept에 맞는 목록 로드
  const loadContent = useCallback(async () => {
    if (!orgConfig?.sharedVaultPath) return
    setLoading(true)
    try {
      const dept = scope === 'department' ? (deptInput || orgConfig.department) : ''
      const [itemList, taskList] = await Promise.all([
        window.tidy?.org.listItems({ scope, department: dept }),
        window.tidy?.org.listTasks({ scope, department: dept }),
      ])
      setItems(Array.isArray(itemList) ? itemList : [])
      setTasks(Array.isArray(taskList) ? taskList : [])
    } finally {
      setLoading(false)
    }
  }, [orgConfig, scope, deptInput])

  useEffect(() => { loadContent() }, [loadContent])

  async function handleDeleteFile(filePath) {
    if (!filePath) return
    await window.tidy?.org.deleteFile(filePath)
    await loadContent()
  }

  // 공유 폴더 미설정 경고
  if (orgConfig && !orgConfig.sharedVaultPath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
          {IcWarning}
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[#d8d8e8] mb-1">공유 볼트 경로가 설정되지 않았습니다</p>
          <p className="text-[12px] text-[#505272]">설정 → AI 탭 → 조직 설정에서 공유 폴더를 지정해주세요.</p>
        </div>
      </div>
    )
  }

  const dept = scope === 'department' ? (deptInput || orgConfig?.department || '') : ''

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#09090c]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[#13141c]">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[15px] font-semibold text-[#e0e0f0] tracking-tight">조직 관리</h1>
            {orgConfig?.company && (
              <p className="text-[11px] text-[#505272] mt-0.5">{orgConfig.company}</p>
            )}
          </div>
          {/* 공유 경로 표시 */}
          {orgConfig?.sharedVaultPath && (
            <span className="text-[10px] text-[#303050] bg-[#0d0e16] border border-[#1a1c28] rounded-lg px-2 py-1 max-w-[200px] truncate">
              {orgConfig.sharedVaultPath}
            </span>
          )}
        </div>

        {/* Scope 선택 */}
        <div className="flex gap-1.5 mt-4">
          <button
            onClick={() => setScope('company')}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${
              scope === 'company'
                ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300'
                : 'bg-transparent border-[#1c1e2c] text-[#505272] hover:text-[#9a9cb8] hover:border-[#252840]'
            }`}
          >
            {IcBuilding}
            🏢 전사 공유
          </button>
          <button
            onClick={() => setScope('department')}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-all ${
              scope === 'department'
                ? 'bg-teal-600/20 border-teal-500/30 text-teal-300'
                : 'bg-transparent border-[#1c1e2c] text-[#505272] hover:text-[#9a9cb8] hover:border-[#252840]'
            }`}
          >
            {IcDept}
            👥 부서 공유
          </button>
          {/* 부서 이름 입력 (부서 선택 시) */}
          {scope === 'department' && (
            <input
              value={deptInput}
              onChange={e => setDeptInput(e.target.value)}
              placeholder={orgConfig?.department || '부서 이름'}
              className="ml-1 bg-[#0d0e16] border border-[#1c1e2c] rounded-lg px-2.5 py-1 text-[12px] text-[#a0a2b8] placeholder-[#3a3c58] focus:outline-none focus:border-[#2e3048] w-28"
            />
          )}
        </div>

        {/* Content 탭 */}
        <div className="flex gap-0.5 mt-3">
          <button
            onClick={() => setContentTab('items')}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-all ${
              contentTab === 'items'
                ? 'bg-[#1c1c22] text-[#b8bacc]'
                : 'text-[#505272] hover:text-[#9a9cb8]'
            }`}
          >
            {IcInbox}
            인박스 공지
            <span className="text-[10px] text-[#303050]">({items.length})</span>
          </button>
          <button
            onClick={() => setContentTab('tasks')}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-all ${
              contentTab === 'tasks'
                ? 'bg-[#1c1c22] text-[#b8bacc]'
                : 'text-[#505272] hover:text-[#9a9cb8]'
            }`}
          >
            {IcTask}
            공유 태스크
            <span className="text-[10px] text-[#303050]">({tasks.length})</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* 인박스 공지 탭 */}
        {contentTab === 'items' && (
          <>
            {/* 새 공지 버튼 */}
            {!creatingItem && (
              <button
                onClick={() => setCreatingItem(true)}
                className="w-full flex items-center justify-center gap-2 text-[12px] py-2.5 rounded-xl border border-dashed border-[#252840] text-[#505272] hover:text-[#9a9cb8] hover:border-[#3a3c58] transition-all mb-4"
              >
                {IcPlus}
                새 공지 추가
              </button>
            )}

            {/* 생성 폼 */}
            {creatingItem && (
              <CreateItemForm
                scope={scope}
                department={dept}
                onCreated={(item) => {
                  setItems(prev => [item, ...prev])
                  setCreatingItem(false)
                }}
                onCancel={() => setCreatingItem(false)}
              />
            )}

            {/* 목록 */}
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#3a3c58] animate-pulse" style={{ animationDelay: `${i*150}ms` }} />
                  ))}
                </div>
              </div>
            ) : items.length === 0 && !creatingItem ? (
              <EmptyState label="등록된 공지가 없습니다" />
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="group flex items-start gap-3 px-4 py-3 rounded-xl bg-[#0d0e16] border border-[#1a1c28] hover:border-[#252840] transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {scope === 'company'
                          ? <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border text-indigo-300 bg-indigo-500/10 border-indigo-500/30">🏢 전사</span>
                          : <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border text-teal-300 bg-teal-500/10 border-teal-500/30">👥 {dept || '부서'}</span>
                        }
                      </div>
                      <p className="text-[13px] text-[#d8d8e8] leading-snug">{item.summary || item.title}</p>
                      <p className="text-[10px] text-[#404060] mt-1">{fmtRelative(item.created_at)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(item._filePath)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-[#404060] hover:text-red-400 transition-all mt-0.5"
                      title="삭제"
                    >
                      {IcTrash}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 공유 태스크 탭 */}
        {contentTab === 'tasks' && (
          <>
            {/* 새 태스크 버튼 */}
            {!creatingTask && (
              <button
                onClick={() => setCreatingTask(true)}
                className="w-full flex items-center justify-center gap-2 text-[12px] py-2.5 rounded-xl border border-dashed border-[#252840] text-[#505272] hover:text-[#9a9cb8] hover:border-[#3a3c58] transition-all mb-4"
              >
                {IcPlus}
                새 태스크 추가
              </button>
            )}

            {/* 생성 폼 */}
            {creatingTask && (
              <CreateTaskForm
                scope={scope}
                department={dept}
                onCreated={(task) => {
                  setTasks(prev => [task, ...prev])
                  setCreatingTask(false)
                }}
                onCancel={() => setCreatingTask(false)}
              />
            )}

            {/* 목록 */}
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#3a3c58] animate-pulse" style={{ animationDelay: `${i*150}ms` }} />
                  ))}
                </div>
              </div>
            ) : tasks.length === 0 && !creatingTask ? (
              <EmptyState label="등록된 공유 태스크가 없습니다" />
            ) : (
              <div className="space-y-1">
                {tasks.map(task => (
                  <div key={task.id} className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0d0e16] border border-[#1a1c28] hover:border-[#252840] transition-all">
                    <div className="w-3 h-3 rounded border border-[#252840] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {scope === 'company'
                          ? <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border text-indigo-300 bg-indigo-500/10 border-indigo-500/30">🏢 전사</span>
                          : <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border text-teal-300 bg-teal-500/10 border-teal-500/30">👥 {dept || '부서'}</span>
                        }
                        <p className="text-[13px] text-[#d8d8e8]">{task.title}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {task.person && (
                          <span className="text-[10px] text-[#505272]">👤 {task.person}</span>
                        )}
                        {task.due_date && (
                          <span className="text-[10px] text-[#505272]">📅 {fmtDate(task.due_date)}</span>
                        )}
                        <span className="text-[10px] text-[#303050]">{fmtRelative(task.created_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(task._filePath)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-[#404060] hover:text-red-400 transition-all"
                      title="삭제"
                    >
                      {IcTrash}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 안내 푸터 */}
      <div className="flex-shrink-0 px-6 py-3 border-t border-[#13141c]">
        <p className="text-[10px] text-[#303050]">
          여기서 등록한 공지·태스크는 같은 공유 볼트를 연결한 모든 구성원의 인박스·태스크에 자동으로 표시됩니다.
        </p>
      </div>
    </div>
  )
}
