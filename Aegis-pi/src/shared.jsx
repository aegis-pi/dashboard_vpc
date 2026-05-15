// Reusable atoms — pills, KPI cards, alert rows, etc.

const StatusPill = ({ status, label }) => {
  const meta = window.STATUS_META[status];
  return (
    <span className={`pill ${status}`}>
      <span className="dot" />
      {label ?? meta.label}
    </span>
  );
};

const SevDot = ({ sev }) => {
  const c = sev === "crit" ? "var(--crit)" : sev === "warn" ? "var(--warn)" : "var(--accent)";
  return <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block" }} />;
};

// ─── KPI card ──────────────────────────────────────────────────────
function KPICard({ kpi }) {
  const series = window.makeSeries(40, 30, 90, kpi.sparkSeed, 0.65);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="eyebrow" style={{ paddingTop: 1 }}>{kpi.label}</div>
        <button className="btn ghost btn-icon" style={{ height: 22, width: 22 }} aria-label="More">
          <Icon name="more" size={13} />
        </button>
      </div>
      <div style={{ padding: "6px 16px 0", display: "flex", alignItems: "baseline", gap: 4 }}>
        <span className="kpi-num">{kpi.value}</span>
        {kpi.unit && <span className="kpi-unit">{kpi.unit}</span>}
      </div>
      <div style={{ padding: "4px 16px 10px", display: "flex", alignItems: "center", gap: 8, minHeight: 18 }}>
        {kpi.delta != null && (
          <span className={`kpi-delta ${kpi.trend === "up" ? "up" : kpi.trend === "down" ? "down" : "flat"}`}>
            <Icon name={kpi.trend === "up" ? "arrowUp" : kpi.trend === "down" ? "arrowDown" : "arrowRight"} size={11} />
            {Math.abs(kpi.delta)}{typeof kpi.delta === "number" && kpi.delta % 1 !== 0 ? "" : ""}{kpi.deltaSuffix || ""}
          </span>
        )}
        {kpi.sub && <span className="micro">{kpi.sub}</span>}
      </div>
      <div style={{ padding: "0 0 4px", marginTop: "auto" }}>
        <Sparkline data={series} height={36} color={kpi.color} strokeWidth={1.5} showDot />
      </div>
    </div>
  );
}

