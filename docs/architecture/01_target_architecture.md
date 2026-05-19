# 목표 확장 아키텍처

상태: draft
기준일: 2026-05-19
수정 이력:
  - 2026-05-19 v0.5  ADR 0017 반영. 1번 VPC 메타 저장소를 RDS PostgreSQL로 변경.
  - 2026-05-18 v0.4  ADR 0012~0016 반영. Phase 1 통합 결정으로 1번 VPC에 ECS Fargate Backend + 관계형 메타 저장소 + Redis + WebSocket + Bedrock 추가. ADR 0011 NAT GW 제거 결정은 ADR 0012로 supersede.
  - 2026-05-15 v0.3  ADR 0011 반영. 1번 VPC NAT GW 제거.
  - 2026-05-15 v0.2  ADR 0006~0010으로 1번 VPC MVP 토폴로지 확정. Data/Dashboard VPC 섹션 갱신.
  - 2026-05-14  Lambda data processor 통합 표현
  - 2026-05-04  초안

## 목적

현재 완료된 `factory-a` Safe-Edge 기준선을 기반으로, 이후 Aegis-Pi가 확장할 목표 Hub/Spoke 구조를 정리한다.

## 최신 기준

2026-05-09 기준 확정된 클라우드 리소스 배치와 VPC 명명은 `docs/planning/15_cloud_architecture_final.md`를 source of truth로 한다.

이 문서는 기존 목표 Hub/Spoke 구조를 설명하는 보조 문서다. 최신 기준의 VPC 경계는 아래와 같다.

```text
1번 VPC: Data / Dashboard VPC
2번 VPC: Control / Management VPC
Factory Spoke: factory-a / factory-b / factory-c
```

## 현재와 목표의 경계

현재 완료:

```text
factory-a 로컬 Safe-Edge 기준선
M1 Issue 0~4 Hub EKS/VPC/namespace/ArgoCD bootstrap 및 foundation S3 기준선 검증 후 destroy
M1 Issue 5 factory-a IoT Thing/Policy/K3s Secret 생성 완료
```

후속 목표:

```text
AWS EKS Hub
1번 Data / Dashboard VPC
2번 Control / Management VPC
factory-a / factory-b / factory-c 멀티 Spoke
중앙 배포 / 중앙 수집 / Risk Twin 관제
```

구현 책임 경계:

```text
Terraform: AWS 인프라
Ansible: bootstrap / 설정 / 소프트웨어 설치
GitHub Actions: CI
GitHub + ArgoCD: CD
```

## 목표 구조

```text
AWS EKS Hub
    ├── factory-a  Raspberry Pi 3-node K3s, 운영형
    ├── factory-b  Mac mini VM K3s, 테스트베드형
    └── factory-c  Windows VM K3s, 테스트베드형
```

Hub와 각 Spoke는 하나의 단일 Kubernetes cluster가 아니라 독립 cluster로 운영한다.

## 목표 제어 평면

```text
GitHub Push
    -> GitHub Actions
    -> ECR
    -> ArgoCD
    -> Tailscale
    -> 각 Spoke rollout
```

확장 조건:

- `factory-a` GitOps 기준선이 안정적으로 유지될 것
- 공장별 values 구조가 정리될 것
- ArgoCD가 각 Spoke cluster에 접근 가능할 것
- 운영형과 테스트베드형 sync 정책을 분리할 것

## 목표 데이터 평면

### 수신·처리·저장 (write-path)

```text
Edge input
    -> local Safe-Edge workloads
    -> InfluxDB / Kubernetes API
    -> Edge Agent
    -> AWS IoT Core
        -> IoT Rule -> S3 raw
        -> Lambda data processor -> DynamoDB LATEST/HISTORY + S3 processed
                                         |
                                         | DynamoDB Streams (NEW_AND_OLD_IMAGES)
                                         v
                                  Lambda notifier (VPC-attach)
                                         |
                                         v
                                  ElastiCache Redis (Pub/Sub)
```

### 조회·실시간 푸시 (read-path)

