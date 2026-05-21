# Data / Dashboard VPC Workplan (이 작업 환경)

상태: source of truth
기준일: 2026-05-21
수정 이력:
  - 2026-05-21 v0.7  Claude Code 세션 운영 기준 추가. 같은 Step은 기존 세션, Step/Phase 전환은 새 세션으로 시작하고 문서 재확인 후 작업.
  - 2026-05-21 v0.6  VPC 1 Terraform 신규 리소스 이름에 개인 작업 prefix `KJW` 적용. 기본 이름을 `KJW-AEGIS-Data-*`, lowercase 제약 리소스를 `kjw-aegis-data-*`로 고정.
  - 2026-05-21 v0.5  Claude Code Terraform handoff guard 추가. 원격 `aegis-pi/Aegis-pi` main의 VPC 2/Foundation/Factory Terraform은 참고 전용으로 고정하고, VPC 1 root/state/CIDR/공유 리소스 충돌 방지 기준 보강.
  - 2026-05-19 v0.4  ADR 0017 반영. 메타 저장소를 RDS PostgreSQL(db.t4g.micro, gp3 20GiB)로 변경.
  - 2026-05-18 v0.3  ADR 0012~0016 반영. Phase 1 통합 결정(ECS Fargate Backend + 관계형 메타 저장소 + Redis + WebSocket + Bedrock). 진입 순서를 구현 Step 1~9로 재정의. 데모 운영 패턴(build/destroy 사이클) 명시.
  - 2026-05-15 v0.2  ADR 0006~0010으로 1번 VPC MVP 토폴로지 확정. 진입 순서를 placeholder에서 확정 순서로 갱신.
  - 2026-05-15 v0.1  ADR 0005 워크스트림 분리 직후 초안

## 목적

이 문서는 2026-05-15 워크스트림 분리(`docs/changes/0005-work-split-control-vs-data-dashboard.md`) 이후 이 작업 환경(`/home/jongwon/personal_project/Aegis-pi`)에서 진행할 1번 Data / Dashboard VPC 작업 범위와 순서를 정리한다.

상위 source of truth는 `docs/planning/15_cloud_architecture_final.md`다. 데이터 흐름의 세부 명세는 `docs/specs/data_storage_pipeline.md`를 기준으로 한다.

## 워크스트림 매핑

```text
워크스트림 A (팀, 다른 환경)
  - 2번 Control / Management VPC
  - EKS Hub, ArgoCD, Tailscale, Prometheus Agent, Grafana, AWS LBC, Admin UI
  - Lambda data processor (IoT Rule trigger, VPC 밖 — 팀 합의 영역, ADR 0007 유효 부분)
  - DynamoDB AEGIS-DynamoDB-FactoryStatus, S3 raw/processed (스키마는 팀 합의 영역)
  - 마일스톤: M1, M2, M3, M5 (Hub/배포/Spoke 연결 측)

워크스트림 B (이 환경, Phase 1 통합 목표)
  - 1번 Data / Dashboard VPC (Public + Private App + Private Data 3-tier)
  - ALB + ECS Fargate Backend (FastAPI, ADR 0012)
  - RDS PostgreSQL (메타·권한·알림룰·감사, ADR 0017)
  - ElastiCache Redis (캐시 + Pub/Sub, ADR 0014)
  - Lambda notifier (DDB Streams → Redis publish, ADR 0015)
  - Lambda report-generator + Bedrock Claude 3 Haiku (일간 보고서, ADR 0016)
  - Dashboard Web (정적 SPA + S3 + CloudFront, ADR 0006)
  - CloudFront/WAF/Route53/ACM (신규 도메인, ADR 0010)
  - Cognito User Pool (관리자 전용, MFA, ADR 0008)
  - DynamoDB aegis-daily-report (PK: report_date, SK: factory_id, 신규)
  - S3 reports/ prefix
  - 마일스톤: M4 데이터 플레인 (소비 측), M6 Risk Twin/Dashboard
```

두 워크스트림의 합류 지점은 GitHub, ECR, AWS 계정, S3, DynamoDB, IoT Core 다섯 가지 공유 자원이다. 네트워크 레벨 VPC 연결은 만들지 않는다(`docs/planning/07_dashboard_vpc_extension_plan.md` 결정 유지).

