# Data/Dashboard VPC Runbook

상태: source of truth
기준일: 2026-05-26
수정 이력:
  - 2026-05-26 v0.4  Step 9 end-to-end 통합 검증 결과 섹션 추가. Backend/Web/Auth/DDB/Lambda/IoT/Cognito/CloudFront 검증 완료 항목과 미검증 항목 분리 기록.
  - 2026-05-26 v0.3  Step 9 S3+CloudFront 배포 CI/CD 구현 반영. GitHub Actions workflow, IAM role, GitHub Secret/Variable 목록 추가.
  - 2026-05-26 v0.2  Step 7.5 Route53 Hosted Zone 영구 분리 반영. `infra/data-dashboard-dns/`와 state 이전 절차 추가.

## 목적

이 문서는 워크스트림 B 대상인 1번 Data/Dashboard VPC만 apply/destroy 하는 운영 절차를 고정한다.

대상 Terraform root:

```text
infra/data-dashboard/      # 재생성 자원
infra/data-dashboard-dns/  # Route53 Hosted Zone 영구 자원
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

## Destroy 후 잔여 기준

`scripts/destroy/destroy-data-dashboard.sh` 이후 남는 리소스:

- `kjw-aegis-terraform-state` S3 bucket: Terraform backend. 유지.
- Route53 hosted zone `aegis-pi.cloud`: Step 7.5 이후 `infra/data-dashboard-dns/`가 영구 관리. 유지.
- RDS final snapshot `kjw-aegis-data-pg-final-*`: 복구용 snapshot. 필요 시 수동 정리.
- Secrets Manager secret은 `recovery_window_in_days = 0` 기준으로 즉시 삭제.

삭제 대상:

- Data/Dashboard VPC, subnet, route table, NAT Gateway, ALB, security group
- CloudFront, S3 dashboard web bucket, ACM certificate
- Route53 records: ACM validation record, `api`, `dashboard` alias record
- Cognito User Pool
- RDS PostgreSQL instance, ElastiCache Redis
- Lambda data processor, Lambda notifier, SQS DLQ
- 신규 IoT Rule `KJW_AEGIS_Data_*`
- DynamoDB `aegis-daily-report`

삭제하지 않는 공유 리소스:

- DynamoDB `AEGIS-DynamoDB-FactoryStatus`
- S3 `aegis-bucket-data`
- 기존 IoT Rule `AEGIS_IoTRule_factory_a_raw_s3`
- Hub/Foundation/EKS/Admin UI 리소스

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
