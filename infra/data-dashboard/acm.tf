# ===========================================================================
# ACM Certificates
#   alb: ap-south-1 — covers api.<domain>
#
# NOTE: CloudFront cert (us-east-1) MOVED to infra/data-dashboard-permanent/
#       (Step 9.5). It is now managed there with lifecycle { prevent_destroy }.
# ===========================================================================

# ---------------------------------------------------------------------------
# ALB certificate (ap-south-1)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "alb" {
  domain_name       = local.dashboard_api_fqdn
  validation_method = "DNS"

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-ACM-ALB"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "alb_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.alb.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.dashboard.zone_id
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [for r in aws_route53_record.alb_cert_validation : r.fqdn]
}
