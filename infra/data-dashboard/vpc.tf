# ===========================================================================
# VPC
# ===========================================================================

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-VPC"
  })
}

# ===========================================================================
# Subnets — Public (IGW-routed, NAT GW placement)
# ===========================================================================

resource "aws_subnet" "public" {
  for_each = local.zone_config

  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.public_cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = true

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Subnet-public-${each.key}"
    Tier = "public"
  })
}

# ===========================================================================
# Subnets — Private App (ECS Fargate, Redis, Lambda notifier)
# ===========================================================================

resource "aws_subnet" "private_app" {
  for_each = local.zone_config

  vpc_id            = aws_vpc.this.id
  cidr_block        = each.value.private_app_cidr
  availability_zone = each.value.az

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Subnet-private-app-${each.key}"
    Tier = "private-app"
  })
}

# ===========================================================================
# Subnets — Private Data (RDS PostgreSQL)
# ===========================================================================

resource "aws_subnet" "private_data" {
  for_each = local.zone_config

  vpc_id            = aws_vpc.this.id
  cidr_block        = each.value.private_data_cidr
  availability_zone = each.value.az

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-Subnet-private-data-${each.key}"
    Tier = "private-data"
  })
}

# ===========================================================================
# Internet Gateway
# ===========================================================================

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-IGW"
  })
}

# ===========================================================================
# NAT Gateway — single AZ (cost-saving; ADR 0012)
# Placed in the first public subnet (Azone)
# ===========================================================================

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-EIP-NAT"
  })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[local.zone_names[0]].id

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-NAT-public-${local.zone_names[0]}"
  })

  depends_on = [aws_internet_gateway.this]
}

# ===========================================================================
# Route Tables
# ===========================================================================

# Public: 0.0.0.0/0 → IGW
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-RouteTable-public"
  })
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# Private: 0.0.0.0/0 → single NAT GW (shared by all private subnets)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-RouteTable-private"
  })
}

resource "aws_route_table_association" "private_app" {
  for_each = aws_subnet.private_app

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_data" {
  for_each = aws_subnet.private_data

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