```text
Dashboard Web (SPA, CloudFront + S3)
    -> Cognito 로그인 / JWT 발급
    -> ALB (https://api.<도메인>)
    -> ECS Fargate Backend (FastAPI)
        -> DynamoDB LATEST/HISTORY (read)
        -> S3 processed (read)
        -> RDS PostgreSQL (메타·권한 read)
        -> Redis (캐시 read + Pub/Sub subscribe)
    <- WebSocket (factory-update push)
```

### LLM 보고서 (스케줄)

```text
EventBridge schedule (매일 09:00 KST)
    -> Lambda report-generator
        -> DynamoDB HISTORY + S3 processed (read, 지난 24h)
        -> Bedrock Claude 3 Haiku (invoke)
        -> S3 reports/<YYYY-MM-DD>/<factory_id>.md (write)
        -> DynamoDB aegis-daily-report (메타 write)
Dashboard Web
    -> ALB -> ECS Backend
        -> S3 reports/ (read)
        -> Markdown 렌더링
```

### 합류 지점 / 팀 합의 영역

- `Edge Agent → IoT Core → IoT Rule → Lambda data processor → DDB/S3` 경로는 워크스트림 A·B 공통 합의 영역. **본 환경에서 변경하지 않는다**
- 메시지 주기 3s sensor / 20s heartbeat, factory-a 실데이터 / factory-b·c dummy 데이터도 팀 합의 영역
- 본 환경의 자유 설계 영역은 IoT Rule 이후 처리 결과의 **조회/실시간 푸시/메타 관리/LLM 보고**

### 확장 조건

- 현재 InfluxDB 기반 로컬 관제에서 표준 input schema를 분리할 것
- `edge-agent` 이미지를 만들고 `factory-a`에서는 real mode, `factory-b/c`에서는 dummy mode로 공통 송신 로직을 재사용할 것
- IoT Core topic과 S3 partition 규칙을 확정할 것
- `factory_id`, `source_type`, timestamp 기준을 고정할 것
- Dashboard Backend가 Spoke K3s, ArgoCD, Control / Management VPC의 EKS API, Tailscale 관리망에 직접 붙지 않도록, Edge Agent가 `system_status`, `device_status`, `workload_status`, `pipeline_heartbeat`까지 송신할 것

초기 topic 기준:

```text
aegis/factory-a/sensor
aegis/factory-a/system_status
aegis/factory-a/device_status
aegis/factory-a/workload_status
aegis/factory-a/heartbeat
aegis/factory-b/sensor
aegis/factory-b/system_status
aegis/factory-b/device_status
aegis/factory-b/workload_status
aegis/factory-b/heartbeat
aegis/factory-c/sensor
aegis/factory-c/system_status
aegis/factory-c/device_status
aegis/factory-c/workload_status
aegis/factory-c/heartbeat
```

## Phase 1 Data / Dashboard VPC (통합 배포 목표)

ADR 0006~0017으로 토폴로지가 확정됨. 사용자 대시보드는 Tailscale/VPN 의존 없이 Cognito 인증된 정적 SPA + JWT 기반 API로 제공한다.

Dashboard Backend는 ArgoCD, Tailscale, EKS API 같은 제어 plane에 직접 접근하지 않는다. 데이터 조회는 DynamoDB LATEST/HISTORY, S3 processed, RDS PostgreSQL 메타, Redis 캐시 네 곳을 조합한다.

> Phase 1 = 본 환경에서 실제로 배포·운영하는 통합 목표.
> 원래 초안은 Phase 1 MVP(서버리스 최소 구성)와 Phase 1.5(컨테이너 확장)를 분리했으나, 본 환경 목적상 두 단계를 Phase 1으로 통합 (`docs/planning/17_expansion_roadmap.md`).

### 사용자 흐름

