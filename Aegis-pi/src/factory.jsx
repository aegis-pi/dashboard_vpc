// Factory Detail — shell + 4 tabs (overview · history · infra · timeline).
// All four tabs sit on the same factory_id; their content lives below.

const FACTORY_TABS = [
  { key: "overview",  label: "Overview"   },
  { key: "history",   label: "Environment History" },
  { key: "infra",     label: "Infrastructure" },
  { key: "timeline",  label: "Timeline" },
];

function FactoryDetail({ factoryId, onBack }) {
  const f = window.FACTORIES.find(x => x.factory_id === factoryId) || window.FACTORIES[0];
  const [tab, setTab] = React.useState("overview");

  return (
    <>
      <FactoryHeader f={f} />
      <FactoryTabBar tab={tab} onChange={setTab} />

      {tab === "overview" && <FactoryOverview f={f} />}
      {tab === "history"  && <FactoryHistory  f={f} />}
      {tab === "infra"    && <FactoryInfra    f={f} />}
      {tab === "timeline" && <FactoryTimeline f={f} />}
    </>
  );
}

// ─── Header ─────────────────────────────────────────────────────
function FactoryHeader({ f }) {
  const ns = f.infra_state?.node_summary;
  const tone = window.LEVEL_META[f.risk?.level]?.tone ?? "unk";
  const scoreColor =
    tone === "safe" ? "var(--safe)" :
    tone === "warn" ? "var(--warn)" :
    tone === "crit" ? "var(--crit)" : "var(--ink-3)";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto",
      gap: 18, alignItems: "flex-start",
      paddingBottom: 16, marginBottom: 14,
      borderBottom: "1px solid var(--line)",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", letterSpacing: ".06em" }}>
            {f.environment_type}
          </span>
          <span style={{ color: "var(--ink-5)" }}>·</span>
          <LevelBadge level={f.risk?.level} />
          <PipelineBadge status={f.pipeline_status?.status} />
          <StalenessBadge factory={f} />
        </div>
        <h1 className="h1" style={{ marginBottom: 6 }}>{f.factory_id}</h1>
        <p className="sub" style={{ margin: 0 }}>{f.dashboard?.summary ?? "미수신"}</p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "auto 1px auto 1px auto",
        gap: 16, alignItems: "center",
        padding: "10px 14px",
        border: "1px solid var(--line)", borderRadius: 10,
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="eyebrow">안전 점수 <span className="mono" style={{ color: "var(--ink-5)" }}>· risk.score</span></span>
          <span className="tnum" style={{
            fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em",
            color: scoreColor, lineHeight: 1,
          }}>{f.risk?.score ?? "—"}</span>
        </div>
        <div style={{ width: 1, height: 34, background: "var(--line-2)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="eyebrow">node ready</span>
          <span className="mono tnum" style={{ fontSize: 18, color: "var(--ink)" }}>
            {ns ? `${ns.ready}/${ns.total}` : "—"}
          </span>
        </div>
        <div style={{ width: 1, height: 34, background: "var(--line-2)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="eyebrow">updated</span>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {window.relTime(f.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────
function FactoryTabBar({ tab, onChange }) {
  return (
    <div style={{
      display: "flex", gap: 4,
      marginBottom: 14,
      borderBottom: "1px solid var(--line)",
    }}>
      {FACTORY_TABS.map(t => {
        const active = tab === t.key;
        return (
          <button key={t.key} onClick={() => onChange(t.key)}
                  style={{
                    border: 0, background: "transparent",
                    padding: "8px 14px",
                    fontFamily: "inherit",
                    fontSize: 13, fontWeight: active ? 600 : 500,
                    color: active ? "var(--ink)" : "var(--ink-3)",
                    cursor: "pointer",
                    borderBottom: `2px solid ${active ? "var(--ink)" : "transparent"}`,
                    marginBottom: -1,
                  }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab 1 · Overview ────────────────────────────────────────────
function FactoryOverview({ f }) {
  const causes = f.risk?.top_causes ?? [];
  const s = f.factory_state?.sensor;
  const ai = f.factory_state?.ai_result;
  const dv = f.infra_state?.devices;
  const ns = f.infra_state?.node_summary;
  const ws = f.infra_state?.workload_summary;
  const isVM = f.environment_type !== "physical-rpi";

  return (
    <>
      {/* top_causes */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader
          title="주요 원인"
          hint={`risk.top_causes · ${causes.length}건`}
        />
        <div className="card-bd">
          {causes.length === 0 ? (
            <EmptyNote text="top_causes가 미계산 상태입니다." />
          ) : (
            <div className="grid row3">
              {causes.slice(0, 3).map((c, i) => (
                <CauseCard key={i} c={c} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* current environment + current infrastructure */}
      <div className="grid row2" style={{ marginBottom: 14 }}>
        {/* Environment */}
        <div className="card">
          <SectionHeader
            title="현재 환경"
            hint={s ? "factory_state.sensor · 평균값" : "미수신"}
          />
          <div className="card-bd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="grid row3" style={{ gap: 12 }}>
              <MetricLine label="온도" value={s?.temperature_celsius_avg} unit="°C" digits={1} />
              <MetricLine label="습도" value={s?.humidity_percent_avg}   unit="%"  digits={1} />
              <MetricLine label="기압" value={s?.pressure_hpa_avg}       unit="hPa" digits={1} />
            </div>
            <div className="hr" />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span className="eyebrow">AI 탐지 점수 · 0 ~ 1</span>
              <span className="micro">
                <span style={{ color: "var(--safe)" }}>안전</span> &lt; 0.3
                <span style={{ color: "var(--ink-5)", margin: "0 6px" }}>·</span>
                <span style={{ color: "var(--warn)" }}>주의</span> 0.3 ~ 0.7
                <span style={{ color: "var(--ink-5)", margin: "0 6px" }}>·</span>
                <span style={{ color: "var(--crit)" }}>위험</span> ≥ 0.8
              </span>
            </div>
            <div className="grid row3" style={{ gap: 12 }}>
              <ScoreLine label="fire_score" value={ai?.fire_score} />
              <ScoreLine label="fall_score" value={ai?.fall_score} />
              <ScoreLine label="bend_score" value={ai?.bend_score} />
            </div>
            <div className="hr" />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="eyebrow" style={{ minWidth: 110 }}>abnormal_sound</span>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>
                {ai?.abnormal_sound ?? <span style={{ color: "var(--ink-4)" }}>미수신</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Infrastructure summary */}
        <div className="card">
          <SectionHeader
            title="현재 인프라"
            hint="infra_state · 요약"
          />
          <div className="card-bd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="grid row2" style={{ gap: 12 }}>
              <SummaryLine label="Node Ready"
                           value={ns ? `${ns.ready} / ${ns.total}` : "미수신"}
                           tone={ns ? (ns.not_ready > 0 ? "warn" : "safe") : "unk"}
                           sub={ns?.not_ready > 0 ? `${ns.not_ready} NotReady` : null} />
              <SummaryLine label="Workload Running"
                           value={ws ? `${ws.running} / ${ws.total}` : "미수신"}
                           tone={ws ? (ws.not_running > 0 ? "warn" : "safe") : "unk"}
                           sub={ws?.not_running > 0 ? `${ws.not_running} not_running` : null} />
            </div>
            <div className="hr" />
            <div className="eyebrow">devices · last_seen_at 포함</div>
            <div className="grid row3" style={{ gap: 10 }}>
              <DeviceChip label="BME280"     device={dv?.bme280}     naWhenEnv={isVM} />
              <DeviceChip label="Camera"     device={dv?.camera}     naWhenEnv={isVM} />
              <DeviceChip label="Microphone" device={dv?.microphone} naWhenEnv={isVM} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Small sub-components for the overview ────────────────────────
function CauseCard({ c, rank }) {
  return (
    <div style={{
      padding: 14, border: "1px solid var(--line)", borderRadius: 9,
      background: "var(--surface-2)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono tnum" style={{
          fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".06em",
        }}>#{rank}</span>
        <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, lineHeight: 1.25 }}>
          {c.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="eyebrow">value</span>
          <span className="mono tnum" style={{ fontSize: 18, color: "var(--ink-2)" }}>
            {c.value}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span className="eyebrow">contribution</span>
          <span className="mono tnum" style={{ fontSize: 18, color: "var(--crit)" }}>
            −{c.contribution}
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricLine({ label, value, unit, digits = 1 }) {
  const formatted = value == null ? null : value.toFixed(digits);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        {formatted == null ? (
          <span style={{ fontSize: 13, color: "var(--ink-4)" }}>미수신</span>
        ) : (
          <>
            <span className="mono tnum" style={{ fontSize: 22, fontWeight: 500, color: "var(--ink)" }}>
              {formatted}
            </span>
            <span className="micro">{unit}</span>
          </>
        )}
      </div>
    </div>
  );
}

function ScoreLine({ label, value }) {
  // AI detection score (0~1): 0.0~0.2 안전 / 0.3~0.7 주의 / 0.8~1.0 위험
  const v = value == null ? null : Math.max(0, Math.min(1, value));
  const tone =
    v == null ? "unk" :
    v >= 0.8  ? "crit" :
    v >= 0.3  ? "warn" : "safe";
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" :
    tone === "safe" ? "var(--safe)" : "var(--ink-4)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 14, color, fontWeight: 500 }}>
          {v == null ? "—" : v.toFixed(2)}
        </span>
      </div>
      <div style={{
        height: 5, borderRadius: 3,
        background: "var(--line-2)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${(v ?? 0) * 100}%`,
          background: color, transition: "width .4s ease",
        }} />
      </div>
    </div>
  );
}

function SummaryLine({ label, value, tone = "ink", sub }) {
  const color =
    tone === "safe" ? "var(--safe)" :
    tone === "warn" ? "var(--warn)" :
    tone === "crit" ? "var(--crit)" :
    tone === "unk"  ? "var(--ink-4)" : "var(--ink)";
  return (
    <div style={{
      padding: 12, border: "1px solid var(--line)", borderRadius: 8,
      background: "var(--surface-2)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span className="eyebrow">{label}</span>
      <span className="mono tnum" style={{ fontSize: 20, fontWeight: 500, color }}>
        {value}
      </span>
      {sub && <span className="micro">{sub}</span>}
    </div>
  );
}

Object.assign(window, {
  FactoryDetail, FactoryHeader, FactoryTabBar, FactoryOverview,
  CauseCard, MetricLine, ScoreLine, SummaryLine,
});
