import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaleBadge } from '../components/Badge'
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
  it('returns dash for undefined', () => {
    expect(relTime(undefined)).toBe('—')
  })
  it('returns 방금 for recent timestamp', () => {
    const now = new Date().toISOString()
    expect(relTime(now)).toBe('방금')
  })
})

describe('StaleBadge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function renderBadge(secondsAgo: number, snapshotReceivedAt = '2026-06-02T12:00:00.000Z') {
    const ts = new Date(new Date(snapshotReceivedAt).getTime() - secondsAgo * 1000).toISOString()
    return renderToStaticMarkup(createElement(StaleBadge, { lastInfraStateAt: ts, snapshotReceivedAt }))
  }

  it('does not render at 60 seconds or below', () => {
    vi.useFakeTimers()
    expect(renderBadge(60)).toBe('')
  })

  it('renders warning after 60 seconds', () => {
    vi.useFakeTimers()
    const html = renderBadge(61)
    expect(html).toContain('데이터 지연')
    expect(html).toContain('warn')
    expect(html).toContain('infra 61s')
  })

  it('renders critical after 120 seconds', () => {
    vi.useFakeTimers()
    const html = renderBadge(121)
    expect(html).toContain('crit')
    expect(html).toContain('infra 121s')
  })

  it('keeps the displayed age fixed until a new snapshot is received', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T12:05:00.000Z'))
    const html = renderBadge(61, '2026-06-02T12:00:00.000Z')
    expect(html).toContain('infra 61s')
    expect(html).not.toContain('infra 361s')
  })
})
