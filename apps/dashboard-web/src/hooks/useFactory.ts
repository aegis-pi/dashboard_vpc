import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchFactory } from '../api/client'
import type { FactoryDetail } from '../api/types'

const _cache = new Map<string, FactoryDetail>()

export function useFactory(factoryId: string) {
  const [data, setData] = useState<FactoryDetail | null>(() => _cache.get(factoryId) ?? null)
  const [loading, setLoading] = useState(() => !_cache.has(factoryId))
  const [error, setError] = useState<Error | null>(null)
  const requestSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    setLoading(!_cache.has(factoryId))
    setError(null)
    try {
      const res = await fetchFactory(factoryId)
      if (requestSeq.current !== seq) return
      _cache.set(factoryId, res)
      setData(res)
    } catch (e) {
      if (requestSeq.current !== seq) return
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (requestSeq.current === seq) setLoading(false)
    }
  }, [factoryId])

  useEffect(() => {
    requestSeq.current += 1
    const cached = _cache.get(factoryId) ?? null
    setData(cached)
    setLoading(cached === null)
    void load()
  }, [factoryId, load])

  return { data, loading, error, refresh: load }
}
