import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── 날짜 유틸 ────────────────────────────────────────────────
function today() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay() // 0=일
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월']

// ─── 아이템 색상 ──────────────────────────────────────────────
const PRIORITY_DOT = {
  high: 'bg-red-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-500',
}
const CATEGORY_COLOR = {
  업무: '#3b82f6',
  미팅: '#8b5cf6',
  여행: '#f59e0b',
  정보: '#6b7280',
  운영: '#10b981',
}

// ─── 시간 파싱 ────────────────────────────────────────────────
function parseHour(item) {
  if (item.event_time) {
    const [h] = item.event_time.split(':').map(Number)
    return isNaN(h) ? null : h
  }
  return null
}

function formatTime(str) {
  if (!str) return ''
  const [h, m] = str.split(':')
  const hh = parseInt(h)
  const ampm = hh < 12 ? '오전' : '오후'
  const hh12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${ampm} ${hh12}:${m || '00'}`
}

// ─── 월 캘린더 ───────────────────────────────────────────────
function MonthView({ year, month, items, selectedDay, onSelectDay }) {
  const t = today()
  const totalDays = daysInMonth(year, month)
  const startDow = firstDayOfMonth(year, month)

  // 날짜별 아이템 맵
  const byDay = {}
  items.forEach(item => {
    const d = item.event_date || item.received_at?.slice(0, 10)
    if (!d) return
    const [y, mo, da] = d.split('-').map(Number)
    if (y === year && mo === month + 1) {
      if (!byDay[da]) byDay[da] = []
      byDay[da].push(item)
    }
  })

  const cells = []
  // 앞 빈칸
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const rows = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  while (rows[rows.length - 1].length < 7) rows[rows.length - 1].push(null)

  return (
    <div className="flex flex-col h-full">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-[#1a1c2e]">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 text-center text-[11px] font-medium tracking-wide
            ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-[#6b6e8c]'}`}>
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="flex-1 grid grid-rows-5 min-h-0">
        {rows.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 border-b border-[#1a1c2e] last:border-0 min-h-0">
            {row.map((day, ci) => {
              if (!day) return (
                <div key={ci} className="border-r border-[#1a1c2e] last:border-0 bg-[#080910]/30" />
              )
              const isToday = t.year === year && t.month === month && t.day === day
              const isSelected = selectedDay === day
              const dayItems = byDay[day] || []
              const dow = (startDow + day - 1) % 7
              const isWeekend = dow === 0 || dow === 6

              return (
                <div
                  key={day}
                  onClick={() => onSelectDay(day)}
                  className={`border-r border-[#1a1c2e] last:border-0 p-1.5 flex flex-col gap-0.5 cursor-pointer transition-colors min-h-0 overflow-hidden
                    ${isSelected ? 'bg-[#1a1c2e]' : 'hover:bg-[#12131e]'}
                    ${!isSelected && day < t.day && t.year === year && t.month === month ? 'opacity-50' : ''}`}
                >
                  {/* 날짜 숫자 */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0
                    ${isToday ? 'bg-blue-500 text-white' : isWeekend ? (dow === 0 ? 'text-red-400' : 'text-blue-400') : 'text-[#9a9cb8]'}`}>
                    {day}
                  </div>

                  {/* 아이템 점/칩 */}
                  <div className="flex flex-col gap-0.5 overflow-hidden min-h-0">
                    {dayItems.slice(0, 3).map((item, i) => (
                      <div key={i} className="flex items-center gap-1 overflow-hidden flex-shrink-0">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[item.priority] || 'bg-slate-500'}`} />
                        <span className="text-[9px] text-[#6b6e8c] truncate">{item.summary?.slice(0, 14)}</span>
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="text-[9px] text-[#505272]">+{dayItems.length - 3}개</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 하루 타임라인 ────────────────────────────────────────────
function DayView({ year, month, day, items }) {
  const navigate = useNavigate()
  const dateStr = toDateStr(year, month, day)

  const dayItems = items.filter(item => {
    const d = item.event_date || item.received_at?.slice(0, 10)
    return d === dateStr
  })

  // 시간 있는 것 / 없는 것 분류
  const timed = dayItems.filter(i => i.event_time).sort((a, b) => a.event_time > b.event_time ? 1 : -1)
  const allDay = dayItems.filter(i => !i.event_time)

  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  // 시간대별 그루핑
  const byHour = {}
  timed.forEach(item => {
    const h = parseHour(item)
    if (h !== null) {
      if (!byHour[h]) byHour[h] = []
      byHour[h].push(item)
    }
  })

  const now = new Date()
  const currentHour = now.getHours()
  const currentMin = now.getMinutes()
  const t = today()
  const isToday = t.year === year && t.month === month && t.day === day

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 종일 아이템 */}
      {allDay.length > 0 && (
        <div className="flex-shrink-0 border-b border-[#1a1c2e] px-4 py-2 space-y-1">
          <div className="text-[10px] text-[#505272] mb-1.5 uppercase tracking-wide font-medium">종일</div>
          {allDay.map(item => (
            <div
              key={item.id}
              onClick={() => navigate('/inbox')}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[#1a1c2e] transition-colors"
              style={{ borderLeft: `2px solid ${CATEGORY_COLOR[item.category] || '#475569'}` }}
            >
              <span className="text-[11px] text-[#c8cae8] truncate">{item.summary}</span>
              {item.priority === 'high' && (
                <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest flex-shrink-0">긴급</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 시간별 타임라인 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="relative">
          {HOURS.map(h => (
            <div key={h} className="flex min-h-[56px] border-b border-[#1a1c2e]/50">
              {/* 시간 레이블 */}
              <div className="w-12 flex-shrink-0 pt-1 pr-2 text-right">
                <span className={`text-[10px] ${isToday && h === currentHour ? 'text-blue-400 font-medium' : 'text-[#3d3f52]'}`}>
                  {h === 0 ? '' : `${h < 12 ? h : h === 12 ? 12 : h - 12}${h < 12 ? 'AM' : 'PM'}`}
                </span>
              </div>

              {/* 내용 영역 */}
              <div className="flex-1 relative border-l border-[#1a1c2e]/50 pl-2 pr-4 py-1 space-y-1">
                {/* 현재 시간 인디케이터 */}
                {isToday && h === currentHour && (
                  <div
                    className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
                    style={{ top: `${(currentMin / 60) * 100}%` }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 -ml-[3px] flex-shrink-0" />
                    <div className="flex-1 h-px bg-blue-400/60" />
                  </div>
                )}

                {(byHour[h] || []).map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigate('/inbox')}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[#1a1c2e] transition-colors group"
                    style={{ borderLeft: `2px solid ${CATEGORY_COLOR[item.category] || '#475569'}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[#505272] mb-0.5">{formatTime(item.event_time)}</div>
                      <div className="text-[12px] text-[#c8cae8] leading-snug truncate">{item.summary}</div>
                      {item.people?.length > 0 && (
                        <div className="text-[10px] text-[#6b6e8c] mt-0.5">{item.people.join(', ')}</div>
                      )}
                    </div>
                    {item.priority === 'high' && (
                      <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest flex-shrink-0 mt-1">URGENT</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── 선택한 날 아이템 목록 (월 뷰 우측 패널) ──────────────────
function DayPanel({ year, month, day, items, onClose }) {
  const navigate = useNavigate()
  const dateStr = toDateStr(year, month, day)
  const dayItems = items.filter(item => {
    const d = item.event_date || item.received_at?.slice(0, 10)
    return d === dateStr
  })

  const t = today()
  const isToday = t.year === year && t.month === month && t.day === day
  const dow = new Date(year, month, day).getDay()
  const dowLabel = WEEKDAYS[dow]

  return (
    <div className="flex flex-col h-full border-l border-[#1a1c2e]">
      {/* 패널 헤더 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#1a1c2e]">
        <div>
          <span className={`text-lg font-semibold ${isToday ? 'text-blue-400' : 'text-[#e8eaf6]'}`}>{day}</span>
          <span className="text-[12px] text-[#6b6e8c] ml-1.5">{dowLabel}요일</span>
          {isToday && <span className="text-[10px] text-blue-400 ml-2 bg-blue-500/10 px-1.5 py-0.5 rounded-full">오늘</span>}
        </div>
        <button onClick={onClose} className="text-[#505272] hover:text-[#9a9cb8] transition-colors">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l12 12M14 2L2 14"/>
          </svg>
        </button>
      </div>

      {/* 아이템 목록 */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
        {dayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[#3d3f52]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="mb-2 opacity-30">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <span className="text-[11px]">일정 없음</span>
          </div>
        ) : dayItems.map(item => (
          <div
            key={item.id}
            onClick={() => navigate('/inbox')}
            className="p-2.5 rounded-xl border border-[#1a1c2e] hover:border-[#252840] hover:bg-[#12131e] cursor-pointer transition-all"
            style={{ borderLeft: `2px solid ${CATEGORY_COLOR[item.category] || '#475569'}` }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {item.event_time && (
                  <div className="text-[10px] text-[#505272] mb-0.5">{formatTime(item.event_time)}</div>
                )}
                <p className="text-[12px] text-[#c8cae8] leading-snug line-clamp-2">{item.summary}</p>
                {item.people?.length > 0 && (
                  <p className="text-[10px] text-[#6b6e8c] mt-1">{item.people.join(', ')}</p>
                )}
              </div>
              {item.priority === 'high' && (
                <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest flex-shrink-0">긴급</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[9px] text-[#3d3f52] bg-[#1a1c2e] px-1.5 py-0.5 rounded">
                {item.category || '기타'}
              </span>
              <span className="text-[9px] text-[#3d3f52]">{item.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 메인 Calendar 페이지 ─────────────────────────────────────
export default function Calendar() {
  const t = today()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'day'
  const [year, setYear] = useState(t.year)
  const [month, setMonth] = useState(t.month)
  const [selectedDay, setSelectedDay] = useState(t.day)
  const [items, setItems] = useState([])
  const [tasks, setTasks] = useState([])

  // 아이템 로드
  useEffect(() => {
    window.tidy?.inbox.get({ limit: 500 }).then(data => {
      if (Array.isArray(data)) {
        setItems(data.filter(i => i.event_date || i.received_at))
      }
    }).catch(() => {})

    window.tidy?.tasks.get({ status: 'active' }).then(data => {
      if (Array.isArray(data)) setTasks(data.filter(t => t.due_date))
    }).catch(() => {})
  }, [])

  // 태스크를 아이템 형식으로 변환해서 합치기
  const allItems = [
    ...items,
    ...tasks.map(t => ({
      id: `task-${t.id}`,
      summary: `☑ ${t.title}`,
      event_date: t.due_date,
      event_time: null,
      priority: t.due_date <= toDateStr(today().year, today().month, today().day) ? 'high' : 'medium',
      category: '업무',
      people: t.person ? [t.person] : [],
      source: 'task',
    }))
  ]

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  function goToday() {
    setYear(t.year); setMonth(t.month); setSelectedDay(t.day)
  }

  const isThisMonth = year === t.year && month === t.month

  // 이 달 아이템 수
  const monthItemCount = allItems.filter(item => {
    const d = item.event_date || item.received_at?.slice(0, 10)
    if (!d) return false
    const [y, mo] = d.split('-').map(Number)
    return y === year && mo === month + 1
  }).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-[#1a1c2e]">
        {/* 월 이동 */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#1a1c2e] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
          </button>
          <div className="min-w-[96px] text-center">
            <span className="text-[14px] font-semibold text-[#e8eaf6]">{year}년 {MONTHS_KO[month]}</span>
            {monthItemCount > 0 && (
              <span className="text-[10px] text-[#505272] ml-1.5">{monthItemCount}개</span>
            )}
          </div>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#1a1c2e] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 3l5 5-5 5"/>
            </svg>
          </button>
        </div>

        {!isThisMonth && (
          <button
            onClick={goToday}
            className="text-[11px] text-[#6b6e8c] hover:text-[#9a9cb8] border border-[#1a1c2e] hover:border-[#252840] px-2 py-1 rounded-md transition-colors"
          >
            오늘
          </button>
        )}

        <div className="flex-1" />

        {/* 뷰 모드 토글 */}
        <div className="flex items-center bg-[#0e0f16] rounded-lg p-0.5 border border-[#1a1c2e]">
          {[
            { key: 'month', label: '월' },
            { key: 'day',   label: '일' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`px-3 py-1 text-[11px] rounded-md transition-colors font-medium ${
                viewMode === v.key
                  ? 'bg-[#1a1c2e] text-[#c8cae8]'
                  : 'text-[#505272] hover:text-[#9a9cb8]'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-hidden min-h-0">
        {viewMode === 'month' ? (
          <div className="flex h-full">
            {/* 월 그리드 */}
            <div className={`${selectedDay ? 'flex-1' : 'w-full'} overflow-hidden transition-all`}>
              <MonthView
                year={year}
                month={month}
                items={allItems}
                selectedDay={selectedDay}
                onSelectDay={(day) => {
                  setSelectedDay(prev => prev === day ? null : day)
                }}
              />
            </div>

            {/* 우측 날짜 패널 */}
            {selectedDay && (
              <div className="w-64 flex-shrink-0 fade-in">
                <DayPanel
                  year={year}
                  month={month}
                  day={selectedDay}
                  items={allItems}
                  onClose={() => setSelectedDay(null)}
                />
              </div>
            )}
          </div>
        ) : (
          <DayView
            year={year}
            month={month}
            day={selectedDay || t.day}
            items={allItems}
          />
        )}
      </div>

      {/* 일 뷰에서 날짜 이동 */}
      {viewMode === 'day' && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 py-2 border-t border-[#1a1c2e]">
          <button
            onClick={() => {
              const cur = new Date(year, month, selectedDay || t.day)
              cur.setDate(cur.getDate() - 1)
              setYear(cur.getFullYear()); setMonth(cur.getMonth()); setSelectedDay(cur.getDate())
            }}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#1a1c2e] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
          </button>
          <span className="text-[12px] text-[#9a9cb8] font-medium min-w-[100px] text-center">
            {month + 1}월 {selectedDay || t.day}일 ({WEEKDAYS[new Date(year, month, selectedDay || t.day).getDay()]}){isThisMonth && (selectedDay || t.day) === t.day ? ' · 오늘' : ''}
          </span>
          <button
            onClick={() => {
              const cur = new Date(year, month, selectedDay || t.day)
              cur.setDate(cur.getDate() + 1)
              setYear(cur.getFullYear()); setMonth(cur.getMonth()); setSelectedDay(cur.getDate())
            }}
            className="p-1.5 rounded-md text-[#505272] hover:text-[#9a9cb8] hover:bg-[#1a1c2e] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3l5 5-5 5"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
