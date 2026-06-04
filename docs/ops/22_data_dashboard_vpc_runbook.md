# Data/Dashboard VPC Runbook

상태: source of truth
기준일: 2026-06-04
수정 이력:
  - 2026-06-04 v2.8  Dashboard RBAC 사용자 관리 운영 기준 추가. Cognito 로그인 + RDS `app_user/factory/user_factory_access` 권한 모델, ECS task role Cognito AdminCreate/Get/Disable 권한, `/admin/users` 사용자 관리 화면, `RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS` 초기 부트스트랩 절차를 반영.
  - 2026-06-02 v2.7  Cloud Infra dashboard read 화면 배포 반영. Dashboard backend image `sha-26a0a27` ECS task definition revision 28 적용, rollout completed, `/healthz`와 `/readyz` 정상. Dashboard web workflow 성공, S3 sync + CloudFront invalidation 완료. Terraform post-apply plan No changes.
  - 2026-06-02 v2.6  일간 보고서 목록 API가 S3 `ListObjectsV2`를 사용하지만 ECS task role에 `s3:ListBucket` 권한이 없어 목록 카드에 오류 문구가 남던 문제 수정. `reports/daily/*` prefix 한정 ListBucket 권한 추가, 공장 selector 알파벳 오름차순 정렬 반영. Dashboard web workflow 성공, Terraform post-apply plan No changes.
  - 2026-06-02 v2.5  S3 `reports/daily/yyyy=YYYY/mm=MM/dd=DD/{factory_id}/report.md` 기반 일간 보고서 목록/본문 표시 반영. Dashboard backend image `sha-055fb75` ECS task definition revision 27 적용, rollout completed, `/healthz`와 `/readyz` 정상.
  - 2026-06-01 v2.4  Factory Timeline `10m/1h/custom` 범위와 `top_causes` 기반 원인 표시 반영. Dashboard backend image `sha-311adc6` ECS task definition revision 23 적용, rollout completed, `/healthz`와 `/readyz` 정상.
  - 2026-06-01 v2.3  Environment History 환경 센서 기압 표시 범위를 950~1050hPa로 조정. 센서별 차트 헤더에 온도/습도/기압 이름, 단위, 표시 범위, max/avg/min 구분을 표시하도록 반영.
  - 2026-06-01 v2.2  Dashboard backend image `sha-e9f7e5b` ECS task definition revision 21 적용. GRAPH#5M sensor min 필드 응답 운영 반영, `/healthz` 정상.
  - 2026-06-01 v2.1  Environment History 센서 차트 표시 범위 고정. 온도 20~50°C, 습도 30~80%, 기압 800~1200hPa. max/avg/min 선과 최대~평균 빨간 음영, 평균~최소 초록 음영, 범위 밖 min/max 경계 빨간 점 표시 반영. 안전 점수 50점 경계선은 빨간 점선으로 변경.
  - 2026-06-01 v2.0  Environment History 6h/12h/24h 환경 센서·AI 탐지 점수 표현 갱신. 센서 min/max 응답 노출, 온도=max 피크, 습도/기압=min~max 범위, AI 평균선+max spike tooltip 기준.
  - 2026-05-29 v1.9  Environment History 안전 점수 avg/max/음영 그래프 반영. Dashboard web CloudFront invalidation 완료, backend image `sha-edc57b0-envhistory-20260529` ECS revision 19 적용, `/healthz` 정상.
  - 2026-05-29 v1.8  Dashboard backend image `sha-3c20ec3` ECS revision 15 적용 완료. `/healthz`, `/readyz`, post-apply plan 정상.
  - 2026-05-29 v1.7  ADR 0025 구현 완료 반영. 알려진 이슈 섹션 현행화. window=6h/12h/24h → GRAPH#5M 분기 완료.
  - 2026-05-28 v1.6  알려진 이슈 섹션 추가. DynamoDB HISTORY cascade 504 사고 및 임시방편(max_items=500 cap), 근본 해결 방향(ADR 0025) 기록.
  - 2026-05-27 v1.5  세션 종료 전 infra/data-dashboard destroy 완료 반영. 73 destroyed, state empty, permanent/dns No changes.
  - 2026-05-27 v1.4  dashboard-backend CORS 운영 origin 명시 수정 반영. backend image `sha-f6422a7` ECS 적용, API health/preflight 정상.
  - 2026-05-27 v1.3  TopBar refresh interval + Fleet/Factory auto polling 반영. Fleet은 선택 간격 단순 갱신, Factory는 WS 우선 + 미연결 시 polling 구조.
  - 2026-05-27 v1.2  dashboard-web frontend auto refresh/subsampling 개선 반영. WS 인증 실패 4001 재시도 차단, refresh throttle, chart subsampling 방어 로직 검증 완료.
  - 2026-05-27 v1.1  Aegis-frontend 기준 운영 UI 포팅 진행 상태와 top_causes 표시 보정 반영. web `e055583` 배포 완료, backend ECS image `sha-3b8439f` 적용, API /healthz HTTP 200, post-apply plan No changes.
  - 2026-05-27 v1.0  Dashboard 운영 UI/실데이터 shape 정합성 수정 배포 반영. backend/web workflow 성공, ECS backend image `sha-439e27a` 적용, API /healthz HTTP 200, post-apply plan No changes.
  - 2026-05-27 v0.9  사용자 요청으로 infra/data-dashboard 재기동 완료 기준 반영. apply 73 added, post-apply plan No changes, ECS running 1, target healthy, API /healthz HTTP 200.
  - 2026-05-27 v0.8  post-migration permanent diff 정리 완료 반영. permanent root 3개 in-place change 적용 후 permanent/dns plan No changes, state count 0/25/1 확인.
  - 2026-05-26 v0.7  Step 9.5 이후 infra/data-dashboard destroy 완료 기준 반영. permanent/dns root 유지와 API DNS 제거 상태 명시.
  - 2026-05-26 v0.6  Step 9.5 migration 완료 결과 반영. checklist 체크 완료. 엔드포인트 검증 확인.
  - 2026-05-26 v0.5  Step 9.5 permanent resource split migration checklist 추가. ADR 0024 참조.
  - 2026-05-26 v0.4  Step 9 end-to-end 통합 검증 결과 섹션 추가. Backend/Web/Auth/DDB/Lambda/IoT/Cognito/CloudFront 검증 완료 항목과 미검증 항목 분리 기록.
  - 2026-05-26 v0.3  Step 9 S3+CloudFront 배포 CI/CD 구현 반영. GitHub Actions workflow, IAM role, GitHub Secret/Variable 목록 추가.
  - 2026-05-26 v0.2  Step 7.5 Route53 Hosted Zone 영구 분리 반영. `infra/data-dashboard-dns/`와 state 이전 절차 추가.

