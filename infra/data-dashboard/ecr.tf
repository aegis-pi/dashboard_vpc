# ===========================================================================
# Phase 1 Step 7 — ECR repository: aegis/dashboard-backend
# Built/pushed by .github/workflows/dashboard-backend.yml via OIDC role below.
# ===========================================================================

resource "aws_ecr_repository" "dashboard_backend" {
  name                 = "aegis/dashboard-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-ECR-DashboardBackend"
    Step = "7"
  })
}

resource "aws_ecr_lifecycle_policy" "dashboard_backend" {
  repository = aws_ecr_repository.dashboard_backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain last 10 images; expire older ones"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# GitHub Actions OIDC role — ECR push for dashboard-backend.yml
# The OIDC provider is created by infra/foundation (workstream A).
# Referenced here as data source (count=0 if ARN is supplied via variable).
# AWS_OIDC_DASHBOARD_ROLE_ARN GitHub Secret = aws_iam_role.github_oidc_ecr_push.arn
# ---------------------------------------------------------------------------

data "aws_iam_openid_connect_provider" "github" {
  count = var.github_oidc_provider_arn == "" ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  _github_oidc_arn = (
    var.github_oidc_provider_arn != ""
    ? var.github_oidc_provider_arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

data "aws_iam_policy_document" "github_oidc_ecr_push_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local._github_oidc_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo_for_oidc}:*"]
    }
  }
}

resource "aws_iam_role" "github_oidc_ecr_push" {
  name               = "${local.naming_prefix}-IAMRole-OIDC-ECRPush"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_ecr_push_assume.json

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-IAMRole-OIDC-ECRPush"
    Step = "7"
  })
}

data "aws_iam_policy_document" "github_oidc_ecr_push_inline" {
  statement {
    sid       = "ECRGetToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "ECRPushDashboardBackend"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:DescribeRepositories",
    ]
    resources = [aws_ecr_repository.dashboard_backend.arn]
  }
}

resource "aws_iam_role_policy" "github_oidc_ecr_push" {
  name   = "${local.naming_prefix}-Policy-OIDC-ECRPush"
  role   = aws_iam_role.github_oidc_ecr_push.id
  policy = data.aws_iam_policy_document.github_oidc_ecr_push_inline.json
}
