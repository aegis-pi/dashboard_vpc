# ===========================================================================
# Lambda — data processor
# Source: apps/data-processor
# Runtime: Python 3.12
# Handler: lambda_function.handler
# No VPC attach (DynamoDB/S3 via public endpoint + Gateway Endpoint)
# ===========================================================================

data "archive_file" "data_processor" {
  type        = "zip"
  source_dir  = "${path.root}/../../apps/data-processor"
  output_path = "${path.root}/../../apps/data-processor/.build/data_processor.zip"

  excludes = [
    ".pytest_cache/**",
    "tests/**",
    "__pycache__/**",
    "*.pyc",
    ".build/**",
    "requirements.txt",
  ]
}

resource "aws_lambda_function" "data_processor" {
  function_name    = "${local.naming_prefix}-Lambda-data-processor"
  description      = "Aegis data processor: IoT payload → DynamoDB LATEST/HISTORY + S3 processed"
  filename         = data.archive_file.data_processor.output_path
  source_code_hash = data.archive_file.data_processor.output_base64sha256

  role        = aws_iam_role.lambda_data_processor.arn
  runtime     = "python3.12"
  handler     = "lambda_function.handler"
  timeout     = 30
  memory_size = 256

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = data.aws_dynamodb_table.official_factory_status.name
      S3_BUCKET_NAME      = "aegis-bucket-data"
      HISTORY_TTL_HOURS   = "48"
    }
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Lambda-data-processor"
    Step = "4"
  })
}
