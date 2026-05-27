import { describe, it, expect } from 'vitest'
import { REFRESH_INTERVAL_OPTIONS } from '../components/Layout'

describe('REFRESH_INTERVAL_OPTIONS', () => {
  it('exposes the operator refresh intervals in order', () => {
    expect(REFRESH_INTERVAL_OPTIONS).toEqual([
      { label: 'Refresh: Off', value: 0 },
      { label: '5s', value: 5000 },
      { label: '10s', value: 10000 },
      { label: '30s', value: 30000 },
      { label: '1m', value: 60000 },
    ])
  })
})
