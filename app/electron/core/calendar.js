const { exec } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const os = require('os')
const fs = require('fs')
const store = require('../store')

const execAsync = promisify(exec)

// macOS Calendar 이벤트 생성 (osascript 사용 - 추가 패키지 불필요)
async function createEvent({ title, startDate, endDate, notes = '', calendarName }) {
  const cal = calendarName || store.get('calendarName') || null

  if (!endDate) {
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000) // 기본 1시간
  }

  const y = startDate.getFullYear()
  const mo = startDate.getMonth() + 1
  const d = startDate.getDate()
  const h = startDate.getHours()
  const mi = startDate.getMinutes()
  const durationSec = Math.round((endDate - startDate) / 1000)

  const safeTitle = (title || '일정').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 100)
  const safeNotes = (notes || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 400)

  const calTarget = cal
    ? `tell calendar "${cal.replace(/"/g, '\\"')}"`
    : `tell first calendar whose writable is true`

  // 컴포넌트 기반 날짜 설정 (로케일 독립적)
  const script = `
tell application "Calendar"
  set theStart to current date
  set year of theStart to ${y}
  set month of theStart to ${mo}
  set day of theStart to ${d}
  set hours of theStart to ${h}
  set minutes of theStart to ${mi}
  set seconds of theStart to 0
  set theEnd to theStart + ${durationSec}
  ${calTarget}
    set newEvent to make new event with properties {summary:"${safeTitle}", start date:theStart, end date:theEnd}
    ${safeNotes ? `set description of newEvent to "${safeNotes}"` : ''}
  end tell
  reload calendars
end tell
`

  // 임시 파일로 osascript 실행 (heredoc 보다 안정적)
  const tmpFile = path.join(os.tmpdir(), `tidy_cal_${Date.now()}.applescript`)
  try {
    fs.writeFileSync(tmpFile, script, 'utf8')
    await execAsync(`osascript "${tmpFile}"`)
    console.log(`[Calendar] 이벤트 생성: "${safeTitle}" @ ${startDate.toLocaleString('ko-KR')}`)
    return { success: true, title, startDate, endDate }
  } catch (error) {
    console.error('[Calendar] 이벤트 생성 실패:', error.message)
    return { success: false, error: error.message }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

// macOS 캘린더 목록 반환
async function getCalendars() {
  try {
    const { stdout } = await execAsync(`osascript -e 'tell application "Calendar" to get name of calendars'`)
    return stdout.trim().split(', ').filter(Boolean)
  } catch {
    return []
  }
}

// 같은 날짜에 같은 제목의 이벤트가 있는지 확인 (중복 방지)
async function isDuplicateEvent({ title, startDate }) {
  try {
    const safeTitle = (title || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 100)
    const y = startDate.getFullYear()
    const mo = startDate.getMonth() + 1
    const d = startDate.getDate()

    const script = `
tell application "Calendar"
  set dayStart to current date
  set year of dayStart to ${y}
  set month of dayStart to ${mo}
  set day of dayStart to ${d}
  set hours of dayStart to 0
  set minutes of dayStart to 0
  set seconds of dayStart to 0
  set dayEnd to dayStart + (86400)
  set matchCount to 0
  repeat with cal in calendars
    try
      set evts to (every event of cal whose start date >= dayStart and start date < dayEnd and summary = "${safeTitle}")
      set matchCount to matchCount + (count of evts)
    end try
  end repeat
  return matchCount
end tell
`
    const tmpFile = path.join(os.tmpdir(), `tidy_cal_check_${Date.now()}.applescript`)
    try {
      fs.writeFileSync(tmpFile, script, 'utf8')
      const { stdout } = await execAsync(`osascript "${tmpFile}"`)
      return parseInt(stdout.trim()) > 0
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  } catch {
    return false // 확인 실패 시 중복 아닌 것으로 간주
  }
}

// AI 분석 결과에서 이벤트 감지 시 캘린더에 생성
// forceCalendar=true 이면 설정 무관하게 항상 생성 (파일 업로드 등)
async function handleEventFromAnalysis(analysis, rawText, { forceCalendar = false } = {}) {
  const hint = analysis?.event_hint
  if (!hint?.has_event) return null

  const calEnabled = store.get('calendarEnabled')
  if (!calEnabled && !forceCalendar) return null

  const startDate = parseDateHint(hint.event_date, hint.event_time)
  if (!startDate) {
    console.log('[Calendar] 날짜 파싱 실패:', hint.event_date, hint.event_time)
    return null
  }

  const durationMs = (hint.duration_minutes || 60) * 60 * 1000
  const endDate = new Date(startDate.getTime() + durationMs)
  const title = hint.event_title || analysis.summary?.slice(0, 60) || '일정'
  const locationStr = hint.location ? `📍 ${hint.location}\n\n` : ''

  // 중복 체크: 같은 날짜에 같은 제목 있으면 건너뜀
  const duplicate = await isDuplicateEvent({ title, startDate })
  if (duplicate) {
    console.log(`[Calendar] 중복 이벤트 건너뜀: "${title}" @ ${startDate.toLocaleDateString('ko-KR')}`)
    return { success: false, skipped: true, reason: 'duplicate' }
  }

  return createEvent({
    title,
    startDate,
    endDate,
    notes: locationStr + (rawText?.slice(0, 300) || ''),
  })
}

const DAY_KO = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 }

// 요일 이름 → 해당 날짜 계산 (nextWeek=true면 반드시 다음 주)
function getDateByDayName(dayName, nextWeek = false) {
  const target = DAY_KO[dayName]
  if (target === undefined) return null
  const now = new Date()
  const today = now.getDay()
  let diff = target - today
  if (!nextWeek && diff <= 0) diff += 7   // 이번 주 해당 요일이 이미 지났으면 다음 주로
  if (nextWeek && diff <= 0) diff += 7
  if (nextWeek && diff < 7) diff += 7    // 다음 주 강제: 최소 7일 후
  const d = new Date(now)
  d.setDate(d.getDate() + diff)
  return d
}

// 한국어 날짜·시간 파싱 → Date 객체 반환 (없으면 null)
function parseDateHint(dateStr, timeStr) {
  if (!dateStr) return null

  const now = new Date()
  let date = new Date(now)
  const ds = String(dateStr).trim()

  if (/^(오늘|today)$/i.test(ds)) {
    // 오늘 유지
  } else if (/^(내일|tomorrow)$/i.test(ds)) {
    date.setDate(date.getDate() + 1)
  } else if (/^모레$/.test(ds)) {
    date.setDate(date.getDate() + 2)
  } else if (/^글피$/.test(ds)) {
    date.setDate(date.getDate() + 3)
  } else if (/다음\s*주\s*([월화수목금토일])/.test(ds)) {
    // "다음 주 화요일" → 다음 주 해당 요일
    const m = ds.match(/다음\s*주\s*([월화수목금토일])/)
    const d = getDateByDayName(m[1], true)
    if (d) date = d
    else date.setDate(date.getDate() + 7)
  } else if (/다음\s*주/.test(ds)) {
    date.setDate(date.getDate() + 7)
  } else if (/이번\s*주\s*([월화수목금토일])/.test(ds)) {
    // "이번 주 금요일" → 이번 주 해당 요일 (지났으면 다음 주)
    const m = ds.match(/이번\s*주\s*([월화수목금토일])/)
    const d = getDateByDayName(m[1], false)
    if (d) date = d
  } else if (/^([월화수목금토일])요일$/.test(ds) || /^([월화수목금토일])$/.test(ds)) {
    // "금요일" 또는 "금" → 가장 가까운 해당 요일
    const m = ds.match(/^([월화수목금토일])/)
    const d = getDateByDayName(m[1], false)
    if (d) date = d
  } else if (/(\d{4})-(\d{2})-(\d{2})/.test(ds)) {
    const m = ds.match(/(\d{4})-(\d{2})-(\d{2})/)
    date = new Date(+m[1], +m[2] - 1, +m[3])
  } else if (/(\d{1,2})월\s*(\d{1,2})일/.test(ds)) {
    const m = ds.match(/(\d{1,2})월\s*(\d{1,2})일/)
    date = new Date(now.getFullYear(), +m[1] - 1, +m[2])
    if (date < now) date.setFullYear(now.getFullYear() + 1)
  } else {
    return null // 파싱 불가
  }

  // 시간 파싱
  const ts = String(timeStr || '').trim()
  if (ts) {
    const m = ts.match(/(\d{1,2})[시:](\d{0,2})/)
    if (m) {
      let hours = parseInt(m[1])
      const minutes = parseInt(m[2] || '0')
      if (/오후|pm/i.test(ts) && hours < 12) hours += 12
      if (/오전|am/i.test(ts) && hours === 12) hours = 0
      date.setHours(hours, minutes, 0, 0)
    } else if (/점심/.test(ts)) {
      date.setHours(12, 0, 0, 0)
    } else if (/저녁|야/.test(ts)) {
      date.setHours(18, 0, 0, 0)
    } else {
      date.setHours(9, 0, 0, 0)
    }
  } else {
    date.setHours(9, 0, 0, 0) // 기본 오전 9시
  }

  return date
}

module.exports = { createEvent, getCalendars, handleEventFromAnalysis }
