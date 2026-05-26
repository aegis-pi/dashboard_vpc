# ===========================================================================
# Route53 — data reference to permanent hosted zone
#
# The hosted zone for var.dashboard_domain_name is managed by the permanent
# Terraform root at infra/data-dashboard-dns/ and is NOT destroyed when
# infra/data-dashboard is destroyed. This prevents Gabia NS delegation from
# breaking across build/destroy cycles.
#
# State migration procedure (Step 7.5):
#   1. terraform -chdir=infra/data-dashboard-dns init
#   2. terraform -chdir=infra/data-dashboard-dns import \
#        aws_route53_zone.dashboard <ZONE_ID>
#   3. terraform -chdir=infra/data-dashboard state rm \
#        aws_route53_zone.dashboard
#   4. terraform -chdir=infra/data-dashboard plan    (no zone destroy/create)
#   5. terraform -chdir=infra/data-dashboard-dns plan (no changes)
#
# NOTE: `state rm` removes the resource from Terraform state only — it does
#       NOT delete the AWS resource. The hosted zone remains intact.
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
