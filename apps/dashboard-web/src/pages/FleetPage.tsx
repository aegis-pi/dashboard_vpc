import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { Shell } from '../components/Layout'
import { LevelBadge, PipelineBadge, StaleBadge } from '../components/Badge'
import { relTime, riskColor } from '../utils/format'
import { Sparkline } from '../components/Sparkline'
import { useFactories } from '../hooks/useFactories'
import { useFleetRecentChanges, type RecentChange } from '../hooks/useFleetRecentChanges'
import { AuthError } from '../api/client'
import type { FactorySummary } from '../api/types'

const SERIF = '"Instrument Serif", ui-serif, Georgia, serif'

const BANDS = [
  { from: 0, to: 50, color: 'var(--crit)', label: '위험' },
  { from: 50, to: 85, color: 'var(--warn)', label: '주의' },
  { from: 85, to: 100, color: 'var(--safe)', label: '안전' },
]

// ─── Normalize factory to consistent shape ────────────────────────────
function normalizeFactory(f: FactorySummary) {
  const riskLevel = f.risk_level ?? f.risk?.level
  const riskScore = f.risk_score ?? f.risk?.score
  const topCauses = f.top_causes ?? f.risk?.top_causes ?? []
  const nodeReady = f.node_ready ?? f.infra_state?.node_summary?.ready
  const nodeTotal = f.node_total ?? f.infra_state?.node_summary?.total
  const pipeline = f.pipeline_status ?? 'normal'
  const envType = f.environment_type
  return { ...f, riskLevel, riskScore, topCauses, nodeReady, nodeTotal, pipeline, envType }
}

// ─── Label anti-collision (identical to frontend reference) ──────────
function computeLabelPositions(dots: number[], minGap = 11): number[] {
  if (!dots.length) return []
  const labels = [...dots]
  const clusters: number[][] = []
  let cur: number[] = [0]
  for (let i = 1; i < dots.length; i++) {
    if ((dots[i]! - dots[i - 1]!) < minGap) cur.push(i)
    else { clusters.push(cur); cur = [i] }
  }
  clusters.push(cur)
  for (const c of clusters) {
    if (c.length === 1) continue
    const first = dots[c[0]!]!
    const last = dots[c[c.length - 1]!]!
    const center = (first + last) / 2
    const total = minGap * (c.length - 1)
    let startX = center - total / 2
    if (startX < 6) startX = 6
    if (startX + total > 94) startX = 94 - total
    c.forEach((idx, j) => { labels[idx] = startX + j * minGap })
  }
  for (let i = 1; i < labels.length; i++) {
    if ((labels[i]! - labels[i - 1]!) < minGap) labels[i] = labels[i - 1]! + minGap
  }
  for (let i = labels.length - 1; i >= 0; i--) {
    if (labels[i]! > 94) labels[i] = 94
    if (i < labels.length - 1 && (labels[i + 1]! - labels[i]!) < minGap) {
      labels[i] = labels[i + 1]! - minGap
    }
  }
  if ((labels[0] ?? 0) < 6) {
    const shift = 6 - labels[0]!
    labels.forEach((_, i) => { labels[i] = labels[i]! + shift })
  }
  return labels
}

