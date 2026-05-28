import { describe, expect, it } from 'vitest'
import { ApiError, AuthError } from '../api/client'
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
