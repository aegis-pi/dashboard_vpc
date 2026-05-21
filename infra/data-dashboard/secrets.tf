# ===========================================================================
# Random password generators
# Values are sensitive and never output to plan/apply logs.
# ===========================================================================

resource "random_password" "rds_master" {
  length  = 32
  special = false
}

resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# ===========================================================================
# Secrets Manager — RDS PostgreSQL master credentials
# Stores: engine / host / port / dbname / username / password
# ===========================================================================

resource "aws_secretsmanager_secret" "rds" {
  name                    = "${local.name_prefix_lc}-rds-master"
  description             = "RDS PostgreSQL master credentials for ${local.naming_prefix}"
  recovery_window_in_days = 7

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Secret-RDS"
  })
}

resource "aws_secretsmanager_secret_version" "rds" {
  secret_id = aws_secretsmanager_secret.rds.id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.this.address
    port     = aws_db_instance.this.port
    dbname   = aws_db_instance.this.db_name
    username = aws_db_instance.this.username
    password = random_password.rds_master.result
  })
}

# ===========================================================================
# Secrets Manager — ElastiCache Redis AUTH token
# Stores: raw token string
# ===========================================================================

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "${local.name_prefix_lc}-redis-auth"
  description             = "ElastiCache Redis AUTH token for ${local.naming_prefix}"
  recovery_window_in_days = 7

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Secret-RedisAuth"
  })
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis_auth_token.result
}
