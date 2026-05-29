// ─── Mock data for the Aegis-π Risk Twin prototype ──────────────────────
// Mirrors the shapes in api/types.ts so the prototype renders identically
// to the live app, but with no backend.

const NOW = Date.now()
const iso = (msAgo) => new Date(NOW - msAgo).toISOString()

// Generate a smooth-ish risk-score history series ending near `end`.
function genHistory(points, end, volatility = 6, floor = 0, ceil = 100) {
  const out = []
  let v = end + (Math.random() * 2 - 1) * volatility * 3
  for (let i = points - 1; i >= 0; i--) {
    v += (Math.random() * 2 - 1) * volatility
    // pull gently toward `end` as we approach the present
    v += (end - v) * (0.04 + (points - i) / points * 0.05)
    v = Math.max(floor, Math.min(ceil, v))
    out.push({
      timestamp: iso(i * 30 * 1000), // 30s spacing
      risk_score: Math.round(v),
      risk_level: v >= 85 ? 'safe' : v >= 50 ? 'warning' : 'danger',
      temperature_celsius_avg: +(22 + Math.sin(i / 6) * 3 + Math.random()).toFixed(1),
      humidity_percent_avg: +(45 + Math.cos(i / 8) * 8 + Math.random() * 2).toFixed(1),
      pressure_hpa_avg: +(1013 + Math.sin(i / 10) * 2).toFixed(1),
      fire_score: +Math.max(0, Math.min(1, 0.1 + Math.random() * 0.15)).toFixed(2),
      fall_score: +Math.max(0, Math.min(1, 0.05 + Math.random() * 0.1)).toFixed(2),
      bend_score: +Math.max(0, Math.min(1, 0.05 + Math.random() * 0.12)).toFixed(2),
      nodes: [
        { node_id: 'edge-cp-1', cpu_usage_percent: 40 + Math.random() * 30, memory_usage_percent: 50 + Math.random() * 25, disk_usage_percent: 60 + Math.random() * 8 },
        { node_id: 'edge-wk-1', cpu_usage_percent: 30 + Math.random() * 35, memory_usage_percent: 45 + Math.random() * 30, disk_usage_percent: 55 + Math.random() * 10 },
      ],
    })
  }
  return out
}

