// ─── Fleet data ──────────────────────────────────────────────────
// Risk Twin domains: environmental · infrastructure · operational.
// Scores 0–100, higher = better. status derives from the lowest sub.

const seed = (s) => () => (s = (s * 9301 + 49297) % 233280, s / 233280);

const FACTORIES = [
  {
    id: "fac-osaka-01",
    code: "OSK-01",
    name: "Osaka — Kita Line A",
    region: "Asia-Pacific",
    country: "Japan",
    city: "Osaka, JP",
    coord: [134.7, 34.7],
    classification: "Tier-1 · Precision",
    status: "safe",
    risk: 92,
    sub: { environmental: 94, infrastructure: 91, operational: 90 },
    alerts: { critical: 0, warning: 1, info: 3 },
    uptime: 99.92, throughput: 312, throughputUnit: "u/hr",
    lastSync: "12s",
    seed: 17,
    assets: 412,
    workforce: 184,
  },
  {
    id: "fac-yokohama-02",
    code: "YKH-02",
    name: "Yokohama — Bay 3",
    region: "Asia-Pacific",
    country: "Japan",
    city: "Yokohama, JP",
    coord: [139.6, 35.4],
    classification: "Tier-1 · Assembly",
    status: "warn",
    risk: 71,
    sub: { environmental: 68, infrastructure: 84, operational: 72 },
    alerts: { critical: 0, warning: 4, info: 6 },
    uptime: 98.41, throughput: 268, throughputUnit: "u/hr",
    lastSync: "8s",
    seed: 41,
    assets: 588, workforce: 246,
  },
  {
    id: "fac-stuttgart-04",
    code: "STG-04",
    name: "Stuttgart — Hall West",
    region: "EMEA",
    country: "Germany",
    city: "Stuttgart, DE",
    coord: [9.2, 48.8],
    classification: "Tier-1 · Powertrain",
    status: "crit",
    risk: 48,
    sub: { environmental: 73, infrastructure: 42, operational: 51 },
    alerts: { critical: 2, warning: 5, info: 4 },
    uptime: 96.12, throughput: 148, throughputUnit: "u/hr",
    lastSync: "3s",
    seed: 53,
    assets: 721, workforce: 312,
  },
  {
    id: "fac-rotterdam-03",
    code: "RTM-03",
    name: "Rotterdam — Port Dock B",
    region: "EMEA",
    country: "Netherlands",
    city: "Rotterdam, NL",
    coord: [4.5, 51.9],
    classification: "Tier-2 · Logistics",
    status: "safe",
    risk: 88,
    sub: { environmental: 89, infrastructure: 87, operational: 89 },
    alerts: { critical: 0, warning: 0, info: 4 },
    uptime: 99.78, throughput: 1042, throughputUnit: "TEU/d",
    lastSync: "11s",
    seed: 72,
    assets: 233, workforce: 142,
  },
  {
    id: "fac-monterrey-05",
    code: "MTY-05",
    name: "Monterrey — Plant 2",
    region: "Americas",
    country: "Mexico",
    city: "Monterrey, MX",
    coord: [-100.3, 25.7],
    classification: "Tier-1 · Body Shop",
    status: "warn",
    risk: 76,
    sub: { environmental: 81, infrastructure: 78, operational: 70 },
    alerts: { critical: 0, warning: 3, info: 5 },
    uptime: 99.05, throughput: 196, throughputUnit: "u/hr",
    lastSync: "6s",
    seed: 88,
    assets: 504, workforce: 268,
  },
  {
    id: "fac-austin-06",
    code: "AUS-06",
    name: "Austin — Gigaline 1",
    region: "Americas",
    country: "United States",
    city: "Austin, TX",
    coord: [-97.7, 30.3],
    classification: "Tier-1 · Drive Unit",
    status: "safe",
    risk: 90,
    sub: { environmental: 91, infrastructure: 92, operational: 88 },
    alerts: { critical: 0, warning: 1, info: 2 },
    uptime: 99.86, throughput: 482, throughputUnit: "u/hr",
    lastSync: "2s",
    seed: 11,
    assets: 668, workforce: 354,
  },
  {
    id: "fac-pune-07",
    code: "PUN-07",
    name: "Pune — Foundry East",
    region: "Asia-Pacific",
    country: "India",
    city: "Pune, IN",
    coord: [73.8, 18.5],
    classification: "Tier-2 · Casting",
    status: "warn",
    risk: 67,
    sub: { environmental: 58, infrastructure: 76, operational: 68 },
    alerts: { critical: 0, warning: 6, info: 3 },
    uptime: 97.84, throughput: 92, throughputUnit: "u/hr",
    lastSync: "14s",
    seed: 33,
    assets: 318, workforce: 198,
  },
  {
    id: "fac-katowice-08",
    code: "KTW-08",
    name: "Katowice — Stamping",
    region: "EMEA",
    country: "Poland",
    city: "Katowice, PL",
    coord: [19.0, 50.3],
    classification: "Tier-2 · Stamping",
    status: "unk",
    risk: null,
    sub: { environmental: null, infrastructure: null, operational: null },
    alerts: { critical: 0, warning: 0, info: 0 },
    uptime: null, throughput: null, throughputUnit: "u/hr",
    lastSync: "4m 12s",
    seed: 22,
    assets: 286, workforce: 156,
    note: "Telemetry stream paused — scheduled gateway maintenance.",
  },
];

