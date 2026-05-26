# ===========================================================================
# Outputs — consumed by Step 3+ (data stores), Step 7 (ECS deployment),
#            and scripts/build/build-data-dashboard.sh
# ===========================================================================

# ---------------------------------------------------------------------------
# VPC / Subnets
# ---------------------------------------------------------------------------

output "vpc_id" {
  description = "Data/Dashboard VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (map: zone_name => subnet_id)."
  value       = { for k, v in aws_subnet.public : k => v.id }
}

output "private_app_subnet_ids" {
  description = "Private App subnet IDs (map: zone_name => subnet_id)."
  value       = { for k, v in aws_subnet.private_app : k => v.id }
}

output "private_data_subnet_ids" {
  description = "Private Data subnet IDs (map: zone_name => subnet_id)."
  value       = { for k, v in aws_subnet.private_data : k => v.id }
}

output "nat_gateway_public_ip" {
  description = "Elastic IP address of the single NAT Gateway (Azone)."
  value       = aws_eip.nat.public_ip
}

# ---------------------------------------------------------------------------
# Security Groups
# ---------------------------------------------------------------------------

output "sg_alb_id" {
  description = "Security Group ID: ALB."
  value       = aws_security_group.alb.id
}

output "sg_ecs_id" {
  description = "Security Group ID: ECS Fargate tasks."
  value       = aws_security_group.ecs.id
}

output "sg_rds_id" {
  description = "Security Group ID: RDS PostgreSQL."
  value       = aws_security_group.rds.id
}

output "sg_redis_id" {
  description = "Security Group ID: ElastiCache Redis."
  value       = aws_security_group.redis.id
}

output "sg_lambda_notifier_id" {
  description = "Security Group ID: Lambda notifier (VPC-attach)."
  value       = aws_security_group.lambda_notifier.id
}

# ---------------------------------------------------------------------------
# ALB
# ---------------------------------------------------------------------------

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer."
  value       = aws_lb.this.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer."
  value       = aws_lb.this.arn
}

output "alb_target_group_backend_arn" {
  description = "ARN of the Backend ECS target group."
  value       = aws_lb_target_group.backend.arn
}

# ---------------------------------------------------------------------------
# Route53
# ---------------------------------------------------------------------------

output "route53_zone_id" {
  description = "Route53 Hosted Zone ID for the Dashboard domain (read from permanent zone in infra/data-dashboard-dns)."
  value       = data.aws_route53_zone.dashboard.zone_id
}

output "route53_name_servers" {
  description = "Name servers for the Dashboard domain (permanent — must match Gabia delegation)."
  value       = data.aws_route53_zone.dashboard.name_servers
}

# ---------------------------------------------------------------------------
# ACM
# ---------------------------------------------------------------------------

output "acm_alb_certificate_arn" {
  description = "ACM certificate ARN for ALB (ap-south-1)."
  value       = aws_acm_certificate.alb.arn
}

output "acm_cloudfront_certificate_arn" {
  description = "ACM certificate ARN for CloudFront (us-east-1) — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.acm_cloudfront_certificate_arn
}

# ---------------------------------------------------------------------------
# S3 Web
# ---------------------------------------------------------------------------

output "s3_web_bucket_name" {
  description = "S3 bucket name for Dashboard Web SPA — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.s3_web_bucket_name
}

output "s3_web_bucket_arn" {
  description = "S3 bucket ARN for Dashboard Web SPA — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.s3_web_bucket_arn
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation on deploy) — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.cloudfront_domain_name
}

# ---------------------------------------------------------------------------
# Cognito
# ---------------------------------------------------------------------------

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.cognito_user_pool_id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.cognito_user_pool_arn
}

output "cognito_app_client_id" {
  description = "Cognito App Client ID (used by Frontend VITE_COGNITO_CLIENT_ID) — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.cognito_app_client_id
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI base URL (used by Frontend VITE_COGNITO_DOMAIN) — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.cognito_hosted_ui_url
}

# ---------------------------------------------------------------------------
# Dashboard URLs
# ---------------------------------------------------------------------------

output "dashboard_api_url" {
  description = "Dashboard Backend API HTTPS URL (post-ACM validation)."
  value       = "https://${local.dashboard_api_fqdn}"
}

output "dashboard_web_url" {
  description = "Dashboard Web SPA HTTPS URL."
  value       = "https://${local.dashboard_web_fqdn}"
}

# ---------------------------------------------------------------------------
# DynamoDB (Step 3)
# ---------------------------------------------------------------------------

output "dynamodb_factory_status_name" {
  description = "DynamoDB table name: AEGIS-DynamoDB-FactoryStatus (공식 hot store, ADR 0022)."
  value       = data.aws_dynamodb_table.official_factory_status.name
}

