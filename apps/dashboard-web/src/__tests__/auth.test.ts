import { describe, expect, it } from 'vitest'
import type { User } from 'oidc-client-ts'
import { hasValidSession } from '../auth/auth'

describe('hasValidSession', () => {
  it('rejects missing and expired users', () => {
    expect(hasValidSession(null)).toBe(false)
    expect(hasValidSession(undefined)).toBe(false)
    expect(hasValidSession({ expired: true } as User)).toBe(false)
  })

  it('accepts an unexpired user session', () => {
    expect(hasValidSession({ expired: false } as User)).toBe(true)
  })
})
