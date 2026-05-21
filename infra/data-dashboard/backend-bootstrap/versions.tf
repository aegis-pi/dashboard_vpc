terraform {
  required_version = ">= 1.9.0"

  # Bootstrap root intentionally uses local state.
  # Run this apply once; the resulting S3 bucket becomes the backend
  # for infra/data-dashboard/ and uses S3 native lockfiles.

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
