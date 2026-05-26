ID:        0024
제목:      data-dashboard-permanent-resource-split
상태:      accepted
결정일:    2026-05-26
영향 범위: Phase 1 Step 9.5, infra/data-dashboard 신규 infra/data-dashboard-permanent/ 분리, destroy/apply 사이클, 비용

## 기존 계획

infra/data-dashboard/ 단일 Terraform root가 모든 1번 VPC 리소스를 관리한다.
infra/data-dashboard destroy 시 Cognito User Pool, ECR repository, OIDC roles, S3 web bucket, CloudFront, ACM CloudFront cert, Route53 dashboard record 등이 함께 삭제된다.

Step 7.5에서 Route53 Hosted Zone은 infra/data-dashboard-dns/ 영구 root로 분리했다(ADR 0024 이전 조치, 완료).

## 변경된 실제 기준

destroy/apply 반복 시 재설정 비용이 큰 자원을 infra/data-dashboard-permanent/ 신규 영구 root로 분리한다.

영구 root는 infra/data-dashboard destroy 후에도 살아 있어야 한다.

## 영구화 분류

### 그룹 A — 무조건 영구화

| 리소스 | 영구화 이유 |
| --- | --- |
| Cognito User Pool / App Client / Hosted UI Domain | destroy 후 동일 도메인 prefix 재생성 시 AWS 내부 유예 기간(~15일) 충돌. 관리자 계정 소멸 |
| DynamoDB `aegis-daily-report` | 보고서 이력 소멸. on-demand 비용 미발생 |
| ECR `aegis/dashboard-backend` + lifecycle policy | 이미지 push 이력 삭제. role ARN 변경 시 GitHub Secret 재등록 필요 |
| GitHub OIDC roles (ECR push, web deploy) | role ARN 변경 시 GitHub Secret / Variable 재등록 필요 |

### 그룹 B — 영구화 강력 권장

| 리소스 | 영구화 이유 |
| --- | --- |
| S3 Web bucket `kjw-aegis-data-web` | bucket name 전역 고유. 삭제 후 이름 재확보 지연 가능. 빌드 산출물 제거 |
| CloudFront distribution + OAC | 배포 생성/활성화 ~15분 소요. distribution ID 변경 시 GitHub Actions Variable 재등록 필요 |
| ACM CloudFront cert (us-east-1) | DNS 검증 수십 분 소요. CloudFront 배포 전 ISSUED 상태 필요 |
| `dashboard.aegis-pi.cloud` Route53 record | CloudFront와 함께 영구화. destroy/apply마다 CF domain_name이 바뀌면 record도 재설정 필요 |
| CloudFront ACM validation records | ACM cert와 함께 이동해야 자동 갱신이 유지됨 |

### 그룹 C — 일시 자원 유지 (변경 없음)

| 리소스 |
| --- |
| VPC / Subnets / Route Tables / NAT Gateway / Endpoints |
| ECS Cluster / TaskDef / Service |
| ALB / Target Group / Listeners |
| RDS PostgreSQL (비용 ~$15.33/월 절감 목적) |
| ElastiCache Redis |
| Lambda data processor / notifier / DLQ / ESM |
| IoT Rules |
| `api.aegis-pi.cloud` Route53 record (ALB에 의존) |
| ALB ACM certificate (ap-south-1) + validation records |
| Secrets Manager (`recovery_window_in_days = 0`, 즉시 삭제) |
| CloudWatch Logs |
| Security Groups |

RDS는 영구화하지 않는다. 비용 절감($15.33/월)이 목적이고, Step 10에서 final snapshot restore runbook / automation을 별도 과제로 둔다.

## Terraform dependency 분석

infra/data-dashboard-permanent/ 내부 cross-reference는 영구 root 안에서 모두 해결된다:

- `aws_cloudfront_distribution.web` → `aws_s3_bucket.web`, `aws_acm_certificate_validation.cloudfront`, `aws_cloudfront_origin_access_control.web`
- `aws_s3_bucket_policy.web` → `aws_cloudfront_distribution.web.arn`
- `aws_iam_role_policy.github_oidc_web_deploy` → `aws_s3_bucket.web.arn`, `aws_cloudfront_distribution.web.arn`
- `aws_route53_record.web_cloudfront` → `aws_cloudfront_distribution.web.domain_name` (영구 root 내부)
- `aws_cognito_user_pool_client.this` → `local.dashboard_web_fqdn` (변수로 충분)
- ACM cloudfront cert, validation records, validation resource → 영구 root 내부

infra/data-dashboard(일시)에서 permanent outputs가 필요한 위치:

