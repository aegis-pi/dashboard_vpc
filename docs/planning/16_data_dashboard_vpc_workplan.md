# Data / Dashboard VPC Workplan (이 작업 환경)

상태: source of truth
기준일: 2026-05-15
수정 이력:
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
  - 마일스톤: M1, M2, M3, M5 (Hub/배포/Spoke 연결 측)

워크스트림 B (이 환경)
  - 1번 Data / Dashboard VPC
  - IoT Core 이후 Lambda data processor (VPC 밖, ADR 0007),
    DynamoDB LATEST/HISTORY, S3 processed (aegis-bucket-data prefix, ADR 0009),
    Dashboard API (Lambda + API Gateway, ADR 0007),
    Dashboard Web (정적 SPA + S3 + CloudFront, ADR 0006),
    CloudFront/WAF/Route53/ACM (신규 도메인, ADR 0010),
    Cognito User Pool (관리자 전용, MFA, ADR 0008)
  - 마일스톤: M4 데이터 플레인, M6 Risk Twin/Dashboard
```

두 워크스트림의 합류 지점은 GitHub, ECR, AWS 계정, S3, DynamoDB, IoT Core 다섯 가지 공유 자원이다. 네트워크 레벨 VPC 연결은 만들지 않는다(`docs/planning/07_dashboard_vpc_extension_plan.md` 결정 유지).

## 책임 경계 (본 환경 한정)

| 영역 | 도구 | 본 환경 책임 여부 |
| --- | --- | --- |
| Data/Dashboard VPC 인프라 (VPC/Subnet 골격, NAT GW 없음 ADR 0011) | Terraform | 본 환경 |
| CloudFront + WAF + S3 dashboard-web bucket (정적 SPA 호스팅) | Terraform | 본 환경 |
| API Gateway (custom domain + Cognito Authorizer) | Terraform | 본 환경 |
| Route53 hosted zone (신규 도메인) + ACM × 2 (us-east-1, ap-south-1) | Terraform | 본 환경 |
| Cognito User Pool + App Client + Hosted UI (관리자 전용, MFA Required) | Terraform | 본 환경 (MVP 범위, ADR 0008) |
| Lambda data processor (코드/패키지/IAM/IoT Rule 라우팅) — VPC 밖 | Terraform + 코드 | 본 환경 |
| Lambda Dashboard API — VPC 밖 | Terraform + 코드 | 본 환경 |
| DynamoDB `aegis-factory-status` (LATEST + HISTORY, TTL 24h) | Terraform | 본 환경 |
| S3 `aegis-bucket-data/processed/` prefix (단일 bucket 공유, ADR 0009) | Terraform IAM only (bucket은 워크스트림 A) | 본 환경 |
| Dashboard Web 코드 (Vite + React 정적 SPA) | 코드 | 본 환경 |
| EKS Hub / ArgoCD / Tailscale / Admin UI | Terraform/Ansible | **본 환경 변경 금지 (워크스트림 A)** |
| `aegis/edge-agent` ECR repository | Terraform | **본 환경 변경 금지 (워크스트림 A)** |
| `aegis-bucket-data` bucket 자체와 bucket-level 정책/KMS/versioning | Terraform | **본 환경 변경 금지 (워크스트림 A `infra/foundation`)** |
| Edge Agent 코드/이미지 (M4 Issue 2~3) | 코드 + GHA | 워크스트림 A 우선. 본 환경은 송신 측 인터페이스를 소비만 한다 |
| IoT Core Thing/Policy/Rule(`AEGIS_IoTRule_factory_a_raw_s3`) | Terraform | 본 환경은 Lambda 트리거용 **신규** IoT Rule만 추가 (기존 Rule 변경 금지). Thing/Policy는 워크스트림 A |

기존 `docs/planning/11_delivery_ownership_flow.md`의 Terraform/Ansible/GitHub Actions/ArgoCD 책임 경계는 그대로 적용한다.

## 확정 결정 (ADR 0006~0010, 2026-05-15)

| 항목 | 결정 | ADR |
| --- | --- | --- |
| Frontend | Vite + React 정적 SPA, S3 + CloudFront | `0006-frontend-static-spa-with-vite.md` |
| API 런타임 | Lambda + API Gateway, Lambda는 VPC 밖 | `0007-dashboard-api-runtime-lambda.md` |
| 인증 | Cognito User Pool (Self sign-up Disabled, MFA Required) + API Gateway Cognito Authorizer | `0008-cognito-admin-only-auth.md` |
| S3 | 단일 bucket `aegis-bucket-data` + raw/processed prefix | `0009-s3-bucket-shared-with-prefix.md` |
| 도메인 | Gabia 신규 + Route53 위임, Admin UI 도메인과 분리 | `0010-dashboard-domain-separated.md` |
| Replay/Near-miss/AI Worker | MVP 범위 외 (M7+ 후속) | (옵션 a 채택) |

데이터 흐름 / 처리 단계 / 저장소 경계는 `docs/specs/data_storage_pipeline.md`를 source of truth로 그대로 인용한다.

## 확정 진입 순서

### Phase 0 — 외부 사전 작업 (병행 가능)

```text
- Gabia에서 도메인 구매
- DNS 전파 시간 (1~24h) 확보를 위해 가장 먼저 진행
```

### Phase 1 — Frontend 마이그레이션 (병행 가능)

```text
- 현재 prototype (`Aegis-pi/Aegis-pi/`)을 Vite + React 프로젝트로 마이그레이션
- 컴포넌트(`fleet/factory/alerts/charts/sidebar/topbar`) 그대로 재사용
- import 기반 모듈 구조로 전환, ReactDOM.createRoot은 main.jsx로 분리
- Cognito Hosted UI 연동(oidc-client-ts 또는 aws-amplify/auth)
- 빌드 산출물 `dist/` 확인
```

### Phase 2 — Terraform skeleton (`infra/data-dashboard/`)

```text
- 신규 root 생성. 워크스트림 A의 infra/hub, infra/foundation과 state 분리
- 네이밍 규칙: AEGIS-[resource]-[feature]-[zone] (기존 규칙 유지),
            Data/Dashboard 영역은 AEGIS-Data-* prefix 권장
