// ─── Fleet overview page (pages/FleetPage.tsx) ──────────────────────────
const BANDS = [
  { from: 0, to: 50, color: 'var(--crit)', label: '위험' },
  { from: 50, to: 85, color: 'var(--warn)', label: '주의' },
  { from: 85, to: 100, color: 'var(--safe)', label: '안전' },
]

function computeLabelPositions(dots, minGap = 11) {
  if (!dots.length) return []
  const labels = [...dots]
  const clusters = []
  let cur = [0]
  for (let i = 1; i < dots.length; i++) {
    if ((dots[i] - dots[i - 1]) < minGap) cur.push(i)
    else { clusters.push(cur); cur = [i] }
  }
  clusters.push(cur)
  for (const c of clusters) {
    if (c.length === 1) continue
    const first = dots[c[0]], last = dots[c[c.length - 1]]
    const center = (first + last) / 2
    const total = minGap * (c.length - 1)
    let startX = center - total / 2
    if (startX < 6) startX = 6
    if (startX + total > 94) startX = 94 - total
    c.forEach((idx, j) => { labels[idx] = startX + j * minGap })
  }
  for (let i = 1; i < labels.length; i++) if ((labels[i] - labels[i - 1]) < minGap) labels[i] = labels[i - 1] + minGap
  for (let i = labels.length - 1; i >= 0; i--) {
    if (labels[i] > 94) labels[i] = 94
    if (i < labels.length - 1 && (labels[i + 1] - labels[i]) < minGap) labels[i] = labels[i + 1] - minGap
  }
  if ((labels[0] ?? 0) < 6) { const shift = 6 - labels[0]; labels.forEach((_, i) => { labels[i] = labels[i] + shift }) }
  return labels
}

