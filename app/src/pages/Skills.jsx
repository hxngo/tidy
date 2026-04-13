import { useState, useEffect, useCallback, useRef } from 'react'
import SkillPanel, { SKILLS, skillById } from '../components/SkillPanel.jsx'

// ─── 출력물 카드 ──────────────────────────────────────────────
function OutputCard({ output, onDelete, onView }) {
  const skill = skillById(output.skill_id)
  const date = output.created_at
    ? new Date(output.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  // body에서 실제 내용만 추출 (# 제목 이후 ---  이후)
  const preview = (() => {
    if (!output.body) return ''
    const after = output.body.replace(/^#.+\n/, '').replace(/^>.*\n/, '').replace(/^---\n/, '')
    return after.trim().slice(0, 120)
  })()

  return (
    <div className="group rounded-xl border border-[#1a1c28] hover:border-[#252840] bg-[#09090c] transition-all fade-in">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] flex-shrink-0"
            style={{ background: skill.color + '22', color: skill.color }}
          >
            {skill.icon}
          </div>
          <span className="text-[11px] font-medium text-[#9a9cb8]">{skill.label}</span>
          <div className="flex-1" />
          <span className="text-[10px] text-[#4a4c68]">{date}</span>
        </div>

        {/* Preview */}
        <p className="text-[12px] text-[#7a7c98] leading-relaxed line-clamp-3 mb-3">
          {preview || '내용 없음'}
        </p>

        {/* Footer */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onView?.(output)}
            className="flex items-center gap-1.5 text-[11px] text-[#6b6e8c] hover:text-[#e0e0f0] px-2.5 py-1 rounded-lg hover:bg-[#14151e] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6.5"/>
              <path d="M5 8h6M8 5v6"/>
            </svg>
            보기
          </button>
          <button
            onClick={() => {
              const content = output.body || ''
              navigator.clipboard.writeText(content)
            }}
            className="flex items-center gap-1.5 text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] px-2.5 py-1 rounded-lg hover:bg-[#14151e] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="5" width="9" height="9" rx="1"/>
              <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/>
            </svg>
            복사
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onDelete?.(output.id)}
            className="text-[10px] text-[#4a3040] hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/5 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 스킬 실행 모달 ───────────────────────────────────────────
function SkillRunner({ skill, onClose }) {
  const [input, setInput] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [runInput, setRunInput] = useState('')
  // Option B: 번역 스킬은 소개 화면 먼저
  const [showIntro, setShowIntro] = useState(skill.id === 'translate')

  function handleRun() {
    if (!input.trim()) return
    setRunInput(input.trim())
    setPanelOpen(true)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-[#0d0e16] border border-[#1c1e2c] rounded-2xl w-full max-w-xl shadow-2xl fade-in"
          onClick={e => e.stopPropagation()}
        >

          {/* ── Option B: 번역 소개 화면 ── */}
          {showIntro ? (
            <>
              {/* 닫기 버튼 */}
              <div className="flex justify-end px-4 pt-4">
                <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] transition-colors">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l12 12M14 2L2 14"/>
                  </svg>
                </button>
              </div>

              {/* 아이콘 + 이름 */}
              <div className="flex flex-col items-center pt-2 pb-6 px-8 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-4"
                  style={{ background: skill.color + '20', color: skill.color }}>
                  {skill.icon}
                </div>
                <h2 className="text-[16px] font-semibold text-[#e0e0f0] mb-1">{skill.label}</h2>
                <p className="text-[12px] text-[#6b6e8c] leading-relaxed">{skill.detail}</p>
              </div>

              {/* 사용 예시 */}
              {skill.examples && (
                <div className="mx-6 mb-5 p-4 rounded-xl bg-[#0a0b12] border border-[#1c1e2c]">
                  <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-wide mb-2.5">이런 경우에 사용하세요</p>
                  <div className="flex flex-col gap-1.5">
                    {skill.examples.map((ex, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: skill.color }} />
                        <span className="text-[11px] text-[#9a9cb8]">{ex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 팁 */}
              {skill.tip && (
                <div className="mx-6 mb-5 flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: skill.color + '0d', border: `1px solid ${skill.color}20` }}>
                  <span className="text-[10px] mt-0.5" style={{ color: skill.color }}>💡</span>
                  <p className="text-[11px] leading-relaxed" style={{ color: skill.color + 'cc' }}>{skill.tip}</p>
                </div>
              )}

              {/* 시작하기 버튼 */}
              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowIntro(false)}
                  className="w-full text-[13px] font-medium text-white py-2.5 rounded-xl transition-all"
                  style={{ background: skill.color }}
                >
                  시작하기
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ── 기본 입력 화면 ── */}
              {/* Header */}
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#1c1e2c]">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: skill.color + '22', color: skill.color }}
                >
                  {skill.icon}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#e0e0f0]">{skill.label}</p>
                  <p className="text-[11px] text-[#505272] mt-0.5">{skill.desc}</p>
                </div>
                <div className="flex-1" />
                {/* 번역은 소개 화면으로 돌아가기 버튼 */}
                {skill.id === 'translate' && (
                  <button
                    onClick={() => setShowIntro(true)}
                    className="text-[10px] text-[#505272] hover:text-[#9a9cb8] px-2 py-1 rounded-lg hover:bg-[#14151e] transition-colors mr-1"
                  >
                    설명 보기
                  </button>
                )}
                <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] transition-colors">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l12 12M14 2L2 14"/>
                  </svg>
                </button>
              </div>

              {/* Input */}
              <div className="px-5 py-4">
                <label className="text-[11px] text-[#505272] font-medium mb-2 block">입력 내용</label>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={`${skill.label}할 내용을 입력하거나 붙여넣기…`}
                  className="w-full h-40 bg-[#0a0b12] border border-[#1c1e2c] rounded-xl px-3.5 py-3 text-[12px] text-[#d0d0e4] placeholder-[#3a3c58] focus:outline-none focus:border-[#3a3c6a] resize-none"
                  autoFocus
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleRun()
                  }}
                />
                <p className="text-[10px] text-[#3a3c50] mt-1.5">⌘↵ 로 실행</p>
              </div>

              {/* Footer */}
              <div className="px-5 pb-5 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="text-[12px] text-[#6b6e8c] hover:text-[#9a9cb8] px-4 py-2 rounded-xl hover:bg-[#14151e] transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleRun}
                  disabled={!input.trim()}
                  className="text-[12px] font-medium text-white px-5 py-2 rounded-xl transition-all disabled:opacity-30"
                  style={{ background: skill.color }}
                >
                  실행
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Output panel */}
      <SkillPanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); onClose() }}
        skillId={skill.id}
        input={runInput}
      />
    </>
  )
}

