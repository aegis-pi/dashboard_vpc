# ===========================================================================
# Route53 — data reference to permanent hosted zone
#
# The hosted zone for var.dashboard_domain_name is managed by the permanent
# Terraform root at infra/data-dashboard-dns/ and is NOT destroyed when
# infra/data-dashboard is destroyed. This prevents Gabia NS delegation from
# breaking across build/destroy cycles.
#
# NOTE: web_cloudfront A-record MOVED to infra/data-dashboard-permanent/
#       (Step 9.5). cf_cert_validation also moved there.
# ===========================================================================

data "aws_route53_zone" "dashboard" {
  name         = var.dashboard_domain_name
  private_zone = false
}

# ---------------------------------------------------------------------------
# A-record: api.<domain> → ALB (alias)
# ---------------------------------------------------------------------------

resource "aws_route53_record" "api_alb" {
  zone_id = data.aws_route53_zone.dashboard.zone_id
  name    = local.dashboard_api_fqdn
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
