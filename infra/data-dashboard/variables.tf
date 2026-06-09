variable "aws_region" {
  description = "Primary AWS region for Data/Dashboard VPC infrastructure."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment label for resource tagging."
  type        = string
  default     = "data-dashboard-mvp"
}

variable "vpc_cidr" {
  description = "CIDR block for the Data/Dashboard VPC. Must not overlap with Hub VPC (10.0.0.0/16)."
  type        = string
  default     = "10.20.0.0/16"

  validation {
    condition     = !startswith(var.vpc_cidr, "10.0.")
    error_message = "VPC CIDR must not overlap with Hub VPC 10.0.0.0/16."
  }
}

variable "availability_zone_suffixes" {
  description = "AZ suffixes for Data/Dashboard VPC subnets. Must have exactly 2 entries."
  type        = list(string)
  default     = ["a", "c"]

  validation {
    condition     = length(var.availability_zone_suffixes) == 2
    error_message = "Exactly 2 AZ suffixes are required."
  }
}

# ---------------------------------------------------------------------------
# Domain / DNS
# ---------------------------------------------------------------------------

variable "dashboard_domain_name" {
  description = "Base domain name for the Dashboard (purchased via Gabia, delegated to Route53). Must be provided before plan/apply."
  type        = string

  validation {
    condition     = var.dashboard_domain_name != "example.com" && can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.dashboard_domain_name))
    error_message = "dashboard_domain_name must be a real domain name, not example.com."
  }
}

variable "dashboard_api_subdomain" {
  description = "Subdomain prefix for the Dashboard Backend API (ALB). FQDN = <subdomain>.<domain>."
  type        = string
  default     = "api"
}

variable "dashboard_web_subdomain" {
  description = "Subdomain prefix for the Dashboard Web SPA (CloudFront). FQDN = <subdomain>.<domain>."
  type        = string
  default     = "dashboard"
}

# ---------------------------------------------------------------------------
# Cognito
# ---------------------------------------------------------------------------

variable "cognito_domain_prefix" {
  description = "Cognito Hosted UI domain prefix. Full URL: https://<prefix>.auth.<region>.amazoncognito.com. Must be globally unique."
  type        = string
  default     = "kjw-aegis-data-auth"
}

# ---------------------------------------------------------------------------
# S3 Web Bucket
# ---------------------------------------------------------------------------