```text
사용자
    -> Route53 (dashboard.<신규 도메인>, Gabia 구매 후 위임)
    -> CloudFront (+ WAF, OAC)
    -> S3 (Vite + React 정적 SPA, 빌드 산출물)
    브라우저 ─ Cognito Hosted UI 로그인 (OIDC PKCE, MFA TOTP)
            ├ JWT 발급
            └ Authorization: Bearer <JWT>로 API 호출
              -> Route53 (api.<신규 도메인>)
              -> ALB (HTTPS, ACM)
              -> ECS Fargate Backend (FastAPI, JWT 앱 레벨 검증)
                  -> DynamoDB LATEST/HISTORY (read)
                  -> S3 processed (read, 장기 이력)
                  -> RDS PostgreSQL (메타·권한 read)
                  -> Redis (캐시 read + Pub/Sub subscribe)
              <- WebSocket 푸시 (wss://api.<도메인>/ws/factories/{factory_id})
```

### 1번 VPC 토폴로지

```text
1번 VPC (Phase 1):
  Public Subnet (ap-south-1a, 1c)
    - Internet Gateway
    - NAT Gateway × 1 (단일 AZ, ADR 0012)
    - ALB (HTTPS, ACM)
  Private App Subnet (ap-south-1a, 1c)
    - ECS Fargate Dashboard Backend (FastAPI, 0.5 vCPU / 1 GB)
    - ElastiCache Redis (cache.t4g.micro, 단일 노드)
    - Lambda notifier (DDB Streams trigger, VPC-attach)
  Private Data Subnet (ap-south-1a, 1c)
    - RDS PostgreSQL (db.t4g.micro, Single-AZ, gp3 20GiB)
  VPC Endpoint (Gateway type, 무료):
    - S3, DynamoDB
```

### VPC 밖에 두는 자원 (managed/serverless)

```text
- S3 dashboard-web bucket (정적 SPA 호스팅, OAC, aegis-bucket-data와 분리된 신규 bucket)
- CloudFront + WAF
- Cognito User Pool + Hosted UI (관리자 전용, MFA Required)
- Lambda data processor (IoT Rule trigger, 팀 합의 영역, 변경 없음)
- Lambda report-generator (EventBridge schedule, Bedrock 호출)
- Bedrock Claude 3 Haiku
- EventBridge Scheduler (매일 09:00 KST 일간 보고서)
- DynamoDB aegis-factory-status (LATEST + HISTORY, TTL 24h, Streams 활성화)
- DynamoDB aegis-daily-report (PK: report_date, SK: factory_id)
- S3 aegis-bucket-data (raw/ + processed/ + reports/, 단일 bucket prefix 분리, ADR 0009)
- Route53 hosted zone (신규 도메인, Admin UI minsoo-tech.cloud와 분리)
- ACM (us-east-1: CloudFront, ap-south-1: ALB)
```

### 실시간 푸시 흐름 (ADR 0015)

```text
Lambda data processor -> DynamoDB LATEST (write)
    │
    ▼ DynamoDB Streams (NEW_AND_OLD_IMAGES)
Lambda notifier (VPC-attach)
    │
    ▼ Redis PUBLISH channel "factory:update:<factory_id>"
ElastiCache Redis Pub/Sub
    │
    ▼ SUBSCRIBE
ECS Fargate Backend × N (모든 task가 subscribe → 자신의 WebSocket client에 fan-out)
    │
    ▼ WebSocket
Dashboard Web 클라이언트
```

### LLM 일간 보고서 흐름 (ADR 0016)

```text
EventBridge Scheduler (cron 0 0 * * ? * UTC = 09:00 KST)
    │
    ▼
Lambda report-generator
    ├── DynamoDB HISTORY (read, 지난 24h)
    ├── S3 processed (read, 추세·이벤트)
    └── Bedrock Claude 3 Haiku (invoke, 한국어 자연어 요약)
        │
        ▼
    S3 reports/<YYYY-MM-DD>/<factory_id>.md
    DynamoDB aegis-daily-report (메타)

Dashboard 보고서 탭 -> ALB -> ECS Backend -> S3 reports/ (read) -> Markdown 렌더링
```

### 후속 (Phase 2~4)

