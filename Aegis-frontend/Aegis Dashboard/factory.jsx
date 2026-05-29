// ─── Factory detail page (pages/FactoryPage.tsx) ────────────────────────
const HISTORY_WINDOWS = ['1h', '6h', '12h', '24h']

function EmptyNote({ text = '선택한 시간 범위에 데이터가 없습니다.' }) {
  return <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }}>{text}</div>
}

function FactoryHeader({ f, sparkData }) {
  const color = riskColor(f.level)
  const tintPct = f.level === 'danger' ? 6 : f.level === 'warning' ? 5 : f.level === 'safe' ? 4 : 0
  const tintBg = tintPct > 0 ? `color-mix(in srgb, ${color} ${tintPct}%, var(--surface))` : 'var(--surface)'
  return (
    <div className="factory-hero" style={{ background: tintBg }}>
      <div className="factory-hero-accent" style={{ background: color }} />
      <div className="factory-hero-copy">
        <div className="factory-hero-badges">
          {f.environment_type && <>
            <span className="mono factory-hero-env">{f.environment_type}</span>
            <span className="factory-hero-dot">·</span>
          </>}
          <LevelBadge level={f.level} />
          <PipelineBadge status={f.pipeline} />
          <StaleBadge lastFactoryStateAt={f.last_factory_state_at} lastInfraStateAt={f.last_infra_state_at} />
        </div>
        <div>
          <h1 className="factory-hero-title">{f.factory_id}</h1>
          <p className="factory-hero-summary">{f.summary ?? '미수신'}</p>
        </div>
      </div>
      <div className="factory-hero-status">
        <div className="factory-hero-score-block">
          <span className="eyebrow">safety score</span>
          <div className="factory-hero-score-row">
            <span className="tnum factory-hero-score" style={{ color }}>{f.score ?? '—'}</span>
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
            <span className="mono">node <span className="tnum" style={{ color: 'var(--ink)' }}>{f.nodeReady}/{f.nodeTotal}</span></span>
            <span className="mono">{relTime(f.updated_at)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────
function CauseCard({ rank, name, value, contribution }) {
  return (
    <div style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color .12s' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ink-5)' }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: 'var(--ink)', color: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{rank}</span>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, lineHeight: 1.35, flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)' }}>
        {value != null && <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="eyebrow">value</span>
          <span className="mono tnum" style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: 500 }}>{typeof value === 'number' ? value.toFixed(2) : value}</span>
        </div>}
        {contribution != null && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, marginLeft: 'auto' }}>
          <span className="eyebrow">contribution</span>
          <span className="mono tnum" style={{ fontSize: 20, color: 'var(--crit)', fontWeight: 600, letterSpacing: '-0.01em' }}>−{contribution}</span>
        </div>}
      </div>
    </div>
  )
}

