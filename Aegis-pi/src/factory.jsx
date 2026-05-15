// Factory Detail Overview — the operational deep-dive for a single site.

function FactoryDetail({ factoryId, onBack }) {
  const f = window.FACTORIES.find(x => x.id === factoryId) || window.FACTORIES[0];
  const t = window.buildTelemetry(f);
  const lines = window.buildLines(f);
  const assets = window.buildAssets(f);
  const factoryAlerts = window.ALERTS.filter(a => a.factory === f.code);
  const factoryEvents = window.EVENTS.filter(e => e.factory === f.code);

  const last = (arr) => arr[arr.length - 1];

  return (
    <>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto",
        gap: 22, alignItems: "center",
        marginBottom: 18, paddingBottom: 18,
        borderBottom: "1px solid var(--line)",
      }}>
        <RiskGauge value={f.risk} size={120} stroke={9} />

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="eyebrow">{f.region} · {f.country}</span>
            <span style={{ color: "var(--ink-5)" }}>·</span>
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", color: "var(--ink-4)" }}>{f.code}</span>
          </div>
          <h1 className="h1" style={{ marginBottom: 6 }}>{f.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", rowGap: 6 }}>
            <StatusPill status={f.status} />
            <span className="sub" style={{ whiteSpace: "nowrap" }}>{f.classification}</span>
            <span className="sub" style={{ whiteSpace: "nowrap" }}><span className="mono tnum">{f.assets}</span> assets · <span className="mono tnum">{f.workforce}</span> operators</span>
            <span className="sub" style={{ whiteSpace: "nowrap" }}>
              <span className="live-dot" style={{ marginRight: 6, verticalAlign: "middle" }} />
              streaming · last <span className="mono tnum">{f.lastSync}</span>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button className="btn"><Icon name="pin" size={13} />Pin</button>
          <button className="btn"><Icon name="doc" size={13} />Runbooks</button>
          <button className="btn primary"><Icon name="shield" size={13} />Acknowledge</button>
        </div>
      </div>

      {/* ─── KPI row ────────────────────────────────────────────── */}
      <div className="grid row5" style={{ marginBottom: 14 }}>
        <KPICard kpi={{
          label: "Risk Twin · composite", value: f.risk ?? "—",
          delta: -1, deltaSuffix: " vs 1h", trend: "down",
          sparkSeed: f.seed + 10, color: f.risk >= 80 ? "var(--safe)" : f.risk >= 60 ? "var(--warn)" : "var(--crit)",
        }} />
        <KPICard kpi={{
          label: "Site uptime · 30d", value: f.uptime ?? "—", unit: "%",
          delta: +0.04, deltaSuffix: "pp", trend: "up",
          sparkSeed: f.seed + 20, color: "var(--safe)",
        }} />
        <KPICard kpi={{
          label: "Throughput · live", value: f.throughput ?? "—",
          sub: f.throughputUnit, sparkSeed: f.seed + 30, color: "var(--accent)",
          delta: +12, deltaSuffix: " vs 1h", trend: "up",
        }} />
        <KPICard kpi={{
          label: "OEE · current shift", value: Math.round(last(t.oee)), unit: "%",
          delta: -1.3, deltaSuffix: "pp", trend: "down",
          sparkSeed: f.seed + 40, color: "var(--ink-3)",
        }} />
        <KPICard kpi={{
          label: "Open alerts", value: factoryAlerts.filter(a=>a.status==="open").length,
          sub: `${factoryAlerts.filter(a=>a.sev==="crit").length} critical`,
          sparkSeed: f.seed + 50, color: "var(--crit)",
        }} />
      </div>

      {/* ─── Risk Twin breakdown ────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader
          title="Risk Twin breakdown"
          hint="3 domains · live composite"
          trailing={
            <>
              <span className="micro">scoring weights env 30% · infra 40% · ops 30%</span>
              <button className="btn ghost btn-icon"><Icon name="info" size={13} /></button>
            </>
          }
        />
        <div className="card-bd" style={{ paddingTop: 14 }}>
          <div className="grid row3">
            <DomainPanel
              icon="drop" color="var(--safe)"
              title="Environmental"
              score={f.sub.environmental}
              hint="Indoor climate, air quality, exposure"
              metrics={[
                { label: "Indoor temp", value: `${last(t.tempC).toFixed(1)} °C`, status: "safe", series: t.tempC, baseline: "21.0 ± 2.0" },
                { label: "Humidity",  value: `${Math.round(last(t.humidity))}%`, status: f.code === "YKH-02" ? "warn" : "safe", series: t.humidity, baseline: "45 ± 8%" },
                { label: "PM2.5",              value: `${last(t.pm25).toFixed(1)} µg/m³`, status: f.code === "PUN-07" ? "warn" : "safe", series: t.pm25, baseline: "< 25" },
                { label: "Air exchange",  value: `${(0.6 + (f.seed % 5)/10).toFixed(1)} ACH`, status: "safe", series: window.makeSeries(48, 0.5, 0.9, f.seed + 91, 0.7), baseline: "≥ 0.5" },
              ]}
            />
            <DomainPanel
              icon="server" color="var(--warn)"
              title="Infrastructure"
              score={f.sub.infrastructure}
              hint="Power, network, controllers, edge"
              metrics={[
                { label: "Gateway latency", value: `${Math.round(last(t.netLatencyMs))} ms`, status: "safe", series: t.netLatencyMs, baseline: "< 30ms p95" },
                { label: "Power draw",     value: `${Math.round(last(t.powerKw))} kW`, status: "safe", series: t.powerKw, baseline: "2.0 ± 0.3 MW" },
                { label: "PLC CPU load",         value: `${Math.round(last(t.cpuLoad) * 100)}%`, status: last(t.cpuLoad) > 0.7 ? "warn" : "safe", series: t.cpuLoad.map(v => v*100), baseline: "< 70%" },
                { label: "Servo temp R-12",    value: f.status === "crit" ? "92 °C" : "63 °C", status: f.status === "crit" ? "crit" : "safe", series: window.makeSeries(48, 56, f.status==="crit"?94:68, f.seed + 73, 0.65), baseline: "< 75 °C" },
              ]}
            />
            <DomainPanel
              icon="activity" color="var(--ops)"
              title="Operational"
              score={f.sub.operational}
              hint="Throughput, quality, OEE drift"
              metrics={[
                { label: "Throughput", value: `${Math.round(last(t.throughput))} u/hr`, status: "safe", series: t.throughput, baseline: f.throughput + " target" },
                { label: "OEE rolling",  value: `${Math.round(last(t.oee))}%`, status: last(t.oee) < 80 ? "warn" : "safe", series: t.oee, baseline: "≥ 80%" },
                { label: "Defect rate",   value: `${(last(t.errorRate) * 100).toFixed(2)}%`, status: last(t.errorRate) > 0.012 ? "warn" : "safe", series: t.errorRate.map(v=>v*100), baseline: "< 1.0%" },
                { label: "Vibration C-3", value: `${last(t.vibration).toFixed(2)} g`, status: f.code === "MTY-05" ? "warn" : "safe", series: t.vibration, baseline: "< 1.5 g" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ─── Telemetry main + alerts ─────────────────────────────── */}
      <div className="grid split-3-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <SectionHeader
            title="Live telemetry"
            hint="environmental + infrastructure · last 24h"
            trailing={
              <>
                <div className="seg">
                  <button aria-pressed="false">TEMP</button>
                  <button aria-pressed="true">CLIMATE</button>
                  <button aria-pressed="false">POWER</button>
                  <button aria-pressed="false">NETWORK</button>
                </div>
                <button className="btn ghost btn-icon"><Icon name="expand" size={13} /></button>
              </>
            }
          />
          <div className="card-bd">
            <div className="grid row2" style={{ gap: 18 }}>
              <TeleChart icon="thermo" title="Indoor temperature" unit="°C"
                         series={t.tempC} color="var(--accent)"
                         band={{ low: 19.5, high: 23.5 }} />
              <TeleChart icon="drop" title="Relative humidity" unit="%"
                         series={t.humidity} color="var(--accent)"
                         band={{ low: 40, high: 55 }} />
              <TeleChart icon="vibe" title="Vibration · Conveyor C-3" unit=" g"
                         series={t.vibration} color="var(--accent)"
                         band={{ low: 0.6, high: 1.5 }} />
              <TeleChart icon="power" title="Mains power draw" unit=" kW"
                         series={t.powerKw} color="var(--accent)" />
            </div>
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <SectionHeader
            title="Active alerts"
            hint={`${factoryAlerts.length} open at this site`}
            trailing={<button className="btn ghost" style={{ paddingLeft: 8, paddingRight: 8 }}>View all <Icon name="arrowRight" size={12} /></button>}
          />
          <div style={{ flex: 1, minHeight: 0 }}>
            {factoryAlerts.length === 0 ? (
              <div style={{ padding: "32px 24px", textAlign: "center" }}>
                <div style={{
                  width: 36, height: 36, margin: "0 auto 10px", borderRadius: "50%",
                  background: "var(--safe-tint)", color: "var(--safe)",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Icon name="check" size={18} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>No active alerts</div>
                <div className="micro">All systems within nominal ranges.</div>
              </div>
            ) : factoryAlerts.map(a => <AlertRow key={a.id} a={a} />)}
          </div>

          <div style={{
            borderTop: "1px solid var(--line-2)", padding: "12px 16px",
            background: "var(--surface-2)",
          }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Twin actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button className="btn" style={{ width: "100%", justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Icon name="shield" size={13} />Open incident on STG-04
                </span>
                <Icon name="chevRight" size={12} />
              </button>
              <button className="btn" style={{ width: "100%", justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Icon name="doc" size={13} />Run COOLANT-RECOVER-02
                </span>
                <Icon name="chevRight" size={12} />
              </button>
              <button className="btn" style={{ width: "100%", justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Icon name="external" size={13} />Page on-call · EU-OPS
                </span>
                <Icon name="chevRight" size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Production lines + Assets ──────────────────────────── */}
      <div className="grid split-3-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <SectionHeader title="Production lines" hint={`${lines.length} lines · current shift`} />
          <table className="tbl">
            <thead>
              <tr>
                <th>Line</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Throughput</th>
                <th style={{ textAlign: "right" }}>OEE</th>
                <th style={{ textAlign: "right" }}>Uptime</th>
                <th style={{ textAlign: "right" }}>Operators</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="row-hover">
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 500, color: "var(--ink)" }}>{l.name}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".06em" }}>{l.id}</span>
                    </div>
                  </td>
                  <td><StatusPill status={l.status} /></td>
                  <td style={{ textAlign: "right" }} className="mono tnum">{l.throughput} <span style={{ color: "var(--ink-4)" }}>u/hr</span></td>
                  <td style={{ textAlign: "right" }} className="mono tnum">{l.oee}%</td>
                  <td style={{ textAlign: "right" }} className="mono tnum">{l.uptime}%</td>
                  <td style={{ textAlign: "right" }} className="mono tnum">{l.operators}</td>
                  <td><Icon name="chevRight" size={14} style={{ color: "var(--ink-4)" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <SectionHeader title="Critical assets" hint={`${assets.length} of ${f.assets} tracked`} />
          <div style={{ padding: 4 }}>
            {assets.map((a) => (
              <div key={a.id} className="list-row" style={{ padding: "11px 14px" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: a.status === "crit" ? "var(--crit-tint)"
                            : a.status === "warn" ? "var(--warn-tint)"
                            : a.status === "unk"  ? "var(--unk-tint)"
                            : "var(--safe-tint-2)",
                  color: a.status === "crit" ? "var(--crit)"
                       : a.status === "warn" ? "var(--warn)"
                       : a.status === "unk"  ? "var(--ink-4)"
                       : "var(--safe)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid var(--line-2)", flexShrink: 0,
                }}>
                  <Icon name={a.kind === "Climate" ? "drop" : a.kind === "Controller" ? "cpu" : a.kind === "Network" ? "net" : a.kind === "Power" ? "power" : a.kind === "Conveyor" ? "vibe" : "cpu"} size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 1 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                  </div>
                  <div className="micro" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.kind} · last maint {a.lastMaint} ago</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, width: 70 }}>
                  <span className="mono tnum" style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>{a.health}<span style={{ color: "var(--ink-4)" }}>/100</span></span>
                  <ScoreBar value={a.health} height={4} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Event timeline ─────────────────────────────────────── */}
      <div className="card">
        <SectionHeader
          title="Event timeline"
          hint={`${factoryEvents.length || 0} events · this site, today`}
          trailing={
            <>
              <div className="seg">
                <button aria-pressed="true">ALL</button>
                <button aria-pressed="false">INCIDENTS</button>
                <button aria-pressed="false">TELEMETRY</button>
                <button aria-pressed="false">SYSTEM</button>
              </div>
              <button className="btn ghost"><Icon name="external" size={12} /> Full timeline</button>
            </>
          }
        />
        <div>
          {factoryEvents.length > 0 ? factoryEvents.map(e => <EventRow key={e.id} e={e} />) :
            window.EVENTS.slice(0, 5).map(e => <EventRow key={e.id} e={e} />)}
        </div>
      </div>
    </>
  );
}

// ─── Domain panel (Env / Infra / Ops) ────────────────────────────
function DomainPanel({ icon, color, title, score, hint, metrics }) {
  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: 9,
      background: "var(--surface-2)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: "var(--surface)", border: "1px solid var(--line-2)",
          color, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={icon} size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
          <div className="micro" style={{ marginTop: 1 }}>{hint}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num-md tnum" style={{
            color: score >= 80 ? "var(--safe)" : score >= 60 ? "var(--warn)" : score == null ? "var(--unk)" : "var(--crit)",
          }}>{score ?? "—"}</div>
          <div className="micro">/ 100</div>
        </div>
      </div>
      <div style={{ background: "var(--surface)", padding: 8 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{
            padding: "9px 8px",
            borderBottom: i < metrics.length - 1 ? "1px solid var(--line-2)" : "0",
            display: "grid", gridTemplateColumns: "1fr auto 76px",
            gap: 12, alignItems: "center",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                                background: m.status === "crit" ? "var(--crit)" : m.status === "warn" ? "var(--warn)" : "var(--safe)" }} />
                <span style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>
              </div>
              <div className="micro" style={{ marginTop: 1, paddingLeft: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>baseline {m.baseline}</div>
            </div>
            <div className="mono tnum" style={{
              fontSize: 12.5, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap",
              color: m.status === "crit" ? "var(--crit)" : m.status === "warn" ? "var(--warn)" : "var(--ink)",
            }}>{m.value}</div>
            <Sparkline data={m.series} height={26} width={76}
                       color={m.status === "crit" ? "var(--crit)" : m.status === "warn" ? "var(--warn)" : color}
                       strokeWidth={1.4} showDot />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Telemetry pane (small line chart with header) ────────────────
function TeleChart({ icon, title, unit, series, color, band }) {
  const cur = series[series.length - 1];
  const prev = series[series.length - 13] ?? series[0];
  const delta = cur - prev;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: "var(--surface-2)", border: "1px solid var(--line-2)",
          color: "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={icon} size={13} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)" }}>{title}</div>
        <div style={{ flex: 1 }} />
        <span className={`kpi-delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`} style={{ opacity: 0.85 }}>
          <Icon name={delta > 0 ? "arrowUp" : delta < 0 ? "arrowDown" : "arrowRight"} size={10} />
          {Math.abs(delta).toFixed(1)}{unit}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span className="num-md tnum">{cur.toFixed(unit === " kW" || unit === "%" ? 0 : 1)}</span>
        <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{unit}</span>
      </div>
      <LineChart series={series} height={120} color={color} band={band} unit="" yTicks={3} xTicks={4} />
    </div>
  );
}

window.FactoryDetail = FactoryDetail;
