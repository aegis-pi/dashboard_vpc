# ===========================================================================
# DynamoDB — aegis-factory-status (LATEST + HISTORY unified table)
# PK: pk (S)  SK: sk (S)
# LATEST item   pk = "FACTORY#{factory_id}", sk = "LATEST"
# HISTORY items pk = "FACTORY#{factory_id}", sk = "HISTORY#STATE#{ISO8601}"
# TTL: 48h for HISTORY items (ttl attribute)
# ===========================================================================

resource "aws_dynamodb_table" "factory_status" {
  name         = "aegis-factory-status"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-DDB-FactoryStatus"
  })
}

# ===========================================================================
# DynamoDB — aegis-daily-report
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

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-DDB-DailyReport"
  })
}
