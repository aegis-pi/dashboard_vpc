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
  description = "Desired number of running ECS backend tasks. Set to 0 before first ECR image push to avoid failed deployments."
  type        = number
  default     = 0
}

variable "backend_container_image" {
  description = "Full ECR image URI (e.g. <account>.dkr.ecr.ap-south-1.amazonaws.com/aegis/dashboard-backend:sha-abc1234). Defaults to the repository URL with :latest when empty."
  type        = string
  default     = ""
}

variable "bedrock_region" {
  description = "AWS region for Bedrock InvokeModel calls. Claude 3 Haiku requires us-east-1 if ap-south-1 is unsupported."
  type        = string
  default     = "us-east-1"
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
