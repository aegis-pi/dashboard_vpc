// ─── Shared utilities, layout & chart components ────────────────────────
const { useState, useEffect, useCallback, useContext, createContext, useRef } = React

const SERIF = '"Instrument Serif", ui-serif, Georgia, serif'

// ─── Inline icon set (lucide paths, MIT) — avoids React/auto-replace clash ──
const ICON_PATHS = {
  'layout-grid': <><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>,
  'file-text': <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>,
  'log-out': <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></>,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'refresh-cw': <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  'calendar': <><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>,
  'download': <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></>,
  'plus': <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  'shield-check': <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>,
  'alert-triangle': <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
}
function Icon({ name, size = 16, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flexShrink: 0, ...style }}>
      {ICON_PATHS[name] ?? null}
    </svg>
  )
}

// ─── format helpers (utils/format.ts) ───────────────────────────────────
function relTime(ts) {
  if (!ts) return '미수신'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 5) return '방금'
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return `${Math.floor(diff / 3600)}시간 전`
}
function riskColor(level) {
  if (level === 'danger') return 'var(--crit)'
  if (level === 'warning') return 'var(--warn)'
  if (level === 'safe') return 'var(--safe)'
  return 'var(--ink-4)'
}

// ─── Tiny hash router ────────────────────────────────────────────────────
const RouterContext = createContext(null)
function useRouter() { return useContext(RouterContext) }

function RouterProvider({ children }) {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || '/')
  useEffect(() => {
    const onHash = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = useCallback((to) => { window.location.hash = to }, [])
  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>
}

// ─── Badges (components/Badge.tsx) ───────────────────────────────────────
const LEVEL_META = {
  safe: { label: '안전', tone: 'safe' },
  warning: { label: '주의', tone: 'warn' },
  danger: { label: '위험', tone: 'crit' },
}
function LevelBadge({ level, size = 'md' }) {
  const meta = LEVEL_META[level ?? ''] ?? { label: '미계산', tone: 'unk' }
  const padStyle = size === 'sm' ? '3px 6px' : size === 'lg' ? '5px 12px' : '4px 8px'
  const fontSize = size === 'sm' ? 10.5 : size === 'lg' ? 13 : 11.5
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: padStyle, fontSize }}>
      <span className="dot" />{meta.label}
    </span>
  )
}
const PIPELINE_META = {
  normal: { label: '정상', tone: 'safe' },
  warning: { label: '주의', tone: 'warn' },
  critical: { label: '위험', tone: 'crit' },
}
function PipelineBadge({ status }) {
  const meta = PIPELINE_META[status ?? ''] ?? { label: '미수신', tone: 'unk' }
  return (
    <span className={`pill ${meta.tone}`} style={{ padding: '3px 6px', fontSize: 10.5 }}>
      <span className="dot" />pipeline · {meta.label}
    </span>
  )
}
function ageSeconds(ts) {
  if (!ts) return 9999
  return Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
}
function StaleBadge({ lastFactoryStateAt, lastInfraStateAt }) {
  const fAge = ageSeconds(lastFactoryStateAt)
  const iAge = ageSeconds(lastInfraStateAt)
  if (fAge <= 10 && iAge <= 40) return null
  const isCrit = iAge > 60
  return (
    <span className={`pill ${isCrit ? 'crit' : 'warn'}`} style={{ padding: '3px 6px', fontSize: 10 }}>
      <span className="dot" />데이터 지연
      <span className="mono tnum" style={{ marginLeft: 4, fontSize: 10 }}>infra {iAge}s</span>
    </span>
  )
}

// ─── Sparkline (components/Sparkline.tsx) ────────────────────────────────
function Sparkline({ data, width = 80, height = 28, color = 'var(--accent)', strokeWidth = 1.5 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })
  const last = pts[pts.length - 1].split(',')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={parseFloat(last[0])} cy={parseFloat(last[1])} r={2.5} fill={color} />
    </svg>
  )
}

// ─── ConnStatus (components/ConnStatus.tsx) ──────────────────────────────
const CONN_META = { connecting: '연결 중', connected: '실시간 연결', reconnecting: '재연결 중', offline: '오프라인' }
function ConnStatus({ status }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className={`conn-dot ${status}`} />
      <span className="mono micro">{CONN_META[status]}</span>
    </div>
  )
}

