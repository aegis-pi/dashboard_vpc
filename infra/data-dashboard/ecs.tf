# ===========================================================================
# Phase 1 Step 7 — ECS Fargate: Dashboard Backend
# Cluster / Task Definition / Service / CloudWatch Logs / IAM roles
# ===========================================================================

locals {
  # Resolve container image: use override variable if set, else ECR :latest.
  # Update backend_container_image variable (or -var flag) when deploying a
  # specific sha-<7char> tag produced by GitHub Actions.
  _backend_image = (
    var.backend_container_image != ""
    ? var.backend_container_image
    : "${data.terraform_remote_state.permanent.outputs.ecr_repository_url}:latest"
  )
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group (30-day retention)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "ecs_backend" {
  name              = "/ecs/${local.name_prefix_lc}-backend"
  retention_in_days = 30

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-CWLogs-ECS-Backend"
    Step = "7"
  })
}

# ---------------------------------------------------------------------------
# ECS Cluster (Fargate)
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = "${local.naming_prefix}-ECSCluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-ECSCluster"
    Step = "7"
  })
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name = aws_ecs_cluster.this.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ---------------------------------------------------------------------------
# IAM — Task Execution Role
# Needed by ECS agent: ECR image pull + CloudWatch Logs + Secrets Manager
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.naming_prefix}-IAMRole-ECS-TaskExecution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-IAMRole-ECS-TaskExecution"
    Step = "7"
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Execution role reads secrets to inject into container environment at launch.
data "aws_iam_policy_document" "ecs_task_execution_secrets" {
  statement {
    sid    = "SecretsManagerReadForInjection"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.redis_url.arn,
    ]
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name   = "${local.naming_prefix}-Policy-ECS-TaskExecution-Secrets"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_secrets.json
}

# ---------------------------------------------------------------------------
# IAM — Task Role (least-privilege, applied to running container)
# DynamoDB read + S3 GetObject + SecretsManager
# Reference: docs/AI_AGENT_HARNESS.md § 8.3
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.naming_prefix}-IAMRole-ECS-TaskRole"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-IAMRole-ECS-TaskRole"
    Step = "7"
  })
}

data "aws_iam_policy_document" "ecs_task_inline" {
  statement {
    sid    = "DynamoDBFactoryStatus"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      data.aws_dynamodb_table.official_factory_status.arn,
      "${data.aws_dynamodb_table.official_factory_status.arn}/index/*",
    ]
  }

  statement {
    sid    = "DynamoDBDailyReport"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
    ]
    resources = [
      data.terraform_remote_state.permanent.outputs.dynamodb_daily_report_arn,
    ]
  }

  statement {
    sid    = "S3ReadProcessedAndReports"
    effect = "Allow"
    actions = [
      "s3:GetObject",
    ]
    resources = [
      "arn:aws:s3:::${var.shared_data_bucket_name}/processed/*",
      "arn:aws:s3:::${var.shared_data_bucket_name}/reports/*",
    ]
  }

  statement {
    sid    = "S3ListReports"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::${var.shared_data_bucket_name}",
    ]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = [
        "reports/daily/*",
      ]
    }
  }

  statement {
    sid    = "SecretsManagerGet"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.rds.arn,
      aws_secretsmanager_secret.redis_auth.arn,
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.redis_url.arn,
    ]
  }

}

resource "aws_iam_role_policy" "ecs_task_inline" {
  name   = "${local.naming_prefix}-Policy-ECS-TaskRole"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_inline.json
}

# ---------------------------------------------------------------------------
# ECS Task Definition
# 0.5 vCPU / 1 GB, awsvpc, FARGATE, LINUX/X86_64
# Secrets injected at launch: DATABASE_URL, REDIS_URL (from Secrets Manager)
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix_lc}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "dashboard-backend"
      image     = local._backend_image
      essential = true

      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]

      # Non-sensitive configuration passed as environment variables.
      environment = [
        { name = "DDB_TABLE_STATUS", value = data.aws_dynamodb_table.official_factory_status.name },
        { name = "DDB_TABLE_REPORT", value = data.terraform_remote_state.permanent.outputs.dynamodb_daily_report_name },
        { name = "DASHBOARD_FACTORY_IDS", value = "factory-a,factory-b,factory-c" },
        { name = "DASHBOARD_FACTORY_DISCOVERY_MODE", value = "batch_get" },
        { name = "DASHBOARD_FACTORY_SCAN_LIMIT", value = "200" },
        { name = "DDB_CONNECT_TIMEOUT_SECONDS", value = "2" },
        { name = "DDB_READ_TIMEOUT_SECONDS", value = "5" },
        { name = "DDB_OPERATION_TIMEOUT_SECONDS", value = "12" },
        { name = "DDB_MAX_ATTEMPTS", value = "2" },
        { name = "DDB_MAX_POOL_CONNECTIONS", value = "20" },
        { name = "DDB_MAX_CONCURRENT_OPERATIONS", value = "10" },
        { name = "S3_BUCKET_DATA", value = var.shared_data_bucket_name },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "COGNITO_USER_POOL_ID", value = data.terraform_remote_state.permanent.outputs.cognito_user_pool_id },
        { name = "COGNITO_APP_CLIENT_ID", value = data.terraform_remote_state.permanent.outputs.cognito_app_client_id },
        { name = "COGNITO_JWKS_TIMEOUT_SECONDS", value = "5" },
        { name = "COGNITO_JWKS_TTL_SECONDS", value = "3600" },
        # REDIS_AUTH_TOKEN_SECRET_ARN: ARN only (not the token itself).
        { name = "REDIS_AUTH_TOKEN_SECRET_ARN", value = aws_secretsmanager_secret.redis_auth.arn },
        { name = "REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS", value = "2" },
        { name = "REDIS_SOCKET_TIMEOUT_SECONDS", value = "5" },
        { name = "REDIS_HEALTH_CHECK_INTERVAL_SECONDS", value = "30" },
        { name = "REDIS_PUBSUB_OPERATION_TIMEOUT_SECONDS", value = "6" },
        { name = "S3_CONNECT_TIMEOUT_SECONDS", value = "2" },
        { name = "S3_READ_TIMEOUT_SECONDS", value = "5" },
        { name = "S3_OPERATION_TIMEOUT_SECONDS", value = "12" },
        { name = "S3_MAX_ATTEMPTS", value = "2" },
        { name = "S3_MAX_POOL_CONNECTIONS", value = "10" },
      ]

      # Sensitive values injected from Secrets Manager at container launch.
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.database_url.arn
        },
        {
          name      = "REDIS_URL"
          valueFrom = aws_secretsmanager_secret.redis_url.arn
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      # Uses python (available in base image) to avoid curl dependency.
      healthCheck = {
        command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-ECS-TaskDef-Backend"
    Step = "7"
  })
}

# ---------------------------------------------------------------------------
# ECS Service
# desired_count=1, private_app subnets, deployment circuit breaker
# ALB target group wired in alb.tf (port 8000, health check /healthz)
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "backend" {
  name            = "${local.naming_prefix}-Service-Backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.ecs_backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [for s in aws_subnet.private_app : s.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "dashboard-backend"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Service-Backend"
    Step = "7"
  })

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }

  depends_on = [
    aws_iam_role_policy_attachment.ecs_task_execution_managed,
    aws_iam_role_policy.ecs_task_execution_secrets,
    aws_iam_role_policy.ecs_task_inline,
    aws_lb_listener.https,
  ]
}
