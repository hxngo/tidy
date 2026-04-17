import { useState, useEffect, useCallback, useRef } from 'react'
import SkillPanel, { SKILLS, AI_SKILLS, NLM_SKILLS, skillByIdWithCustom, setCustomSkillsCache } from '../components/SkillPanel.jsx'

const CATEGORIES = [
  { id: 'all',          label: '전체' },
  { id: 'general',      label: '일반' },
  { id: 'writing',      label: '문서 작성' },
  { id: 'analysis',     label: '분석' },
  { id: 'communication',label: '커뮤니케이션' },
  { id: 'data',         label: '데이터' },
  { id: 'hr',           label: 'HR / 교육' },
  { id: 'legal',        label: '법무 / 계약' },
  { id: 'marketing',    label: '마케팅' },
  { id: 'engineering',  label: '개발 / 기술' },
]

const SORT_OPTIONS = [
  { id: 'popular',  label: '인기순' },
  { id: 'new',      label: '최신순' },
  { id: 'installs', label: '설치순' },
]

// ─── 아이콘 ────────────────────────────────────────────────────
function IconStar({ filled, size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5L8 1z"/>
    </svg>
  )
}
function IconDownload({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M5 7l3 3 3-3M2 12h12"/>
    </svg>
  )
}
function IconShare({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="3" r="1.5"/><circle cx="12" cy="13" r="1.5"/><circle cx="4" cy="8" r="1.5"/>
      <path d="M10.5 3.9L5.5 7.1M5.5 8.9l5 3.2"/>
    </svg>
  )
}
function IconEdit({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2l3 3-9 9H2v-3L11 2z"/>
    </svg>
  )
}
function IconTrash({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
    </svg>
  )
}

