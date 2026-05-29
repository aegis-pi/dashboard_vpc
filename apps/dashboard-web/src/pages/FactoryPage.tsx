import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Shell } from '../components/Layout'
import { LevelBadge, PipelineBadge, StaleBadge } from '../components/Badge'
import { relTime, riskColor } from '../utils/format'
import { extractSensor, extractAI } from '../utils/normalize'
import { RiskScoreChart, AIScoreChart, NodeResourceChart } from '../components/Chart'
import { ConnStatus } from '../components/ConnStatus'
import { Sparkline } from '../components/Sparkline'
import { useFactory } from '../hooks/useFactory'
import { useFactories } from '../hooks/useFactories'
import { useFactoryHistory, type HistoryWindow } from '../hooks/useFactoryHistory'
import { useWebSocket } from '../hooks/useWebSocket'
import type { FactoryDetail, NodeStatus, WorkloadStatus, DeviceEntry } from '../api/types'

type TabId = 'overview' | 'history' | 'infrastructure' | 'timeline'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',        label: 'Overview' },
  { id: 'history',         label: 'Environment History' },
  { id: 'infrastructure',  label: 'Infrastructure' },
  { id: 'timeline',        label: 'Timeline' },
]

// ─── Factory hero header ──────────────────────────────────────────────
function FactoryHeader({
  f, sparkData,
}: { f: FactoryDetail; sparkData: number[] }) {
  const riskLevel = f.risk?.level
  const riskScore = f.risk?.score
  const ns = resolveNodeSummary(f.infra_state)
  const color = riskColor(riskLevel)
  const envType = f.environment_type
  const tintPct =
    riskLevel === 'danger' ? 6 :
    riskLevel === 'warning' ? 5 :
    riskLevel === 'safe' ? 4 : 0
  const tintBg = tintPct > 0
    ? `color-mix(in srgb, ${color} ${tintPct}%, var(--surface))`
    : 'var(--surface)'

  return (
    <div className="factory-hero" style={{ background: tintBg }}>
      <div className="factory-hero-accent" style={{ background: color }} />

      <div className="factory-hero-copy">
        <div className="factory-hero-badges">
          {envType && (
            <>
              <span className="mono factory-hero-env">{envType}</span>
              <span className="factory-hero-dot">·</span>
            </>
          )}
          <LevelBadge level={riskLevel} />
          <PipelineBadge status={f.pipeline_status?.status} />
          <StaleBadge lastFactoryStateAt={f.last_factory_state_at} lastInfraStateAt={f.last_infra_state_at} />
        </div>
        <div>
          <h1 className="factory-hero-title">{f.factory_id}</h1>
          <p className="factory-hero-summary">
            {f.dashboard?.summary ?? '미수신'}
          </p>
        </div>
      </div>

      <div className="factory-hero-status">
        <div className="factory-hero-score-block">
          <span className="eyebrow">safety score</span>
          <div className="factory-hero-score-row">
            <span className="tnum factory-hero-score" style={{ color }}>{riskScore ?? '—'}</span>
            <span className="mono tnum factory-hero-score-unit">/100</span>
          </div>
        </div>

        <div className="factory-hero-spark">
          <div className="factory-hero-spark-head">
            <span className="eyebrow">last 24h</span>
            <span className="mono tnum">{sparkData.length}pt</span>
          </div>
          <div className="factory-hero-sparkline">
            <Sparkline data={sparkData} width={190} height={42} color={color} strokeWidth={1.6} />
          </div>
          <div className="factory-hero-meta">
            <span className="mono">
              node <span className="tnum" style={{ color: 'var(--ink)' }}>
                {ns ? `${ns.ready}/${ns.total}` : '—'}
              </span>
            </span>
            <span className="mono">{relTime(f.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────
function resolveNodeSummary(infra: FactoryDetail['infra_state']): { ready: number; total: number; not_ready: number } | null {
  if (!infra) return null
  if (infra.node_summary?.total != null) {
    const total = infra.node_summary.total
    const ready = infra.node_summary.ready ?? 0
    return { ready, total, not_ready: infra.node_summary.not_ready ?? (total - ready) }
  }
  if (infra.nodes && infra.nodes.length > 0) {
    const total = infra.nodes.length
    const ready = infra.nodes.filter((n) => n.ready === true).length
    return { ready, total, not_ready: total - ready }
  }
  return null
}

function resolveDevices(infra: FactoryDetail['infra_state']): {
  bme280: DeviceEntry | null
  camera: DeviceEntry | null
  microphone: DeviceEntry | null
} | null {
  if (!infra) return null
  if (infra.devices) {
    return {
      bme280: infra.devices.bme280 ?? null,
      camera: infra.devices.camera ?? null,
      microphone: infra.devices.microphone ?? null,
    }
  }
  if (infra.device_summary) {
    const ds = infra.device_summary
    return {
      bme280: ds.bme280_available != null ? { available: ds.bme280_available } : null,
      camera: ds.camera_available != null ? { available: ds.camera_available } : null,
      microphone: ds.microphone_available != null ? { available: ds.microphone_available } : null,
    }
  }
  return null
}

function OverviewTab({ data }: { data: FactoryDetail }) {
  const risk   = data.risk
  const sensor = extractSensor(data.factory_state)
  const ai     = extractAI(data.factory_state)
  const infra  = data.infra_state
  const ns     = resolveNodeSummary(infra)
  const ws     = infra?.workload_summary
  const devices = resolveDevices(infra)
  const causes = risk?.top_causes ?? []

  return (
    <>
      {/* Top causes */}
      <div className="card factory-section-card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="h2">주요 원인</h2>
            <span className="micro">risk.top_causes · {causes.length}건</span>
          </div>
        </div>
        <div className="card-bd">
          {causes.length === 0
            ? <EmptyNote text="top_causes가 미계산 상태입니다." />
            : (
              <div className="grid row3">
                {causes.slice(0, 3).map((c, i) => {
                  const name = typeof c === 'string' ? c : (c.name ?? c.field ?? '?')
                  const value = typeof c === 'string' ? null : c.value
                  const contribution = typeof c === 'string' ? null : c.contribution
                  return (
                    <CauseCard key={i} rank={i + 1} name={name} value={value} contribution={contribution} />
                  )
                })}
              </div>
            )}
        </div>
      </div>

      {/* Environment + Infrastructure */}
      <div className="factory-overview-grid">
        {/* Current environment */}
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 className="h2">현재 환경</h2>
              <span className="micro">factory_state · 평균값</span>
            </div>
          </div>
          <div className="card-bd factory-card-stack">
            <div className="grid row3" style={{ gap: 10 }}>
              <MetricLine label="온도" value={sensor.temperature} unit="°C" />
              <MetricLine label="습도" value={sensor.humidity} unit="%" />
              <MetricLine label="기압" value={sensor.pressure} unit="hPa" />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, paddingTop: 12, marginTop: 2, borderTop: '1px solid var(--line-2)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                AI 탐지 점수
                <span className="mono" style={{ color: 'var(--ink-4)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>
                  · 0 ~ 1
                </span>
              </span>
              <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <ThresholdSwatch color="var(--safe)" label="안전 < 0.3" />
                <ThresholdSwatch color="var(--warn)" label="주의 0.3~0.8" />
                <ThresholdSwatch color="var(--crit)" label="위험 ≥ 0.8" />
              </span>
            </div>
            <div className="grid row3" style={{ gap: 10 }}>
              <ScoreLine label="fire_score" value={ai.fire} />
              <ScoreLine label="fall_score" value={ai.fall} />
              <ScoreLine label="bend_score" value={ai.bend} />
            </div>

            <div style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface-2)', border: '1px solid var(--line-2)',
            }}>
              <span className="mono" style={{
                fontSize: 10, color: 'var(--ink-3)', letterSpacing: '.08em',
                textTransform: 'uppercase', minWidth: 110, fontWeight: 600,
              }}>abnormal_sound</span>
              <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                {ai.abnormal_sound ?? <span style={{ color: 'var(--ink-4)' }}>미수신</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Current infrastructure */}
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 className="h2">현재 인프라</h2>
              <span className="micro">infra_state · 요약</span>
            </div>
          </div>
          <div className="card-bd factory-card-stack">
            <div className="grid row2" style={{ gap: 10 }}>
              <SummaryLine
                label="Node Ready"
                value={ns ? `${ns.ready} / ${ns.total}` : '미수신'}
                tone={ns ? (ns.not_ready ?? 0) > 0 ? 'warn' : 'safe' : 'unk'}
                sub={ns ? (ns.not_ready ?? 0) > 0 ? `${ns.not_ready} NotReady` : 'all ready' : undefined}
              />
              <SummaryLine
                label="Workload Running"
                value={ws ? `${ws.running} / ${ws.total}` : '미수신'}
                tone={ws ? (ws.unhealthy ?? 0) > 0 ? 'warn' : 'safe' : 'unk'}
                sub={ws ? (ws.unhealthy ?? 0) > 0 ? `${ws.unhealthy} unhealthy` : 'all running' : undefined}
              />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              paddingTop: 4, borderTop: '1px solid var(--line-2)',
            }}>
              <span className="eyebrow">devices</span>
            </div>
            {devices ? (
              <div className="grid row3" style={{ gap: 10 }}>
                <DeviceStatusChip label="BME280" available={devices.bme280?.available} lastSeenAt={devices.bme280?.last_seen_at} />
                <DeviceStatusChip label="Camera" available={devices.camera?.available} lastSeenAt={devices.camera?.last_seen_at} />
                <DeviceStatusChip label="Microphone" available={devices.microphone?.available} lastSeenAt={devices.microphone?.last_seen_at} />
              </div>
            ) : (
              <EmptyNote text="device 정보 미수신" />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function CauseCard({ rank, name, value, contribution }: {
  rank: number; name: string; value?: number | null; contribution?: number | null
}) {
  return (
    <div style={{
      padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10,
      background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10,
      transition: 'border-color .12s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ink-5)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 6,
          background: 'var(--ink)', color: 'var(--surface)',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>{rank}</span>
        <span style={{
          fontSize: 13, color: 'var(--ink)', fontWeight: 500, lineHeight: 1.35,
          flex: 1, minWidth: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{name}</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)',
      }}>
        {value != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span className="eyebrow">value</span>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: 500 }}>
              {typeof value === 'number' ? value.toFixed(2) : value}
            </span>
          </div>
        )}
        {contribution != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, marginLeft: 'auto' }}>
            <span className="eyebrow">contribution</span>
            <span className="mono tnum" style={{ fontSize: 20, color: 'var(--crit)', fontWeight: 600, letterSpacing: '-0.01em' }}>
              −{contribution}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricLine({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const formatted = value == null ? null : value.toFixed(1)
  return (
    <div style={{
      padding: '12px 14px', border: '1px solid var(--line-2)', borderRadius: 8,
      background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {formatted == null
          ? <span style={{ fontSize: 14, color: 'var(--ink-4)' }}>미수신</span>
          : <>
              <span className="tnum" style={{
                fontSize: 26, fontWeight: 500, color: 'var(--ink)',
                letterSpacing: '-0.015em', lineHeight: 1,
              }}>{formatted}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{unit}</span>
            </>}
      </div>
    </div>
  )
}

function ScoreLine({ label, value }: { label: string; value: number | null }) {
  const v = value == null ? null : Math.max(0, Math.min(1, value))
  const tone =
    v == null ? 'unk' :
    v >= 0.8 ? 'crit' :
    v >= 0.3 ? 'warn' : 'safe'
  const color =
    tone === 'crit' ? 'var(--crit)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'safe' ? 'var(--safe)' : 'var(--ink-4)'
  return (
    <div style={{
      padding: '11px 14px', border: '1px solid var(--line-2)', borderRadius: 8,
      background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.04em', fontWeight: 500 }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 17, color, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {v == null ? '—' : v.toFixed(2)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--line-2)', overflow: 'visible' }}>
        <div style={{
          height: '100%', width: `${(v ?? 0) * 100}%`,
          background: color, borderRadius: 3, transition: 'width .4s ease',
        }} />
        <div style={{ position: 'absolute', left: '30%', top: -2, height: 10, width: 1, background: 'var(--line-3)', opacity: 0.7 }} />
        <div style={{ position: 'absolute', left: '80%', top: -2, height: 10, width: 1, background: 'var(--line-3)', opacity: 0.7 }} />
      </div>
    </div>
  )
}

function SummaryLine({ label, value, tone = 'ink', sub }: {
  label: string; value: string; tone?: string; sub?: string
}) {
  const color =
    tone === 'safe' ? 'var(--safe)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'crit' ? 'var(--crit)' :
    tone === 'unk'  ? 'var(--ink-4)' : 'var(--ink)'
  const subColor =
    tone === 'warn' ? 'var(--warn)' :
    tone === 'crit' ? 'var(--crit)' : 'var(--ink-3)'
  return (
    <div style={{
      padding: '12px 14px', border: '1px solid var(--line-2)', borderRadius: 8,
      background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: color, opacity: tone === 'ink' ? 0 : 1 }} />
      <span className="eyebrow">{label}</span>
      <span className="tnum" style={{ fontSize: 22, fontWeight: 500, color, letterSpacing: '-0.015em', lineHeight: 1 }}>
        {value}
      </span>
      {sub && <span className="micro" style={{ color: subColor }}>{sub}</span>}
    </div>
  )
}

function DeviceStatusChip({
  label, available, lastSeenAt,
}: { label: string; available?: boolean | null; lastSeenAt?: string | null }) {
  const tone = available === true ? 'safe' : available === false ? 'warn' : 'unk'
  const text = available === true ? '정상' : available === false ? '확인 필요' : '미수신'
  const dotColor = `var(--${tone})`
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8,
      background: 'var(--surface)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{label}</span>
          <span className="micro">{text}</span>
        </div>
        {lastSeenAt && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 3 }}>
            {relTime(lastSeenAt)}
          </div>
        )}
      </div>
    </div>
  )
}

function ThresholdSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{label}</span>
    </span>
  )
}

// ─── Environment History tab ──────────────────────────────────────────
const HISTORY_WINDOWS: HistoryWindow[] = ['1h', '6h', '12h', '24h']

function HistoryTab({ factoryId, refreshSignalKey }: { factoryId: string; refreshSignalKey: number }) {
  const [win, setWin] = useState<HistoryWindow>('1h')
  const { data: history, loading, refresh } = useFactoryHistory(factoryId, win)

  useEffect(() => {
    if (refreshSignalKey === 0) return
    void refresh()
  }, [refreshSignalKey, refresh])

  const isEmpty = history.length === 0

  return (
    <>
      {/* Window selector */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="eyebrow">history range</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>
            {win.toUpperCase()}
          </span>
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {history.length} pts
          </span>
        </div>
        <div className="seg">
          {HISTORY_WINDOWS.map((w) => (
            <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>
              {w.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Score */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="h2">안전 점수 추이</h2>
            <span className="micro">HISTORY#STATE · risk_score · 100이 가장 안전</span>
          </div>
        </div>
        <div className="card-bd">
          {loading
            ? <LoadingChart />
            : isEmpty ? <EmptyNote /> : <RiskScoreChart items={history} />}
          {!loading && !isEmpty && <RiskThresholdLegend />}
        </div>
      </div>

      {/* Sensor panels */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="h2">환경 센서</h2>
            <span className="micro">HISTORY#STATE · 온도 · 습도 · 기압</span>
          </div>
        </div>
        <div className="card-bd">
          {loading
            ? <LoadingChart />
            : isEmpty ? <EmptyNote /> : (
              <div className="grid row3">
                <SensorPanel
                  label="온도" unit="°C" color="oklch(0.65 0.18 30)"
                  data={history.map((h) => h.temperature_celsius_avg ?? null)} />
                <SensorPanel
                  label="습도" unit="%" color="oklch(0.65 0.15 230)"
                  data={history.map((h) => h.humidity_percent_avg ?? null)} />
                <SensorPanel
                  label="기압" unit="hPa" color="oklch(0.55 0.10 280)"
                  data={history.map((h) => h.pressure_hpa_avg ?? null)} />
              </div>
            )}
        </div>
      </div>

      {/* AI scores */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="h2">AI 탐지 점수</h2>
            <span className="micro">HISTORY#STATE · fire / fall / bend · 0 ~ 1</span>
          </div>
        </div>
        <div className="card-bd">
          {loading
            ? <LoadingChart />
            : isEmpty ? <EmptyNote /> : <AIScoreChart items={history} />}
          {!loading && !isEmpty && <AIScoreThresholdLegend />}
        </div>
      </div>
    </>
  )
}

function SensorPanel({
  label, unit, color, data,
}: { label: string; unit: string; color: string; data: (number | null)[] }) {
  const valid = data.filter((v): v is number => v != null && !isNaN(v))
  const cur   = valid.length ? valid[valid.length - 1]! : null
  const lo    = valid.length ? Math.min(...valid) : null
  const hi    = valid.length ? Math.max(...valid) : null
  const delta = valid.length >= 2 ? valid[valid.length - 1]! - valid[0]! : null

  return (
    <div style={{
      padding: 14, border: '1px solid var(--line)', borderRadius: 10,
      background: 'var(--surface)', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: color, opacity: 0.5 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="eyebrow">{label}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="tnum" style={{
              fontSize: 24, color: 'var(--ink)', fontWeight: 500,
              letterSpacing: '-0.015em', lineHeight: 1,
            }}>{cur == null ? '—' : cur.toFixed(1)}</span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{unit}</span>
          </div>
        </div>
        {delta != null && (
          <span className="mono tnum" style={{
            fontSize: 10.5, color: 'var(--ink-3)',
            padding: '2px 6px', borderRadius: 4,
            background: 'var(--surface-2)', border: '1px solid var(--line-2)',
          }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
          </span>
        )}
      </div>
      {/* Mini spark using raw SVG for lightweight panel chart */}
      <MiniSparkline data={data} color={color} height={64} />
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)',
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10.5, color: 'var(--ink-3)',
      }}>
        <span>min <span className="mono tnum" style={{ color: 'var(--ink-2)', marginLeft: 4 }}>
          {lo == null ? '—' : lo.toFixed(1)}
        </span></span>
        <span>max <span className="mono tnum" style={{ color: 'var(--ink-2)', marginLeft: 4 }}>
          {hi == null ? '—' : hi.toFixed(1)}
        </span></span>
      </div>
    </div>
  )
}

function MiniSparkline({ data, color, height = 60 }: { data: (number | null)[]; color: string; height?: number }) {
  const valid = data.filter((v): v is number => v != null && !isNaN(v))
  if (valid.length < 2) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px dashed var(--line-3)', borderRadius: 6, background: 'var(--surface-2)',
      }}>
        <span className="micro">데이터 없음</span>
      </div>
    )
  }
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1
  const w = 300
  const pts = data
    .map((v, i) => {
      if (v == null) return null
      const x = (i / (data.length - 1)) * w
      const y = height - ((v - min) / range) * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')

  const fillPts = `0,${height} ` + pts + ` ${w},${height}`

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}>
      <polygon points={fillPts} fill={color} fillOpacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function RiskThresholdLegend() {
  return (
    <div style={{
      display: 'flex', gap: 14, marginTop: 10,
      padding: '8px 12px', borderRadius: 7,
      background: 'var(--surface-2)', border: '1px solid var(--line-2)',
      fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap', alignItems: 'center',
    }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
        thresholds
      </span>
      <span style={{ width: 1, height: 12, background: 'var(--line)' }} />
      {([
        { color: 'var(--safe)', label: '안전 85~100' },
        { color: 'var(--warn)', label: '주의 50~84' },
        { color: 'var(--crit)', label: '위험 0~49' },
      ] as const).map((t) => (
        <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: t.color, flexShrink: 0 }} />
          {t.label}
        </span>
      ))}
    </div>
  )
}

function AIScoreThresholdLegend() {
  return (
    <div style={{
      display: 'flex', gap: 14, marginTop: 10,
      padding: '8px 12px', borderRadius: 7,
      background: 'var(--surface-2)', border: '1px solid var(--line-2)',
      fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap', alignItems: 'center',
    }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
        ai thresholds
      </span>
      <span style={{ width: 1, height: 12, background: 'var(--line)' }} />
      {([
        { color: 'var(--safe)', label: '안전 0.0~0.3' },
        { color: 'var(--warn)', label: '주의 0.3~0.8' },
        { color: 'var(--crit)', label: '위험 0.8~1.0' },
      ] as const).map((t) => (
        <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ width: 10, height: 10, background: t.color, borderRadius: 2, flexShrink: 0 }} />
          {t.label}
        </span>
      ))}
    </div>
  )
}

// ─── Infrastructure tab ───────────────────────────────────────────────
function NetReachCell({ value }: { value?: string | null }) {
  if (value == null) return <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>
  if (value === 'unknown') {
    return (
      <span className="pill unk" style={{ padding: '3px 6px', fontSize: 10.5 }}>
        <span className="dot" />unknown
      </span>
    )
  }
  const ok = value === 'reachable' || value === 'ok'
  return (
    <span className={`pill ${ok ? 'safe' : 'crit'}`} style={{ padding: '3px 6px', fontSize: 10.5 }}>
      <span className="dot" />{value}
    </span>
  )
}

function HeartbeatCard({ hb }: { hb: NonNullable<FactoryDetail['infra_state']>['heartbeat'] }) {
  if (!hb) return null
  const agentTone =
    hb.agent_status === 'running' ? 'safe' :
    hb.agent_status === 'degraded' ? 'warn' :
    hb.agent_status ? 'crit' : 'unk'
  const agentColor =
    agentTone === 'safe' ? 'var(--safe)' :
    agentTone === 'warn' ? 'var(--warn)' :
    agentTone === 'crit' ? 'var(--crit)' : 'var(--ink-4)'

  const spoolTone =
    hb.last_spool_write_status === 'success' ? 'safe' :
    hb.last_spool_write_status === 'failed' ? 'crit' :
    hb.last_spool_write_status === 'unknown' ? 'warn' : 'unk'
  const spoolColor =
    spoolTone === 'safe' ? 'var(--safe)' :
    spoolTone === 'warn' ? 'var(--warn)' :
    spoolTone === 'crit' ? 'var(--crit)' : 'var(--ink-4)'

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 className="h2">Edge Agent Heartbeat</h2>
          <span className="micro">infra_state.heartbeat</span>
        </div>
      </div>
      <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">agent_status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: agentColor, flexShrink: 0 }} />
            <span style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
              {hb.agent_status ?? '—'}
            </span>
          </div>
          <span className="micro">edge agent 상태</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">last_spool_write_status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: spoolColor, flexShrink: 0 }} />
            <span style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
              {hb.last_spool_write_status ?? '—'}
            </span>
          </div>
          <span className="micro">spool write 마지막 시도 결과</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="eyebrow">last_spool_write_at</span>
          {hb.last_spool_write_at ? (
            <>
              <span className="mono tnum" style={{ fontSize: 16, color: 'var(--ink)' }}>
                {relTime(hb.last_spool_write_at)}
              </span>
              <span className="micro mono">{hb.last_spool_write_at}</span>
            </>
          ) : (
            <>
              <span className="mono" style={{ fontSize: 14, color: 'var(--ink-4)' }}>—</span>
              <span className="micro">spool write 기록 없음</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfraTab({ data, factoryId, refreshSignalKey }: { data: FactoryDetail; factoryId: string; refreshSignalKey: number }) {
  const [win, setWin] = useState<HistoryWindow>('1h')
  const { data: history, loading, refresh } = useFactoryHistory(factoryId, win)

  useEffect(() => {
    if (refreshSignalKey === 0) return
    void refresh()
  }, [refreshSignalKey, refresh])

  const nodes: NodeStatus[]         = data.infra_state?.nodes ?? []
  const workloads: WorkloadStatus[] = data.infra_state?.workloads ?? []
  const ws  = data.infra_state?.workload_summary
  const ps  = data.pipeline_status
  const hb  = data.infra_state?.heartbeat
  const devices = resolveDevices(data.infra_state)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Edge Agent Heartbeat */}
      {hb && <HeartbeatCard hb={hb} />}

      {/* Pipeline */}
      {ps && (
        <div className="card">
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 className="h2">Pipeline</h2>
              <span className="micro">latest age vs LATEST 수신 시각</span>
            </div>
            <PipelineBadge status={ps.status} />
          </div>
          <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
            <PipelineAge label="latest_infra_state_age" seconds={ps.latest_infra_state_age_seconds} warn={40} crit={60} />
            <PipelineAge label="latest_s3_raw_age" seconds={ps.latest_s3_raw_age_seconds} warn={60} crit={120} />
          </div>
        </div>
      )}

      {/* Nodes table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="h2">Nodes</h2>
            <span className="micro">
              {nodes.length > 0
                ? `infra_state.nodes · ${nodes.length}개`
                : '미수신'}
            </span>
          </div>
        </div>
        {nodes.length === 0
          ? <EmptyNote text="infra_state 미수신." />
          : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>node_id</th>
                  <th>role</th>
                  <th>Ready</th>
                  <th style={{ textAlign: 'right' }}>CPU%</th>
                  <th style={{ textAlign: 'right' }}>Memory%</th>
                  <th style={{ textAlign: 'right' }}>Disk%</th>
                  <th>network</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.node_id}>
                    <td>
                      <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                        {n.node_id}
                      </span>
                    </td>
                    <td>
                      {n.role
                        ? <span className="mono" style={{
                            fontSize: 10.5, color: 'var(--ink-3)',
                            padding: '2px 6px', border: '1px solid var(--line-2)',
                            borderRadius: 4, background: 'var(--surface-2)',
                          }}>{n.role}</span>
                        : <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>
                      }
                    </td>
                    <td>
                      <span className={`pill ${n.ready ? 'safe' : 'crit'}`} style={{ padding: '3px 6px', fontSize: 10.5 }}>
                        <span className="dot" />{n.ready ? 'Ready' : 'NotReady'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}><UsageCell value={n.cpu_usage_percent} /></td>
                    <td style={{ textAlign: 'right' }}><UsageCell value={n.memory_usage_percent} /></td>
                    <td style={{ textAlign: 'right' }}><UsageCell value={n.disk_usage_percent} /></td>
                    <td><NetReachCell value={n.network_reachability} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* Node usage trend */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 className="h2">노드 사용률 추이</h2>
            <span className="micro">HISTORY#STATE · node별 시리즈</span>
          </div>
          <div className="seg">
            {HISTORY_WINDOWS.map((w) => (
              <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>{w.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="card-bd">
          {loading
            ? <LoadingChart />
            : nodes.length === 0 ? <EmptyNote /> : (
              <div className="grid row3">
                <div style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>CPU%</div>
                  <NodeResourceChart items={history} field="cpu_usage_percent" label="CPU" />
                </div>
                <div style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>Memory%</div>
                  <NodeResourceChart items={history} field="memory_usage_percent" label="Memory" />
                </div>
                <div style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>Disk%</div>
                  <NodeResourceChart items={history} field="disk_usage_percent" label="Disk" />
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Workloads */}
      {(ws || workloads.length > 0) && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-hd">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 className="h2">Workloads</h2>
              {ws && (
                <span className="micro">{ws.running}/{ws.total} Running</span>
              )}
            </div>
            {ws && (ws.unhealthy ?? 0) > 0 && (
              <span className="pill warn" style={{ padding: '3px 6px', fontSize: 10.5 }}>
                <span className="dot" />unhealthy · {ws.unhealthy}
              </span>
            )}
          </div>
          {workloads.length > 0 && (
            <table className="tbl">
              <thead>
                <tr>
                  <th>namespace</th>
                  <th>name</th>
                  <th>status</th>
                  <th>ready</th>
                  <th>node_id</th>
                  <th style={{ textAlign: 'right' }}>restart_count</th>
                </tr>
              </thead>
              <tbody>
                {workloads.map((w, i) => {
                  const hot = (w.restart_count ?? 0) >= 5
                  const tone = w.status === 'Running' ? 'safe' : w.status === 'Pending' ? 'warn' : 'crit'
                  return (
                    <tr key={i} style={hot ? { background: 'var(--warn-tint-2)' } : undefined}>
                      <td>
                        <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                          {w.namespace ?? '—'}
                        </span>
                      </td>
                      <td><span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{w.name}</span></td>
                      <td>
                        <span className={`pill ${tone}`} style={{ padding: '3px 6px', fontSize: 10.5 }}>
                          <span className="dot" />{w.status ?? '—'}
                        </span>
                      </td>
                      <td>
                        {w.ready == null
                          ? <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>
                          : <span style={{ fontSize: 11.5, color: w.ready ? 'var(--safe)' : 'var(--crit)', fontWeight: 500 }}>
                              {w.ready ? 'true' : 'false'}
                            </span>
                        }
                      </td>
                      <td><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{w.node_id ?? '—'}</span></td>
                      <td style={{ textAlign: 'right' }}><RestartCount value={w.restart_count} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Devices */}
      {devices && (
        <div className="card">
          <div className="card-hd">
            <h2 className="h2">Devices</h2>
            <span className="micro">devices · available + last_seen_at</span>
          </div>
          <div className="card-bd">
            <div className="grid row3" style={{ gap: 10 }}>
              <DeviceStatusChip label="BME280" available={devices.bme280?.available} lastSeenAt={devices.bme280?.last_seen_at} />
              <DeviceStatusChip label="Camera" available={devices.camera?.available} lastSeenAt={devices.camera?.last_seen_at} />
              <DeviceStatusChip label="Microphone" available={devices.microphone?.available} lastSeenAt={devices.microphone?.last_seen_at} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsageCell({ value }: { value?: number | null }) {
  if (value == null) {
    return <span style={{ color: 'var(--ink-4)', fontSize: 11.5, whiteSpace: 'nowrap' }}>미수신</span>
  }
  const tone = value >= 85 ? 'crit' : value >= 70 ? 'warn' : 'ink'
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 56, height: 6, borderRadius: 3, background: 'var(--line-2)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: '70%', top: -1, bottom: -1, width: 1, background: 'var(--line-3)', opacity: 0.6 }} />
        <div style={{ position: 'absolute', left: '85%', top: -1, bottom: -1, width: 1, background: 'var(--line-3)', opacity: 0.6 }} />
      </div>
      <span className="mono tnum" style={{ fontSize: 12, color, minWidth: 28, textAlign: 'right', fontWeight: 600 }}>
        {Math.round(value)}
      </span>
    </div>
  )
}

function PipelineAge({ label, seconds, warn, crit }: {
  label: string; seconds?: number | null; warn: number; crit: number
}) {
  const tone =
    seconds == null ? 'unk' :
    seconds >= crit ? 'crit' :
    seconds >= warn ? 'warn' : 'safe'
  const color =
    tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' :
    tone === 'safe' ? 'var(--safe)' : 'var(--ink-4)'
  const cap = crit * 1.5
  const pct = seconds == null ? 0 : Math.min(100, (seconds / cap) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="eyebrow">{label}</span>
        <span className="micro mono" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
          warn ≥ {warn}s · crit ≥ {crit}s
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="tnum" style={{ fontSize: 26, color, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1 }}>
          {seconds ?? '—'}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>초</span>
      </div>
      <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'var(--line-2)', overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s ease' }} />
        <div style={{ position: 'absolute', left: `${(warn / cap) * 100}%`, top: -2, height: 9, width: 1, background: 'var(--warn)', opacity: 0.5 }} />
        <div style={{ position: 'absolute', left: `${(crit / cap) * 100}%`, top: -2, height: 9, width: 1, background: 'var(--crit)', opacity: 0.5 }} />
      </div>
    </div>
  )
}

function RestartCount({ value }: { value?: number | null }) {
  if (value == null) return <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>
  const tone = value >= 10 ? 'crit' : value >= 5 ? 'warn' : value > 0 ? 'ink' : 'mute'
  const color =
    tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' :
    tone === 'ink'  ? 'var(--ink-2)' : 'var(--ink-4)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      {value >= 5 && (
        <span className="mono" style={{
          fontSize: 9.5, color: '#fff', letterSpacing: '.1em', fontWeight: 700,
          padding: '2px 6px', borderRadius: 4, background: color,
        }}>HOT</span>
      )}
      <span className="mono tnum" style={{ fontSize: 13, color, fontWeight: value > 0 ? 600 : 400 }}>
        {value}
      </span>
    </div>
  )
}

// ─── Timeline tab ─────────────────────────────────────────────────────
function TimelineTab({ factoryId, refreshSignalKey }: { factoryId: string; refreshSignalKey: number }) {
  const [win, setWin] = useState<HistoryWindow>('1h')
  const { data: history, loading, refresh } = useFactoryHistory(factoryId, win)

  useEffect(() => {
    if (refreshSignalKey === 0) return
    void refresh()
  }, [refreshSignalKey, refresh])

  const events = deriveTimelineEvents(history)

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 className="h2">Timeline</h2>
          <span className="micro">HISTORY#STATE 비교 derive · {events.length}건</span>
        </div>
        <div className="seg">
          {HISTORY_WINDOWS.map((w) => (
            <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>{w.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : events.length === 0 ? (
        <EmptyNote text="이 기간에 derive 가능한 이벤트가 없습니다." />
      ) : (
        <div style={{ padding: '6px 0' }}>
          {events.map((e, i) => (
            <TimelineRow key={i} e={e} last={i === events.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface TimelineEvent {
  kind: string
  severity: 'info' | 'warning' | 'danger'
  title: string
  detail: string
  ts: number
}

function deriveTimelineEvents(history: import('../api/types').HistoryItem[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!
    const curr = history[i]!
    const tsMs  = curr.timestamp ? new Date(curr.timestamp).getTime() : Date.now()

    // Risk level change
    if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
      const sev: TimelineEvent['severity'] =
        curr.risk_level === 'danger' ? 'danger' :
        curr.risk_level === 'warning' ? 'warning' : 'info'
      events.push({
        kind: 'risk_level',
        severity: sev,
        title: `Risk Level ${levelKr(prev.risk_level)} → ${levelKr(curr.risk_level)}`,
        detail: `risk_score: ${curr.risk_score ?? '—'}`,
        ts: tsMs,
      })
    }

    // Risk score drop ≥ 10
    if (curr.risk_score != null && prev.risk_score != null) {
      const diff = curr.risk_score - prev.risk_score
      if (diff <= -10) {
        events.push({
          kind: 'risk_drop',
          severity: 'danger',
          title: `Risk Score 급락 ${diff.toFixed(1)}`,
          detail: `${prev.risk_score} → ${curr.risk_score}`,
          ts: tsMs,
        })
      } else if (diff >= 10) {
        events.push({
          kind: 'recovery',
          severity: 'info',
          title: `Risk Score 회복 +${diff.toFixed(1)}`,
          detail: `${prev.risk_score} → ${curr.risk_score}`,
          ts: tsMs,
        })
      }
    }
  }
  return events.reverse()
}

function levelKr(l?: string) {
  return l === 'safe' ? '안전' : l === 'warning' ? '주의' : l === 'danger' ? '위험' : l ?? '—'
}

function TimelineRow({ e, last }: { e: TimelineEvent; last: boolean }) {
  const tone = e.severity === 'danger' ? 'crit' : e.severity === 'warning' ? 'warn' : 'info'
  const color =
    tone === 'crit' ? 'var(--crit)' :
    tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
  const sevLabel = e.severity === 'danger' ? 'danger' : e.severity === 'warning' ? 'warning' : 'info'

  const t = new Date(e.ts)
  const hhmm = t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const relT = relTime(t.toISOString())

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        gap: 14, padding: '14px 18px',
        borderBottom: last ? '0' : '1px solid var(--line-2)',
        transition: 'background .12s', cursor: 'default',
      }}
      onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}
    >
      {/* Rail + dot */}
      <div style={{ position: 'relative', width: 22 }}>
        <div style={{
          position: 'absolute', left: 5, top: 3,
          width: 10, height: 10, borderRadius: '50%', background: color,
          boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent), 0 0 0 5px var(--surface)`,
        }} />
        {!last && (
          <div style={{
            position: 'absolute', left: 9.5, top: 18, bottom: -14,
            width: 1, background: 'var(--line-2)',
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--ink-3)', letterSpacing: '.06em',
            padding: '2px 6px', border: '1px solid var(--line-2)', borderRadius: 4,
            background: 'var(--surface-2)', fontWeight: 500,
          }}>{e.kind}</span>
          <span className={`pill ${tone}`} style={{ padding: '2px 6px', fontSize: 9.5 }}>
            <span className="dot" />{sevLabel}
          </span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, lineHeight: 1.35 }}>
          {e.title}
        </div>
        <div className="micro">{e.detail}</div>
      </div>

      {/* Time */}
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
        <span className="mono tnum" style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>
          {relT}
        </span>
        <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
          {hhmm}
        </span>
      </div>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────
function EmptyNote({ text = '선택한 시간 범위에 데이터가 없습니다.' }: { text?: string }) {
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }}>
      {text}
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
  const [refreshSignalKey, setRefreshSignalKey] = useState(0)
  const [refreshInterval, setRefreshInterval] = useState(0)
  // Tracks which tabs have ever been visited so their components stay mounted
  // (display:none instead of unmount), preserving cached data across tab switches.
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set<TabId>(['overview']))
  const { data, loading, error, refresh } = useFactory(factoryId)
  const hasFactoryData = data !== null
  const { status: wsStatus, lastMessage } = useWebSocket(factoryId)
  const { data: fleetData, refresh: refreshFleet } = useFactories()

  // 24h history for the header sparkline
  const { data: history24h, refresh: refreshHistory24h } = useFactoryHistory(factoryId, '24h')
  const sparkData = history24h
    .map((h) => h.risk_score)
    .filter((v): v is number => v != null)

  const refreshPageData = useCallback(() => {
    void refresh()
    void refreshHistory24h()
    void refreshFleet()
    setRefreshSignalKey((k) => k + 1)
  }, [refresh, refreshHistory24h, refreshFleet])

  useEffect(() => {
    if (refreshInterval <= 0) return
    const id = window.setInterval(() => {
      refreshPageData()
    }, refreshInterval)
    return () => window.clearInterval(id)
  }, [refreshInterval, refreshPageData])

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId)
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev
      const next = new Set(prev)
      next.add(tabId)
      return next
    })
  }

  // Use all factories for the sidebar. If fleet data hasn't loaded yet (direct
  // URL access, no cache), show the current factory so the section stays visible.
  const sidebarFactories = (fleetData?.factories
    ? fleetData.factories.map((f) => ({
        factory_id: f.factory_id,
        risk_level: f.risk_level ?? f.risk?.level,
        risk_score: f.risk_score ?? f.risk?.score,
      }))
    : [{ factory_id: factoryId, risk_level: data?.risk?.level, risk_score: data?.risk?.score }]
  ).sort((a, b) => a.factory_id.localeCompare(b.factory_id))

  return (
    <Shell
      factories={sidebarFactories}
      crumbs={[
        { label: 'Aegis-π' },
        { label: 'Fleet', href: '/' },
        { label: factoryId },
      ]}
      onBack={() => navigate('/')}
      wsStatus={wsStatus}
      wsMessage={lastMessage}
      onRefresh={refreshPageData}
      refreshInterval={refreshInterval}
      onIntervalChange={setRefreshInterval}
    >
      {loading && !hasFactoryData && (
        <div className="empty-state" style={{ paddingTop: 60 }}>
          <div className="spinner" />
          <span className="sub">공장 상태 로드 중...</span>
        </div>
      )}

      {!hasFactoryData && error && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--crit)' }}>
            <AlertTriangle size={18} />
            <span style={{ fontWeight: 600 }}>데이터 로드 실패</span>
          </div>
          <p className="sub" style={{ marginTop: 8 }}>{error.message}</p>
          <button className="btn" style={{ marginTop: 14 }} onClick={refreshPageData}>
            <RefreshCw size={13} />다시 시도
          </button>
        </div>
      )}

      {data && (
        <>
          <FactoryHeader f={data} sparkData={sparkData} />

          <div className="factory-tabs-panel">
            <div className="tabs factory-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`tab ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'overview' && <OverviewTab data={data} />}

          {/* History tabs: mounted on first visit, hidden (not unmounted) on tab switch
              so cached data survives without re-fetch on return visits. */}
          {visitedTabs.has('history') && (
            <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
              <HistoryTab factoryId={factoryId} refreshSignalKey={refreshSignalKey} />
            </div>
          )}
          {visitedTabs.has('infrastructure') && (
            <div style={{ display: activeTab === 'infrastructure' ? 'block' : 'none' }}>
              <InfraTab data={data} factoryId={factoryId} refreshSignalKey={refreshSignalKey} />
            </div>
          )}
          {visitedTabs.has('timeline') && (
            <div style={{ display: activeTab === 'timeline' ? 'block' : 'none' }}>
              <TimelineTab factoryId={factoryId} refreshSignalKey={refreshSignalKey} />
            </div>
          )}
        </>
      )}

      {/* WS status dot */}
      {wsStatus && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 20,
          background: 'var(--surface)', border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-card)',
          fontSize: 11, color: 'var(--ink-3)', zIndex: 5,
        }}>
          <ConnStatus status={wsStatus} lastMessage={lastMessage} />
        </div>
      )}
    </Shell>
  )
}
