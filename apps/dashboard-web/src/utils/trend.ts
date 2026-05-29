import type { HistoryItem } from '../api/types'

const TREND_WINDOW_MS = 10 * 60 * 1000

export function recentRiskScores(items: HistoryItem[], windowMs = TREND_WINDOW_MS): number[] {
  const cutoff = Date.now() - windowMs
  return items
    .filter((item) => {
      if (!item.timestamp) return false
      const ts = new Date(item.timestamp).getTime()
      return Number.isFinite(ts) && ts >= cutoff
    })
    .map((item) => item.risk_score)
    .filter((value): value is number => value != null)
}
