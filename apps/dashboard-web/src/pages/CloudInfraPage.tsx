import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react'
import { Shell } from '../components/Layout'
import { useFactories } from '../hooks/useFactories'
import { useCloudInfra } from '../hooks/useCloudInfra'
import { useCloudInfraHistory } from '../hooks/useCloudInfraHistory'
import { adaptSidebarFactory } from '../adapters/factory'
import {
  cloudInfraStatusLabel,
  cloudInfraTone,
  numberLabel,
  secondsLabel,
} from '../adapters/cloudInfra'
import { relTime } from '../utils/format'
import type { CloudInfraError, CloudInfraHistoryItem, CloudInfraStatus, CloudInfraStatusValue } from '../api/types'

function StatusPill({ status }: { status?: CloudInfraStatusValue | string }) {
  const tone = cloudInfraTone(status)
  return (
    <span className={`pill ${tone}`} style={{ padding: '3px 7px', fontSize: 10.5 }}>
      <span className="dot" />
      {cloudInfraStatusLabel(status)}
    </span>
  )
}

// reasons[] = collector-provided justification for warning/critical; errors[] =
// per-section collection failures shown when status is unknown. The frontend
// shows them verbatim (doc29 contract) and never recomputes thresholds.
function SectionMeta({
  status, reasons, errors,
}: {
  status?: CloudInfraStatusValue | string
  reasons?: string[]
  errors?: CloudInfraError[]
}) {
  const tone = cloudInfraTone(status)
  const hasReasons = (reasons?.length ?? 0) > 0
  const hasErrors = (errors?.length ?? 0) > 0
  if (!hasReasons && !hasErrors) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {hasReasons && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {reasons!.map((reason) => (
            <span key={reason} className={`pill ${tone === 'safe' ? 'warn' : tone}`} style={{ padding: '2px 7px', fontSize: 10.5 }}>
              <span className="dot" />{reason}
            </span>
          ))}
        </div>
      )}
      {hasErrors && (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {errors!.map((err, i) => (
            <li key={`${err.source ?? ''}-${i}`} className="micro" style={{ color: 'var(--ink-3)' }}>
              {[err.code, err.message].filter(Boolean).join(': ') || '수집 실패'}
              {err.source ? ` (${err.source})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="metric-stack">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="micro">{sub}</div>}
    </div>
  )
}

function valueWithUnit(value: number | null | undefined, unit: string, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '-'
  return `${numberLabel(value, digits)}${unit}`
}

function gibToMib(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return value * 1024
}

function mibLabel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  if (value >= 1024) return `${numberLabel(value / 1024, 1)} GiB`
  return `${numberLabel(value, 0)} MiB`
}

function percentLabel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return `${numberLabel(Math.max(0, Math.min(100, value)), 1)}%`
}

function usageText(used: number | null, total: number | null, usedPercent: number | null, fallbackPercent?: number | null): string {
  const percent = usedPercent ?? fallbackPercent ?? null
  if (used != null && total != null) return `사용 ${mibLabel(used)} / 총 ${mibLabel(total)}`
  if (percent != null) return `사용률 ${percentLabel(percent)}`
  return '사용량 수집 대기'
}

function usageSubText(usedPercent: number | null, free: number | null, total: number | null): string {
  const parts: string[] = []
  if (usedPercent != null && !Number.isNaN(usedPercent)) parts.push(`총 사용량 중 ${percentLabel(usedPercent)} 사용`)
  if (total != null && !Number.isNaN(total)) parts.push(`총량 ${mibLabel(total)}`)
  if (free != null && !Number.isNaN(free)) parts.push(`남은 용량 ${mibLabel(free)}`)
  return parts.length > 0 ? parts.join(' · ') : '사용량/총량 수집 대기'
}

function usageTone(usedPercent: number | null): 'safe' | 'warn' | 'crit' | 'unk' {
  if (usedPercent == null || Number.isNaN(usedPercent)) return 'unk'
  if (usedPercent >= 90) return 'crit'
  if (usedPercent >= 75) return 'warn'
  return 'safe'
}

function errorCount(errors?: CloudInfraError[]): number {
  return errors?.length ?? 0
}

function statusRank(status?: CloudInfraStatusValue | string): number {
  if (status === 'critical') return 4
  if (status === 'warning') return 3
  if (!status || status === 'unknown') return 2
  return 1
}

function totalErrorCount(data: CloudInfraStatus): number {
  const fast = data.fast
  const slow = data.slow
  return [
    fast?.errors,
    fast?.backend_runtime?.errors,
    fast?.datastores?.errors,
    fast?.data_pipeline?.errors,
    fast?.factory_freshness?.errors,
    slow?.errors,
    slow?.eks_management?.errors,
    slow?.storage_freshness?.errors,
  ].reduce((sum, errors) => sum + errorCount(errors), 0)
}

function topIssueLabel(data: CloudInfraStatus): string {
  const rows = [
    { label: '데이터 파이프라인', status: data.fast?.data_pipeline?.status, errors: data.fast?.data_pipeline?.errors },
    { label: 'Dashboard Runtime', status: data.fast?.backend_runtime?.status, errors: data.fast?.backend_runtime?.errors },
    { label: 'Datastores', status: data.fast?.datastores?.status, errors: data.fast?.datastores?.errors },
    { label: 'Factory Freshness', status: data.fast?.factory_freshness?.status, errors: data.fast?.factory_freshness?.errors },
    { label: 'Management Plane', status: data.slow?.eks_management?.status, errors: data.slow?.eks_management?.errors },
    { label: 'Storage Freshness', status: data.slow?.storage_freshness?.status, errors: data.slow?.storage_freshness?.errors },
  ]
  const issue = rows.find((row) => row.status && row.status !== 'normal') ?? rows.find((row) => errorCount(row.errors) > 0)
  return issue ? issue.label : '활성 이슈 없음'
}

function HealthStrip({ data }: { data: CloudInfraStatus }) {
  const factories = data.fast?.factory_freshness?.factories ?? []
  const staleFactories = factories.filter((f) => (f.latest_infra_state_age_seconds ?? 0) > 120).length
  const enabledSchedulers = (data.fast?.data_pipeline?.schedulers ?? []).filter((s) => s.state === 'ENABLED').length
  const lambdaErrors = (data.fast?.data_pipeline?.lambdas ?? []).reduce((sum, fn) => sum + (fn.errors_5m ?? 0), 0)
  const totalErrors = totalErrorCount(data)

  return (
    <div className={`cloud-health-strip ${cloudInfraTone(data.overall_status)}`}>
      <div className="cloud-health-main">
        <div className="cloud-health-icon">
          {data.overall_status === 'normal' ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
        </div>
        <div>
          <div className="cloud-health-label">종합 상태</div>
          <div className="cloud-health-title">{cloudInfraStatusLabel(data.overall_status)}</div>
        </div>
      </div>
      <div className="cloud-health-stat">
        <span className="label">주요 신호</span>
        <span className="value">{topIssueLabel(data)}</span>
      </div>
      <div className="cloud-health-stat">
        <span className="label">수집 지연</span>
        <span className="value">fast {secondsLabel(data.fast_age_seconds)} · slow {secondsLabel(data.slow_age_seconds)}</span>
      </div>
      <div className="cloud-health-stat">
        <span className="label">오류</span>
        <span className="value">{totalErrors} collector · {lambdaErrors} lambda</span>
      </div>
      <div className="cloud-health-stat">
        <span className="label">공장 최신성</span>
        <span className="value">{factories.length - staleFactories}/{factories.length} · sched {enabledSchedulers}</span>
      </div>
    </div>
  )
}

interface ComponentRow {
  id: string
  name: string
  group: string
  status?: CloudInfraStatusValue | string
  signal: string
  detail: string
  errors?: CloudInfraError[]
}

function ComponentMatrix({ rows }: { rows: ComponentRow[] }) {
  const sortedRows = rows.slice().sort((a, b) => {
    const byStatus = statusRank(b.status) - statusRank(a.status)
    if (byStatus !== 0) return byStatus
    return errorCount(b.errors) - errorCount(a.errors)
  })
  return (
    <div className="card cloud-matrix-card">
      <div className="card-hd">
        <div>
          <div className="h2">컴포넌트 상태</div>
        </div>
      </div>
      <div className="table-scroll">
        <table className="tbl cloud-matrix">
          <thead><tr><th>컴포넌트</th><th>영역</th><th>상태</th><th>핵심 신호</th><th>상세</th><th>오류</th></tr></thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id} className={`cloud-row-${cloudInfraTone(row.status)}`}>
                <td className="strong">{row.name}</td>
                <td>{row.group}</td>
                <td><StatusPill status={row.status} /></td>
                <td>{row.signal}</td>
                <td className="micro">{row.detail}</td>
                <td className="tnum">{errorCount(row.errors)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusLegend() {
  return (
    <div className="status-legend" aria-label="상태 색상 범례">
      <span><i className="safe" />정상</span>
      <span><i className="warn" />주의</span>
      <span><i className="crit" />위험</span>
      <span><i className="unk" />미확인</span>
    </div>
  )
}

function DependencyRail({ rows }: { rows: ComponentRow[] }) {
  return (
    <div className="cloud-rail">
      {rows.map((row, index) => (
        <div className={`cloud-rail-step ${cloudInfraTone(row.status)}`} key={row.id}>
          <span className="rail-dot" />
          <span className="rail-name">{row.name}</span>
          {index < rows.length - 1 && <span className="rail-line" />}
        </div>
      ))}
    </div>
  )
}

function StatusHistoryBar({ items }: { items: CloudInfraHistoryItem[] }) {
  const latest = items.slice(-60)
  if (latest.length === 0) return <div className="micro">history 수집 대기</div>
  const first = latest[0]
  const last = latest[latest.length - 1]
  return (
    <div className="status-flow" aria-label="최근 1시간 상태 흐름">
      <div className="status-flow-scale">
        <span className="status-flow-now">최신</span>
      </div>
      <div className="status-bar">
        {latest.map((item, index) => (
          <span
            key={item.sk ?? `${item.updated_at ?? 'item'}-${index}`}
            className={`status-seg ${cloudInfraTone(item.overall_status)}`}
            title={`${item.updated_at ?? item.sk ?? ''} · ${cloudInfraStatusLabel(item.overall_status)}`}
          />
        ))}
      </div>
      <div className="status-flow-caption">
        <span>{first?.updated_at ? relTime(first.updated_at) : 'oldest sample'}</span>
        <span>{last?.updated_at ? relTime(last.updated_at) : 'latest sample'}</span>
      </div>
    </div>
  )
}

function CapacityBar({ usedPercent }: { usedPercent: number | null }) {
  const pct = usedPercent == null || Number.isNaN(usedPercent) ? null : Math.max(0, Math.min(100, usedPercent))
  return (
    <div className={`capacity-bar ${usageTone(pct)}`} aria-hidden="true">
      <span style={{ width: `${pct ?? 0}%` }} />
    </div>
  )
}

function DatastoreResourceRow({
  name,
  status,
  primary,
  secondary,
  usedPercent,
  metrics,
}: {
  name: string
  status?: string
  primary: string
  secondary: string
  usedPercent: number | null
  metrics: { label: string; value: string | number }[]
}) {
  return (
    <div className="datastore-resource-row">
      <div className="datastore-resource-head">
        <div>
          <div className="datastore-resource-name">{name}</div>
          <div className="micro">{secondary}</div>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="datastore-resource-primary">
        <span>{primary}</span>
        <span>{usedPercent == null ? '사용률 미수집' : percentLabel(usedPercent)}</span>
      </div>
      <CapacityBar usedPercent={usedPercent} />
      <div className="datastore-resource-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionCard({
  title, status, reasons, errors, children,
}: {
  title: string
  status?: CloudInfraStatusValue | string
  reasons?: string[]
  errors?: CloudInfraError[]
  children: React.ReactNode
}) {
  return (
    <div className="card factory-section-card">
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--line-2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}>
        <div className="h2">{title}</div>
        <StatusPill status={status} />
      </div>
      <div style={{ padding: 16 }}>
        <SectionMeta status={status} reasons={reasons} errors={errors} />
        {children}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card">
      <div className="empty-state">
        <Server className="icon" size={30} />
        <div className="title">Cloud infra 수집 대기</div>
        <div className="desc">collector가 `CLOUD#infra` LATEST item을 쓰면 이 화면에 자동으로 표시됩니다.</div>
      </div>
    </div>
  )
}

export function CloudInfraPage() {
  const [refreshInterval, setRefreshInterval] = useState(0)
  const factories = useFactories()
  const cloud = useCloudInfra()
  const history = useCloudInfraHistory('1h', 'fast', Boolean(cloud.data?.available), 120)
  const refreshCloud = cloud.refresh
  const refreshHistory = history.refresh

  const refreshPageData = useCallback(() => {
    void refreshCloud()
    void refreshHistory()
  }, [refreshCloud, refreshHistory])

  useEffect(() => {
    if (refreshInterval <= 0) return
    const id = window.setInterval(() => {
      refreshPageData()
    }, refreshInterval)
    return () => window.clearInterval(id)
  }, [refreshInterval, refreshPageData])

  const sidebarFactories = (factories.data?.factories ?? [])
    .map(adaptSidebarFactory)
    .sort((a, b) => a.factory_id.localeCompare(b.factory_id))

  const data = cloud.data

  if (cloud.loading && !data) {
    return (
      <Shell factories={sidebarFactories} crumbs={[{ label: 'System' }, { label: '클라우드 인프라' }]}>
        <div className="card"><div className="empty-state"><div className="spinner" /></div></div>
      </Shell>
    )
  }

  if (cloud.error) {
    return (
      <Shell factories={sidebarFactories} crumbs={[{ label: 'System' }, { label: '클라우드 인프라' }]} onRefresh={cloud.refresh}>
        <div className="card">
          <div className="empty-state">
            <AlertTriangle className="icon" size={28} />
            <div className="title">Cloud infra 상태를 불러오지 못했습니다</div>
            <div className="desc">{cloud.error.message}</div>
            <button className="btn" onClick={cloud.refresh}><RefreshCw size={14} />다시 시도</button>
          </div>
        </div>
      </Shell>
    )
  }

  if (!data?.available) {
    return (
      <Shell factories={sidebarFactories} crumbs={[{ label: 'System' }, { label: '클라우드 인프라' }]} onRefresh={cloud.refresh}>
        <EmptyState />
      </Shell>
    )
  }

  const fast = data.fast
  const slow = data.slow
  const runtime = fast?.backend_runtime
  const datastores = fast?.datastores
  const pipeline = fast?.data_pipeline
  const freshness = fast?.factory_freshness
  const eks = slow?.eks_management
  const storage = slow?.storage_freshness
  const redisTotalMemoryMib = datastores?.redis?.total_memory_mib ?? datastores?.redis?.cache_node_memory_mib ?? null
  const redisFreeMemoryMib = datastores?.redis?.freeable_memory_mib ?? null
  const redisUsedMemoryMib = redisTotalMemoryMib != null && redisFreeMemoryMib != null
    ? Math.max(0, redisTotalMemoryMib - redisFreeMemoryMib)
    : null
  const redisUsedPercent = redisTotalMemoryMib != null && redisUsedMemoryMib != null && redisTotalMemoryMib > 0
    ? (redisUsedMemoryMib / redisTotalMemoryMib) * 100
    : datastores?.redis?.memory_usage_percent ?? null
  const rdsTotalStorageMib = gibToMib(datastores?.rds?.allocated_storage_gib)
  const rdsFreeStorageMib = datastores?.rds?.free_storage_mib ?? null
  const rdsUsedStorageMib = rdsTotalStorageMib != null && rdsFreeStorageMib != null
    ? Math.max(0, rdsTotalStorageMib - rdsFreeStorageMib)
    : null
  const rdsUsedPercent = rdsTotalStorageMib != null && rdsUsedStorageMib != null && rdsTotalStorageMib > 0
    ? (rdsUsedStorageMib / rdsTotalStorageMib) * 100
    : null
  const componentRows: ComponentRow[] = [
    {
      id: 'pipeline',
      name: '데이터 파이프라인',
      group: '수집',
      status: pipeline?.status,
      signal: `Lambda 오류 ${(pipeline?.lambdas ?? []).reduce((sum, fn) => sum + (fn.errors_5m ?? 0), 0)}`,
      detail: `DDB throttle ${(pipeline?.dynamodb?.read_throttle_events_5m ?? 0) + (pipeline?.dynamodb?.write_throttle_events_5m ?? 0)} · DLQ ${pipeline?.dlq?.messages_visible ?? 0}`,
      errors: pipeline?.errors,
    },
    {
      id: 'runtime',
      name: 'Dashboard 런타임',
      group: '서빙',
      status: runtime?.status,
      signal: `ECS ${runtime?.ecs?.running_count ?? 0}/${runtime?.ecs?.desired_count ?? 0}`,
      detail: `ALB healthy ${runtime?.alb?.healthy_host_count ?? 0} · 5xx ${runtime?.alb?.target_5xx_count_5m ?? 0}`,
      errors: runtime?.errors,
    },
    {
      id: 'datastores',
      name: 'Datastores',
      group: '상태 저장소',
      status: datastores?.status,
      signal: `Redis ${datastores?.redis?.status ?? '-'} · RDS ${datastores?.rds?.status ?? '-'}`,
      detail: `Redis CPU ${numberLabel(datastores?.redis?.cpu_utilization_avg, 1)}% · RDS CPU ${numberLabel(datastores?.rds?.cpu_utilization_avg, 1)}%`,
      errors: datastores?.errors,
    },
    {
      id: 'freshness',
      name: '공장 최신성',
      group: '공장',
      status: freshness?.status,
      signal: `${freshness?.factories?.length ?? 0}개 공장`,
      detail: `max infra age ${secondsLabel(Math.max(0, ...(freshness?.factories ?? []).map((f) => f.latest_infra_state_age_seconds ?? 0)))}`,
      errors: freshness?.errors,
    },
    {
      id: 'management',
      name: '관리 플레인',
      group: 'Control',
      status: eks?.status,
      signal: `Nodes ${eks?.nodes?.ready ?? 0}/${eks?.nodes?.total ?? 0}`,
      detail: `Pods ${eks?.pods?.running ?? 0} running · ArgoCD ${eks?.argocd?.synced ?? 0}/${eks?.argocd?.applications_total ?? 0}`,
      errors: eks?.errors,
    },
    {
      id: 'storage',
      name: '스토리지 최신성',
      group: '저장',
      status: storage?.status,
      signal: `${storage?.factories?.length ?? 0}개 공장`,
      detail: `raw / processed / aggregate freshness`,
      errors: storage?.errors,
    },
  ]
  const railRows = [
    componentRows[0],
    componentRows[1],
    componentRows[2],
    componentRows[5],
    componentRows[4],
  ]

  return (
    <Shell
      factories={sidebarFactories}
      crumbs={[{ label: 'System' }, { label: '클라우드 인프라' }]}
      onRefresh={refreshPageData}
      refreshInterval={refreshInterval}
      onIntervalChange={setRefreshInterval}
    >
      <div className="cloud-page-head" style={{
        marginBottom: 18,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Cloud Infra</div>
          <h1 className="h1">클라우드 인프라 상태</h1>
          <div className="sub" style={{ marginTop: 6 }}>
            수집 상태와 장애 신호를 먼저 보고, 아래에서 컴포넌트별 원인을 확인합니다.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <StatusPill status={data.overall_status} />
          {data.fast_stale && <span className="pill warn"><span className="dot" />fast stale</span>}
          {data.slow_stale && <span className="pill warn"><span className="dot" />slow stale</span>}
          <span className="pill info">
            <span className="dot" />
            fast {secondsLabel(data.fast_age_seconds)} · slow {secondsLabel(data.slow_age_seconds)}
          </span>
        </div>
      </div>

      <HealthStrip data={data} />
      <ComponentMatrix rows={componentRows} />
      <DependencyRail rows={railRows} />

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="비즈니스 파이프라인" status={pipeline?.status} reasons={pipeline?.reasons} errors={pipeline?.errors}>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Metric label="Lambda errors" value={(pipeline?.lambdas ?? []).reduce((sum, l) => sum + (l.errors_5m ?? 0), 0)} sub="last 5m" />
            <Metric label="DDB throttle" value={(pipeline?.dynamodb?.read_throttle_events_5m ?? 0) + (pipeline?.dynamodb?.write_throttle_events_5m ?? 0)} sub="read + write" />
            <Metric label="DLQ" value={pipeline?.dlq?.messages_visible ?? '-'} sub={`oldest ${secondsLabel(pipeline?.dlq?.oldest_message_age_seconds)}`} />
            <Metric label="Schedulers" value={(pipeline?.schedulers ?? []).filter((s) => s.state === 'ENABLED').length} sub={`${pipeline?.schedulers?.length ?? 0} total`} />
          </div>
          <table className="tbl">
            <thead><tr><th>Lambda</th><th>Invocations</th><th>Errors</th><th>p95</th></tr></thead>
            <tbody>
              {(pipeline?.lambdas ?? []).map((fn) => (
                <tr key={fn.name}>
                  <td className="mono">{fn.name}</td>
                  <td className="tnum">{fn.invocations_5m ?? '-'}</td>
                  <td className="tnum">{fn.errors_5m ?? '-'}</td>
                  <td className="tnum">{valueWithUnit(fn.duration_p95_ms, 'ms', 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Dashboard 런타임" status={runtime?.status} reasons={runtime?.reasons} errors={runtime?.errors}>
          <div className="grid-3">
            <Metric label="ECS running" value={`${runtime?.ecs?.running_count ?? 0}/${runtime?.ecs?.desired_count ?? 0}`} sub={runtime?.ecs?.status ?? 'unknown'} />
            <Metric label="CPU avg" value={`${numberLabel(runtime?.ecs?.cpu_utilization_avg, 1)}%`} sub={`max ${numberLabel(runtime?.ecs?.cpu_utilization_max, 1)}%`} />
            <Metric label="Memory avg" value={`${numberLabel(runtime?.ecs?.memory_utilization_avg, 1)}%`} sub={`max ${numberLabel(runtime?.ecs?.memory_utilization_max, 1)}%`} />
            <Metric label="ALB healthy" value={`${runtime?.alb?.healthy_host_count ?? 0}`} sub={`unhealthy ${runtime?.alb?.unhealthy_host_count ?? 0}`} />
            <Metric label="ALB 5xx" value={runtime?.alb?.target_5xx_count_5m ?? 0} sub="last 5m" />
            <Metric label="p95 latency" value={valueWithUnit(runtime?.alb?.target_response_time_p95, 's', 3)} />
          </div>
        </SectionCard>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="Datastores" status={datastores?.status} reasons={datastores?.reasons} errors={datastores?.errors}>
          {datastores ? (
            <div className="datastore-resource-list">
              <DatastoreResourceRow
                name="Redis"
                status={datastores.redis?.status}
                primary={usageText(redisUsedMemoryMib, redisTotalMemoryMib, redisUsedPercent, datastores.redis?.memory_usage_percent)}
                secondary={usageSubText(redisUsedPercent, redisFreeMemoryMib, redisTotalMemoryMib)}
                usedPercent={redisUsedPercent}
                metrics={[
                  { label: 'CPU', value: `${numberLabel(datastores.redis?.cpu_utilization_avg, 1)}%` },
                  { label: 'Connections', value: datastores.redis?.current_connections ?? '-' },
                  { label: 'Evictions', value: datastores.redis?.evictions_5m ?? 0 },
                ]}
              />
              <DatastoreResourceRow
                name="RDS"
                status={datastores.rds?.status}
                primary={usageText(rdsUsedStorageMib, rdsTotalStorageMib, rdsUsedPercent)}
                secondary={usageSubText(rdsUsedPercent, rdsFreeStorageMib, rdsTotalStorageMib)}
                usedPercent={rdsUsedPercent}
                metrics={[
                  { label: 'CPU', value: `${numberLabel(datastores.rds?.cpu_utilization_avg, 1)}%` },
                  { label: 'Connections', value: datastores.rds?.database_connections ?? '-' },
                  { label: 'Free mem', value: mibLabel(datastores.rds?.freeable_memory_mib) },
                ]}
              />
            </div>
          ) : (
            <div className="micro">Redis/RDS 수집 대기 — collector가 <code>fast.datastores</code>를 쓰면 자동 표시됩니다.</div>
          )}
        </SectionCard>

        <SectionCard title="Factory Freshness" status={freshness?.status} reasons={freshness?.reasons} errors={freshness?.errors}>
          <table className="tbl">
            <thead><tr><th>Factory</th><th>Pipeline</th><th>Infra age</th><th>Last infra</th><th>Risk</th></tr></thead>
            <tbody>
              {(freshness?.factories ?? []).map((factory) => (
                <tr key={factory.factory_id}>
                  <td className="mono">{factory.factory_id}</td>
                  <td><StatusPill status={factory.pipeline_status} /></td>
                  <td className="tnum">{secondsLabel(factory.latest_infra_state_age_seconds)}</td>
                  <td>{relTime(factory.last_infra_state_at ?? undefined)}</td>
                  <td className="tnum">{factory.risk_score ?? '-'} · {factory.risk_level ?? 'unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="관리 플레인" status={eks?.status} reasons={eks?.reasons} errors={eks?.errors}>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Metric label="EKS nodes" value={`${eks?.nodes?.ready ?? 0}/${eks?.nodes?.total ?? 0}`} sub={eks?.cluster?.status ?? 'unknown'} />
            <Metric label="Pods running" value={eks?.pods?.running ?? 0} sub={`failed ${eks?.pods?.failed ?? 0}`} />
            <Metric label="ArgoCD synced" value={`${eks?.argocd?.synced ?? 0}/${eks?.argocd?.applications_total ?? 0}`} sub={`degraded ${eks?.argocd?.degraded ?? 0}`} />
          </div>
          <table className="tbl">
            <thead><tr><th>Node</th><th>Ready</th><th>CPU</th><th>Memory</th></tr></thead>
            <tbody>
              {(eks?.nodes?.items ?? []).map((node) => (
                <tr key={node.name}>
                  <td className="mono">{node.name}</td>
                  <td>{node.ready ? 'Ready' : 'NotReady'}</td>
                  <td className="tnum">{numberLabel(node.cpu_utilization_percent, 1)}%</td>
                  <td className="tnum">{numberLabel(node.memory_utilization_percent, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="스토리지 최신성" status={storage?.status} reasons={storage?.reasons} errors={storage?.errors}>
          <table className="tbl">
            <thead><tr><th>Factory</th><th>Raw</th><th>Processed</th><th>Aggregate</th></tr></thead>
            <tbody>
              {(storage?.factories ?? []).map((factory) => (
                <tr key={factory.factory_id}>
                  <td className="mono">{factory.factory_id}</td>
                  <td>{relTime(factory.latest_raw_at ?? undefined)}</td>
                  <td>{relTime(factory.latest_processed_at ?? undefined)}</td>
                  <td>{relTime(factory.latest_processed_agg_at ?? undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <div className="card">
        <div style={{ padding: 16 }}>
          <div>
            <div className="h2">최근 1시간 상태 흐름</div>
            <StatusLegend />
          </div>
          <StatusHistoryBar items={history.data} />
        </div>
      </div>
    </Shell>
  )
}