// ─── Fleet Safety Pulse ────────────────────────────────────────────────
function FleetPulse({ factories }: { factories: ReturnType<typeof normalizeFactory>[] }) {
  const danger  = factories.filter((f) => f.riskLevel === 'danger').length
  const warning = factories.filter((f) => f.riskLevel === 'warning').length
  const safe    = factories.filter((f) => f.riskLevel === 'safe').length
  const total   = factories.length

  const dotXs    = factories.map((f) => Math.max(2, Math.min(98, f.riskScore ?? 50)))
  // Vertical stack index for tied dots so identical scores stay visible
  const dotStack = dotXs.map((x, i) => {
    let s = 0
    for (let j = 0; j < i; j++) {
      if (Math.abs(x - dotXs[j]!) < 0.4) s++
    }
    return s
  })
  const labelXs  = computeLabelPositions(dotXs, 11)
  const maxStack = Math.max(0, ...dotStack)
  const areaH    = 78 + maxStack * 18

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      {/* Header: title + compact stats pill */}
      <div style={{
        padding: '16px 22px 10px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 20, flexWrap: 'wrap',
      }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Fleet Safety Pulse</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            오른쪽에 가까울수록 안전. 점은 각 공장의 현재 안전 점수.
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '3px 4px', borderRadius: 7,
          background: 'var(--surface-2)', border: '1px solid var(--line-2)',
        }}>
          <PulseStat label="공장" value={total} />
          <StatDivider />
          <PulseStat label="위험" value={danger} dotColor="var(--crit)" active={danger > 0} />
          <StatDivider />
          <PulseStat label="주의" value={warning} dotColor="var(--warn)" active={warning > 0} />
          <StatDivider />
          <PulseStat label="안전" value={safe} dotColor="var(--safe)" active={safe > 0} />
        </div>
      </div>

      {/* Track + anti-collision label area */}
      <div style={{ padding: '4px 22px 18px' }}>
        <div style={{ position: 'relative', padding: '6px 6px 0', maxWidth: 1080, margin: '0 auto' }}>
          {/* Band track */}
          <div style={{
            position: 'relative',
            height: 'clamp(32px, 3.2vw, 42px)',
            borderRadius: 10, border: '1px solid var(--line-2)',
            overflow: 'hidden', background: 'var(--surface-2)',
          }}>
            {BANDS.map((b) => (
              <div key={b.label} style={{
                position: 'absolute', left: `${b.from}%`, width: `${b.to - b.from}%`,
                top: 0, bottom: 0,
                background: `color-mix(in srgb, ${b.color} 7%, transparent)`,
              }} />
            ))}
            {/* Band labels */}
            {BANDS.map((b) => (
              <div key={`lbl-${b.label}`} style={{
                position: 'absolute', left: `${b.from}%`, width: `${b.to - b.from}%`,
                top: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <span className="mono" style={{
                  fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                  color: b.color, fontWeight: 700, opacity: 0.95,
                }}>{b.label}</span>
              </div>
            ))}
            {/* Threshold gridlines */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--line-3)' }} />
            <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 1, background: 'var(--line-3)' }} />
          </div>

          {/* Anti-collision label area */}
          <div style={{ position: 'relative', height: areaH, marginTop: 6 }}>
            {/* SVG leader lines */}
            <svg width="100%" height={areaH}
              viewBox={`0 0 100 ${areaH}`} preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {factories.map((f, i) => {
                const x1 = dotXs[i]!
                const x2 = labelXs[i]!
                const y1 = 4 + (dotStack[i] ?? 0) * 18
                const y2 = areaH - 30
                const same = Math.abs(x1 - x2) < 0.2
                const d = same
                  ? `M ${x1} ${y1} L ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
                return (
                  <path key={f.factory_id} d={d}
                    fill="none" stroke="var(--line-3)"
                    strokeWidth="1" vectorEffect="non-scaling-stroke" />
                )
              })}
            </svg>

            {/* Score dots — anchored to band edge; tied dots stack downward */}
            {factories.map((f, i) => {
              const color = riskColor(f.riskLevel)
              return (
                <div key={`dot-${f.factory_id}`} style={{
                  position: 'absolute', left: `${dotXs[i]!}%`,
                  top: -7 + (dotStack[i] ?? 0) * 18,
                  transform: 'translateX(-50%)', pointerEvents: 'none',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', background: color,
                    boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent), 0 0 0 1px var(--surface)`,
                  }} />
                </div>
              )
            })}

            {/* Score + factory_id labels at bottom */}
            {factories.map((f, i) => {
              const color = riskColor(f.riskLevel)
              return (
                <div key={`lbl-${f.factory_id}`} style={{
                  position: 'absolute', left: `${labelXs[i]!}%`, bottom: 0,
                  transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span className="tnum" style={{
                    fontFamily: SERIF,
                    fontSize: 30, lineHeight: 0.85, color,
                    letterSpacing: '-0.01em',
                    display: 'inline-block',
                    transform: 'scaleY(0.84) scaleX(1.06)',
                    transformOrigin: 'center bottom',
                  }}>{f.riskScore ?? '—'}</span>
                  <span className="mono" style={{
                    fontSize: 10.5, color: 'var(--ink-2)',
                    letterSpacing: '.03em', marginTop: 4, fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>{f.factory_id}</span>
                </div>
              )
            })}
          </div>

          {/* Scale axis */}
          <div style={{
            position: 'relative', height: 14, marginTop: 8,
            fontSize: 10, color: 'var(--ink-4)',
            borderTop: '1px dashed var(--line-2)', paddingTop: 4,
          }}>
            <div className="mono" style={{ position: 'absolute', left: 0 }}>0</div>
            <div className="mono" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>50</div>
            <div className="mono" style={{ position: 'absolute', left: '85%', transform: 'translateX(-50%)' }}>85</div>
            <div className="mono" style={{ position: 'absolute', right: 0 }}>100</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PulseStat({
  label, value, dotColor, active = true,
}: { label: string; value: number; dotColor?: string; active?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px' }}>
      {dotColor && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: dotColor,
          opacity: active ? 1 : 0.4, flexShrink: 0,
        }} />
      )}
      <span className="tnum" style={{
        fontSize: 12, fontWeight: 500, lineHeight: 1,
        color: active && dotColor ? dotColor : 'var(--ink)',
        letterSpacing: '-0.005em',
      }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 400, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

function StatDivider() {
  return (
    <span style={{
      display: 'inline-block', width: 1, height: 14,
      background: 'var(--line)', margin: '0 1px',
    }} />
  )
}

// ─── Factory card ─────────────────────────────────────────────────────
function FactoryCard({
  f, onClick,
}: { f: ReturnType<typeof normalizeFactory>; onClick: () => void }) {
  const color = riskColor(f.riskLevel)
  const causes = Array.isArray(f.topCauses) ? f.topCauses : []

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        transition: 'border-color .12s, box-shadow .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--ink-5)'
        e.currentTarget.style.boxShadow = 'var(--shadow-lift)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--line)'
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Left stripe */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />

      <div style={{ padding: '16px 18px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {f.envType && (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '.06em' }}>
                {f.envType}
              </span>
            )}
            <span style={{
              fontSize: 15, fontWeight: 600, color: 'var(--ink)',
              marginTop: f.envType ? 2 : 0,
            }}>
              {f.factory_id}
            </span>
          </div>
          <LevelBadge level={f.riskLevel} />
        </div>

        {/* Score + sparkline */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="tnum" style={{
              fontFamily: SERIF,
              fontSize: 68, lineHeight: 0.78,
              color, letterSpacing: '-0.02em', fontWeight: 400,
              display: 'inline-block',
              transform: 'scaleY(0.84) scaleX(1.08)',
              transformOrigin: 'left bottom',
            }}>{f.riskScore ?? '—'}</span>
            <span className="micro" style={{ marginTop: 6, whiteSpace: 'nowrap' }}>/100 · 안전 점수</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, paddingBottom: 6 }}>
            {/* Sparkline: 24h data not available from LATEST endpoint */}
            <Sparkline data={[]} color={color} width={120} height={32} strokeWidth={1.4} />
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: '.06em', textAlign: 'right' }}>
              지난 24h
            </span>
          </div>
        </div>

        {/* Meta strip */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, flexWrap: 'wrap',
          paddingTop: 6, borderTop: '1px solid var(--line-2)',
        }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {f.nodeReady != null && f.nodeTotal != null
              ? <>node <span style={{ color: 'var(--ink)' }} className="tnum">{f.nodeReady}/{f.nodeTotal}</span> Ready</>
              : '노드 미수신'}
          </span>
          <PipelineBadge status={f.pipeline} />
        </div>
      </div>

      {/* Top causes */}
      <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 2 }}>top_causes</div>
        {causes.length === 0
          ? <div className="micro">미계산</div>
          : causes.slice(0, 3).map((c, i) => {
              const name = typeof c === 'string' ? c : c.name
              const contribution = typeof c === 'string' ? null : c.contribution
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: 'var(--ink-2)',
                }}>
                  {contribution != null && (
                    <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--crit)', width: 30, textAlign: 'right', flexShrink: 0 }}>
                      −{contribution}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </span>
                </div>
              )
            })}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 'auto', padding: '10px 18px', borderTop: '1px solid var(--line-2)',
        background: 'var(--surface-2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11.5,
      }}>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          updated <span style={{ color: 'var(--ink-2)' }}>{relTime(f.updated_at)}</span>
        </span>
        <StaleBadge
          lastFactoryStateAt={f.last_factory_state_at}
          lastInfraStateAt={f.last_infra_state_at}
        />
      </div>
    </div>
  )
}

