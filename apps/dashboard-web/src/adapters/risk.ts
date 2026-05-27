import type { HistoryItem, RiskLevel } from '../api/types'

export interface RecentChangeEvent {
  factory_id: string
  from: RiskLevel
  to: RiskLevel
  score?: number
  ts: number
}

export function deriveRecentChanges(factoryId: string, history: HistoryItem[]): RecentChangeEvent[] {
  const changes: RecentChangeEvent[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!
    const curr = history[i]!
    if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
      const ts = curr.timestamp ? new Date(curr.timestamp as string).getTime() : 0
      changes.push({
        factory_id: factoryId,
        from: prev.risk_level,
        to: curr.risk_level,
        score: curr.risk_score,
        ts,
      })
    }
  }
  return changes
}

export function riskLevelKr(level?: string): string {
  if (level === 'safe') return '안전'
  if (level === 'warning') return '주의'
  if (level === 'danger') return '위험'
  return level ?? '—'
}
