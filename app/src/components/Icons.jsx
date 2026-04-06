/**
 * Icons.jsx
 * 앱 전체에서 사용하는 SVG 아이콘 컴포넌트 모음
 * stroke 기반 / currentColor / 일관된 선 굵기 (1.5)
 */

const base = (d, extra = {}) => ({ d, ...extra })

// ─── 기본 props ────────────────────────────────────────────────
function Icon({ size = 16, className = '', children, viewBox = '0 0 20 20' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// ─── 네비게이션 아이콘 ─────────────────────────────────────────

/** 인박스 — 받은편지함 트레이 */
export function IconInbox({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 12h2.5l1.5 3h6l1.5-3H17M3 12V5a1 1 0 011-1h12a1 1 0 011 1v7M3 12h14" />
    </Icon>
  )
}

/** 태스크 — 체크 박스 */
export function IconTasks({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M7 10l2.5 2.5L13 8" />
    </Icon>
  )
}

/** 인물 — 사람 두 명 */
export function IconPeople({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2 17c0-3 2.5-5 5.5-5" />
      <circle cx="13" cy="7" r="2.5" />
      <path d="M10 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </Icon>
  )
}

/** 설정 — 슬라이더 3개 */
export function IconSettings({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <line x1="4" y1="6" x2="16" y2="6" />
      <line x1="4" y1="10" x2="16" y2="10" />
      <line x1="4" y1="14" x2="16" y2="14" />
      <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="7" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** 리포트 — 막대 차트 */
export function IconReport({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="3" y="11" width="3" height="6" rx="0.5" />
      <rect x="8.5" y="7" width="3" height="10" rx="0.5" />
      <rect x="14" y="4" width="3" height="13" rx="0.5" />
    </Icon>
  )
}

// ─── 소스 / 채널 아이콘 ────────────────────────────────────────

/** 이메일 — 봉투 */
export function IconMail({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="2" y="5" width="16" height="12" rx="1.5" />
      <path d="M2 6.5l8 5.5 8-5.5" />
    </Icon>
  )
}

/** 메시지 — 말풍선 */
export function IconMessage({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V5z" />
    </Icon>
  )
}

/** 카카오톡 — 동그란 말풍선 (K) */
export function IconKakao({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <ellipse cx="10" cy="9.5" rx="7" ry="6" />
      <path d="M7 12.5c.5 1.5 1.5 3 3 3.5" strokeOpacity="0.5" />
      <path d="M8 8.5l1.5 1.5L12 7" />
    </Icon>
  )
}

/** iMessage — 모서리 둥근 말풍선 */
export function IconIMessage({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H8l-4 3V5a1 1 0 011-1z" />
      <line x1="7" y1="8.5" x2="13" y2="8.5" />
      <line x1="7" y1="11" x2="11" y2="11" />
    </Icon>
  )
}

/** Slack — 격자 해시 */
export function IconSlack({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M8 3a2 2 0 00-2 2v4h8V5a2 2 0 00-2-2H8z" />
      <path d="M6 9v4a2 2 0 002 2h4a2 2 0 002-2V9H6z" />
      <path d="M3 8h14M10 3v14" />
    </Icon>
  )
}

/** Telegram — 종이비행기 */
export function IconTelegram({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M17 3L3 9l5 2 2 6 3-4 4 3L17 3z" />
      <path d="M8 11l2 2" />
    </Icon>
  )
}

/** LINE — L 원형 */
export function IconLine({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M8 7v6h4" />
    </Icon>
  )
}

/** 파일 */
export function IconFile({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M12 2v4h4" />
    </Icon>
  )
}

/** 회의록 — 마이크 */
export function IconMic({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="7" y="2" width="6" height="9" rx="3" />
      <path d="M4 10a6 6 0 0012 0" />
      <line x1="10" y1="16" x2="10" y2="19" />
      <line x1="7" y1="19" x2="13" y2="19" />
    </Icon>
  )
}

/** Google Drive — 구름 + 화살표 */
export function IconDrive({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 15l4-8h6l4 8H3z" />
      <path d="M7 15l3-6 3 6" />
      <path d="M5.5 15h9" />
    </Icon>
  )
}

/** 알림/벨 */
export function IconBell({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M10 3a6 6 0 016 6v3l1.5 2.5H2.5L4 12V9a6 6 0 016-6z" />
      <path d="M8.5 16.5a1.5 1.5 0 003 0" />
    </Icon>
  )
}

/** 연결 플러그 */
export function IconPlug({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M7 7v-4M13 7V3" />
      <rect x="5" y="7" width="10" height="5" rx="1" />
      <path d="M10 12v5" />
      <circle cx="10" cy="17.5" r="0.5" fill="currentColor" stroke="none" />
    </Icon>
  )
}

// ─── UI 아이콘 ─────────────────────────────────────────────────

/** 닫기 × */
export function IconClose({ size = 14, className }) {
  return (
    <Icon size={size} className={className}>
      <line x1="4" y1="4" x2="16" y2="16" />
      <line x1="16" y1="4" x2="4" y2="16" />
    </Icon>
  )
}

/** 첨부파일 / 페이퍼클립 */
export function IconAttach({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M15.5 8.5l-7 7a4 4 0 01-5.66-5.66l7-7a2.5 2.5 0 013.54 3.54L6.34 13.9a1 1 0 01-1.41-1.41L12 5.4" />
    </Icon>
  )
}

/** 잠금 */
export function IconLock({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="4" y="9" width="12" height="9" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </Icon>
  )
}

/** 체크 — FDA 허용 */
export function IconCheck({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M4 10l4.5 4.5L16 6" />
    </Icon>
  )
}

/** 돋보기 */
export function IconSearch({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <circle cx="9" cy="9" r="5.5" />
      <line x1="13.5" y1="13.5" x2="17" y2="17" />
    </Icon>
  )
}

/** 책 */
export function IconBook({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M4 4h5.5a2 2 0 012 2v10a2 2 0 00-2-2H4V4z" />
      <path d="M16 4h-4.5a2 2 0 00-2 2v10a2 2 0 012-2H16V4z" />
    </Icon>
  )
}

/** 리스트/클립보드 */
export function IconList({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <rect x="4" y="3" width="12" height="14" rx="1.5" />
      <line x1="7" y1="7" x2="13" y2="7" />
      <line x1="7" y1="10.5" x2="13" y2="10.5" />
      <line x1="7" y1="14" x2="10" y2="14" />
    </Icon>
  )
}

/** 폴더 */
export function IconFolder({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 7a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" />
    </Icon>
  )
}

/** 레이어/스택 (운영) */
export function IconLayers({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M2 10l8-5 8 5-8 5-8-5z" />
      <path d="M2 14l8 5 8-5" />
    </Icon>
  )
}

// ─── 소스 아이콘 맵 (Inbox / Home 에서 source 문자열로 아이콘 선택) ──
export function SourceIcon({ source = '', size = 14, className = '' }) {
  const src = source.toLowerCase()
  const props = { size, className }
  if (src.includes('gmail') || src.includes('mail') || src.includes('email')) return <IconMail {...props} />
  if (src.includes('slack')) return <IconSlack {...props} />
  if (src.includes('kakao')) return <IconKakao {...props} />
  if (src.includes('imessage') || src.includes('sms')) return <IconIMessage {...props} />
  if (src.includes('telegram')) return <IconTelegram {...props} />
  if (src.includes('line')) return <IconLine {...props} />
  if (src.includes('file') || src.includes('manual') || src.includes('upload')) return <IconFile {...props} />
  if (src.includes('meeting') || src.includes('mic')) return <IconMic {...props} />
  if (src.includes('gdrive') || src.includes('drive')) return <IconDrive {...props} />
  return <IconBell {...props} />
}
