import { useState } from 'react'
import SkillPanel from './SkillPanel.jsx'

// 인박스 카드 퀵 스킬 (가장 자주 쓰는 4개)
const QUICK_SKILLS = [
  { id: 'summary',   label: '요약',   color: '#6366f1' },
  { id: 'translate', label: '번역',   color: '#0ea5e9' },
  { id: 'minutes',   label: '회의록', color: '#8b5cf6' },
  { id: 'report',    label: '보고서', color: '#3b82f6' },
]

// ─── Category system ─────────────────────────────────────────────────────────

export const CATEGORY_DESC = {
  업무: '프로젝트·계약·개발 등 직접 수행 업무',
  미팅: '회의·약속·인터뷰 등 대면/비대면 미팅',
  여행: '항공·출장·숙박·교통 관련',
  운영: '결제·계정·행정 처리 등 운영 업무',
  정보: '공지·뉴스레터·참고자료 등',
}

const CATEGORY_ACCENT = {
  업무: '#3b82f6',
  미팅: '#8b5cf6',
  운영: '#f59e0b',
  여행: '#10b981',
  정보: '#475569',
}

const CATEGORY_BADGE = {
  업무: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  미팅: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  운영: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  여행: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  정보: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
}

// ─── Source icons (SVG) ───────────────────────────────────────────────────────

const SOURCE_SVG = {
  gmail: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  slack: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M5.5 2a1.5 1.5 0 000 3H7V3.5A1.5 1.5 0 005.5 2z"/>
      <path d="M5.5 7H2a1.5 1.5 0 000 3h3.5V7z"/>
      <path d="M14 8.5A1.5 1.5 0 0010.5 7H9v3h1.5A1.5 1.5 0 0014 8.5z"/>
      <path d="M8.5 14A1.5 1.5 0 007 12.5V11h3v1.5A1.5 1.5 0 008.5 14z"/>
    </svg>
  ),
  kakao: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="7" rx="6.5" ry="5.5" fill="currentColor" opacity="0.2"/>
      <ellipse cx="8" cy="7" rx="6.5" ry="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 7.5l1.5 1.5 1-1.5 1.5 2L11 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  imessage: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 9.5a5.5 5.5 0 01-8.41 4.67L2 15l.83-3.09A5.5 5.5 0 118 2a5.5 5.5 0 015.5 5.5v2z"/>
    </svg>
  ),
  file: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1z"/>
      <path d="M9 1v5h5"/>
      <path d="M5 9h6M5 12h4"/>
    </svg>
  ),
  meeting: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="4" r="2"/>
      <path d="M1 13c0-3 3-5 7-5s7 2 7 5"/>
      <path d="M10 8.5c2 .5 4 2 4 4.5"/>
    </svg>
  ),
  default: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M8 5v4M8 11v1"/>
    </svg>
  ),
}

function getSourceSvg(source = '') {
  const s = source.toLowerCase()
  if (s.includes('gmail')) return SOURCE_SVG.gmail
  if (s.includes('slack')) return SOURCE_SVG.slack
  if (s.includes('kakao')) return SOURCE_SVG.kakao
  if (s.includes('imessage')) return SOURCE_SVG.imessage
  if (s.includes('file') || s.includes('manual') || s.includes('gdrive')) return SOURCE_SVG.file
  if (s.includes('meeting')) return SOURCE_SVG.meeting
  return SOURCE_SVG.default
}

// ─── Action icons ─────────────────────────────────────────────────────────────

const IcVault = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5L8 1.5z"/>
  </svg>
)
const IcReply = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4L1 8l5 4"/>
    <path d="M1 8h9a5 5 0 015 5"/>
  </svg>
)
const IcTrash = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
  </svg>
)
const IcCheck = (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8l4 4 8-7"/>
  </svg>
)

