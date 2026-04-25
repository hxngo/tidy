import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SourceIcon } from '../components/Icons.jsx'

function formatRelDate(iso) {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff < 7) return `${diff}일 전`
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function Home() {
  const [newCount, setNewCount] = useState(0)
  const [urgentCount, setUrgentCount] = useState(0)
  const [activeTaskCount, setActiveTaskCount] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [recentItems, setRecentItems] = useState([])
  const [activeTasks, setActiveTasks] = useState([])
  const navigate = useNavigate()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 17 ? '좋은 오후예요' : '좋은 저녁이에요'
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

  useEffect(() => {
    // limit 없이 전체 로드 → 정확한 카운트
    window.tidy?.inbox.get({ limit: 9999 }).then(data => {
      if (!Array.isArray(data)) return
      const newItems = data.filter(i => i.status === 'new')
      setNewCount(newItems.length)
      setUrgentCount(newItems.filter(i => i.priority === 'high').length)
      setRecentItems(newItems.slice(0, 5))
    }).catch(() => {})

    window.tidy?.tasks.get({ status: 'active' }).then(data => {
      if (!Array.isArray(data)) return
      const todayStr = new Date().toISOString().slice(0, 10)
      setActiveTaskCount(data.length)
      // due_date 앞 10자(YYYY-MM-DD)만 비교 → 포맷 차이 무관
      setOverdueCount(data.filter(t => t.due_date && t.due_date.slice(0, 10) < todayStr).length)
      setActiveTasks(data.slice(0, 4))
    }).catch(() => {})
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* 인사말 */}
        <div className="mb-8">
          <p className="text-[11px] text-[#505272] mb-1">{today}</p>
          <h1 className="text-[20px] font-semibold text-[#e0e0f0]">{greeting}</h1>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: '새 항목', value: newCount,       color: '#6366f1', to: '/inbox',  state: null },
            { label: '긴급',    value: urgentCount,    color: '#ef4444', to: '/inbox',  state: { priorityFilter: 'high' } },
            { label: '태스크',  value: activeTaskCount, color: '#0ea5e9', to: '/tasks', state: null },
            { label: '기한 초과', value: overdueCount,  color: '#f59e0b', to: '/tasks', state: null },
          ].map(card => (
            <button
              key={card.label}
              onClick={() => navigate(card.to, card.state ? { state: card.state } : {})}
              className="p-3.5 rounded-2xl border border-[#1a1c28] hover:border-[#252840] text-left transition-all"
              style={{ background: 'var(--card-bg)' }}
            >
              <p className="text-[22px] font-bold leading-none mb-1.5"
                style={{ color: card.value > 0 ? card.color : '#3a3c50' }}>
                {card.value}
              </p>
              <p className="text-[10px] text-[#505272]">{card.label}</p>
            </button>
          ))}
        </div>

        {/* AI 커맨드 버튼 */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('tidy:openCommandBar', { detail: { char: '' } }))}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#1a1c28] hover:border-[#c026d3]/30 mb-8 text-left transition-all group"
          style={{ background: 'var(--card-bg)' }}
        >
          <div className="w-7 h-7 rounded-lg bg-[#c026d3]/10 border border-[#c026d3]/20 flex items-center justify-center flex-shrink-0">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#e879f9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2L7 8H2l4 3-1.5 5L9 13l4.5 3L12 11l4-3H11L9 2z"/>
            </svg>
          </div>
          <span className="text-[12px] text-[#3a3c50] group-hover:text-[#6b6e8c] transition-colors flex-1">
            AI에게 무엇이든 물어보세요…
          </span>
          <kbd className="text-[10px] text-[#2a2c40] bg-[#13141c] border border-[#1a1c28] rounded px-1.5 py-0.5 font-mono flex-shrink-0">⌘F</kbd>
        </button>

        {/* 새 항목 + 태스크 */}
        <div className="grid grid-cols-2 gap-5">
          {/* 새 인박스 항목 */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest">새 항목</p>
              <button onClick={() => navigate('/inbox')}
                className="text-[10px] text-[#3a3c50] hover:text-[#9a9cb8] transition-colors">전체 →</button>
            </div>
            <div className="space-y-1.5">
              {recentItems.length === 0 ? (
                <p className="text-[11px] text-[#2e3048] py-4 text-center">새 항목 없음</p>
              ) : recentItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate('/inbox')}
                  className="w-full text-left p-2.5 rounded-xl border border-[#1a1c28] hover:border-[#252840] hover:bg-[#0e0f16] transition-all"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <SourceIcon source={item.source} size={10} className="text-[#505272] flex-shrink-0" />
                    <span className="text-[9px] text-[#3a3c50] truncate flex-1">{item.source}</span>
                    {item.priority === 'high' && (
                      <span className="text-[8px] text-red-400 font-bold flex-shrink-0">긴급</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9a9cb8] leading-snug line-clamp-2">{item.summary}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 활성 태스크 */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-[#505272] uppercase tracking-widest">태스크</p>
              <button onClick={() => navigate('/tasks')}
                className="text-[10px] text-[#3a3c50] hover:text-[#9a9cb8] transition-colors">전체 →</button>
            </div>
            <div className="space-y-1.5">
              {activeTasks.length === 0 ? (
                <p className="text-[11px] text-[#2e3048] py-4 text-center">활성 태스크 없음</p>
              ) : activeTasks.map(task => {
                const overdue = task.due_date && task.due_date.slice(0, 10) < todayStr
                return (
                  <button
                    key={task.id}
                    onClick={() => navigate('/tasks')}
                    className="w-full text-left p-2.5 rounded-xl border border-[#1a1c28] hover:border-[#252840] hover:bg-[#0e0f16] transition-all"
                  >
                    <p className="text-[11px] text-[#9a9cb8] leading-snug line-clamp-2 mb-0.5">{task.title}</p>
                    {task.due_date && (
                      <p className={`text-[9px] ${overdue ? 'text-red-400' : 'text-[#505272]'}`}>
                        {overdue ? '기한 초과 · ' : '~'}{task.due_date.slice(5, 10)}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
