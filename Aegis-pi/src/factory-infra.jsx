// Factory Detail · Infrastructure tab
// All infra_state + a 1h CPU/Memory/Disk time series per node.

const INFRA_WINDOWS = [
  { key: "1h",  label: "1H" },
  { key: "6h",  label: "6H" },
  { key: "12h", label: "12H" },
  { key: "24h", label: "24H" },
];

function FactoryInfra({ f }) {
  const ir = f.infra_state;
  const ps = f.pipeline_status;
  const dv = ir?.devices;
  const hb = ir?.heartbeat;
  const isVM = f.environment_type !== "physical-rpi";
  const [win, setWin] = React.useState("1h");

  const hist = React.useMemo(() => window.buildHistory(f, win), [f.factory_id, win]);
  const xLabels = React.useMemo(
    () => hist.infra.map(r => window.clockHHMM(r.timestamp)),
    [hist]
  );

  return (
    <>
      {/* Edge Agent Heartbeat */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader title="Edge Agent Heartbeat" hint="infra_state.heartbeat" />
        <div className="card-bd" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18, alignItems: "center",
        }}>
          <HeartbeatStat label="agent_status"
                         value={hb?.agent_status}
                         meta={window.HEARTBEAT_META} />
          <SpoolStat label="last_spool_write_status"
                     value={hb?.last_spool_write_status} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="eyebrow">last_spool_write_at</span>
            {hb?.last_spool_write_at
              ? <>
                  <span className="mono tnum" style={{ fontSize: 16, color: "var(--ink)" }}>
                    {window.relTime(hb.last_spool_write_at)}
                  </span>
                  <span className="micro mono">{new Date(hb.last_spool_write_at).toISOString()}</span>
                </>
              : <>
                  <span className="mono" style={{ fontSize: 14, color: "var(--ink-4)" }}>null</span>
                  <span className="micro">spool write 기록 없음</span>
                </>
            }
          </div>
        </div>
      </div>

      {/* Pipeline status */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader title="Pipeline" hint="latest age vs LATEST 수신 시각" />
        <div className="card-bd" style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 24, alignItems: "center" }}>
          <PipelineBadge status={ps?.status} />
          <PipelineAge label="latest_infra_state_age"
                       seconds={ps?.latest_infra_state_age_seconds}
                       warn={40} crit={60} />
          <PipelineAge label="latest_s3_raw_age"
                       seconds={ps?.latest_s3_raw_age_seconds}
                       warn={60} crit={120} />
        </div>
      </div>

      {/* Nodes — current */}
      <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
        <SectionHeader
          title="Nodes"
          hint={ir ? `infra_state.nodes · ${ir.nodes.length}개 · ${ir.node_summary.ready}/${ir.node_summary.total} Ready` : "미수신"}
        />
        {!ir ? <EmptyNote text="infra_state 미수신." /> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>node_id</th>
                <th>role</th>
                <th>Ready</th>
                <th style={{ textAlign: "right" }}>CPU%</th>
                <th style={{ textAlign: "right" }}>Memory%</th>
                <th style={{ textAlign: "right" }}>Disk%</th>
                <th>network</th>
              </tr>
            </thead>
            <tbody>
              {ir.nodes.map(n => (
                <tr key={n.node_id}>
                  <td>
                    <span className="mono" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>
                      {n.node_id}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{
                      fontSize: 10.5, color: "var(--ink-3)",
                      padding: "2px 6px", border: "1px solid var(--line-2)",
                      borderRadius: 4, background: "var(--surface-2)",
                    }}>{n.role}</span>
                  </td>
                  <td>
                    <span className={`pill ${n.ready ? "safe" : "crit"}`} style={{ padding: "3px 6px", fontSize: 10.5 }}>
                      <span className="dot" />
                      {n.ready ? "Ready" : "NotReady"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <UsageCell value={n.cpu_usage_percent} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <UsageCell value={n.memory_usage_percent} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <UsageCell value={n.disk_usage_percent} />
                  </td>
                  <td>
                    <NetReach value={n.network_reachability} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Per-node time series — CPU / Memory / Disk */}
      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader
          title="노드 사용률 추이"
          hint={`HISTORY#INFRA · ${win} · node별 시리즈`}
          trailing={
            <div className="seg">
              {INFRA_WINDOWS.map(w => (
                <button key={w.key} aria-pressed={win === w.key}
                        onClick={() => setWin(w.key)}>{w.label}</button>
              ))}
            </div>
          }
        />
        <div className="card-bd">
          {!ir || ir.nodes.length === 0 ? <EmptyNote /> : (
            <div className="grid row3" style={{ gap: 14 }}>
              <NodeMetricPanel
                title="CPU%"
                nodes={ir.nodes}
                series={hist.node_series.map(s => s.cpu)}
                xLabels={xLabels}
              />
              <NodeMetricPanel
                title="Memory%"
                nodes={ir.nodes}
                series={hist.node_series.map(s => s.memory)}
                xLabels={xLabels}
              />
              <NodeMetricPanel
                title="Disk%"
                nodes={ir.nodes}
                series={hist.node_series.map(s => s.disk)}
                xLabels={xLabels}
              />
            </div>
          )}
        </div>
      </div>

      {/* Workloads */}
      <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
        <SectionHeader
          title="Workloads"
          hint={ir ? `${ir.workload_summary.running}/${ir.workload_summary.total} Running` : "미수신"}
          trailing={(() => {
            if (!ir) return null;
            const hot = ir.workloads.filter(w => (w.restart_count ?? 0) >= 5).length;
            return hot > 0 ? (
              <span className="pill warn" style={{ padding: "3px 6px", fontSize: 10.5 }}>
                <span className="dot" />restart ≥ 5 · {hot}
              </span>
            ) : null;
          })()}
        />
        {!ir ? <EmptyNote text="infra_state 미수신." /> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>namespace</th>
                <th>name</th>
                <th>status</th>
                <th>ready</th>
                <th style={{ textAlign: "right" }}>restart_count</th>
                <th>node_id</th>
              </tr>
            </thead>
            <tbody>
              {ir.workloads.map((w, i) => {
                const hot = (w.restart_count ?? 0) >= 5;
                return (
                  <tr key={i} style={hot ? { background: "var(--warn-tint-2)" } : null}>
                    <td>
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {w.namespace}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{w.name}</span>
                    </td>
                    <td><WorkloadStatus status={w.status} /></td>
                    <td>
                      <span style={{
                        fontSize: 11.5,
                        color: w.ready ? "var(--safe)" : "var(--crit)",
                        fontWeight: 500,
                      }}>{w.ready ? "true" : "false"}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <RestartCount value={w.restart_count} />
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {w.node_id ?? <span style={{ color: "var(--ink-4)" }}>—</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Devices */}
      <div className="card">
        <SectionHeader
          title="Devices"
          hint="devices · available + last_seen_at"
        />
        <div className="card-bd">
          {!dv ? <EmptyNote text="devices 미수신." /> : (
            <div className="grid row3" style={{ gap: 10 }}>
              <DeviceChip label="BME280"     device={dv.bme280}     naWhenEnv={isVM} />
              <DeviceChip label="Camera"     device={dv.camera}     naWhenEnv={isVM} />
              <DeviceChip label="Microphone" device={dv.microphone} naWhenEnv={isVM} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────
function UsageCell({ value }) {
  if (value == null) {
    return <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>미수신</span>;
  }
  const tone = value >= 85 ? "crit" : value >= 70 ? "warn" : "ink";
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" : "var(--ink-2)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 50, height: 5, borderRadius: 3,
        background: "var(--line-2)", overflow: "hidden",
      }}>
        <div style={{ height: "100%", width: `${value}%`, background: color }} />
      </div>
      <span className="mono tnum" style={{ fontSize: 12, color, minWidth: 28, textAlign: "right" }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

function NetReach({ value }) {
  if (value == null) return <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>미수신</span>;
  if (value === "unknown") {
    return (
      <span className="pill unk" style={{ padding: "3px 6px", fontSize: 10.5 }}>
        <span className="dot" />unknown
      </span>
    );
  }
  const ok = value === "reachable" || value === "ok";
  return (
    <span className={`pill ${ok ? "safe" : "crit"}`} style={{ padding: "3px 6px", fontSize: 10.5 }}>
      <span className="dot" />{value}
    </span>
  );
}

function WorkloadStatus({ status }) {
  const tone =
    status === "Running" ? "safe" :
    status === "Pending" ? "warn" : "crit";
  return (
    <span className={`pill ${tone}`} style={{ padding: "3px 6px", fontSize: 10.5 }}>
      <span className="dot" />{status}
    </span>
  );
}

function PipelineAge({ label, seconds, warn, crit }) {
  const tone =
    seconds == null ? "unk" :
    seconds >= crit ? "crit" :
    seconds >= warn ? "warn" : "safe";
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" :
    tone === "safe" ? "var(--safe)" : "var(--ink-4)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="mono tnum" style={{ fontSize: 22, color, fontWeight: 500 }}>
          {seconds == null ? "—" : seconds}
        </span>
        <span className="micro">초</span>
        <span className="micro" style={{ marginLeft: "auto" }}>
          warn ≥ {warn}s · crit ≥ {crit}s
        </span>
      </div>
    </div>
  );
}

function NodeMetricPanel({ title, nodes, series, xLabels }) {
  // Check whether every node has all-null data → show 미수신 panel.
  const allMissing = series.every(s =>
    !s || s.length === 0 || s.every(v => v == null || isNaN(v))
  );
  const palette = ["var(--accent)", "oklch(0.6 0.15 30)", "oklch(0.55 0.12 280)"];
  const seriesArr = nodes.map((n, i) => ({
    name: n.node_id,
    color: palette[i % palette.length],
    data: series[i] || [],
  }));
  return (
    <div style={{
      padding: 12, border: "1px solid var(--line)", borderRadius: 9,
      background: "var(--surface-2)",
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", marginBottom: 6 }}>
        {title}
      </div>
      {allMissing ? (
        <div style={{
          height: 140, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px dashed var(--line-3)", borderRadius: 7,
          background: "var(--surface)",
        }}>
          <span className="mono" style={{
            fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".08em", textTransform: "uppercase",
          }}>노드 사용률 미수신</span>
        </div>
      ) : (
        <MultiLine
          series={seriesArr} xLabels={xLabels}
          yMin={0} yMax={100} yUnit=""
          height={140} yTicks={3} legend={true}
        />
      )}
    </div>
  );
}

// ─── Heartbeat / spool helpers ───────────────────────────────────
function HeartbeatStat({ label, value, meta }) {
  const m = value && meta[value];
  const color = !m ? "var(--ink-4)"
    : m.tone === "safe" ? "var(--safe)"
    : m.tone === "warn" ? "var(--warn)"
    : "var(--crit)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 9, height: 9, borderRadius: "50%", background: color,
          boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 20%, transparent)`,
        }} />
        <span className="mono" style={{ fontSize: 16, color: "var(--ink)", fontWeight: 500 }}>
          {value ?? "—"}
        </span>
      </div>
      <span className="micro">edge agent 상태</span>
    </div>
  );
}

function SpoolStat({ label, value }) {
  const tone =
    value === "success" ? "safe" :
    value === "failed"  ? "crit" :
    value === "unknown" ? "warn" : "unk";
  const color =
    tone === "safe" ? "var(--safe)" :
    tone === "warn" ? "var(--warn)" :
    tone === "crit" ? "var(--crit)" : "var(--ink-4)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 9, height: 9, borderRadius: "50%", background: color,
        }} />
        <span className="mono" style={{ fontSize: 16, color: "var(--ink)", fontWeight: 500 }}>
          {value ?? "—"}
        </span>
      </div>
      <span className="micro">spool write 마지막 시도 결과</span>
    </div>
  );
}

// ─── Restart count with hot highlight ────────────────────────────
function RestartCount({ value }) {
  if (value == null) return <span style={{ color: "var(--ink-4)", fontSize: 11.5 }}>—</span>;
  const tone = value >= 10 ? "crit" : value >= 5 ? "warn" : value > 0 ? "ink" : "mute";
  const color =
    tone === "crit" ? "var(--crit)" :
    tone === "warn" ? "var(--warn)" :
    tone === "ink"  ? "var(--ink-2)" : "var(--ink-4)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      {value >= 5 && (
        <span className="mono" style={{
          fontSize: 10, color, letterSpacing: ".08em",
          padding: "1px 5px", border: `1px solid ${color}`, borderRadius: 4,
          background: "transparent",
        }}>HOT</span>
      )}
      <span className="mono tnum" style={{
        fontSize: 12.5, color, fontWeight: value > 0 ? 500 : 400,
      }}>{value}</span>
    </div>
  );
}

window.FactoryInfra = FactoryInfra;
