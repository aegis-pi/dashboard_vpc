import { useState, useEffect, useCallback } from 'react'
import { fetchFactories } from '../api/client'
import type { FleetResponse } from '../api/types'

export function useFactories() {
  const [data, setData] = useState<FleetResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFactories()
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, refresh: load }
}
