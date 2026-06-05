import { describe, expect, it } from 'vitest'
import {
  buildOverviewCards,
  cloudInfraStatusLabel,
  cloudInfraTone,
  historyStatusSeries,
  secondsLabel,
} from '../adapters/cloudInfra'
import type { CloudInfraStatus } from '../api/types'

const sample: CloudInfraStatus = {
  available: true,
  overall_status: 'normal',
  fast_age_seconds: 42,
  slow_age_seconds: 320,
  fast: {
    backend_runtime: {
      status: 'normal',
      ecs: {
        desired_count: 1,
        running_count: 1,
        cpu_utilization_avg: 4.3,
        memory_utilization_avg: 27.1,
      },
      alb: {
        healthy_host_count: 1,
        target_5xx_count_5m: 0,
      },
    },
    data_pipeline: {
      status: 'warning',
      lambdas: [
        { name: 'processor', invocations_5m: 10, errors_5m: 1, throttles_5m: 0 },
        { name: 'aggregator', invocations_5m: 1, errors_5m: 0, throttles_5m: 2 },
      ],
      dynamodb: { system_errors_5m: 0 },
      schedulers: [{ name: 'refresh', state: 'ENABLED' }],
    },
    factory_freshness: {
      status: 'normal',
      factories: [
        { factory_id: 'factory-a', latest_infra_state_age_seconds: 3 },
        { factory_id: 'factory-b', latest_infra_state_age_seconds: 140 },
      ],
    },
  },
  slow: {
    eks_management: {
      status: 'normal',
      nodes: { ready: 2, total: 2 },
      pods: { running: 22, failed: 0 },
      argocd: { synced: 3, applications_total: 3 },
    },
  },
}

describe('cloud infra adapter', () => {
  it('maps status to tone and label', () => {
    expect(cloudInfraTone('normal')).toBe('safe')
    expect(cloudInfraTone('warning')).toBe('warn')
    expect(cloudInfraTone('critical')).toBe('crit')
    expect(cloudInfraTone('unknown')).toBe('unk')
    expect(cloudInfraStatusLabel('critical')).toBe('위험')
  })

  it('formats age seconds compactly', () => {
    expect(secondsLabel(null)).toBe('—')
    expect(secondsLabel(42)).toBe('42s')
    expect(secondsLabel(180)).toBe('3m')
    expect(secondsLabel(7200)).toBe('2h')
  })

  it('builds the four requested overview cards', () => {
    const cards = buildOverviewCards(sample)
    expect(cards.map((card) => card.id)).toEqual(['pipeline', 'runtime', 'freshness', 'management'])
    expect(cards[0]?.primary).toBe('1 err')
    expect(cards[0]?.secondary).toBe('2 throttle')
    expect(cards[1]?.primary).toBe('1/1')
    expect(cards[2]?.secondary).toBe('1 delayed')
    expect(cards[3]?.primary).toBe('2/2')
  })

  it('converts history status to sparkline series values', () => {
    expect(historyStatusSeries([
      { overall_status: 'unknown' },
      { overall_status: 'normal' },
      { overall_status: 'warning' },
      { overall_status: 'critical' },
    ])).toEqual([0, 1, 2, 3])
  })
})