- 자원 (MVP):
    Route53 hosted zone (신규 도메인)
    ACM certificate × 2 (us-east-1 CloudFront, ap-south-1 API GW)
    S3 bucket (정적 SPA 호스팅, OAC)
    CloudFront distribution + WAF
    Cognito User Pool + App Client + Hosted UI Domain
    API Gateway (HTTP API or REST API) + custom domain + Cognito Authorizer
    Lambda × 2 (data processor, dashboard-api) — VPC-attach X
    Lambda IAM role (DDB/S3 prefix-scoped 권한)
    DynamoDB table (aegis-factory-status, LATEST/HISTORY)
    EventBridge / IoT Rule (data processor 트리거)
    CloudWatch Alarm + Dashboard
- 1번 VPC 자체:
    VPC + Public/Private subnet 골격만 (MVP 워크로드 없음)
    NAT GW / IGW 없음 (ADR 0011)
    Gateway Endpoint: S3, DynamoDB (무료, 후속 워크로드 대비 권장)
- 비용 영향 사전 확인: docs/ops/15_aws_cost_baseline.md 갱신
```

### Phase 3 — Lambda data processor 구현

```text
- IoT Rule action으로 트리거되도록 신규 Rule 추가 (워크스트림 A의 기존 Rule은 변경하지 않음)
- 내부 처리 단계 (normalize / risk score / pipeline status)를 단일 Lambda로 통합
- message_id 기반 idempotent 처리
- DynamoDB LATEST overwrite + HISTORY (TTL) write + S3 processed write
- factory-a 더미 payload로 end-to-end 적재 확인
```

### Phase 4 — Dashboard API Lambda 구현

```text
- API Gateway path 설계 (docs/specs/monitoring_dashboard/02_api_spec.md 참조)
  GET /factories
  GET /factories/{factory_id}
  GET /factories/{factory_id}/risk-history?window=1h
  GET /factories/{factory_id}/factory-history?window=1h
  GET /factories/{factory_id}/infra-history?window=1h
- read-only IAM (DynamoDB Get/Query, S3 processed Get)
- Lambda Powertools 적용 (구조화 로그, 메트릭, X-Ray)
- 단위 테스트 + moto로 DDB/S3 mock
- 응답 캐싱은 후속 결정 (API GW cache vs CloudFront)
```

### Phase 5 — End-to-end 통합 검증

```text
- IoT Core → Lambda data processor → DDB LATEST 반영 지연 실측
  (목표: 일반 10~35초, worst 30~60초; docs/planning/07_dashboard_vpc_extension_plan.md 기준)
- Dashboard refresh 10초 기준 LATEST 일관성 확인
- 인증 통과/실패 케이스 검증 (401/200)
- WAF 차단 케이스 (간단한 SQL injection / XSS 패턴)
```

### Phase 6 — 운영 문서화 + drawio

```text
- docs/architecture/drawio/ 1번 VPC 신규 다이어그램
- docs/architecture/01_target_architecture.md 갱신
- docs/ops/2N_dashboard_domain_runbook.md 신규 (도메인/ACM/Cognito UI 절차)
- docs/ops/15_aws_cost_baseline.md 실측 후 재갱신
```

## 합류 지점 운영 규칙

- **S3, DynamoDB**: 두 워크스트림이 동일 리소스를 다른 prefix/table로 사용한다. Terraform state는 분리하되, 네이밍은 충돌하지 않게 prefix(`AEGIS-Data-*`) 등으로 구분한다.
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
- IoT Core -> Lambda -> DynamoDB LATEST 반영 지연이 `07_dashboard_vpc_extension_plan.md`의 권장 지연(일반 10~35초, worst 30~60초) 내인지 실측
- Dashboard refresh 10초 기준에서 LATEST 값이 일관되게 표시되는지 실측
