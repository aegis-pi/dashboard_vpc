// Alerts page — master-detail operational alerts view.

function AlertsPage({ onOpenFactory }) {
  const allAlerts = window.ALERTS;
  const [sev, setSev] = React.useState("all");
  const [status, setStatus] = React.useState("active"); // active = open + ack
  const [domain, setDomain] = React.useState("all");
  const [factory, setFactory] = React.useState("all");
  const [selectedId, setSelectedId] = React.useState(allAlerts[0].id);
  const [checked, setChecked] = React.useState({}); // {id: true}

  const filtered = React.useMemo(() => allAlerts.filter(a => {
    if (sev !== "all" && a.sev !== sev) return false;
    if (status === "active" && a.status === "resolved") return false;
    if (status === "open" && a.status !== "open") return false;
    if (status === "ack" && a.status !== "ack") return false;
    if (status === "resolved" && a.status !== "resolved") return false;
    if (domain !== "all" && a.domain !== domain) return false;
    if (factory !== "all" && a.factory !== factory) return false;
    return true;
  }), [sev, status, domain, factory]);

  // Ensure selection stays valid for current filter.
  React.useEffect(() => {
    if (filtered.length === 0) return;
    if (!filtered.find(a => a.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected = allAlerts.find(a => a.id === selectedId) || filtered[0];
  const factoryList = React.useMemo(() => {
    const seen = new Map();
    allAlerts.forEach(a => seen.set(a.factory, true));
    return Array.from(seen.keys());
  }, [allAlerts]);

  const counts = {
    open:     allAlerts.filter(a => a.status === "open").length,
    crit:     allAlerts.filter(a => a.sev === "crit" && a.status !== "resolved").length,
    warn:     allAlerts.filter(a => a.sev === "warn" && a.status !== "resolved").length,
    ack:      allAlerts.filter(a => a.status === "ack").length,
    resolved: allAlerts.filter(a => a.status === "resolved").length,
  };

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const toggleAll = () => {
    if (checkedCount > 0) setChecked({});
    else {
      const all = {};
      filtered.forEach(a => { all[a.id] = true; });
      setChecked(all);
    }
  };

  return (
    <>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Risk Twin · Operations</div>
          <h1 className="h1">Alerts</h1>
          <p className="sub" style={{ margin: "6px 0 0", maxWidth: 580 }}>
            <span className="mono tnum">{counts.open}</span> open · <span className="mono tnum">{counts.ack}</span> acknowledged · <span className="mono tnum">{counts.resolved}</span> resolved in last 24h.
            Streams update every 15 seconds from edge gateways.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn"><Icon name="download" size={13} />Export</button>
          <button className="btn"><Icon name="bell" size={13} />Subscribe</button>
          <button className="btn primary"><Icon name="plus" size={13} />New alert rule</button>
        </div>
      </div>

      {/* ─── KPI strip ──────────────────────────────────────────── */}
      <div className="grid row5" style={{ marginBottom: 14 }}>
        <KPICard kpi={{
          label: "Open alerts", value: counts.open, color: "var(--crit)",
          delta: +3, deltaSuffix: " vs 24h", trend: "up", sparkSeed: 411,
        }} />
        <KPICard kpi={{
          label: "Critical (active)", value: counts.crit, color: "var(--crit)",
          delta: +1, deltaSuffix: " vs 24h", trend: "up", sparkSeed: 412,
        }} />
        <KPICard kpi={{
          label: "Warning (active)", value: counts.warn, color: "var(--warn)",
          delta: -2, deltaSuffix: " vs 24h", trend: "down", sparkSeed: 413,
        }} />
        <KPICard kpi={{
          label: "MTTR · last 24h", value: "23", unit: "m", color: "var(--accent)",
          delta: -4, deltaSuffix: "m vs 7d", trend: "down", sparkSeed: 414,
        }} />
        <KPICard kpi={{
          label: "Ack rate · 7d", value: "84", unit: "%", color: "var(--safe)",
          delta: +2.1, deltaSuffix: "pp", trend: "up", sparkSeed: 415,
        }} />
      </div>

      {/* ─── Filter toolbar ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14, padding: "10px 14px",
                                     display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="eyebrow" style={{ marginRight: 4 }}>Severity</span>
          <div className="seg">
            <button aria-pressed={sev==="all"}  onClick={()=>setSev("all")}>ALL</button>
            <button aria-pressed={sev==="crit"} onClick={()=>setSev("crit")}>CRIT</button>
            <button aria-pressed={sev==="warn"} onClick={()=>setSev("warn")}>WARN</button>
            <button aria-pressed={sev==="info"} onClick={()=>setSev("info")}>INFO</button>
          </div>
        </div>
        <div className="vhr" style={{ height: 22 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="eyebrow" style={{ marginRight: 4 }}>Status</span>
          <div className="seg">
            <button aria-pressed={status==="active"}   onClick={()=>setStatus("active")}>ACTIVE</button>
            <button aria-pressed={status==="open"}     onClick={()=>setStatus("open")}>OPEN</button>
            <button aria-pressed={status==="ack"}      onClick={()=>setStatus("ack")}>ACK</button>
            <button aria-pressed={status==="resolved"} onClick={()=>setStatus("resolved")}>RESOLVED</button>
            <button aria-pressed={status==="all"}      onClick={()=>setStatus("all")}>ALL</button>
          </div>
        </div>
        <div className="vhr" style={{ height: 22 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="eyebrow" style={{ marginRight: 4 }}>Domain</span>
          <div className="seg">
            <button aria-pressed={domain==="all"}            onClick={()=>setDomain("all")}>ALL</button>
            <button aria-pressed={domain==="environmental"}  onClick={()=>setDomain("environmental")}>ENV</button>
            <button aria-pressed={domain==="infrastructure"} onClick={()=>setDomain("infrastructure")}>INFRA</button>
            <button aria-pressed={domain==="operational"}    onClick={()=>setDomain("operational")}>OPS</button>
          </div>
        </div>
        <div className="vhr" style={{ height: 22 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="eyebrow" style={{ marginRight: 4 }}>Site</span>
          <select className="input" value={factory} onChange={(e) => setFactory(e.target.value)}
                  style={{ minWidth: 130 }}>
            <option value="all">All sites</option>
            {factoryList.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 12 }} />
        <span className="micro" style={{ whiteSpace: "nowrap" }}>
          <span className="mono tnum">{filtered.length}</span> of <span className="mono tnum">{allAlerts.length}</span> shown
        </span>
        <button className="btn ghost" style={{ paddingLeft: 8, paddingRight: 8 }}
                onClick={() => { setSev("all"); setStatus("active"); setDomain("all"); setFactory("all"); }}>
          Clear filters
        </button>
      </div>

      {/* ─── Master + detail ────────────────────────────────────── */}
      <div className="grid split-3-2" style={{ alignItems: "start" }}>
        {/* ─── Master list ─────────────────────────────────────── */}
        <div className="card" style={{ overflow: "hidden" }}>
          {/* bulk actions header */}
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid var(--line-2)",
            background: checkedCount > 0 ? "var(--accent-tint)" : "var(--surface-2)",
            display: "flex", alignItems: "center", gap: 10,
            transition: "background .15s",
          }}>
            <input type="checkbox"
                   checked={checkedCount === filtered.length && filtered.length > 0}
                   ref={el => { if (el) el.indeterminate = checkedCount > 0 && checkedCount < filtered.length; }}
                   onChange={toggleAll}
                   style={{ accentColor: "var(--accent)" }} />
            {checkedCount > 0 ? (
              <>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>
                  <span className="mono tnum">{checkedCount}</span> selected
                </span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button className="btn"><Icon name="check" size={12} />Acknowledge</button>
                  <button className="btn"><Icon name="clock" size={12} />Snooze 1h</button>
                  <button className="btn"><Icon name="user" size={12} />Assign</button>
                  <button className="btn ghost btn-icon"><Icon name="more" size={13} /></button>
                </div>
              </>
            ) : (
              <>
                <span className="eyebrow">Alert</span>
                <span style={{ flex: 1 }} />
                <div className="seg">
                  <button aria-pressed="true">NEWEST</button>
                  <button aria-pressed="false">SEVERITY</button>
                  <button aria-pressed="false">AGE</button>
                </div>
              </>
            )}
          </div>

          <div style={{ maxHeight: 720, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{
                  width: 36, height: 36, margin: "0 auto 10px", borderRadius: "50%",
                  background: "var(--safe-tint)", color: "var(--safe)",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Icon name="check" size={18} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>No alerts match current filters</div>
                <div className="micro" style={{ marginTop: 4 }}>Adjust severity, status, or site to see more.</div>
              </div>
            ) : filtered.map(a => (
              <AlertListRow
                key={a.id} a={a}
                selected={a.id === selectedId}
                checked={!!checked[a.id]}
                onSelect={() => setSelectedId(a.id)}
                onCheck={(v) => setChecked({ ...checked, [a.id]: v })}
              />
            ))}
          </div>
        </div>

        {/* ─── Detail panel ────────────────────────────────────── */}
        <AlertDetail a={selected} onOpenFactory={onOpenFactory} />
      </div>
    </>
  );
}

// ─── List row ──────────────────────────────────────────────────────
function AlertListRow({ a, selected, checked, onSelect, onCheck }) {
  const sevColor = a.sev === "crit" ? "var(--crit)" : a.sev === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <div onClick={onSelect}
         style={{
           padding: "12px 14px",
           borderBottom: "1px solid var(--line-2)",
           cursor: "pointer",
           background: selected ? "var(--accent-tint)" : "transparent",
           borderLeft: `3px solid ${selected ? "var(--accent)" : "transparent"}`,
           transition: "background .1s",
           display: "grid", gridTemplateColumns: "18px 4px 1fr auto", gap: 10, alignItems: "center",
         }}
         onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-2)"; }}
         onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
      <input type="checkbox" checked={checked}
             onClick={e => e.stopPropagation()}
             onChange={e => onCheck(e.target.checked)}
             style={{ accentColor: "var(--accent)" }} />
      <span style={{ width: 4, height: 32, borderRadius: 2, background: sevColor }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".08em" }}>{a.id}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em",
                                          padding: "1px 5px", border: "1px solid var(--line-2)", borderRadius: 4 }}>
            {a.factory}
          </span>
          <DomainPill domain={a.domain} />
          {a.status === "ack" && (
            <span className="pill unk" style={{ padding: "1px 5px", fontSize: 9.5 }}>
              <span className="dot" />ACK · {a.owner}
            </span>
          )}
          {a.status === "resolved" && (
            <span className="pill safe" style={{ padding: "1px 5px", fontSize: 9.5 }}>
              <span className="dot" />RESOLVED
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {a.title}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{a.ts}</span>
    </div>
  );
}

