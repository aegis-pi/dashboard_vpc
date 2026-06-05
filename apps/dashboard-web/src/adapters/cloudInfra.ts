import type {
  CloudInfraHistoryItem,
  CloudInfraStatus,
  CloudInfraStatusValue,
} from '../api/types'

export type CloudInfraTone = 'safe' | 'warn' | 'crit' | 'unk'

export function cloudInfraTone(status?: CloudInfraStatusValue | string): CloudInfraTone {
  const normalized = status?.toLowerCase()
  if (normalized === 'normal') return 'safe'
  if (normalized === 'available' || normalized === 'active' || normalized === 'healthy' || normalized === 'enabled') return 'safe'
  if (normalized === 'warning') return 'warn'
  if (normalized === 'critical') return 'crit'
  if (normalized === 'stopped' || normalized === 'failed' || normalized === 'deleting') return 'crit'
  return 'unk'
}

export function cloudInfraDotColor(status?: CloudInfraStatusValue | string): string {
  const tone = cloudInfraTone(status)
  if (tone === 'safe') return 'var(--safe)'
  if (tone === 'warn') return 'var(--warn)'
  if (tone === 'crit') return 'var(--crit)'
  return 'var(--chrome-ink-3)'
}

export function cloudInfraStatusLabel(status?: CloudInfraStatusValue | string): string {
  const normalized = status?.toLowerCase()
  if (normalized === 'normal') return '정상'
  if (normalized === 'warning') return '주의'
  if (normalized === 'critical') return '위험'
  if (status && normalized !== 'unknown') return status
  return '미확인'
}

export function secondsLabel(seconds?: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

export function numberLabel(value?: number | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '-'
  return Number(value).toFixed(digits)
}

export interface CloudInfraOverviewCard {
  id: string
  title: string
  status: CloudInfraStatusValue | string | undefined
  primary: string
  secondary: string
  detail: string
}

export function buildOverviewCards(data: CloudInfraStatus): CloudInfraOverviewCard[] {
  const runtime = data.fast?.backend_runtime
  const ecs = runtime?.ecs
  const alb = runtime?.alb
  const pipeline = data.fast?.data_pipeline
  const factories = data.fast?.factory_freshness?.factories ?? []
  const eks = data.slow?.eks_management
  const nodes = eks?.nodes
  const pods = eks?.pods
  const argocd = eks?.argocd

  const lambdaErrors = (pipeline?.lambdas ?? []).reduce((sum, l) => sum + (l.errors_5m ?? 0), 0)
  const lambdaThrottles = (pipeline?.lambdas ?? []).reduce((sum, l) => sum + (l.throttles_5m ?? 0), 0)
  const staleFactories = factories.filter((f) => (f.latest_infra_state_age_seconds ?? 0) > 120).length

  return [
    {
      id: 'pipeline',
      title: '데이터 파이프라인',
      status: pipeline?.status,
      primary: `${lambdaErrors} err`,
      secondary: `${lambdaThrottles} throttle`,
      detail: `${pipeline?.lambdas?.length ?? 0} Lambda · DDB ${(pipeline?.dynamodb?.system_errors_5m ?? 0)} system errors`,
    },
    {
      id: 'runtime',
      title: 'Dashboard Runtime',
      status: runtime?.status,
      primary: `${ecs?.running_count ?? 0}/${ecs?.desired_count ?? 0}`,
      secondary: `ALB healthy ${alb?.healthy_host_count ?? 0}`,
      detail: `CPU ${numberLabel(ecs?.cpu_utilization_avg, 1)}% · Mem ${numberLabel(ecs?.memory_utilization_avg, 1)}% · 5xx ${alb?.target_5xx_count_5m ?? 0}`,
    },
    {
      id: 'freshness',
      title: 'Factory Freshness',
      status: data.fast?.factory_freshness?.status,
      primary: `${factories.length}`,
      secondary: staleFactories > 0 ? `${staleFactories} delayed` : 'all fresh',
      detail: `fast ${secondsLabel(data.fast_age_seconds)} · slow ${secondsLabel(data.slow_age_seconds)}`,
    },
    {
      id: 'management',
      title: 'Management Plane',
      status: eks?.status,
      primary: `${nodes?.ready ?? 0}/${nodes?.total ?? 0}`,
      secondary: `pods ${pods?.running ?? 0}`,
      detail: `ArgoCD ${argocd?.synced ?? 0}/${argocd?.applications_total ?? 0} synced · failed ${pods?.failed ?? 0}`,
    },
  ]
}

export function historyStatusSeries(items: CloudInfraHistoryItem[]): number[] {
  const value: Record<string, number> = {
    normal: 1,
    warning: 2,
    critical: 3,
    unknown: 0,
  }
  return items.map((item) => value[item.overall_status ?? 'unknown'] ?? 0)
}