## 책임 경계 (본 환경 한정)

| 영역 | 도구 | 본 환경 책임 여부 |
| --- | --- | --- |
| Data/Dashboard VPC 인프라 (Public/Private App/Private Data 3-tier, NAT GW × 1, ALB, Gateway Endpoint) | Terraform | 본 환경 |
| CloudFront + WAF + S3 dashboard-web bucket (정적 SPA 호스팅) | Terraform | 본 환경 |
| ALB + ECS Fargate Dashboard Backend (FastAPI) | Terraform + 코드 | 본 환경 |
| Route53 hosted zone (신규 도메인) + ACM × 2 (us-east-1, ap-south-1) | Terraform | 본 환경 |
| Cognito User Pool + App Client + Hosted UI (관리자 전용, MFA Required) | Terraform | 본 환경 (MVP 범위, ADR 0008) |
| Lambda data processor (코드/패키지/IAM/IoT Rule 라우팅) — VPC 밖 | Terraform + 코드 | 본 환경 |
| Lambda notifier / Lambda report-generator | Terraform + 코드 | 본 환경 |
| DynamoDB `AEGIS-DynamoDB-FactoryStatus` (LATEST + HISTORY, pk/sk, Streams 활성화 필요) | Terraform | 본 환경 (기존 실데이터 table 참조/정렬, ADR 0022) |
| DynamoDB `aegis-daily-report` | Terraform | 본 환경 |
| S3 `aegis-bucket-data/processed/` prefix (단일 bucket 공유, ADR 0009) | Terraform IAM only (bucket은 워크스트림 A) | 본 환경 |
| S3 `aegis-bucket-data/reports/` prefix | Terraform IAM only (bucket은 워크스트림 A) | 본 환경 |
| RDS PostgreSQL / ElastiCache Redis / Secrets Manager | Terraform | 본 환경 |
| Dashboard Web 코드 (Vite + React 정적 SPA) | 코드 | 본 환경 |
| EKS Hub / ArgoCD / Tailscale / Admin UI | Terraform/Ansible | **본 환경 변경 금지 (워크스트림 A)** |
| `aegis/edge-agent` ECR repository | Terraform | **본 환경 변경 금지 (워크스트림 A)** |
| `aegis-bucket-data` bucket 자체와 bucket-level 정책/KMS/versioning | Terraform | **본 환경 변경 금지 (워크스트림 A `infra/foundation`)** |
| Edge Agent 코드/이미지 (M4 Issue 2~3) | 코드 + GHA | 워크스트림 A 우선. 본 환경은 송신 측 인터페이스를 소비만 한다 |
| IoT Core Thing/Policy/Rule(`AEGIS_IoTRule_factory_a_raw_s3`) | Terraform | 본 환경은 Lambda 트리거용 **신규** IoT Rule만 추가 (기존 Rule 변경 금지). Thing/Policy는 워크스트림 A |

기존 `docs/planning/11_delivery_ownership_flow.md`의 Terraform/Ansible/GitHub Actions/ArgoCD 책임 경계는 그대로 적용한다.

## 확정 결정 (ADR 0006~0017, 2026-05-15~2026-05-19)

| 항목 | 결정 | ADR |
| --- | --- | --- |
| Frontend | Vite + React 정적 SPA, S3 + CloudFront | `0006-frontend-static-spa-with-vite.md` |
| API 런타임 (초안) | Lambda + API Gateway, Lambda는 VPC 밖 | `0007-dashboard-api-runtime-lambda.md` (Dashboard API 부분 supersede) |
| 인증 | Cognito User Pool (Self sign-up Disabled, MFA Required) + 앱 레벨 JWT 검증 | `0008-cognito-admin-only-auth.md` |
| S3 | 단일 bucket `aegis-bucket-data` + raw/processed/reports prefix | `0009-s3-bucket-shared-with-prefix.md` |
| 도메인 | Gabia 신규 + Route53 위임, Admin UI 도메인과 분리 | `0010-dashboard-domain-separated.md` |
| NAT GW (초안) | 없음 | `0011-no-nat-gateway-in-data-dashboard-vpc.md` (supersede) |
| **Dashboard Backend** | **ECS Fargate (FastAPI), ALB, NAT GW × 1 재도입** | `0012-introduce-container-backend-for-dashboard.md` |
| **메타 저장소** | **RDS PostgreSQL** | `0017-rds-postgresql-for-metadata.md` |
| **캐시 + Pub/Sub** | **ElastiCache Redis (단일 노드, 캐시 + WebSocket fan-out)** | `0014-redis-for-realtime-cache.md` |
| **실시간 푸시** | **WebSocket + DDB Streams + Lambda notifier + Redis Pub/Sub** | `0015-websocket-for-dashboard-realtime.md` |
| **LLM 일간 보고서** | **Bedrock Claude 3 Haiku + EventBridge schedule** | `0016-bedrock-for-llm-report.md` |
| Replay/Near-miss/AI Worker | Phase 1 범위 외 (Phase 3 후속) | `docs/planning/17_expansion_roadmap.md` |

