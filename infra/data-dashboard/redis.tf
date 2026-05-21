# ===========================================================================
# ElastiCache Subnet Group — Private App Subnets × 2
# ADR 0014: Redis for cache (Cache-Aside) + WebSocket Pub/Sub fan-out
# ===========================================================================

resource "aws_elasticache_subnet_group" "this" {
  name        = "${local.name_prefix_lc}-redis-subnet-group"
  description = "Private App subnets for ${local.naming_prefix} Redis"
  subnet_ids  = [for s in aws_subnet.private_app : s.id]

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Redis-SubnetGroup"
  })
}

# ===========================================================================
# ElastiCache Redis — single node, TLS in-transit, AUTH token
# replication_group_id must be lowercase and ≤ 40 chars
# ===========================================================================

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "kjw-aegis-data-redis"
  description          = "${local.naming_prefix} Redis: API cache and WebSocket Pub/Sub"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.micro"

  num_cache_clusters = 1

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  automatic_failover_enabled = false
  multi_az_enabled           = false

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Redis"
  })
}
