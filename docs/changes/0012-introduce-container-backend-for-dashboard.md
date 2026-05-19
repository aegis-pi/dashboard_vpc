# 0012. Dashboard Backend 런타임: ECS Fargate 컨테이너

상태: accepted
결정일: 2026-05-18
관련 범위: M6 Dashboard, 1번 Data/Dashboard VPC, 통합 Phase 1 배포 목표

> 2026-05-18 갱신: 초안에서는 본 ADR을 Phase 1.5(포트폴리오 확장 단계)로 표기했으나, MVP 단계(Lambda 단독)를 별도로 배포·운영하지 않기로 결정해 Phase 1.5를 Phase 1으로 통합했다 (`docs/planning/17_expansion_roadmap.md`).

## 기존 계획

ADR 0007에서 Dashboard API 런타임을 **Lambda + API Gateway**, VPC 밖에 두는 것으로 확정했다. 그 결과로 ADR 0011에서 1번 VPC NAT Gateway를 제거했고, 1번 VPC는 subnet 골격만 남는 형태였다.

이 결정은 비용·운영 단순화 목적에 부합한다. 다만 본 환경은 팀 포트폴리오 발표 환경이고, 실제 컨테이너 운영 시연 + 다중 데이터소스 조합(JOIN/WebSocket/캐시) 요구가 추가되면서 컨테이너 백엔드가 필요해졌다.

## 변경된 실제 기준

### Dashboard Backend를 ECS Fargate 컨테이너로 운영

Dashboard API를 **ECS Fargate 기반 컨테이너 서비스**로 운영한다. Lambda data processor (IoT Rule trigger)는 ADR 0007 결정을 그대로 유지한다.

```text
[변경] Dashboard API  : Lambda                → ECS Fargate (FastAPI)
[유지] Data processor : Lambda (IoT Rule trigger)
```

### 런타임 스택

- 언어/프레임워크: **Python 3.12 + FastAPI**
- WSGI/ASGI: Uvicorn (worker 2, async)
- 컨테이너 오케스트레이션: ECS Fargate
- 진입점: ALB (HTTPS, Cognito JWT 검증은 앱 레벨)
- 데이터 소스: DynamoDB LATEST/HISTORY, S3 processed, RDS PostgreSQL, ElastiCache Redis

### 배치 위치

- 1번 VPC **Private App Subnet** 안에 Fargate task 배치
- ALB는 1번 VPC **Public Subnet** 배치 (HTTPS, ACM 인증서)
- NAT Gateway 1개를 1번 VPC에 도입 (단일 AZ, ECR pull + Bedrock + Secrets Manager egress 용)

### Supersede 관계

- ADR 0007: **Dashboard API 부분 supersede**. Lambda data processor 부분은 유지
- ADR 0011: **NAT GW 제거 결정 supersede**. Phase 1에서 NAT GW × 1을 재도입

## 변경 이유

### 단일 Lambda 한계

- WebSocket 실시간 푸시 (ADR 0015): Lambda는 상태 유지·연결 풀링 어려움. API Gateway WebSocket은 비용·동시성 관리 부담
- 다중 데이터소스 조합 (DDB + S3 + RDS PostgreSQL + Redis): 컨테이너에서 connection pool 재사용이 자연스러움
- RDS PostgreSQL 접근: Lambda + RDS PostgreSQL은 connection pool 폭주 위험 (RDS Proxy 별도 필요). 컨테이너는 풀 직접 관리

### 포트폴리오 신호

- Phase 1 MVP는 ADR 0007로 "right-sizing 판단" 신호를 이미 보냄
- Phase 1는 본 환경 워크스트림 B의 실제 컨테이너 운영 능력을 시연
- Lambda → 컨테이너 전환의 트리거·근거를 ADR로 남긴 자체가 시니어 의사결정 신호

### 비용 vs 어필 균형

- 컨테이너 상시 운영 시 ~$125/월 → 데모 직전·직후만 가동(`build-data-dashboard.sh` / `destroy-data-dashboard.sh`) 패턴으로 ~$8~10/월
- 데모 운영 패턴은 ADR 0005(워크스트림 분리)와 일관 — 본 환경 컴포넌트는 사용자가 직접 build/destroy

### 트리거 기록

본 ADR을 발동시킨 정량·정성 트리거(`docs/planning/17_expansion_roadmap.md` Phase 1 통합 결정 참조):

