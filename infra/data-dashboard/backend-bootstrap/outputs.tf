output "state_bucket_name" {
  description = "S3 bucket name for Terraform state. Use this as 'bucket' in backend configurations."
  value       = aws_s3_bucket.state.bucket
}

output "state_bucket_arn" {
  description = "S3 bucket ARN for Terraform state."
  value       = aws_s3_bucket.state.arn
}

output "backend_config_hint" {
  description = "Copy this block into the terraform {} section of roots that use this backend."
  value       = <<-EOT
    backend "s3" {
      bucket       = "${aws_s3_bucket.state.bucket}"
      region       = "${var.aws_region}"
      use_lockfile = true
      encrypt      = true
      # key        = "<root-name>/terraform.tfstate"
    }
  EOT
}
