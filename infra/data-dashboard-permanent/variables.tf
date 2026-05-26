variable "aws_region" {
  description = "Primary AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment label for resource tagging."
  type        = string
  default     = "data-dashboard-mvp"
}

# ---------------------------------------------------------------------------
# Domain / DNS
# ---------------------------------------------------------------------------

variable "dashboard_domain_name" {
  description = "Base domain name for the Dashboard (delegated to Route53)."
  type        = string

  validation {
    condition     = var.dashboard_domain_name != "example.com" && can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.dashboard_domain_name))
    error_message = "dashboard_domain_name must be a real domain name."
  }
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
  description = "Cognito Hosted UI domain prefix. Must be globally unique."
  type        = string
  default     = "kjw-aegis-data-auth"
}

# ---------------------------------------------------------------------------
# S3 Web Bucket
# ---------------------------------------------------------------------------

variable "web_bucket_name_override" {
  description = "Override for the Dashboard Web S3 bucket name. Defaults to kjw-aegis-data-web."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# GitHub OIDC
# ---------------------------------------------------------------------------

variable "github_repo_for_oidc" {
  description = "GitHub repository path (org/repo) trusted in the OIDC assume-role condition."
  type        = string
  default     = "aegis-pi/dashboard_vpc"
}

variable "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider created by infra/foundation. If empty, looked up by URL."
  type        = string
  default     = ""
}
