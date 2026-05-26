# ===========================================================================
# CloudFront — Dashboard Web SPA distribution
# NOTE: viewer_certificate temporarily references aws_acm_certificate.cloudfront.arn
#       directly (not via validation resource) to allow import before validation
#       records are in state. Will be restored to cloudfront_validation ref after
#       Phase 2 import is complete.
# ===========================================================================

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.naming_prefix}-OAC-Web"
  description                       = "OAC for Dashboard Web S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  comment             = "${local.naming_prefix} Dashboard Web SPA"
  aliases             = [local.dashboard_web_fqdn]

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.web.bucket}"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-${aws_s3_bucket.web.bucket}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA client-side routing: serve index.html for unknown paths
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cloudfront.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-CloudFront-Web"
  })

  lifecycle {
    prevent_destroy = true
  }
}