const DOMAIN_META = {
  environmental:  { label: "ENV",   color: "var(--safe)" },
  infrastructure: { label: "INFRA", color: "var(--warn)" },
  operational:    { label: "OPS",   color: "var(--ops)" },
};
function DomainPill({ domain }) {
  const m = DOMAIN_META[domain] || { label: domain, color: "var(--ink-3)" };
  return (
    <span className="mono" style={{
      fontSize: 9.5, letterSpacing: ".08em", padding: "1px 5px",
      borderRadius: 4, color: m.color, border: `1px solid ${m.color}`,
      background: "transparent",
    }}>{m.label}</span>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────
function AlertDetail({ a, onOpenFactory }) {
  if (!a) return (
    <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--ink-4)" }}>
      Select an alert to view details.
    </div>
  );
  const sevColor = a.sev === "crit" ? "var(--crit)" : a.sev === "warn" ? "var(--warn)" : "var(--accent)";
  const sevTint  = a.sev === "crit" ? "var(--crit-tint)" : a.sev === "warn" ? "var(--warn-tint)" : "var(--accent-tint)";
  const series = window.makeSeries(48, a.sev === "crit" ? 78 : 40, a.sev === "crit" ? 96 : 70, a.sparkSeed || 100, 0.55);
  const activity = buildActivity(a);
  const factory = window.FACTORIES.find(f => f.code === a.factory);

  return (
    <div className="card" style={{ position: "sticky", top: 80 }}>
      {/* Sev banner */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--line-2)",
        background: sevTint,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: sevColor }} />
        <span className="mono" style={{ fontSize: 11, letterSpacing: ".1em", color: sevColor, fontWeight: 600,
                                         textTransform: "uppercase" }}>
          {a.sev === "crit" ? "Critical" : a.sev === "warn" ? "Warning" : "Info"}
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".08em", marginLeft: 4 }}>{a.id}</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost btn-icon" aria-label="More"><Icon name="more" size={13} /></button>
      </div>

      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line-2)" }}>
        <h2 className="h2" style={{ marginBottom: 8 }}>{a.title}</h2>
        <p className="sub" style={{ margin: 0 }}>{a.description}</p>
      </div>

      {/* Quick facts */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-2)",
                    display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 10, columnGap: 12 }}>
        <DetailFact label="Site" value={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".08em" }}>{a.factory}</span>
            <a onClick={() => onOpenFactory(factory.id)}
               style={{ color: "var(--accent)", fontSize: 12, cursor: "pointer" }}>
              {factory?.name?.split(" — ")[0] || a.factory}
            </a>
          </span>
        } />
        <DetailFact label="Asset" value={a.asset} mono />
        <DetailFact label="Domain" value={<DomainPill domain={a.domain} />} />
        <DetailFact label="Status" value={
          a.status === "open"
            ? <span className="pill crit" style={{ padding: "2px 6px", fontSize: 10, background: "transparent", border: "1px dashed var(--line-3)", color: "var(--ink-3)" }}>OPEN</span>
            : a.status === "ack"
              ? <span className="pill unk" style={{ padding: "2px 6px", fontSize: 10 }}>
                  <span className="dot" />ACK · {a.owner}
                </span>
              : <span className="pill safe" style={{ padding: "2px 6px", fontSize: 10 }}>
                  <span className="dot" />RESOLVED
                </span>
        } />
        <DetailFact label="Triggered" value={a.ts} />
        <DetailFact label="Duration" value={formatDuration(a.ageMin)} mono />
      </div>

      {/* Rule + sparkline */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-2)" }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Triggering rule</div>
        <div className="mono" style={{
          fontSize: 11.5, color: "var(--ink-2)", padding: "8px 10px",
          background: "var(--surface-2)", border: "1px solid var(--line-2)",
          borderRadius: 6, overflow: "auto", whiteSpace: "nowrap",
        }}>{a.rule}</div>
        <div style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Triggering metric · last 4h</div>
          <Sparkline data={series} height={56} width={400} color={sevColor} strokeWidth={1.6} showDot />
        </div>
      </div>

      {/* Activity */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-2)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Activity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {activity.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 10, position: "relative", paddingBottom: i < activity.length - 1 ? 12 : 0 }}>
              <div style={{ position: "relative", width: 12, flexShrink: 0 }}>
                <div style={{ position: "absolute", left: 4, top: 5, width: 6, height: 6, borderRadius: "50%",
                              background: e.color || "var(--ink-4)" }} />
                {i < activity.length - 1 && (
                  <div style={{ position: "absolute", left: 6.5, top: 12, bottom: -2, width: 1, background: "var(--line-2)" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 1 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{e.ts}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{e.title}</span>
                </div>
                {e.detail && <div className="micro" style={{ marginTop: 1 }}>{e.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: "14px 18px", background: "var(--surface-2)",
                    display: "flex", flexDirection: "column", gap: 8 }}>
        {a.runbook && (
          <button className="btn primary" style={{ width: "100%", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="doc" size={13} />Run runbook · {a.runbook}
            </span>
            <Icon name="arrowRight" size={12} />
          </button>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {a.status === "open" && (
            <button className="btn"><Icon name="check" size={12} />Acknowledge</button>
          )}
          {a.status === "ack" && (
            <button className="btn"><Icon name="shield" size={12} />Open incident</button>
          )}
          {a.status !== "resolved" && (
            <button className="btn"><Icon name="clock" size={12} />Snooze 1h</button>
          )}
          <button className="btn"><Icon name="user" size={12} />Reassign</button>
          <button className="btn"><Icon name="external" size={12} />Page on-call</button>
        </div>
      </div>
    </div>
  );
}

function DetailFact({ label, value, mono }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span className="eyebrow">{label}</span>
      <span className={mono ? "mono" : ""}
            style={{ fontSize: mono ? 12 : 12.5, color: "var(--ink-2)",
                     whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </span>
    </div>
  );
}

function formatDuration(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${Math.floor(h/24)}d ${h % 24}h`;
}

// Synthesize a deterministic activity log from the alert's fields.
function buildActivity(a) {
  const events = [];
  events.push({ ts: a.ts, color: a.sev === "crit" ? "var(--crit)" : a.sev === "warn" ? "var(--warn)" : "var(--accent)",
                title: `Alert triggered`,
                detail: `Rule ${a.rule} crossed threshold` });
  if (a.status === "ack" || a.status === "resolved") {
    events.push({ ts: "−" + Math.max(1, a.ageMin - 4) + "m", color: "var(--accent)",
                  title: `Acknowledged by ${a.owner || "operator"}`,
                  detail: a.runbook ? `Runbook ${a.runbook} opened` : null });
  }
  if (a.status === "ack" || a.status === "resolved") {
    events.push({ ts: "−" + Math.max(1, Math.floor(a.ageMin / 2)) + "m", color: "var(--ink-4)",
                  title: `Notified on-call · #ops-eu`,
                  detail: null });
  }
  if (a.status === "resolved") {
    events.push({ ts: "−" + Math.max(1, Math.floor(a.ageMin / 4)) + "m", color: "var(--safe)",
                  title: `Auto-resolved · metric returned within bounds`,
                  detail: null });
  }
  return events;
}

window.AlertsPage = AlertsPage;