// ─── Lightweight SVG line chart (stands in for recharts) ─────────────────
// Renders an axis grid, optional reference lines, and one or more series.
function LineChartSVG({ series, yMin = 0, yMax = 100, refLines = [], height = 200, yFmt = (v) => v, legend = false }) {
  const VW = 600, pL = 38, pR = 14, pT = 12, pB = 26
  const VH = height
  const cW = VW - pL - pR, cH = VH - pT - pB
  const n = Math.max(...series.map((s) => s.data.length), 0)
  const xOf = (i) => pL + (n < 2 ? 0 : (i / (n - 1)) * cW)
  const yOf = (v) => pT + cH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * cH
  const ticks = [yMin, (yMin + yMax) / 2, yMax]
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        {/* grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pL} x2={pL + cW} y1={yOf(t)} y2={yOf(t)} stroke="var(--line-2)" strokeWidth={0.7} strokeDasharray="3,3" />
            <text x={pL - 5} y={yOf(t) + 3} textAnchor="end" fontSize={9} fill="var(--ink-4)" fontFamily="monospace">{yFmt(t)}</text>
          </g>
        ))}
        {/* reference lines */}
        {refLines.map((r, i) => (
          <line key={i} x1={pL} x2={pL + cW} y1={yOf(r.y)} y2={yOf(r.y)} stroke={r.color} strokeWidth={1} strokeDasharray="4,2" />
        ))}
        {/* axes */}
        <line x1={pL} y1={pT + cH} x2={pL + cW} y2={pT + cH} stroke="var(--line-3)" strokeWidth={0.8} />
        {/* series */}
        {series.map((s, si) => {
          const valid = s.data.map((v, i) => v == null ? null : `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).filter(Boolean).join(' ')
          return (
            <g key={si}>
              {s.fill && <polygon points={`${pL},${pT + cH} ${valid} ${pL + cW},${pT + cH}`} fill={s.color} fillOpacity={0.1} />}
              <polyline points={valid} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.6} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
      </svg>
      {legend && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          {series.map((s, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)' }}>
              <span style={{ width: 14, height: 2.5, background: s.color, borderRadius: 2 }} />{s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function RiskScoreChart({ items }) {
  const data = items.map((h) => h.risk_score).filter((v) => v != null)
  if (!data.length) return <EmptyChart message="선택한 시간 범위에 Risk 데이터가 없습니다" />
  return <LineChartSVG height={200} series={[{ name: 'Risk Score', data, color: 'var(--accent)', fill: true, width: 1.8 }]}
    refLines={[{ y: 85, color: 'var(--safe)' }, { y: 50, color: 'var(--warn)' }]} />
}
function AIScoreChart({ items }) {
  const fire = items.map((h) => h.fire_score ?? null)
  const fall = items.map((h) => h.fall_score ?? null)
  const bend = items.map((h) => h.bend_score ?? null)
  if (!fire.some((v) => v != null)) return <EmptyChart message="AI Score 데이터 없음" />
  return <LineChartSVG height={200} yMin={0} yMax={1} yFmt={(v) => v.toFixed(1)} legend
    series={[
      { name: '화재', data: fire, color: 'var(--crit)' },
      { name: '넘어짐', data: fall, color: 'var(--warn)' },
      { name: '굽힘', data: bend, color: 'var(--accent)' },
    ]}
    refLines={[{ y: 0.8, color: 'var(--crit)' }, { y: 0.3, color: 'var(--warn)' }]} />
}
function NodeResourceChart({ items, field }) {
  const nodeIds = new Set()
  items.forEach((it) => (it.nodes ?? []).forEach((n) => nodeIds.add(n.node_id)))
  const ids = [...nodeIds]
  const colors = ['var(--accent)', 'var(--warn)', 'var(--safe)', 'var(--crit)']
  if (!ids.length) return <EmptyChart message="데이터 없음" />
  const series = ids.map((nid, i) => ({
    name: nid, color: colors[i % colors.length],
    data: items.map((it) => { const node = (it.nodes ?? []).find((n) => n.node_id === nid); return node ? node[field] : null }),
  }))
  return <LineChartSVG height={170} yFmt={(v) => `${v}%`} legend series={series} />
}
function EmptyChart({ message }) {
  return (
    <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line-2)' }}>
      <span className="micro">{message}</span>
    </div>
  )
}

// ─── Sidebar (components/Layout.tsx) ─────────────────────────────────────
function Sidebar({ factories = [] }) {
  const { path, navigate } = useRouter()
  const isFleet = path === '/'
  const isReports = path === '/reports'
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark"><span className="serif" style={{ fontSize: 18, lineHeight: 1 }}>π</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <div className="sidebar-title">Aegis<span style={{ color: 'var(--chrome-ink-3)' }}>·</span><span style={{ fontFamily: SERIF, fontSize: 17 }}>π</span></div>
          <div className="sidebar-subtitle">Risk Twin</div>
        </div>
      </div>
      <div className="sidebar-nav">
        <div className="sidebar-nav-label">Fleet</div>
        <button className={`nav-item ${isFleet ? 'active' : ''}`} onClick={() => navigate('/')}>
          <Icon name="layout-grid" size={15} className="nav-icon" />
          <span style={{ flex: 1 }}>전체 개요</span>
          {factories.length > 0 && <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--chrome-ink-3)' }}>{factories.length}</span>}
        </button>
        {factories.length > 0 && (
          <>
            <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Factories</div>
            {factories.map((f) => {
              const isActive = path === `/factory/${f.factory_id}`
              const dotColor = f.risk_level === 'danger' ? 'var(--crit)' : f.risk_level === 'warning' ? 'var(--warn)' : f.risk_level === 'safe' ? 'var(--safe)' : 'var(--chrome-ink-3)'
              return (
                <button key={f.factory_id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => navigate(`/factory/${f.factory_id}`)}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{f.factory_id}</span>
                  {f.risk_score != null && <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--chrome-ink-3)' }}>{f.risk_score}</span>}
                </button>
              )
            })}
          </>
        )}
        <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Workspace</div>
        <button className={`nav-item ${isReports ? 'active' : ''}`} onClick={() => navigate('/reports')}>
          <Icon name="file-text" size={15} className="nav-icon" />
          <span style={{ flex: 1 }}>일간 보고서</span>
        </button>
      </div>
      <div className="sidebar-footer">
        <button className="nav-item" style={{ width: '100%' }} onClick={() => navigate('/login')}>
          <Icon name="log-out" size={14} />로그아웃
        </button>
      </div>
    </nav>
  )
}

const REFRESH_INTERVAL_OPTIONS = [
  { label: 'Refresh: Off', value: 0 }, { label: '5s', value: 5000 }, { label: '10s', value: 10000 },
  { label: '30s', value: 30000 }, { label: '1m', value: 60000 },
]

function TopBar({ crumbs, onBack, wsStatus, onRefresh, refreshInterval = 0, onIntervalChange }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return (
    <div className="topbar">
      {onBack && <button className="btn ghost" onClick={onBack} style={{ padding: '4px 6px' }}><Icon name="chevron-left" size={16} /></button>}
      <div className="topbar-breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span className="sep">/</span>}
            <span className={`crumb ${i === crumbs.length - 1 ? 'current' : ''} ${c.href ? 'clickable' : ''}`}>{c.label}</span>
          </span>
        ))}
      </div>
      <div className="topbar-actions">
        {wsStatus && <ConnStatus status={wsStatus} />}
        {onRefresh && onIntervalChange && (
          <select className="refresh-select" value={refreshInterval} onChange={(e) => onIntervalChange(Number(e.target.value))} title="자동 새로고침 간격">
            {REFRESH_INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {onRefresh && <button className="btn ghost" onClick={onRefresh} title="수동 새로고침" style={{ padding: '4px 8px' }}><Icon name="refresh-cw" size={13} /></button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', flexShrink: 0, borderLeft: '1px solid var(--line)', marginLeft: 4, paddingLeft: 12 }}>
          <span className="mono tnum">{hh}:{mm}:{ss}</span>
        </div>
      </div>
    </div>
  )
}

function Shell({ children, factories, crumbs, onBack, wsStatus, onRefresh, refreshInterval, onIntervalChange }) {
  return (
    <div className="shell">
      <Sidebar factories={factories} />
      <div className="main">
        <TopBar crumbs={crumbs} onBack={onBack} wsStatus={wsStatus} onRefresh={onRefresh} refreshInterval={refreshInterval} onIntervalChange={onIntervalChange} />
        <div className="content">{children}</div>
      </div>
    </div>
  )
}

Object.assign(window, {
  SERIF, relTime, riskColor, RouterProvider, useRouter, Icon,
  LevelBadge, PipelineBadge, StaleBadge, Sparkline, ConnStatus,
  LineChartSVG, RiskScoreChart, AIScoreChart, NodeResourceChart, EmptyChart,
  Sidebar, TopBar, Shell, REFRESH_INTERVAL_OPTIONS,
})