데이터 흐름 / 처리 단계 / 저장소 경계는 `docs/specs/data_storage_pipeline.md`를 source of truth로 그대로 인용한다. Phase 1 통합 결정과 후속 로드맵은 `docs/planning/17_expansion_roadmap.md`를 참조한다.

## 운영 패턴 (Phase 1)

```text
데모 직전:  scripts/build/build-data-dashboard.sh   (Terraform apply, 약 15~25분)
데모 직후:  scripts/destroy/destroy-data-dashboard.sh (RDS PostgreSQL snapshot 후 destroy, 약 10~15분)
```

- 데모 운영(월 2회 × 8h) 시 ~$8~10/월
- 상시 운영 시 ~$125/월
- destroy 후 ~$2~3/월 (Route53 hosted zone + RDS snapshot 잔존)

## 확정 진입 순서 (Phase 1 구현 Step)

> 본 문서의 Step은 **구현 단계**다. `docs/planning/17_expansion_roadmap.md`의 Phase 1~4는 **확장 단계**로, 용어가 다르므로 혼동하지 않는다.
> Claude Code 작업은 같은 Step 내부 검증·수정만 기존 세션을 이어서 사용한다. Step 또는 Phase가 넘어가면 새 Claude Code 세션을 시작하고 `docs/issues/SESSION_STATE.md`, `docs/AI_AGENT_HARNESS.md`, 본 문서의 해당 Step을 다시 읽는다.

### Step 0 — 외부 사전 작업 (병행 가능)

```text
- Gabia에서 도메인 구매
- DNS 전파 시간 (1~24h) 확보를 위해 가장 먼저 진행
```

### Step 1 — Frontend 마이그레이션 (병행 가능)

```text
- 현재 prototype reference는 `Aegis-pi2/` 로 둔다
- 공식 프론트엔드 소스 경로는 `apps/dashboard-web/` 로 고정한다
- Step 1 진행 시 `Aegis-pi2/` 화면 설계를 `apps/dashboard-web/` Vite + React 프로젝트로 마이그레이션
- `Aegis-pi2/` 는 배포/CI/S3 source path로 직접 사용하지 않는다
- 컴포넌트(`fleet/factory/alerts/charts/sidebar/topbar`) 그대로 재사용
- import 기반 모듈 구조로 전환, ReactDOM.createRoot은 main.jsx로 분리
- Cognito Hosted UI 연동(oidc-client-ts 또는 aws-amplify/auth)
- WebSocket client 추가 (`react-use-websocket` 또는 직접 WebSocket API)
- 보고서 탭에 react-markdown 렌더링 추가
- 빌드 산출물 `dist/` 확인
```

### Step 2 — Terraform 1번 VPC 골격 (`infra/data-dashboard/`)

```text
- 신규 root 생성. 워크스트림 A의 infra/hub, infra/foundation과 state 분리
- 팀원이 작성한 원격 `aegis-pi/Aegis-pi` main의 Terraform은 참고 전용:
    infra/hub/          = 2번 Control / Management VPC + EKS
    infra/foundation/   = 공유 S3/AMP/ECR/IoT Rule/GitHub Actions OIDC
    infra/mesh-vpn/     = Tailscale Hub-Spoke
    infra/safe-edge/    = factory-a 기준선 문서
    infra/deploy/       = 배포 파이프라인 보조 영역
  위 경로는 본 작업환경 PR/patch 대상에서 제외한다.
- 로컬 origin이 `aegis-pi/dashboard_vpc.git` 로 설정되어 있을 수 있으므로,
  Claude Code는 사용자가 준 `https://github.com/aegis-pi/Aegis-pi/tree/main` 을
  참고 코드로 별도 확인하되, 구현 파일은 이 작업트리의 `infra/data-dashboard/`에만 만든다.
