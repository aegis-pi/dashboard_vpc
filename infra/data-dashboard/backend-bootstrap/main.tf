locals {
  tags = {
    Project   = "Aegis-Pi"
    Component = "terraform-backend"
    Owner     = "KJW"
    ManagedBy = "terraform"
  }
}

# ===========================================================================
# S3 — Terraform state bucket
# kjw-aegis-terraform-state
# Must NOT be aegis-bucket-data (workstream A owned).
# ===========================================================================

resource "aws_s3_bucket" "state" {
  bucket = "kjw-aegis-terraform-state"

  tags = merge(local.tags, {
    Name = "kjw-aegis-terraform-state"
  })
}

# BucketOwnerEnforced disables ACLs; required before enabling versioning
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }

  depends_on = [
    aws_s3_bucket_ownership_controls.state,
    aws_s3_bucket_public_access_block.state,
  ]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
