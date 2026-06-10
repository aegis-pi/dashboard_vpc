#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_ROOT="${REPO_ROOT}/infra/data-dashboard"
DOMAIN="${DASHBOARD_DOMAIN_NAME:-aegis-pi.cloud}"
OTP=""
ASSUME_YES="false"
PLAN_FILE="tfplan.destroy"

usage() {
  cat <<'USAGE'
Usage: scripts/destroy/destroy-data-dashboard.sh [--domain DOMAIN] [--otp OTP] [--yes]

Destroys the Workstream B Data/Dashboard Terraform root only.
DNS/permanent roots are not destroyed.

Options:
  --domain DOMAIN  Dashboard base domain. Default: aegis-pi.cloud
  --otp OTP        MFA OTP if AWS_SESSION_TOKEN is not already set.
  --yes            Skip the interactive confirmation prompt.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --otp)
      OTP="${2:-}"
      shift 2
      ;;
    --yes|-y)
      ASSUME_YES="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${DOMAIN}" ]]; then
  echo "--domain or DASHBOARD_DOMAIN_NAME is required" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/lib/config.sh"
aegis_load_config "${REPO_ROOT}"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/lib/aws-mfa.sh"

aegis_ensure_aws_mfa "${OTP}"

if [[ "${ASSUME_YES}" != "true" ]]; then
  cat <<EOF
This will destroy only infra/data-dashboard for ${DOMAIN}.

Destroyed:
  - VPC, NAT Gateway, ALB, ECS service/cluster, runtime RDS/Redis
  - Lambda data processor/notifier, runtime secrets, API DNS records

Kept:
  - infra/data-dashboard-dns: Route53 hosted zone
  - infra/data-dashboard-permanent: Cognito, ECR, S3 web, CloudFront, report table
  - shared Foundation resources such as aegis-bucket-data and AEGIS-DynamoDB-FactoryStatus
  - RDS final snapshot

EOF
  read -r -p "Type destroy-data-dashboard to continue: " CONFIRM
  if [[ "${CONFIRM}" != "destroy-data-dashboard" ]]; then
    echo "Aborted." >&2
    exit 1
  fi
fi

terraform -chdir="${TF_ROOT}" init
terraform -chdir="${TF_ROOT}" validate
terraform -chdir="${TF_ROOT}" plan -destroy \
  -var="dashboard_domain_name=${DOMAIN}" \
  -out="${PLAN_FILE}"
terraform -chdir="${TF_ROOT}" apply "${PLAN_FILE}"
rm -f "${TF_ROOT}/${PLAN_FILE}"