## 알려진 이슈 / 현행 상태

### DynamoDB HISTORY cascade 504 — ADR 0025 구현 완료 (2026-05-29)

**사고 개요**: 2026-05-28 `/history?window=24h` 3공장 동시 조회 시 cascade 504 Gateway Timeout 발생.
자세한 사고 분석: `docs/ops/04_troubleshooting.md` #42

**현행 아키텍처 (ADR 0025 완료)**:

| window | 조회 경로 | 최대 아이템 수 |
| --- | --- | --- |
| `1h` | `HISTORY#STATE#` + max_items=500 cap | 500개 (ScanIndexForward=False) |
| `6h` | `GRAPH#5M#` | 최대 72개 |
| `12h` | `GRAPH#5M#` | 최대 144개 |
| `24h` | `GRAPH#5M#` | 최대 288개 |

**HISTORY#STATE TTL 현황**:
- 현재: 48h (data-processor 환경변수 미변경)
- 목표: 2h (ADR 0025 기준)
- TTL 변경은 `HISTORY_TTL_HOURS=2` data-pipeline 재배포 필요. 기존 아이템 자연 만료까지 시간 소요.
- TTL 2h 적용 전까지는 max_items=500 cap 유지.

**GRAPH#5M 데이터 현황 (2026-05-29)**:
- factory-b, factory-c: Lambda GraphAggregator5m 배포 후 GRAPH#5M 데이터 적재 중
- factory-a: Edge Agent 비활성으로 데이터 없을 수 있음. 없으면 해당 window에서 빈 차트 표시

**Environment History 표현 기준 (2026-06-01)**:
- 안전 점수: 평균은 파란 실선, 최소값은 주황 점선/점, 평균~최소 차이는 연한 음영으로 표시한다.
- 안전 점수 50점 경계는 위험 전환 기준이므로 빨간 점선으로 표시한다.
- 환경 센서:
  - 표시 범위: 온도 20~50°C, 습도 30~80%, 기압 950~1050hPa.
  - 센서별 차트 헤더에서 온도/습도/기압 이름, 단위, 표시 범위, max/avg/min 선 구분을 명확히 표시한다.
  - 선: 최대값은 빨간 선, 평균값은 파란 선, 최소값은 초록 선으로 연결한다.
  - 영역: 최대~평균은 빨간 계열, 평균~최소는 초록 계열로 칠한다.
  - 범위를 벗어난 min/max는 실제 값을 축 밖으로 확장하지 않고 표시 범위 경계에 빨간 점으로 표시한다.
- AI 탐지 점수: fire/fall/bend 평균선을 유지하고, 버킷 최대값이 0.8 이상인 지점만 점으로 강조한다. tooltip은 평균과 최대값을 함께 표시한다.

**Factory Timeline 표현 기준 (2026-06-01)**:
- 기본 범위는 `Latest 10m`다.
- 빠른 선택은 `10m`, `1h`만 제공하고, 긴 구간은 `Custom` 시작/종료 시각으로 지정한다.
- Custom 범위는 최신 기준 최대 24h까지만 허용한다.
- 1h 이하 범위는 `HISTORY#STATE` 원시 스냅샷을 조회하고, Timeline 원인 설명은 `risk.top_causes`에서 추출한 `top_cause_names`만 표시한다.
- 1h 초과 범위는 `GRAPH#5M` 집계 item을 조회할 수 있으나, 집계 item에는 원인 필드가 없어 `top_causes 없음`으로 표시한다.
- 이벤트는 risk level 변경, risk score 10점 이상 급락, risk score 10점 이상 회복을 표시한다.

**잔여 한계**:
- `window=1h` max_items=500 cap 유지: 1h 이내에서도 500개 초과 구간 스파이크 유실 가능
- HISTORY#STATE TTL이 48h인 동안은 테이블 아이템 수 여전히 많음
- GRAPH#5M 조회는 해당 공장에 GRAPH#5M 데이터가 없으면 빈 배열 반환

---

## 목적

이 문서는 워크스트림 B 대상인 1번 Data/Dashboard VPC만 apply/destroy 하는 운영 절차를 고정한다.

대상 Terraform root:

```text
infra/data-dashboard/      # 재생성 자원
infra/data-dashboard-dns/  # Route53 Hosted Zone 영구 자원
infra/data-dashboard-permanent/  # Cognito/ECR/DDB report/S3 web/CloudFront 영구 자원
```

손대지 않는 영역:

```text
infra/hub/
infra/foundation/
infra/mesh-vpn/
scripts/build/build-hub.sh
scripts/destroy/destroy-hub.sh
scripts/destroy/destroy-all.sh
```

## 현재 Active 기준 (2026-05-27 destroy 후)

