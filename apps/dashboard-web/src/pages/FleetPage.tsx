import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { Shell } from '../components/Layout'
import { LevelBadge, PipelineBadge, StaleBadge } from '../components/Badge'
import { relTime, riskColor } from '../utils/format'
import { Sparkline } from '../components/Sparkline'
import { useFactories } from '../hooks/useFactories'
import { AuthError } from '../api/client'
import type { FactorySummary } from '../api/types'

// ─── Normalize factory to consistent shape ────────────────────────────
function normalizeFactory(f: FactorySummary) {
  const riskLevel = f.risk_level ?? f.risk?.level
  const riskScore = f.risk_score ?? f.risk?.score
  const topCauses = f.top_causes ?? f.risk?.top_causes ?? []
  const nodeReady = f.node_ready ?? f.infra_state?.node_summary?.ready
  const nodeTotal = f.node_total ?? f.infra_state?.node_summary?.total
  const pipeline = f.pipeline_status ?? 'normal'

  return { ...f, riskLevel, riskScore, topCauses, nodeReady, nodeTotal, pipeline }
}

// ─── Fleet summary strip ──────────────────────────────────────────────
function SummaryStrip({ factories }: { factories: ReturnType<typeof normalizeFactory>[] }) {
  const danger  = factories.filter((f) => f.riskLevel === 'danger').length
  const warning = factories.filter((f) => f.riskLevel === 'warning').length
  const safe    = factories.filter((f) => f.riskLevel === 'safe').length

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <div className="eyebrow">Fleet Safety Pulse</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Stat label="전체" value={factories.length} />
          <Stat label="위험" value={danger} color="var(--crit)" />
          <Stat label="주의" value={warning} color="var(--warn)" />
          <Stat label="안전" value={safe} color="var(--safe)" />
        </div>
      </div>

      {/* Pulse track */}
      <div style={{ padding: '4px 20px 18px' }}>
        <div className="pulse-track">
          {/* Bands */}
          <div style={{ position: 'absolute', left: 0, width: '50%', top: 0, bottom: 0,
            background: 'color-mix(in srgb, var(--crit) 6%, transparent)' }} />
          <div style={{ position: 'absolute', left: '50%', width: '35%', top: 0, bottom: 0,
            background: 'color-mix(in srgb, var(--warn) 6%, transparent)' }} />
          <div style={{ position: 'absolute', left: '85%', width: '15%', top: 0, bottom: 0,
            background: 'color-mix(in srgb, var(--safe) 6%, transparent)' }} />
          {/* Factory dots */}
          {factories.map((f) => {
            const x = Math.max(1, Math.min(99, f.riskScore ?? 50))
            const color = riskColor(f.riskLevel)
            return (
              <div key={f.factory_id} style={{
                position: 'absolute', left: `${x}%`, top: '50%',
                transform: 'translate(-50%, -50%)',
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', background: color,
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)`,
                }} title={`${f.factory_id}: ${f.riskScore}`} />
              </div>
            )
          })}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 6, fontSize: 10, color: 'var(--ink-4)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span>0 위험</span>
          <span>50</span>
          <span>85</span>
          <span>100 안전</span>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--ink)' }}>{value}</span>
      <span className="micro">{label}</span>
    </div>
  )
}

// ─── Factory card ─────────────────────────────────────────────────────
function FactoryCard({ f, onClick }: { f: ReturnType<typeof normalizeFactory>; onClick: () => void }) {
  const color = riskColor(f.riskLevel)
  const causes = Array.isArray(f.topCauses)
    ? f.topCauses.slice(0, 3).map((c) => (typeof c === 'string' ? c : c.name))
    : []

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden', transition: 'border-color .12s, box-shadow .15s',
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

      <div style={{ padding: '16px 18px 10px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            {f.factory_id}
          </span>
          <LevelBadge level={f.riskLevel} />
        </div>

        {/* Score + sparkline */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'end', marginBottom: 10 }}>
          <div>
            <span className="risk-score-big" style={{ color, fontSize: 52 }}>
              {f.riskScore ?? '—'}
            </span>
            <div className="micro" style={{ marginTop: 4 }}>/100 · 안전 점수</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingBottom: 4 }}>
            <Sparkline data={[]} color={color} width={100} height={28} />
            <span className="mono micro">지난 24h</span>
          </div>
        </div>

        {/* Meta */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)',
        }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            {f.nodeReady != null && f.nodeTotal != null
              ? <>node <span style={{ color: 'var(--ink)' }} className="tnum">{f.nodeReady}/{f.nodeTotal}</span> Ready</>
              : '노드 미수신'}
          </span>
          <PipelineBadge status={f.pipeline} />
        </div>
      </div>

      {/* Top causes */}
      <div style={{ padding: '8px 18px 12px', borderTop: '1px solid var(--line-2)' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>top_causes</div>
        {causes.length === 0
          ? <span className="micro">미계산</span>
          : causes.map((name, i) => (
              <div key={i} className="micro" style={{ color: 'var(--ink-3)', marginBottom: 2 }}>
                · {name}
              </div>
            ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 'auto', padding: '8px 18px', borderTop: '1px solid var(--line-2)',
        background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', fontSize: 11.5,
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

// ─── Main page ────────────────────────────────────────────────────────
export function FleetPage() {
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useFactories()

  const factories = (data?.factories ?? []).map(normalizeFactory)
  const sorted = [...factories].sort((a, b) => (a.riskScore ?? 50) - (b.riskScore ?? 50))

  // sidebar needs factory list with risk levels
  const sidebarFactories = sorted.map((f) => ({
    factory_id: f.factory_id,
    risk_level: f.riskLevel,
  }))

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
          공장별 LATEST 상태 — risk · pipeline · infra 요약.
          <span className="mono"> factory_state</span> 3초,{' '}
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
          {sorted.length > 0 && <SummaryStrip factories={sorted} />}

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
        </>
      )}
    </Shell>
  )
}