function MetricLine({ label, value, unit }) {
  const formatted = value == null ? null : value.toFixed(1)
  return (
    <div style={{ padding: '12px 14px', border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {formatted == null ? <span style={{ fontSize: 14, color: 'var(--ink-4)' }}>미수신</span> : <>
          <span className="tnum" style={{ fontSize: 26, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.015em', lineHeight: 1 }}>{formatted}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{unit}</span>
        </>}
      </div>
    </div>
  )
}

function ScoreLine({ label, value }) {
  const v = value == null ? null : Math.max(0, Math.min(1, value))
  const tone = v == null ? 'unk' : v >= 0.8 ? 'crit' : v >= 0.3 ? 'warn' : 'safe'
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : tone === 'safe' ? 'var(--safe)' : 'var(--ink-4)'
  return (
    <div style={{ padding: '11px 14px', border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.04em', fontWeight: 500 }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 17, color, fontWeight: 600, letterSpacing: '-0.01em' }}>{v == null ? '—' : v.toFixed(2)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--line-2)', overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${(v ?? 0) * 100}%`, background: color, borderRadius: 3, transition: 'width .4s ease' }} />
        <div style={{ position: 'absolute', left: '30%', top: -2, height: 10, width: 1, background: 'var(--line-3)', opacity: 0.7 }} />
        <div style={{ position: 'absolute', left: '80%', top: -2, height: 10, width: 1, background: 'var(--line-3)', opacity: 0.7 }} />
      </div>
    </div>
  )
}

function SummaryLine({ label, value, tone = 'ink', sub }) {
  const color = tone === 'safe' ? 'var(--safe)' : tone === 'warn' ? 'var(--warn)' : tone === 'crit' ? 'var(--crit)' : tone === 'unk' ? 'var(--ink-4)' : 'var(--ink)'
  const subColor = tone === 'warn' ? 'var(--warn)' : tone === 'crit' ? 'var(--crit)' : 'var(--ink-3)'
  return (
    <div style={{ padding: '12px 14px', border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: color, opacity: tone === 'ink' ? 0 : 1 }} />
      <span className="eyebrow">{label}</span>
      <span className="tnum" style={{ fontSize: 22, fontWeight: 500, color, letterSpacing: '-0.015em', lineHeight: 1 }}>{value}</span>
      {sub && <span className="micro" style={{ color: subColor }}>{sub}</span>}
    </div>
  )
}

function DeviceStatusChip({ label, available, lastSeenAt }) {
  const tone = available === true ? 'safe' : available === false ? 'warn' : 'unk'
  const text = available === true ? '정상' : available === false ? '확인 필요' : '미수신'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${tone})`, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{label}</span>
          <span className="micro">{text}</span>
        </div>
        {lastSeenAt && <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 3 }}>{relTime(lastSeenAt)}</div>}
      </div>
    </div>
  )
}

function ThresholdSwatch({ color, label }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} /><span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{label}</span></span>
}

function OverviewTab({ f }) {
  const hist = window.MOCK.HISTORY[f.factory_id]['1h']
  const latest = hist[hist.length - 1]
  const causes = f.top_causes ?? []
  const ns = { ready: f.nodeReady, total: f.nodeTotal, not_ready: f.nodeTotal - f.nodeReady }
  const ws = f.workload
  const d = f.devices
  return (
    <>
      <div className="card factory-section-card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">주요 원인</h2><span className="micro">risk.top_causes · {causes.length}건</span></div></div>
        <div className="card-bd">
          {causes.length === 0 ? <EmptyNote text="top_causes가 미계산 상태입니다." /> : (
            <div className="grid row3">
              {causes.slice(0, 3).map((c, i) => <CauseCard key={i} rank={i + 1} name={c.name ?? c.field} value={c.value} contribution={c.contribution} />)}
            </div>
          )}
        </div>
      </div>
      <div className="factory-overview-grid">
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">현재 환경</h2><span className="micro">factory_state · 평균값</span></div></div>
          <div className="card-bd factory-card-stack">
            <div className="grid row3" style={{ gap: 10 }}>
              <MetricLine label="온도" value={latest.temperature_celsius_avg} unit="°C" />
              <MetricLine label="습도" value={latest.humidity_percent_avg} unit="%" />
              <MetricLine label="기압" value={latest.pressure_hpa_avg} unit="hPa" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, marginTop: 2, borderTop: '1px solid var(--line-2)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>AI 탐지 점수<span className="mono" style={{ color: 'var(--ink-4)', fontWeight: 500, marginLeft: 6, fontSize: 11 }}>· 0 ~ 1</span></span>
              <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <ThresholdSwatch color="var(--safe)" label="안전 < 0.3" />
                <ThresholdSwatch color="var(--warn)" label="주의 0.3~0.8" />
                <ThresholdSwatch color="var(--crit)" label="위험 ≥ 0.8" />
              </span>
            </div>
            <div className="grid row3" style={{ gap: 10 }}>
              <ScoreLine label="fire_score" value={latest.fire_score} />
              <ScoreLine label="fall_score" value={latest.fall_score} />
              <ScoreLine label="bend_score" value={latest.bend_score} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '.08em', textTransform: 'uppercase', minWidth: 110, fontWeight: 600 }}>abnormal_sound</span>
              <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{f.level === 'danger' ? 'detected' : 'normal'}</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">현재 인프라</h2><span className="micro">infra_state · 요약</span></div></div>
          <div className="card-bd factory-card-stack">
            <div className="grid row2" style={{ gap: 10 }}>
              <SummaryLine label="Node Ready" value={`${ns.ready} / ${ns.total}`} tone={ns.not_ready > 0 ? 'warn' : 'safe'} sub={ns.not_ready > 0 ? `${ns.not_ready} NotReady` : 'all ready'} />
              <SummaryLine label="Workload Running" value={`${ws.running} / ${ws.total}`} tone={ws.unhealthy > 0 ? 'warn' : 'safe'} sub={ws.unhealthy > 0 ? `${ws.unhealthy} unhealthy` : 'all running'} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 4, borderTop: '1px solid var(--line-2)' }}><span className="eyebrow">devices</span></div>
            <div className="grid row3" style={{ gap: 10 }}>
              <DeviceStatusChip label="BME280" available={d.bme280?.available} lastSeenAt={d.bme280?.last_seen_at} />
              <DeviceStatusChip label="Camera" available={d.camera?.available} lastSeenAt={d.camera?.last_seen_at} />
              <DeviceStatusChip label="Microphone" available={d.microphone?.available} lastSeenAt={d.microphone?.last_seen_at} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── History tab ───────────────────────────────────────────────────────────
function WindowSeg({ win, setWin }) {
  return <div className="seg">{HISTORY_WINDOWS.map((w) => <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>{w.toUpperCase()}</button>)}</div>
}

function MiniSparkline({ data, color, height = 60 }) {
  const valid = data.filter((v) => v != null && !isNaN(v))
  if (valid.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--line-3)', borderRadius: 6, background: 'var(--surface-2)' }}><span className="micro">데이터 없음</span></div>
  const min = Math.min(...valid), max = Math.max(...valid), range = max - min || 1, w = 300
  const pts = data.map((v, i) => v == null ? null : `${((i / (data.length - 1)) * w).toFixed(1)},${(height - ((v - min) / range) * (height - 6) - 3).toFixed(1)}`).filter(Boolean).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <polygon points={`0,${height} ${pts} ${w},${height}`} fill={color} fillOpacity="0.08" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function SensorPanel({ label, unit, color, data }) {
  const valid = data.filter((v) => v != null && !isNaN(v))
  const cur = valid.length ? valid[valid.length - 1] : null
  const lo = valid.length ? Math.min(...valid) : null
  const hi = valid.length ? Math.max(...valid) : null
  const delta = valid.length >= 2 ? valid[valid.length - 1] - valid[0] : null
  return (
    <div style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: color, opacity: 0.5 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="eyebrow">{label}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="tnum" style={{ fontSize: 24, color: 'var(--ink)', fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1 }}>{cur == null ? '—' : cur.toFixed(1)}</span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{unit}</span>
          </div>
        </div>
        {delta != null && <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-3)', padding: '2px 6px', borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}</span>}
      </div>
      <MiniSparkline data={data} color={color} height={64} />
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-2)', display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-3)' }}>
        <span>min <span className="mono tnum" style={{ color: 'var(--ink-2)', marginLeft: 4 }}>{lo == null ? '—' : lo.toFixed(1)}</span></span>
        <span>max <span className="mono tnum" style={{ color: 'var(--ink-2)', marginLeft: 4 }}>{hi == null ? '—' : hi.toFixed(1)}</span></span>
      </div>
    </div>
  )
}

