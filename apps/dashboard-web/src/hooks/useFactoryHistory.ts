import { useState, useEffect, useCallback } from 'react'
import { fetchFactoryHistory } from '../api/client'
import type { HistoryItem } from '../api/types'

export type HistoryWindow = '1h' | '2h' | '24h'

export function useFactoryHistory(factoryId: string, window: HistoryWindow = '1h') {
  const [data, setData] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFactoryHistory(factoryId, window)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [factoryId, window])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, refresh: load }
}