```text
Phase 2 (Production-Ready):
  - Timestream (DDB HISTORY 이전, 트리거: 비용 > $30/월 또는 시계열 쿼리 p95 > 1s)
  - Kinesis Data Streams (트리거: 메시지율 > 분당 1000건)
  - OpenSearch (트리거: 로그 검색 빈도 주 5회 이상)
  - Multi-AZ RDS PostgreSQL / Redis (트리거: 상시 운영 결정)

Phase 3 (AI/Analytics):
  - EKS GPU 또는 SageMaker (트리거: 영상·음성·LLM fine-tune)
  - Replay Builder, Near-miss Aggregator (트리거: Lambda p95 > 10s)
  - Kinesis Data Analytics (트리거: 윈도우 집계 룰)

Phase 4 (Multi-tenant / Compliance):
  - Cognito + IdP federation
  - CloudTrail + Config + Security Hub + GuardDuty
  - WAF + Shield Advanced
  - PrivateLink, Athena + Glue
```

### 상세 기준

```text
docs/planning/15_cloud_architecture_final.md       확정 토폴로지 + 결정 표
docs/planning/16_data_dashboard_vpc_workplan.md    진입 순서
docs/planning/17_expansion_roadmap.md              Phase 1~4 로드맵 + 트리거 표
docs/planning/07_dashboard_vpc_extension_plan.md   보안 경계와 지연 기준 (그대로 유지)
docs/specs/data_storage_pipeline.md                저장 모델 / DDB schema
docs/changes/0006~0011                               이전 결정 ADR
docs/changes/0012~0017                               Phase 1 통합 결정 ADR
docs/architecture/drawio/02_re5_two_vpc_target.drawio   2 VPC overview (pre-Phase 1)
docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio  Phase 1 Workstream B 시각화 (예정)
docs/architecture/drawio/01_re4.drawio                  pre-2VPC 단일 VPC historical reference
```

## 목표 Hub Namespace

```text
argocd
observability
risk
ops-support
```

이 namespace 기준선은 `scripts/ansible`의 Hub bootstrap playbook에서 관리한다. Hub EKS 자체는 `infra/hub`, S3/AMP/IoT Rule 같은 영속 리소스는 `infra/foundation` root에서 분리 관리한다. ECR은 후속 이미지 파이프라인 단계에서 추가한다.

역할:

| Namespace | 역할 |
| --- | --- |
| `argocd` | 멀티 Spoke 배포 제어 |
| `observability` | AMP, Prometheus 연동, 내부 관측 |
| `risk` | Hub 배포 검증용 또는 임시 workload. Phase 1에서는 Risk 계산을 Lambda data processor로 분리 |
| `ops-support` | legacy pipeline status 집계 후보. Phase 1에서는 Lambda data processor가 DynamoDB에 `pipeline_status`를 기록 |

Risk 계산·정규화·pipeline_status 판정은 1번 VPC 안 컨테이너가 아니라 Lambda data processor 내부 처리 단계다 (ADR 0007 Lambda data processor 부분 유효). Dashboard Backend는 이 결과를 read-only로 조회한다 (ADR 0012).

## Factory 역할

| Factory | 역할 | 현재 상태 |
| --- | --- | --- |
| `factory-a` | 실제 운영형 Safe-Edge | 기준선 완료 |
| `factory-b` | Mac mini VM 테스트베드 | 후속 |
| `factory-c` | Windows VM 테스트베드 | 후속 |

## Risk Twin 목표

표현:

```text
안전
주의
위험
```

목표 입력:

```text
sensor
system_status
pipeline_status
event
```

현재 `factory-a`의 Grafana dashboard는 Risk Twin 전 단계의 로컬 관제 기준선이다. 후속 단계에서 이 값을 표준 schema, Lambda data processor, DynamoDB/S3 processed, Data / Dashboard VPC 관제 화면으로 연결한다.

## 확장 우선순위

### 워크스트림 공통 / 워크스트림 A (팀 합의, 본 환경 변경 없음)

1. `factory-a` 현재 상태 문서화 완료
2. Hub EKS 기준선 구성 완료, 필요 시 `infra/hub` Terraform apply와 `scripts/ansible` bootstrap 순서로 재생성
3. Hub ArgoCD Ansible bootstrap
4. Tailscale 또는 동등한 Hub-Spoke 연결 방식 확정
5. GitHub Actions / ECR / ArgoCD ApplicationSet 구성
6. Edge Agent 구현 및 IoT Core / S3 데이터 수집 경로 구성