function ThresholdLegend({ title, items }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 10, padding: '8px 12px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--line-2)', fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ width: 1, height: 12, background: 'var(--line)' }} />
      {items.map((t) => <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><span style={{ width: 18, height: 3, borderRadius: 2, background: t.color, flexShrink: 0 }} />{t.label}</span>)}
    </div>
  )
}

function HistoryTab({ factoryId }) {
  const [win, setWin] = useState('1h')
  const history = window.MOCK.HISTORY[factoryId][win]
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="eyebrow">history range</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>{win.toUpperCase()}</span>
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{history.length} pts</span>
        </div>
        <WindowSeg win={win} setWin={setWin} />
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">안전 점수 추이</h2><span className="micro">HISTORY#STATE · risk_score · 100이 가장 안전</span></div></div>
        <div className="card-bd">
          <RiskScoreChart items={history} />
          <ThresholdLegend title="thresholds" items={[{ color: 'var(--safe)', label: '안전 85~100' }, { color: 'var(--warn)', label: '주의 50~84' }, { color: 'var(--crit)', label: '위험 0~49' }]} />
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">환경 센서</h2><span className="micro">HISTORY#STATE · 온도 · 습도 · 기압</span></div></div>
        <div className="card-bd">
          <div className="grid row3">
            <SensorPanel label="온도" unit="°C" color="oklch(0.65 0.18 30)" data={history.map((h) => h.temperature_celsius_avg ?? null)} />
            <SensorPanel label="습도" unit="%" color="oklch(0.65 0.15 230)" data={history.map((h) => h.humidity_percent_avg ?? null)} />
            <SensorPanel label="기압" unit="hPa" color="oklch(0.55 0.10 280)" data={history.map((h) => h.pressure_hpa_avg ?? null)} />
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">AI 탐지 점수</h2><span className="micro">HISTORY#STATE · fire / fall / bend · 0 ~ 1</span></div></div>
        <div className="card-bd">
          <AIScoreChart items={history} />
          <ThresholdLegend title="ai thresholds" items={[{ color: 'var(--safe)', label: '안전 0.0~0.3' }, { color: 'var(--warn)', label: '주의 0.3~0.8' }, { color: 'var(--crit)', label: '위험 0.8~1.0' }]} />
        </div>
      </div>
    </>
  )
}

