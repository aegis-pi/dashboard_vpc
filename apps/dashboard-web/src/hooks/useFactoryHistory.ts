import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchFactoryHistory } from '../api/client'
import { normalizeHistoryItem } from '../utils/normalize'
import type { HistoryItem } from '../api/types'

export type HistoryWindow = `${number}${'m' | 'h' | 'd'}`

const _cache = new Map<string, { data: HistoryItem[]; ts: number }>()
const CACHE_TTL_MS = 30_000
export const HISTORY_LIMIT_10M = 250
export const HISTORY_LIMIT_1H = 2000

function cacheKey(factoryId: string, win: string, limit: number | undefined) {
  return `${factoryId}:${win}:${limit ?? ''}`
}

function timestampOf(item: HistoryItem): string {
  return String(item.timestamp ?? item.updated_at ?? item.sk ?? '')
}

function latestTimestamp(items: HistoryItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const ts = timestampOf(items[i]!)
    if (ts) return ts
  }
  return undefined
}

function cutoffForWindow(window: string): number {
  const amount = Number(window.slice(0, -1))
  const unit = window.slice(-1)
  const ms =
    unit === 'm' ? amount * 60_000 :
    unit === 'h' ? amount * 60 * 60_000 :
    unit === 'd' ? amount * 24 * 60 * 60_000 : 60 * 60_000
  return Date.now() - ms
}

export function mergeHistoryItems(
  current: HistoryItem[],
  incoming: HistoryItem[],
  window: string,
  maxItems?: number,
): HistoryItem[] {
  const cap = maxItems ?? (window === '10m' ? HISTORY_LIMIT_10M : HISTORY_LIMIT_1H)
  const byTs = new Map<string, HistoryItem>()
  for (const item of [...current, ...incoming].map(normalizeHistoryItem)) {
    const ts = timestampOf(item)
    if (ts) byTs.set(ts, item)
  }
  const cutoff = cutoffForWindow(window)
  return [...byTs.values()]
    .filter((item) => {
      const ts = Date.parse(timestampOf(item))
      return Number.isFinite(ts) && ts >= cutoff
    })
    .sort((a, b) => timestampOf(a).localeCompare(timestampOf(b)))
    .slice(-cap)
}

export function historyItemFromLatest(item: Record<string, unknown>): HistoryItem {
  const factoryState = item.factory_state as Record<string, unknown> | undefined
  const infraState = item.infra_state as Record<string, unknown> | undefined
  const timestamp =
    item.updated_at ??
    factoryState?.source_timestamp ??
    infraState?.source_timestamp
  return normalizeHistoryItem({
    ...(item as HistoryItem),
    timestamp: typeof timestamp === 'string' ? timestamp : new Date().toISOString(),
  })
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
  const dataRef = useRef(data)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const load = useCallback(async (force = false) => {
    const cached = _cache.get(key)
    if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setData(cached.data)
      setLoading(false)
      return
    }
    const base = cached?.data ?? dataRef.current
    setLoading(base.length === 0)
    setError(null)
    try {
      const since = force ? latestTimestamp(base) : undefined
      const res = await fetchFactoryHistory(factoryId, window, limit, since)
      const normalized = res.map(normalizeHistoryItem)
      const merged = since ? mergeHistoryItems(base, normalized, window, limit) : normalized
      _cache.set(key, { data: merged, ts: Date.now() })
      dataRef.current = merged
      setData(merged)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [key, factoryId, window, limit])

  const forceRefresh = useCallback(() => load(true), [load])
  const append = useCallback((item: HistoryItem) => {
    const current = _cache.get(key)?.data ?? []
    const merged = mergeHistoryItems(current, [item], window, limit)
    _cache.set(key, { data: merged, ts: Date.now() })
    dataRef.current = merged
    setData(merged)
  }, [key, window, limit])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [load, enabled])

  return { data, loading, error, refresh: forceRefresh, append }
}
