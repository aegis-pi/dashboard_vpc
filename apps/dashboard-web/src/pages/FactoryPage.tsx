import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Thermometer, Droplets, Gauge, Flame, Activity } from 'lucide-react'
import { Shell } from '../components/Layout'
import { LevelBadge, PipelineBadge } from '../components/Badge'
import { relTime, riskColor } from '../utils/format'
import { RiskScoreChart, SensorChart, AIScoreChart, NodeResourceChart } from '../components/Chart'
import { ConnStatus } from '../components/ConnStatus'
import { useFactory } from '../hooks/useFactory'
import { useFactoryHistory, type HistoryWindow } from '../hooks/useFactoryHistory'
import { useWebSocket } from '../hooks/useWebSocket'
import type { FactoryDetail, NodeStatus, WorkloadStatus } from '../api/types'

type TabId = 'overview' | 'environment' | 'infrastructure' | 'timeline'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',        label: 'Overview' },
  { id: 'environment',     label: 'Environment' },
  { id: 'infrastructure',  label: 'Infrastructure' },
  { id: 'timeline',        label: 'Timeline' },
]

// ─── Device chip ──────────────────────────────────────────────────────
function DeviceChip({ label, available }: { label: string; available: boolean | null | undefined }) {
  const tone = available === true ? 'safe' : available === false ? 'warn' : 'unk'
  const text = available === true ? '정상' : available === false ? '확인 필요' : '미수신'
  return (
    <div className="device-chip">
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${tone})`, flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span className="micro" style={{ marginLeft: 'auto', color: `var(--${tone})` }}>{text}</span>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────
function OverviewTab({ data }: { data: FactoryDetail }) {
  const risk = data.risk
  const env = data.factory_state?.sensor
  const ai = data.factory_state?.ai_result
  const infra = data.infra_state
  const ns = infra?.node_summary
  const ws = infra?.workload_summary
  const ds = infra?.device_summary
  const ps = data.pipeline_status
  const color = riskColor(risk?.level)

  const causes = risk?.top_causes ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status header card */}
      <div className="card">
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>현재 위험도</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span className="risk-score-big" style={{ color }}>
                  {risk?.score ?? '—'}
                </span>
                <LevelBadge level={risk?.level} size="lg" />
              </div>
              <div className="micro" style={{ marginTop: 6 }}>
                마지막 갱신 {relTime(data.updated_at)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <PipelineBadge status={ps?.status} />
              {ns && (
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  node <span style={{ color: 'var(--ink)' }} className="tnum">{ns.ready}/{ns.total}</span> Ready
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top causes */}
      {causes.length > 0 && (
        <div>
          <div className="section-header"><h2 className="h2">주요 원인</h2></div>
          <div className="grid-3">
            {causes.slice(0, 3).map((c, i) => {
              const name = typeof c === 'string' ? c : c.name
              const value = typeof c === 'string' ? null : c.value
              return (
                <div key={i} className="card" style={{ padding: '14px 16px' }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>{name}</div>
                  {value != null && (
                    <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color }}>
                      {value.toFixed(2)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Current environment */}
      <div className="card">
        <div className="card-header"><h3 className="h3">현재 환경</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <EnvItem icon={<Thermometer size={14} />} label="온도" value={env?.temperature_celsius_avg} unit="°C" />
            <EnvItem icon={<Droplets size={14} />} label="습도" value={env?.humidity_percent_avg} unit="%" />
            <EnvItem icon={<Gauge size={14} />} label="기압" value={env?.pressure_hpa_avg} unit="hPa" />
            <EnvItem icon={<Flame size={14} />} label="화재" value={ai?.fire_score} />
            <EnvItem icon={<Activity size={14} />} label="넘어짐" value={ai?.fall_score} />
            <EnvItem icon={<Activity size={14} />} label="굽힘" value={ai?.bend_score} />
          </div>
        </div>
      </div>

      {/* Current infra */}
      <div className="card">
        <div className="card-header"><h3 className="h3">현재 인프라</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {ns && (
              <div className="metric-stack">
                <span className="metric-value">{ns.ready}<span style={{ fontSize: 14, color: 'var(--ink-4)' }}>/{ns.total}</span></span>
                <span className="metric-label">Node Ready</span>
              </div>
            )}
            {ws && (
              <div className="metric-stack">
                <span className="metric-value">{ws.running}<span style={{ fontSize: 14, color: 'var(--ink-4)' }}>/{ws.total}</span></span>
                <span className="metric-label">Workload Running</span>
              </div>
            )}
          </div>
          {ds && (
            <div className="grid-3">
              <DeviceChip label="BME280" available={ds.bme280_available} />
              <DeviceChip label="Camera" available={ds.camera_available} />
              <DeviceChip label="Microphone" available={ds.microphone_available} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EnvItem({ icon, label, value, unit }: {
  icon: React.ReactNode
  label: string
  value?: number | null
  unit?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-4)' }}>
        {icon}
        <span className="micro">{label}</span>
      </div>
      <div className="tnum" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
        {value != null ? `${value.toFixed(1)}${unit ?? ''}` : '미수신'}
      </div>
    </div>
  )
}

// ─── Environment tab ──────────────────────────────────────────────────
function EnvironmentTab({ factoryId }: { factoryId: string }) {
  const [window, setWindow] = useState<HistoryWindow>('1h')
  const { data: history, loading } = useFactoryHistory(factoryId, window)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <WindowButtons value={window} onChange={setWindow} />
      </div>

      <div className="card">
        <div className="card-header"><h3 className="h3">Risk Score 추세</h3></div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {loading ? <LoadingChart /> : <RiskScoreChart items={history} />}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3 className="h3">온도 (°C)</h3></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? <LoadingChart /> : <SensorChart items={history} field="temperature_celsius_avg" label="온도" unit="°C" />}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="h3">습도 (%)</h3></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? <LoadingChart /> : <SensorChart items={history} field="humidity_percent_avg" label="습도" unit="%" />}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="h3">기압 (hPa)</h3></div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {loading ? <LoadingChart /> : <SensorChart items={history} field="pressure_hpa_avg" label="기압" unit="hPa" />}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="h3">AI Score (화재·넘어짐·굽힘)</h3></div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {loading ? <LoadingChart /> : <AIScoreChart items={history} />}
        </div>
      </div>
    </div>
  )
}

// ─── Infrastructure tab ───────────────────────────────────────────────
function InfraTab({ data, factoryId }: { data: FactoryDetail; factoryId: string }) {
  const [window, setWindow] = useState<HistoryWindow>('1h')
  const { data: history, loading } = useFactoryHistory(factoryId, window)

  const nodes: NodeStatus[] = data.infra_state?.nodes ?? []
  const workloads: WorkloadStatus[] = data.infra_state?.workloads ?? []
  const ws = data.infra_state?.workload_summary
  const ds = data.infra_state?.device_summary
  const ps = data.pipeline_status

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <WindowButtons value={window} onChange={setWindow} />
      </div>

      {/* Node table */}
      <div className="card">
        <div className="card-header"><h3 className="h3">현재 노드 상태</h3></div>
        <div className="table-scroll">
          {nodes.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <span className="micro">노드 상태 미수신</span>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Ready</th>
                  <th>CPU</th>
                  <th>Memory</th>
                  <th>Disk</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.node_id}>
                    <td className="mono">{n.node_id}</td>
                    <td>
                      <span className={`pill ${n.ready ? 'safe' : 'crit'}`} style={{ padding: '2px 6px', fontSize: 10.5 }}>
                        {n.ready ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td><PercentCell value={n.cpu_usage_percent} /></td>
                    <td><PercentCell value={n.memory_usage_percent} /></td>
                    <td><PercentCell value={n.disk_usage_percent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Resource trend charts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 className="h3">리소스 추세</h3>
        <div className="card">
          <div className="card-header"><span className="sub">CPU Usage (%)</span></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? <LoadingChart /> : <NodeResourceChart items={history} field="cpu_usage_percent" label="CPU" />}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="sub">Memory Usage (%)</span></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {loading ? <LoadingChart /> : <NodeResourceChart items={history} field="memory_usage_percent" label="Memory" />}
          </div>
        </div>
      </div>

      {/* Workloads */}
      {(ws || workloads.length > 0) && (
        <div className="card">
          <div className="card-header">
            <h3 className="h3">Workloads</h3>
            {ws && (
              <span className="mono micro">
                {ws.running}/{ws.total} Running · unhealthy {ws.unhealthy ?? 0}
              </span>
            )}
          </div>
          {workloads.length > 0 ? (
            <table className="table">
              <thead>
                <tr><th>이름</th><th>상태</th><th>노드</th><th>재시작</th></tr>
              </thead>
              <tbody>
                {workloads.map((w, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 12 }}>{w.name}</td>
                    <td>
                      <span className={`pill ${w.status === 'Running' ? 'safe' : 'warn'}`} style={{ padding: '2px 6px', fontSize: 10.5 }}>
                        {w.status ?? '—'}
                      </span>
                    </td>
                    <td className="mono micro">{w.node_id ?? '—'}</td>
                    <td className="tnum micro">{w.restart_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="card-body">
              <span className="micro">workload 목록 미수신 (workload_summary 기준 사용)</span>
            </div>
          )}
        </div>
      )}

      {/* Devices */}
      {ds && (
        <div className="card">
          <div className="card-header"><h3 className="h3">Devices</h3></div>
          <div className="card-body">
            <div className="grid-3">
              <DeviceChip label="BME280" available={ds.bme280_available} />
              <DeviceChip label="Camera" available={ds.camera_available} />
              <DeviceChip label="Microphone" available={ds.microphone_available} />
            </div>
          </div>
        </div>
      )}

      {/* Pipeline */}
      {ps && (
        <div className="card">
          <div className="card-header">
            <h3 className="h3">Pipeline</h3>
            <PipelineBadge status={ps.status} />
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div className="metric-stack">
                <span className="metric-value tnum">{ps.latest_infra_state_age_seconds ?? '—'}</span>
                <span className="metric-label">infra age (s)</span>
              </div>
              <div className="metric-stack">
                <span className="metric-value tnum">{ps.latest_s3_raw_age_seconds ?? '—'}</span>
                <span className="metric-label">S3 raw age (s)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PercentCell({ value }: { value?: number | null }) {
  if (value == null) return <span className="micro">—</span>
  const color = value >= 90 ? 'var(--crit)' : value >= 80 ? 'var(--warn)' : 'var(--ink-2)'
  return <span className="tnum" style={{ color }}>{value.toFixed(1)}%</span>
}

// ─── Timeline tab ─────────────────────────────────────────────────────
function TimelineTab({ factoryId }: { factoryId: string }) {
  const [window, setWindow] = useState<HistoryWindow>('1h')
  const { data: history, loading } = useFactoryHistory(factoryId, window)

  // Derive events from history by detecting changes
  const events = deriveEvents(history)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <WindowButtons value={window} onChange={setWindow} />
      </div>

      <div className="card">
        <div className="card-header"><h3 className="h3">상태 변화 이벤트</h3></div>
        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <span className="micro">선택한 시간 범위에 상태 변화가 없습니다</span>
          </div>
        ) : (
          <div>
            {events.map((ev, i) => (
              <div key={i} className="list-row" style={{ cursor: 'default', gap: 12 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: ev.severity === 'danger' ? 'var(--crit)'
                    : ev.severity === 'warning' ? 'var(--warn)' : 'var(--safe)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{ev.title}</div>
                  {ev.description && <div className="micro" style={{ marginTop: 2 }}>{ev.description}</div>}
                </div>
                <span className="mono micro" style={{ whiteSpace: 'nowrap' }}>{ev.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface DerivedEvent {
  title: string
  description?: string
  severity: 'info' | 'warning' | 'danger'
  time: string
}

function deriveEvents(history: ReturnType<typeof useFactoryHistory>['data']): DerivedEvent[] {
  const events: DerivedEvent[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!
    const curr = history[i]!
    const ts = curr.timestamp ?? ''

    // Risk level change
    if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
      events.push({
        severity: curr.risk_level === 'danger' ? 'danger' : curr.risk_level === 'warning' ? 'warning' : 'info',
        title: `Risk ${levelKr(prev.risk_level)} → ${levelKr(curr.risk_level)}`,
        description: `score: ${curr.risk_score ?? '—'}`,
        time: fmtTs(ts),
      })
    }

    // Risk score jump (+10)
    if (curr.risk_score != null && prev.risk_score != null && curr.risk_score - prev.risk_score >= 10) {
      events.push({
        severity: 'warning',
        title: `Risk Score 급등 +${(curr.risk_score - prev.risk_score).toFixed(1)}`,
        time: fmtTs(ts),
      })
    }
  }
  return events.reverse()
}

function levelKr(l?: string) {
  return l === 'safe' ? '안전' : l === 'warning' ? '주의' : l === 'danger' ? '위험' : l ?? '—'
}

function fmtTs(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

// ─── Shared helpers ───────────────────────────────────────────────────
function WindowButtons({ value, onChange }: { value: HistoryWindow; onChange: (v: HistoryWindow) => void }) {
  return (
    <div className="window-btns">
      {(['1h', '2h', '24h'] as HistoryWindow[]).map((w) => (
        <button key={w} className={`window-btn ${value === w ? 'active' : ''}`} onClick={() => onChange(w)}>
          {w}
        </button>
      ))}
    </div>
  )
}

function LoadingChart() {
  return (
    <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
}

// ─── Main factory page ────────────────────────────────────────────────
export function FactoryPage() {
  const { factoryId = '' } = useParams<{ factoryId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const { data, loading, error, refresh } = useFactory(factoryId)
  const { status: wsStatus, lastMessage } = useWebSocket(factoryId)

  const riskLevel = data?.risk?.level

  return (
    <Shell
      crumbs={[
        { label: 'Aegis-π' },
        { label: 'Fleet', href: '/' },
        { label: factoryId },
      ]}
      onBack={() => navigate('/')}
      wsStatus={wsStatus}
      wsMessage={lastMessage}
      onRefresh={refresh}
    >
      {/* Factory header */}
      <div className="page-header">
        <div className="eyebrow page-eyebrow">Risk Twin · Factory</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="page-title" style={{ fontSize: 26 }}>{factoryId}</h1>
          {riskLevel && <LevelBadge level={riskLevel} size="lg" />}
          <ConnStatus status={wsStatus} />
        </div>
      </div>

      {loading && (
        <div className="empty-state" style={{ paddingTop: 60 }}>
          <div className="spinner" />
          <span className="sub">공장 상태 로드 중...</span>
        </div>
      )}

      {!loading && error && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--crit)' }}>
            <AlertTriangle size={18} />
            <span style={{ fontWeight: 600 }}>데이터 로드 실패</span>
          </div>
          <p className="sub" style={{ marginTop: 8 }}>{error.message}</p>
          <button className="btn" style={{ marginTop: 14 }} onClick={refresh}>
            <RefreshCw size={13} />다시 시도
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Tabs */}
          <div className="tabs" style={{ margin: '0 -24px 20px', padding: '0 24px' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && <OverviewTab data={data} />}
          {activeTab === 'environment' && <EnvironmentTab factoryId={factoryId} />}
          {activeTab === 'infrastructure' && <InfraTab data={data} factoryId={factoryId} />}
          {activeTab === 'timeline' && <TimelineTab factoryId={factoryId} />}
        </>
      )}
    </Shell>
  )
}