variable "web_bucket_name_override" {
  description = "Override for the Dashboard Web S3 bucket name. Defaults to kjw-aegis-data-web. Must be globally unique."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------

variable "alb_ingress_cidrs" {
  description = "CIDR blocks allowed to reach the ALB on port 80/443. Default allows all; narrow for production."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ---------------------------------------------------------------------------
# Shared resources (read-only references)
# ---------------------------------------------------------------------------

variable "shared_data_bucket_name" {
  description = "Name of the shared S3 bucket (aegis-bucket-data) owned by workstream A. Used for data-source reference only; bucket is NOT managed by this root."
  type        = string
  default     = "aegis-bucket-data"
}

# ---------------------------------------------------------------------------
# Step 7 — ECS / ECR / Bedrock
# ---------------------------------------------------------------------------

variable "ecs_backend_desired_count" {
  description = "Initial desired ECS backend tasks. Managed by Application Auto Scaling after creation (service ignores desired_count); kept >= min_capacity for HA across AZs."
  type        = number
  default     = 2
}

# --- ECS backend task sizing ------------------------------------------------
# Raised from 512/1024 after the 2026-06-04 incident (ADR 0030): the heavy
# work is GIL-bound Python (parsing up to 2000 DDB HISTORY items -> Decimal->
# float -> JSON), and the image runs `uvicorn --workers 2`. 0.5 vCPU left two
# workers contending for half a core. 1 vCPU gives each worker ~0.5 core plus
# I/O overlap. Memory is sized for the Fargate 1-vCPU floor (2 GB); observed
# usage was ~40% of 1 GB, so memory was never the bottleneck.
# Valid Fargate combos: 1024 vCPU allows 2048-8192 memory (1 GB steps).

variable "ecs_backend_task_cpu" {
  description = "Fargate task CPU units for the backend (1024 = 1 vCPU)."
  type        = string
  default     = "1024"
}

variable "ecs_backend_task_memory" {
  description = "Fargate task memory (MiB) for the backend. 2048 = Fargate floor for 1 vCPU; observed usage ~40% of 1 GB so this is headroom, not a requirement."
  type        = string
  default     = "2048"
}

# --- ECS backend Application Auto Scaling (see ecs_autoscaling.tf) -----------

variable "ecs_backend_min_capacity" {
  description = "Auto Scaling floor for ECS backend tasks. 2 = HA across AZs + spike split (a 100 req/min burst lands as ~50/task instead of saturating one 0.5 vCPU task)."
  type        = number
  default     = 2
}

variable "ecs_backend_max_capacity" {
  description = "Auto Scaling ceiling for ECS backend tasks. Default 2 = pinned to min for the demo profile (reactive scaling is too slow for a short bursty demo; warm provisioned capacity is what matters). Raise to 3-4 for sustained/production load to let the target-tracking policies act."
  type        = number
  default     = 2
}

variable "ecs_backend_requests_per_target" {
  description = "Target ALBRequestCountPerTarget (req/target/min) for the primary scaling policy. ~40 = scale out at ~40% of the observed single-task saturation point (~100 req/min @ 100% CPU), leaving headroom for scale-out + task cold start."
  type        = number
  default     = 40
}

variable "ecs_backend_cpu_target" {
  description = "Target average CPU % for the safety-net scaling policy. 50 (not 60-70) gives margin for Target Tracking lag + Fargate cold start before saturation."
  type        = number
  default     = 50
}

variable "backend_container_image" {
  description = "Full ECR image URI (e.g. <account>.dkr.ecr.ap-south-1.amazonaws.com/aegis/dashboard-backend:sha-abc1234). Defaults to the repository URL with :latest when empty."
  type        = string
  default     = ""
}

variable "bedrock_enabled" {
  description = "Enable Bedrock-backed chatbot answers in the dashboard backend. If false, the backend falls back to deterministic rule templates."
  type        = bool
  default     = true
}

variable "bedrock_model_fast" {
  description = "Bedrock inference profile ID for the fast chatbot tier."
  type        = string
  default     = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "bedrock_model_precise" {
  description = "Bedrock inference profile ID for the precise chatbot tier."
  type        = string
  default     = "global.anthropic.claude-sonnet-4-6"
}

variable "bedrock_inference_profile_resource_patterns" {
  description = "Bedrock inference profile resource patterns allowed for ECS task invocation. Keep scoped to selected chatbot profiles."
  type        = list(string)
  default = [
    "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    "global.anthropic.claude-sonnet-4-6*",
  ]
}

variable "bedrock_foundation_model_resource_patterns" {
  description = "Bedrock foundation-model resource patterns allowed behind the selected inference profiles. Region is wildcarded because global profiles can route cross-region."
  type        = list(string)
  default = [
    "anthropic.claude-haiku-4-5-*",
    "anthropic.claude-sonnet-4-6*",
  ]
}

variable "rbac_bootstrap_super_admin_subs" {
  description = "Comma-separated Cognito sub values that may bootstrap as dashboard super_admin. Keep empty after the first admin user is created."
  type        = string
  default     = ""
}

variable "github_repo_for_oidc" {
  description = "GitHub repository path (org/repo) trusted in the OIDC assume-role condition for ECR push."
  type        = string
  default     = "aegis-pi/dashboard_vpc"
}

variable "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider created by infra/foundation. If empty, looked up by URL (requires foundation to be applied first)."
  type        = string
  default     = ""
}
