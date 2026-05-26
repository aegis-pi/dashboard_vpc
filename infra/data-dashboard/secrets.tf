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
  recovery_window_in_days = 0

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
  recovery_window_in_days = 0

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Secret-RedisAuth"
  })
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis_auth_token.result
}

# ===========================================================================
# Secrets Manager — ECS-injected connection URLs (Step 7)
# ECS task execution role reads these to inject DATABASE_URL / REDIS_URL
# as container environment variables at launch (never written to logs).
# ===========================================================================

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix_lc}-database-url"
  description             = "Full PostgreSQL async URL injected into ECS backend container"
  recovery_window_in_days = 0

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Secret-DatabaseURL"
    Step = "7"
  })
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql+asyncpg://${aws_db_instance.this.username}:${random_password.rds_master.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}"
}

resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "${local.name_prefix_lc}-redis-url"
  description             = "Full Redis TLS+AUTH URL injected into ECS backend container"
  recovery_window_in_days = 0

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Secret-RedisURL"
    Step = "7"
  })
}

# ElastiCache with transit_encryption=true requires rediss:// (TLS scheme).
resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
}
