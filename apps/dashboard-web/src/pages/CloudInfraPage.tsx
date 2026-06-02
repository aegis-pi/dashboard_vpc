import { AlertTriangle, Database, HardDrive, RefreshCw, Server, Workflow } from 'lucide-react'
import { Shell } from '../components/Layout'
import { Sparkline } from '../components/Sparkline'
import { useFactories } from '../hooks/useFactories'
import { useCloudInfra } from '../hooks/useCloudInfra'
import { useCloudInfraHistory } from '../hooks/useCloudInfraHistory'
import { adaptSidebarFactory } from '../adapters/factory'
import {
  buildOverviewCards,
  cloudInfraStatusLabel,
  cloudInfraTone,
  historyStatusSeries,
  numberLabel,
  secondsLabel,
} from '../adapters/cloudInfra'
import { relTime } from '../utils/format'
import type { CloudInfraStatusValue } from '../api/types'

function StatusPill({ status }: { status?: CloudInfraStatusValue | string }) {
  const tone = cloudInfraTone(status)
  return (
    <span className={`pill ${tone}`} style={{ padding: '3px 7px', fontSize: 10.5 }}>
      <span className="dot" />
      {cloudInfraStatusLabel(status)}
    </span>
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

function SectionCard({
  title, status, children,
}: {
  title: string
  status?: CloudInfraStatusValue | string
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
        {children}
      </div>
    </div>
  )
}

function Overview({ data }: { data: ReturnType<typeof buildOverviewCards> }) {
  const icons = [Workflow, Server, Database, HardDrive]
  return (
    <div className="grid-4" style={{ marginBottom: 18 }}>
      {data.map((card, index) => {
        const Icon = icons[index] ?? Server
        return (
          <div className="card" key={card.id}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13, minHeight: 146 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--line-2)',
                  color: 'var(--ink-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} />
                </div>
                <StatusPill status={card.status} />
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>{card.title}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div className="metric-value">{card.primary}</div>
                  <div className="micro">{card.secondary}</div>
                </div>
              </div>
              <div className="micro" style={{ marginTop: 'auto' }}>{card.detail}</div>
            </div>
          </div>
        )
      })}
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
  const factories = useFactories()
  const cloud = useCloudInfra()
  const history = useCloudInfraHistory('1h', 'fast', Boolean(cloud.data?.available), 120)

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

  const overviewCards = buildOverviewCards(data)
  const fast = data.fast
  const slow = data.slow
  const runtime = fast?.backend_runtime
  const pipeline = fast?.data_pipeline
  const freshness = fast?.factory_freshness
  const eks = slow?.eks_management
  const storage = slow?.storage_freshness
  const historySeries = historyStatusSeries(history.data)

  return (
    <Shell
      factories={sidebarFactories}
      crumbs={[{ label: 'System' }, { label: '클라우드 인프라' }]}
      onRefresh={() => { void cloud.refresh(); void history.refresh() }}
    >
      <div style={{
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
            Dashboard Runtime, 데이터 파이프라인, Management Plane, Storage freshness를 read model 기준으로 확인합니다.
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

      <Overview data={overviewCards} />

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="비즈니스 파이프라인" status={pipeline?.status}>
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Metric label="Lambda errors" value={(pipeline?.lambdas ?? []).reduce((sum, l) => sum + (l.errors_5m ?? 0), 0)} sub="last 5m" />
            <Metric label="DDB throttle" value={(pipeline?.dynamodb?.read_throttle_events_5m ?? 0) + (pipeline?.dynamodb?.write_throttle_events_5m ?? 0)} sub="read + write" />
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

        <SectionCard title="Dashboard Runtime" status={runtime?.status}>
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

      <SectionCard title="Factory Freshness" status={freshness?.status}>
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

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <SectionCard title="Management Plane" status={eks?.status}>
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

        <SectionCard title="Storage Freshness" status={storage?.status}>
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
        <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div>
            <div className="h2">최근 1시간 상태 흐름</div>
            <div className="micro" style={{ marginTop: 4 }}>normal=1, warning=2, critical=3 기준의 간단한 상태선입니다.</div>
          </div>
          <Sparkline data={historySeries} width={160} height={34} color="var(--accent)" />
        </div>
      </div>
    </Shell>
  )
}
