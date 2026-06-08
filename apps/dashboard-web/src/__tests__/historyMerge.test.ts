import { describe, expect, it, vi } from 'vitest'
import {
  HISTORY_LIMIT_10M,
  historyItemFromLatest,
  mergeHistoryItems,
} from '../hooks/useFactoryHistory'
import type { HistoryItem } from '../api/types'

describe('history merge helpers', () => {
  it('deduplicates by timestamp, keeps order, and trims to the requested window cap', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'))

    const current: HistoryItem[] = [
      point('2026-06-08T11:50:00.000Z', 80),
      point('2026-06-08T11:55:00.000Z', 81),
    ]
    const incoming: HistoryItem[] = [
      point('2026-06-08T11:55:00.000Z', 82),
      point('2026-06-08T11:59:00.000Z', 83),
    ]

    const merged = mergeHistoryItems(current, incoming, '10m', HISTORY_LIMIT_10M)

    expect(merged.map((p) => p.timestamp)).toEqual([
      '2026-06-08T11:50:00.000Z',
      '2026-06-08T11:55:00.000Z',
      '2026-06-08T11:59:00.000Z',
    ])
    expect(merged[1]?.risk_score).toBe(82)

    vi.useRealTimers()
  })

  it('converts a WebSocket LATEST message into a chartable history point', () => {
    const item = historyItemFromLatest({
      factory_id: 'factory-a',
      updated_at: '2026-06-08T12:00:03.000Z',
      risk: { score: 77, level: 'warning' },
      factory_state: { temperature_celsius: 29.5 },
    })

    expect(item.timestamp).toBe('2026-06-08T12:00:03.000Z')
    expect(item.risk_score).toBe(77)
    expect(item.risk_level).toBe('warning')
    expect(item.temperature_celsius_avg).toBe(29.5)
  })
})

function point(timestamp: string, riskScore: number): HistoryItem {
  return { timestamp, risk_score: riskScore }
}
