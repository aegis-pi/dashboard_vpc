variable "aws_region" {
  description = "AWS region for Route53 API calls. Route53 is global but API requests use this region."
  type        = string
  default     = "ap-south-1"
}

variable "dashboard_domain_name" {
  description = "Root domain name for the Dashboard hosted zone (purchased via Gabia, delegated to Route53)."
  type        = string
  default     = "aegis-pi.cloud"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.dashboard_domain_name))
    error_message = "dashboard_domain_name must be a valid domain name."
  }
}
