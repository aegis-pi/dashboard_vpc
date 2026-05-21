# ===========================================================================
# IoT Rules — data processor trigger (Step 4, ADR 0021)
#
# 두 개의 신규 Rule로 분리한다. AWS IoT SQL의 FROM 절은 단일 topic pattern만
# 지원하므로 factory_state / infra_state를 각 Rule로 독립 처리한다.
#
# 기존 Rule AEGIS_IoTRule_factory_a_raw_s3 는 변경하지 않는다.
# ===========================================================================

# ---------------------------------------------------------------------------
# Rule 1: factory_state → Lambda data processor
# ---------------------------------------------------------------------------

resource "aws_iot_topic_rule" "factory_state_processor" {
  name        = "KJW_AEGIS_Data_IoTRule_factory_state_processor"
  description = "Route aegis/+/factory_state to Lambda data processor (worktream B, ADR 0021)"
  enabled     = true
  sql         = "SELECT * FROM 'aegis/+/factory_state'"
  sql_version = "2016-03-23"

  lambda {
    function_arn = aws_lambda_function.data_processor.arn
  }

  tags = merge(local.tags, {
    Name = "KJW_AEGIS_Data_IoTRule_factory_state_processor"
    Step = "4"
  })
}

resource "aws_lambda_permission" "iot_factory_state" {
  statement_id  = "AllowIoTInvoke-factory-state"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.data_processor.function_name
  principal     = "iot.amazonaws.com"
  source_arn    = aws_iot_topic_rule.factory_state_processor.arn
}

# ---------------------------------------------------------------------------
# Rule 2: infra_state → Lambda data processor
# ---------------------------------------------------------------------------

resource "aws_iot_topic_rule" "infra_state_processor" {
  name        = "KJW_AEGIS_Data_IoTRule_infra_state_processor"
  description = "Route aegis/+/infra_state to Lambda data processor (workstream B, ADR 0021)"
  enabled     = true
  sql         = "SELECT * FROM 'aegis/+/infra_state'"
  sql_version = "2016-03-23"

  lambda {
    function_arn = aws_lambda_function.data_processor.arn
  }

  tags = merge(local.tags, {
    Name = "KJW_AEGIS_Data_IoTRule_infra_state_processor"
    Step = "4"
  })
}

resource "aws_lambda_permission" "iot_infra_state" {
  statement_id  = "AllowIoTInvoke-infra-state"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.data_processor.function_name
  principal     = "iot.amazonaws.com"
  source_arn    = aws_iot_topic_rule.infra_state_processor.arn
}