// ─── Factory tile (used on Fleet Overview grid) ────────────────────
function FactoryTile({ f, onOpen }) {
  const tele = window.buildTelemetry(f);
  const isUnk = f.status === "unk";
  return (
    <div className="card" onClick={() => onOpen(f.id)}
         style={{ cursor: "pointer", display: "flex", flexDirection: "column", overflow: "hidden", transition: "border-color .12s" }}
         onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ink-4)"}
         onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line)"}>
      {/* hd */}
      <div style={{ padding: "13px 14px 11px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <RiskGauge value={f.risk} size={66} stroke={6} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".08em" }}>{f.code}</span>
            <StatusPill status={f.status} />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em", color: "var(--ink)" }}>
            {f.name}
          </div>
          <div className="micro" style={{ marginTop: 2 }}>
            {f.city} · {f.classification}
          </div>
        </div>
      </div>

      {/* sub-scores */}
      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        {[
          { k: "Environmental", v: f.sub.environmental },
          { k: "Infrastructure", v: f.sub.infrastructure },
          { k: "Operational", v: f.sub.operational },
        ].map((row) => (
          <div key={row.k} style={{ display: "grid", gridTemplateColumns: "100px 1fr 28px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{row.k}</span>
            <ScoreBar value={row.v} />
            <span className="mono tnum" style={{ fontSize: 11, color: "var(--ink-2)", textAlign: "right" }}>
              {row.v == null ? "—" : row.v}
            </span>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{
        marginTop: "auto", padding: "10px 14px",
        borderTop: "1px solid var(--line-2)",
        background: "var(--surface-2)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        fontSize: 11.5, minWidth: 0,
      }}>
        {isUnk ? (
          <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Telemetry paused · {f.lastSync}</span>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, minWidth: 0, flex: 1, overflow: "hidden" }}>
              <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                <span className="mono tnum" style={{ color: "var(--ink)" }}>{f.uptime}%</span> uptime
              </span>
              <span style={{ color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span className="mono tnum" style={{ color: "var(--ink)" }}>{f.throughput}</span> {f.throughputUnit}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {(f.alerts.critical + f.alerts.warning) > 0 ? (
                <>
                  {f.alerts.critical > 0 && <SevDot sev="crit" />}
                  {f.alerts.warning > 0 && <SevDot sev="warn" />}
                  <span className="mono tnum" style={{ color: "var(--ink-2)" }}>
                    {f.alerts.critical + f.alerts.warning}
                  </span>
                </>
              ) : (
                <span className="micro" style={{ whiteSpace: "nowrap" }}>no alerts</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Alert row ─────────────────────────────────────────────────────
function AlertRow({ a, onOpen }) {
  return (
    <div className="list-row" onClick={() => onOpen && onOpen(a)}>
      <SevDot sev={a.sev} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".08em" }}>
            {a.id} · {a.factory}
          </span>
          {a.status === "ack" ? (
            <span className="pill unk" style={{ padding: "2px 5px", fontSize: 9.5 }}>
              <span className="dot" />ACK · {a.owner}
            </span>
          ) : (
            <span className="pill crit" style={{ padding: "2px 5px", fontSize: 9.5, background: "transparent", border: "1px dashed var(--line-3)", color: "var(--ink-3)" }}>
              OPEN
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {a.title}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{a.ts}</span>
    </div>
  );
}

// ─── Event row (timeline) ──────────────────────────────────────────
function EventRow({ e }) {
  const kindMeta = {
    incident:   { color: "var(--crit)",   label: "Incident" },
    telemetry:  { color: "var(--warn)",   label: "Telemetry" },
    deploy:     { color: "var(--accent)", label: "Deploy" },
    ack:        { color: "var(--safe)",   label: "Ack" },
    system:     { color: "var(--ink-4)",  label: "System" },
  }[e.kind] || { color: "var(--ink-4)", label: e.kind };
  return (
    <div className="list-row" style={{ padding: "10px 14px", alignItems: "flex-start" }}>
      <div style={{ position: "relative", width: 14, alignSelf: "stretch", flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 6, top: 5, width: 6, height: 6, borderRadius: "50%", background: kindMeta.color }} />
        <div style={{ position: "absolute", left: 8.5, top: 14, bottom: -10, width: 1, background: "var(--line-2)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{e.ts}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em", padding: "1px 5px", border: "1px solid var(--line-2)", borderRadius: 4 }}>
            {e.factory}
          </span>
          <span className="micro" style={{ color: kindMeta.color, fontWeight: 500 }}>{kindMeta.label}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{e.title}</div>
        <div className="micro" style={{ marginTop: 2 }}>{e.detail}</div>
      </div>
    </div>
  );
}

// ─── Section header for cards ──────────────────────────────────────
function SectionHeader({ title, hint, trailing }) {
  return (
    <div className="card-hd">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 className="h2">{title}</h2>
        {hint && <span className="micro">{hint}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{trailing}</div>
    </div>
  );
}

// ─── Empty placeholder for SVG slots ───────────────────────────────
function ImageSlot({ label, height = 140, code = false }) {
  return (
    <div className="svg-strip" style={{
      height, borderRadius: 8, border: "1px dashed var(--line-3)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <span className="mono" style={{
        fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase",
        color: "var(--ink-4)",
        background: "var(--surface)", padding: "4px 8px", borderRadius: 4,
        border: "1px solid var(--line-2)"
      }}>{label}</span>
    </div>
  );
}

Object.assign(window, {
  StatusPill, SevDot, KPICard, FactoryTile, AlertRow, EventRow, SectionHeader, ImageSlot
});
