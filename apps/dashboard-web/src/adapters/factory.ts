import type { FactorySummary } from '../api/types'

export interface FactoryViewModel {
  factory_id: string
  risk_level: string | undefined
  risk_score: number | undefined
  top_causes: Array<{ name: string; value?: number | null; contribution?: number | null }>
  node_ready: number | undefined
  node_total: number | undefined
  pipeline: string | undefined
  env_type: string | undefined
  updated_at: string | undefined
  last_factory_state_at: string | undefined
  last_infra_state_at: string | undefined
}

export function adaptFactorySummary(f: FactorySummary): FactoryViewModel {
  const rawCauses = f.top_causes ?? f.risk?.top_causes ?? []
  const top_causes = rawCauses.map((c) => {
    if (typeof c === 'string') return { name: c }
    return { name: c.name ?? c.field ?? '?', value: c.value, contribution: c.contribution }
  })
  return {
    factory_id: f.factory_id,
    risk_level: f.risk_level ?? f.risk?.level,
    risk_score: f.risk_score ?? f.risk?.score,
    top_causes,
    node_ready: f.node_ready ?? f.infra_state?.node_summary?.ready,
    node_total: f.node_total ?? f.infra_state?.node_summary?.total,
    pipeline: (f.pipeline_status as string | undefined) ?? 'normal',
    env_type: f.environment_type,
    updated_at: f.updated_at,
    last_factory_state_at: f.last_factory_state_at,
    last_infra_state_at: f.last_infra_state_at,
  }
}

export function adaptSidebarFactory(f: FactorySummary) {
  return {
    factory_id: f.factory_id,
    risk_level: f.risk_level ?? f.risk?.level,
    risk_score: f.risk_score ?? f.risk?.score,
  }
}
