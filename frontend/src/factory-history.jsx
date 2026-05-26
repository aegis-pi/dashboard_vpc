// Factory Detail · History tab
// Shows 3 charts over selected window (1h / 2h / 24h):
//   1) Risk Score line
//   2) Temperature / Humidity / Pressure (3-line, normalized panels)
//   3) fire / fall / bend (0~1) 3-line

const WINDOWS = [
  { key: "1h",  label: "1H" },
  { key: "6h",  label: "6H" },
  { key: "12h", label: "12H" },
  { key: "24h", label: "24H" },
];

function FactoryHistory({ f }) {
  const [win, setWin] = React.useState("1h");
  const hist = React.useMemo(() => window.buildHistory(f, win), [f.factory_id, win]);

  const xLabels = React.useMemo(
    () => hist.risk.map(r => window.clockHHMM(r.timestamp)),
    [hist]
  );

  const isEmpty = !hist.risk?.length;

  return (
    <>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="eyebrow">history range</span>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>
            {win.toUpperCase()}
          </span>
          <span style={{ color: "var(--ink-5)" }}>·</span>
          <span className="mono tnum" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {hist.risk.length} pts
          </span>
        </div>
        <div className="seg">
          {WINDOWS.map(w => (
            <button key={w.key} aria-pressed={win === w.key}
                    onClick={() => setWin(w.key)}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* Risk Score (= 안전 점수) */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader title="안전 점수 추이" hint="HISTORY#RISK · risk_score · 100이 가장 안전" />
        <div className="card-bd">
          {isEmpty ? <EmptyNote /> : (
            <MultiLine
              series={[{ name: "risk_score", color: "var(--accent)",
                         data: hist.risk.map(r => r.risk_score) }]}
              xLabels={xLabels} yUnit="" yMin={0} yMax={100}
              height={200} legend={false}
              bands={[
                { from: 0,  to: 50,  color: "var(--crit)" },
                { from: 50, to: 85,  color: "var(--warn)" },
                { from: 85, to: 100, color: "var(--safe)" },
              ]}
              thresholdLines={[
                { y: 50, color: "var(--warn)" },
                { y: 85, color: "var(--safe)" },
              ]}
            />
          )}
          {!isEmpty && <RiskThresholds />}
        </div>
      </div>

      {/* Temperature / Humidity / Pressure */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader title="환경 센서" hint="HISTORY#FACTORY · 온도 · 습도 · 기압" />
        <div className="card-bd">
          {isEmpty ? <EmptyNote /> : (
            <div className="grid row3" style={{ gap: 14 }}>
              <SingleChart label="온도" unit="°C"
                           color="oklch(0.65 0.18 30)"
                           data={hist.factory.map(d => d.temperature_celsius_avg)}
                           xLabels={xLabels} digits={1} />
              <SingleChart label="습도" unit="%"
                           color="oklch(0.65 0.15 230)"
                           data={hist.factory.map(d => d.humidity_percent_avg)}
                           xLabels={xLabels} digits={1} />
              <SingleChart label="기압" unit="hPa"
                           color="oklch(0.55 0.10 280)"
                           data={hist.factory.map(d => d.pressure_hpa_avg)}
                           xLabels={xLabels} digits={1} />
            </div>
          )}
        </div>
      </div>

      {/* fire / fall / bend */}
      <div className="card">
        <SectionHeader title="AI 탐지 점수" hint="HISTORY#FACTORY · fire / fall / bend · 0 ~ 1" />
        <div className="card-bd">
          {isEmpty ? <EmptyNote /> : (
            <>
              <MultiLine
                series={[
                  { name: "fire_score", color: "var(--crit)",
                    data: hist.factory.map(d => d.fire_score) },
                  { name: "fall_score", color: "var(--warn)",
                    data: hist.factory.map(d => d.fall_score) },
                  { name: "bend_score", color: "var(--accent)",
                    data: hist.factory.map(d => d.bend_score) },
                ]}
                xLabels={xLabels} yMin={0} yMax={1}
                height={220} yTicks={4}
                bands={[
                  { from: 0.0, to: 0.3, color: "var(--safe)" },
                  { from: 0.3, to: 0.8, color: "var(--warn)" },
                  { from: 0.8, to: 1.0, color: "var(--crit)" },
                ]}
                thresholdLines={[
                  { y: 0.3, color: "var(--warn)" },
                  { y: 0.8, color: "var(--crit)" },
                ]}
              />
              <AiScoreThresholds />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Tiny single-line chart panel with current value + min/max
function SingleChart({ label, unit, color, data, xLabels, digits = 1 }) {
  const valid = data.filter(v => v != null && !isNaN(v));
  const cur = valid.length ? valid[valid.length - 1] : null;
  const lo  = valid.length ? Math.min(...valid) : null;
  const hi  = valid.length ? Math.max(...valid) : null;
  const delta = valid.length >= 2 ? (valid[valid.length - 1] - valid[0]) : null;
  return (
    <div style={{
      padding: 14, border: "1px solid var(--line)", borderRadius: 10,
      background: "var(--surface)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Color edge accent */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: color, opacity: 0.5,
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span className="eyebrow">{label}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span className="tnum" style={{
              fontSize: 24, color: "var(--ink)", fontWeight: 500,
              letterSpacing: "-0.015em", lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}>
              {cur == null ? "—" : cur.toFixed(digits)}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{unit}</span>
          </div>
        </div>
        {delta != null && (
          <span className="mono tnum" style={{
            fontSize: 10.5,
            color: Math.abs(delta) < 0.01 ? "var(--ink-4)" : (delta > 0 ? "var(--ink-2)" : "var(--ink-2)"),
            letterSpacing: ".02em",
            padding: "2px 6px", borderRadius: 4,
            background: "var(--surface-2)", border: "1px solid var(--line-2)",
          }}>
            {delta > 0 ? "+" : ""}{delta.toFixed(digits)}
          </span>
        )}
      </div>
      <MultiLine
        series={[{ name: label, color, data }]}
        xLabels={xLabels}
        height={110} legend={false}
        yMin={lo == null ? 0 : lo - (hi - lo) * 0.1}
        yMax={hi == null ? 1 : hi + (hi - lo) * 0.1}
        yTicks={3}
      />
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-2)",
        display: "flex", justifyContent: "space-between",
        fontSize: 10.5, color: "var(--ink-3)",
      }}>
        <span>min <span className="mono tnum" style={{ color: "var(--ink-2)", marginLeft: 4 }}>
          {lo == null ? "—" : lo.toFixed(digits)}
        </span></span>
        <span>max <span className="mono tnum" style={{ color: "var(--ink-2)", marginLeft: 4 }}>
          {hi == null ? "—" : hi.toFixed(digits)}
        </span></span>
      </div>
    </div>
  );
}

function RiskThresholds() {
  return (
    <div style={{
      display: "flex", gap: 14, marginTop: 10,
      padding: "8px 12px", borderRadius: 7,
      background: "var(--surface-2)", border: "1px solid var(--line-2)",
      fontSize: 11.5, color: "var(--ink-3)", flexWrap: "wrap",
      alignItems: "center",
    }}>
      <span className="mono" style={{
        fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase",
        color: "var(--ink-3)", fontWeight: 600, whiteSpace: "nowrap",
      }}>thresholds</span>
      <span style={{ width: 1, height: 12, background: "var(--line)" }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 18, height: 3, borderRadius: 2, background: "var(--safe)", flexShrink: 0 }} />
        안전&nbsp;<span className="mono tnum" style={{ color: "var(--ink-2)" }}>85 ~ 100</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 18, height: 3, borderRadius: 2, background: "var(--warn)", flexShrink: 0 }} />
        주의&nbsp;<span className="mono tnum" style={{ color: "var(--ink-2)" }}>50 ~ 84</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 18, height: 3, borderRadius: 2, background: "var(--crit)", flexShrink: 0 }} />
        위험&nbsp;<span className="mono tnum" style={{ color: "var(--ink-2)" }}>0 ~ 49</span>
      </span>
    </div>
  );
}

function AiScoreThresholds() {
  return (
    <div style={{
      display: "flex", gap: 14, marginTop: 10,
      padding: "8px 12px", borderRadius: 7,
      background: "var(--surface-2)", border: "1px solid var(--line-2)",
      fontSize: 11.5, color: "var(--ink-3)", flexWrap: "wrap",
      alignItems: "center",
    }}>
      <span className="mono" style={{
        fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase",
        color: "var(--ink-3)", fontWeight: 600, whiteSpace: "nowrap",
      }}>ai thresholds</span>
      <span style={{ width: 1, height: 12, background: "var(--line)" }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 10, height: 10, background: "var(--safe)", borderRadius: 2, flexShrink: 0 }} />
        안전&nbsp;<span className="mono tnum" style={{ color: "var(--ink-2)" }}>0.0 ~ 0.3</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 10, height: 10, background: "var(--warn)", borderRadius: 2, flexShrink: 0 }} />
        주의&nbsp;<span className="mono tnum" style={{ color: "var(--ink-2)" }}>0.3 ~ 0.8</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ width: 10, height: 10, background: "var(--crit)", borderRadius: 2, flexShrink: 0 }} />
        위험&nbsp;<span className="mono tnum" style={{ color: "var(--ink-2)" }}>0.8 ~ 1.0</span>
      </span>
    </div>
  );
}

window.FactoryHistory = FactoryHistory;