사용자 요청으로 세션 종료 전 `infra/data-dashboard/` 일시 root를 destroy 했다.
이후 운영 Dashboard UI가 실제 DDB flat/nested 데이터 shape를 모두 처리하도록 수정되었고, Aegis-frontend 기준 UI 포팅과 `top_causes` field/name 양식 보정이 진행됐다.
추가로 frontend refresh/subsampling 개선이 반영되어 WS 메시지 기반 refresh는 3초 throttle을 적용하고, 인증 실패 close code 4001은 재시도 없이 offline 처리한다. TopBar refresh interval과 Fleet/Factory auto polling도 반영됐다. Fleet은 선택 간격으로 목록과 최근 변화를 갱신하고, Factory는 WS 우선 + 미연결 시 polling 구조를 사용한다.
Backend는 CORS 운영 origin을 명시하도록 수정되어 `https://dashboard.aegis-pi.cloud` preflight와 인증 API 호출을 허용한다.

## Dashboard RBAC 사용자 관리

기준:

```text
Cognito User Pool      로그인, MFA, 임시 비밀번호, 세션
RDS PostgreSQL         app_user / factory / user_factory_access / audit_log
FastAPI Backend        Cognito JWT sub -> RDS app_user 조회 -> 공장별 인가
Dashboard Web          /admin/users 사용자 관리 화면
```

서버에서 강제하는 접근 제어:

| API | 권한 기준 |
| --- | --- |
| `GET /factories` | 로그인 사용자가 접근 가능한 공장만 반환 |
| `GET /factories/{factory_id}` | 권한 없으면 `403` |
| `GET /factories/{factory_id}/history` | 권한 없으면 `403` |
| `GET /reports` | 접근 가능한 공장 리포트만 반환 |
| `GET /reports/{date}/{factory_id}` | 권한 없으면 `403` |
| `GET /ws/factories/{factory_id}` | 구독 전 권한 검증, 권한 없으면 close `4003` |
| `/admin/users` | `super_admin` / `org_admin`만 접근 |

초기 부트스트랩:

```text
1. 운영자가 Cognito Hosted UI에서 로그인할 Cognito 사용자를 준비한다.
2. 해당 사용자의 Cognito sub 값을 확인한다.
3. Terraform variable `rbac_bootstrap_super_admin_subs`에 sub를 임시로 설정한다.
4. `terraform -chdir=infra/data-dashboard apply` 후 backend service를 새 task definition으로 배포한다.
5. Dashboard `/admin/users`에서 실제 본사 관리자 계정을 생성하거나 기존 계정 권한을 설정한다.
6. `rbac_bootstrap_super_admin_subs`를 빈 값으로 되돌리고 다시 apply/deploy한다.
```

주의:

- Cognito sub 값은 개인 식별자이므로 문서에 기록하지 않는다.
- 사용자 비밀번호는 Cognito 임시 비밀번호/초기 설정 흐름으로만 다룬다. RDS에 비밀번호를 저장하지 않는다.
- `DELETE /admin/users/{user_id}`는 Cognito 사용자를 disable하고 RDS 사용자를 `disabled`로 표시하는 soft-delete다.
- Backend startup은 `DATABASE_AUTO_CREATE_METADATA=true`일 때 RBAC metadata table을 idempotent하게 생성하고 `DASHBOARD_FACTORY_IDS`의 공장 ID를 `factory` table에 동기화한다.

운영 확인:

```bash
curl -fsS https://api.aegis-pi.cloud/readyz
```

정상 기준:

```text
dependencies.dynamodb = ok
dependencies.redis = ok
dependencies.rds_metadata = ok
```

```text
terraform destroy: 73 destroyed
infra/data-dashboard state count: 0
infra/data-dashboard-permanent state count: 25
infra/data-dashboard-dns state count: 1
infra/data-dashboard-permanent plan: No changes
infra/data-dashboard-dns plan: No changes
dashboard.aegis-pi.cloud: HTTP 200
api.aegis-pi.cloud: DNS 미해결 (API/ALB destroy 후 정상)
backend image: sha-f6422a7
web commit: 51e82bb
```

## Destroy 후 잔여 기준

`scripts/destroy/destroy-data-dashboard.sh` 이후 남는 리소스:

- `kjw-aegis-terraform-state` S3 bucket: Terraform backend. 유지.
- Route53 hosted zone `aegis-pi.cloud`: Step 7.5 이후 `infra/data-dashboard-dns/`가 영구 관리. 유지.
- Cognito, ECR, DynamoDB `aegis-daily-report`, S3 web bucket, CloudFront, CloudFront ACM, dashboard alias record, GitHub OIDC roles: Step 9.5 이후 `infra/data-dashboard-permanent/`가 영구 관리. 유지.
- RDS final snapshot `kjw-aegis-data-pg-final-*`: 복구용 snapshot. 필요 시 수동 정리.
- Secrets Manager secret은 `recovery_window_in_days = 0` 기준으로 즉시 삭제.

삭제 대상:

- Data/Dashboard VPC, subnet, route table, NAT Gateway, ALB, security group
- ALB ACM certificate
- Route53 records: ALB ACM validation record, `api` alias record
- RDS PostgreSQL instance, ElastiCache Redis
- Lambda data processor, Lambda notifier, SQS DLQ
- 신규 IoT Rule `KJW_AEGIS_Data_*`
- ECS Cluster/TaskDef/Service, CloudWatch Logs, runtime Secrets

삭제하지 않는 공유 리소스:

- DynamoDB `AEGIS-DynamoDB-FactoryStatus`
- S3 `aegis-bucket-data`
- 기존 IoT Rule `AEGIS_IoTRule_factory_a_raw_s3`
- Hub/Foundation/EKS/Admin UI 리소스

2026-05-27 재기동 전 destroy-state 재검증 결과:

```text
infra/data-dashboard apply destroy: 73 destroyed
infra/data-dashboard state list: 0
infra/data-dashboard-permanent state list: 25
infra/data-dashboard-dns state list: 1
infra/data-dashboard-permanent plan: No changes
infra/data-dashboard-dns plan: No changes
dashboard.aegis-pi.cloud: HTTP 200
api.aegis-pi.cloud: DNS 미해결 (API/ALB destroy 후 정상)
RDS final snapshot: available
```