- 네이밍 규칙:
    기존 AEGIS-[resource]-[feature]-[zone] 규칙 앞에 개인 작업 prefix `KJW` 적용
    Data/Dashboard 영역 기본 prefix: KJW-AEGIS-Data-*
    Terraform local 권장:
      owner_prefix   = "KJW"
      project_prefix = "AEGIS"
      area_prefix    = "Data"
      naming_prefix  = "KJW-AEGIS-Data"
    S3 bucket, Cognito domain, CloudFront 보조 이름처럼 lowercase/문자 제약이 있는 리소스:
      kjw-aegis-data-*
- 1번 VPC (Phase 1, ADR 0012):
    VPC 10.x.0.0/16 + Public/Private App/Private Data subnet × 2 AZ
    단, Hub VPC `10.0.0.0/16` 과 겹치지 않는 CIDR만 사용
    Internet Gateway
    NAT Gateway × 1 (단일 AZ, 비용 절감)
    Route table 분리 (Public 0.0.0.0/0 → IGW, Private 0.0.0.0/0 → NAT)
    Gateway Endpoint: S3, DynamoDB (무료)
    보안그룹 5종: ALB, ECS, RDS PostgreSQL, Redis, Lambda notifier
- 자원 (VPC 밖, managed):
    Route53 hosted zone (신규 도메인)
    ACM certificate × 2 (us-east-1 CloudFront, ap-south-1 ALB)
    S3 dashboard-web bucket (정적 SPA 호스팅, OAC)
    CloudFront distribution + WAF (관리자 IP allow-list 옵션)
    Cognito User Pool + App Client + Hosted UI Domain (Self sign-up Disabled, MFA Required)
- 공유 리소스 충돌 방지:
    S3 `aegis-bucket-data` 는 data source/변수 참조만 허용.
    bucket 자체, bucket policy, lifecycle, KMS, versioning 변경 금지.
    기존 IoT Rule `AEGIS_IoTRule_factory_a_raw_s3` 변경 금지.
    Lambda processor 트리거는 Step 4 ADR 합의 후 신규 IoT Rule로만 추가.
    ECR `aegis/edge-agent`, `aegis/factory-a-log-adapter`, `aegis/edge-iot-publisher` 변경 금지.
    Dashboard Backend ECR이 필요하면 `aegis/dashboard-backend` 신규 repo로 분리.
- 비용 영향 사전 확인: docs/ops/15_aws_cost_baseline.md 갱신
```

### Step 3 — Terraform 데이터 저장소 (`infra/data-dashboard/`)

```text
- DynamoDB:
    AEGIS-DynamoDB-FactoryStatus (기존 실데이터 LATEST + HISTORY, pk/sk, Streams NEW_AND_OLD_IMAGES 활성화 필요 — ADR 0022)
    aegis-daily-report (PK: report_date, SK: factory_id)
- S3 prefix 추가 (aegis-bucket-data는 워크스트림 A가 소유, prefix·IAM만 본 환경):
    processed/ (Lambda data processor write)
    reports/ (Lambda report-generator write)
- RDS PostgreSQL (ADR 0017):
    subnet group (Private Data Subnet × 2)
    DB instance db.t4g.micro Single-AZ
    gp3 20GiB, storage autoscaling max 100GiB
    Secrets Manager (마스터 비밀번호)
    초기 스키마 Alembic migration (factory / app_user / user_factory_access / alert_rule / audit_log)
- ElastiCache Redis (ADR 0014):
    subnet group (Private App Subnet × 2)
    replication group (single node, transit_encryption, AUTH)
    Secrets Manager (AUTH token)
