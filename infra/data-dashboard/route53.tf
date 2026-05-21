# ===========================================================================
# Route53 Hosted Zone
# Domain purchased via Gabia (Step 0). NS records output for Gabia delegation.
# ===========================================================================

resource "aws_route53_zone" "dashboard" {
  name = var.dashboard_domain_name

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Route53-${var.dashboard_domain_name}"
  })
}

# ---------------------------------------------------------------------------
# A-record: api.<domain> → ALB (alias)
# ---------------------------------------------------------------------------

resource "aws_route53_record" "api_alb" {
  zone_id = aws_route53_zone.dashboard.zone_id
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
  zone_id = aws_route53_zone.dashboard.zone_id
  name    = local.dashboard_web_fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
