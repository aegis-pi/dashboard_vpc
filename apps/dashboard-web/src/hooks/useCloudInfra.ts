import { useCallback, useEffect, useState } from 'react'
import { fetchCloudInfra } from '../api/client'
import type { CloudInfraStatus } from '../api/types'

let _cache: CloudInfraStatus | null = null

export function useCloudInfra(enabled = true) {
  const [data, setData] = useState<CloudInfraStatus | null>(_cache)
  const [loading, setLoading] = useState(enabled && _cache === null)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(_cache === null)
    setError(null)
    try {
      const res = await fetchCloudInfra()
      _cache = res
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, refresh: load }
}