- 대시보드 실시간 푸시 요구 발생 (폴링 제거)
- 다중 저장소 JOIN 쿼리 요구 (DDB + RDS PostgreSQL)
- LLM 일간 보고서 도입 결정 (ADR 0016)
- 동시 사용자 5명 이상 데모 시나리오

## 영향

### Terraform IaC

- 신규 `infra/data-dashboard/` 모듈 활성화
  - 1번 VPC Public/Private App/Private Data subnet (3 tier)
  - NAT Gateway × 1 (단일 AZ, 데모 운영 패턴으로 비용 절감)
  - ALB + Target Group (Fargate IP target)
  - ECS Cluster (Fargate)
  - ECS Service + Task Definition
  - ECR Repository: `aegis/dashboard-backend`
  - 보안그룹: ALB ↔ Fargate, Fargate ↔ RDS PostgreSQL, Fargate ↔ Redis
  - IAM: Task Execution Role(ECR pull, Logs), Task Role(DDB/S3/Bedrock/Secrets read)
  - CloudWatch Log Group + Container Insights
  - X-Ray daemon 또는 sidecar

### CI/CD

- GitHub Actions에 `dashboard-backend` build/push 워크플로 추가
- ECR push 후 `aws ecs update-service --force-new-deployment`
- 이미지 태그 전략: `sha-<7chars>` (ADR과 일관, Hub `aegis/edge-agent`와 동일)

### Frontend 영향

- 호출 대상이 `https://api.<도메인>` → ALB(`https://api.<도메인>`)로 유지 (Route53에서 ALB로 변경)
- 클라이언트 변경 없음: API path 호환, JWT Bearer 그대로
- WebSocket endpoint 신규 추가: `wss://api.<도메인>/ws/*`

### ADR 0007과의 관계

- ADR 0007 "Dashboard API Lambda" 부분: supersede
- ADR 0007 "Lambda data processor" 부분: 그대로 유지
- ADR 0007 "Lambda Powertools / 단위 테스트 / X-Ray" 같은 깊이 보강 항목 중 일부(X-Ray 분산 추적, JSON Schema 검증, 단위 테스트)는 컨테이너 Backend에서도 동일하게 적용

### ADR 0011과의 관계

- ADR 0011 "NAT GW 제거" 결정 supersede. Phase 1에서 NAT GW × 1을 재도입 (단일 AZ, ~$45/월 상시 / 데모 운영 시 ~$1/월)
- destroy 사이클로 NAT GW도 함께 제거되어 미가동 시 비용 0 회복

### 합류 지점 영향

- 없음. 워크스트림 A(2번 VPC EKS Hub) 변경 없음
- IoT Rule도 그대로. Lambda data processor 유지

### 비용

- 상시 운영: ~$125/월 (ADR 0017 RDS PostgreSQL 기준)
- 데모 운영 (월 2회 × 8h): ~$8~10/월
- destroy 후: ~$2~3/월 (Route53 hosted zone, S3 SPA, RDS snapshot 보존 시)

## 업데이트 필요한 문서

- `docs/changes/README.md` (인덱스에 0012 추가, 0007/0011 상태 갱신)
- `docs/changes/0007-dashboard-api-runtime-lambda.md` (Dashboard API 부분 supersede 노트)
- `docs/changes/0011-no-nat-gateway-in-data-dashboard-vpc.md` (NAT GW 제거 결정 supersede 노트)
- `docs/architecture/01_target_architecture.md` (1번 VPC 채워진 상태 반영)
- `docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio` (신규 다이어그램)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (구현 순서 갱신)
- `docs/planning/17_expansion_roadmap.md` (Phase 1 통합 결정)
- `docs/ops/15_aws_cost_baseline.md` (NAT GW + ALB + Fargate + RDS PostgreSQL + Redis 항목)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (ALB endpoint, WebSocket path)

## 검증

- `terraform plan` 결과에 ECS Service / Task Definition / ALB / NAT GW 생성이 포함됨
- ECS Task가 `Running` 상태로 안정 유지 (`aws ecs describe-services`)
- ALB target health: `healthy`
- `curl https://api.<도메인>/healthz` → 200 OK
- `curl https://api.<도메인>/api/factories` → JWT 미인증 시 401, 인증 시 200
- WebSocket 연결 테스트: `wscat -c wss://api.<도메인>/ws/factories/factory-a` → factory-a 상태 push 수신
- CloudWatch Container Insights에 ECS Task 메트릭 수집
- X-Ray service map: ALB → ECS → DDB/RDS PostgreSQL/Redis 표시
- destroy 후 `aws ecs list-clusters`에 잔존 자원 없음 + NAT GW 비용 0 회복
