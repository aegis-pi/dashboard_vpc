import { describe, it, expect } from 'vitest'
import { riskColor, relTime } from '../utils/format'

describe('riskColor', () => {
  it('returns crit for danger', () => {
    expect(riskColor('danger')).toBe('var(--crit)')
  })
  it('returns warn for warning', () => {
    expect(riskColor('warning')).toBe('var(--warn)')
  })
  it('returns safe for safe', () => {
    expect(riskColor('safe')).toBe('var(--safe)')
  })
  it('returns ink-4 for unknown level', () => {
    expect(riskColor(undefined)).toBe('var(--ink-4)')
  })
})

describe('relTime', () => {
  it('returns 미수신 for undefined', () => {
    expect(relTime(undefined)).toBe('미수신')
  })
  it('returns 방금 for recent timestamp', () => {
    const now = new Date().toISOString()
    expect(relTime(now)).toBe('방금')
  })
})
