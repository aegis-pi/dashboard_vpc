# ===========================================================================
# Security Groups — 5종
# 1. ALB:              internet → ALB (80/443)
# 2. ECS:              ALB → ECS task (8000)
# 3. RDS PostgreSQL:   ECS + Lambda notifier → RDS (5432)
# 4. Redis:            ECS + Lambda notifier → Redis (6379)
# 5. Lambda notifier:  VPC-attach, outbound to Redis + Secrets Manager + DDB endpoint
# ===========================================================================

# 1. ALB
resource "aws_security_group" "alb" {
  name        = "${local.naming_prefix}-SG-ALB"
  description = "Allow HTTP/HTTPS from internet to ALB"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidrs
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidrs
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-SG-ALB"
  })
}

# 2. ECS Fargate
resource "aws_security_group" "ecs" {
  name        = "${local.naming_prefix}-SG-ECS"
  description = "Allow traffic from ALB to ECS tasks on app port"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "App port from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-SG-ECS"
  })
}

# 5. Lambda notifier — declared before RDS/Redis so they can reference it
resource "aws_security_group" "lambda_notifier" {
  name        = "${local.naming_prefix}-SG-LambdaNotifier"
  description = "VPC-attached Lambda notifier: DDB Streams to Redis publish"
  vpc_id      = aws_vpc.this.id

  egress {
    description = "Allow all outbound (Redis, Secrets Manager via NAT, DDB Gateway endpoint)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-SG-LambdaNotifier"
  })
}

# 3. RDS PostgreSQL
resource "aws_security_group" "rds" {
  name        = "${local.naming_prefix}-SG-RDS"
  description = "Allow PostgreSQL from ECS tasks and Lambda notifier"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "PostgreSQL from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  ingress {
    description     = "PostgreSQL from Lambda notifier"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_notifier.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-SG-RDS"
  })
}

# 4. ElastiCache Redis
resource "aws_security_group" "redis" {
  name        = "${local.naming_prefix}-SG-Redis"
  description = "Allow Redis from ECS tasks and Lambda notifier"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  ingress {
    description     = "Redis from Lambda notifier"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_notifier.id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-SG-Redis"
  })
}
