// ─── Data contract — 3 factories, post-real-JSON revision ──────────
// factory-a reflects the actual factory_state + infra_state JSON shipped
// from physical-rpi (CPU/Memory/Disk null, network unknown, real workload
// names, restart counts, devices.{...}.{available,last_seen_at}, heartbeat).

const NOW = Date.now();
const TODAY = "2026-05-19"; // reference date for daily reports

// Risk score semantics: 100 = safest, 0 = most dangerous.
//   safe    ≥ 85
//   warning 50 ~ 84
//   danger  <  50

function seedRand(s) {
  let x = s >>> 0;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

// ─── LATEST documents ──────────────────────────────────────────────
const FACTORIES = [
  // ─── factory-a · physical-rpi · real JSON shape ───
  {
    factory_id: "factory-a",
    environment_type: "physical-rpi",
    updated_at: NOW - 6_000,
    last_factory_state_at: NOW - 2_400,
    last_infra_state_at: NOW - 8_000,
    risk: {
      score: 78,
      level: "warning",
      top_causes: [
        { name: "safe-edge-integrated-ai 누적 재시작 13회", value: 13, contribution: 12 },
        { name: "노드 사용률 메트릭 미수신",                 value: 3,  contribution: 7 },
        { name: "last_spool_write_status unknown",         value: "unknown", contribution: 3 },
      ],
    },
    dashboard: {
      display_status: "주의",
      summary: "센서·AI·노드 Ready는 정상. 그러나 AI 워크로드 누적 재시작이 13회로 누적되었고, 노드별 CPU/Memory/Disk 메트릭이 미수신.",
    },
    factory_state: {
      sensor: {
        temperature_celsius_avg: 22.845,
        humidity_percent_avg: 48.445,
        pressure_hpa_avg: 1008.37,
      },
      ai_result: {
        fire_score: 0.0,
        fall_score: 0.0,
        bend_score: 0.0,
        abnormal_sound: "none",
      },
    },
    infra_state: {
      heartbeat: {
        agent_status: "alive",
        last_spool_write_at: null,
        last_spool_write_status: "unknown",
      },
      node_summary: { total: 3, ready: 3, not_ready: 0 },
      nodes: [
        { node_id: "master",  role: "control-plane",
          ready: true,
          cpu_usage_percent: null, memory_usage_percent: null,
          disk_usage_percent: null, network_reachability: "unknown" },
        { node_id: "worker1", role: "failover-standby",
          ready: true,
          cpu_usage_percent: null, memory_usage_percent: null,
          disk_usage_percent: null, network_reachability: "unknown" },
        { node_id: "worker2", role: "sensor-ai-audio-preferred",
          ready: true,
          cpu_usage_percent: null, memory_usage_percent: null,
          disk_usage_percent: null, network_reachability: "unknown" },
      ],
      workload_summary: { total: 6, running: 6, not_running: 0 },
      workloads: [
        { namespace: "monitoring", name: "bme280-sensor",            status: "Running", ready: true, restart_count: 8,  node_id: "worker2" },
        { namespace: "monitoring", name: "influxdb",                 status: "Running", ready: true, restart_count: 0,  node_id: "worker1" },
        { namespace: "monitoring", name: "prometheus",               status: "Running", ready: true, restart_count: 4,  node_id: "worker1" },
        { namespace: "monitoring", name: "grafana",                  status: "Running", ready: true, restart_count: 0,  node_id: "master"  },
        { namespace: "ai-apps",    name: "safe-edge-integrated-ai",  status: "Running", ready: true, restart_count: 13, node_id: "worker2" },
        { namespace: "ai-apps",    name: "safe-edge-audio",          status: "Running", ready: true, restart_count: 4,  node_id: "worker2" },
      ],
      devices: {
        bme280:     { available: true, last_seen_at: NOW - 7_000 },
        camera:     { available: true, last_seen_at: NOW - 7_000 },
        microphone: { available: true, last_seen_at: NOW - 7_000 },
      },
    },
    pipeline_status: {
      status: "normal",
      latest_infra_state_age_seconds: 8,
      latest_s3_raw_age_seconds: 14,
    },
  },

  // ─── factory-b · vm-mac · real dummy JSON (2026-05-20) ───
  {
    factory_id: "factory-b",
    environment_type: "vm-mac",
    updated_at: NOW - 8_000,
    last_factory_state_at: NOW - 3_000,
    last_infra_state_at: NOW - 6_000,
    risk: {
      score: 92,
      level: "safe",
      top_causes: [
        { name: "last_spool_write_status: unknown", value: "unknown", contribution: 3 },
        { name: "sample_count = 1 (단일 표본)",   value: 1,         contribution: 3 },
        { name: "데이터 소스: dummy (vm-mac)",      value: "dummy",   contribution: 2 },
      ],
    },
    dashboard: {
      display_status: "안전",
      summary: "더미 환경 정상 운영 중. 모든 노드 Ready, 워크로드 2/2 Running, 센서·AI 정상. last_spool_write_status만 unknown 지속.",
    },
    factory_state: {
      sensor: {
        temperature_celsius_avg: 21.84,
        humidity_percent_avg: 46.49,
        pressure_hpa_avg: 1013.15,
      },
      ai_result: {
        fire_score: 0.0, fall_score: 0.0, bend_score: 0.0,
        abnormal_sound: "none",
      },
    },
    infra_state: {
      heartbeat: {
        agent_status: "alive",
        last_spool_write_at: null,
        last_spool_write_status: "unknown",
      },
      node_summary: { total: 2, ready: 2, not_ready: 0 },
      nodes: [
        { node_id: "master",  role: "control-plane", ready: true,
          cpu_usage_percent: 5.7,  memory_usage_percent: 35.64,
          disk_usage_percent: 25.12, network_reachability: "ok" },
        { node_id: "worker1", role: "worker",        ready: true,
          cpu_usage_percent: 8.68, memory_usage_percent: 36.04,
          disk_usage_percent: 23.13, network_reachability: "ok" },
      ],
      workload_summary: { total: 2, running: 2, not_running: 0 },
      workloads: [
        { namespace: "ai-apps", name: "dummy-data-generator", status: "Running", ready: true, restart_count: 0, node_id: "worker1" },
        { namespace: "ai-apps", name: "edge-iot-publisher",   status: "Running", ready: true, restart_count: 0, node_id: "worker1" },
      ],
      devices: {
        bme280:     { available: true, last_seen_at: NOW - 6_000 },
        camera:     { available: true, last_seen_at: NOW - 6_000 },
        microphone: { available: true, last_seen_at: NOW - 6_000 },
      },
    },
    pipeline_status: {
      status: "normal",
      latest_infra_state_age_seconds: 6,
      latest_s3_raw_age_seconds: 13,
    },
  },

  // ─── factory-c · vm-windows · real dummy JSON (2026-05-20) ───
  {
    factory_id: "factory-c",
    environment_type: "vm-windows",
    updated_at: NOW - 5_000,
    last_factory_state_at: NOW - 4_000,
    last_infra_state_at: NOW - 7_000,
    risk: {
      score: 89,
      level: "safe",
      top_causes: [
        { name: "직전 24h worker NotReady 1회 (복구 완료)", value: 1,         contribution: 6 },
        { name: "last_spool_write_status: unknown",          value: "unknown", contribution: 3 },
        { name: "데이터 소스: dummy (vm-windows)",            value: "dummy",   contribution: 2 },
      ],
    },
    dashboard: {
      display_status: "안전",
      summary: "현재 모든 노드 Ready, 워크로드 2/2 Running. 직전 24h 내 worker 일시 NotReady 발생 후 자동 복구.",
    },
    factory_state: {
      sensor: {
        temperature_celsius_avg: 23.91,
        humidity_percent_avg: 61.33,
        pressure_hpa_avg: 1012.09,
      },
      ai_result: {
        fire_score: 0.0, fall_score: 0.0, bend_score: 0.0,
        abnormal_sound: "none",
      },
    },
    infra_state: {
      heartbeat: {
        agent_status: "alive",
        last_spool_write_at: null,
        last_spool_write_status: "unknown",
      },
      node_summary: { total: 2, ready: 2, not_ready: 0 },
      nodes: [
        { node_id: "factory-c-master", role: "control-plane", ready: true,
          cpu_usage_percent: 7.75,  memory_usage_percent: 31.13,
          disk_usage_percent: 21.41, network_reachability: "ok" },
        { node_id: "factory-c-worker", role: "worker",        ready: true,
          cpu_usage_percent: 10.82, memory_usage_percent: 37.44,
          disk_usage_percent: 27.38, network_reachability: "ok" },
      ],
      workload_summary: { total: 2, running: 2, not_running: 0 },
      workloads: [
        { namespace: "ai-apps", name: "dummy-data-generator", status: "Running", ready: true, restart_count: 0, node_id: "factory-c-worker" },
        { namespace: "ai-apps", name: "edge-iot-publisher",   status: "Running", ready: true, restart_count: 0, node_id: "factory-c-worker" },
      ],
      devices: {
        bme280:     { available: true, last_seen_at: NOW - 7_000 },
        camera:     { available: true, last_seen_at: NOW - 7_000 },
        microphone: { available: true, last_seen_at: NOW - 7_000 },
      },
    },
    pipeline_status: {
      status: "normal",
      latest_infra_state_age_seconds: 7,
      latest_s3_raw_age_seconds: 16,
    },
  },
];

// ─── Display tone mapping ──────────────────────────────────────────
const LEVEL_META = {
  safe:    { label: "안전", tone: "safe" },
  warning: { label: "주의", tone: "warn" },
  danger:  { label: "위험", tone: "crit" },
};
const PIPELINE_META = {
  normal:   { label: "정상", tone: "safe" },
  warning:  { label: "주의", tone: "warn" },
  critical: { label: "심각", tone: "crit" },
};
const HEARTBEAT_META = {
  alive:    { label: "alive",    tone: "safe" },
  degraded: { label: "degraded", tone: "warn" },
  down:     { label: "down",     tone: "crit" },
};

// ─── History window spec ──────────────────────────────────────────
function windowSpec(w) {
  if (w === "1h")  return { n: 60, stepMs:    60_000 };
  if (w === "6h")  return { n: 72, stepMs:   300_000 };
  if (w === "12h") return { n: 72, stepMs:   600_000 };
  return                 { n: 48, stepMs: 1_800_000 };
}

function walk(n, lo, hi, target, seed, smooth = 0.78) {
  const r = seedRand(seed);
  const out = [];
  let v = (lo + hi) / 2;
  for (let i = 0; i < n; i++) {
    const pullFrac = i / (n - 1);
    const center = (lo + hi) / 2 * (1 - pullFrac) + target * pullFrac;
    const noiseRange = (hi - lo) * (1 - pullFrac * 0.5);
    const candidate = center + (r() - 0.5) * noiseRange;
    v = v * smooth + candidate * (1 - smooth);
    out.push(v);
  }
  return out;
}

function buildHistory(factory, win) {
  const { n, stepMs } = windowSpec(win);
  const t0 = NOW - n * stepMs;
  const fid = factory.factory_id;
  const baseSeed = fid === "factory-a" ? 17 : fid === "factory-b" ? 41 : 53;

  const fs = factory.factory_state;
  const ir = factory.infra_state;
  const targetScore = factory.risk.score;

  // RISK history — score semantics: 100 safest, 0 worst.
  const riskScores = walk(
    n,
    Math.max(0, targetScore - 10),
    Math.min(100, targetScore + 14),
    targetScore,
    baseSeed + 1, 0.7
  );
  const risk_history = riskScores.map((s, i) => ({
    timestamp: t0 + i * stepMs,
    risk_score: Math.max(0, Math.min(100, s)),
    risk_level: s >= 85 ? "safe" : s >= 50 ? "warning" : "danger",
    top_cause_names: factory.risk.top_causes.map(c => c.name),
  }));

  // FACTORY history — sensor + ai
  const tempEnd = fs.sensor.temperature_celsius_avg;
  const humEnd  = fs.sensor.humidity_percent_avg;
  const presEnd = fs.sensor.pressure_hpa_avg;
  const temp = walk(n, tempEnd - 4, tempEnd + 3, tempEnd, baseSeed + 2, 0.82);
  const hum  = walk(n, humEnd  - 8, humEnd  + 6, humEnd,  baseSeed + 3, 0.85);
  const pres = walk(n, presEnd - 4, presEnd + 3, presEnd, baseSeed + 4, 0.88);
  const fire = walk(n, 0, Math.max(0.08, fs.ai_result.fire_score + 0.08), fs.ai_result.fire_score, baseSeed + 5, 0.7).map(v => Math.max(0, v));
  const fall = walk(n, 0, Math.max(0.08, fs.ai_result.fall_score + 0.12), fs.ai_result.fall_score, baseSeed + 6, 0.7).map(v => Math.max(0, v));
  const bend = walk(n, 0, Math.max(0.08, fs.ai_result.bend_score + 0.10), fs.ai_result.bend_score, baseSeed + 7, 0.7).map(v => Math.max(0, v));
  const factory_history = temp.map((_, i) => ({
    timestamp: t0 + i * stepMs,
    temperature_celsius_avg: temp[i],
    humidity_percent_avg: hum[i],
    pressure_hpa_avg: pres[i],
    fire_score: fire[i],
    fall_score: fall[i],
    bend_score: bend[i],
  }));

  // INFRA history — per-node CPU/Memory/Disk series.
  // If LATEST values are all-null for a node, return null series.
  const nodes = ir.nodes;
  const node_series = nodes.map((node, ni) => {
    const allNull =
      node.cpu_usage_percent == null &&
      node.memory_usage_percent == null &&
      node.disk_usage_percent == null;
    if (allNull) {
      return {
        node_id: node.node_id,
        cpu:    Array(n).fill(null),
        memory: Array(n).fill(null),
        disk:   Array(n).fill(null),
        allNull: true,
      };
    }
    if (node.ready === false) {
      // Recently NotReady — drop trailing 30%.
      const broken = Math.floor(n * 0.7);
      const cpuMid = 60 + ni * 5;
      const memMid = 65 + ni * 4;
      const diskMid = 60 + ni * 3;
      return {
        node_id: node.node_id,
        cpu:    walk(n, cpuMid - 8,  cpuMid + 10, cpuMid,  baseSeed + 10 + ni * 3, 0.82).map((v, i) => i >= broken ? null : v),
        memory: walk(n, memMid - 6,  memMid + 8,  memMid,  baseSeed + 11 + ni * 3, 0.85).map((v, i) => i >= broken ? null : v),
        disk:   walk(n, diskMid - 4, diskMid + 2, diskMid, baseSeed + 12 + ni * 3, 0.9 ).map((v, i) => i >= broken ? null : v),
      };
    }
    return {
      node_id: node.node_id,
      cpu:    walk(n, Math.max(0, node.cpu_usage_percent    - 12), node.cpu_usage_percent    + 14, node.cpu_usage_percent,    baseSeed + 10 + ni * 3, 0.82),
      memory: walk(n, Math.max(0, node.memory_usage_percent - 8),  node.memory_usage_percent + 10, node.memory_usage_percent, baseSeed + 11 + ni * 3, 0.85),
      disk:   walk(n, Math.max(0, node.disk_usage_percent   - 3),  node.disk_usage_percent   + 4,  node.disk_usage_percent,   baseSeed + 12 + ni * 3, 0.9 ),
    };
  });

  const infra_history = Array.from({ length: n }, (_, i) => ({
    timestamp: t0 + i * stepMs,
    node_summary: ir.node_summary,
    nodes: nodes.map((nd, ni) => ({
      node_id: nd.node_id,
      cpu:    node_series[ni].cpu[i],
      memory: node_series[ni].memory[i],
      disk:   node_series[ni].disk[i],
    })),
    workload_summary: ir.workload_summary,
  }));

  return { risk: risk_history, factory: factory_history, infra: infra_history, node_series };
}

// ─── Derived timeline (expanded vocabulary) ────────────────────────
// Event kinds:
//   risk_drop          score 하락 (위험 쪽 변화)
//   risk_recovery      score 상승 (복구)
//   risk_change        risk_level 전환 (safe↔warning↔danger)
//   cause_change       top_causes 변화
//   device_off         device available true→false
//   node_down          node not_ready 증가
//   restart_inc        workload restart_count 누적
//   workload_unhealthy workload status != Running
//   heartbeat_issue    agent_status != alive, last_spool_write_status = failed/unknown
//   pipeline_change    pipeline_status 전환
const TIMELINE = {
  "factory-a": [
    { ts: NOW - 6 * 60_000,    kind: "restart_inc",       severity: "warn",
      title: "safe-edge-integrated-ai 누적 재시작 +2",
      detail: "ai-apps/safe-edge-integrated-ai · restart_count 11 → 13." },
    { ts: NOW - 24 * 60_000,   kind: "risk_drop",         severity: "warn",
      title: "안전 점수 하락 -6",
      detail: "84 → 78. 워크로드 재시작 누적이 score에 반영됨." },
    { ts: NOW - 38 * 60_000,   kind: "heartbeat_issue",   severity: "warn",
      title: "last_spool_write_status: unknown",
      detail: "edge agent heartbeat alive 유지, 그러나 last_spool_write_at null · 상태 unknown." },
    { ts: NOW - 65 * 60_000,   kind: "cause_change",      severity: "info",
      title: "top_causes 갱신",
      detail: "“노드 메트릭 미수신” 항목이 신규 진입." },
    { ts: NOW - 3 * 3600_000,  kind: "risk_recovery",     severity: "info",
      title: "안전 점수 회복 +5",
      detail: "이전 구간 79 → 84. 일시적 CPU 알람 해소 영향." },
    { ts: NOW - 5 * 3600_000,  kind: "restart_inc",       severity: "info",
      title: "prometheus 재시작 +1",
      detail: "monitoring/prometheus · restart_count 3 → 4." },
  ],
  "factory-b": [
    { ts: NOW - 45 * 60_000,   kind: "risk_recovery",     severity: "info",
      title: "안전 점수 회복 +4",
      detail: "88 → 92. 더미 환경 안정 운영 지속." },
    { ts: NOW - 2 * 3600_000,  kind: "risk_change",       severity: "info",
      title: "risk_level: warning → safe",
      detail: "안전 점수 85 이상으로 회복. AI 탐지 점수 전부 0.0." },
    { ts: NOW - 3 * 3600_000,  kind: "cause_change",      severity: "info",
      title: "top_causes 갱신",
      detail: "더미 fire_score 관련 항목이 top_causes에서 제거." },
    { ts: NOW - 6 * 3600_000,  kind: "heartbeat_issue",   severity: "info",
      title: "last_spool_write_status: unknown",
      detail: "agent_status alive 유지, spool write 기록 없음 지속." },
    { ts: NOW - 16 * 3600_000, kind: "restart_inc",       severity: "info",
      title: "직전 24h 재시작 0회",
      detail: "ai-apps/dummy-data-generator, edge-iot-publisher 모두 restart_count 0 유지." },
  ],
  "factory-c": [
    { ts: NOW - 1 * 3600_000,  kind: "risk_recovery",     severity: "info",
      title: "안전 점수 +5 회복",
      detail: "84 → 89. 모든 인프라 정상 수신 안정." },
    { ts: NOW - 3 * 3600_000,  kind: "pipeline_change",   severity: "info",
      title: "pipeline: warning → normal",
      detail: "latest_infra_state_age 정상 구간 복귀." },
    { ts: NOW - 3.5 * 3600_000,kind: "risk_change",       severity: "info",
      title: "risk_level: warning → safe",
      detail: "안전 점수 85 이상 복귀." },
    { ts: NOW - 5 * 3600_000,  kind: "node_down",         severity: "info",
      title: "factory-c-worker Ready 복귀",
      detail: "node_summary.not_ready 1 → 0. 일시 장애 자동 복구 완료." },
    { ts: NOW - 10 * 3600_000, kind: "heartbeat_issue",   severity: "info",
      title: "last_spool_write_status: unknown 지속",
      detail: "alive 유지, spool write 기록 없음." },
  ],
};

const EVENT_KIND_META = {
  risk_drop:          { label: "risk_score 하락",      icon: "arrowDown" },
  risk_recovery:      { label: "risk_score 상승",      icon: "arrowUp"   },
  risk_change:        { label: "risk_level 전환",      icon: "trend"     },
  cause_change:       { label: "top_causes 변화",      icon: "events"    },
  device_off:         { label: "device 비가용",        icon: "drop"      },
  node_down:          { label: "node not_ready",      icon: "server"    },
  restart_inc:        { label: "restart_count 증가",   icon: "refresh"   },
  workload_unhealthy: { label: "workload 비정상",      icon: "alert"     },
  heartbeat_issue:    { label: "edge heartbeat 이상", icon: "shield"    },
  pipeline_change:    { label: "pipeline 전환",        icon: "net"       },
};

// ─── Recent fleet changes (risk_level transitions) ─────────────────
const FLEET_RECENT = [
  { ts: NOW - 24 * 60_000,  factory_id: "factory-a", from: "safe",    to: "warning", score: 78 },
  { ts: NOW - 45 * 60_000,  factory_id: "factory-b", from: "warning", to: "safe",    score: 92 },
  { ts: NOW - 1 * 3600_000, factory_id: "factory-c", from: "warning", to: "safe",    score: 89 },
  { ts: NOW - 6 * 3600_000, factory_id: "factory-c", from: "safe",    to: "warning", score: 82 },
  { ts: NOW - 10 * 3600_000,factory_id: "factory-b", from: "safe",    to: "warning", score: 84 },
];

// ─── Daily reports mock ────────────────────────────────────────────
// Per FR-DASH-06, FR-DATA-07/08: 일간 보고서. Markdown body, status,
// generated_at, error if any. Indexed by factory_id × YYYY-MM-DD.

const reportMarkdownA = `# factory-a 일간 보고서 · 2026-05-19

## 1. 요약
- 운영 시간 24h 동안 **모든 노드 Ready**, 워크로드 6/6 Running.
- AI 결과: fire/fall/bend = 0.0, abnormal_sound = none.
- 워크로드 재시작이 누적 \`safe-edge-integrated-ai 13회\` 등으로 안전 점수 일부 차감.

## 2. 환경 센서 24h 평균
| 지표 | 평균 | 최소 | 최대 |
|---|---|---|---|
| 온도 | 22.7 °C | 20.4 °C | 24.1 °C |
| 습도 | 47.9 % | 44.2 % | 51.8 % |
| 기압 | 1008.4 hPa | 1006.9 hPa | 1009.2 hPa |

## 3. 워크로드 재시작 Top 3
1. \`ai-apps/safe-edge-integrated-ai\` — 13회
2. \`monitoring/bme280-sensor\` — 8회
3. \`monitoring/prometheus\` — 4회

## 4. 권장 조치
- safe-edge-integrated-ai 재시작 원인 분석: CPU 또는 메모리 압박 가능성.
- 노드 사용률 메트릭 수집 파이프라인 점검 (현재 CPU/Memory/Disk 모두 \`null\`).
- last_spool_write_status \`unknown\` 상태 — agent 측 spool 경로 확인 필요.
`;

const reportMarkdownB = `# factory-b 일간 보고서 · 2026-05-19

## 1. 요약
- vm-mac 더미 환경. 안전 점수 **92점**, 상태 안전.
- 모든 노드 Ready (master + worker1), 워크로드 2/2 Running.
- 디바이스 3종 모두 available, 환경 센서 정상 범위.

## 2. 환경 센서 스냅샷
| 지표 | 값 |
|---|---|
| 온도 | 21.84 °C |
| 습도 | 46.49 % |
| 기압 | 1013.15 hPa |

## 3. 워크로드
- \`ai-apps/dummy-data-generator\` — Running, restart 0
- \`ai-apps/edge-iot-publisher\` — Running, restart 0

## 4. 권장 조치
- last_spool_write_at이 null로 지속 — edge agent spool 디스크 경로 확인.
- sample_count가 1로 낮음 — 더미 발행 주기 또는 aggregation 윈도우 검토.
`;

const reportMarkdownC = `# factory-c 일간 보고서 · 2026-05-19

## 1. 요약
- vm-windows 더미 환경. 안전 점수 **89점**, 현재 안전.
- 직전 24h 중 factory-c-worker NotReady 일시 발생 후 자동 복구.

## 2. 환경 센서 스냅샷
| 지표 | 값 |
|---|---|
| 온도 | 23.91 °C |
| 습도 | 61.33 % |
| 기압 | 1012.09 hPa |

## 3. 주요 이벤트
- −5h — factory-c-worker Ready 복귀
- −3h — pipeline warning → normal
- −1h — 안전 점수 84 → 89 회복

## 4. 권장 조치
- factory-c-worker 재발 방지를 위한 노드 헬스체크 임계치 조정 검토.
- last_spool_write_status: unknown — spool 경로 점검.
`;

const REPORTS = {
  "factory-a": {
    [TODAY]:        { status: "ready",      generated_at: NOW - 2 * 3600_000, markdown: reportMarkdownA },
    "2026-05-18":   { status: "ready",      generated_at: NOW - 26 * 3600_000, markdown: "# factory-a 일간 보고서 · 2026-05-18\n\n- 안전 점수 평균 89점.\n- 주요 이벤트 없음.\n" },
    "2026-05-17":   { status: "ready",      generated_at: NOW - 50 * 3600_000, markdown: "# factory-a 일간 보고서 · 2026-05-17\n\n- 평온한 24h. 안전 점수 91점.\n" },
    "2026-05-16":   { status: "failed",     generated_at: NOW - 74 * 3600_000, error: "Lambda timeout · history aggregator 12s" },
    "2026-05-15":   { status: "ready",      generated_at: NOW - 98 * 3600_000, markdown: "# factory-a 일간 보고서 · 2026-05-15\n\n- 정상.\n" },
  },
  "factory-b": {
    [TODAY]:        { status: "generating", queued_at: NOW - 4 * 60_000 },
    "2026-05-18":   { status: "ready",      generated_at: NOW - 25 * 3600_000, markdown: reportMarkdownB },
    "2026-05-17":   { status: "none" },
    "2026-05-16":   { status: "ready",      generated_at: NOW - 73 * 3600_000, markdown: "# factory-b 일간 보고서 · 2026-05-16\n\n- 더미 데이터, 정상.\n" },
    "2026-05-15":   { status: "ready",      generated_at: NOW - 97 * 3600_000, markdown: "# factory-b 일간 보고서 · 2026-05-15\n\n- 더미 데이터, 정상.\n" },
  },
  "factory-c": {
    [TODAY]:        { status: "ready",      generated_at: NOW - 30 * 60_000, markdown: reportMarkdownC },
    "2026-05-18":   { status: "failed",     generated_at: NOW - 26 * 3600_000, error: "history aggregator: missing INFRA bucket for 2026-05-18" },
    "2026-05-17":   { status: "ready",      generated_at: NOW - 49 * 3600_000, markdown: "# factory-c 일간 보고서 · 2026-05-17\n\n- 안전 점수 평균 41점.\n- 야간에 risk 변동 폭 큼.\n" },
    "2026-05-16":   { status: "none" },
    "2026-05-15":   { status: "ready",      generated_at: NOW - 97 * 3600_000, markdown: "# factory-c 일간 보고서 · 2026-05-15\n\n- 더미 시나리오 정상 종료.\n" },
  },
};

const REPORT_DATES = (function makeRecentDates(centerYMD, n) {
  const [y, m, d] = centerYMD.split("-").map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(y, m - 1, d - i);
    const iso = dt.getFullYear() + "-"
              + String(dt.getMonth() + 1).padStart(2, "0") + "-"
              + String(dt.getDate()).padStart(2, "0");
    out.push(iso);
  }
  return out;
})(TODAY, 5);
const REPORT_STATUS_META = {
  ready:      { label: "준비됨",     tone: "safe" },
  generating: { label: "생성 중",    tone: "warn" },
  failed:     { label: "생성 실패",  tone: "crit" },
  none:       { label: "보고서 없음", tone: "unk"  },
};

