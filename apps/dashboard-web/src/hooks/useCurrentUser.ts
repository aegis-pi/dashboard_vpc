import { useCallback, useEffect, useState } from 'react'
import { fetchCurrentUser } from '../api/client'
import type { CurrentUser } from '../api/types'

let cachedUser: CurrentUser | null = null

export function useCurrentUser() {
  const [data, setData] = useState<CurrentUser | null>(cachedUser)
  const [loading, setLoading] = useState(cachedUser == null)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    setLoading(cachedUser == null)
    setError(null)
    try {
      cachedUser = await fetchCurrentUser()
      setData(cachedUser)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, refresh: load }
}
