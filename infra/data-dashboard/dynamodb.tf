# ===========================================================================
# DynamoDB — 공식 hot store: AEGIS-DynamoDB-FactoryStatus (ADR 0022)
# 기존 실데이터 table. data source로만 참조 (Terraform 관리 대상 아님).
# PK: pk (S)  SK: sk (S)
# LATEST item   pk = "FACTORY#{factory_id}", sk = "LATEST"
# HISTORY items pk = "FACTORY#{factory_id}", sk = "HISTORY#*#{ISO8601}"
# Streams: NEW_AND_OLD_IMAGES (활성화 2026-05-21, aws dynamodb update-table 직접 적용)
# ===========================================================================

data "aws_dynamodb_table" "official_factory_status" {
  name = "AEGIS-DynamoDB-FactoryStatus"
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