// ─── Infrastructure tab ──────────────────────────────────────────────────
function UsageCell({ value }) {
  if (value == null) return <span style={{ color: 'var(--ink-4)', fontSize: 11.5, whiteSpace: 'nowrap' }}>미수신</span>
  const tone = value >= 85 ? 'crit' : value >= 70 ? 'warn' : 'ink'
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 56, height: 6, borderRadius: 3, background: 'var(--line-2)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: '70%', top: -1, bottom: -1, width: 1, background: 'var(--line-3)', opacity: 0.6 }} />
        <div style={{ position: 'absolute', left: '85%', top: -1, bottom: -1, width: 1, background: 'var(--line-3)', opacity: 0.6 }} />
      </div>
      <span className="mono tnum" style={{ fontSize: 12, color, minWidth: 28, textAlign: 'right', fontWeight: 600 }}>{Math.round(value)}</span>
    </div>
  )
}

function NetReachCell({ value }) {
  if (value == null) return <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>
  if (value === 'unknown') return <span className="pill unk" style={{ padding: '3px 6px', fontSize: 10.5 }}><span className="dot" />unknown</span>
  const ok = value === 'reachable' || value === 'ok'
  return <span className={`pill ${ok ? 'safe' : 'crit'}`} style={{ padding: '3px 6px', fontSize: 10.5 }}><span className="dot" />{value}</span>
}

function RestartCount({ value }) {
  if (value == null) return <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>
  const tone = value >= 10 ? 'crit' : value >= 5 ? 'warn' : value > 0 ? 'ink' : 'mute'
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : tone === 'ink' ? 'var(--ink-2)' : 'var(--ink-4)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      {value >= 5 && <span className="mono" style={{ fontSize: 9.5, color: '#fff', letterSpacing: '.1em', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: color }}>HOT</span>}
      <span className="mono tnum" style={{ fontSize: 13, color, fontWeight: value > 0 ? 600 : 400 }}>{value}</span>
    </div>
  )
}

