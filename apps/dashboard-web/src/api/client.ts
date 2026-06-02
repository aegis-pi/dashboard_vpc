import { getAccessToken } from '../auth/auth'
import type {
  FleetResponse,
  FactoryDetail,
  HistoryItem,
  ReportItem,
  FactorySummary,
} from './types'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

// ─── HTTP helper ─────────────────────────────────────────────────────
async function apiFetch<T>(path: string, requiresAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (requiresAuth) {
    const token = await getAccessToken()
    if (!token) {
      throw new AuthError('인증 토큰이 없습니다. 로그인이 필요합니다.')
    }
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { headers })

  if (res.status === 401) {
    throw new AuthError('인증이 만료됐거나 유효하지 않습니다.')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(`API 오류 ${res.status}: ${body}`, res.status)
  }

  return res.json() as Promise<T>
}

export class AuthError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'AuthError'
  }
}

export class ApiError extends Error {
  constructor(msg: string, public status: number) {
    super(msg)
    this.name = 'ApiError'
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────
export async function fetchHealthz(): Promise<{ status: string }> {
  return apiFetch('/healthz', false)
}

export async function fetchFactories(): Promise<FleetResponse> {
  const raw = await apiFetch<unknown>('/factories')
  const snapshotReceivedAt = new Date().toISOString()
  const withSnapshotTime = (f: FactorySummary): FactorySummary => ({
    ...f,
    snapshot_received_at: snapshotReceivedAt,
  })

  // Handle list or object response
  if (Array.isArray(raw)) {
    return { factories: (raw as FactorySummary[]).map(withSnapshotTime) }
  }
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.factories)) {
    const res = obj as unknown as FleetResponse
    return { ...res, factories: res.factories.map(withSnapshotTime) }
  }
  return { factories: [] }
}

export async function fetchFactory(factoryId: string): Promise<FactoryDetail> {
  const res = await apiFetch<FactoryDetail>(`/factories/${factoryId}`)
  const snapshotReceivedAt = new Date().toISOString()
  return { ...res, snapshot_received_at: snapshotReceivedAt }
}

export async function fetchFactoryHistory(
  factoryId: string,
  window: string = '1h',
  limit?: number,
): Promise<HistoryItem[]> {
  const params = new URLSearchParams({ window })
  if (limit != null) params.set('limit', String(limit))
  const raw = await apiFetch<unknown>(`/factories/${factoryId}/history?${params.toString()}`)

  if (Array.isArray(raw)) return raw as HistoryItem[]
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.items)) return obj.items as HistoryItem[]
  if (Array.isArray(obj.history)) return obj.history as HistoryItem[]
  return []
}

export async function fetchReports(): Promise<ReportItem[]> {
  const raw = await apiFetch<unknown>('/reports')
  if (Array.isArray(raw)) return raw as ReportItem[]
  return []
}

export async function fetchReport(
  reportDate: string,
  factoryId: string,
): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new AuthError('인증 토큰 없음')

  const res = await fetch(`${BASE}/reports/${reportDate}/${factoryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new AuthError('인증 만료')
  if (!res.ok) throw new ApiError(`API 오류 ${res.status}`, res.status)
  return res.text()
}
