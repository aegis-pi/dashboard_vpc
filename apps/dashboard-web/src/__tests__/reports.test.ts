import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, AuthError } from '../api/client'
import { recentDates } from '../adapters/reports'
import { classifyReportError } from '../utils/reportError'

describe('classifyReportError', () => {
  it('shows missing report state only for 404 responses', () => {
    expect(classifyReportError(new ApiError('missing', 404))).toBe('not_found')
  })

  it('shows API failure state for timeout and auth errors', () => {
    expect(classifyReportError(new ApiError('timeout', 504))).toBe('error')
    expect(classifyReportError(new AuthError('expired'))).toBe('error')
    expect(classifyReportError(new Error('network'))).toBe('error')
  })
})

describe('recentDates', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('can start quick report dates before today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T12:00:00Z'))

    expect(recentDates(3, 1)).toEqual([
      '2026-06-03',
      '2026-06-02',
      '2026-06-01',
    ])
  })
})