function PipelineAge({ label, seconds, warn, crit }) {
  const tone = seconds == null ? 'unk' : seconds >= crit ? 'crit' : seconds >= warn ? 'warn' : 'safe'
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : tone === 'safe' ? 'var(--safe)' : 'var(--ink-4)'
  const cap = crit * 1.5
  const pct = seconds == null ? 0 : Math.min(100, (seconds / cap) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="eyebrow">{label}</span>
        <span className="micro mono" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>warn ≥ {warn}s · crit ≥ {crit}s</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="tnum" style={{ fontSize: 26, color, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1 }}>{seconds ?? '—'}</span>
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

function InfraTab({ f }) {
  const [win, setWin] = useState('1h')
  const history = window.MOCK.HISTORY[f.factory_id][win]
  const nodes = window.MOCK.nodesFor(f)
  const workloads = window.MOCK.workloadsFor(f)
  const ws = f.workload
  const psAge = f.level === 'danger' ? 72 : f.level === 'warning' ? 44 : 14
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">Edge Agent Heartbeat</h2><span className="micro">infra_state.heartbeat</span></div></div>
        <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">agent_status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: f.level === 'danger' ? 'var(--crit)' : 'var(--safe)', flexShrink: 0 }} />
              <span style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{f.level === 'danger' ? 'degraded' : 'running'}</span>
            </div>
            <span className="micro">edge agent 상태</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">last_spool_write_status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--safe)', flexShrink: 0 }} />
              <span style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>success</span>
            </div>
            <span className="micro">spool write 마지막 시도 결과</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="eyebrow">last_spool_write_at</span>
            <span className="mono tnum" style={{ fontSize: 16, color: 'var(--ink)' }}>{relTime(f.last_infra_state_at)}</span>
            <span className="micro mono">{f.last_infra_state_at}</span>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">Pipeline</h2><span className="micro">latest age vs LATEST 수신 시각</span></div><PipelineBadge status={f.pipeline} /></div>
        <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
          <PipelineAge label="latest_infra_state_age" seconds={psAge} warn={40} crit={60} />
          <PipelineAge label="latest_s3_raw_age" seconds={psAge + 30} warn={60} crit={120} />
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">Nodes</h2><span className="micro">infra_state.nodes · {nodes.length}개</span></div></div>
        <table className="tbl">
          <thead><tr><th>node_id</th><th>role</th><th>Ready</th><th style={{ textAlign: 'right' }}>CPU%</th><th style={{ textAlign: 'right' }}>Memory%</th><th style={{ textAlign: 'right' }}>Disk%</th><th>network</th></tr></thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.node_id}>
                <td><span className="mono" style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{n.node_id}</span></td>
                <td>{n.role ? <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', padding: '2px 6px', border: '1px solid var(--line-2)', borderRadius: 4, background: 'var(--surface-2)' }}>{n.role}</span> : <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span>}</td>
                <td><span className={`pill ${n.ready ? 'safe' : 'crit'}`} style={{ padding: '3px 6px', fontSize: 10.5 }}><span className="dot" />{n.ready ? 'Ready' : 'NotReady'}</span></td>
                <td style={{ textAlign: 'right' }}><UsageCell value={n.cpu_usage_percent} /></td>
                <td style={{ textAlign: 'right' }}><UsageCell value={n.memory_usage_percent} /></td>
                <td style={{ textAlign: 'right' }}><UsageCell value={n.disk_usage_percent} /></td>
                <td><NetReachCell value={n.network_reachability} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">노드 사용률 추이</h2><span className="micro">HISTORY#STATE · node별 시리즈</span></div><WindowSeg win={win} setWin={setWin} /></div>
        <div className="card-bd">
          <div className="grid row3">
            {[['CPU%', 'cpu_usage_percent'], ['Memory%', 'memory_usage_percent'], ['Disk%', 'disk_usage_percent']].map(([lbl, fld]) => (
              <div key={fld} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>{lbl}</div>
                <NodeResourceChart items={history} field={fld} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">Workloads</h2><span className="micro">{ws.running}/{ws.total} Running</span></div>{ws.unhealthy > 0 && <span className="pill warn" style={{ padding: '3px 6px', fontSize: 10.5 }}><span className="dot" />unhealthy · {ws.unhealthy}</span>}</div>
        <table className="tbl">
          <thead><tr><th>namespace</th><th>name</th><th>status</th><th>ready</th><th>node_id</th><th style={{ textAlign: 'right' }}>restart_count</th></tr></thead>
          <tbody>
            {workloads.map((w, i) => {
              const hot = (w.restart_count ?? 0) >= 5
              const tone = w.status === 'Running' ? 'safe' : w.status === 'Pending' ? 'warn' : 'crit'
              return (
                <tr key={i} style={hot ? { background: 'var(--warn-tint-2)' } : undefined}>
                  <td><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{w.namespace ?? '—'}</span></td>
                  <td><span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{w.name}</span></td>
                  <td><span className={`pill ${tone}`} style={{ padding: '3px 6px', fontSize: 10.5 }}><span className="dot" />{w.status ?? '—'}</span></td>
                  <td>{w.ready == null ? <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>—</span> : <span style={{ fontSize: 11.5, color: w.ready ? 'var(--safe)' : 'var(--crit)', fontWeight: 500 }}>{w.ready ? 'true' : 'false'}</span>}</td>
                  <td><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{w.node_id ?? '—'}</span></td>
                  <td style={{ textAlign: 'right' }}><RestartCount value={w.restart_count} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Timeline tab ────────────────────────────────────────────────────────
function deriveTimelineEvents(history) {
  const events = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], curr = history[i]
    const tsMs = curr.timestamp ? new Date(curr.timestamp).getTime() : Date.now()
    if (curr.risk_level && prev.risk_level && curr.risk_level !== prev.risk_level) {
      const sev = curr.risk_level === 'danger' ? 'danger' : curr.risk_level === 'warning' ? 'warning' : 'info'
      events.push({ kind: 'risk_level', severity: sev, title: `Risk Level ${levelKr(prev.risk_level)} → ${levelKr(curr.risk_level)}`, detail: `risk_score: ${curr.risk_score ?? '—'}`, ts: tsMs })
    }
    if (curr.risk_score != null && prev.risk_score != null) {
      const diff = curr.risk_score - prev.risk_score
      if (diff <= -10) events.push({ kind: 'risk_drop', severity: 'danger', title: `Risk Score 급락 ${diff.toFixed(1)}`, detail: `${prev.risk_score} → ${curr.risk_score}`, ts: tsMs })
      else if (diff >= 10) events.push({ kind: 'recovery', severity: 'info', title: `Risk Score 회복 +${diff.toFixed(1)}`, detail: `${prev.risk_score} → ${curr.risk_score}`, ts: tsMs })
    }
  }
  return events.reverse()
}

function TimelineRow({ e, last }) {
  const tone = e.severity === 'danger' ? 'crit' : e.severity === 'warning' ? 'warn' : 'info'
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)'
  const t = new Date(e.ts)
  const hhmm = t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, padding: '14px 18px', borderBottom: last ? '0' : '1px solid var(--line-2)', transition: 'background .12s' }}
      onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--surface-2)' }} onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}>
      <div style={{ position: 'relative', width: 22 }}>
        <div style={{ position: 'absolute', left: 5, top: 3, width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent), 0 0 0 5px var(--surface)` }} />
        {!last && <div style={{ position: 'absolute', left: 9.5, top: 18, bottom: -14, width: 1, background: 'var(--line-2)' }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '.06em', padding: '2px 6px', border: '1px solid var(--line-2)', borderRadius: 4, background: 'var(--surface-2)', fontWeight: 500 }}>{e.kind}</span>
          <span className={`pill ${tone}`} style={{ padding: '2px 6px', fontSize: 9.5 }}><span className="dot" />{e.severity}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2, lineHeight: 1.35 }}>{e.title}</div>
        <div className="micro">{e.detail}</div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
        <span className="mono tnum" style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>{relTime(t.toISOString())}</span>
        <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{hhmm}</span>
      </div>
    </div>
  )
}

function TimelineTab({ factoryId }) {
  const [win, setWin] = useState('1h')
  const history = window.MOCK.HISTORY[factoryId][win]
  const events = deriveTimelineEvents(history)
  return (
    <div className="card">
      <div className="card-hd"><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h2 className="h2">Timeline</h2><span className="micro">HISTORY#STATE 비교 derive · {events.length}건</span></div><WindowSeg win={win} setWin={setWin} /></div>
      {events.length === 0 ? <EmptyNote text="이 기간에 derive 가능한 이벤트가 없습니다." /> : <div style={{ padding: '6px 0' }}>{events.map((e, i) => <TimelineRow key={i} e={e} last={i === events.length - 1} />)}</div>}
    </div>
  )
}

// ─── Main factory page ───────────────────────────────────────────────────
const FACTORY_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Environment History' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'timeline', label: 'Timeline' },
]

function FactoryPage({ factoryId }) {
  const { navigate } = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const [refreshInterval, setRefreshInterval] = useState(0)
  const f = window.MOCK.FACTORIES.find((x) => x.factory_id === factoryId)
  const sidebarFactories = [...window.MOCK.FACTORIES].sort((a, b) => a.factory_id.localeCompare(b.factory_id)).map((x) => ({ factory_id: x.factory_id, risk_level: x.level, risk_score: x.score }))
  if (!f) return <Shell factories={sidebarFactories} crumbs={[{ label: 'Aegis-π' }, { label: 'Fleet', href: '/' }, { label: factoryId }]} onBack={() => navigate('/')}><div className="empty-state"><span className="sub">공장을 찾을 수 없습니다.</span></div></Shell>
  const sparkData = window.MOCK.HISTORY[factoryId]['24h'].map((h) => h.risk_score).filter((v) => v != null)
  return (
    <Shell factories={sidebarFactories} crumbs={[{ label: 'Aegis-π' }, { label: 'Fleet', href: '/' }, { label: factoryId }]} onBack={() => navigate('/')}
      wsStatus="connected" onRefresh={() => {}} refreshInterval={refreshInterval} onIntervalChange={setRefreshInterval}>
      <FactoryHeader f={f} sparkData={sparkData} />
      <div className="factory-tabs-panel">
        <div className="tabs factory-tabs">
          {FACTORY_TABS.map((t) => <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
        </div>
      </div>
      {activeTab === 'overview' && <OverviewTab f={f} />}
      {activeTab === 'history' && <HistoryTab factoryId={factoryId} />}
      {activeTab === 'infrastructure' && <InfraTab f={f} />}
      {activeTab === 'timeline' && <TimelineTab factoryId={factoryId} />}
      <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)', fontSize: 11, color: 'var(--ink-3)', zIndex: 5 }}>
        <ConnStatus status="connected" />
      </div>
    </Shell>
  )
}

Object.assign(window, { FactoryPage })
