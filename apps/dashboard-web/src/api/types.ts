// ─── Risk / status enums ────────────────────────────────────────────
export type RiskLevel = 'safe' | 'warning' | 'danger'
export type PipelineStatus = 'normal' | 'warning' | 'critical'

// ─── Top cause entry ─────────────────────────────────────────────────
// Real DDB data from risk.py uses `field` key; legacy/test data uses `name`.
export interface TopCause {
  name?: string
  field?: string
  value?: number
  contribution?: number
}

// ─── Factory summary (from GET /factories) ───────────────────────
export interface FactorySummary {
  factory_id: string
  environment_type?: string
  display_status?: string
  risk_score?: number
  risk_level?: RiskLevel
  top_causes?: (TopCause | string)[]
  node_ready?: number
  node_total?: number
  workload_ready?: number
  workload_total?: number
  pipeline_status?: PipelineStatus
  updated_at?: string
  last_factory_state_at?: string
  last_infra_state_at?: string
  // nested variant (raw DDB item)
  risk?: {
    score?: number
    level?: RiskLevel
    top_causes?: (TopCause | string)[]
  }
  infra_state?: {
    node_summary?: { ready?: number; total?: number; not_ready?: number }
    nodes_ready?: number
    nodes_total?: number
    pods_ready?: number
    workloads?: WorkloadStatus[]
  }
  pipeline_status_obj?: { status?: PipelineStatus }
}

// ─── Fleet response ──────────────────────────────────────────────────
export interface FleetSummary {
  total: number
  danger: number
  warning: number
  safe: number
  delayed: number
}

export interface FleetResponse {
  summary?: FleetSummary
  factories: FactorySummary[]
}

// ─── Device entry (nested format from infra_state.devices) ──────────
export interface DeviceEntry {
  available?: boolean | null
  last_seen_at?: string | null
}

// ─── Heartbeat ───────────────────────────────────────────────────────
export interface HeartbeatState {
  agent_status?: string | null
  last_spool_write_status?: string | null
  last_spool_write_at?: string | null
}

// ─── Factory detail (from GET /factories/{id}) ───────────────────────
export interface FactoryDetail {
  factory_id: string
  environment_type?: string
  display_status?: string
  risk?: {
    score?: number
    level?: RiskLevel
    top_causes?: (TopCause | string)[]
  }
  factory_state?: {
    // nested format (legacy / test data)
    sensor?: {
      temperature_celsius_avg?: number | null
      humidity_percent_avg?: number | null
      pressure_hpa_avg?: number | null
    }
    ai_result?: {
      fire_score?: number | null
      fall_score?: number | null
      bend_score?: number | null
      abnormal_sound?: string | null
    }
    // flat format (real DDB data-processor output)
    temperature_celsius?: number | null
    temperature_celsius_avg?: number | null
    humidity_percent?: number | null
    humidity_percent_avg?: number | null
    pressure_hpa?: number | null
    pressure_hpa_avg?: number | null
    fire_score?: number | null
    fall_score?: number | null
    bend_score?: number | null
    abnormal_sound?: string | null
    source_timestamp?: string
    message_id?: string
  }
  infra_state?: {
    node_summary?: { ready?: number; total?: number; not_ready?: number }
    nodes_ready?: number
    nodes_total?: number
    nodes?: NodeStatus[]
    workload_summary?: {
      total?: number
      running?: number
      unhealthy?: number
      restart_count_total?: number
    }
    pods_ready?: number
    workloads?: WorkloadStatus[]
    // nested device format: { bme280: { available, last_seen_at }, ... }
    devices?: {
      bme280?: DeviceEntry
      camera?: DeviceEntry
      microphone?: DeviceEntry
    }
    // flat legacy format
    device_summary?: {
      bme280_available?: boolean | null
      camera_available?: boolean | null
      microphone_available?: boolean | null
    }
    heartbeat?: HeartbeatState
    source_timestamp?: string
  }
  pipeline_status?: {
    status?: PipelineStatus
    latest_infra_state_age_seconds?: number
    latest_s3_raw_age_seconds?: number
  }
  dashboard?: { display_status?: string; summary?: string }
  updated_at?: string
  last_factory_state_at?: string
  last_infra_state_at?: string
}

// ─── Node / workload status ──────────────────────────────────────────
export interface NodeStatus {
  node_id: string
  role?: string | null
  ready?: boolean
  status?: string
  cpu_usage_percent?: number | null
  memory_usage_percent?: number | null
  disk_usage_percent?: number | null
  network_reachability?: string | null
}

export interface WorkloadStatus {
  name: string
  namespace?: string | null
  status?: string
  ready?: boolean | null
  containers_ready?: number | null
  node_id?: string
  restart_count?: number
}

// ─── History item (from GET /factories/{id}/history) ─────────────────
export interface HistoryItem {
  timestamp?: string
  // risk fields (raw 1h snapshots)
  risk_score?: number
  risk_level?: RiskLevel
  top_cause_names?: string[]
  // GRAPH#5M aggregate risk (window=6h/12h/24h, ADR 0025)
  is_bucket?: boolean
  risk_score_avg?: number | null
  risk_score_min?: number | null
  // factory_state fields
  temperature_celsius_avg?: number | null
  humidity_percent_avg?: number | null
  pressure_hpa_avg?: number | null
  fire_score?: number | null
  fall_score?: number | null
  bend_score?: number | null
  // GRAPH#5M AI max per bucket (for spike dot markers in bucketed charts)
  fire_score_max?: number | null
  fall_score_max?: number | null
  bend_score_max?: number | null
  // infra fields (raw snapshots — per-node)
  node_summary?: { ready?: number; total?: number; not_ready?: number }
  nodes?: NodeStatus[]
  workload_summary?: { unhealthy?: number }
  // infra fields (GRAPH#5M aggregate — no per-node breakdown)
  cpu_usage_percent_mean?: number | null
  memory_usage_percent_mean?: number | null
  disk_usage_percent_last?: number | null
  // GRAPH#5M bucket window
  bucket_start?: string
  bucket_end?: string
  bucket_minutes?: number | null
  sample_count?: number | null
  // sensor max (available in GRAPH#5M and re-aggregated buckets)
  temperature_celsius_max?: number | null
  humidity_percent_max?: number | null
  pressure_hpa_max?: number | null
  // raw DDB item (may have sk containing timestamp)
  sk?: string
  pk?: string
  // nested payload from backend
  payload?: Record<string, unknown>
  // optional flat fields backend might return
  [key: string]: unknown
}

// ─── Report types ────────────────────────────────────────────────────
export interface ReportItem {
  report_date: string
  factory_id: string
  s3_key?: string
}