## Route53 Hosted Zone 영구 분리

목적:

```text
infra/data-dashboard destroy/apply 반복 시 Gabia NS 위임이 바뀌지 않게 한다.
```

구조:

```text
infra/data-dashboard-dns/
  - aws_route53_zone.dashboard
  - lifecycle prevent_destroy = true
  - backend key: data-dashboard-dns/terraform.tfstate

infra/data-dashboard/
  - data.aws_route53_zone.dashboard 로 기존 zone 조회
  - ACM validation record와 api/dashboard record만 관리
```

state 이전 절차:

```bash
terraform -chdir=infra/data-dashboard-dns init

ZONE_ID=$(terraform -chdir=infra/data-dashboard output -raw route53_zone_id)
terraform -chdir=infra/data-dashboard-dns import aws_route53_zone.dashboard "$ZONE_ID"

terraform -chdir=infra/data-dashboard state rm aws_route53_zone.dashboard

terraform -chdir=infra/data-dashboard plan -var="dashboard_domain_name=aegis-pi.cloud"
terraform -chdir=infra/data-dashboard-dns plan
```

주의:

```text
terraform state rm은 AWS 리소스를 삭제하지 않는다.
Terraform state에서만 추적을 해제한다.

이 절차 중 destroy 명령은 실행하지 않는다.
```

## Permanent Resource Split Migration Checklist (Step 9.5, ADR 0024)

이 절차는 **destroy 없이** infra/data-dashboard 상태에서 infra/data-dashboard-permanent/ 신규 root로 리소스를 이전한다. 각 단계 완료 후 체크하고 다음으로 진행한다.

참조: `docs/changes/0024-data-dashboard-permanent-resource-split.md`

### 전제 확인

```bash
# 두 root 모두 No changes 상태여야 한다
terraform -chdir=infra/data-dashboard plan -detailed-exitcode
terraform -chdir=infra/data-dashboard-dns plan -detailed-exitcode
```

- [x] infra/data-dashboard plan: No changes (exit 0) — 완료 2026-05-26
- [x] infra/data-dashboard-dns plan: No changes (exit 0) — 완료 2026-05-26

### Phase 1 — infra/data-dashboard-permanent/ 신규 root 생성

```bash
# 1. 파일 생성 후 init
terraform -chdir=infra/data-dashboard-permanent init

# 2. validate/fmt-check
terraform -chdir=infra/data-dashboard-permanent validate
terraform -chdir=infra/data-dashboard-permanent fmt -check

# 3. plan (import 전, 모든 resource가 "will be created" 상태)
terraform -chdir=infra/data-dashboard-permanent plan
```

- [x] providers.tf: ap-south-1 (primary) + us-east-1 (ACM cloudfront) 구성 — 완료 2026-05-26
- [x] backend: `kjw-aegis-terraform-state` / `data-dashboard-permanent/terraform.tfstate` — 완료 2026-05-26
- [x] validate 통과 — 완료 2026-05-26
- [x] fmt-check 통과 — 완료 2026-05-26

### Phase 2 — terraform import (그룹 A 우선)

각 import 후 plan을 실행해 drift 없음을 확인한다.

```bash
# 현재 리소스 ID 확인 (apply 전)
terraform -chdir=infra/data-dashboard output cognito_user_pool_id
terraform -chdir=infra/data-dashboard output cognito_app_client_id
terraform -chdir=infra/data-dashboard output s3_web_bucket_name
terraform -chdir=infra/data-dashboard output cloudfront_distribution_id
terraform -chdir=infra/data-dashboard output dynamodb_daily_report_name
terraform -chdir=infra/data-dashboard output dashboard_backend_ecr_repository_url
```

그룹 A import 순서:

```bash
# Cognito User Pool
terraform -chdir=infra/data-dashboard-permanent import \
  aws_cognito_user_pool.this <USER_POOL_ID>

# Cognito App Client
terraform -chdir=infra/data-dashboard-permanent import \
  aws_cognito_user_pool_client.this "<USER_POOL_ID>/<CLIENT_ID>"

# Cognito Hosted UI Domain
terraform -chdir=infra/data-dashboard-permanent import \
  aws_cognito_user_pool_domain.this <DOMAIN_PREFIX>

# DynamoDB aegis-daily-report
terraform -chdir=infra/data-dashboard-permanent import \
  aws_dynamodb_table.daily_report aegis-daily-report

# ECR repository
terraform -chdir=infra/data-dashboard-permanent import \
  aws_ecr_repository.dashboard_backend aegis/dashboard-backend

# ECR lifecycle policy
terraform -chdir=infra/data-dashboard-permanent import \
  aws_ecr_lifecycle_policy.dashboard_backend aegis/dashboard-backend

# OIDC role: ECR push
terraform -chdir=infra/data-dashboard-permanent import \
  aws_iam_role.github_oidc_ecr_push KJW-AEGIS-Data-IAMRole-OIDC-ECRPush

# OIDC role: web deploy
terraform -chdir=infra/data-dashboard-permanent import \
  aws_iam_role.github_oidc_web_deploy KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy
```

그룹 B import 순서:

```bash
# S3 web bucket
terraform -chdir=infra/data-dashboard-permanent import \
  aws_s3_bucket.web kjw-aegis-data-web

# S3 public access block
terraform -chdir=infra/data-dashboard-permanent import \
  aws_s3_bucket_public_access_block.web kjw-aegis-data-web

# S3 versioning
terraform -chdir=infra/data-dashboard-permanent import \
  aws_s3_bucket_versioning.web kjw-aegis-data-web

# S3 bucket policy
terraform -chdir=infra/data-dashboard-permanent import \
  aws_s3_bucket_policy.web kjw-aegis-data-web

# CloudFront OAC
terraform -chdir=infra/data-dashboard-permanent import \
  aws_cloudfront_origin_access_control.web <OAC_ID>

# CloudFront distribution
terraform -chdir=infra/data-dashboard-permanent import \
  aws_cloudfront_distribution.web <DISTRIBUTION_ID>

# ACM cloudfront cert (us-east-1)
terraform -chdir=infra/data-dashboard-permanent import \
  aws_acm_certificate.cloudfront <CF_CERT_ARN>

# ACM cloudfront cert validation resource
terraform -chdir=infra/data-dashboard-permanent import \
  aws_acm_certificate_validation.cloudfront <CF_CERT_ARN>

# Route53 dashboard record
terraform -chdir=infra/data-dashboard-permanent import \
  "aws_route53_record.web_cloudfront" "<ZONE_ID>_dashboard.aegis-pi.cloud_A"
```

