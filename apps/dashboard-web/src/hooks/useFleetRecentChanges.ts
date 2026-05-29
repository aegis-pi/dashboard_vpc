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
  top_cause_names?: string[]
}

const SELF_REFRESH_MS = 60_000

const RECENT_WINDOW_MS = 10 * 60 * 1000

// Fetches recent HISTORY#STATE for each factory, derives risk_level transitions.
// Manages its own 60s refresh cycle — callers do not need to drive it.
// Stale-while-revalidate: previous results stay visible during background refresh.
export function useFleetRecentChanges(factoryIds: string[]) {
  const [events, setEvents] = useState<RecentChange[]>([])
  const [loading, setLoading] = useState(false)      // first-load only (no prior data)
  const [refreshing, setRefreshing] = useState(false) // background refresh with prior data
  const requestSeq = useRef(0)
  const mounted = useRef(true)
  const key = [...factoryIds].sort().join(',')
  const hasDataRef = useRef(false)
  hasDataRef.current = events.length > 0

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async () => {
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      if (mounted.current) { setEvents([]); setLoading(false); setRefreshing(false) }
      return
    }

    if (mounted.current) {
      if (hasDataRef.current) setRefreshing(true)
      else setLoading(true)
    }

    try {
      // Backend serves raw HISTORY#STATE for 1h; derive the 10m view client-side.
      const results = await Promise.all(ids.map((id) => fetchFactoryHistory(id, '1h')))
      if (!mounted.current || requestSeq.current !== seq) return

      const all: RecentChange[] = []
      const cutoff = Date.now() - RECENT_WINDOW_MS
      ids.forEach((factoryId, idx) => {
        const history = (results[idx] ?? []).map(normalizeHistoryItem)
        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1]!
          const curr = history[i]!
          if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
            const ts = curr.timestamp ? new Date(curr.timestamp).getTime() : 0
            if (ts < cutoff) continue
            all.push({
              factory_id: factoryId,
              from: prev.risk_level,
              to: curr.risk_level,
              score: curr.risk_score,
              ts,
              top_cause_names: curr.top_cause_names,
            })
          }
        }
      })
      all.sort((a, b) => b.ts - a.ts)
      setEvents(all)
    } catch {
      // Keep last known list on error.
    } finally {
      if (mounted.current && requestSeq.current === seq) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [key])

  // Initial load + re-run when factory list changes.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Self-managed 60s background refresh — independent of parent refresh interval.
  useEffect(() => {
    const id = window.setInterval(() => { void refresh() }, SELF_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  return { events, loading, refreshing, refresh }
}
