import { useState, useEffect, useCallback } from 'react'
import { fetchFactory } from '../api/client'
import type { FactoryDetail } from '../api/types'

export function useFactory(factoryId: string) {
  const [data, setData] = useState<FactoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFactory(factoryId)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [factoryId])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, refresh: load }
}