function canReply(source = '') {
  return source === 'gmail' || source === 'slack'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InboxCard({ item, sourceConfig, onMarkDone, onRestore, onDelete, onClick }) {
  const [checkedItems, setCheckedItems] = useState({})
  const [actionsExpanded, setActionsExpanded] = useState(false)
  const [skillPanel, setSkillPanel] = useState({ open: false, skillId: null })
  // category가 'app'/'앱'이면 실제 앱 이름으로 교체
  const isAppCategory = item.category === 'app' || item.category === '앱'
  const appName = isAppCategory
    ? (item.bundle_id
        ? item.bundle_id.split('.').pop().replace(/Mac$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
        : item.source || '앱')
    : null
  const displayCategory = isAppCategory ? (appName || '앱') : (item.category || '기타')

  const accentColor = CATEGORY_ACCENT[item.category] || (isAppCategory ? '#0ea5e9' : '#475569')
  const badgeStyle  = CATEGORY_BADGE[item.category]  || (isAppCategory ? 'text-sky-400 bg-sky-500/10 border-sky-500/20' : CATEGORY_BADGE['정보'])
  const isDone = item.status === 'done'
  const isNew  = item.status === 'new'

  const people      = Array.isArray(item.people)       ? item.people       : []
  const actionItems = Array.isArray(item.action_items) ? item.action_items : []

  const sourceLabel = sourceConfig?.label || item.source?.split('.').pop() || '알림'

  return (
  <>
    <div
      className={`group relative rounded-xl overflow-hidden border transition-all cursor-pointer fade-in ${
        isDone
          ? 'border-[#1a1c28]'
          : `border-[#1a1c28] hover:border-[#252840] ${isNew ? 'ring-1 ring-white/10' : ''}`
      }`}
      style={{ background: 'var(--card-bg)' }}
      onClick={onClick}
    >
      {/* Left category accent strip */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[2.5px] rounded-full"
        style={{ background: accentColor, opacity: isDone ? 0.2 : 0.65 }}
      />

      <div className="pl-4 pr-4 pt-3.5 pb-3">

        {/* ── Header row ── */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">

          {/* Source */}
          <div className="flex items-center gap-1.5 text-[#6b6e8c] flex-shrink-0">
            {getSourceSvg(item.source)}
            <span className="text-[11px] font-medium tracking-wide text-[#7a7c98] uppercase">
              {sourceLabel}
            </span>
          </div>

          {/* Category badge + tooltip */}
          <span className="relative group/cat flex-shrink-0">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-default ${badgeStyle}`}>
              {displayCategory}
            </span>
            {CATEGORY_DESC[item.category] && (
              <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 whitespace-nowrap rounded-lg bg-[#1a1c2e] border border-[#252840] px-2.5 py-1.5 text-[10px] text-[#9a9cb8] opacity-0 group-hover/cat:opacity-100 transition-opacity duration-150 shadow-xl">
                {CATEGORY_DESC[item.category]}
              </span>
            )}
          </span>

          {/* People chips */}
          {people.slice(0, 2).map((name, i) => (
            <span key={i} className="text-[11px] text-[#8082a0] bg-[#141520] px-1.5 py-0.5 rounded-full border border-[#1e2030] flex-shrink-0">
              {name}
            </span>
          ))}
          {people.length > 2 && (
            <span className="text-[10px] text-[#6b6e8c]">+{people.length - 2}</span>
          )}

          <div className="flex-1 min-w-0" />

          {/* Priority */}
          {item.priority === 'high' && (
            <span className="text-[9px] font-bold text-red-400 tracking-widest uppercase flex-shrink-0">URGENT</span>
          )}

          {/* Time */}
          <span className="text-[11px] text-[#5a5c78] flex-shrink-0">
            {formatTime(item.received_at || item.created_at)}
          </span>

          {/* New dot */}
          {isNew && (
            <div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d8] flex-shrink-0" style={{ boxShadow: '0 0 4px #d4d4d8aa' }} />
          )}
        </div>

        {/* ── Summary ── */}
        <p className={`text-[13px] leading-[1.55] mb-3 ${
          isDone ? 'line-through text-[#4a4c68]' : 'text-[#e0e0f0]'
        }`}>
          {item.summary || item.raw_text?.slice(0, 140) || '요약 없음'}
        </p>

        {/* ── Action items ── */}
        {actionItems.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {(actionsExpanded ? actionItems : actionItems.slice(0, 2)).map((action, i) => {
              const checked = !!checkedItems[i]
              const label = typeof action === 'object' ? action.text : action
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 cursor-pointer group/chk"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCheckedItems(prev => ({ ...prev, [i]: !prev[i] }))
                  }}
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
                  <span className={`text-[12px] leading-relaxed transition-colors ${
                    checked ? 'line-through text-[#4a4c68]' : 'text-[#8a8ca8]'
                  }`}>{label}</span>
                </div>
              )
            })}
            {actionItems.length > 2 && (
              <button
                className="text-[11px] text-[#5a5c78] hover:text-[#9a9cb8] pl-5 transition-colors"
                onClick={(e) => { e.stopPropagation(); setActionsExpanded(v => !v) }}
              >
                {actionsExpanded ? '접기 ▴' : `+${actionItems.length - 2}개 더 ▾`}
              </button>
            )}
          </div>
        )}

        {/* ── Quick skill buttons ── */}
        {!isDone && (
          <div className={`flex items-center gap-1 mb-2 transition-opacity duration-150 opacity-0 group-hover:opacity-100`}>
            {QUICK_SKILLS.map(skill => (
              <button
                key={skill.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setSkillPanel({ open: true, skillId: skill.id })
                }}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-[#1c1e2c] hover:border-[#2a2c40] transition-colors"
                style={{ color: skill.color, background: skill.color + '12' }}
              >
                {skill.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Footer actions ── */}
        <div className={`flex items-center gap-0.5 pt-2.5 border-t border-[#13141e] transition-opacity duration-150 ${isDone ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={(e) => { e.stopPropagation(); if (item._filePath) window.tidy?.obsidian.open(item._filePath) }}
            className="flex items-center gap-1.5 text-[11px] text-[#5a5c78] hover:text-[#9a9cb8] px-2 py-1 rounded-md hover:bg-[#14151e] transition-colors"
          >
            {IcVault}
            <span>Vault</span>
          </button>

          {canReply(item.source) && !isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick?.() }}
              className="flex items-center gap-1.5 text-[11px] text-[#5a5c78] hover:text-[#9a9cb8] px-2 py-1 rounded-md hover:bg-[#14151e] transition-colors"
            >
              {IcReply}
              <span>답장</span>
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(item.id) }}
            className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md hover:bg-red-500/5 transition-colors ${
              isDone ? 'text-[#7a4040] hover:text-red-400' : 'text-[#4a3040] hover:text-red-500'
            }`}
          >
            {IcTrash}
            <span>삭제</span>
          </button>

          {isDone ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore?.(item.id) }}
              className="flex items-center gap-1.5 text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] px-2.5 py-1 rounded-md hover:bg-[#14151e] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v5h5M1.5 9A7 7 0 1 0 4 4.5"/>
              </svg>
              <span>복구</span>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkDone?.(item.id) }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#c8c8d0] bg-white/8 hover:bg-white/12 px-2.5 py-1 rounded-md transition-colors"
            >
              {IcCheck}
              <span>완료</span>
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Skill output panel */}
    <SkillPanel
      open={skillPanel.open}
      onClose={() => setSkillPanel({ open: false, skillId: null })}
      skillId={skillPanel.skillId}
      input={item.summary || item.raw_text || ''}
      sourceItemId={item.id}
    />
  </>
  )
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now   = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
