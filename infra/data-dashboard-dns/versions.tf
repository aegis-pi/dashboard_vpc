terraform {
  required_version = ">= 1.9.0"

  backend "s3" {
    bucket       = "kjw-aegis-terraform-state"
    key          = "data-dashboard-dns/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
    encrypt      = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