const FACTORIES = [
  {
    factory_id: 'SEOUL-A1',
    environment_type: 'ASSEMBLY',
    risk: { score: 92, level: 'safe', top_causes: [] },
    score: 92, level: 'safe',
    nodeReady: 4, nodeTotal: 4,
    pipeline: 'normal',
    updated_at: iso(4 * 1000),
    last_factory_state_at: iso(3 * 1000),
    last_infra_state_at: iso(18 * 1000),
    summary: '모든 지표 정상 범위. 인프라·센서·AI 탐지 안정.',
    top_causes: [],
    devices: { bme280: { available: true, last_seen_at: iso(5000) }, camera: { available: true, last_seen_at: iso(6000) }, microphone: { available: true, last_seen_at: iso(7000) } },
    workload: { total: 12, running: 12, unhealthy: 0 },
  },
  {
    factory_id: 'BUSAN-B2',
    environment_type: 'WELDING',
    risk: { score: 67, level: 'warning' },
    score: 67, level: 'warning',
    nodeReady: 3, nodeTotal: 4,
    pipeline: 'warning',
    updated_at: iso(6 * 1000),
    last_factory_state_at: iso(5 * 1000),
    last_infra_state_at: iso(22 * 1000),
    summary: '습도 상승 및 노드 1대 NotReady. 환경 지표 모니터링 권장.',
    top_causes: [
      { field: 'humidity_percent', value: 71.2, contribution: 14 },
      { field: 'node_not_ready', value: 1, contribution: 11 },
      { field: 'fire_score', value: 0.34, contribution: 8 },
    ],
    devices: { bme280: { available: true, last_seen_at: iso(8000) }, camera: { available: false, last_seen_at: iso(180000) }, microphone: { available: true, last_seen_at: iso(9000) } },
    workload: { total: 14, running: 13, unhealthy: 1 },
  },
  {
    factory_id: 'INCHEON-C3',
    environment_type: 'CHEMICAL',
    risk: { score: 38, level: 'danger' },
    score: 38, level: 'danger',
    nodeReady: 2, nodeTotal: 4,
    pipeline: 'critical',
    updated_at: iso(8 * 1000),
    last_factory_state_at: iso(7 * 1000),
    last_infra_state_at: iso(72 * 1000),
    summary: '화재 탐지 점수 급등 및 노드 2대 다운. 즉시 점검 필요.',
    top_causes: [
      { field: 'fire_score', value: 0.86, contribution: 28 },
      { field: 'node_not_ready', value: 2, contribution: 19 },
      { field: 'temperature_celsius', value: 38.4, contribution: 12 },
    ],
    devices: { bme280: { available: true, last_seen_at: iso(11000) }, camera: { available: true, last_seen_at: iso(12000) }, microphone: { available: false, last_seen_at: iso(240000) } },
    workload: { total: 16, running: 11, unhealthy: 5 },
  },
  {
    factory_id: 'DAEGU-D4',
    environment_type: 'PACKAGING',
    risk: { score: 88, level: 'safe' },
    score: 88, level: 'safe',
    nodeReady: 3, nodeTotal: 3,
    pipeline: 'normal',
    updated_at: iso(5 * 1000),
    last_factory_state_at: iso(4 * 1000),
    last_infra_state_at: iso(16 * 1000),
    summary: '정상 가동. 일부 워크로드 재시작 이력 존재.',
    top_causes: [
      { field: 'workload_restart', value: 6, contribution: 5 },
    ],
    devices: { bme280: { available: true, last_seen_at: iso(5000) }, camera: { available: true, last_seen_at: iso(6000) }, microphone: { available: true, last_seen_at: iso(5500) } },
    workload: { total: 10, running: 10, unhealthy: 0 },
  },
  {
    factory_id: 'GWANGJU-E5',
    environment_type: 'PAINTING',
    risk: { score: 73, level: 'warning' },
    score: 73, level: 'warning',
    nodeReady: 4, nodeTotal: 4,
    pipeline: 'normal',
    updated_at: iso(7 * 1000),
    last_factory_state_at: iso(6 * 1000),
    last_infra_state_at: iso(20 * 1000),
    summary: '굽힘 탐지 점수 경계 수준. CPU 사용률 상승 추세.',
    top_causes: [
      { field: 'bend_score', value: 0.41, contribution: 12 },
      { field: 'cpu_usage', value: 82, contribution: 9 },
    ],
    devices: { bme280: { available: true, last_seen_at: iso(7000) }, camera: { available: true, last_seen_at: iso(8000) }, microphone: { available: true, last_seen_at: iso(6500) } },
    workload: { total: 11, running: 11, unhealthy: 0 },
  },
  {
    factory_id: 'ULSAN-F6',
    environment_type: 'FOUNDRY',
    risk: { score: 44, level: 'danger' },
    score: 44, level: 'danger',
    nodeReady: 3, nodeTotal: 5,
    pipeline: 'warning',
    updated_at: iso(9 * 1000),
    last_factory_state_at: iso(8 * 1000),
    last_infra_state_at: iso(48 * 1000),
    summary: '고온 환경 및 넘어짐 탐지 발생. 디스크 사용률 임계 접근.',
    top_causes: [
      { field: 'temperature_celsius', value: 41.7, contribution: 22 },
      { field: 'fall_score', value: 0.63, contribution: 17 },
      { field: 'disk_usage', value: 91, contribution: 10 },
    ],
    devices: { bme280: { available: true, last_seen_at: iso(10000) }, camera: { available: true, last_seen_at: iso(11000) }, microphone: { available: true, last_seen_at: iso(9500) } },
    workload: { total: 18, running: 16, unhealthy: 2 },
  },
]

// History windows keyed by factory_id + window
const HISTORY = {}
const PTS = { '10m': 20, '1h': 60, '6h': 72, '12h': 72, '24h': 96 }
FACTORIES.forEach((f) => {
  HISTORY[f.factory_id] = {}
  Object.entries(PTS).forEach(([win, n]) => {
    HISTORY[f.factory_id][win] = genHistory(n, f.score)
  })
})

// Recent fleet changes (worsening + recovery transitions)
const RECENT_CHANGES = [
  { factory_id: 'INCHEON-C3', from: 'warning', to: 'danger', score: 38, ts: NOW - 4 * 60000, top_cause_names: ['fire_score', 'node_not_ready', 'temperature_celsius'] },
  { factory_id: 'ULSAN-F6', from: 'warning', to: 'danger', score: 44, ts: NOW - 12 * 60000, top_cause_names: ['temperature_celsius', 'fall_score'] },
  { factory_id: 'BUSAN-B2', from: 'safe', to: 'warning', score: 67, ts: NOW - 23 * 60000, top_cause_names: ['humidity_percent', 'node_not_ready'] },
  { factory_id: 'GWANGJU-E5', from: 'safe', to: 'warning', score: 73, ts: NOW - 41 * 60000, top_cause_names: ['bend_score', 'cpu_usage'] },
  { factory_id: 'DAEGU-D4', from: 'warning', to: 'safe', score: 88, ts: NOW - 52 * 60000, top_cause_names: [] },
]

