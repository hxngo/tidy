import { useState, useEffect, useRef } from 'react'

// ─── 스킬 정의 ────────────────────────────────────────────────
export const SKILLS = [
  { id: 'summary',    label: '요약',     icon: '✦',  desc: '핵심 내용 3줄 요약',         color: '#6366f1' },
  { id: 'translate',  label: '번역',     icon: '⇄',  desc: '한↔영 자동 번역',            color: '#0ea5e9' },
  { id: 'minutes',    label: '회의록',   icon: '◉',  desc: '대화를 회의록으로 정리',       color: '#8b5cf6' },
  { id: 'report',     label: '보고서',   icon: '▤',  desc: '업무 보고서 작성',             color: '#3b82f6' },
  { id: 'kpi',        label: 'KPI',      icon: '◈',  desc: 'KPI 수치를 표로 정리',         color: '#f59e0b' },
  { id: 'slides',     label: '슬라이드', icon: '▨',  desc: '발표자료 구조로 변환',         color: '#ec4899' },
  { id: 'budget',     label: '예산표',   icon: '◫',  desc: '비용 항목을 표로 정리',        color: '#10b981' },
  { id: 'notebook',   label: '노트',     icon: '◻',  desc: '노트 형식으로 정리',           color: '#84cc16' },
  { id: 'onboarding', label: '온보딩',   icon: '▷',  desc: '온보딩 가이드 생성',           color: '#f97316' },
]

export function skillById(id) {
  return SKILLS.find(s => s.id === id) || { id, label: id, icon: '·', color: '#6b7280' }
}

