import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchFactoryHistory } from '../api/client'
import { normalizeHistoryItem } from '../utils/normalize'
import type { HistoryItem, RiskLevel } from '../api/types'
import { HISTORY_LIMIT_10M, mergeHistoryItems } from './useFactoryHistory'

export interface RecentChange {
  factory_id: string
  from: RiskLevel
  to: RiskLevel
  score?: number
  ts: number
  top_cause_names?: string[]
}

const RECENT_WINDOW_MS = 10 * 60 * 1000

// Fetches HISTORY#STATE (10m) for all factories in one pass.
// Returns both derived recent-change events and raw history keyed by factory_id
// so callers can pass it down to cards without re-fetching.
// Stale-while-revalidate: previous results stay visible during background refresh.
export function useFleetRecentChanges(factoryIds: string[]) {
  const [events, setEvents] = useState<RecentChange[]>([])
  const [historyByFactory, setHistoryByFactory] = useState<Record<string, HistoryItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const requestSeq = useRef(0)
  const mounted = useRef(true)
  const historyRef = useRef<Record<string, HistoryItem[]>>({})
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
      if (mounted.current) {
        setEvents([])
        setHistoryByFactory({})
        setLoading(false)
        setRefreshing(false)
      }
      return
    }

    if (mounted.current) {
      if (hasDataRef.current) setRefreshing(true)
      else setLoading(true)
    }

    try {
      const results = await Promise.all(ids.map((id) => {
        const existing = historyRef.current[id] ?? []
        const latest = latestTimestamp(existing)
        return fetchFactoryHistory(id, '10m', HISTORY_LIMIT_10M, latest)
      }))
      if (!mounted.current || requestSeq.current !== seq) return

      const byFactory: Record<string, HistoryItem[]> = {}
      const all: RecentChange[] = []
      const cutoff = Date.now() - RECENT_WINDOW_MS

      ids.forEach((factoryId, idx) => {
        const raw = results[idx] ?? []
        const existing = historyRef.current[factoryId] ?? []
        const history = mergeHistoryItems(
          existing,
          raw.map(normalizeHistoryItem),
          '10m',
          HISTORY_LIMIT_10M,
        )
        byFactory[factoryId] = history

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
      historyRef.current = byFactory
      setEvents(all)
      setHistoryByFactory(byFactory)
    } catch {
      // Keep last known data on error.
    } finally {
      if (mounted.current && requestSeq.current === seq) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [key])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { events, historyByFactory, loading, refreshing, refresh }
}

function latestTimestamp(items: HistoryItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const ts = items[i]?.timestamp
    if (typeof ts === 'string' && ts) return ts
  }
  return undefined
}