function PulseStat({ label, value, dotColor, active = true }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px' }}>
      {dotColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, opacity: active ? 1 : 0.4, flexShrink: 0 }} />}
      <span className="tnum" style={{ fontSize: 12, fontWeight: 500, lineHeight: 1, color: active && dotColor ? dotColor : 'var(--ink)', letterSpacing: '-0.005em' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 400, lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}
function StatDivider() { return <span style={{ display: 'inline-block', width: 1, height: 14, background: 'var(--line)', margin: '0 1px' }} /> }

function FleetPulse({ factories }) {
  const danger = factories.filter((f) => f.level === 'danger').length
  const warning = factories.filter((f) => f.level === 'warning').length
  const safe = factories.filter((f) => f.level === 'safe').length
  const total = factories.length
  const byScore = [...factories].sort((a, b) => (a.score ?? 50) - (b.score ?? 50))
  const dotXs = byScore.map((f) => Math.max(2, Math.min(98, f.score ?? 50)))
  const dotStack = dotXs.map((x, i) => { let s = 0; for (let j = 0; j < i; j++) if (Math.abs(x - dotXs[j]) < 0.4) s++; return s })
  const labelXs = computeLabelPositions(dotXs, 11)
  const maxStack = Math.max(0, ...dotStack)
  const areaH = 78 + maxStack * 18
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ padding: '20px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8, fontSize: 11.5 }}>Fleet Safety Pulse</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>오른쪽에 가까울수록 안전. 점은 각 공장의 현재 안전 점수.</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 4px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
          <PulseStat label="공장" value={total} /><StatDivider />
          <PulseStat label="위험" value={danger} dotColor="var(--crit)" active={danger > 0} /><StatDivider />
          <PulseStat label="주의" value={warning} dotColor="var(--warn)" active={warning > 0} /><StatDivider />
          <PulseStat label="안전" value={safe} dotColor="var(--safe)" active={safe > 0} />
        </div>
      </div>
      <div style={{ padding: '6px 24px 22px' }}>
        <div style={{ position: 'relative', padding: '6px 4px 0', width: '100%' }}>
          <div style={{ position: 'relative', height: 'clamp(44px, 4vw, 56px)', borderRadius: 10, border: '1px solid var(--line-2)', overflow: 'hidden', background: 'var(--surface-2)' }}>
            {BANDS.map((b) => <div key={b.label} style={{ position: 'absolute', left: `${b.from}%`, width: `${b.to - b.from}%`, top: 0, bottom: 0, background: `color-mix(in srgb, ${b.color} 7%, transparent)` }} />)}
            {BANDS.map((b) => (
              <div key={`lbl-${b.label}`} style={{ position: 'absolute', left: `${b.from}%`, width: `${b.to - b.from}%`, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span className="mono" style={{ fontSize: 12.5, letterSpacing: '.14em', textTransform: 'uppercase', color: b.color, fontWeight: 700, opacity: 0.95 }}>{b.label}</span>
              </div>
            ))}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--line-3)' }} />
            <div style={{ position: 'absolute', left: '85%', top: 0, bottom: 0, width: 1, background: 'var(--line-3)' }} />
          </div>
          <div style={{ position: 'relative', height: areaH, marginTop: 6 }}>
            <svg width="100%" height={areaH} viewBox={`0 0 100 ${areaH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {byScore.map((f, i) => {
                const x1 = dotXs[i], x2 = labelXs[i], y1 = 4 + (dotStack[i] ?? 0) * 18, y2 = areaH - 30
                const same = Math.abs(x1 - x2) < 0.2
                const d = same ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
                return <path key={f.factory_id} d={d} fill="none" stroke="var(--line-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              })}
            </svg>
            {byScore.map((f, i) => {
              const color = riskColor(f.level)
              return (
                <div key={`dot-${f.factory_id}`} style={{ position: 'absolute', left: `${dotXs[i]}%`, top: -7 + (dotStack[i] ?? 0) * 18, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: color, boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent), 0 0 0 1px var(--surface)` }} />
                </div>
              )
            })}
            {byScore.map((f, i) => {
              const color = riskColor(f.level)
              return (
                <div key={`lbl-${f.factory_id}`} style={{ position: 'absolute', left: `${labelXs[i]}%`, bottom: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span className="tnum" style={{ fontFamily: SERIF, fontSize: 38, lineHeight: 0.85, color, letterSpacing: '-0.01em', display: 'inline-block', transform: 'scaleY(0.84) scaleX(1.06)', transformOrigin: 'center bottom' }}>{f.score ?? '—'}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', letterSpacing: '.03em', marginTop: 4, fontWeight: 500, whiteSpace: 'nowrap' }}>{f.factory_id}</span>
                </div>
              )
            })}
          </div>
          <div style={{ position: 'relative', height: 14, marginTop: 8, fontSize: 10, color: 'var(--ink-4)', borderTop: '1px dashed var(--line-2)', paddingTop: 4 }}>
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

// ─── Compact 10m trend for factory card ──────────────────────────────────
function CompactTrendChart({ data, color }) {
  const VW = 260, VH = 86, pL = 26, pR = 12, pT = 12, pB = 20
  const cW = VW - pL - pR, cH = VH - pT - pB
  const hasData = data.length >= 2
  const xOf = (i) => pL + (data.length < 2 ? 0 : (i / (data.length - 1)) * cW)
  const yOf = (v) => pT + cH - (Math.max(0, Math.min(100, v)) / 100) * cH
  const pts = data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const areaD = hasData ? `M ${xOf(0).toFixed(1)},${pT + cH} L ${data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' L ')} L ${xOf(data.length - 1).toFixed(1)},${pT + cH} Z` : ''
  const lastV = hasData ? data[data.length - 1] : null
  const lastX = hasData ? xOf(data.length - 1) : 0
  const lastY = lastV != null ? yOf(lastV) : 0
  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[50, 85].map((v) => (
        <line key={v} x1={pL} x2={pL + cW} y1={yOf(v)} y2={yOf(v)} stroke="var(--line-2)" strokeWidth={0.8} strokeDasharray="3,3" />
      ))}
      <line x1={pL} x2={pL} y1={pT} y2={pT + cH} stroke="var(--line-2)" strokeWidth={0.8} />
      <line x1={pL} x2={pL + cW} y1={pT + cH} y2={pT + cH} stroke="var(--line-2)" strokeWidth={0.8} />
      {[0, 50, 100].map((v) => <text key={v} x={pL - 4} y={yOf(v) + 2.5} textAnchor="end" fontSize={7} fill="var(--ink-4)" fontFamily="monospace">{v}</text>)}
      <text x={7} y={pT + cH / 2} textAnchor="middle" fontSize={7.5} fill="var(--ink-4)" transform={`rotate(-90, 7, ${pT + cH / 2})`}>안전 점수</text>
      {hasData && <path d={areaD} fill={color} opacity={0.1} />}
      {hasData && <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
      {hasData && lastV != null && (
        <>
          <circle cx={lastX} cy={lastY} r={3} fill={color} />
          <text x={Math.min(lastX, VW - 17)} y={Math.max(8, lastY - 6)} textAnchor="middle" fontSize={8} fill={color} fontFamily="monospace" fontWeight="600">{lastV}</text>
        </>
      )}
      <text x={pL} y={pT + cH + 12} textAnchor="middle" fontSize={7.5} fill="var(--ink-5)">10m 전</text>
      <text x={pL + cW} y={pT + cH + 12} textAnchor="middle" fontSize={7.5} fill="var(--ink-5)">현재</text>
      <text x={pL + cW / 2} y={VH - 3} textAnchor="middle" fontSize={8} fill="var(--ink-4)">시간</text>
      {!hasData && <text x={VW / 2} y={pT + cH / 2 + 3} textAnchor="middle" fontSize={9} fill="var(--ink-5)">데이터 없음</text>}
    </svg>
  )
}

// ─── Factory card (the main focus) ───────────────────────────────────────
function FactoryCard({ f, onClick }) {
  const color = riskColor(f.level)
  const causes = Array.isArray(f.top_causes) ? f.top_causes : []
  const sparkData = (window.MOCK.HISTORY[f.factory_id]?.['10m'] ?? []).map((h) => h.risk_score).filter((v) => v != null)
  const score = f.score ?? null
  const markerLeft = score == null ? 0 : Math.max(0, Math.min(100, score))
  return (
    <div className="card factory-card" onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ink-5)'; e.currentTarget.style.boxShadow = 'var(--shadow-lift)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)' }}>
      <div className="factory-card-accent" style={{ background: color }} />
      <div className="factory-card-main">
        <div className="factory-card-top">
          <div className="factory-card-title">
            {f.environment_type && <span className="mono factory-card-env">{f.environment_type}</span>}
            <span className="factory-card-id">{f.factory_id}</span>
          </div>
          <LevelBadge level={f.level} />
        </div>
        <div className="factory-card-score-row">
          <div className="factory-score-block">
            <span className="tnum factory-score" style={{ color }}>{score ?? '—'}</span>
            <span className="factory-score-label">/100 안전 점수</span>
          </div>
          <div className="factory-meta-stack">
            <div className="factory-meta-line">
              <span>node</span>
              <strong className="tnum">{f.nodeReady != null && f.nodeTotal != null ? `${f.nodeReady}/${f.nodeTotal}` : '미수신'}</strong>
            </div>
            <PipelineBadge status={f.pipeline} />
          </div>
        </div>
        <div className="factory-score-meter" aria-hidden="true">
          <span className="factory-score-meter-band danger" />
          <span className="factory-score-meter-band warning" />
          <span className="factory-score-meter-band safe" />
          {score != null && <span className="factory-score-marker" style={{ left: `${markerLeft}%`, background: color }} />}
        </div>
        <div className="factory-card-trend">
          <div className="factory-trend-head">
            <span className="eyebrow">10m trend</span>
            <span className="mono">{sparkData.length}pt</span>
          </div>
          <CompactTrendChart data={sparkData} color={color} />
        </div>
        <div className="factory-causes">
          <div className="factory-causes-head"><span className="eyebrow">top_causes</span></div>
          {causes.length === 0 ? <div className="micro">미계산</div> : causes.slice(0, 3).map((c, i) => {
            const name = typeof c === 'string' ? c : (c.name ?? c.field ?? '?')
            const contribution = typeof c === 'string' ? null : c.contribution
            return (
              <div key={i} className="factory-cause-row">
                <span className="factory-cause-name">{name}</span>
                {contribution != null && <span className="mono tnum factory-cause-value">-{contribution}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="factory-card-footer">
        <span className="mono">updated <strong>{relTime(f.updated_at)}</strong></span>
        <StaleBadge lastFactoryStateAt={f.last_factory_state_at} lastInfraStateAt={f.last_infra_state_at} />
      </div>
    </div>
  )
}

// ─── Recent changes ──────────────────────────────────────────────────────
const LEVEL_RANK = { safe: 0, warning: 1, danger: 2 }
function levelKr(l) { return l === 'safe' ? '안전' : l === 'warning' ? '주의' : l === 'danger' ? '위험' : l }

function RecentRow({ e }) {
  const toColor = riskColor(e.to), fromColor = riskColor(e.from)
  const rel = relTime(new Date(e.ts).toISOString())
  const isWorsening = (LEVEL_RANK[e.to] ?? 0) > (LEVEL_RANK[e.from] ?? 0)
  const causes = isWorsening && e.top_cause_names?.length ? e.top_cause_names : []
  return (
    <div className="list-row" style={{ padding: '12px 16px', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: toColor, marginTop: 4 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 500 }}>{e.factory_id}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: fromColor }}>{levelKr(e.from)}</span>
            <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>→</span>
            <span style={{ color: toColor, fontWeight: 500 }}>{levelKr(e.to)}</span>
          </span>
          {e.score != null && <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)' }}>score <span style={{ color: 'var(--ink-2)' }}>{e.score}</span></span>}
        </div>
        {causes.length > 0 && (
          <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: '3px 6px' }}>
            {causes.slice(0, 4).map((c, i) => <span key={i} style={{ fontSize: 10.5, color: 'var(--ink-3)', background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>{c}</span>)}
          </div>
        )}
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>{rel}</span>
    </div>
  )
}

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ height: 24, padding: '0 9px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 11.5, fontFamily: 'monospace', transition: 'background .1s, color .1s, border-color .1s', background: active ? 'var(--ink)' : 'var(--surface)', color: active ? 'var(--surface)' : 'var(--ink-2)', borderColor: active ? 'var(--ink)' : 'var(--line-2)', whiteSpace: 'nowrap' }}>{label}</button>
  )
}

