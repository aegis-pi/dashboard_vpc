locals {
  # ---------------------------------------------------------------------------
  # Naming convention: KJW-AEGIS-Data-* (uppercase for human-facing names)
  # kjw-aegis-data-*            (lowercase for S3 / Cognito domain / CF alias)
  # ---------------------------------------------------------------------------
  owner_prefix   = "KJW"
  project_prefix = "AEGIS"
  area_prefix    = "Data"
  naming_prefix  = "KJW-AEGIS-Data"
  name_prefix_lc = "kjw-aegis-data"

  # ---------------------------------------------------------------------------
  # FQDNs
  # ---------------------------------------------------------------------------
  dashboard_web_fqdn = "${var.dashboard_web_subdomain}.${var.dashboard_domain_name}"

  # ---------------------------------------------------------------------------
  # S3 Web bucket name (globally unique; override via variable)
  # ---------------------------------------------------------------------------
  web_bucket_name = var.web_bucket_name_override != "" ? var.web_bucket_name_override : "${local.name_prefix_lc}-web"

  # ---------------------------------------------------------------------------
  # Common tags applied to all resources in this root
  # ---------------------------------------------------------------------------
  tags = {
    Project     = "Aegis-Pi"
    Component   = "data-dashboard"
    Environment = var.environment
    Owner       = local.owner_prefix
    ManagedBy   = "terraform"
  }
}
