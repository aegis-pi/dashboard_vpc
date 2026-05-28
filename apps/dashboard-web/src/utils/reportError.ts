import { ApiError } from '../api/client'

export function classifyReportError(e: unknown): 'not_found' | 'error' {
  if (e instanceof ApiError && e.status === 404) return 'not_found'
  return 'error'
}
