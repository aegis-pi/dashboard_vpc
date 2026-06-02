import type { RiskLevel, PipelineStatus } from '../api/types'

// ─── Risk level badge ─────────────────────────────────────────────────
const LEVEL_META: Record<string, { label: string; tone: string }> = {
  safe:    { label: '안전', tone: 'safe' },
  warning: { label: '주의', tone: 'warn' },
  danger:  { label: '위험', tone: 'crit' },
}

interface LevelBadgeProps {
  level?: RiskLevel | string
  size?: 'sm' | 'md' | 'lg'
}

export function LevelBadge({ level, size = 'md' }: LevelBadgeProps) {
  const meta = LEVEL_META[level ?? ''] ?? { label: '미계산', tone: 'unk' }
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
const PIPELINE_META: Record<string, { label: string; tone: string }> = {
  normal:   { label: '정상',  tone: 'safe' },
  warning:  { label: '주의',  tone: 'warn' },
  critical: { label: '위험',  tone: 'crit' },
}

export function PipelineBadge({ status }: { status?: PipelineStatus | string }) {
  const meta = PIPELINE_META[status ?? ''] ?? { label: '미수신', tone: 'unk' }
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: '3px 6px', fontSize: 10.5 }}>
      <span className="dot" />
      pipeline · {meta.label}
    </span>
  )
}

// ─── Staleness badge ──────────────────────────────────────────────────
function ageSeconds(ts?: string): number {
  if (!ts) return 9999
  return Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
}

export function StaleBadge({
  lastInfraStateAt,
}: {
  lastInfraStateAt?: string
}) {
  const iAge = ageSeconds(lastInfraStateAt)
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
