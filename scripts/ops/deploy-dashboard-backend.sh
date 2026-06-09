#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-611058323802}"
ECR_REPOSITORY="${ECR_REPOSITORY:-aegis/dashboard-backend}"
ECR_REGISTRY="${ECR_REGISTRY:-${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com}"
ECS_CLUSTER="${ECS_CLUSTER:-KJW-AEGIS-Data-ECSCluster}"
ECS_SERVICE="${ECS_SERVICE:-KJW-AEGIS-Data-Service-Backend}"
ECS_TASK_FAMILY="${ECS_TASK_FAMILY:-kjw-aegis-data-backend}"
DASHBOARD_DOMAIN_NAME="${DASHBOARD_DOMAIN_NAME:-aegis-pi.cloud}"
API_BASE_URL="${API_BASE_URL:-https://api.${DASHBOARD_DOMAIN_NAME}}"
WEB_BASE_URL="${WEB_BASE_URL:-https://dashboard.${DASHBOARD_DOMAIN_NAME}}"
TF_DIR="${TF_DIR:-${REPO_ROOT}/infra/data-dashboard}"

usage() {
  cat <<USAGE
Usage: $0 <sha-tag|git-sha|image-uri>

Examples:
  $0 sha-acd6717
  $0 acd6717
  $0 ${ECR_REGISTRY}/${ECR_REPOSITORY}:sha-acd6717

Environment:
  AWS_REGION              Default: ${AWS_REGION}
  AWS_ACCOUNT_ID          Default: ${AWS_ACCOUNT_ID}
  ECR_REPOSITORY          Default: ${ECR_REPOSITORY}
  ECS_CLUSTER             Default: ${ECS_CLUSTER}
  ECS_SERVICE             Default: ${ECS_SERVICE}
  ECS_TASK_FAMILY         Default: ${ECS_TASK_FAMILY}
  DASHBOARD_DOMAIN_NAME   Default: ${DASHBOARD_DOMAIN_NAME}
  API_BASE_URL            Default: ${API_BASE_URL}
  WEB_BASE_URL            Default: ${WEB_BASE_URL}
  TF_DIR                  Default: ${TF_DIR}
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "required command not found: $1" >&2
    exit 127
  fi
}