// ─── 스킬 실행 모달 ───────────────────────────────────────────
function SkillRunner({ skill, onClose }) {
  const [input, setInput] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [runInput, setRunInput] = useState('')
  const [showIntro, setShowIntro] = useState(true)

  function handleRun() {
    if (!input.trim()) return
    setRunInput(input.trim())
    setPanelOpen(true)
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#0d0e16] border border-[#1c1e2c] rounded-2xl w-full max-w-xl shadow-2xl fade-in" onClick={e => e.stopPropagation()}>
          {showIntro ? (
            <>
              <div className="flex justify-end px-4 pt-4">
                <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] transition-colors">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
                </button>
              </div>
              <div className="flex flex-col items-center pt-2 pb-6 px-8 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4" style={{ background: (skill.color || '#6366f1') + '20', color: skill.color || '#6366f1' }}>
                  {skill.icon || '★'}
                </div>
                <h2 className="text-[16px] font-semibold text-[#e0e0f0] mb-1">{skill.label}</h2>
                <p className="text-[12px] text-[#6b6e8c] leading-relaxed">{skill.detail || skill.desc}</p>
              </div>
              {skill.examples?.length > 0 && (
                <div className="mx-6 mb-5 p-4 rounded-xl bg-[#0a0b12] border border-[#1c1e2c]">
                  <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-wide mb-2.5">이런 경우에 사용하세요</p>
                  <div className="flex flex-col gap-1.5">
                    {skill.examples.map((ex, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: skill.color || '#6366f1' }} />
                        <span className="text-[11px] text-[#9a9cb8]">{ex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-6 pb-6">
                <button onClick={() => setShowIntro(false)} className="w-full text-[13px] font-medium text-white py-2.5 rounded-xl" style={{ background: skill.color || '#6366f1' }}>
                  시작하기
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#1c1e2c]">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: (skill.color || '#6366f1') + '22', color: skill.color || '#6366f1' }}>
                  {skill.icon || '★'}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#e0e0f0]">{skill.label}</p>
                  <p className="text-[11px] text-[#505272] mt-0.5">{skill.desc}</p>
                </div>
                <div className="flex-1" />
                <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8]">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
                </button>
              </div>
              <div className="px-5 py-4">
                <label className="text-[11px] text-[#505272] font-medium mb-2 block">입력 내용</label>
                <textarea
                  value={input} onChange={e => setInput(e.target.value)}
                  placeholder={`${skill.label}할 내용을 입력하거나 붙여넣기…`}
                  className="w-full h-40 bg-[#0a0b12] border border-[#1c1e2c] rounded-xl px-3.5 py-3 text-[12px] text-[#d0d0e4] placeholder-[#3a3c58] focus:outline-none focus:border-[#3a3c6a] resize-none"
                  autoFocus
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleRun() }}
                />
                <p className="text-[10px] text-[#3a3c50] mt-1.5">⌘↵ 로 실행</p>
              </div>
              <div className="px-5 pb-5 flex justify-end gap-2">
                <button onClick={onClose} className="text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] px-4 py-2 rounded-xl hover:bg-[#14151e]">취소</button>
                <button onClick={handleRun} disabled={!input.trim()} className="text-[12px] font-medium text-white px-5 py-2 rounded-xl disabled:opacity-30" style={{ background: skill.color || '#6366f1' }}>
                  실행
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <SkillPanel open={panelOpen} onClose={() => { setPanelOpen(false); onClose() }} skillId={skill.id} input={runInput} skillDef={skill.type === 'custom' ? skill : null} />
    </>
  )
}

// ─── 출력물 카드 ──────────────────────────────────────────────
function OutputCard({ output, onDelete, onView }) {
  const skill = skillByIdWithCustom(output.skill_id)
  const date = output.created_at
    ? new Date(output.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
  const preview = (() => {
    if (!output.body) return ''
    return output.body.replace(/^#.+\n/, '').replace(/^>.*\n/, '').replace(/^---\n/, '').trim().slice(0, 120)
  })()

  return (
    <div className="group rounded-xl border border-[#1a1c28] hover:border-[#252840] bg-[#09090c] transition-all fade-in">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] flex-shrink-0" style={{ background: (skill.color || '#6366f1') + '22', color: skill.color || '#6366f1' }}>
            {skill.icon || '·'}
          </div>
          <span className="text-[11px] font-medium text-[#9a9cb8]">{skill.label}</span>
          <div className="flex-1" />
          <span className="text-[10px] text-[#4a4c68]">{date}</span>
        </div>
        <p className="text-[12px] text-[#7a7c98] leading-relaxed line-clamp-3 mb-3">{preview || '내용 없음'}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onView?.(output)} className="flex items-center gap-1.5 text-[11px] text-[#6b6e8c] hover:text-[#e0e0f0] px-2.5 py-1 rounded-lg hover:bg-[#14151e]">보기</button>
          <button onClick={() => navigator.clipboard.writeText(output.body || '')} className="flex items-center gap-1.5 text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] px-2.5 py-1 rounded-lg hover:bg-[#14151e]">복사</button>
          <div className="flex-1" />
          <button onClick={() => onDelete?.(output.id)} className="text-[10px] text-[#4a3040] hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/5">삭제</button>
        </div>
      </div>
    </div>
  )
}

// ─── 출력물 뷰어 ─────────────────────────────────────────────
function OutputViewer({ output, onClose }) {
  const skill = skillByIdWithCustom(output.skill_id)
  const [copied, setCopied] = useState(false)
  function handleCopy() { navigator.clipboard.writeText(output.body || ''); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d0e16] border border-[#1c1e2c] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#1c1e2c] flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: (skill.color || '#6366f1') + '22', color: skill.color || '#6366f1' }}>{skill.icon || '·'}</div>
          <h3 className="text-[13px] font-semibold text-[#e0e0f0] flex-1">{skill.label} 출력물</h3>
          <button onClick={handleCopy} className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${copied ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : 'text-[#6b6e8c] border-[#1c1e2c] hover:border-[#252840]'}`}>{copied ? '복사됨' : '복사'}</button>
          <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] ml-1">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="text-[12px] text-[#b0b2cc] whitespace-pre-wrap leading-relaxed font-sans">{output.body}</pre>
        </div>
      </div>
    </div>
  )
}

// ─── 마켓 스킬 카드 ───────────────────────────────────────────
function MarketSkillCard({ skill, installed, authorId, onInstall, onLike, likedIds }) {
  const isOwn    = skill.author_id === authorId
  const isLiked  = likedIds.has(skill.id)
  const [loading, setLoading] = useState(false)

  async function handleInstall() {
    if (installed || loading) return
    setLoading(true)
    await onInstall(skill.id)
    setLoading(false)
  }

  return (
    <div className="group flex flex-col rounded-xl border border-[#1a1c28] hover:border-[#252840] bg-[#09090c] transition-all p-4 gap-3">
      {/* 헤더 */}
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: (skill.color || '#6366f1') + '20', color: skill.color || '#6366f1' }}>
          {skill.icon || '★'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[#d0d0e8] leading-tight truncate">{skill.label}</p>
          <p className="text-[10px] text-[#505272] mt-0.5 truncate">{skill.desc}</p>
        </div>
        {isOwn && (
          <span className="flex-shrink-0 text-[9px] text-[#c026d3] bg-[#c026d3]/10 border border-[#c026d3]/20 px-1.5 py-0.5 rounded-full">내 스킬</span>
        )}
      </div>

      {/* 설명 */}
      {skill.detail && (
        <p className="text-[11px] text-[#6b6e8c] leading-relaxed line-clamp-2">{skill.detail}</p>
      )}

      {/* 태그 */}
      {skill.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] text-[#505272] bg-[#13141c] border border-[#1c1e2c] px-1.5 py-0.5 rounded-full">{tag}</span>
          ))}
        </div>
      )}

      {/* 푸터 */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-[#13141c]">
        <span className="text-[10px] text-[#404060] truncate flex-1">by {skill.author_name || '익명'}</span>
        <div className="flex items-center gap-3">
          {/* 좋아요 */}
          <button onClick={() => onLike(skill.id)} className={`flex items-center gap-1 text-[10px] transition-colors ${isLiked ? 'text-red-400' : 'text-[#404060] hover:text-red-400'}`}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 13.5s-6-3.5-6-8a4 4 0 0 1 6-3.46A4 4 0 0 1 14 5.5c0 4.5-6 8-6 8z"/>
            </svg>
            {skill.like_count || 0}
          </button>
          {/* 설치 수 */}
          <span className="flex items-center gap-1 text-[10px] text-[#404060]">
            <IconDownload size={10} />
            {skill.install_count || 0}
          </span>
          {/* 설치 버튼 */}
          <button
            onClick={handleInstall}
            disabled={installed || loading}
            className={`flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
              installed ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 cursor-default'
                : 'text-[#c0c0e0] bg-[#1c1e2a] hover:bg-[#252840] border border-[#252840] hover:border-[#353760]'
            } disabled:opacity-60`}
          >
            {installed ? '설치됨' : loading ? '...' : (
              <><IconDownload size={9} /> 설치</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 스킬 공유 모달 ───────────────────────────────────────────
const CATEGORY_LABELS = {
  general: '일반', writing: '문서 작성', analysis: '분석',
  communication: '커뮤니케이션', data: '데이터', hr: 'HR / 교육',
  legal: '법무 / 계약', marketing: '마케팅', engineering: '개발 / 기술',
}

function PublishModal({ skill, onClose, onPublished }) {
  const [authorName, setAuthorName] = useState('')
  const [category, setCategory]     = useState(skill.category || 'general')
  const [tagsInput, setTagsInput]   = useState((skill.tags || []).join(', '))
  const [publishing, setPublishing] = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    window.tidy?.marketplace.getAuthor().then(a => { if (a?.authorName) setAuthorName(a.authorName) })
  }, [])

  async function handlePublish() {
    setPublishing(true)
    setError('')
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const res  = await window.tidy?.marketplace.publish({ skill: { ...skill, category, tags }, authorName })
      if (res?.error) { setError(res.error); return }
      onPublished()
    } catch (e) {
      setError(e.message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-md shadow-2xl fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#181a26]">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ background: (skill.color || '#6366f1') + '20', color: skill.color || '#6366f1' }}>{skill.icon || '★'}</span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#e0e0f0]">마켓에 공유하기</p>
            <p className="text-[11px] text-[#505272]">{skill.label}</p>
          </div>
          <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8]">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">작성자 이름</label>
            <input value={authorName} onChange={e => setAuthorName(e.target.value)} placeholder="닉네임 또는 이름"
              className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-3 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 transition-colors" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">카테고리</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-3 py-2 text-[12px] text-[#c8c8d8] focus:outline-none focus:border-[#c026d3]/40 transition-colors">
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">태그 (쉼표 구분)</label>
            <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="이메일, 분석, 태스크..."
              className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-3 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 transition-colors" />
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] border border-[#1a1c28] rounded-xl">취소</button>
          <button onClick={handlePublish} disabled={publishing}
            className="flex-[2] py-2 text-[12px] font-semibold text-white rounded-xl transition-colors disabled:opacity-40"
            style={{ background: publishing ? '#1a1c28' : '#c026d3' }}>
            {publishing ? '공유 중...' : '마켓에 공유'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 내 스킬 탭 ───────────────────────────────────────────────
const SKILL_COLORS = ['#6366f1','#0ea5e9','#8b5cf6','#3b82f6','#f59e0b','#10b981','#84cc16','#f97316','#ef4444','#c026d3','#0891b2','#65a30d']
const SKILL_ICONS  = ['★','◈','▤','✦','⇄','◉','▷','◻','◫','⊞','⊛','⧉','◆','▲','●','♦','⬟','⬡','✿','❋']

function CreateSkillModal({ skill, onClose, onSaved, onDeleted }) {
  const isEdit = !!skill
  const [tab, setTab] = useState('nl')
  const [nlDesc, setNlDesc]   = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [label, setLabel]     = useState(skill?.label || '')
  const [icon, setIcon]       = useState(skill?.icon  || '★')
  const [color, setColor]     = useState(skill?.color || '#6366f1')
  const [desc, setDesc]       = useState(skill?.desc  || '')
  const [detail, setDetail]   = useState(skill?.detail || '')
  const [systemPrompt, setSystemPrompt] = useState(skill?.systemPrompt || '')
  const [saving, setSaving]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showPublish, setShowPublish] = useState(false)

  async function handleGenerate() {
    if (!nlDesc.trim()) return
    setGenerating(true); setGenError('')
    try {
      const res = await window.tidy?.skills.generate({ description: nlDesc.trim() })
      if (res?.skill) {
        const s = res.skill
        setLabel(s.label || ''); setIcon(s.icon || '★'); setColor(s.color || '#6366f1')
        setDesc(s.desc || ''); setDetail(s.detail || ''); setSystemPrompt(s.systemPrompt || '')
        setTab('manual')
      } else { setGenError(res?.error || '생성 실패') }
    } catch (e) { setGenError(e.message) }
    finally { setGenerating(false) }
  }

  async function handleSave() {
    if (!label.trim() || !systemPrompt.trim()) return
    setSaving(true)
    try {
      await window.tidy?.skills.saveCustom({ id: skill?.id || null, label: label.trim(), icon, color, desc: desc.trim(), detail: detail.trim(), systemPrompt: systemPrompt.trim(), type: 'custom', source: 'user' })
      onSaved()
    } catch (e) { alert('저장 실패: ' + e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!skill?.id) return
    setDeleting(true)
    try { await window.tidy?.skills.deleteCustom(skill.id); onDeleted() }
    catch (e) { alert('삭제 실패: ' + e.message) }
    finally { setDeleting(false) }
  }

  const savedSkillObj = { ...skill, label, icon, color, desc, detail, systemPrompt, type: 'custom' }

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0f1018] border border-[#1c1e2a] rounded-2xl w-full max-w-lg shadow-2xl fade-in flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#181a26] flex-shrink-0">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ background: color + '20', color }}>{icon}</span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#e0e0f0]">{isEdit ? '스킬 수정' : '새 스킬 만들기'}</p>
            <p className="text-[11px] text-[#505272]">AI가 스킬을 자동으로 설계합니다</p>
          </div>
          <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] p-1 rounded">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
          </button>
        </div>
        <div className="flex border-b border-[#181a26] flex-shrink-0">
          {['nl','manual'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-colors ${tab === t ? 'text-[#c026d3] border-b-2 border-[#c026d3]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}>
              {t === 'nl' ? '✦ AI로 생성' : '✎ 직접 입력'}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {tab === 'nl' && (
            <div className="space-y-3">
              <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">어떤 스킬이 필요한가요?</label>
              <textarea value={nlDesc} onChange={e => setNlDesc(e.target.value)}
                placeholder={'예시:\n"이메일에서 핵심 요청사항과 기한을 태스크로 추출"\n"계약서 리스크 항목과 주요 조건 요약"\n"고객 피드백을 긍정/부정/개선 분류"'}
                rows={5}
                className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-3 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 resize-none leading-relaxed"
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate() }}
              />
              {genError && <p className="text-[11px] text-red-400">{genError}</p>}
              <button onClick={handleGenerate} disabled={!nlDesc.trim() || generating}
                className="w-full py-2.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40"
                style={{ background: (!nlDesc.trim() || generating) ? '#1a1c28' : '#c026d3' }}>
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2a6 6 0 1 0 6 6"/></svg>
                    AI가 스킬을 설계 중...
                  </span>
                ) : '✦ 스킬 자동 생성 (⌘+Enter)'}
              </button>
            </div>
          )}
          {tab === 'manual' && (
            <div className="space-y-3.5">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">아이콘</label>
                  <div className="flex flex-wrap gap-1 w-[136px]">
                    {SKILL_ICONS.map(ic => (
                      <button key={ic} onClick={() => setIcon(ic)}
                        className={`w-7 h-7 rounded-lg text-[13px] flex items-center justify-center transition-colors ${icon === ic ? 'ring-2 ring-[#c026d3]' : 'hover:bg-[#1a1c28]'}`}
                        style={{ color: icon === ic ? color : '#505272' }}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">색상</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_COLORS.map(c => (
                      <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/30' : 'hover:scale-110'}`} style={{ background: c }} />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-[#0a0b12] border border-[#1c1e2c]">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] flex-shrink-0" style={{ background: color + '20', color }}>{icon}</span>
                    <div>
                      <p className="text-[11px] font-medium text-[#9a9cb8]">{label || '스킬 이름'}</p>
                      <p className="text-[9px] text-[#404060]">{desc || '설명'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">스킬 이름 *</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="예: 이메일 태스크 추출"
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">짧은 설명</label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="예: 이메일에서 요청사항·기한 추출"
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">상세 설명 (선택)</label>
                <textarea value={detail} onChange={e => setDetail(e.target.value)} placeholder="스킬 소개 화면에 표시될 설명..." rows={2}
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-2 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 resize-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest mb-1.5 block">AI 지시문 (System Prompt) *</label>
                <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                  placeholder={'AI에게 전달할 지시문...\n예:\n당신은 이메일 분석 전문가입니다. 요청사항을 태스크 형태로 추출해주세요.'}
                  rows={6}
                  className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl px-4 py-3 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 resize-none leading-relaxed font-mono" />
                <p className="mt-1 text-[10px] text-[#303050]">이 내용이 Claude에게 전달됩니다</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 pb-5 pt-3 border-t border-[#181a26] flex-shrink-0">
          {isEdit && (
            <>
              {!confirmDel ? (
                <button onClick={() => setConfirmDel(true)} className="px-3 py-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-xl">삭제</button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-400">삭제?</span>
                  <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 text-[11px] bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-50">{deleting ? '...' : '확인'}</button>
                  <button onClick={() => setConfirmDel(false)} className="px-2 py-1.5 text-[11px] text-[#505272] hover:text-[#9a9cb8] rounded-lg">취소</button>
                </div>
              )}
            </>
          )}
          {!confirmDel && tab === 'manual' && label.trim() && systemPrompt.trim() && (
            <button onClick={() => setShowPublish(true)} className="px-3 py-2 text-[11px] text-[#c026d3] hover:text-[#e879f9] border border-[#c026d3]/30 hover:border-[#c026d3]/60 rounded-xl flex items-center gap-1.5">
              <IconShare size={10} /> 공유
            </button>
          )}
          {!confirmDel && (
            <>
              <button onClick={onClose} className="flex-1 py-2 text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] border border-[#1a1c28] hover:border-[#252840] rounded-xl">취소</button>
              {tab === 'manual' ? (
                <button onClick={handleSave} disabled={!label.trim() || !systemPrompt.trim() || saving}
                  className="flex-[2] py-2 text-[12px] font-semibold text-white rounded-xl disabled:opacity-40"
                  style={{ background: (!label.trim() || !systemPrompt.trim() || saving) ? '#1a1c28' : '#c026d3' }}>
                  {saving ? '저장 중...' : isEdit ? '수정 저장' : '스킬 저장'}
                </button>
              ) : (
                <button onClick={() => setTab('manual')} disabled={!label}
                  className="flex-[2] py-2 text-[12px] font-medium text-[#c026d3] border border-[#c026d3]/30 hover:border-[#c026d3]/60 rounded-xl disabled:opacity-30">
                  {label ? '결과 확인 →' : '생성 후 확인'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    {showPublish && (
      <PublishModal skill={savedSkillObj} onClose={() => setShowPublish(false)}
        onPublished={() => { setShowPublish(false); alert('마켓에 공유되었습니다! 🎉') }} />
    )}
    </>
  )
}

// ─── 내 스킬 탭 컴포넌트 ────────────────────────────────────────
function MySkillsTab({ customSkills, onRefresh }) {
  const [activeSkill, setActiveSkill]       = useState(null)
  const [editingSkill, setEditingSkill]     = useState(null)
  const [showCreate, setShowCreate]         = useState(false)
  const [publishTarget, setPublishTarget]   = useState(null)
  const [deletingId, setDeletingId]         = useState(null)
  const [outputs, setOutputs]               = useState([])
  const [loadingOutputs, setLoadingOutputs] = useState(true)
  const [viewingOutput, setViewingOutput]   = useState(null)
  const [filterSkill, setFilterSkill]       = useState('all')
  const [searchQ, setSearchQ]               = useState('')
  const [hiddenSkills, setHiddenSkills]     = useState(new Set())  // 숨긴 기본 스킬 ID
  const [editMode, setEditMode]             = useState(false)      // 숨기기 편집 모드

  const allSkills = [...AI_SKILLS, ...NLM_SKILLS]
  const skillCounts = {}
  for (const o of outputs) skillCounts[o.skill_id] = (skillCounts[o.skill_id] || 0) + 1

  const loadOutputs = useCallback(async () => {
    try {
      setLoadingOutputs(true)
      const data = await window.tidy?.skills.getOutputs()
      if (Array.isArray(data)) setOutputs(data)
    } catch {} finally { setLoadingOutputs(false) }
  }, [])

  useEffect(() => { loadOutputs() }, [loadOutputs])

  // 숨긴 스킬 목록 로드
  useEffect(() => {
    window.tidy?.settings.get().then(s => {
      if (Array.isArray(s?.hiddenSkills)) setHiddenSkills(new Set(s.hiddenSkills))
    }).catch(() => {})
  }, [])

  async function toggleHidden(skillId) {
    const next = new Set(hiddenSkills)
    if (next.has(skillId)) next.delete(skillId)
    else next.add(skillId)
    setHiddenSkills(next)
    await window.tidy?.settings.save({ hiddenSkills: [...next] })
  }

  async function handleDeleteCustomSkill(id) {
    try {
      await window.tidy?.skills.deleteCustom(id)
      setDeletingId(null)
      await onRefresh()
    } catch (e) {
      alert('삭제 실패: ' + e.message)
    }
  }

  const filtered = outputs.filter(o => {
    if (filterSkill !== 'all' && o.skill_id !== filterSkill) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!(o.skill_label?.toLowerCase().includes(q) || o.body?.toLowerCase().includes(q))) return false
    }
    return true
  })

  async function handleDelete(id) {
    await window.tidy?.skills.deleteOutput(id)
    setOutputs(prev => prev.filter(o => o.id !== id))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 빌트인 스킬 */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-[#13141c]">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-[13px] font-semibold text-[#e0e0f0]">기본 스킬</h2>
            <p className="text-[11px] text-[#505272] mt-0.5">
              AI · NLM 내장 스킬
              {hiddenSkills.size > 0 && !editMode && (
                <span className="ml-1.5 text-[#404060]">({hiddenSkills.size}개 숨김)</span>
              )}
            </p>
          </div>
          <button
            onClick={() => setEditMode(m => !m)}
            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors ${
              editMode
                ? 'text-[#e0e0f0] bg-[#1a1c28] border-[#252840]'
                : 'text-[#505272] hover:text-[#9a9cb8] border-transparent hover:border-[#1a1c28]'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {editMode
                ? <path d="M2 2l12 12M14 2L2 14"/>
                : <><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></>
              }
            </svg>
            {editMode ? '완료' : '숨기기 편집'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
          {allSkills.map(skill => {
            const hidden = hiddenSkills.has(skill.id)
            if (!editMode && hidden) return null  // 편집 모드 아닐 땐 숨긴 스킬 미표시
            return (
              <div key={skill.id} className="relative group">
                <button
                  onClick={() => editMode ? toggleHidden(skill.id) : setActiveSkill(skill)}
                  className={`w-full flex flex-col items-start gap-1.5 p-3 rounded-xl border transition-all text-left ${
                    editMode
                      ? hidden
                        ? 'border-[#2a2a2a] bg-[#0a0a0a] opacity-40 hover:opacity-60'
                        : 'border-[#1a2540] bg-[#09090c] hover:border-[#2a3560] ring-1 ring-inset ring-[#1a2540]'
                      : 'border-[#1a1c28] hover:border-[#252840] bg-[#09090c] hover:bg-[#0d0e14]'
                  }`}
                >
                  {/* 편집 모드: 숨김 여부 인디케이터 */}
                  {editMode && (
                    <div className={`absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                      hidden
                        ? 'bg-transparent border-[#404040]'
                        : 'bg-[#6366f1] border-[#6366f1]'
                    }`}>
                      {!hidden && (
                        <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 5l2.5 2.5L8 3"/>
                        </svg>
                      )}
                    </div>
                  )}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-transform group-hover:scale-105"
                    style={{ background: skill.color + '22', color: skill.color }}>{skill.icon}</div>
                  <div>
                    <p className="text-[11px] font-medium text-[#c8c8d8] leading-none">{skill.label}</p>
                    {!editMode && skillCounts[skill.id] > 0 && (
                      <p className="text-[9px] text-[#4a4c68] mt-1">{skillCounts[skill.id]}회</p>
                    )}
                    {editMode && (
                      <p className="text-[9px] mt-1" style={{ color: hidden ? '#404040' : '#6366f1' }}>
                        {hidden ? '숨김' : '표시'}
                      </p>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>
        {editMode && hiddenSkills.size > 0 && (
          <button
            onClick={async () => {
              setHiddenSkills(new Set())
              await window.tidy?.settings.save({ hiddenSkills: [] })
            }}
            className="mt-2 text-[10px] text-[#505272] hover:text-[#9a9cb8] transition-colors"
          >
            모두 표시로 초기화
          </button>
        )}
      </div>

      {/* 커스텀 스킬 */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-[#13141c]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[#e0e0f0]">내 커스텀 스킬</h2>
            <p className="text-[11px] text-[#505272] mt-0.5">직접 만든 AI 스킬</p>
          </div>
          <button onClick={() => { setEditingSkill(null); setShowCreate(true) }}
            className="flex items-center gap-1.5 text-[11px] text-[#c026d3] hover:text-[#e879f9] border border-[#c026d3]/30 hover:border-[#c026d3]/60 px-3 py-1.5 rounded-lg transition-colors">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
            스킬 만들기
          </button>
        </div>
        {customSkills.length === 0 ? (
          <p className="text-[11px] text-[#303050] py-2">아직 만든 스킬이 없습니다. "스킬 만들기"를 눌러 AI로 스킬을 생성해보세요.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
            {customSkills.map(skill => (
              <div key={skill.id} className="relative group">
                {/* 삭제 확인 오버레이 */}
                {deletingId === skill.id ? (
                  <div className="w-full h-full absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-xl border border-red-500/40 bg-[#1a0808] p-2">
                    <p className="text-[9px] text-red-400 text-center leading-tight">삭제할까요?</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDeleteCustomSkill(skill.id)}
                        className="px-2 py-1 text-[9px] font-semibold bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors"
                      >삭제</button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-1 text-[9px] text-[#9a9cb8] hover:text-white bg-[#1c1e2a] hover:bg-[#252840] rounded-md transition-colors"
                      >취소</button>
                    </div>
                  </div>
                ) : null}

                <button
                  onClick={() => deletingId !== skill.id && setActiveSkill(skill)}
                  className={`w-full flex flex-col items-start gap-1.5 p-3 rounded-xl border transition-all text-left ${
                    deletingId === skill.id
                      ? 'opacity-0 pointer-events-none'
                      : 'border-[#2a1c3a] hover:border-[#3a2060] bg-[#0d0912] hover:bg-[#110c16]'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: (skill.color || '#c026d3') + '22', color: skill.color || '#c026d3' }}>{skill.icon || '★'}</div>
                  <div>
                    <p className="text-[11px] font-medium text-[#c8c8d8] leading-none truncate max-w-[72px]">{skill.label}</p>
                    <p className="text-[9px] text-[#505272] mt-0.5">커스텀</p>
                  </div>
                </button>

                {/* 호버 액션 버튼 (수정 / 삭제) */}
                {deletingId !== skill.id && (
                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-all">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingSkill(skill); setShowCreate(true) }}
                      title="수정"
                      className="p-1 rounded-md bg-[#1a1c28] text-[#c026d3] hover:bg-[#252840] hover:text-[#e879f9] transition-colors"
                    >
                      <IconEdit size={9} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingId(skill.id) }}
                      title="삭제"
                      className="p-1 rounded-md bg-[#1a1c28] text-[#6b3040] hover:bg-[#2a1020] hover:text-red-400 transition-colors"
                    >
                      <IconTrash size={9} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 출력물 보관함 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#13141c] flex-shrink-0">
          <h3 className="text-[12px] font-semibold text-[#8082a0] uppercase tracking-wide">출력물 보관함</h3>
          <span className="text-[10px] text-[#3a3c50] bg-[#13141c] px-1.5 py-0.5 rounded-full">{outputs.length}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button onClick={() => setFilterSkill('all')} className={`text-[10px] px-2 py-1 rounded-md ${filterSkill === 'all' ? 'bg-[#1c1e2a] text-[#c8c8d8]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}>전체</button>
            {allSkills.filter(s => skillCounts[s.id] > 0).map(s => (
              <button key={s.id} onClick={() => setFilterSkill(f => f === s.id ? 'all' : s.id)}
                className={`text-[10px] px-2 py-1 rounded-md ${filterSkill === s.id ? 'bg-[#1c1e2a] text-[#c8c8d8]' : 'text-[#505272] hover:text-[#9a9cb8]'}`}>{s.label}</button>
            ))}
          </div>
          <div className="relative">
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="검색…"
              className="w-32 bg-[#0a0b12] border border-[#1c1e2c] rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-[#c0c0d8] placeholder-[#3a3c58] focus:outline-none" />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-[#3a3c58]" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4 4"/>
            </svg>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingOutputs ? (
            <div className="flex justify-center py-12"><div className="flex gap-1.5">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#252840] animate-pulse" style={{ animationDelay: `${i*150}ms` }} />)}</div></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-[13px] text-[#3a3c58]">{outputs.length === 0 ? '아직 출력물이 없습니다' : '검색 결과 없음'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(o => <OutputCard key={o.id} output={o} onDelete={handleDelete} onView={setViewingOutput} />)}
            </div>
          )}
        </div>
      </div>

      {activeSkill && (
        <SkillRunner skill={activeSkill} onClose={() => { setActiveSkill(null); loadOutputs() }} />
      )}
      {viewingOutput && <OutputViewer output={viewingOutput} onClose={() => setViewingOutput(null)} />}
      {showCreate && (
        <CreateSkillModal
          skill={editingSkill}
          onClose={() => { setShowCreate(false); setEditingSkill(null) }}
          onSaved={async () => { await onRefresh(); setShowCreate(false); setEditingSkill(null) }}
          onDeleted={async () => { await onRefresh(); setShowCreate(false); setEditingSkill(null) }}
        />
      )}
    </div>
  )
}

// ─── 마켓플레이스 탭 컴포넌트 ────────────────────────────────────
function MarketplaceTab({ installedMarketIds, onInstalled }) {
  const [skills, setSkills]           = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [category, setCategory]       = useState('all')
  const [sort, setSort]               = useState('popular')
  const [q, setQ]                     = useState('')
  const [page, setPage]               = useState(1)
  const [totalPages, setTotalPages]   = useState(1)
  const [authorId, setAuthorId]       = useState('')
  const [likedIds, setLikedIds]       = useState(new Set())
  const [serverStatus, setServerStatus] = useState(null) // null=unknown, true=ok, false=offline
  const searchTimer = useRef(null)

  // 작성자 ID 로드
  useEffect(() => {
    window.tidy?.marketplace.getAuthor().then(a => { if (a?.authorId) setAuthorId(a.authorId) })
  }, [])

  // 목록 로드
  const loadSkills = useCallback(async (params = {}) => {
    setLoading(true)
    setError('')
    try {
      const res = await window.tidy?.marketplace.list({
        q: params.q ?? q,
        category: params.category ?? category,
        sort: params.sort ?? sort,
        page: params.page ?? page,
      })
      if (res?.error) {
        setServerStatus(false)
        setError(res.error)
        setSkills([])
      } else {
        setServerStatus(true)
        setSkills(res.skills || [])
        setTotalPages(res.pages || 1)
      }
    } catch (e) {
      setServerStatus(false)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, category, sort, page])

  useEffect(() => { loadSkills() }, [category, sort, page])

  function handleSearch(val) {
    setQ(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); loadSkills({ q: val, page: 1 }) }, 400)
  }

  async function handleInstall(id) {
    const res = await window.tidy?.marketplace.install(id)
    if (res?.success) {
      onInstalled(res.skill)
      // 목록에서 install_count 업데이트
      setSkills(prev => prev.map(s => s.id === id ? { ...s, install_count: (s.install_count || 0) + 1 } : s))
    } else {
      alert(res?.error || '설치 실패')
    }
  }

  async function handleLike(id) {
    const res = await window.tidy?.marketplace.like(id)
    if (res?.success) {
      setLikedIds(prev => {
        const next = new Set(prev)
        if (res.liked) next.add(id); else next.delete(id)
        return next
      })
      setSkills(prev => prev.map(s => s.id === id ? { ...s, like_count: res.like_count } : s))
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 헤더 & 검색 */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-[#13141c]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[13px] font-semibold text-[#e0e0f0]">스킬 마켓플레이스</h2>
            <p className="text-[11px] text-[#505272] mt-0.5">커뮤니티가 만든 스킬을 탐색하고 설치하세요</p>
          </div>
          {serverStatus === false && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-full">
              서버 오프라인
            </span>
          )}
          {serverStatus === true && (
            <span className="text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-full">
              ● 연결됨
            </span>
          )}
        </div>

        {/* 검색 */}
        <div className="relative mb-3">
          <input value={q} onChange={e => handleSearch(e.target.value)} placeholder="스킬 검색..."
            className="w-full bg-[#09090c] border border-[#1a1c28] rounded-xl pl-9 pr-4 py-2.5 text-[12px] text-[#c8c8d8] placeholder-[#2a2c48] focus:outline-none focus:border-[#c026d3]/40 transition-colors" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#404060]" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4 4"/>
          </svg>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-1 flex-wrap mb-2">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { setCategory(cat.id); setPage(1); loadSkills({ category: cat.id, page: 1 }) }}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${category === cat.id ? 'bg-[#c026d3]/20 text-[#e879f9] border border-[#c026d3]/30' : 'text-[#505272] hover:text-[#9a9cb8] border border-transparent hover:border-[#1c1e2c]'}`}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* 정렬 */}
        <div className="flex gap-1">
          {SORT_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => { setSort(opt.id); setPage(1); loadSkills({ sort: opt.id, page: 1 }) }}
              className={`text-[10px] px-2.5 py-1 rounded-lg transition-colors ${sort === opt.id ? 'bg-[#1c1e2a] text-[#c8c8d8]' : 'text-[#404060] hover:text-[#9a9cb8]'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 스킬 목록 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex gap-1.5">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#c026d3]/40 animate-pulse" style={{ animationDelay: `${i*150}ms` }} />)}</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1c28] flex items-center justify-center text-2xl">🔌</div>
            <div>
              <p className="text-[13px] text-[#6b6e8c] font-medium">마켓플레이스 서버에 연결할 수 없습니다</p>
              <p className="text-[11px] text-[#3a3c50] mt-1">서버를 먼저 실행하세요: <code className="text-[#c026d3]">cd server && npm start</code></p>
            </div>
            <button onClick={() => loadSkills()} className="text-[11px] text-[#c026d3] hover:text-[#e879f9] border border-[#c026d3]/30 hover:border-[#c026d3]/60 px-4 py-2 rounded-lg transition-colors">
              다시 시도
            </button>
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[13px] text-[#3a3c58]">스킬이 없습니다</p>
            <p className="text-[11px] text-[#2a2c40] mt-1">먼저 커스텀 스킬을 만들고 공유해보세요</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
              {skills.map(skill => (
                <MarketSkillCard
                  key={skill.id}
                  skill={skill}
                  installed={installedMarketIds.has(skill.id)}
                  authorId={authorId}
                  onInstall={handleInstall}
                  onLike={handleLike}
                  likedIds={likedIds}
                />
              ))}
            </div>
            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
                  className="px-3 py-1.5 text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] border border-[#1a1c28] hover:border-[#252840] rounded-lg disabled:opacity-30">← 이전</button>
                <span className="px-3 py-1.5 text-[11px] text-[#505272]">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
                  className="px-3 py-1.5 text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] border border-[#1a1c28] hover:border-[#252840] rounded-lg disabled:opacity-30">다음 →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Skills 메인 페이지 ──────────────────────────────────────
export default function Skills() {
  const [activeTab, setActiveTab]           = useState('my')   // 'my' | 'market'
  const [customSkills, setCustomSkills]     = useState([])
  const [installedMarketIds, setInstalledMarketIds] = useState(new Set())

  async function loadCustomSkills() {
    const list = await window.tidy?.skills.listCustom?.() || []
    setCustomSkills(list)
    setCustomSkillsCache(list)
    // market 설치 ID 추적
    const marketIds = new Set(list.filter(s => s.marketId).map(s => s.marketId))
    setInstalledMarketIds(marketIds)
  }

  useEffect(() => { loadCustomSkills() }, [])

  function handleMarketInstalled(newSkill) {
    setInstalledMarketIds(prev => {
      const next = new Set(prev)
      if (newSkill?.marketId) next.add(newSkill.marketId)
      return next
    })
    loadCustomSkills()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* 탭 바 */}
      <div className="flex-shrink-0 flex border-b border-[#13141c]">
        <button
          onClick={() => setActiveTab('my')}
          className={`flex items-center gap-2 px-5 py-3.5 text-[12px] font-medium transition-colors border-b-2 ${
            activeTab === 'my' ? 'text-[#e0e0f0] border-[#c026d3]' : 'text-[#505272] hover:text-[#9a9cb8] border-transparent'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
          </svg>
          내 스킬
          {customSkills.length > 0 && (
            <span className="text-[9px] bg-[#c026d3]/20 text-[#e879f9] px-1.5 py-0.5 rounded-full">{customSkills.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('market')}
          className={`flex items-center gap-2 px-5 py-3.5 text-[12px] font-medium transition-colors border-b-2 ${
            activeTab === 'market' ? 'text-[#e0e0f0] border-[#c026d3]' : 'text-[#505272] hover:text-[#9a9cb8] border-transparent'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 2h2l1 7h8l1-5H5"/><circle cx="9" cy="13" r="1"/><circle cx="13" cy="13" r="1"/>
          </svg>
          마켓플레이스
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'my' && (
          <MySkillsTab customSkills={customSkills} onRefresh={loadCustomSkills} />
        )}
        {activeTab === 'market' && (
          <MarketplaceTab installedMarketIds={installedMarketIds} onInstalled={handleMarketInstalled} />
        )}
      </div>
    </div>
  )
}
