# ===========================================================================
# Route53 — data reference to permanent hosted zone
#
# The hosted zone is managed by infra/data-dashboard-dns/ (permanent root).
# This root reads the zone via data source and manages only the records
# that belong to permanent resources (CloudFront alias + ACM validation).
# ===========================================================================

data "aws_route53_zone" "dashboard" {
  name         = var.dashboard_domain_name
  private_zone = false
}

# ---------------------------------------------------------------------------
# A-record: dashboard.<domain> → CloudFront (alias)
# ---------------------------------------------------------------------------

resource "aws_route53_record" "web_cloudfront" {
  zone_id = data.aws_route53_zone.dashboard.zone_id
  name    = local.dashboard_web_fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
