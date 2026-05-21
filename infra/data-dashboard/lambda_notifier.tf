# ===========================================================================
# Phase 1 Step 5 — Lambda notifier: DDB Streams → Redis PUBLISH
# VPC-attached: Private App Subnet, lambda_notifier SG
# DLQ: SQS (on_failure destination)
# ===========================================================================

# ---------------------------------------------------------------------------
# SQS Dead-Letter Queue
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "notifier_dlq" {
  name                      = "${local.name_prefix_lc}-notifier-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-SQS-NotifierDLQ"
    Step = "5"
  })
}

# ---------------------------------------------------------------------------
# IAM — trust policy
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_notifier_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_notifier" {
  name               = "${local.naming_prefix}-IAMRole-Lambda-notifier"
  assume_role_policy = data.aws_iam_policy_document.lambda_notifier_assume.json

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-IAMRole-Lambda-notifier"
  })
}

# VPC-attached Lambda needs ENI management + CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_notifier_vpc_exec" {
  role       = aws_iam_role.lambda_notifier.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# ---------------------------------------------------------------------------
# IAM — inline least-privilege policy
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_notifier_inline" {
  statement {
    sid    = "DDBStreamsRead"
    effect = "Allow"
    actions = [
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
      "dynamodb:DescribeStream",
    ]
    resources = [aws_dynamodb_table.factory_status.stream_arn]
  }

  statement {
    sid       = "DDBListStreams"
    effect    = "Allow"
    actions   = ["dynamodb:ListStreams"]
    resources = [aws_dynamodb_table.factory_status.arn]
  }

  statement {
    sid       = "SecretsManagerRedisAuth"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.redis_auth.arn]
  }

  statement {
    sid       = "SQSDeadLetter"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.notifier_dlq.arn]
  }
}

resource "aws_iam_role_policy" "lambda_notifier_inline" {
  name   = "${local.naming_prefix}-Policy-Lambda-notifier"
  role   = aws_iam_role.lambda_notifier.id
  policy = data.aws_iam_policy_document.lambda_notifier_inline.json
}

# ---------------------------------------------------------------------------
# Build — pip install into .build/package/ and copy handler
# Re-runs when lambda_function.py or requirements.txt change.
# ---------------------------------------------------------------------------

resource "null_resource" "lambda_notifier_build" {
  triggers = {
    source = filesha256("${path.root}/../../apps/lambda-notifier/lambda_function.py")
    reqs   = filesha256("${path.root}/../../apps/lambda-notifier/requirements.txt")
  }

  provisioner "local-exec" {
    command     = "pip install -r requirements.txt -t .build/package -q && cp lambda_function.py .build/package/"
    working_dir = abspath("${path.root}/../../apps/lambda-notifier")
  }
}

# ---------------------------------------------------------------------------
# Packaging
# ---------------------------------------------------------------------------

data "archive_file" "notifier" {
  depends_on  = [null_resource.lambda_notifier_build]
  type        = "zip"
  source_dir  = "${path.root}/../../apps/lambda-notifier/.build/package"
  output_path = "${path.root}/../../apps/lambda-notifier/.build/lambda_notifier.zip"
}

# ---------------------------------------------------------------------------
# Lambda function
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "notifier" {
  function_name    = "${local.naming_prefix}-Lambda-notifier"
  description      = "Aegis notifier: DDB Streams LATEST → Redis PUBLISH factory:update:{factory_id}"
  filename         = data.archive_file.notifier.output_path
  source_code_hash = data.archive_file.notifier.output_base64sha256

  role        = aws_iam_role.lambda_notifier.arn
  runtime     = "python3.12"
  handler     = "lambda_function.handler"
  timeout     = 30
  memory_size = 256

  vpc_config {
    subnet_ids         = [for s in aws_subnet.private_app : s.id]
    security_group_ids = [aws_security_group.lambda_notifier.id]
  }

  environment {
    variables = {
      REDIS_HOST             = aws_elasticache_replication_group.this.primary_endpoint_address
      REDIS_PORT             = "6379"
      REDIS_AUTH_SECRET_NAME = aws_secretsmanager_secret.redis_auth.name
    }
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Lambda-notifier"
    Step = "5"
  })
}

# ---------------------------------------------------------------------------
# DDB Streams Event Source Mapping
# ---------------------------------------------------------------------------

resource "aws_lambda_event_source_mapping" "ddb_streams_notifier" {
  event_source_arn               = aws_dynamodb_table.factory_status.stream_arn
  function_name                  = aws_lambda_function.notifier.arn
  starting_position              = "LATEST"
  batch_size                     = 10
  maximum_retry_attempts         = 3
  bisect_batch_on_function_error = true

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.notifier_dlq.arn
    }
  }
}