// Node detail rows for the Infrastructure tab
function nodesFor(f) {
  const base = [
    { node_id: 'edge-cp-1', role: 'control-plane', ready: true, cpu_usage_percent: 52, memory_usage_percent: 61, disk_usage_percent: 64, network_reachability: 'reachable' },
    { node_id: 'edge-wk-1', role: 'worker', ready: true, cpu_usage_percent: 47, memory_usage_percent: 55, disk_usage_percent: 58, network_reachability: 'reachable' },
    { node_id: 'edge-wk-2', role: 'worker', ready: true, cpu_usage_percent: 71, memory_usage_percent: 73, disk_usage_percent: 80, network_reachability: 'reachable' },
    { node_id: 'edge-wk-3', role: 'worker', ready: true, cpu_usage_percent: 38, memory_usage_percent: 49, disk_usage_percent: 52, network_reachability: 'reachable' },
    { node_id: 'edge-wk-4', role: 'worker', ready: true, cpu_usage_percent: 44, memory_usage_percent: 51, disk_usage_percent: 55, network_reachability: 'reachable' },
  ].slice(0, f.nodeTotal)
  // mark some not-ready to match nodeReady
  for (let i = f.nodeReady; i < base.length; i++) {
    base[i].ready = false
    base[i].network_reachability = 'unknown'
    base[i].cpu_usage_percent = null
    base[i].memory_usage_percent = null
    base[i].disk_usage_percent = null
  }
  // bump danger factories hot
  if (f.level === 'danger') { base[0].cpu_usage_percent = 88; base[0].disk_usage_percent = 91 }
  return base
}

function workloadsFor(f) {
  const rows = [
    { namespace: 'aegis', name: 'risk-engine', status: 'Running', ready: true, node_id: 'edge-cp-1', restart_count: 0 },
    { namespace: 'aegis', name: 'data-processor', status: 'Running', ready: true, node_id: 'edge-wk-1', restart_count: 1 },
    { namespace: 'aegis', name: 'ai-inference', status: f.level === 'danger' ? 'CrashLoopBackOff' : 'Running', ready: f.level !== 'danger', node_id: 'edge-wk-2', restart_count: f.level === 'danger' ? 12 : 2 },
    { namespace: 'kube-system', name: 'metrics-server', status: 'Running', ready: true, node_id: 'edge-cp-1', restart_count: 0 },
    { namespace: 'aegis', name: 'spool-uploader', status: f.level === 'warning' ? 'Pending' : 'Running', ready: f.level !== 'warning', node_id: 'edge-wk-1', restart_count: f.level === 'warning' ? 6 : 0 },
  ]
  return rows
}

const SAMPLE_REPORT = `# ULSAN-F6 일간 안전 보고서

**보고 일자**: 어제 · **환경 유형**: FOUNDRY · **종합 등급**: 위험

## 요약

지난 24시간 동안 ULSAN-F6 공장은 **고온 환경**과 **넘어짐 탐지** 이벤트로 인해 위험 등급으로 전환되었습니다. 오후 시간대 평균 안전 점수가 \`44\`까지 하락했으며, 디스크 사용률이 임계치에 근접했습니다.

## 주요 지표

| 지표 | 값 | 임계 | 상태 |
|---|---|---|---|
| 평균 온도 | 41.7 °C | 35 °C | 위험 |
| fall_score (최대) | 0.63 | 0.30 | 주의 |
| 디스크 사용률 | 91% | 85% | 위험 |
| Node Ready | 3 / 5 | 5 / 5 | 위험 |

## 권장 조치

- 주조 라인 인근 **환기 시스템 점검** 및 냉각 보강
- \`edge-wk-3\`, \`edge-wk-4\` 노드 **재기동** 및 네트워크 연결 확인
- 작업자 동선 구역의 **넘어짐 감지 카메라** 캘리브레이션
- 디스크 정리 작업(spool 업로드 적체 해소) 수행

## 비고

위 분석은 HISTORY#STATE 및 GRAPH#5M 집계 데이터를 기반으로 자동 생성되었습니다.`

window.MOCK = { FACTORIES, HISTORY, RECENT_CHANGES, nodesFor, workloadsFor, SAMPLE_REPORT }
