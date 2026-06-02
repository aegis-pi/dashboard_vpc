import { useState, useEffect, useCallback } from 'react'
import { fetchFactoryHistory } from '../api/client'
import { normalizeHistoryItem } from '../utils/normalize'
import type { HistoryItem } from '../api/types'

export type HistoryWindow = `${number}${'m' | 'h' | 'd'}`

const _cache = new Map<string, { data: HistoryItem[]; ts: number }>()
const CACHE_TTL_MS = 30_000

function cacheKey(factoryId: string, win: string, limit: number | undefined) {
  return `${factoryId}:${win}:${limit ?? ''}`
}

export function useFactoryHistory(
  factoryId: string,
  window: HistoryWindow = '1h',
  enabled = true,
  limit?: number,
) {
  const key = cacheKey(factoryId, window, limit)
  const hit = _cache.get(key)
  const fresh = hit !== undefined && Date.now() - hit.ts < CACHE_TTL_MS

  const [data, setData] = useState<HistoryItem[]>(fresh ? hit.data : [])
  const [loading, setLoading] = useState(!fresh)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async (force = false) => {
    const cached = _cache.get(key)
    if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setData(cached.data)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFactoryHistory(factoryId, window, limit)
      const normalized = res.map(normalizeHistoryItem)
      _cache.set(key, { data: normalized, ts: Date.now() })
      setData(normalized)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [key, factoryId, window, limit])

  const forceRefresh = useCallback(() => load(true), [load])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [load, enabled])

  return { data, loading, error, refresh: forceRefresh }
}
