import { useState, useEffect, useCallback } from 'react'
import { fetchFactoryHistory } from '../api/client'
import { normalizeHistoryItem } from '../utils/normalize'
import type { HistoryItem } from '../api/types'

export type HistoryWindow = '1h' | '6h' | '12h' | '24h'

export function useFactoryHistory(factoryId: string, window: HistoryWindow = '1h', enabled = true) {
  const [data, setData] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFactoryHistory(factoryId, window)
      setData(res.map(normalizeHistoryItem))
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [factoryId, window])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [load, enabled])

  return { data, loading, error, refresh: load }
}
