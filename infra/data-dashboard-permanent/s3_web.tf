# ===========================================================================
# S3 bucket — Dashboard Web SPA (Vite + React static files)
# Served via CloudFront + OAC. No public bucket access.
# ===========================================================================

resource "aws_s3_bucket" "web" {
  bucket = local.web_bucket_name

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-S3-Web"
  })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Bucket policy: allow CloudFront OAC principal to GetObject
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.s3_web_oac.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

data "aws_iam_policy_document" "s3_web_oac" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}
