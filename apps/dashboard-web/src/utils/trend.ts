import type { HistoryItem } from '../api/types'

const TREND_WINDOW_MS = 10 * 60 * 1000

export interface TrendPoint {
  timestamp: string
  value: number
}

export function recentRiskScores(items: HistoryItem[], windowMs = TREND_WINDOW_MS): number[] {
  return recentRiskPoints(items, windowMs).map((point) => point.value)
}

export function recentRiskPoints(items: HistoryItem[], windowMs = TREND_WINDOW_MS): TrendPoint[] {
  const cutoff = Date.now() - windowMs
  return items
    .filter((item) => {
      if (!item.timestamp) return false
      const ts = new Date(item.timestamp).getTime()
      return Number.isFinite(ts) && ts >= cutoff
    })
    .map((item) => ({
      timestamp: item.timestamp!,
      value: item.risk_score,
    }))
    .filter((point): point is TrendPoint => point.value != null)
}