### 워크스트림 B (본 환경, Phase 1)

7. 1번 VPC 인프라 (`infra/data-dashboard/`):
   - Public/Private App/Private Data subnet, NAT GW × 1, ALB
   - VPC Endpoint (S3, DynamoDB)
8. 데이터 저장소·처리 (Lambda data processor는 팀 합의 영역, 변경 없음):
   - DynamoDB `aegis-factory-status` (LATEST + HISTORY + Streams)
   - DynamoDB `aegis-daily-report`
   - S3 `aegis-bucket-data` prefix (`processed/`, `reports/`)
   - RDS PostgreSQL
   - ElastiCache Redis
9. Backend·실시간:
   - ECS Fargate Dashboard Backend (FastAPI)
   - Lambda notifier (DDB Streams → Redis publish)
   - WebSocket endpoint
10. 인증·프론트:
    - Cognito User Pool + Hosted UI
    - Route53 + ACM (us-east-1, ap-south-1)
    - CloudFront + WAF + S3 dashboard-web bucket
    - Dashboard Web (Vite + React 정적 SPA)
11. LLM 일간 보고서:
    - Lambda report-generator + Bedrock Claude 3 Haiku
    - EventBridge Scheduler
12. `factory-b`, `factory-c` 테스트베드 확장 (워크스트림 A와 공동)

### Phase 2~4 (트리거 기반 진행)

13. Phase 2: Timestream / Kinesis / OpenSearch / Multi-AZ (트리거: `docs/planning/17_expansion_roadmap.md` 표)
14. Phase 3: EKS GPU / SageMaker / Replay Builder / Near-miss Aggregator
15. Phase 4: Multi-tenant / Compliance / PrivateLink

## 현재 구조로 가져오면 안 되는 것

현재 `factory-a` 문서에는 아래를 완료된 것으로 쓰지 않는다.

```text
AWS EKS Hub
IoT Core / S3
ECR
GitHub Actions
Tailscale
Data / Dashboard VPC
factory-b / factory-c
Lambda data processor / Risk calculation
ECS Fargate Backend / RDS PostgreSQL / Redis / WebSocket
LLM 보고서
```

이 항목들은 목표 구조 또는 후속 계획 문서에서만 관리한다.

## 2026-05-14 수정 방향 (Risk 계산 통합)

목표 데이터 평면은 `docs/specs/data_storage_pipeline.md`의 Lambda/DynamoDB 기준을 따른다.

이전 `Risk Normalizer`, `Risk Score Engine`, `Event Processor`, `pipeline-status-aggregator` 표현은 별도 컨테이너 서비스가 아니라 Lambda data processor 내부 처리 단계로 해석한다.

## 2026-05-18 수정 방향 (Phase 1 통합)

초안에서 분리됐던 Phase 1 MVP(서버리스 최소 구성)와 Phase 1.5(컨테이너 확장)는 Phase 1으로 통합한다. 본 환경에서 실제로 배포·운영하는 단일 목표는 다음 구성이다.

```text
ECS Fargate Dashboard Backend (FastAPI)     ADR 0012
RDS PostgreSQL                              ADR 0017
ElastiCache Redis (캐시 + Pub/Sub)           ADR 0014
WebSocket 실시간 (DDB Streams + notifier)    ADR 0015
Bedrock Claude 3 Haiku 일간 보고서           ADR 0016
+ 팀 합의 영역 (IoT Core, Lambda data processor, DDB/S3) 변경 없음
```

ADR 0007 Dashboard API 부분과 ADR 0011 NAT GW 제거 결정은 ADR 0012로 supersede된다. ADR 0007 Lambda data processor 부분은 그대로 유효하다.

운영 패턴은 데모 직전 `scripts/build/build-data-dashboard.sh`, 직후 `scripts/destroy/destroy-data-dashboard.sh` 사이클로 진행하며, 미가동 시 비용은 0에 수렴한다 (`docs/ops/15_aws_cost_baseline.md`).
