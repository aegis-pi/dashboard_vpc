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
  snapshot_received_at?: string
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

export type GlobalRole = 'super_admin' | 'org_admin' | 'factory_admin' | 'viewer'
export type UserStatus = 'active' | 'disabled'
export type FactoryAccessRole = 'admin' | 'viewer'

export interface UserFactoryAccess {
  factory_id: string
  role: FactoryAccessRole
}

export interface AdminUser {
  id: string
  cognito_sub: string
  email: string
  display_name: string
  global_role: GlobalRole
  can_view_system: boolean
  status: UserStatus
  factories: UserFactoryAccess[]
}

export interface AdminUserPayload {
  email?: string
  display_name: string
  global_role: GlobalRole
  can_view_system: boolean
  factories: UserFactoryAccess[]
}

export interface CurrentUser {
  id: string
  email: string
  display_name: string
  global_role: GlobalRole
  can_manage_users: boolean
  can_view_system: boolean
  allowed_factory_ids: string[] | null
}

export type ChatIntent = 'current_status' | 'cause_analysis' | 'history_trend' | 'report' | 'unknown'
export type ChatGenerator = 'bedrock' | 'rule'
export type ChatModelTier = 'fast' | 'precise' | null

export interface ChatTimeScope {
  kind: 'now' | 'point' | 'range'
  window: string
  target_kst?: string | null
  start?: string | null
  end?: string | null
  assumed?: boolean
  note?: string
}

export interface ChatEvidence {
  confirmed: Record<string, unknown>
  inferred: string[]
  missing: string[]
}

export interface ChatQueryResponse {
  answer: string
  intent: ChatIntent
  factory_id: string | null
  time_scope: ChatTimeScope
  evidence: ChatEvidence
  image_ref: unknown | null
  generator: ChatGenerator
  model_tier: ChatModelTier
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
  snapshot_received_at?: string
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
  risk_score_max?: number | null
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
  // infra fields (GRAPH#5M aggregate)
  cpu_usage_percent_mean?: number | null
  memory_usage_percent_mean?: number | null
  disk_usage_percent_last?: number | null
  // GRAPH#5M per-node means (when aggregator writes infra.nodes)
  nodes_mean?: { node_id: string; cpu_usage_percent?: number | null; memory_usage_percent?: number | null; disk_usage_percent?: number | null }[] | null
  // GRAPH#5M bucket window
  bucket_start?: string
  bucket_end?: string
  bucket_minutes?: number | null
  sample_count?: number | null
  // sensor min/max (available in GRAPH#5M and re-aggregated buckets)
  temperature_celsius_min?: number | null
  humidity_percent_min?: number | null
  pressure_hpa_min?: number | null
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
  last_modified?: string | null
  size_bytes?: number | null
}

// ─── Cloud infra status ───────────────────────────────────────────────
export type CloudInfraStatusValue = 'normal' | 'warning' | 'critical' | 'unknown'

// Per-section failure record (doc29 errors[] item). Present when a section
// could not be collected; frontend shows it instead of recomputing thresholds.
export interface CloudInfraError {
  source?: string
  code?: string
  message?: string
  at?: string
}

export interface CloudInfraRedis {
  replication_group_id?: string
  status?: string
  node_count?: number | null
  total_memory_mib?: number | null
  cache_node_memory_mib?: number | null
  cpu_utilization_avg?: number | null
  memory_usage_percent?: number | null
  freeable_memory_mib?: number | null
  current_connections?: number | null
  evictions_5m?: number | null
}

export interface CloudInfraRds {
  db_instance_id?: string
  status?: string
  cpu_utilization_avg?: number | null
  database_connections?: number | null
  freeable_memory_mib?: number | null
  free_storage_mib?: number | null
  allocated_storage_gib?: number | null
  max_allocated_storage_gib?: number | null
}

export interface CloudInfraEcs {
  cluster_name?: string
  service_name?: string
  status?: string
  desired_count?: number | null
  running_count?: number | null
  pending_count?: number | null
  cpu_utilization_avg?: number | null
  cpu_utilization_max?: number | null
  memory_utilization_avg?: number | null
  memory_utilization_max?: number | null
}

export interface CloudInfraAlb {
  target_group_name?: string
  healthy_host_count?: number | null
  unhealthy_host_count?: number | null
  target_5xx_count_5m?: number | null
  target_response_time_avg?: number | null
  target_response_time_p95?: number | null
}