const STATUS_META = {
  safe: { label: "Stable",     short: "OK",   color: "var(--safe)" },
  warn: { label: "At risk",    short: "WARN", color: "var(--warn)" },
  crit: { label: "Critical",   short: "CRIT", color: "var(--crit)" },
  unk:  { label: "Unknown",    short: "—",    color: "var(--unk)" },
};

// Deterministic series gen — same seed always returns the same shape.
function makeSeries(n, low, high, seedVal, smooth = 0.55) {
  const r = seed(seedVal);
  const out = [];
  let v = (low + high) / 2;
  for (let i = 0; i < n; i++) {
    const target = low + r() * (high - low);
    v = v * smooth + target * (1 - smooth);
    out.push(v);
  }
  return out;
}

// Per-factory telemetry — used by Factory Detail and sparklines.
function buildTelemetry(factory) {
  const s = factory.seed;
  return {
    tempC:        makeSeries(48, 19, 24, s + 1, 0.7),
    humidity:     makeSeries(48, 38, 55, s + 2, 0.75),
    vibration:    makeSeries(48, 0.6, 2.1, s + 3, 0.5),
    pm25:         makeSeries(48, 8, 22, s + 4, 0.75),
    powerKw:      makeSeries(48, 1800, 2400, s + 5, 0.6),
    netLatencyMs: makeSeries(48, 8, 22, s + 6, 0.55),
    cpuLoad:      makeSeries(48, 0.32, 0.72, s + 7, 0.6),
    errorRate:    makeSeries(48, 0.001, 0.018, s + 8, 0.55),
    throughput:   makeSeries(48, 240, 340, s + 9, 0.65),
    oee:          makeSeries(48, 78, 92, s + 10, 0.7),
    riskTrend:    makeSeries(60, Math.max(20, (factory.risk ?? 70) - 14), Math.min(100, (factory.risk ?? 70) + 6), s + 11, 0.78),
  };
}

// ─── Fleet KPIs ──────────────────────────────────────────────────
const safeFactories = FACTORIES.filter(f => f.status === "safe").length;
const warnFactories = FACTORIES.filter(f => f.status === "warn").length;
const critFactories = FACTORIES.filter(f => f.status === "crit").length;
const unkFactories  = FACTORIES.filter(f => f.status === "unk").length;
const monitoredFactories = FACTORIES.length - unkFactories;
const totalCritical = FACTORIES.reduce((s, f) => s + f.alerts.critical, 0);
const totalWarning  = FACTORIES.reduce((s, f) => s + f.alerts.warning, 0);
const avgRisk = Math.round(
  FACTORIES.filter(f => f.risk != null).reduce((s, f) => s + f.risk, 0) /
    monitoredFactories
);
const avgUptime = (
  FACTORIES.filter(f => f.uptime != null).reduce((s, f) => s + f.uptime, 0) /
    monitoredFactories
).toFixed(2);

