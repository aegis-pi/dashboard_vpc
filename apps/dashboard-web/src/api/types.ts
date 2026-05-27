// ─── Risk / status enums ────────────────────────────────────────────
export type RiskLevel = 'safe' | 'warning' | 'danger'
export type PipelineStatus = 'normal' | 'warning' | 'critical'

// ─── Top cause entry ─────────────────────────────────────────────────
export interface TopCause {
  name: string
  value: number
  contribution: number
}

// ─── Factory summary (from GET /factories) ───────────────────────────
export interface FactorySummary {
  factory_id: string
  display_status?: string
  risk_score?: number
  risk_level?: RiskLevel
  top_causes?: (TopCause | string)[]
  node_ready?: number
  node_total?: number
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

// ─── Factory detail (from GET /factories/{id}) ───────────────────────
export interface FactoryDetail {
  factory_id: string
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
    nodes?: NodeStatus[]
    workload_summary?: {
      total?: number
      running?: number
      unhealthy?: number
      restart_count_total?: number
    }
    workloads?: WorkloadStatus[]
    device_summary?: {
      bme280_available?: boolean | null
      camera_available?: boolean | null
      microphone_available?: boolean | null
    }
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
  ready?: boolean
  cpu_usage_percent?: number | null
  memory_usage_percent?: number | null
  disk_usage_percent?: number | null
}

export interface WorkloadStatus {
  name: string
  status?: string
  node_id?: string
  restart_count?: number
}

// ─── History item (from GET /factories/{id}/history) ─────────────────
export interface HistoryItem {
  timestamp?: string
  // risk fields
  risk_score?: number
  risk_level?: RiskLevel
  top_cause_names?: string[]
  // factory_state fields
  temperature_celsius_avg?: number | null
  humidity_percent_avg?: number | null
  pressure_hpa_avg?: number | null
  fire_score?: number | null
  fall_score?: number | null
  bend_score?: number | null
  // infra fields
  node_summary?: { ready?: number; total?: number; not_ready?: number }
  nodes?: NodeStatus[]
  workload_summary?: { unhealthy?: number }
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
