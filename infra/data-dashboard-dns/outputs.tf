# ===========================================================================
# Outputs — consumed by infra/data-dashboard (data source lookup) and
#            scripts/build/build-data-dashboard.sh (NS delegation check)
# ===========================================================================

output "route53_zone_id" {
  description = "Route53 Hosted Zone ID for the Dashboard domain. Reference this from infra/data-dashboard via data source."
  value       = aws_route53_zone.dashboard.zone_id
}

output "route53_name_servers" {
  description = "Name servers for Gabia DNS delegation. These must NOT change across infra/data-dashboard destroy/apply cycles."
  value       = aws_route53_zone.dashboard.name_servers
}