| data-dashboard 위치 | 필요한 permanent output |
| --- | --- |
| ecs.tf: `COGNITO_USER_POOL_ID` 환경변수 | `cognito_user_pool_id` |
| ecs.tf: `COGNITO_APP_CLIENT_ID` 환경변수 | `cognito_app_client_id` |
| ecs.tf: `_backend_image` local (ECR URL fallback) | `ecr_repository_url` |
| ecs.tf: `DDB_TABLE_REPORT` 환경변수 | `dynamodb_daily_report_name` |
| ecs.tf: task role IAM DynamoDBDailyReport ARN | `dynamodb_daily_report_arn` |

참조 방법: `data "terraform_remote_state" "permanent"` 블록을 infra/data-dashboard/ 에 추가한다.

```hcl
# infra/data-dashboard/remote_state_permanent.tf (skeleton)
data "terraform_remote_state" "permanent" {
  backend = "s3"
  config = {
    bucket = "kjw-aegis-terraform-state"
    key    = "data-dashboard-permanent/terraform.tfstate"
    region = "ap-south-1"
  }
}
```

## 목표 구조

```text
infra/
├── data-dashboard-dns/        [영구] Route53 Hosted Zone (aegis-pi.cloud)
├── data-dashboard-permanent/  [영구] Cognito, DynamoDB aegis-daily-report, ECR,
│                                     S3 Web bucket, CloudFront + OAC,
│                                     ACM CloudFront cert (us-east-1),
│                                     dashboard.aegis-pi.cloud Route53 record,
│                                     GitHub OIDC roles (ECR push, web deploy)
└── data-dashboard/            [일시] VPC, ECS, ALB, NAT GW, Redis, RDS, Lambda,
                                      IoT Rules, notifier, api.aegis-pi.cloud record,
                                      ALB ACM cert, Secrets, SGs, CWLogs
```

## 비용 영향 (destroy 후 잔여 비용 변화)

| 구분 | Step 7.5까지 | Step 9.5 이후 |
| --- | --- | --- |
| Route53 hosted zone | $0.50/월 | $0.50/월 (변화 없음) |
| Cognito User Pool (0 MAU) | 삭제됨 | $0.00/월 (무료 티어) |
| ECR image storage (~0.5 GB) | 삭제됨 | ~$0.05/월 |
| S3 web bucket (< 50 MB) | 삭제됨 | ~$0.00/월 (usage-based 소량) |
| CloudFront (비가동 시) | 삭제됨 | ~$0.00/월 (usage-based 소량) |
| ACM cert | 삭제됨 | $0.00/월 (무료) |
| DynamoDB aegis-daily-report (빈 테이블) | 삭제됨 | $0.00/월 (on-demand 0 req) |
| GitHub OIDC IAM roles | 삭제됨 | $0.00/월 (IAM 무료) |
| **추가 잔여 비용 합계** | **$0/월** | **~$0.50~0.55/월** |

## Migration Strategy (Step 9.5 실행 세션에서 진행)

state 이전은 "terraform import → terraform plan(No changes) → state rm" 패턴을 따른다.
destroy 명령은 절대 실행하지 않는다.

### 전제조건

- infra/data-dashboard plan: No changes (현재 상태 확인)
- infra/data-dashboard-dns plan: No changes

### 실행 순서

1. `infra/data-dashboard-permanent/` 신규 root 생성
   - main.tf / providers.tf(ap-south-1 + us-east-1) / versions.tf / variables.tf / outputs.tf
   - backend: `kjw-aegis-terraform-state` / `data-dashboard-permanent/terraform.tfstate`
   - 이동 대상 모든 resource 블록 작성

2. terraform init + plan 확인 (apply 전)
   ```bash
   terraform -chdir=infra/data-dashboard-permanent init
   terraform -chdir=infra/data-dashboard-permanent validate
   terraform -chdir=infra/data-dashboard-permanent plan
   # → 모든 resources가 "will be created" 상태여야 함 (아직 import 전)
   ```

3. terraform import (그룹 A 우선, 그룹 B 다음)
   - 순서: Cognito → DynamoDB → ECR + OIDC roles → S3 web bucket → CloudFront + OAC → ACM cloudfront → Route53 dashboard record
   ```bash
   # 예시 (실제 ID는 terraform output 또는 AWS CLI로 확인)
   terraform -chdir=infra/data-dashboard-permanent import \
     aws_cognito_user_pool.this <USER_POOL_ID>
   terraform -chdir=infra/data-dashboard-permanent import \
     aws_cognito_user_pool_client.this "<USER_POOL_ID>/<CLIENT_ID>"
   terraform -chdir=infra/data-dashboard-permanent import \
     aws_cognito_user_pool_domain.this <DOMAIN_PREFIX>
   # ... (ECR, S3, CF, ACM, Route53 순서 계속)
   ```

