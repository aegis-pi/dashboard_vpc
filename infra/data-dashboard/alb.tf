# ===========================================================================
# Application Load Balancer — internet-facing, HTTPS termination
# ===========================================================================

resource "aws_lb" "this" {
  name               = "${local.name_prefix_lc}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for sn in aws_subnet.public : sn.id]

  enable_deletion_protection = false

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-ALB"
  })
}

# ---------------------------------------------------------------------------
# Target Group — ECS Fargate tasks (IP target type, HTTP on 8000)
# ---------------------------------------------------------------------------

resource "aws_lb_target_group" "backend" {
  name        = "${local.name_prefix_lc}-tg-backend"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.this.id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.tags, {
    Name = "${local.naming_prefix}-TG-Backend"
  })
}

# ---------------------------------------------------------------------------
# HTTP listener — redirect to HTTPS
# ---------------------------------------------------------------------------

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ---------------------------------------------------------------------------
# HTTPS listener — forward to Backend target group
# Certificate ARN is resolved after ACM validation completes.
# ---------------------------------------------------------------------------

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
