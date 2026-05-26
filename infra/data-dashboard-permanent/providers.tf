provider "aws" {
  region = var.aws_region
}

# CloudFront ACM certificates must be provisioned in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
