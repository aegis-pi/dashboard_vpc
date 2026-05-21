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
  # Availability Zones and zone labels
  # ---------------------------------------------------------------------------
  azs = [
    for suffix in var.availability_zone_suffixes : "${var.aws_region}${suffix}"
  ]

  # ["Azone", "Czone"]
  zone_names = [
    for az in local.azs : "${upper(regex("[a-z]$", az))}zone"
  ]

  # ---------------------------------------------------------------------------
  # Subnet CIDR map per zone
  # Public:       10.20.0.x/24, 10.20.1.x/24
  # Private App:  10.20.10.x/24, 10.20.11.x/24
  # Private Data: 10.20.20.x/24, 10.20.21.x/24
  # ---------------------------------------------------------------------------
  zone_config = {
    for i, zone in local.zone_names : zone => {
      az                = local.azs[i]
      public_cidr       = cidrsubnet(var.vpc_cidr, 8, i)
      private_app_cidr  = cidrsubnet(var.vpc_cidr, 8, i + 10)
      private_data_cidr = cidrsubnet(var.vpc_cidr, 8, i + 20)
    }
  }

  # ---------------------------------------------------------------------------
  # FQDNs
  # ---------------------------------------------------------------------------
  dashboard_api_fqdn = "${var.dashboard_api_subdomain}.${var.dashboard_domain_name}"
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
