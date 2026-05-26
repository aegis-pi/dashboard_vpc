# ===========================================================================
# DynamoDB — aegis-daily-report (permanent: report history must not be lost)
# PK: report_date (S, YYYY-MM-DD)  SK: factory_id (S)
# ===========================================================================

resource "aws_dynamodb_table" "daily_report" {
  name         = "aegis-daily-report"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "report_date"
  range_key    = "factory_id"

  attribute {
    name = "report_date"
    type = "S"
  }

  attribute {
    name = "factory_id"
    type = "S"
  }

  deletion_protection_enabled = true

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-DDB-DailyReport"
  })

  lifecycle {
    prevent_destroy = true
  }
}
