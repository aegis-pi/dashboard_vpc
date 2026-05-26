# ===========================================================================
# Route53 Hosted Zone — permanent resource (infra/data-dashboard-dns)
#
# This root manages ONLY the Route53 public hosted zone for the Dashboard
# domain. It is intentionally separate from infra/data-dashboard so that
# destroy/apply cycles on infra/data-dashboard do NOT change the NS records
# that have been delegated from Gabia.
#
# Records (api.*, dashboard.*, ACM validation CNAMEs) are managed by
# infra/data-dashboard which reads this zone via data source.
#
# State: kjw-aegis-terraform-state / data-dashboard-dns/terraform.tfstate
# ===========================================================================

resource "aws_route53_zone" "dashboard" {
  name = var.dashboard_domain_name

  tags = {
    Name        = "kjw-aegis-data-dns-${var.dashboard_domain_name}"
    Project     = "aegis-pi"
    Workstream  = "B-data-dashboard"
    ManagedBy   = "terraform"
    Environment = "permanent"
  }

  lifecycle {
    prevent_destroy = true
  }
}
