import { useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import {
  IconInbox, IconTasks, IconPeople, IconSettings,
  IconReport, IconMail, IconMessage, IconClose,
} from './Icons.jsx'

const NAV_ITEMS = [
  { to: '/inbox',    label: '인박스', Icon: IconInbox },
  { to: '/tasks',    label: '태스크', Icon: IconTasks },
  { to: '/people',   label: '인물',   Icon: IconPeople },
  { to: '/settings', label: '설정',   Icon: IconSettings },
]

export default function Sidebar({ syncStatus = {} }) {
  const [reportState, setReportState] = useState({ loading: false, report: null })
  const [showReport, setShowReport] = useState(false)
  const reportTimeoutRef = useRef(null)
  const reportCancelledRef = useRef(false)

  const isGmailSyncing = syncStatus.gmail?.status === 'syncing'
  const isSlackSyncing = syncStatus.slack?.status === 'syncing'
  const isSyncing = isGmailSyncing || isSlackSyncing

  async function handleWeeklyReport() {
    reportCancelledRef.current = false
    setReportState({ loading: true, report: null })
    setShowReport(true)

    // 30초 타임아웃
    reportTimeoutRef.current = setTimeout(() => {
      if (!reportCancelledRef.current) {
        setReportState({ loading: false, report: '⏱ 시간이 초과되었습니다. 다시 시도해 주세요.' })
      }
    }, 30_000)

    try {
      const result = await window.tidy?.report.weekly()
      clearTimeout(reportTimeoutRef.current)
      if (reportCancelledRef.current) return
      if (result?.success) {
        setReportState({ loading: false, report: result.report })
      } else {
        setReportState({ loading: false, report: `오류: ${result?.error || '알 수 없는 오류'}` })
      }
    } catch (err) {
      clearTimeout(reportTimeoutRef.current)
      if (!reportCancelledRef.current) {
        setReportState({ loading: false, report: `오류: ${err.message}` })
      }
    }
  }

  function handleCancelReport() {
    reportCancelledRef.current = true
    clearTimeout(reportTimeoutRef.current)
    setReportState({ loading: false, report: null })
    setShowReport(false)
  }

  return (
    <>
      <aside className="w-56 h-full bg-[#161616] border-r border-[#2a2a2a] flex flex-col">
        {/* 앱 타이틀 */}
        <div className="drag-region h-12 flex items-center px-4 border-b border-[#2a2a2a]">
          <div className="no-drag flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[#d4d4d8] flex-shrink-0">
              <rect x="2" y="4"  width="14" height="2" rx="1" fill="currentColor"/>
              <rect x="2" y="8"  width="10" height="2" rx="1" fill="currentColor" opacity="0.7"/>
              <rect x="2" y="12" width="6"  height="2" rx="1" fill="currentColor" opacity="0.4"/>
            </svg>
            <span className="text-sm font-semibold text-[#e5e5e5]">Tidy</span>
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, Icon: NavIcon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-white/10 text-[#c8c8d0] font-medium'
                    : 'text-[#737373] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]'
                }`
              }
            >
              <NavIcon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 주간 리포트 버튼 */}
        <div className="px-2 pb-2">
          <button
            onClick={handleWeeklyReport}
            disabled={reportState.loading}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#737373] hover:text-[#e5e5e5] hover:bg-[#2a2a2a] rounded-md transition-colors disabled:opacity-50"
          >
            <IconReport size={14} />
            <span>{reportState.loading ? '생성 중...' : '주간 리포트'}</span>
          </button>
        </div>

        {/* 동기화 상태 */}
        <div className="px-3 py-3 border-t border-[#2a2a2a] space-y-1.5">
          {isSyncing ? (
            <div className="flex items-center gap-2 text-xs text-[#737373]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d8] animate-pulse" />
              <span>동기화 중...</span>
            </div>
          ) : (
            <>
              {syncStatus.gmail && (
                <div className="flex items-center gap-1.5 text-xs text-[#404040]">
                  <IconMail size={12} />
                  <span className="truncate">
                    {syncStatus.gmail.lastSynced
                      ? formatRelativeTime(syncStatus.gmail.lastSynced)
                      : '대기 중'}
                  </span>
                </div>
              )}
              {syncStatus.slack && (
                <div className="flex items-center gap-1.5 text-xs text-[#404040]">
                  <IconMessage size={12} />
                  <span className="truncate">
                    {syncStatus.slack.lastSynced
                      ? formatRelativeTime(syncStatus.slack.lastSynced)
                      : '대기 중'}
                  </span>
                </div>
              )}
              {!syncStatus.gmail && !syncStatus.slack && (
                <div className="text-xs text-[#333]">채널 연결 안 됨</div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* 주간 리포트 모달 */}
      {showReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowReport(false)}
        >
          <div
            className="bg-[#161616] border border-[#2a2a2a] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#2a2a2a] flex-shrink-0">
              <div className="flex items-center gap-2 text-[#a0a0a0]">
                <IconReport size={15} />
                <h3 className="text-sm font-semibold text-[#e5e5e5]">주간 리포트</h3>
              </div>
              <button
                onClick={() => setShowReport(false)}
                className="text-[#404040] hover:text-[#e5e5e5] transition-colors"
              >
                <IconClose size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {reportState.loading ? (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <div className="text-2xl animate-pulse">•••</div>
                  <p className="text-sm text-[#737373]">AI가 주간 리포트를 작성하는 중...</p>
                  <button
                    onClick={handleCancelReport}
                    className="text-xs text-[#505272] hover:text-[#9a9cb8] transition-colors px-3 py-1 rounded-md border border-[#2a2a2a] hover:border-[#404040]"
                  >
                    취소
                  </button>
                </div>
              ) : reportState.report ? (
                <pre className="text-xs text-[#a0a0a0] whitespace-pre-wrap leading-relaxed font-sans">
                  {reportState.report}
                </pre>
              ) : null}
            </div>
            {reportState.report && (
              <div className="px-5 py-3 border-t border-[#2a2a2a] flex-shrink-0 flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(reportState.report)}
                  className="text-xs text-[#c8c8d0] hover:text-[#818cf8] transition-colors"
                >
                  복사
                </button>
                <button
                  onClick={handleWeeklyReport}
                  className="text-xs text-[#737373] hover:text-[#a0a0a0] transition-colors"
                >
                  다시 생성
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  return `${Math.floor(mins / 60)}시간 전`
}