const FLEET_KPIS = [
  {
    key: "fleet-risk-index",
    label: "Fleet Risk Index",
    value: avgRisk, unit: "",
    delta: -1.2, deltaSuffix: " vs 24h", trend: "down",
    hint: "Composite Risk Twin score, fleet weighted.",
    sparkSeed: 91, color: "var(--accent)",
  },
  {
    key: "sites-active",
    label: "Sites monitored",
    value: monitoredFactories, unit: ` / ${FACTORIES.length}`,
    sub: `${unkFactories} offline`,
    hint: "Sites currently streaming telemetry.",
    sparkSeed: 13, color: "var(--ink-3)",
  },
  {
    key: "critical-events",
    label: "Critical alerts",
    value: totalCritical, unit: "",
    delta: +1, deltaSuffix: " vs 24h", trend: "up",
    hint: "Unacknowledged severity ≥ critical.",
    sparkSeed: 64, color: "var(--crit)",
  },
  {
    key: "open-warnings",
    label: "Open warnings",
    value: totalWarning, unit: "",
    delta: -2, deltaSuffix: " vs 24h", trend: "down",
    hint: "Open severity = warning.",
    sparkSeed: 28, color: "var(--warn)",
  },
  {
    key: "fleet-uptime",
    label: "Fleet uptime · 30d",
    value: avgUptime, unit: "%",
    delta: +0.08, deltaSuffix: "pp vs 30d", trend: "up",
    hint: "Time-weighted across monitored sites.",
    sparkSeed: 47, color: "var(--safe)",
  },
];