// ─── Auth mock (Cognito stand-in) ──────────────────────────────────
// guest = 로그인 전. viewer = 조회만. admin = 조회 + 재생성/refresh.
// factory-c는 admin 전용으로 가정 (권한 없는 공장 접근 시나리오 시연용).
const RESTRICTED_FACTORIES = {
  "factory-c": ["admin"], // 이 공장은 admin만 접근 가능
};
function canAccessFactory(role, factory_id) {
  const allowed = RESTRICTED_FACTORIES[factory_id];
  if (!allowed) return true;
  return allowed.includes(role);
}

// ─── Helpers ───────────────────────────────────────────────────────
function ageSeconds(ts) {
  if (ts == null) return null;
  return Math.max(0, Math.floor((NOW - ts) / 1000));
}
function relTime(ts) {
  if (ts == null) return "—";
  const s = ageSeconds(ts);
  if (s < 60)     return `${s}초 전`;
  if (s < 3600)   return `${Math.floor(s / 60)}분 전`;
  if (s < 86400)  return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
function clockHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function clockHHMMSS(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function fleetCounts() {
  const total = FACTORIES.length;
  const byLevel = { safe: 0, warning: 0, danger: 0 };
  let stale = 0;
  for (const f of FACTORIES) {
    if (f.risk?.level) byLevel[f.risk.level]++;
    const fAge = ageSeconds(f.last_factory_state_at);
    const iAge = ageSeconds(f.last_infra_state_at);
    if ((fAge ?? 0) > 10 || (iAge ?? 0) > 40) stale++;
  }
  return { total, danger: byLevel.danger, warning: byLevel.warning, safe: byLevel.safe, stale };
}

Object.assign(window, {
  NOW, TODAY, FACTORIES,
  LEVEL_META, PIPELINE_META, HEARTBEAT_META,
  TIMELINE, EVENT_KIND_META, FLEET_RECENT,
  REPORTS, REPORT_DATES, REPORT_STATUS_META,
  RESTRICTED_FACTORIES, canAccessFactory,
  buildHistory, windowSpec,
  ageSeconds, relTime, clockHHMM, clockHHMMSS, fleetCounts,
});
