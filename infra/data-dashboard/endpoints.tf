# S3 and DynamoDB Gateway Endpoints allow ECS tasks and Lambda (VPC-attached)
# to reach these managed services without traversing the NAT Gateway (free).

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [
    aws_route_table.public.id,
    aws_route_table.private.id,
  ]

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-VPCEndpoint-S3"
  })
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [
    aws_route_table.public.id,
    aws_route_table.private.id,
  ]

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-VPCEndpoint-DynamoDB"
  })
}
