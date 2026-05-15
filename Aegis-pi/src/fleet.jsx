// Fleet Overview screen — the operational landing page across all factories.

function FleetOverview({ onOpenFactory, onOpenAlerts }) {
  const [region, setRegion] = React.useState("all");
  const [view, setView] = React.useState("cards");
  const factories = window.FACTORIES.filter((f) =>
  region === "all" ? true :
  region === "APAC" ? f.region === "Asia-Pacific" :
  region === "EMEA" ? f.region === "EMEA" :
  region === "AMER" ? f.region === "Americas" : true
  );

  // Build a fleet-wide risk trajectory from a blend of all factories
  const fleetSeries = React.useMemo(() => {
    const all = window.FACTORIES.filter((f) => f.risk != null).
    map((f) => window.buildTelemetry(f).riskTrend);
    return all[0].map((_, i) => {
      const avg = all.reduce((s, a) => s + a[i], 0) / all.length;
      return Math.round(avg * 10) / 10;
    });
  }, []);

  const domainSeries = React.useMemo(() => {
    const facs = window.FACTORIES.filter((f) => f.risk != null);
    const N = 60;
    // Independent per-domain noise so the three lines tell different stories.
    const envBase = window.makeSeries(N, 78, 92, 201, 0.72);
    const infBase = window.makeSeries(N, 58, 78, 303, 0.62);
    const opBase = window.makeSeries(N, 70, 88, 407, 0.68);
    return Array.from({ length: N }).map((_, i) => ({
      environmental: envBase[i],
      infrastructure: infBase[i],
      operational: opBase[i]
    }));
  }, []);

  const counts = {
    safe: factories.filter((f) => f.status === "safe").length,
    warn: factories.filter((f) => f.status === "warn").length,
    crit: factories.filter((f) => f.status === "crit").length,
    unk: factories.filter((f) => f.status === "unk").length
  };

  // 8 most-at-risk telemetry hotspots for the heatmap
  const heatRows = React.useMemo(() => {
    return window.FACTORIES.slice(0, 6).map((f) => {
      const t = window.buildTelemetry(f);
      const norm = t.errorRate.slice(-24).map((v) => Math.min(1, v / 0.02));
      return { label: f.code, values: norm };
    });
  }, []);

  return (
    <>
      {/* ─── Page header ────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Risk Twin · Fleet</div>
          <h1 className="h1">Fleet overview</h1>
          <p className="sub" style={{ margin: "6px 0 0", maxWidth: 560 }}>
            Operational risk surface across <span className="mono tnum">{window.FACTORIES.length}</span> sites in <span className="mono tnum">3</span> regions.
            Composite scores update every 15 seconds from edge gateways.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="seg">
            {window.REGIONS.map((r) =>
            <button key={r.key}
            aria-pressed={region === r.key}
            onClick={() => setRegion(r.key)}>
                {r.label === "All regions" ? "ALL" : r.key}
                <span className="mono tnum" style={{ marginLeft: 5, color: "var(--ink-4)", fontWeight: 400 }}>{r.count}</span>
              </button>
            )}
          </div>
          <button className="btn"><Icon name="filter" size={13} />Filter</button>
          <button className="btn primary"><Icon name="plus" size={13} />Add site</button>
        </div>
      </div>

      {/* ─── KPI row ────────────────────────────────────────────── */}
      <div className="grid row5" style={{ marginBottom: 14 }}>
        {window.FLEET_KPIS.map((k) => <KPICard key={k.key} kpi={k} />)}
      </div>

      {/* ─── Fleet risk trajectory + status distribution ────────── */}
      <div className="grid split-3-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <SectionHeader
            title="Fleet risk trajectory"
            hint="composite · last 24h"
            trailing={
            <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
                  <span style={{ width: 8, height: 2, background: "var(--safe)" }} />Environmental
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
                  <span style={{ width: 8, height: 2, background: "var(--warn)" }} />Infrastructure
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
                  <span style={{ width: 8, height: 2, background: "var(--ops)" }} />Operational
                </span>
                <button className="btn ghost btn-icon" aria-label="Expand"><Icon name="expand" size={13} /></button>
              </>
            } />
          
          <div className="card-bd" style={{ paddingTop: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 6 }}>
              <div>
                <div className="eyebrow">Composite</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="num-big tnum" style={{ fontSize: "30px", width: "35px" }}>{window.__FLEET.avgRisk}</span>
                  <span className="kpi-delta down"><Icon name="arrowDown" size={11} />1.2 last 24h</span>
                </div>
              </div>
              <div className="vhr" style={{ height: 36 }} />
              <div>
                <div className="eyebrow">Domain min</div>
                <div className="num-md tnum" style={{ color: "var(--warn)" }}>62 <span className="micro" style={{ color: "var(--ink-3)" }}>infra · STG-04</span></div>
              </div>
              <div className="vhr" style={{ height: 36 }} />
              <div>
                <div className="eyebrow">Domain max</div>
                <div className="num-md tnum" style={{ color: "var(--safe)" }}>91 <span className="micro" style={{ color: "var(--ink-3)" }}>env · AUS-06</span></div>
              </div>
            </div>
            <StackedRisk data={domainSeries} height={188} />
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <SectionHeader title="Fleet status" hint="now"
          trailing={<button className="btn ghost btn-icon" aria-label="More"><Icon name="more" size={13} /></button>} />
          <div className="card-bd" style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <StatusDonut counts={counts} size={130} stroke={14} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
              { k: "safe", label: "Stable", count: counts.safe },
              { k: "warn", label: "At risk", count: counts.warn },
              { k: "crit", label: "Critical", count: counts.crit },
              { k: "unk", label: "Unknown", count: counts.unk }].
              map((row) =>
              <div key={row.k} style={{ display: "grid", gridTemplateColumns: "12px 1fr auto", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2,
                  background: row.k === "safe" ? "var(--safe)" :
                  row.k === "warn" ? "var(--warn)" :
                  row.k === "crit" ? "var(--crit)" : "var(--unk)" }} />
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{row.label}</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{row.count}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line-2)", background: "var(--surface-2)" }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Operational anomalies · last 24h</div>
            <Heatmap rows={heatRows} cols={24} size={11} gap={2} />
          </div>
        </div>
      </div>

      {/* ─── Factory grid ────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 className="h2">Sites</h2>
          <span className="micro">{factories.length} of {window.FACTORIES.length} · sorted by risk · ascending</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div className="seg">
            <button aria-pressed={view === "cards"} onClick={() => setView("cards")}>CARDS</button>
            <button aria-pressed={view === "table"} onClick={() => setView("table")}>TABLE</button>
            <button aria-pressed={view === "map"} onClick={() => setView("map")}>MAP</button>
          </div>
          <button className="btn"><Icon name="filter" size={13} />Sort</button>
        </div>
      </div>

      {view === "cards" &&
      <div className="grid row4" style={{ marginBottom: 14 }}>
          {[...factories].sort((a, b) => (a.risk ?? 200) - (b.risk ?? 200)).
        map((f) => <FactoryTile key={f.id} f={f} onOpen={onOpenFactory} />)}
        </div>
      }

      {view === "table" &&
      <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Site</th><th>Region</th><th>Status</th>
                <th style={{ textAlign: "right" }}>Risk</th>
                <th>Env</th><th>Infra</th><th>Ops</th>
                <th style={{ textAlign: "right" }}>Uptime</th>
                <th style={{ textAlign: "right" }}>Alerts</th>
                <th style={{ textAlign: "right" }}>Last sync</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...factories].sort((a, b) => (a.risk ?? 200) - (b.risk ?? 200)).map((f) =>
            <tr key={f.id} className="row-hover" onClick={() => onOpenFactory(f.id)}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 500, color: "var(--ink)" }}>{f.name}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".06em" }}>{f.code} · {f.classification}</span>
                    </div>
                  </td>
                  <td>{f.country}</td>
                  <td><StatusPill status={f.status} /></td>
                  <td style={{ textAlign: "right" }} className="mono tnum">{f.risk ?? "—"}</td>
                  <td className="mono tnum" style={{ color: "var(--ink-3)" }}>{f.sub.environmental ?? "—"}</td>
                  <td className="mono tnum" style={{ color: "var(--ink-3)" }}>{f.sub.infrastructure ?? "—"}</td>
                  <td className="mono tnum" style={{ color: "var(--ink-3)" }}>{f.sub.operational ?? "—"}</td>
                  <td style={{ textAlign: "right" }} className="mono tnum">{f.uptime ? `${f.uptime}%` : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                      {f.alerts.critical > 0 && <span style={{ color: "var(--crit)", fontWeight: 500 }} className="mono tnum">{f.alerts.critical}</span>}
                      {f.alerts.warning > 0 && <span style={{ color: "var(--warn)", fontWeight: 500 }} className="mono tnum">{f.alerts.warning}</span>}
                      {f.alerts.critical + f.alerts.warning === 0 && <span className="mono" style={{ color: "var(--ink-4)" }}>—</span>}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: "var(--ink-3)", fontSize: 11.5 }}>{f.lastSync}</td>
                  <td><Icon name="chevRight" size={14} style={{ color: "var(--ink-4)" }} /></td>
                </tr>
            )}
            </tbody>
          </table>
        </div>
      }

      {view === "map" &&
      <div className="card" style={{ marginBottom: 14 }}>
          <SectionHeader title="Geographic distribution" hint="3 regions · 8 sites"
        trailing={<button className="btn ghost btn-icon"><Icon name="expand" size={13} /></button>} />
          <div className="card-bd">
            <FleetMap factories={factories} onOpen={onOpenFactory} />
          </div>
        </div>
      }

      {/* ─── Alerts + Events ────────────────────────────────────── */}
      <div className="grid split-2-1">
        <div className="card">
          <SectionHeader
            title="Active alerts"
            hint={`${window.ALERTS.filter((a) => a.status === "open").length} open · ${window.ALERTS.filter((a) => a.status === "ack").length} acknowledged`}
            trailing={
            <>
                <div className="seg">
                  <button aria-pressed="true">ALL</button>
                  <button aria-pressed="false">CRIT</button>
                  <button aria-pressed="false">WARN</button>
                  <button aria-pressed="false">INFO</button>
                </div>
                <button className="btn ghost" style={{ paddingLeft: 8, paddingRight: 8 }}
                        onClick={onOpenAlerts}>View all <Icon name="arrowRight" size={12} /></button>
              </>
            } />
          
          <div>
            {window.ALERTS.slice(0, 6).map((a) => <AlertRow key={a.id} a={a} />)}
          </div>
        </div>

        <div className="card">
          <SectionHeader
            title="Recent events"
            hint="last 2h"
            trailing={<button className="btn ghost btn-icon"><Icon name="refresh" size={13} /></button>} />
          
          <div>
            {window.EVENTS.slice(0, 6).map((e) => <EventRow key={e.id} e={e} />)}
          </div>
        </div>
      </div>
    </>);

}