```

### Step 4 — Lambda data processor 협의 (팀 합의 영역)

```text
- IoT Rule action으로 트리거되도록 신규 Rule 추가 (워크스트림 A의 기존 Rule은 변경하지 않음)
- 내부 처리 단계 (normalize / risk score / pipeline status)를 단일 Lambda로 통합 (ADR 0007 Lambda data processor 부분 유효)
- message_id 기반 idempotent 처리
- DynamoDB LATEST overwrite + HISTORY (TTL) write + S3 processed write
- factory-a 더미 payload로 end-to-end 적재 확인
※ 본 작업은 워크스트림 A와 합류 지점. 합의 후 진행, ADR로 협의 결과 기록
```

### Step 5 — Lambda notifier 구현 (WebSocket 실시간, ADR 0015)

```text
- DDB Streams trigger event source mapping
- 공식 source table은 AEGIS-DynamoDB-FactoryStatus (ADR 0022)
- VPC-attach (Private App Subnet, Redis 접근용)
- Redis AUTH token Secrets Manager 조회
- 메시지 가공: factory_id 추출 + payload 정리
- PUBLISH channel "factory:update:<factory_id>"
- CloudWatch Logs + retry / DLQ
```

### Step 6 — Dashboard Backend 컨테이너 구현 (ADR 0012)

```text
- 신규 ECR repository: aegis/dashboard-backend
- FastAPI 프로젝트 골격:
    routers/factories.py (REST: 목록, 상세, 시계열)
    routers/reports.py (REST: 일간 보고서)
    routers/ws.py (WebSocket: /ws/factories/{factory_id})
    deps/auth.py (Cognito JWT 앱 레벨 검증)
    deps/db.py (RDS PostgreSQL SQLAlchemy async + asyncpg)
    deps/ddb.py (boto3 async)
    deps/redis.py (redis.asyncio + pubsub)
    deps/s3.py (boto3 async)
