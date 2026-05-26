# ===========================================================================
# Outputs — consumed by infra/data-dashboard/ via terraform_remote_state
# ===========================================================================

# ---------------------------------------------------------------------------
# Cognito
# ---------------------------------------------------------------------------

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID."
  value       = aws_cognito_user_pool.this.id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "cognito_app_client_id" {
  description = "Cognito App Client ID (used by Frontend VITE_COGNITO_CLIENT_ID)."
  value       = aws_cognito_user_pool_client.this.id
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI base URL (used by Frontend VITE_COGNITO_DOMAIN)."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}

# ---------------------------------------------------------------------------
# DynamoDB
# ---------------------------------------------------------------------------

output "dynamodb_daily_report_name" {
  description = "DynamoDB table name: aegis-daily-report."
  value       = aws_dynamodb_table.daily_report.name
}

output "dynamodb_daily_report_arn" {
  description = "DynamoDB table ARN: aegis-daily-report."
  value       = aws_dynamodb_table.daily_report.arn
}

# ---------------------------------------------------------------------------
# ECR
# ---------------------------------------------------------------------------

output "ecr_repository_url" {
  description = "ECR repository URL for aegis/dashboard-backend."
  value       = aws_ecr_repository.dashboard_backend.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN for aegis/dashboard-backend."
  value       = aws_ecr_repository.dashboard_backend.arn
}

# ---------------------------------------------------------------------------
# GitHub OIDC roles
# ---------------------------------------------------------------------------

output "github_oidc_ecr_push_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC ECR push."
  value       = aws_iam_role.github_oidc_ecr_push.arn
}

output "github_oidc_web_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC web deploy."
  value       = aws_iam_role.github_oidc_web_deploy.arn
}

# ---------------------------------------------------------------------------
# S3 Web
# ---------------------------------------------------------------------------

output "s3_web_bucket_name" {
  description = "S3 bucket name for Dashboard Web SPA."
  value       = aws_s3_bucket.web.bucket
}

output "s3_web_bucket_arn" {
  description = "S3 bucket ARN for Dashboard Web SPA."
  value       = aws_s3_bucket.web.arn
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation on deploy)."
  value       = aws_cloudfront_distribution.web.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.web.domain_name
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.web.arn
}

# ---------------------------------------------------------------------------
# ACM
# ---------------------------------------------------------------------------

output "acm_cloudfront_certificate_arn" {
  description = "ACM certificate ARN for CloudFront (us-east-1)."
  value       = aws_acm_certificate.cloudfront.arn
}

# ---------------------------------------------------------------------------
# Dashboard Web URL
# ---------------------------------------------------------------------------

output "dashboard_web_url" {
  description = "Dashboard Web SPA HTTPS URL."
  value       = "https://${local.dashboard_web_fqdn}"
}