// ─── Simple fleet map (abstracted regions) ───────────────────────
function FleetMap({ factories, onOpen }) {
  // World coords roughly mapped onto a flat plate
  // long [-180,180] -> x [0, 100]
  // lat  [60, -50]   -> y [0, 100]
  const toXY = (coord) => {
    const [lng, lat] = coord;
    const x = (lng + 180) / 360 * 100;
    const y = (60 - lat) / 110 * 100;
    return [x, y];
  };
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "16/6",
      background: "var(--surface-2)", borderRadius: 8,
      overflow: "hidden",
      backgroundImage: `
        repeating-linear-gradient(0deg,  transparent 0 39px, rgba(0,0,0,.025) 39px 40px),
        repeating-linear-gradient(90deg, transparent 0 39px, rgba(0,0,0,.025) 39px 40px)
      `,
      border: "1px solid var(--line-2)"
    }}>
      {/* continent silhouettes — abstract pill shapes */}
      <svg viewBox="0 0 100 38" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55 }}>
        {/* Americas */}
        <path d="M14 10 Q 20 6 24 11 L 26 17 Q 22 22 24 27 L 20 32 Q 16 31 14 24 Z" fill="var(--line-3)" />
        {/* Europe + Africa */}
        <path d="M44 8 Q 51 7 54 12 L 56 18 Q 52 26 54 30 L 50 33 Q 46 31 45 26 L 44 18 Z" fill="var(--line-3)" />
        {/* Asia + Aus */}
        <path d="M62 8 Q 76 6 84 11 L 86 17 Q 84 21 80 22 L 70 21 Q 64 21 62 17 Z" fill="var(--line-3)" />
        <path d="M78 28 Q 84 26 86 30 L 84 33 Q 80 32 78 30 Z" fill="var(--line-3)" />
      </svg>
      {factories.map((f) => {
        const [x, y] = toXY(f.coord);
        const c = f.status === "safe" ? "var(--safe)" :
        f.status === "warn" ? "var(--warn)" :
        f.status === "crit" ? "var(--crit)" : "var(--unk)";
        return (
          <div key={f.id} onClick={() => onOpen(f.id)}
          style={{
            position: "absolute",
            left: `${x}%`, top: `${y / 38 * 100}%`, transform: "translate(-50%, -50%)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: c, boxShadow: `0 0 0 4px color-mix(in srgb, ${c} 20%, transparent), 0 0 0 1px var(--surface)`
            }} />
            <div style={{
              padding: "3px 7px", background: "var(--surface)",
              border: "1px solid var(--line)", borderRadius: 5,
              fontSize: 10.5, fontWeight: 500, color: "var(--ink)",
              boxShadow: "var(--shadow-card)",
              whiteSpace: "nowrap"
            }}>
              <span className="mono" style={{ color: "var(--ink-4)", letterSpacing: ".06em", marginRight: 5 }}>{f.code}</span>
              <span className="mono tnum">{f.risk ?? "—"}</span>
            </div>
          </div>);

      })}
      <div style={{
        position: "absolute", left: 12, bottom: 12,
        display: "flex", gap: 12, padding: "6px 10px",
        background: "var(--surface)", border: "1px solid var(--line)",
        borderRadius: 6, fontSize: 11
      }}>
        {["safe", "warn", "crit", "unk"].map((k) =>
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%",
            background: k === "safe" ? "var(--safe)" : k === "warn" ? "var(--warn)" : k === "crit" ? "var(--crit)" : "var(--unk)" }} />
            <span style={{ color: "var(--ink-3)" }}>{window.STATUS_META[k].label}</span>
          </span>
        )}
      </div>
    </div>);

}

window.FleetOverview = FleetOverview;