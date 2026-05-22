# ===========================================================================
# IAM — Lambda data processor
# Trust: lambda.amazonaws.com
# Permissions: CloudWatch Logs, DynamoDB (AEGIS-DynamoDB-FactoryStatus), S3 processed/*
# ===========================================================================

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ---------------------------------------------------------------------------
# Trust policy
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_data_processor_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_data_processor" {
  name               = "${local.naming_prefix}-IAMRole-Lambda-data-processor"
  assume_role_policy = data.aws_iam_policy_document.lambda_data_processor_assume.json

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-IAMRole-Lambda-data-processor"
  })
}

# ---------------------------------------------------------------------------
# Managed policy: basic Lambda execution (CloudWatch Logs)
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "lambda_data_processor_basic" {
  role       = aws_iam_role.lambda_data_processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------------------
# Inline policy: least-privilege DynamoDB + S3
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_data_processor_inline" {
  statement {
    sid    = "DynamoDBFactoryStatus"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]

    resources = [
      data.aws_dynamodb_table.official_factory_status.arn,
    ]
  }

  statement {
    sid    = "S3ProcessedWrite"
    effect = "Allow"

    actions = [
      "s3:PutObject",
    ]

    resources = [
      "arn:aws:s3:::aegis-bucket-data/processed/*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_data_processor_inline" {
  name   = "${local.naming_prefix}-Policy-Lambda-data-processor"
  role   = aws_iam_role.lambda_data_processor.id
  policy = data.aws_iam_policy_document.lambda_data_processor_inline.json
}