// ─── 출력물 뷰어 모달 ────────────────────────────────────────
function OutputViewer({ output, onClose }) {
  const skill = skillById(output.skill_id)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(output.body || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0e16] border border-[#1c1e2c] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#1c1e2c] flex-shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: skill.color + '22', color: skill.color }}
          >
            {skill.icon}
          </div>
          <h3 className="text-[13px] font-semibold text-[#e0e0f0] flex-1">{skill.label} 출력물</h3>
          <button onClick={handleCopy} className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
            copied ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : 'text-[#6b6e8c] border-[#1c1e2c] hover:border-[#252840]'
          }`}>
            {copied ? '복사됨' : '복사'}
          </button>
          <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] ml-1">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="text-[12px] text-[#b0b2cc] whitespace-pre-wrap leading-relaxed font-sans">
            {output.body}
          </pre>
        </div>
      </div>
    </div>
  )
}

// ─── Skills 메인 페이지 ──────────────────────────────────────
export default function Skills() {
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSkill, setActiveSkill] = useState(null)   // 실행 모달
  const [viewingOutput, setViewingOutput] = useState(null) // 출력물 뷰어
  const [filterSkill, setFilterSkill] = useState('all')
  const [searchQ, setSearchQ] = useState('')

  const loadOutputs = useCallback(async () => {
    try {
      const data = await window.tidy?.skills.getOutputs()
      if (Array.isArray(data)) setOutputs(data)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOutputs() }, [loadOutputs])

  async function handleDelete(id) {
    await window.tidy?.skills.deleteOutput(id)
    setOutputs(prev => prev.filter(o => o.id !== id))
  }

  // 필터링
  const filtered = outputs.filter(o => {
    if (filterSkill !== 'all' && o.skill_id !== filterSkill) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!(o.skill_label?.toLowerCase().includes(q) || o.body?.toLowerCase().includes(q))) return false
    }
    return true
  })

  // 스킬별 count
  const skillCounts = {}
  for (const o of outputs) {
    skillCounts[o.skill_id] = (skillCounts[o.skill_id] || 0) + 1
  }

  // Option A: 요약 스킬 호버 툴팁
  const [tooltipSkillId, setTooltipSkillId] = useState(null)
  const tooltipTimer = useRef(null)

  function handleSkillMouseEnter(skill) {
    if (skill.id !== 'summary') return
    tooltipTimer.current = setTimeout(() => setTooltipSkillId(skill.id), 300)
  }
  function handleSkillMouseLeave() {
    clearTimeout(tooltipTimer.current)
    setTooltipSkillId(null)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* ── 상단: 스킬 그리드 ─────────────────────────────── */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-[#13141c]">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-[#e0e0f0] tracking-[-0.01em]">스킬</h2>
            <p className="text-[11px] text-[#505272] mt-0.5">AI 스킬을 실행해 문서·보고서·번역을 생성합니다</p>
          </div>
        </div>

        {/* Skill cards */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {SKILLS.map(skill => (
            <div key={skill.id} className="relative">
              <button
                onClick={() => setActiveSkill(skill)}
                onMouseEnter={() => handleSkillMouseEnter(skill)}
                onMouseLeave={handleSkillMouseLeave}
                className="group w-full flex flex-col items-start gap-1.5 p-3 rounded-xl border border-[#1a1c28] hover:border-[#252840] bg-[#09090c] hover:bg-[#0d0e14] transition-all text-left"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-transform group-hover:scale-110"
                  style={{ background: skill.color + '22', color: skill.color }}
                >
                  {skill.icon}
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#c8c8d8] leading-none">{skill.label}</p>
                  <p className="text-[10px] text-[#505272] mt-1 leading-snug line-clamp-2">{skill.desc}</p>
                </div>
                {skillCounts[skill.id] > 0 && (
                  <span className="text-[9px] text-[#4a4c68] font-medium">{skillCounts[skill.id]}회 사용</span>
                )}
              </button>

              {/* Option A: 요약 스킬 호버 툴팁 */}
              {tooltipSkillId === skill.id && skill.detail && (
                <div
                  className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded-xl border shadow-2xl pointer-events-none fade-in"
                  style={{ background: '#0d0e18', borderColor: skill.color + '30' }}
                >
                  {/* 말풍선 꼬리 */}
                  <div className="absolute -bottom-1.5 left-5 w-3 h-3 rotate-45 border-b border-r"
                    style={{ background: '#0d0e18', borderColor: skill.color + '30' }} />

                  <div className="p-3">
                    {/* 헤더 */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px]"
                        style={{ background: skill.color + '20', color: skill.color }}>
                        {skill.icon}
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: skill.color }}>{skill.label}</span>
                    </div>
                    {/* 설명 */}
                    <p className="text-[11px] text-[#8082a0] leading-relaxed">{skill.detail}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 하단: 출력물 보관함 ──────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Archive header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#13141c] flex-shrink-0">
          <h3 className="text-[12px] font-semibold text-[#8082a0] tracking-wide uppercase">출력물 보관함</h3>
          <span className="text-[10px] text-[#3a3c50] bg-[#13141c] px-1.5 py-0.5 rounded-full">
            {outputs.length}
          </span>

          <div className="flex-1" />

          {/* Filter by skill */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterSkill('all')}
              className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                filterSkill === 'all' ? 'bg-[#1c1e2a] text-[#c8c8d8]' : 'text-[#505272] hover:text-[#9a9cb8]'
              }`}
            >
              전체
            </button>
            {SKILLS.filter(s => skillCounts[s.id] > 0).map(s => (
              <button
                key={s.id}
                onClick={() => setFilterSkill(f => f === s.id ? 'all' : s.id)}
                className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
                  filterSkill === s.id ? 'bg-[#1c1e2a] text-[#c8c8d8]' : 'text-[#505272] hover:text-[#9a9cb8]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="검색…"
              className="w-32 bg-[#0a0b12] border border-[#1c1e2c] rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-[#c0c0d8] placeholder-[#3a3c58] focus:outline-none focus:border-[#3a3c6a] transition-colors"
            />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-[#3a3c58]" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="6.5" r="4.5"/>
              <path d="M10 10l4 4"/>
            </svg>
          </div>
        </div>

        {/* Output list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#252840] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#0d0e18] border border-[#1c1e2c] flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3a3c58" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="12" x2="12" y2="18"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </div>
              <p className="text-[13px] text-[#3a3c58] font-medium">
                {outputs.length === 0 ? '아직 생성된 출력물이 없습니다' : '검색 결과 없음'}
              </p>
              <p className="text-[11px] text-[#2a2c40] mt-1">
                {outputs.length === 0
                  ? '위 스킬을 클릭해 첫 번째 출력물을 생성해보세요'
                  : '다른 키워드로 검색해보세요'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(output => (
                <OutputCard
                  key={output.id}
                  output={output}
                  onDelete={handleDelete}
                  onView={setViewingOutput}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skill runner modal */}
      {activeSkill && (
        <SkillRunner
          skill={activeSkill}
          onClose={() => { setActiveSkill(null); loadOutputs() }}
        />
      )}

      {/* Output viewer modal */}
      {viewingOutput && (
        <OutputViewer
          output={viewingOutput}
          onClose={() => setViewingOutput(null)}
        />
      )}
    </div>
  )
}
