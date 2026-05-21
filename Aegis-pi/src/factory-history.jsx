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
        marginBottom: 12,
      }}>
        <div className="micro">HISTORY · {win} · {hist.risk.length}개 포인트</div>
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
  return (
    <div style={{
      padding: 12, border: "1px solid var(--line)", borderRadius: 9,
      background: "var(--surface-2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 16, color: "var(--ink)" }}>
          {cur == null ? "—" : cur.toFixed(digits)}
          <span className="micro" style={{ marginLeft: 3 }}>{unit}</span>
        </span>
      </div>
      <MultiLine
        series={[{ name: label, color, data }]}
        xLabels={xLabels}
        height={120} legend={false}
        yMin={lo == null ? 0 : lo - (hi - lo) * 0.1}
        yMax={hi == null ? 1 : hi + (hi - lo) * 0.1}
        yTicks={3}
      />
      <div className="micro" style={{ marginTop: 6, display: "flex", gap: 12 }}>
        <span>min <span className="mono tnum" style={{ color: "var(--ink-3)" }}>
          {lo == null ? "—" : lo.toFixed(digits)}
        </span></span>
        <span>max <span className="mono tnum" style={{ color: "var(--ink-3)" }}>
          {hi == null ? "—" : hi.toFixed(digits)}
        </span></span>
      </div>
    </div>
  );
}

function RiskThresholds() {
  return (
    <div style={{
      display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: "var(--ink-3)",
      flexWrap: "wrap",
    }}>
      <span className="micro" style={{ marginRight: 4 }}>100 = 가장 안전 · 0 = 가장 위험</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 18, height: 2, background: "var(--safe)" }} />
        안전&nbsp;85 ~ 100
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 18, height: 2, background: "var(--warn)" }} />
        주의&nbsp;50 ~ 84
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 18, height: 2, background: "var(--crit)" }} />
        위험&nbsp;0 ~ 49
      </span>
    </div>
  );
}

function AiScoreThresholds() {
  return (
    <div style={{
      display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: "var(--ink-3)",
      flexWrap: "wrap",
    }}>
      <span className="micro" style={{ marginRight: 4 }}>AI 탐지 점수 구간</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, background: "var(--safe)", borderRadius: 2 }} />
        안전&nbsp;0.0 ~ 0.2
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, background: "var(--warn)", borderRadius: 2 }} />
        주의&nbsp;0.3 ~ 0.7
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, background: "var(--crit)", borderRadius: 2 }} />
        위험&nbsp;0.8 ~ 1.0
      </span>
    </div>
  );
}

window.FactoryHistory = FactoryHistory;
