# ===========================================================================
# Phase 1 — ECS Backend Application Auto Scaling
# ===========================================================================
# Why this exists (incident 2026-06-04, ~10:09-10:24 KST):
#   A single 0.5 vCPU (cpu=512) backend task saturated at ~100 req/min
#   (peak 102 req/min @ 100% CPU), producing 12-16s TargetResponseTime and
#   Target 5xx. Memory stayed <= ~40% -> CPU/concurrency was the bottleneck,
#   not memory. desired_count was fixed at 1 with no autoscaling, so a single
#   task absorbed every spike and a redeploy meant a 0-task window.
#   Per ADR 0030 the task was also right-sized to 1 vCPU (see ecs.tf /
#   var.ecs_backend_task_cpu), roughly doubling single-task capacity to
#   ~200 req/min; the target below stays at 40 (even more conservative now),
#   which is fine for a dev profile that is idle most of the time.
#
# Design (real-world practice, not CPU-70%-only):
#   * Primary policy = ALBRequestCountPerTarget. Requests are the LEADING
#     signal for a request-driven API; it scales out before CPU saturates.
#     target=40 req/target/min ~= 40% of the observed ~100 req/min saturation,
#     leaving room for the scale-out decision + Fargate task cold start.
#   * Safety-net policy = ECS average CPU at 50% (deliberately below 60-70%)
#     to cover CPU load that is not 1:1 with request count and to absorb
#     Target Tracking lag.
#   * min_capacity=2 -> HA across AZs AND immediate spike split: the same
#     100 req/min burst now lands as ~50/task, off the saturation knee.
#   * Asymmetric cooldowns: fast scale-out (60s), slow scale-in (300s) to
#     avoid flapping on bursty traffic.
#
# Demo profile (current default): max_capacity is pinned to min (2). Reactive
# autoscaling cannot react inside a short, bursty demo (metric 60s + Fargate
# cold start), so what matters is 2 warm, pre-warmed tasks already running.
# The two policies below stay in place but are inert while min==max; raising
# var.ecs_backend_max_capacity to 3-4 (sustained/production load) activates
# them without further code changes.
#
# Note: aws_ecs_service.backend has lifecycle.ignore_changes = [desired_count],
# so Terraform does not fight Application Auto Scaling. Registering this target
# with min_capacity=2 is what raises a desired=1 service to 2.
# ---------------------------------------------------------------------------

resource "aws_appautoscaling_target" "ecs_backend" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.ecs_backend_min_capacity
  max_capacity       = var.ecs_backend_max_capacity
}

# Primary (leading): scale on requests per target before CPU saturates.
resource "aws_appautoscaling_policy" "ecs_backend_requests" {
  name               = "${local.naming_prefix}-ScalingPolicy-Backend-Requests"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      # Format: <alb-arn-suffix>/<target-group-arn-suffix>
      resource_label = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.backend.arn_suffix}"
    }
    target_value       = var.ecs_backend_requests_per_target
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}

# Safety net: conservative CPU target for non-request-bound load + lag margin.
resource "aws_appautoscaling_policy" "ecs_backend_cpu" {
  name               = "${local.naming_prefix}-ScalingPolicy-Backend-CPU"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.ecs_backend_cpu_target
    scale_out_cooldown = 60
    scale_in_cooldown  = 300
  }
}
