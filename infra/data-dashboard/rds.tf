# ===========================================================================
# DB Subnet Group — Private Data Subnets × 2 (ap-south-1a, ap-south-1c)
# ===========================================================================

resource "aws_db_subnet_group" "this" {
  name        = "${local.name_prefix_lc}-rds-subnet-group"
  description = "Private Data subnets for ${local.naming_prefix} RDS PostgreSQL"
  subnet_ids  = [for s in aws_subnet.private_data : s.id]

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-RDS-SubnetGroup"
  })
}

resource "random_id" "rds_final_snapshot" {
  byte_length = 4
}

# ===========================================================================
# RDS PostgreSQL — db.t4g.micro, Single-AZ, gp3 20 GiB
# ADR 0017: PostgreSQL for relational metadata (factories, users, alerts)
# ===========================================================================

resource "aws_db_instance" "this" {
  identifier = "${local.name_prefix_lc}-pg"

  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"

  db_name  = "aegisdata"
  username = "aegisadmin"
  password = random_password.rds_master.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = false
  publicly_accessible = false
  deletion_protection = false

  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix_lc}-pg-final-${random_id.rds_final_snapshot.hex}"

  backup_retention_period = 7
  apply_immediately       = true

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-RDS-PostgreSQL"
  })
}