normalize_image() {
  local value="$1"
  local tag

  if [[ "$value" == *":"* && "$value" == */* ]]; then
    IMAGE_URI="$value"
    tag="${value##*:}"
  elif [[ "$value" =~ ^sha-[0-9a-fA-F]{7,40}$ ]]; then
    tag="sha-${value#sha-}"
    IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY}:${tag}"
  elif [[ "$value" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    tag="sha-${value}"
    IMAGE_URI="${ECR_REGISTRY}/${ECR_REPOSITORY}:${tag}"
  else
    echo "invalid image tag: $value" >&2
    echo "expected sha-<7+ hex>, <7+ hex>, or a full ECR image URI" >&2
    exit 2
  fi

  if [[ "$tag" == "latest" ]]; then
    echo "refusing to deploy mutable tag: latest" >&2
    exit 2
  fi
  if [[ ! "$tag" =~ ^sha-[0-9a-fA-F]{7,40}$ ]]; then
    echo "refusing to deploy non-sha tag: $tag" >&2
    exit 2
  fi

  IMAGE_TAG="$tag"
}

if [[ $# -ne 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd aws
require_cmd curl
require_cmd terraform

normalize_image "$1"

echo "Deploying Dashboard backend image:"
echo "  image: ${IMAGE_URI}"
echo "  cluster: ${ECS_CLUSTER}"
echo "  service: ${ECS_SERVICE}"

echo
echo "Checking ECR image tag..."
aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-ids "imageTag=${IMAGE_TAG}" \
  --query 'imageDetails[0].{digest:imageDigest,pushed:imagePushedAt,tags:imageTags}' \
  --output json

echo
echo "Validating Terraform root..."
terraform -chdir="$TF_DIR" validate

echo
echo "Registering task definition with Terraform..."
terraform -chdir="$TF_DIR" apply \
  -auto-approve \
  -input=false \
  -var "dashboard_domain_name=${DASHBOARD_DOMAIN_NAME}" \
  -var "backend_container_image=${IMAGE_URI}"

TASK_DEFINITION_ARN="$(
  aws ecs describe-task-definition \
    --region "$AWS_REGION" \
    --task-definition "$ECS_TASK_FAMILY" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text
)"

TASK_IMAGE="$(
  aws ecs describe-task-definition \
    --region "$AWS_REGION" \
    --task-definition "$TASK_DEFINITION_ARN" \
    --query 'taskDefinition.containerDefinitions[0].image' \
    --output text
)"

if [[ "$TASK_IMAGE" != "$IMAGE_URI" ]]; then
  echo "task definition image mismatch" >&2
  echo "  expected: $IMAGE_URI" >&2
  echo "  actual:   $TASK_IMAGE" >&2
  exit 1
fi

echo
echo "Updating ECS service to ${TASK_DEFINITION_ARN}..."
aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$TASK_DEFINITION_ARN" \
  --force-new-deployment \
  --query 'service.{taskDefinition:taskDefinition,desired:desiredCount,running:runningCount,deployments:deployments[].{status:status,rolloutState:rolloutState,taskDefinition:taskDefinition,desired:desiredCount,running:runningCount}}' \
  --output json

echo
echo "Waiting for ECS service stability..."
aws ecs wait services-stable \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE"

aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].{taskDefinition:taskDefinition,desired:desiredCount,running:runningCount,deployments:deployments[].{status:status,rolloutState:rolloutState,taskDefinition:taskDefinition,desired:desiredCount,running:runningCount}}' \
  --output json

echo
echo "Checking running task images..."
mapfile -t TASK_ARNS < <(
  aws ecs list-tasks \
    --region "$AWS_REGION" \
    --cluster "$ECS_CLUSTER" \
    --service-name "$ECS_SERVICE" \
    --desired-status RUNNING \
    --query 'taskArns[]' \
    --output text | tr '\t' '\n'
)

if [[ "${#TASK_ARNS[@]}" -eq 0 ]]; then
  echo "no running ECS tasks found" >&2
  exit 1
fi

aws ecs describe-tasks \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --tasks "${TASK_ARNS[@]}" \
  --query 'tasks[].{taskDefinition:taskDefinitionArn,lastStatus:lastStatus,containers:containers[].{name:name,image:image,lastStatus:lastStatus,healthStatus:healthStatus}}' \
  --output json

TARGET_GROUP_ARN="$(
  terraform -chdir="$TF_DIR" output -raw backend_target_group_arn 2>/dev/null || true
)"

if [[ -n "$TARGET_GROUP_ARN" ]]; then
  echo
  echo "Checking ALB target health..."
  aws elbv2 describe-target-health \
    --region "$AWS_REGION" \
    --target-group-arn "$TARGET_GROUP_ARN" \
    --query 'TargetHealthDescriptions[].{target:Target.Id,port:Target.Port,state:TargetHealth.State,reason:TargetHealth.Reason}' \
    --output json
fi

echo
echo "Checking API health endpoints..."
curl -fsS "${API_BASE_URL}/healthz"
echo
curl -fsS "${API_BASE_URL}/readyz"
echo

echo
echo "Checking unauthenticated /chat/query returns 401..."
CHAT_STATUS="$(
  curl -sS -o /tmp/aegis-dashboard-chat-query-response.json -w '%{http_code}' \
    -X POST "${API_BASE_URL}/chat/query" \
    -H 'content-type: application/json' \
    --data '{"question":"factory-a 왜 위험해?","model_tier":"fast"}'
)"
if [[ "$CHAT_STATUS" != "401" ]]; then
  echo "unexpected /chat/query status: ${CHAT_STATUS}" >&2
  cat /tmp/aegis-dashboard-chat-query-response.json >&2
  echo >&2
  exit 1
fi
echo "status: ${CHAT_STATUS}"

echo
echo "Checking Dashboard web /chat route..."
WEB_STATUS="$(curl -sS -o /tmp/aegis-dashboard-chat.html -w '%{http_code}' "${WEB_BASE_URL}/chat")"
if [[ "$WEB_STATUS" != "200" ]]; then
  echo "unexpected /chat web status: ${WEB_STATUS}" >&2
  exit 1
fi
echo "status: ${WEB_STATUS}"

echo
echo "Checking post-apply Terraform plan..."
set +e
terraform -chdir="$TF_DIR" plan \
  -detailed-exitcode \
  -input=false \
  -var "dashboard_domain_name=${DASHBOARD_DOMAIN_NAME}" \
  -var "backend_container_image=${IMAGE_URI}"
PLAN_EXIT=$?
set -e

case "$PLAN_EXIT" in
  0)
    echo "post-apply plan: No changes"
    ;;
  2)
    echo "post-apply plan has changes" >&2
    exit 1
    ;;
  *)
    echo "post-apply plan failed with exit code ${PLAN_EXIT}" >&2
    exit "$PLAN_EXIT"
    ;;
esac

echo
echo "Dashboard backend deployment completed: ${IMAGE_TAG}"
