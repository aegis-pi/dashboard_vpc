# ===========================================================================
# Remote state — infra/data-dashboard-permanent/
# Provides read-only references to Cognito, ECR, DynamoDB daily_report,
# S3 web, CloudFront, ACM CloudFront cert, and OIDC roles after the
# permanent resource split (Step 9.5).
# ===========================================================================

data "terraform_remote_state" "permanent" {
  backend = "s3"

  config = {
    bucket = "kjw-aegis-terraform-state"
    key    = "data-dashboard-permanent/terraform.tfstate"
    region = "ap-south-1"
  }
}