- [x] 그룹 A import 완료 (Cognito / DynamoDB / ECR / OIDC roles) — 완료 2026-05-26
- [x] 그룹 B import 완료 (S3 / CloudFront / ACM / Route53 record) — 완료 2026-05-26
  - 주의: aws_acm_certificate_validation은 import 불가 리소스 (Terraform wait helper). permanent root에서 제외.
  - 주의: generate_secret = false는 ForceNew 속성. permanent root에서 제거 (동작 영향 없음).

### Phase 3 — permanent plan No changes 확인

```bash
terraform -chdir=infra/data-dashboard-permanent plan -detailed-exitcode
# exit 0 기대
```

- [x] permanent plan: No changes (exit 0) — 2026-05-27 post-migration 3 in-place change 적용 후 확인

### Phase 4 — data-dashboard state rm (역순)

```bash
# state rm은 AWS 리소스를 삭제하지 않는다
terraform -chdir=infra/data-dashboard state rm \
  aws_route53_record.web_cloudfront
terraform -chdir=infra/data-dashboard state rm \
  aws_acm_certificate_validation.cloudfront
terraform -chdir=infra/data-dashboard state rm \
  "aws_route53_record.cf_cert_validation[\"dashboard.aegis-pi.cloud\"]"
terraform -chdir=infra/data-dashboard state rm \
  aws_acm_certificate.cloudfront
terraform -chdir=infra/data-dashboard state rm \
  aws_cloudfront_distribution.web
terraform -chdir=infra/data-dashboard state rm \
  aws_cloudfront_origin_access_control.web
terraform -chdir=infra/data-dashboard state rm \
  aws_s3_bucket_policy.web
terraform -chdir=infra/data-dashboard state rm \
  aws_s3_bucket_versioning.web
terraform -chdir=infra/data-dashboard state rm \
  aws_s3_bucket_public_access_block.web
terraform -chdir=infra/data-dashboard state rm \
  aws_s3_bucket.web
terraform -chdir=infra/data-dashboard state rm \
  aws_iam_role_policy.github_oidc_web_deploy
terraform -chdir=infra/data-dashboard state rm \
  aws_iam_role.github_oidc_web_deploy
terraform -chdir=infra/data-dashboard state rm \
  aws_iam_role_policy.github_oidc_ecr_push
terraform -chdir=infra/data-dashboard state rm \
  aws_iam_role.github_oidc_ecr_push
terraform -chdir=infra/data-dashboard state rm \
  aws_ecr_lifecycle_policy.dashboard_backend
terraform -chdir=infra/data-dashboard state rm \
  aws_ecr_repository.dashboard_backend
terraform -chdir=infra/data-dashboard state rm \
  aws_dynamodb_table.daily_report
terraform -chdir=infra/data-dashboard state rm \
  aws_cognito_user_pool_domain.this
terraform -chdir=infra/data-dashboard state rm \
  aws_cognito_user_pool_client.this
terraform -chdir=infra/data-dashboard state rm \
  aws_cognito_user_pool.this
```

- [x] state rm 완료 — 20개 resource 제거 완료 2026-05-26

### Phase 5 — infra/data-dashboard/*.tf 수정

변경 사항:

```text
신설:
  infra/data-dashboard/remote_state_permanent.tf
    data "terraform_remote_state" "permanent" {
      backend = "s3"
      config = {
        bucket = "kjw-aegis-terraform-state"
        key    = "data-dashboard-permanent/terraform.tfstate"
        region = "ap-south-1"
      }
    }

제거 대상 resource 블록:
  cognito.tf: aws_cognito_user_pool, aws_cognito_user_pool_client, aws_cognito_user_pool_domain
  dynamodb.tf: aws_dynamodb_table.daily_report
  ecr.tf: aws_ecr_repository.dashboard_backend, aws_ecr_lifecycle_policy.dashboard_backend
          aws_iam_role.github_oidc_ecr_push, aws_iam_role_policy.github_oidc_ecr_push
          aws_iam_role.github_oidc_web_deploy, aws_iam_role_policy.github_oidc_web_deploy
          data/locals for OIDC provider (permanent에 이동)
  s3_web.tf: 모든 resource 블록 (aws_s3_bucket.web*, data.aws_iam_policy_document.s3_web_oac)
  cloudfront.tf: 모든 resource 블록
  acm.tf: cloudfront 관련 resource 블록 (alb 관련은 유지)
  route53.tf: aws_route53_record.web_cloudfront (api_alb는 유지)

참조 교체 위치 (ecs.tf):
  aws_ecr_repository.dashboard_backend.repository_url
    → data.terraform_remote_state.permanent.outputs.ecr_repository_url
  aws_cognito_user_pool.this.id
    → data.terraform_remote_state.permanent.outputs.cognito_user_pool_id
  aws_cognito_user_pool_client.this.id
    → data.terraform_remote_state.permanent.outputs.cognito_app_client_id
  aws_dynamodb_table.daily_report.name
    → data.terraform_remote_state.permanent.outputs.dynamodb_daily_report_name
  aws_dynamodb_table.daily_report.arn
    → data.terraform_remote_state.permanent.outputs.dynamodb_daily_report_arn
```