// ─── Recent row (risk_level transition) ──────────────────────────────────
function RecentRow({ e }: { e: RecentChange }) {
  const toColor = riskColor(e.to)
  const fromColor = riskColor(e.from)
  const levelKr = (l: string) =>
    l === 'safe' ? '안전' : l === 'warning' ? '주의' : l === 'danger' ? '위험' : l
  const rel = relTime(new Date(e.ts).toISOString())

  return (
    <div className="list-row" style={{ padding: '12px 16px', alignItems: 'center' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: toColor }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 500 }}>
            {e.factory_id}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: fromColor }}>{levelKr(e.from)}</span>
            <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>→</span>
            <span style={{ color: toColor, fontWeight: 500 }}>{levelKr(e.to)}</span>
          </span>
        </div>
        {e.score != null && (
          <div className="micro" style={{ marginTop: 2 }}>
            risk_score <span className="mono tnum" style={{ color: 'var(--ink-2)' }}>{e.score}</span>
          </div>
        )}
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{rel}</span>
    </div>
  )
}

// ─── Recent changes section ────────────────────────────────────────────
function RecentSection({
  events, loading,
}: { events: RecentChange[]; loading: boolean }) {
  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h2 className="h2" style={{ whiteSpace: 'nowrap' }}>최근 상태 변화</h2>
          <span className="micro" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            HISTORY#STATE · risk_level 변화 {events.length}건
          </span>
        </div>
      </div>
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : events.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }}>
          최근 24시간 내 변화가 없습니다.
        </div>
      ) : (
        <div>
          {events.map((e, i) => <RecentRow key={i} e={e} />)}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────
export function FleetPage() {
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useFactories()

  const factories = (data?.factories ?? []).map(normalizeFactory)
  const sorted = [...factories].sort((a, b) => (a.riskScore ?? 50) - (b.riskScore ?? 50))

  const sidebarFactories = sorted.map((f) => ({
    factory_id: f.factory_id,
    risk_level: f.riskLevel,
    risk_score: f.riskScore,
  }))

  const factoryIds = sorted.map((f) => f.factory_id)
  const { events: recentChanges, loading: recentLoading } = useFleetRecentChanges(factoryIds)

  if (error instanceof AuthError) {
    return (
      <div className="login-wrap">
        <div className="card" style={{ padding: 32, maxWidth: 400, textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: 'var(--warn)', marginBottom: 12 }} />
          <div style={{ fontWeight: 600, marginBottom: 8 }}>인증이 필요합니다</div>
          <p className="sub" style={{ marginBottom: 16 }}>{error.message}</p>
          <button className="btn primary" onClick={() => navigate('/login')}>로그인</button>
        </div>
      </div>
    )
  }

  return (
    <Shell
      factories={sidebarFactories}
      crumbs={[{ label: 'Aegis-π' }, { label: 'Fleet Overview' }]}
      onRefresh={refresh}
    >
      {/* Page header */}
      <div className="page-header">
        <div className="eyebrow page-eyebrow">Risk Twin · Fleet</div>
        <h1 className="page-title">전체 개요</h1>
        <p className="page-desc">
          공장별 LATEST 상태 — risk · pipeline · infra 요약.{' '}
          <span className="mono">factory_state</span> 3초,{' '}
          <span className="mono">infra_state</span> 20초 주기로 갱신.
        </p>
      </div>

      {loading && (
        <div className="empty-state" style={{ paddingTop: 80 }}>
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

      {!loading && !error && (
        <>
          {sorted.length > 0 && <FleetPulse factories={sorted} />}

          {/* Factory cards */}
          <div style={{ marginBottom: 18 }}>
            <div className="section-header">
              <h2 className="h2">Factories</h2>
              <span className="micro">안전 점수 오름차순 · 위험한 것 먼저</span>
            </div>
            {sorted.length === 0 ? (
              <div className="empty-state">
                <span className="micro">등록된 공장이 없습니다</span>
              </div>
            ) : (
              <div className="grid-3">
                {sorted.map((f) => (
                  <FactoryCard
                    key={f.factory_id}
                    f={f}
                    onClick={() => navigate(`/factory/${f.factory_id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Recent risk_level changes */}
          <RecentSection events={recentChanges} loading={recentLoading} />
        </>
      )}
    </Shell>
  )
}
