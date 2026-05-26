# ===========================================================================
# ACM — CloudFront certificate (us-east-1, mandatory for CloudFront)
# Covers dashboard.<domain>
#
# NOTE: aws_acm_certificate_validation is intentionally omitted here.
# The cert is already validated (ISSUED) and CloudFront references the cert
# ARN directly. The validation resource is a Terraform "wait" helper that does
# not import-able; omitting it is safe since the cert is already validated.
# ===========================================================================

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name       = local.dashboard_web_fqdn
  validation_method = "DNS"

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-ACM-CloudFront"
  })

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = true
  }
}

resource "aws_route53_record" "cf_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options : dvo.domain_name => {
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