- [x] remote_state_permanent.tf 신설 — 완료 2026-05-26
- [x] cognito.tf resource 블록 제거 — 완료 2026-05-26
- [x] dynamodb.tf daily_report resource 블록 제거 — 완료 2026-05-26
- [x] ecr.tf 영구 resource 블록 제거 — 완료 2026-05-26
- [x] s3_web.tf 모든 resource 블록 제거 — 완료 2026-05-26
- [x] cloudfront.tf 모든 resource 블록 제거 — 완료 2026-05-26
- [x] acm.tf cloudfront 관련 블록 제거 — 완료 2026-05-26
- [x] route53.tf web_cloudfront record 제거 — 완료 2026-05-26
- [x] ecs.tf 참조 교체 완료 — 완료 2026-05-26

### Phase 6 — data-dashboard plan No changes 확인

```bash
terraform -chdir=infra/data-dashboard validate
terraform -chdir=infra/data-dashboard fmt -check
terraform -chdir=infra/data-dashboard plan -detailed-exitcode
# exit 0 기대
```

- [x] data-dashboard validate 통과 — 완료 2026-05-26
- [x] data-dashboard fmt-check 통과 — 완료 2026-05-26
- [x] data-dashboard plan: No changes (exit 0) — 실제 결과: ECS task def/service 변경만 (영구 리소스 없음)

### 최종 확인

```bash
# 워크스트림 A 영향 없음 확인
terraform -chdir=infra/hub plan -detailed-exitcode
terraform -chdir=infra/foundation plan -detailed-exitcode
git diff --check
```

- [ ] hub plan: No changes (워크스트림 A 영역, 별도 확인)
- [ ] foundation plan: No changes (워크스트림 A 영역, 별도 확인)
- [x] git diff --check 통과 — 완료 2026-05-26
- [x] 민감 정보 미포함 확인 — 완료 2026-05-26
- [x] 엔드포인트 검증 완료 — https://dashboard.aegis-pi.cloud/ HTTP 200 / https://api.aegis-pi.cloud/healthz HTTP 200 (2026-05-26)

주의:

```text
- state rm 각 단계 후 plan을 실행해 의도치 않은 destroy가 계획되지 않는지 확인한다.
- state rm은 AWS 리소스를 삭제하지 않는다. Terraform state에서만 추적을 해제한다.
- destroy 명령은 절대 실행하지 않는다.
- import 순서가 잘못되면 plan에 diff가 생긴다. 반드시 각 import 후 plan 확인 후 진행한다.
```

## Step 9 CI/CD — Dashboard Web S3+CloudFront 배포

### 구조

```text
.github/workflows/dashboard-web.yml
  test job:          npm ci → lint → test
  build-and-deploy:  npm ci → build (VITE_* env) → OIDC configure → S3 sync → CF invalidate
```

### Node runtime 기준

- `actions/setup-node@v4`의 앱 빌드 runtime은 `node-version: "24"`로 고정한다.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`를 유지한다.
- GitHub Actions가 2026-06-02부터 Node 24 강제 전환, 2026-09-16부터 Node 20 제거를 예고했으므로 Node 20으로 되돌리지 않는다.
- 남는 Node 20 deprecation annotation은 `actions/checkout@v4`, `actions/setup-node@v4`, `aws-actions/configure-aws-credentials@v4` 액션 내부 target 경고다. 현재 workflow는 Node 24 강제 실행 상태에서 성공했다.
- 후속 조치: 각 action의 Node 24 native major/version이 공개되면 action version을 갱신한다.

### IAM role

- `KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy` (ADR 0023, 별도 role)
- 권한: s3:ListBucket + s3:PutObject/DeleteObject/GetObject + cloudfront:CreateInvalidation
- apply 후 ARN 확인: `terraform -chdir=infra/data-dashboard output github_oidc_web_deploy_role_arn`

### Step 9 적용 절차

```bash
# 1. IAM role apply (infra/data-dashboard)
terraform -chdir=infra/data-dashboard apply \
  -var="dashboard_domain_name=aegis-pi.cloud" \
  -var="ecs_backend_desired_count=1" \
  -var="backend_container_image=<account>.dkr.ecr.ap-south-1.amazonaws.com/aegis/dashboard-backend:sha-9d2c200"

# 2. apply 후 output 확인 (ARN/ID만, 실제 값 문서 기록 금지)
terraform -chdir=infra/data-dashboard output github_oidc_web_deploy_role_arn
terraform -chdir=infra/data-dashboard output cloudfront_distribution_id
terraform -chdir=infra/data-dashboard output cognito_app_client_id
```

### GitHub Secret / Variable 등록 목록

2026-05-26 기준 실제 등록 위치:
- `aegis-pi/dashboard_vpc` repo-level secret/variables 등록 완료
- org-level 등록은 gh token의 `admin:org` 권한 부족으로 미실행
- workflow의 `secrets.*`, `vars.*` 참조는 repo-level 값으로도 동작한다

| 종류 | 이름 | 값 출처 |
| --- | --- | --- |
| Secret | `AWS_OIDC_DASHBOARD_WEB_ROLE_ARN` | `terraform output github_oidc_web_deploy_role_arn` |
| Variable | `DASHBOARD_WEB_BUCKET` | `kjw-aegis-data-web` (fixed) |
| Variable | `DASHBOARD_CLOUDFRONT_DISTRIBUTION_ID` | `terraform output cloudfront_distribution_id` |
| Variable | `VITE_API_BASE_URL` | `https://api.aegis-pi.cloud` |
| Variable | `VITE_WS_BASE_URL` | `wss://api.aegis-pi.cloud` |
| Variable | `VITE_COGNITO_AUTHORITY` | `https://cognito-idp.ap-south-1.amazonaws.com/<user-pool-id>` |
| Variable | `VITE_COGNITO_DOMAIN` | `https://kjw-aegis-data-auth.auth.ap-south-1.amazoncognito.com` |
| Variable | `VITE_COGNITO_CLIENT_ID` | `terraform output cognito_app_client_id` |
| Variable | `VITE_COGNITO_REDIRECT_URI` | `https://dashboard.aegis-pi.cloud/callback` |
| Variable | `VITE_COGNITO_LOGOUT_URI` | `https://dashboard.aegis-pi.cloud/` |

