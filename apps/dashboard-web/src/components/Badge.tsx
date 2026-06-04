import type { RiskLevel, PipelineStatus } from '../api/types'
import { statusMeta, type StatusTone } from '../utils/status'

interface StatusMeta {
  label: string
  tone: StatusTone
}

// ─── Risk level badge ─────────────────────────────────────────────────
const LEVEL_META: Record<string, StatusMeta> = {
  safe:    { label: '안전', tone: 'safe' },
  warning: { label: '주의', tone: 'warn' },
  danger:  { label: '위험', tone: 'crit' },
}

interface LevelBadgeProps {
  level?: RiskLevel | string
  size?: 'sm' | 'md' | 'lg'
}

export function LevelBadge({ level, size = 'md' }: LevelBadgeProps) {
  const meta = LEVEL_META[level ?? ''] ?? statusMeta(level)
  const padStyle = size === 'sm' ? '3px 6px' : size === 'lg' ? '5px 12px' : '4px 8px'
  const fontSize = size === 'sm' ? 10.5 : size === 'lg' ? 13 : 11.5
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: padStyle, fontSize }}>
      <span className="dot" />
      {meta.label}
    </span>
  )
}

// ─── Pipeline badge ───────────────────────────────────────────────────
const PIPELINE_META: Record<string, StatusMeta> = {
  normal:   { label: '정상',  tone: 'safe' },
  warning:  { label: '주의',  tone: 'warn' },
  critical: { label: '위험',  tone: 'crit' },
}

export function PipelineBadge({ status }: { status?: PipelineStatus | string }) {
  const meta = PIPELINE_META[status ?? ''] ?? statusMeta(status)
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: '3px 6px', fontSize: 10.5 }}>
      <span className="dot" />
      pipeline · {meta.label}
    </span>
  )
}

// ─── Staleness badge ──────────────────────────────────────────────────
function ageSeconds(ts?: string, nowTs?: string): number {
  if (!ts) return 9999
  const now = nowTs ? new Date(nowTs).getTime() : Date.now()
  return Math.floor((now - new Date(ts).getTime()) / 1000)
}

export function StaleBadge({
  lastInfraStateAt,
  snapshotReceivedAt,
}: {
  lastInfraStateAt?: string
  snapshotReceivedAt?: string
}) {
  const iAge = ageSeconds(lastInfraStateAt, snapshotReceivedAt)
  if (iAge <= 60) return null
  const isCrit = iAge > 120
  return (
    <span className={`pill ${isCrit ? 'crit' : 'warn'}`} style={{ padding: '3px 6px', fontSize: 10 }}>
      <span className="dot" />
      데이터 지연
      <span className="mono tnum" style={{ marginLeft: 4, fontSize: 10 }}>
        infra {iAge}s
      </span>
    </span>
  )
}
