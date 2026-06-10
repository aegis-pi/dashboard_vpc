#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TF_ROOT="${REPO_ROOT}/infra/data-dashboard"
TF_DNS_ROOT="${REPO_ROOT}/infra/data-dashboard-dns"
TF_PERMANENT_ROOT="${REPO_ROOT}/infra/data-dashboard-permanent"
DOMAIN="${DASHBOARD_DOMAIN_NAME:-aegis-pi.cloud}"
OTP=""
PLAN_FILE="tfplan"

usage() {
  cat <<'USAGE'
Usage: scripts/build/build-data-dashboard.sh [--domain DOMAIN] [--otp OTP]

Builds the Workstream B Data/Dashboard Terraform root only.
It preflights the DNS/permanent roots, then applies the recreatable root.

Options:
  --domain DOMAIN  Dashboard base domain. Default: aegis-pi.cloud
  --otp OTP        MFA OTP if AWS_SESSION_TOKEN is not already set.
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

terraform_preflight() {
  local root="$1"

  terraform -chdir="${root}" init
  terraform -chdir="${root}" fmt -check
  terraform -chdir="${root}" validate
}

cleanup_pending_secret() {
  local name="$1"
  local deleted_date

  deleted_date="$(aws secretsmanager list-secrets \
    --region "${AWS_REGION:-ap-south-1}" \
    --include-planned-deletion \
    --query "SecretList[?Name=='${name}'].DeletedDate | [0]" \
    --output text)"

  if [[ "${deleted_date}" != "None" && -n "${deleted_date}" ]]; then
    echo "Force deleting pending secret to unblock recreate: ${name}"
    aws secretsmanager delete-secret \
      --region "${AWS_REGION:-ap-south-1}" \
      --secret-id "${name}" \
      --force-delete-without-recovery >/dev/null

    for _ in {1..30}; do
      if ! aws secretsmanager describe-secret \
        --region "${AWS_REGION:-ap-south-1}" \
        --secret-id "${name}" >/dev/null 2>&1; then
        return 0
      fi
      sleep 2
    done

    echo "Secret is still visible after force delete: ${name}" >&2
    echo "Wait a minute and rerun this script if Terraform create fails with a name conflict." >&2
  fi
}

cleanup_pending_secret "kjw-aegis-data-rds-master"
cleanup_pending_secret "kjw-aegis-data-redis-auth"

terraform_preflight "${TF_DNS_ROOT}"
terraform_preflight "${TF_PERMANENT_ROOT}"
terraform_preflight "${TF_ROOT}"
terraform -chdir="${TF_ROOT}" plan \
  -var="dashboard_domain_name=${DOMAIN}" \
  -out="${PLAN_FILE}"
terraform -chdir="${TF_ROOT}" apply "${PLAN_FILE}"
rm -f "${TF_ROOT}/${PLAN_FILE}"
