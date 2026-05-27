import { useState, useEffect } from 'react'
import { fetchFactoryHistory } from '../api/client'
import { normalizeHistoryItem } from '../utils/normalize'
import type { RiskLevel } from '../api/types'

export interface RecentChange {
  factory_id: string
  from: RiskLevel
  to: RiskLevel
  score?: number
  ts: number
}

// Fetches 24h HISTORY#STATE for each factory, derives risk_level transitions.
export function useFleetRecentChanges(factoryIds: string[]) {
  const [events, setEvents] = useState<RecentChange[]>([])
  const [loading, setLoading] = useState(false)
  const key = [...factoryIds].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    setLoading(true)
    Promise.all(ids.map((id) => fetchFactoryHistory(id, '24h')))
      .then((results) => {
        if (cancelled) return
        const all: RecentChange[] = []
        ids.forEach((factoryId, idx) => {
          const history = (results[idx] ?? []).map(normalizeHistoryItem)
          for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1]!
            const curr = history[i]!
            if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
              const ts = curr.timestamp ? new Date(curr.timestamp).getTime() : 0
              all.push({
                factory_id: factoryId,
                from: prev.risk_level,
                to: curr.risk_level,
                score: curr.risk_score,
                ts,
              })
            }
          }
        })
        all.sort((a, b) => b.ts - a.ts)
        setEvents(all)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [key])

  return { events, loading }
}