// ─── SkillPanel: 슬라이드-오버 출력 패널 ─────────────────────
export default function SkillPanel({ open, onClose, skillId, input, sourceItemId }) {
  const [state, setState] = useState('idle') // idle | running | done | error
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const prevSkillRef = useRef(null)

  const skill = skillById(skillId)

  // skill 또는 input이 바뀌면 자동 실행
  useEffect(() => {
    if (!open || !skillId || !input) return
    const key = `${skillId}::${input}`
    if (prevSkillRef.current === key) return
    prevSkillRef.current = key

    setState('running')
    setOutput('')
    setCopied(false)
    setSaved(false)

    window.tidy?.skills.run({ skillId, input, sourceItemId })
      .then(res => {
        if (res?.success) {
          setOutput(res.output)
          setState('done')
        } else {
          setOutput(res?.error || '알 수 없는 오류')
          setState('error')
        }
      })
      .catch(err => {
        setOutput(err.message)
        setState('error')
      })
  }, [open, skillId, input, sourceItemId])

  // 패널이 닫히면 상태 리셋
  useEffect(() => {
    if (!open) {
      prevSkillRef.current = null
    }
  }, [open])

  function handleCopy() {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSaveVault() {
    // 이미 run에서 자동 저장됨. Vault에서 열기
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] flex flex-col bg-[#0d0e16] border-l border-[#1c1e2c] shadow-2xl slide-in-right">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#1c1e2c] flex-shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: skill.color + '22', color: skill.color }}
          >
            {skill.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-[#e0e0f0]">{skill.label}</h3>
            {input && (
              <p className="text-[11px] text-[#505272] truncate mt-0.5">
                {input.slice(0, 60)}{input.length > 60 ? '…' : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#14151e] transition-colors flex-shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'running' && (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: skill.color, animationDelay: `${i * 180}ms` }}
                  />
                ))}
              </div>
              <p className="text-[12px] text-[#6b6e8c]">AI가 {skill.label}을 생성하는 중…</p>
            </div>
          )}

          {state === 'error' && (
            <div className="rounded-xl bg-red-900/20 border border-red-800/40 p-4">
              <p className="text-[12px] text-red-400 font-medium mb-1">오류 발생</p>
              <p className="text-[11px] text-red-300/70">{output}</p>
            </div>
          )}

          {state === 'done' && (
            <div className="prose prose-sm prose-invert max-w-none">
              <MarkdownOutput text={output} />
            </div>
          )}
        </div>

        {/* Footer */}
        {state === 'done' && (
          <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[#1c1e2c] flex-shrink-0">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                copied
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-[#9a9cb8] bg-[#14151e] border-[#1c1e2c] hover:border-[#252840]'
              }`}
            >
              {copied ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 8l4 4 8-7"/>
                  </svg>
                  복사됨
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="5" width="9" height="9" rx="1"/>
                    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/>
                  </svg>
                  복사
                </>
              )}
            </button>

            <button
              onClick={handleSaveVault}
              className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                saved
                  ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
                  : 'text-[#9a9cb8] bg-[#14151e] border-[#1c1e2c] hover:border-[#252840]'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1.5L14.5 5.5v5L8 14.5 1.5 10.5v-5L8 1.5z"/>
              </svg>
              {saved ? 'Vault 저장됨' : 'Vault에 저장'}
            </button>

            <div className="flex-1" />

            <span className="text-[10px] text-[#3a3c50]">자동 저장됨</span>
          </div>
        )}
      </div>
    </>
  )
}

// ─── 마크다운 간단 렌더러 ─────────────────────────────────────
function MarkdownOutput({ text }) {
  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-[13px] font-semibold text-[#e0e0f0] mt-5 mb-2 first:mt-0">
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-[15px] font-semibold text-[#e8e8f8] mt-4 mb-3 first:mt-0">
          {line.slice(2)}
        </h1>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-[12px] font-semibold text-[#c8c8d8] mt-3 mb-1.5">
          {line.slice(4)}
        </h3>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 mb-1">
          <span className="text-[#505272] mt-[5px] text-[8px]">●</span>
          <span className="text-[12px] text-[#b0b2cc] leading-relaxed flex-1">
            {renderInline(line.slice(2))}
          </span>
        </div>
      )
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\./)[1]
      elements.push(
        <div key={i} className="flex items-start gap-2 mb-1">
          <span className="text-[10px] text-[#505272] min-w-[16px] mt-[3px] font-mono">{num}.</span>
          <span className="text-[12px] text-[#b0b2cc] leading-relaxed flex-1">
            {renderInline(line.replace(/^\d+\.\s*/, ''))}
          </span>
        </div>
      )
    } else if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="border-l-2 border-[#252840] pl-3 my-2">
          <p className="text-[11px] text-[#6b6e8c] italic">{line.slice(2)}</p>
        </div>
      )
    } else if (line.startsWith('|') && line.endsWith('|')) {
      // 테이블 수집
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].replace(/\|/g, '').replace(/-/g, '').trim()) {
          i++; continue
        }
        tableLines.push(lines[i])
        i++
      }
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
          <table className="w-full text-[11px] border-collapse">
            {tableLines.map((tl, ti) => {
              const cells = tl.split('|').slice(1, -1).map(c => c.trim())
              return (
                <tr key={ti} className={ti === 0 ? 'border-b border-[#252840]' : ''}>
                  {cells.map((c, ci) => (
                    ti === 0
                      ? <th key={ci} className="text-left text-[#8082a0] font-semibold py-1.5 px-2 first:pl-0">{c}</th>
                      : <td key={ci} className="text-[#b0b2cc] py-1 px-2 first:pl-0 border-b border-[#1a1c28]">{c}</td>
                  ))}
                </tr>
              )
            })}
          </table>
        </div>
      )
      continue
    } else if (line.startsWith('---') || line.startsWith('***')) {
      elements.push(<hr key={i} className="border-[#1c1e2c] my-3" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />)
    } else {
      elements.push(
        <p key={i} className="text-[12px] text-[#b0b2cc] leading-relaxed mb-1">
          {renderInline(line)}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

function renderInline(text) {
  // **bold**, `code`, *italic*
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-[#e0e0f0] font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-[#1a1c2e] text-[#a78bfa] px-1 py-0.5 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="text-[#9a9cb8] italic">{part.slice(1, -1)}</em>
    }
    return part
  })
}