function RecentSection({ events, factoryIds }) {
  const [selectedFactory, setSelectedFactory] = useState(null)
  const cutoff = Date.now() - 10 * 60 * 1000
  const worsening = events.filter((e) => (LEVEL_RANK[e.to] ?? 0) > (LEVEL_RANK[e.from] ?? 0) && e.ts >= cutoff)
  const filtered = selectedFactory ? worsening.filter((e) => e.factory_id === selectedFactory) : worsening
  return (
    <div className="card">
      <div className="card-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <h2 className="h2" style={{ whiteSpace: 'nowrap' }}>최근 상태 변화</h2>
          <span className="micro" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>최근 10분 악화 전환 · {filtered.length}건</span>
        </div>
        {factoryIds.length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
            <FilterPill label="전체" active={selectedFactory === null} onClick={() => setSelectedFactory(null)} />
            {factoryIds.map((id) => <FilterPill key={id} label={id} active={selectedFactory === id} onClick={() => setSelectedFactory((p) => p === id ? null : id)} />)}
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }}>
          {selectedFactory ? `${selectedFactory} — 지난 10분 내 악화 전환이 없습니다.` : '지난 10분 내 악화 전환이 없습니다.'}
        </div>
      ) : <div>{filtered.map((e, i) => <RecentRow key={i} e={e} />)}</div>}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────