4. terraform plan permanent → No changes 확인
   ```bash
   terraform -chdir=infra/data-dashboard-permanent plan -detailed-exitcode
   # exit 0 (변경 없음)
   ```

5. terraform state rm (data-dashboard root에서 제거)
   - 순서: Route53 record 먼저 → ACM cloudfront → CloudFront → S3 → ECR → OIDC roles → Cognito → DynamoDB
   ```bash
   terraform -chdir=infra/data-dashboard state rm \
     aws_route53_record.web_cloudfront
   # ... (역순으로 계속, state rm은 AWS 리소스를 삭제하지 않는다)
   ```

6. `infra/data-dashboard/*.tf` 수정
   - `remote_state_permanent.tf` 신설: `data "terraform_remote_state" "permanent"`
   - `cloudfront.tf`, `s3_web.tf`, `cognito.tf`, `ecr.tf`, `dynamodb.tf(daily_report)`, `acm.tf(cloudfront part)`, `route53.tf(web_cloudfront)`: resource 블록 제거
   - `ecs.tf`: `aws_cognito_user_pool.this.id` → `data.terraform_remote_state.permanent.outputs.cognito_user_pool_id` 등 참조 교체

7. terraform plan data-dashboard → No changes 확인
   ```bash
   terraform -chdir=infra/data-dashboard plan -detailed-exitcode
   # exit 0
   ```

### 주의사항

- api.aegis-pi.cloud Route53 record와 ALB ACM cert는 data-dashboard에 남긴다 (ALB 의존)
- us-east-1 provider 설정을 permanent root에도 추가해야 한다 (ACM cloudfront cert)
- Cognito domain `kjw-aegis-data-auth` 재생성 시 AWS 유예 기간 충돌 가능 → permanent 분리로 회피
- GitHub Actions Variable `DASHBOARD_CLOUDFRONT_DISTRIBUTION_ID`는 distribution ID 유지되므로 재등록 불필요
- `infra/foundation`은 건드리지 않는다 (워크스트림 A 영역)
- 각 import 단계마다 plan을 실행해 drift가 없는지 확인한 후 다음 import로 이동한다

## 업데이트 필요한 문서

- `docs/planning/16_data_dashboard_vpc_workplan.md` — Step 9.5 추가 ✅ (이번 세션)
- `docs/issues/SESSION_STATE.md` — 다음 작업 Step 9.5 갱신 ✅ (이번 세션)
- `docs/AI_AGENT_HARNESS.md` — Step 9.5 DoD / 허용 파일 / 금지 명령 추가 ✅ (이번 세션)
- `docs/ops/22_data_dashboard_vpc_runbook.md` — Permanent resource split migration checklist 추가 ✅ (이번 세션)
- `docs/ops/15_aws_cost_baseline.md` — permanent root 잔여 비용 추가 ✅ (이번 세션)

## 검증 (이번 설계 세션)

- git diff --check: 통과
- 허용 파일 범위 내 변경만 포함
- 민감 정보(비밀번호/token/private key/MFA OTP/전체 ARN/계정 세부정보) 미포함 확인

## 실행 결과 (2026-05-26 migration 완료)

- infra/data-dashboard-permanent/ 신설 완료. 25 resources import 성공.
- permanent plan: `Plan: 0 to add, 3 to change, 0 to destroy` (destroy 없음)
  - 3 in-place change: token_validity_units, DDB deletion_protection+PITR, allow_overwrite=true (모두 의도된 spec 강화)
- data-dashboard state rm: 20 resources 제거 완료
- data-dashboard plan: `Plan: 1 to add, 1 to change, 1 to destroy`
  - ECS task def 교체(image :latest vs sha-9d2c200 diff)와 service 업데이트만. 영구 리소스 없음.
- 엔드포인트 검증: https://dashboard.aegis-pi.cloud/ HTTP 200 / https://api.aegis-pi.cloud/healthz HTTP 200
- 주요 결정 사항 (설계 시 미예측):
  - `aws_acm_certificate_validation`: import 불가 리소스 (Terraform wait helper). permanent root에서 영구 제외.
    CloudFront는 `aws_acm_certificate.cloudfront.arn` 직접 참조. cert ISSUED 상태라 안전.
  - `generate_secret = false`: ForceNew 속성. import 후 추가 시 Cognito client 교체 발생. permanent root에서 제거.
    public client는 항상 secret 없이 생성되므로 동작에 영향 없음.
