import { useState, useEffect, useCallback } from 'react'
import { fetchFactory } from '../api/client'
import type { FactoryDetail } from '../api/types'

const _cache = new Map<string, FactoryDetail>()

export function useFactory(factoryId: string) {
  const [data, setData] = useState<FactoryDetail | null>(() => _cache.get(factoryId) ?? null)
  const [loading, setLoading] = useState(() => !_cache.has(factoryId))
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(!_cache.has(factoryId))
    setError(null)
    try {
      const res = await fetchFactory(factoryId)
      _cache.set(factoryId, res)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [factoryId])

  useEffect(() => {
    const cached = _cache.get(factoryId) ?? null
    setData(cached)
    setLoading(cached === null)
    void load()
  }, [factoryId, load])

  return { data, loading, error, refresh: load }
}