function FleetPage() {
  const { navigate } = useRouter()
  const [refreshInterval, setRefreshInterval] = useState(0)
  const factories = window.MOCK.FACTORIES
  const sorted = [...factories].sort((a, b) => a.factory_id.localeCompare(b.factory_id))
  const sidebarFactories = sorted.map((f) => ({ factory_id: f.factory_id, risk_level: f.level, risk_score: f.score }))
  const factoryIds = sorted.map((f) => f.factory_id)
  return (
    <Shell factories={sidebarFactories} crumbs={[{ label: 'Aegis-π' }, { label: 'Fleet Overview' }]}
      onRefresh={() => {}} refreshInterval={refreshInterval} onIntervalChange={setRefreshInterval}>
      <div className="page-header">
        <div className="eyebrow page-eyebrow">Risk Twin · Fleet</div>
        <h1 className="page-title">전체 개요</h1>
        <p className="page-desc">공장별 LATEST 상태 — risk · pipeline · infra 요약. <span className="mono">factory_state</span> 3초, <span className="mono">infra_state</span> 20초 주기로 갱신.</p>
      </div>
      <FleetPulse factories={sorted} />
      <div style={{ marginBottom: 18 }}>
        <div className="section-header">
          <h2 className="h2">Factories</h2>
          <span className="micro">factory_id 알파벳순</span>
        </div>
        <div className="factory-card-grid">
          {sorted.map((f) => <FactoryCard key={f.factory_id} f={f} onClick={() => navigate(`/factory/${f.factory_id}`)} />)}
        </div>
      </div>
      <RecentSection events={window.MOCK.RECENT_CHANGES} factoryIds={factoryIds} />
    </Shell>
  )
}

Object.assign(window, { FleetPage, FactoryCard, FleetPulse, CompactTrendChart })