// ─── Alerts ──────────────────────────────────────────────────────
const ALERTS = [
  { id: "A-9241", sev: "crit", factory: "STG-04", title: "Coolant pressure below 1.2 bar — Line W3",
    domain: "infrastructure", ts: "2m ago", ageMin: 2, status: "open", owner: null,
    asset: "Coolant pump CP-W3", rule: "coolant.pressure < 1.5 bar for 30s",
    description: "Hydraulic coolant loop on Line W3 has dropped below the safe operating pressure. Sustained low pressure risks thermal trip on robot R-12 and cell shutdown.",
    runbook: "ROB-COOLANT-RECOVER-02", sparkSeed: 941 },

  { id: "A-9240", sev: "crit", factory: "STG-04", title: "Cell W3 emergency stop circuit open",
    domain: "operational", ts: "8m ago", ageMin: 8, status: "open", owner: null,
    asset: "Safety PLC · W3", rule: "estop.state == OPEN",
    description: "Light curtain breached and not yet reset; cell remains de-energized.",
    runbook: "SAFETY-ESTOP-RESET-01", sparkSeed: 940 },

  { id: "A-9239", sev: "crit", factory: "STG-04", title: "Robot R-12 servo temperature 92 °C — sustained 18m",
    domain: "infrastructure", ts: "14m ago", ageMin: 14, status: "ack", owner: "M. Vogel",
    asset: "ABB IRB 6700 · R-12", rule: "servo.temp > 85 °C for 10m",
    description: "Servo motor on axis 4 is running hot. Correlated with coolant pressure drop on the same line.",
    runbook: "ROB-SERVO-COOLDOWN-01", sparkSeed: 939 },

  { id: "A-9237", sev: "warn", factory: "PUN-07", title: "Exhaust scrubber filter > 84% saturated",
    domain: "environmental", ts: "22m ago", ageMin: 22, status: "open", owner: null,
    asset: "Scrubber stack S-2", rule: "scrubber.saturation > 80%",
    description: "Foundry exhaust scrubber filter approaching replacement threshold. Particulate breakthrough risk in 6–8h.",
    runbook: "HVAC-SCRUBBER-SWAP", sparkSeed: 937 },

  { id: "A-9235", sev: "warn", factory: "YKH-02", title: "Indoor humidity drift +9% over 6h",
    domain: "environmental", ts: "31m ago", ageMin: 31, status: "open", owner: null,
    asset: "HVAC zone 3", rule: "humidity.6h_drift > 8%",
    description: "Relative humidity has drifted upward outside the seasonal baseline. Air handler ramp may be required.",
    runbook: "HVAC-HUMIDITY-RECAL", sparkSeed: 935 },

  { id: "A-9234", sev: "info", factory: "AUS-06", title: "Twin model v4.2 deployed — drift detector enabled",
    domain: "operational", ts: "43m ago", ageMin: 43, status: "open", owner: null,
    asset: "Twin runtime · AUS-06", rule: "deploy.event",
    description: "New twin model rolled out across drive unit assembly. Monitor anomaly rate over next 4h shift.",
    runbook: null, sparkSeed: 934 },

  { id: "A-9232", sev: "warn", factory: "PUN-07", title: "PM2.5 exceeds shift threshold (28 µg/m³)",
    domain: "environmental", ts: "47m ago", ageMin: 47, status: "open", owner: null,
    asset: "Air sensor cluster · Bay 2", rule: "pm25 > 25 µg/m³",
    description: "Foundry casting bay airborne particulate above shift-average threshold.",
    runbook: "HVAC-PM25-MITIGATE", sparkSeed: 932 },

  { id: "A-9230", sev: "warn", factory: "MTY-05", title: "Conveyor C-3 vibration anomaly · 1.8 g rms",
    domain: "operational", ts: "1h ago", ageMin: 62, status: "ack", owner: "L. Reyes",
    asset: "Conveyor drive C-3", rule: "vibration.rms > 1.5 g for 5m",
    description: "Anomalous bearing vibration on conveyor C-3 drive unit. Likely bearing wear; predicted MTBF: 9 days.",
    runbook: "ROB-CONVEY-03", sparkSeed: 930 },

  { id: "A-9229", sev: "warn", factory: "STG-04", title: "Hydraulic oil temperature trending high",
    domain: "infrastructure", ts: "1h ago", ageMin: 64, status: "open", owner: null,
    asset: "Hydraulic skid H-2", rule: "oil.temp > 62 °C trend",
    description: "Hydraulic oil temperature rising at 0.4 °C/min. Cooler outlet flow nominal.",
    runbook: "HYD-COOLER-CHECK", sparkSeed: 929 },

  { id: "A-9228", sev: "warn", factory: "STG-04", title: "Power factor below 0.92 on Feeder-B",
    domain: "infrastructure", ts: "1h ago", ageMin: 68, status: "open", owner: null,
    asset: "MV Feeder-B", rule: "pf < 0.92",
    description: "Capacitor bank may need re-tuning. Reactive penalty risk if sustained > 4h.",
    runbook: "ELEC-PF-CORRECTION", sparkSeed: 928 },

  { id: "A-9226", sev: "warn", factory: "YKH-02", title: "QC station camera dropped frames · Line B",
    domain: "infrastructure", ts: "2h ago", ageMin: 112, status: "open", owner: null,
    asset: "QC vision cam · L-B-2", rule: "vision.frame_drop > 2%",
    description: "Frame drop rate elevated; inspection coverage at risk.",
    runbook: "QC-VISION-CALIBRATE", sparkSeed: 926 },

  { id: "A-9224", sev: "warn", factory: "YKH-02", title: "Outbound network latency p95 → 38ms",
    domain: "infrastructure", ts: "2h ago", ageMin: 124, status: "ack", owner: "H. Tanaka",
    asset: "Pi-Edge gateway 04", rule: "net.latency.p95 > 30ms",
    description: "Upstream telemetry export latency elevated. Edge buffer holding 14k events.",
    runbook: "NET-EDGE-FAILOVER", sparkSeed: 924 },

  { id: "A-9221", sev: "info", factory: "RTM-03", title: "Pi-Edge node 07 auto-restarted (41s)",
    domain: "infrastructure", ts: "3h ago", ageMin: 167, status: "resolved", owner: null,
    asset: "Pi-Edge gateway 07", rule: "service.restart",
    description: "Edge service restarted by health watchdog. No telemetry gap observed downstream.",
    runbook: null, sparkSeed: 921 },

  { id: "A-9219", sev: "info", factory: "OSK-01", title: "Predictive: bearing wear forecast in 11d",
    domain: "operational", ts: "3h ago", ageMin: 184, status: "open", owner: null,
    asset: "Spindle bearing · L-A-1", rule: "predictive.mtbf < 14d",
    description: "Twin model forecasts bearing replacement within 11 days based on vibration spectral signature.",
    runbook: "MAINT-BEARING-SWAP", sparkSeed: 919 },

  { id: "A-9215", sev: "warn", factory: "MTY-05", title: "Compressed air dew point rising",
    domain: "infrastructure", ts: "4h ago", ageMin: 251, status: "open", owner: null,
    asset: "Air dryer · A-1", rule: "dewpoint > -20 °C",
    description: "Pneumatic system dew point above spec; condensation risk in valve manifold.",
    runbook: "AIR-DRYER-REGEN", sparkSeed: 915 },

  { id: "A-9212", sev: "warn", factory: "PUN-07", title: "Furnace zone 2 thermocouple drift detected",
    domain: "infrastructure", ts: "5h ago", ageMin: 312, status: "ack", owner: "R. Patel",
    asset: "Furnace TC-Z2", rule: "thermocouple.drift > 1.5%",
    description: "Sensor drift confirmed against backup TC. Trend suggests recalibration needed.",
    runbook: "SENSOR-TC-RECAL", sparkSeed: 912 },

  { id: "A-9209", sev: "info", factory: "AUS-06", title: "Shift handover anomaly — 4 missed checks",
    domain: "operational", ts: "6h ago", ageMin: 368, status: "resolved", owner: "J. Park",
    asset: "Shift checklist L-A", rule: "handover.missed > 3",
    description: "Pre-shift inspection checklist had 4 unchecked items at handover. Closed out after walkdown.",
    runbook: null, sparkSeed: 909 },

  { id: "A-9205", sev: "info", factory: "OSK-01", title: "Twin model accuracy 94.2% — within tolerance",
    domain: "operational", ts: "8h ago", ageMin: 484, status: "resolved", owner: null,
    asset: "Twin runtime · OSK-01", rule: "model.accuracy.weekly",
    description: "Weekly twin model accuracy report.",
    runbook: null, sparkSeed: 905 },

  { id: "A-9201", sev: "warn", factory: "RTM-03", title: "Crane lift slack-line warning",
    domain: "operational", ts: "10h ago", ageMin: 612, status: "resolved", owner: "K. de Vries",
    asset: "Gantry crane G-2", rule: "tension.slack_event",
    description: "Slack-line condition detected during unload cycle. Operator notified; lift completed safely.",
    runbook: "CRANE-SLACK-INVESTIGATE", sparkSeed: 901 },

  { id: "A-9195", sev: "warn", factory: "STG-04", title: "UPS battery health 76% — replace within 30d",
    domain: "infrastructure", ts: "14h ago", ageMin: 842, status: "open", owner: null,
    asset: "UPS-2 · MCC room", rule: "ups.battery.health < 80%",
    description: "Battery health degrading. Replacement window opens 30 Apr — schedule procurement.",
    runbook: "ELEC-UPS-BATT-SWAP", sparkSeed: 895 },
];

