import { useCallback, useEffect, useState } from 'react'
import { fetchCloudInfraHistory } from '../api/client'
import type { CloudInfraHistoryItem } from '../api/types'

export type CloudInfraHistoryWindow = '1h' | '6h' | '24h'
export type CloudInfraHistoryTrack = 'fast' | 'slow'

const _cache = new Map<string, { data: CloudInfraHistoryItem[]; ts: number }>()
const CACHE_TTL_MS = 30_000

function cacheKey(window: CloudInfraHistoryWindow, track: CloudInfraHistoryTrack, limit?: number) {
  return `${window}:${track}:${limit ?? ''}`
}

export function useCloudInfraHistory(
  window: CloudInfraHistoryWindow = '1h',
  track: CloudInfraHistoryTrack = 'fast',
  enabled = true,
  limit?: number,
) {
  const key = cacheKey(window, track, limit)
  const hit = _cache.get(key)
  const fresh = hit !== undefined && Date.now() - hit.ts < CACHE_TTL_MS
  const [data, setData] = useState<CloudInfraHistoryItem[]>(fresh ? hit.data : [])
  const [loading, setLoading] = useState(enabled && !fresh)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async (force = false) => {
    if (!enabled) return
    const cached = _cache.get(key)
    if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setData(cached.data)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchCloudInfraHistory(window, track, limit)
      _cache.set(key, { data: res, ts: Date.now() })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [enabled, key, limit, track, window])

  const refresh = useCallback(() => load(true), [load])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, refresh }
}
