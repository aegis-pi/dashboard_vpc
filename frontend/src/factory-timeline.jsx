// Factory Detail · Timeline tab
// History 비교로 derive된 5가지 이벤트만 표시.
// 출처: TIMELINE[factory_id]. severity: info / warning / danger.

function FactoryTimeline({ f }) {
  const events = (window.TIMELINE[f.factory_id] || [])
    .slice()
    .sort((a, b) => b.ts - a.ts);

  return (
    <div className="card">
      <SectionHeader
        title="Timeline"
        hint={`HISTORY 비교 derive · ${events.length}건 · risk_drop/recovery · risk_level · pipeline · restart · workload · heartbeat · device · node · top_causes`}
      />
      <div style={{ padding: "6px 0" }}>
        {events.length === 0 ? (
          <EmptyNote text="이 공장의 derive 가능한 이벤트가 없습니다." />
        ) : events.map((e, i) => (
          <TimelineRow key={i} e={e} last={i === events.length - 1} />
        ))}
      </div>

      <div style={{
        borderTop: "1px solid var(--line-2)",
        background: "var(--surface-2)",
        padding: "12px 18px",
        display: "flex", flexWrap: "wrap", gap: 14,
        fontSize: 11.5, color: "var(--ink-3)",
        alignItems: "center",
      }}>
        <span className="mono" style={{
          fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase",
          color: "var(--ink-3)", fontWeight: 600,
        }}>derive kinds</span>
        <span style={{ width: 1, height: 12, background: "var(--line)" }} />
        {Object.entries(window.EVENT_KIND_META).map(([k, m]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "var(--ink-4)",
            }} />
            <span className="mono" style={{ color: "var(--ink-3)", fontSize: 11 }}>{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TimelineRow({ e, last }) {
  const meta = window.EVENT_KIND_META[e.kind] || { label: e.kind, icon: "events" };
  const tone =
    e.severity === "danger" ? "crit" :
    e.severity === "warn"   ? "warn" : "info";
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" : "var(--accent)";
  const sevLabel =
    e.severity === "danger" ? "danger" :
    e.severity === "warn"   ? "warning" : "info";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto",
      gap: 14, padding: "14px 18px",
      borderBottom: last ? "0" : "1px solid var(--line-2)",
      transition: "background .12s",
      cursor: "default",
    }}
    onMouseEnter={ev => { ev.currentTarget.style.background = "var(--surface-2)"; }}
    onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; }}>
      {/* Rail + dot */}
      <div style={{ position: "relative", width: 22 }}>
        <div style={{
          position: "absolute", left: 5, top: 3,
          width: 10, height: 10, borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent), 0 0 0 5px var(--surface)`,
        }} />
        {!last && (
          <div style={{
            position: "absolute", left: 9.5, top: 18, bottom: -14,
            width: 1, background: "var(--line-2)",
          }} />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{
            fontSize: 10, color: "var(--ink-3)", letterSpacing: ".06em",
            padding: "2px 6px", border: "1px solid var(--line-2)", borderRadius: 4,
            background: "var(--surface-2)", fontWeight: 500,
          }}>{e.kind}</span>
          <span className={`pill ${tone}`} style={{ padding: "2px 6px", fontSize: 9.5 }}>
            <span className="dot" />{sevLabel}
          </span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", marginBottom: 2, lineHeight: 1.35 }}>
          {e.title}
        </div>
        <div className="micro">{e.detail}</div>
      </div>

      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 2, minWidth: 80 }}>
        <span className="mono tnum" style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500 }}>
          {window.relTime(e.ts)}
        </span>
        <span className="mono tnum" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
          {window.clockHHMM(e.ts)}
        </span>
      </div>
    </div>
  );
}

window.FactoryTimeline = FactoryTimeline;
