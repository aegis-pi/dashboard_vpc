import { useState, useEffect, useCallback, useRef } from 'react'
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

// Fetches 1h HISTORY#STATE for each factory, derives risk_level transitions.
export function useFleetRecentChanges(factoryIds: string[]) {
  const [events, setEvents] = useState<RecentChange[]>([])
  const [loading, setLoading] = useState(false)
  const requestSeq = useRef(0)
  const mounted = useRef(true)
  const key = [...factoryIds].sort().join(',')

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async () => {
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      if (mounted.current) {
        setEvents([])
        setLoading(false)
      }
      return
    }
    if (mounted.current) setLoading(true)
    try {
      const results = await Promise.all(ids.map((id) => fetchFactoryHistory(id, '1h')))
      if (!mounted.current || requestSeq.current !== seq) return
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
    } catch {
      // Keep the last known change list when the optional history request fails.
    } finally {
      if (mounted.current && requestSeq.current === seq) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { events, loading, refresh }
}