export interface CloudInfraLambda {
  name?: string
  invocations_5m?: number | null
  errors_5m?: number | null
  throttles_5m?: number | null
  duration_p95_ms?: number | null
}

export interface CloudInfraFactoryFreshness {
  factory_id?: string
  pipeline_status?: PipelineStatus | string
  latest_infra_state_age_seconds?: number | null
  last_infra_state_at?: string | null
  risk_score?: number | null
  risk_level?: RiskLevel | string
  top_causes?: (TopCause | string)[]
}

export interface CloudInfraFast {
  status?: CloudInfraStatusValue
  backend_runtime?: {
    status?: CloudInfraStatusValue
    reasons?: string[]
    errors?: CloudInfraError[]
    ecs?: CloudInfraEcs
    alb?: CloudInfraAlb
  }
  datastores?: {
    status?: CloudInfraStatusValue
    reasons?: string[]
    errors?: CloudInfraError[]
    redis?: CloudInfraRedis
    rds?: CloudInfraRds
  }
  data_pipeline?: {
    status?: CloudInfraStatusValue
    reasons?: string[]
    errors?: CloudInfraError[]
    lambdas?: CloudInfraLambda[]
    dynamodb?: {
      table_name?: string
      read_throttle_events_5m?: number | null
      write_throttle_events_5m?: number | null
      system_errors_5m?: number | null
    }
    dlq?: {
      queue_name?: string
      messages_visible?: number | null
      oldest_message_age_seconds?: number | null
    }
    schedulers?: { name?: string; state?: string }[]
  }
  factory_freshness?: {
    status?: CloudInfraStatusValue
    reasons?: string[]
    errors?: CloudInfraError[]
    factories?: CloudInfraFactoryFreshness[]
  }
  errors?: CloudInfraError[]
}

export interface CloudInfraSlow {
  status?: CloudInfraStatusValue
  eks_management?: {
    status?: CloudInfraStatusValue
    reasons?: string[]
    errors?: CloudInfraError[]
    cluster?: { name?: string; status?: string; version?: string }
    nodegroups?: {
      name?: string
      status?: string
      desired_size?: number | null
      min_size?: number | null
      max_size?: number | null
      health_issues?: unknown[]
    }[]
    autoscaling?: {
      desired_capacity?: number | null
      healthy_instances?: number | null
      total_instances?: number | null
    }
    nodes?: {
      status?: CloudInfraStatusValue
      ready?: number | null
      total?: number | null
      items?: { name?: string; ready?: boolean; cpu_utilization_percent?: number | null; memory_utilization_percent?: number | null }[]
    }
    pods?: {
      status?: CloudInfraStatusValue
      running?: number | null
      pending?: number | null
      failed?: number | null
      restart_count_total?: number | null
      top_by_cpu?: { namespace?: string; pod?: string; cpu_millicores?: number | null; memory_mib?: number | null }[]
      top_by_memory?: { namespace?: string; pod?: string; cpu_millicores?: number | null; memory_mib?: number | null }[]
    }
    argocd?: {
      status?: CloudInfraStatusValue
      applications_total?: number | null
      synced?: number | null
      out_of_sync?: number | null
      healthy?: number | null
      degraded?: number | null
    }
  }
  storage_freshness?: {
    status?: CloudInfraStatusValue
    reasons?: string[]
    errors?: CloudInfraError[]
    factories?: {
      factory_id?: string
      status?: CloudInfraStatusValue
      latest_raw_at?: string | null
      latest_processed_at?: string | null
      latest_processed_agg_at?: string | null
    }[]
  }
  errors?: CloudInfraError[]
}

export interface CloudInfraStatus {
  available: boolean
  schema_version?: string
  updated_at?: string
  fast_updated_at?: string
  slow_updated_at?: string
  fast_stale?: boolean
  slow_stale?: boolean
  fast_age_seconds?: number | null
  slow_age_seconds?: number | null
  overall_status?: CloudInfraStatusValue
  fast?: CloudInfraFast
  slow?: CloudInfraSlow
  [key: string]: unknown
}

export interface CloudInfraHistoryItem {
  sk?: string
  updated_at?: string
  overall_status?: CloudInfraStatusValue
  snapshot_type?: 'fast' | 'slow' | string
  fast?: CloudInfraFast
  slow?: CloudInfraSlow
  [key: string]: unknown
}
