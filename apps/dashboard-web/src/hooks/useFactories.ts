import { useState, useEffect, useCallback } from 'react'
import { fetchFactories } from '../api/client'
import type { FleetResponse } from '../api/types'

// Module-level cache: retains the last successful fetch result across page
// navigations so the sidebar factories list is available immediately on mount.
let _cache: FleetResponse | null = null

export function useFactories() {
  const [data, setData] = useState<FleetResponse | null>(_cache)
  const [loading, setLoading] = useState(_cache === null)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(_cache === null)
    setError(null)
    try {
      const res = await fetchFactories()
      _cache = res
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
