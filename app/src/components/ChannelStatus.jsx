import { IconMail, IconMessage, IconPlug } from './Icons.jsx'

export default function ChannelStatus({ type, status, lastSynced, onSync }) {
  const config = {
    gmail: { Icon: IconMail,    label: 'Gmail' },
    slack: { Icon: IconMessage, label: 'Slack' },
  }[type] || { Icon: IconPlug, label: type }
  const { Icon } = config

  const statusConfig = {
    connected: { dot: 'bg-green-500', text: '연결됨', textColor: 'text-green-400' },
    syncing: { dot: 'bg-yellow-500 animate-pulse', text: '동기화 중', textColor: 'text-yellow-400' },
    disconnected: { dot: 'bg-[#404040]', text: '연결 안됨', textColor: 'text-[#737373]' },
    error: { dot: 'bg-red-500', text: '오류', textColor: 'text-red-400' },
  }[status] || { dot: 'bg-[#404040]', text: '알 수 없음', textColor: 'text-[#737373]' }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
      <div className="flex items-center gap-3">
        <Icon size={16} className="text-[#737373]" />
        <div>
          <p className="text-sm font-medium text-[#e5e5e5]">{config.label}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            <span className={`text-xs ${statusConfig.textColor}`}>{statusConfig.text}</span>
            {lastSynced && status === 'connected' && (
              <span className="text-xs text-[#404040]">
                · {formatRelativeTime(lastSynced)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 수동 동기화 버튼 */}
      {status === 'connected' && (
        <button
          onClick={() => onSync?.(type)}
          className="text-xs text-[#737373] hover:text-[#e5e5e5] bg-[#2a2a2a] hover:bg-[#333] px-2.5 py-1.5 rounded transition-colors"
        >
          지금 동기화
        </button>
      )}
    </div>
  )
}

function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  return `${Math.floor(mins / 60)}시간 전`
}