비밀번호/token/private key/전체 ARN/account 세부정보는 문서에 기록하지 않는다.

### 수동 dry-run (배포 전 확인용)

```bash
aws s3 sync apps/dashboard-web/dist/ s3://kjw-aegis-data-web/ \
  --delete \
  --region ap-south-1 \
  --dryrun
```

### 실제 배포 방법

- GitHub Actions workflow_dispatch 또는 push to main (apps/dashboard-web/** 변경)
- 배포 후 `https://dashboard.aegis-pi.cloud` 접속 수기 확인

### Step 9 검증 결과

2026-05-26 기준:
- Terraform apply: 2 added, 0 changed, 0 destroyed
- Terraform post-apply plan: No changes
- GitHub Actions `dashboard-web` push run: 성공
- Workflow Node runtime: Node 24 기준 성공 (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`)
- `test` job: 성공
- `build-and-deploy` job: 성공
- S3 sync: 성공
- CloudFront invalidation: 성공
- `https://dashboard.aegis-pi.cloud/`: HTTP 200
- `https://api.aegis-pi.cloud/healthz`: HTTP 200

## Apply

기본 도메인 `aegis-pi.cloud`:

```bash
scripts/build/build-data-dashboard.sh
```

도메인을 명시하는 경우:

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud
```

MFA 세션 토큰이 없으면 OTP를 전달한다.

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

스크립트 수행 내용:

```text
terraform init
terraform fmt -check
terraform validate
terraform plan -var dashboard_domain_name=... -out=tfplan
terraform apply tfplan
tfplan 삭제
```

삭제 예약 중인 기존 Data/Dashboard secret이 있으면 apply 전에 강제 삭제해 이름 충돌을 막는다.

## Destroy

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud
```

MFA 세션 토큰이 없으면 OTP를 전달한다.

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

스크립트 수행 내용:

```text
terraform init
terraform validate
terraform plan -destroy -var dashboard_domain_name=... -out=tfplan.destroy
terraform apply tfplan.destroy
tfplan.destroy 삭제
```

RDS는 final snapshot을 생성한다. snapshot 이름은 Terraform `random_id`를 포함해 매 apply/destroy 사이클마다 충돌하지 않는다.
Lambda VPC ENI가 `available` 상태로 남아 보안 그룹/서브넷 삭제가 지연될 수 있다. AWS가 자동 정리하지 않으면 해당 destroy 대상 VPC ENI만 확인 후 정리한다.

## 수동 확인

Terraform state:

```bash
terraform -chdir=infra/data-dashboard state list
```

VPC 잔여 확인:

```bash
aws ec2 describe-vpcs \
  --region ap-south-1 \
  --filters Name=tag:Component,Values=data-dashboard \
  --query 'Vpcs[].{VpcId:VpcId,State:State,Name:Tags[?Key==`Name`]|[0].Value}' \
  --output table
```

RDS snapshot 확인:

```bash
aws rds describe-db-snapshots \
  --region ap-south-1 \
  --query 'DBSnapshots[?starts_with(DBSnapshotIdentifier, `kjw-aegis-data-pg-final`)].{Id:DBSnapshotIdentifier,Status:Status,Created:SnapshotCreateTime}' \
  --output table
```

Secrets 삭제 예약 확인:

```bash
aws secretsmanager list-secrets \
  --region ap-south-1 \
  --include-planned-deletion \
  --query 'SecretList[?starts_with(Name, `kjw-aegis-data`)].{Name:Name,DeletedDate:DeletedDate}' \
  --output table
```

## Snapshot 정리

오래된 RDS snapshot이 필요 없으면 수동 삭제한다.

```bash
aws rds delete-db-snapshot \
  --region ap-south-1 \
  --db-snapshot-identifier <snapshot-id>
```

삭제 전에는 복구 필요 여부를 확인한다. snapshot 삭제 후에는 해당 시점의 RDS 데이터를 복구할 수 없다.

## Step 9 End-to-End 통합 검증 결과

기준일: 2026-05-26T07:XX KST (검증자: AI 에이전트)

### 검증 완료 항목

| 항목 | 명령 | 결과 | 해석 |
| --- | --- | --- | --- |
| Backend health | `curl -i https://api.aegis-pi.cloud/healthz` | HTTP 200 `{"status":"ok"}` | ECS Fargate 정상 응답 |
| Dashboard Web | `curl -I -L https://dashboard.aegis-pi.cloud/` | HTTP 200, `x-cache: Hit from cloudfront` | CloudFront+S3 SPA 정상 서비스 |
| API 인증 보호 | `curl -i https://api.aegis-pi.cloud/factories` | HTTP 401 `Missing Authorization header` | 무인증 차단 정상. www-authenticate: Bearer 헤더 포함 |
| DynamoDB 상태 | `aws dynamodb describe-table --table-name AEGIS-DynamoDB-FactoryStatus` | ACTIVE, StreamEnabled=true, StreamViewType=NEW_AND_OLD_IMAGES | 공식 hot store 활성, Streams 활성 |
| DynamoDB LATEST | pk=FACTORY#factory-a, sk=LATEST 조회 | `updated_at: 2026-05-21T07:59:05.956Z` | 최후 write는 2026-05-21. rebuild 이후 신규 write 없음 |
| DynamoDB 전체 항목 | `scan --select COUNT` | Count=3 (factory-a/b/c LATEST 각 1건) | HISTORY_TTL_HOURS=48h 만료로 HISTORY 항목 전량 소멸 |
| Lambda data-processor | `get-function-configuration` | State=Active, DYNAMODB_TABLE_NAME=AEGIS-DynamoDB-FactoryStatus | 환경변수 정렬 정상 (ADR 0022) |
| IoT Rule 활성화 | `list-topic-rules` | factory_state_processor/infra_state_processor 모두 Disabled=false | IoT → Lambda 트리거 경로 인프라 정상 |
| Lambda notifier ESM | `list-event-source-mappings` | State=Enabled, EventSourceArn=AEGIS-DynamoDB-FactoryStatus stream | DDB Streams → notifier 연결 정상 |
| Lambda notifier DLQ | `sqs get-queue-attributes` | ApproximateNumberOfMessages=0 | 재처리 실패 메시지 없음 |
| ECS Backend 서비스 | `ecs describe-services` | Status=ACTIVE, Desired=1, Running=1, RolloutState=COMPLETED | Backend 정상 가동 |
| CloudFront 배포 | `cloudfront list-distributions` | Status=Deployed, Enabled=true | CDN 정상 배포 |
| Cognito User Pool | `cognito-idp describe-user-pool` | MfaConfig=ON, Name=KJW-AEGIS-Data-UserPool | ADR 0008 MFA Required 준수 |
| Cognito Callback URL | `describe-user-pool-client` | CallbackURLs=`https://dashboard.aegis-pi.cloud/callback` | VITE_COGNITO_REDIRECT_URI 일치 |
| Cognito Logout URL | `describe-user-pool-client` | LogoutURLs=`https://dashboard.aegis-pi.cloud/` | VITE_COGNITO_LOGOUT_URI 일치 |
| GitHub Actions | `gh run list --workflow dashboard-web.yml --limit 3` | 최근 2회 success (2026-05-26) | S3+CloudFront 배포 파이프라인 정상 |
| git 상태 | `git status --short` / `git diff --check` | clean / pass | 워킹 트리 깨끗, whitespace 이상 없음 |

### 미검증 항목 (인프라 정상, 데이터 흐름 미활성)

| 항목 | 미검증 이유 | 확인 방법 (수동) |
| --- | --- | --- |
| IoT → Lambda → DDB LATEST 실시간 반영 | factory-a Edge Agent가 현재 비활성 (updated_at=2026-05-21, CW 마지막 로그=2026-05-21) | factory-a Edge Agent 재가동 후 `aws iot-data publish --topic 'aegis/factory-a/factory_state' --payload ...` 전송 → DDB LATEST updated_at 변화 확인 |
| DDB Streams → Lambda notifier → Redis PUBLISH | 신규 DDB write 없어서 notifier LastResult="No records processed" | factory-a 데이터 write 발생 후 CW Logs `/aws/lambda/KJW-AEGIS-Data-Lambda-notifier` 조회 |
| WebSocket 실시간 push | Cognito JWT 인증 토큰 없이 `wss://api.aegis-pi.cloud/ws/factories/factory-a` 연결 불가 | 브라우저 로그인 후 `?token=<jwt>` 쿼리로 연결, factory 데이터 수신 확인 |
| Cognito 로그인/콜백/로그아웃 UI | 브라우저 수기 확인 필요 | 아래 브라우저 체크리스트 참조 |

### IoT Pipeline 비활성 원인 분석

- factory-a Edge Agent (Raspberry Pi K3s)가 현재 데이터를 송신 중이지 않음
- IoT Thing/Policy/Certificate는 워크스트림 A 소유. destroy 대상이 아니어서 인증서 자체는 유효
- Lambda data processor(Active), IoT Rules(Disabled=false), ESM(Enabled) 등 인프라 구성은 정상
- factory-a가 IoT에 메시지를 보내면 전체 경로가 동작할 것으로 예상
- factory-b, factory-c LATEST도 2026-05-21 기준 (같은 상황)

### 브라우저 수기 확인 체크리스트 (운영자 직접 확인)

```text
[ ] https://dashboard.aegis-pi.cloud/ 접속 → Cognito 리디렉션 발생 확인
[ ] https://kjw-aegis-data-auth.auth.ap-south-1.amazoncognito.com/login
    → 로그인 UI 표시 확인
[ ] 로그인 성공 → callback URL: https://dashboard.aegis-pi.cloud/callback 리디렉션 확인
[ ] FleetPage (/) 렌더링 확인 — factory 카드 표시 (데이터 없으면 빈 목록 또는 오류 상태 확인)
[ ] /factories API 호출 → 401이 아닌 200 또는 빈 배열 확인 (인증 후)
[ ] 로그아웃 → https://dashboard.aegis-pi.cloud/ 리디렉션 확인
```

### 다음 수동 검증 절차 (IoT 경로 복구 시)

```bash
# 1. factory-a IoT 메시지 수동 publish (테스트)
aws iot-data publish \
  --topic "aegis/factory-a/factory_state" \
  --payload '{"factory_id":"factory-a","timestamp":"2026-05-26T07:00:00Z","status":"normal","risk_score":0.1}' \
  --region ap-south-1

# 2. DDB LATEST updated_at 갱신 확인 (30초 후)
aws dynamodb query \
  --table-name AEGIS-DynamoDB-FactoryStatus \
  --key-condition-expression "pk = :pk AND sk = :sk" \
  --expression-attribute-values '{":pk":{"S":"FACTORY#factory-a"},":sk":{"S":"LATEST"}}' \
  --region ap-south-1 \
  --query 'Items[0].updated_at.S' \
  --output text

# 3. Lambda notifier CW Logs 확인
aws logs tail /aws/lambda/KJW-AEGIS-Data-Lambda-notifier \
  --region ap-south-1 \
  --since 5m

# 4. ESM LastResult 확인 (갱신 여부)
aws lambda list-event-source-mappings \
  --function-name KJW-AEGIS-Data-Lambda-notifier \
  --region ap-south-1 \
  --query 'EventSourceMappings[0].LastProcessingResult' \
  --output text
```