// ─── Recent events (timeline preview) ────────────────────────────
const EVENTS = [
  { id: "E-22184", ts: "13:42", factory: "STG-04", kind: "incident", title: "Risk score → 48 (critical)", detail: "Coolant + servo correlated anomaly" },
  { id: "E-22183", ts: "13:24", factory: "PUN-07", kind: "telemetry", title: "PM2.5 threshold breach", detail: "Exhaust scrubber filter > 84% saturated" },
  { id: "E-22182", ts: "12:58", factory: "AUS-06", kind: "deploy",   title: "Twin model v4.2 deployed", detail: "Improved drift detection on Drive Unit" },
  { id: "E-22181", ts: "12:31", factory: "MTY-05", kind: "ack",      title: "Acknowledged · A-9230", detail: "L. Reyes — runbook ROB-CONVEY-03" },
  { id: "E-22180", ts: "12:14", factory: "KTW-08", kind: "system",   title: "Gateway maintenance window", detail: "Scheduled — telemetry resumes 14:00 UTC" },
  { id: "E-22179", ts: "11:47", factory: "YKH-02", kind: "telemetry",title: "Humidity drift detected", detail: "+9% over 6h vs seasonal baseline" },
  { id: "E-22177", ts: "11:02", factory: "RTM-03", kind: "system",   title: "Pi-Edge node restart", detail: "Auto-recovery completed in 41s" },
];

