import type { WsStatus } from '../hooks/useWebSocket'

const STATUS_META: Record<WsStatus, { label: string }> = {
  connecting:  { label: '연결 중' },
  connected:   { label: '실시간 연결' },
  reconnecting:{ label: '재연결 중' },
  offline:     { label: '오프라인' },
}

interface ConnStatusProps {
  status: WsStatus
  lastMessage?: Record<string, unknown> | null
}

export function ConnStatus({ status }: ConnStatusProps) {
  const meta = STATUS_META[status]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className={`conn-dot ${status}`} />
      <span className="mono micro">{meta.label}</span>
    </div>
  )
}