output "dynamodb_factory_status_stream_arn" {
  description = "DynamoDB Streams ARN for AEGIS-DynamoDB-FactoryStatus (used by Lambda notifier ESM)."
  value       = data.aws_dynamodb_table.official_factory_status.stream_arn
}

output "dynamodb_daily_report_name" {
  description = "DynamoDB table name: aegis-daily-report — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.dynamodb_daily_report_name
}

# ---------------------------------------------------------------------------
# RDS PostgreSQL (Step 3) — endpoint/name only, no password
# ---------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)."
  value       = aws_db_instance.this.endpoint
}

output "rds_address" {
  description = "RDS PostgreSQL hostname."
  value       = aws_db_instance.this.address
}

output "rds_port" {
  description = "RDS PostgreSQL port."
  value       = aws_db_instance.this.port
}

output "rds_db_name" {
  description = "RDS PostgreSQL database name."
  value       = aws_db_instance.this.db_name
}

output "rds_secret_name" {
  description = "Secrets Manager secret name for RDS PostgreSQL master credentials."
  value       = aws_secretsmanager_secret.rds.name
}

# ---------------------------------------------------------------------------
# ElastiCache Redis (Step 3) — endpoint/name only, no auth value
# ---------------------------------------------------------------------------

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint address."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "redis_port" {
  description = "ElastiCache Redis port."
  value       = aws_elasticache_replication_group.this.port
}

output "redis_auth_secret_name" {
  description = "Secrets Manager secret name for Redis AUTH token."
  value       = aws_secretsmanager_secret.redis_auth.name
}

# ---------------------------------------------------------------------------
# Lambda data processor (Step 4)
# ---------------------------------------------------------------------------

output "lambda_data_processor_name" {
  description = "Lambda function name for data processor."
  value       = aws_lambda_function.data_processor.function_name
}

output "iot_rule_factory_state_processor" {
  description = "IoT Rule name for factory_state → Lambda data processor."
  value       = aws_iot_topic_rule.factory_state_processor.name
}

output "iot_rule_infra_state_processor" {
  description = "IoT Rule name for infra_state → Lambda data processor."
  value       = aws_iot_topic_rule.infra_state_processor.name
}

# ---------------------------------------------------------------------------
# Lambda notifier (Step 5)
# ---------------------------------------------------------------------------

output "lambda_notifier_name" {
  description = "Lambda function name for DDB Streams notifier."
  value       = aws_lambda_function.notifier.function_name
}

output "lambda_notifier_dlq_url" {
  description = "SQS DLQ URL for Lambda notifier on-failure destination."
  value       = aws_sqs_queue.notifier_dlq.url
}

output "lambda_notifier_event_source_mapping_uuid" {
  description = "Event source mapping UUID: DDB Streams → Lambda notifier."
  value       = aws_lambda_event_source_mapping.ddb_streams_notifier.uuid
}

# ---------------------------------------------------------------------------
# ECR (Step 7)
# ---------------------------------------------------------------------------

output "dashboard_backend_ecr_repository_url" {
  description = "ECR repository URL for aegis/dashboard-backend — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.ecr_repository_url
}

output "github_oidc_ecr_push_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC ECR push — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.github_oidc_ecr_push_role_arn
}

output "github_oidc_web_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC web deploy (S3 sync + CloudFront invalidation) — from permanent root."
  value       = data.terraform_remote_state.permanent.outputs.github_oidc_web_deploy_role_arn
}

# ---------------------------------------------------------------------------
# ECS (Step 7)
# ---------------------------------------------------------------------------

output "ecs_cluster_name" {
  description = "ECS cluster name for Dashboard Backend."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name for Dashboard Backend."
  value       = aws_ecs_service.backend.name
}

output "ecs_task_definition_family" {
  description = "ECS task definition family name."
  value       = aws_ecs_task_definition.backend.family
}

output "ecs_task_role_arn" {
  description = "ECS task role ARN (applied to running container; DDB/S3/Bedrock)."
  value       = aws_iam_role.ecs_task.arn
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN (ECR pull + CWLogs + Secrets injection)."
  value       = aws_iam_role.ecs_task_execution.arn
}

output "cloudwatch_log_group_backend" {
  description = "CloudWatch log group for ECS backend tasks (/ecs/kjw-aegis-data-backend)."
  value       = aws_cloudwatch_log_group.ecs_backend.name
}

output "backend_target_group_arn" {
  description = "ALB target group ARN wired to the ECS backend service (port 8000, /healthz)."
  value       = aws_lb_target_group.backend.arn
}