// ─── Regions ─────────────────────────────────────────────────────
const REGIONS = [
  { key: "all", label: "All regions", count: FACTORIES.length },
  { key: "APAC", label: "Asia-Pacific", count: FACTORIES.filter(f => f.region === "Asia-Pacific").length },
  { key: "EMEA", label: "EMEA",         count: FACTORIES.filter(f => f.region === "EMEA").length },
  { key: "AMER", label: "Americas",     count: FACTORIES.filter(f => f.region === "Americas").length },
];

// Used by factory detail to show its operational lines
function buildLines(f) {
  const r = seed(f.seed + 99);
  const status = f.status;
  const lineNames = ["Line A · Assembly", "Line B · QC", "Line C · Pack", "Line D · Calibration"];
  return lineNames.map((name, i) => {
    const drift = r();
    const localStatus = status === "crit" && i === 0 ? "crit"
                      : status === "warn" && i === 1 ? "warn"
                      : drift > 0.85 ? "warn"
                      : status === "unk" ? "unk" : "safe";
    return {
      id: `${f.code}-L${i+1}`,
      name,
      status: localStatus,
      throughput: Math.round(60 + r() * 240),
      oee: Math.round(72 + r() * 22),
      uptime: (96 + r() * 3.9).toFixed(2),
      operators: Math.round(6 + r() * 22),
    };
  });
}

// Per-factory assets list
function buildAssets(f) {
  const r = seed(f.seed + 7);
  const types = [
    { id: "ROBO-12", name: "ABB IRB 6700 · R-12",   kind: "Articulated robot" },
    { id: "HVAC-01", name: "HVAC zone 3 chiller",   kind: "Climate" },
    { id: "PLC-04",  name: "Siemens S7-1500 / PLC-4", kind: "Controller" },
    { id: "CNVY-3",  name: "Conveyor C-3 · drive",   kind: "Conveyor" },
    { id: "TRANSF",  name: "Step-down · Feeder-B",   kind: "Power" },
    { id: "GATE-7",  name: "Pi-Edge gateway 07",     kind: "Network" },
  ];
  return types.map((a, i) => ({
    ...a,
    health: Math.round(60 + r() * 38),
    status: i === 0 && f.status === "crit" ? "crit"
          : r() < 0.18 ? "warn"
          : r() < 0.04 ? "unk" : "safe",
    lastMaint: `${Math.round(2 + r() * 28)}d`,
  }));
}

Object.assign(window, {
  FACTORIES, STATUS_META, FLEET_KPIS, ALERTS, EVENTS, REGIONS,
  makeSeries, buildTelemetry, buildLines, buildAssets, seed,
  __FLEET: { safeFactories, warnFactories, critFactories, unkFactories,
             monitoredFactories, totalCritical, totalWarning, avgRisk, avgUptime },
});