- 단위 테스트 + moto (DDB/S3) + testcontainers (Postgres) + fakeredis
- Lambda Powertools 호환 logging + structured JSON
- X-Ray ADOT collector sidecar 또는 SDK 직접
- Dockerfile (multi-stage, slim, non-root)
- GitHub Actions: build/test/push sha-<7chars> to ECR
```

### Step 7 — ECS Service / ALB 배포 (`infra/data-dashboard/`)

```text
- ECS Cluster (Fargate, capacity provider: FARGATE)
- Task Definition (0.5 vCPU / 1 GB, awsvpc, FARGATE_LATEST)
- ECS Service (desired_count=1, deployment circuit breaker)
- Task Execution Role: ECR pull, CloudWatch Logs
- Task Role: DDB Get/Query/PutItem, S3 Get, RDS PostgreSQL 접속 정보 조회(Secrets), Redis (Secrets), Bedrock InvokeModel, Secrets Manager Get
- ALB (HTTPS 443, ACM):
    Listener rule: / → ECS target group
    Listener rule: /ws/* → ECS target group (sticky session 옵션)
    Health check: GET /healthz
- Route53 A-record (alias) api.<도메인> → ALB
```

### Step 8 — LLM 일간 보고서 (ADR 0016)

```text
- Lambda report-generator (Python 3.12, 5분 timeout, 512MB)
- IAM: DDB read, S3 read/write, Bedrock InvokeModel (Claude 3 Haiku model ARN)
- EventBridge Scheduler: cron(0 0 * * ? *) UTC = 09:00 KST
- Bedrock 호출 리전 확인 (ap-south-1 미지원 시 us-east-1 cross-region invoke)
- 프롬프트 템플릿 + 출력 검증 (Markdown 형식 보장)
- S3 reports/<YYYY-MM-DD>/<factory_id>.md write + DDB aegis-daily-report 메타 write
- Backend 보고서 조회 endpoint와 연동
```

### Step 9 — End-to-end 통합 검증

```text
- IoT Core → Lambda data processor → DDB LATEST 반영 지연 실측
  (목표: 일반 10~35초, worst 30~60초; docs/planning/07_dashboard_vpc_extension_plan.md 기준)
- DDB Streams → Lambda notifier → Redis publish → ECS subscribe → WebSocket push
  (목표: 1~2초 이내, factory-a 실제 센서 값 기준)
- 인증 통과/실패 케이스 검증 (401/200), JWT 만료 시나리오
- WAF 차단 케이스 (간단한 SQL injection / XSS 패턴, IP allow-list)
- RDS PostgreSQL connection pool 메트릭 (active/idle/overflow)
- Redis hit/miss ratio
- Bedrock 일간 보고서: 수동 invoke + 다음 09:00 자동 트리거 확인
- 부하 테스트: k6/artillery WebSocket 100 concurrent connection
```

### Step 10 — 운영 문서화 + 자동화 스크립트

```text
- scripts/build/build-data-dashboard.sh (Terraform apply 순서 자동화)
- scripts/destroy/destroy-data-dashboard.sh (RDS PostgreSQL snapshot → destroy 순서)
- scripts/ops/data-dashboard-port-forward.sh (필요 시 로컬 fallback)
- docs/architecture/drawio/ 신규 다이어그램 (03_re6 갱신)
- docs/architecture/01_target_architecture.md 갱신 (완료)
- docs/ops/2N_dashboard_domain_runbook.md 신규 (도메인/ACM/Cognito UI 절차)
- docs/ops/2N_data_dashboard_runbook.md 신규 (build/destroy 사이클 + 트러블슈팅)
- docs/ops/15_aws_cost_baseline.md 실측 후 재갱신
```

## 합류 지점 운영 규칙

- **S3, DynamoDB**: 두 워크스트림이 동일 리소스를 다른 prefix/table로 사용한다. Terraform state는 분리하되, 신규 Data/Dashboard 리소스 네이밍은 `KJW-AEGIS-Data-*` 또는 lowercase 제약 시 `kjw-aegis-data-*`로 구분한다.
- **IoT Core**: Thing/Policy/Rule(`AEGIS_IoTRule_factory_a_raw_s3`)는 워크스트림 A가 관리. 본 환경에서는 Lambda를 트리거하는 신규 IoT Rule을 추가하거나 기존 Rule action 확장을 결정해야 하므로, 결정 즉시 ADR로 기록한다.
- **GitHub Actions**: 본 환경에서 새 워크플로우를 만들 때 `aegis-pi-gitops` 또는 코드 repo 어느 쪽 GitOps에 배포 결과를 반영할지 명시한다. ArgoCD 직접 sync는 워크스트림 A의 Hub ArgoCD가 담당하므로 본 환경은 manifest/values만 푸시한다.
- **문서**: 1번 VPC 신규 결정은 `docs/changes/`에 ADR로 남기고, 운영 절차는 `docs/ops/`에 누적한다. 워크스트림 A 영역 문서는 본 환경에서 새로 만들지 않는다.

## 즉시 갱신 대상 문서 (착수 직전)

- `docs/planning/15_cloud_architecture_final.md` - 워크스트림 분리 섹션 반영됨
- `docs/issues/M4_data-plane.md` - Issue별 진행 상태 갱신은 실제 착수 시 반영
- `docs/issues/M6_risk-twin-dashboard.md` - Dashboard 화면 요구사항 재확인
- `docs/specs/data_storage_pipeline.md` - source of truth로 인용
- `docs/specs/monitoring_dashboard/00_requirements.md` - Dashboard 화면 기준선

## 작업 외 항목 (이 환경에서 손대지 않음)

- 워크스트림 A의 `infra/hub`, `infra/foundation`(단, IoT Rule 확장 결정은 ADR로 협의)
- ArgoCD ApplicationSet 구조 변경
- Tailscale 운영자 ACL/태그 정책
- Admin UI Ingress (`argocd.minsoo-tech.cloud`, `grafana.minsoo-tech.cloud`)
- `aegis/edge-agent` ECR repository

## 검증 기준 (착수 후)

- `terraform plan`이 워크스트림 A 리소스에 변경을 일으키지 않음
- 본 환경 Terraform state 파일과 워크스트림 A의 state가 분리되어 있음
- IoT Core → Lambda → DynamoDB LATEST 반영 지연이 `07_dashboard_vpc_extension_plan.md`의 권장 지연(일반 10~35초, worst 30~60초) 내인지 실측
- DDB Streams → notifier → Redis → WebSocket push 1~2초 이내 실측
- ECS Backend p95 응답시간 < 500ms (캐시 hit 시 < 100ms)
- RDS PostgreSQL connection pool overflow 0
- Bedrock 일간 보고서 매일 09:00 KST 자동 생성 확인
- destroy 사이클 후 잔존 자원: Route53 hosted zone, S3 bucket, RDS PostgreSQL snapshot만 (NAT GW / ALB / ECS / RDS PostgreSQL instance / Redis / Lambda 모두 0)
