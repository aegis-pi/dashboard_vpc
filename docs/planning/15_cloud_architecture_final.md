# Cloud Architecture Final

상태: source of truth
기준일: 2026-05-20

수정 이력:
- 2026-05-20 v0.4  Phase 1 통합 결정(ADR 0012~0017)을 본문에 반영. 1번 VPC의 서버리스 MVP/비어 있는 VPC 표현 제거.
- 2026-05-15 v0.3  워크스트림 분리와 1번 VPC MVP 토폴로지 반영.
- 2026-05-14 v0.2  Lambda data processor + DynamoDB/S3 processed 데이터 흐름 반영.
- 2026-05-09 v0.1  최초 확정 클라우드 아키텍처 정리.

## 목적

이 문서는 Aegis-Pi의 확정된 클라우드 아키텍처 방향과 리소스 배치를 정리한다.

범위는 Factory Spoke, Control / Management VPC, Data / Dashboard VPC, Hub ArgoCD 중심 배포, 데이터 흐름, 관측 흐름이다.

## 전체 구조

```text
Factory Spoke 영역
  - factory-a
  - factory-b
  - factory-c

2번 VPC: Control / Management VPC
  - 중앙 배포
  - Hub-Spoke 연결
  - 운영 관측

1번 VPC: Data / Dashboard VPC
  - 데이터 처리
  - Risk 계산
  - 사용자 대시보드
```

## 2026-05-13 멘토링 반영

### 기존 초안

기존 최종 아키텍처 초안은 Control / Management VPC와 Data / Dashboard VPC를 분리하고, 데이터 흐름을 IoT Core -> S3 raw -> 별도 이벤트/위험도 처리 서비스 -> Dashboard로 설명했다.

### 변경 이유

멘토링에서는 VPC 분리는 정답이 아니라 고객 요구사항에 따른 선택이며, Dashboard의 실시간성도 수치로 정의해야 한다는 피드백이 있었다. S3 raw만으로 현재 상태를 표시한다고 설명하면 준실시간 관제 근거가 약해질 수 있다.

### 보강 방향

최신 기준에서는 S3 raw 흐름을 원본 보존과 재처리 경로로 유지한다. 동시에 Dashboard 현재 상태 조회를 위해 IoT Core 이후 Lambda data processor가 DynamoDB LATEST/HISTORY와 S3 processed를 갱신한다. Dual VPC는 고객 보안 요구와 역할 분리 요구가 있을 때 설득력 있는 목표 구조로 설명한다.

전체 연결 구조는 아래와 같다.

```text
factory-a / factory-b / factory-c
  -> K3s Spoke
  -> Tailscale 연결
  -> Control / Management VPC
      -> EKS Hub
      -> Hub ArgoCD
      -> Grafana
      -> Prometheus Agent

factory-a / factory-b / factory-c
  -> telemetry
  -> IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor -> DynamoDB LATEST/HISTORY + S3 processed
  -> Data / Dashboard VPC
      -> Dashboard Backend/API
      -> Dashboard Web
```

## Factory 영역

각 factory는 독립된 K3s Spoke다.

### factory-a

`factory-a`는 운영형 Safe-Edge Spoke다.

```text
factory-a
  - Raspberry Pi 3-node K3s
  - 운영형 Safe-Edge Spoke
  - monitoring
  - ai-apps
  - InfluxDB
  - local workload
  - Edge Agent 배포 대상
```

### factory-b

`factory-b`는 Mac mini VM 기반 테스트베드 Spoke다.

```text
factory-b
  - Mac mini VM K3s
  - 테스트베드 Spoke
  - dummy input
  - Edge Agent 배포 대상
```

### factory-c

`factory-c`는 Windows VM 기반 테스트베드 Spoke다.

```text
factory-c
  - Windows VM K3s
  - 테스트베드 Spoke
  - dummy input
  - Edge Agent 배포 대상
```

## ArgoCD 배치

목표 구조는 Hub ArgoCD 중심이다.

```text
EKS Hub ArgoCD
  - factory-a 배포 관리
  - factory-b 배포 관리
  - factory-c 배포 관리
  - Edge Agent 배포
  - 공통 spoke component 배포
  - ApplicationSet 기반 factory별 배포
```

`factory-a`에 기존 Local ArgoCD가 있는 경우에는 전환 기간 동안 유지한다.

전환 기간의 기준은 아래와 같다.

```text
전환 기간
  - factory-a Local ArgoCD 유지
  - 신규 Edge Agent는 Hub ArgoCD로 배포
  - 기존 workload를 단계적으로 Hub ArgoCD로 이관
  - 이관 완료 후 Local ArgoCD 제거 또는 비활성화
```

관련 세부 계획은 `docs/planning/14_argocd_hub_migration_plan.md`를 따른다.

## 2번 VPC: Control / Management VPC

2번 VPC는 중앙 배포와 운영 관측 영역이다.

### Public Subnet

```text
Public Subnet
  - NAT Gateway
  - 필요 시 Admin UI ALB
```

### Private App Subnet

```text
Private App Subnet
  - EKS Hub
  - Hub ArgoCD
  - Tailscale Operator / Connector
  - Prometheus Agent
  - Grafana
  - AWS Load Balancer Controller
```

### 배포 흐름

```text
GitHub Actions
  -> ECR
  -> Helm values / manifest update
  -> Hub ArgoCD
  -> Tailscale
  -> factory-a K3s
  -> factory-b K3s
  -> factory-c K3s
```

### Grafana

Grafana는 Control / Management VPC에 둔다.

Grafana 관측 대상은 아래 범위다.

```text
Grafana 관측 대상
  - Hub EKS
  - Prometheus Agent
  - AMP
  - Kubernetes API server
  - EKS node
  - Hub 내부 Pod
  - 필요 시 Edge Agent metrics
```

## 1번 VPC: Data / Dashboard VPC

1번 VPC는 데이터 처리와 사용자 대시보드 영역이다.

### Public Subnet

```text
Public Subnet (ap-south-1a, ap-south-1c)
  - Internet Gateway
  - NAT Gateway × 1 (단일 AZ, 비용 절감)
  - ALB (HTTPS, ACM)
```

ADR 0012 이후 Phase 1은 ECS Fargate Dashboard Backend를 포함하는 통합 배포 목표다. 따라서 ADR 0011의 NAT Gateway 제거 결정과 ADR 0007의 Lambda Dashboard API 결정은 Dashboard API/NAT 영역에 한해 supersede된다. ADR 0007의 Lambda data processor 결정은 계속 유효하다.

### Private App Subnet

```text
Private App Subnet (ap-south-1a, ap-south-1c)
  - ECS Fargate Dashboard Backend (FastAPI)
  - ElastiCache Redis (캐시 + Pub/Sub)
  - Lambda notifier (DDB Streams trigger, VPC-attach)
```

Dashboard Web은 Vite + React 정적 SPA로 빌드해 S3 + CloudFront로 제공한다. Dashboard Backend/API는 ALB 뒤의 ECS Fargate FastAPI 서비스로 제공한다. Replay Builder / Near-miss Aggregator / AI Analytics Worker는 Phase 1 범위 밖이며, `docs/planning/17_expansion_roadmap.md`의 Phase 3 이후 트리거 기반으로 검토한다.

### Private Data Subnet

```text
Private Data Subnet (ap-south-1a, ap-south-1c)
  - RDS PostgreSQL (db.t4g.micro, Single-AZ, gp3 20GiB)
```

DynamoDB와 S3는 VPC 밖 managed service로 유지한다. 1번 VPC에는 S3/DynamoDB Gateway Endpoint를 두어 ECS/Lambda notifier가 NAT를 거치지 않고 접근할 수 있게 한다.

### VPC 밖 / 글로벌 관리형 서비스

```text
- S3 dashboard-web bucket (정적 SPA 호스팅, OAC)
- CloudFront + WAF
- Route53 hosted zone (Gabia 신규 도메인 위임)
- ACM (us-east-1: CloudFront, ap-south-1: ALB)
- Cognito User Pool + Hosted UI
- Lambda data processor (IoT Rule trigger, 팀 합의 영역)
- Lambda report-generator (EventBridge schedule)
- Bedrock Claude 3 Haiku
- EventBridge Scheduler
- DynamoDB aegis-factory-status (LATEST + HISTORY + Streams)
- DynamoDB aegis-daily-report
- S3 aegis-bucket-data raw/processed/reports prefix
```

### 데이터 흐름

```text
factory-a/b/c telemetry
  -> IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor
          -> DynamoDB LATEST
          -> DynamoDB HISTORY
          -> S3 processed
          -> DynamoDB Streams -> Lambda notifier -> Redis Pub/Sub
  -> ALB -> ECS Fargate Dashboard Backend
  -> Dashboard Web
```

### Dashboard Web/API 제공 범위

Dashboard Web/API가 제공하는 화면은 아래 범위다.

```text
Dashboard Web/API
  - 공장별 Risk Score
  - 공장별 latest status
  - 이벤트 목록
  - Fleet / Factory overview
  - Environment / Infrastructure 추세
  - Timeline
  - 센서 / AI / 장비 / workload / pipeline 상태 요약
  - 일간 Markdown 보고서
```

## 최종 리소스 배치 요약

### Factory-a

```text
Factory-a
  - Raspberry Pi K3s
  - Safe-Edge workload
  - Edge Agent
```

### Factory-b

```text
Factory-b
  - Mac mini VM K3s
  - dummy workload
  - Edge Agent
```

### Factory-c

```text
Factory-c
  - Windows VM K3s
  - dummy workload
  - Edge Agent
```

### Control / Management VPC

```text
Control / Management VPC
  - EKS Hub
  - Hub ArgoCD
  - Tailscale
  - Prometheus Agent
  - Grafana
  - AWS Load Balancer Controller
```

### Data / Dashboard VPC (Phase 1 통합 목표)

```text
Data / Dashboard VPC
  - Public Subnet × 2 AZ: IGW, NAT Gateway × 1, ALB
  - Private App Subnet × 2 AZ: ECS Fargate Backend, Redis, Lambda notifier
  - Private Data Subnet × 2 AZ: RDS PostgreSQL
  - VPC Gateway Endpoint: S3, DynamoDB

VPC 외부 / 글로벌 (1번 VPC와 한 영역으로 다이어그램 표기)
  - S3 dashboard-web bucket (정적 SPA 호스팅, OAC, `aegis-bucket-data`와 분리된 신규 bucket)
  - CloudFront (+ WAF) → S3 dashboard-web bucket
  - Lambda data processor (IoT Rule trigger)
  - Lambda report-generator + EventBridge Scheduler
  - Bedrock Claude 3 Haiku
  - DynamoDB LATEST/HISTORY (`aegis-factory-status`)
  - DynamoDB daily report metadata (`aegis-daily-report`)
  - S3 raw / S3 processed (단일 bucket `aegis-bucket-data` + prefix, ADR 0009)
  - Cognito User Pool (관리자 전용, MFA Required)
  - Route53 (신규 도메인) + ACM
```

후속 (Phase 2~4):

```text
- Timestream / Kinesis / OpenSearch
- Multi-AZ RDS PostgreSQL / Redis
- Replay Builder / Near-miss Aggregator
- AI / Analytics Worker
- Multi-tenant / Compliance 기능
```

## 최종 흐름

### 배포 흐름

```text
GitHub Actions
  -> ECR
  -> Hub ArgoCD
  -> Tailscale
  -> factory-a/b/c
```

### 데이터 흐름

```text
factory-a/b/c
  -> IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor -> DynamoDB LATEST/HISTORY + S3 processed
          -> DynamoDB Streams -> Lambda notifier -> Redis Pub/Sub
  -> ALB -> ECS Fargate Dashboard Backend
  -> Dashboard Web (CloudFront + S3 SPA)
```

### 관측 흐름

```text
Hub EKS / Prometheus Agent / Edge Agent metrics
  -> AMP
  -> Grafana
```

## 2026-05-15 워크스트림 분리

이 문서의 클라우드 구조는 그대로 유지되지만, 구현 작업은 두 환경으로 나눠 병렬 진행한다.

```text
워크스트림 A (팀, 다른 환경)
  - 영역: 2번 Control / Management VPC
  - 마일스톤: M1, M2, M3, M5
  - 리소스: EKS Hub, ArgoCD, Tailscale, Prometheus Agent, Grafana,
           AWS Load Balancer Controller, Admin UI Ingress
  - source of truth: 기존 코드/문서 흐름 유지

워크스트림 B (이 작업 환경)
  - 영역: 1번 Data / Dashboard VPC
  - 마일스톤: M4, M6
  - 리소스: IoT Core 이후 Lambda data processor 라우팅,
           DynamoDB LATEST/HISTORY (aegis-factory-status),
           S3 processed (aegis-bucket-data prefix, ADR 0009),
           Dashboard Web (정적 SPA + S3 + CloudFront, ADR 0006),
           Dashboard Backend (ECS Fargate + ALB, ADR 0012),
           RDS PostgreSQL (ADR 0017),
           ElastiCache Redis + WebSocket (ADR 0014/0015),
           LLM 일간 보고서 (Bedrock, ADR 0016),
           CloudFront/WAF/Route53/ACM (신규 도메인, ADR 0010),
           Cognito User Pool (관리자 전용, MFA, ADR 0008)
  - source of truth: 본 환경에서 갱신
```

두 워크스트림의 합류 지점은 네트워크가 아니라 AWS 관리형 저장소와 IAM 권한이다.

```text
공유 자원
  - GitHub (코드, GitOps, 문서)
  - ECR (`aegis/edge-agent` 외 후속 repo)
  - AWS 계정 / 리전 ap-south-1
  - S3 raw / processed
  - DynamoDB LATEST / HISTORY
  - IoT Core (송신 측은 워크스트림 A, 처리/저장 측은 워크스트림 B)
```

VPC Peering / Transit Gateway 등으로 두 VPC를 네트워크 연결하지 않는다는 `docs/planning/07_dashboard_vpc_extension_plan.md` 결정은 그대로 유지한다.

관련 결정:

- `docs/changes/0005-work-split-control-vs-data-dashboard.md` - 워크스트림 분리 ADR
- `docs/planning/16_data_dashboard_vpc_workplan.md` - 본 환경(워크스트림 B) 작업 범위와 진입 순서

## 2026-05-18 Phase 1 통합 토폴로지 확정

워크스트림 분리 후 1번 Data/Dashboard VPC의 초기 서버리스 초안을 ADR 0006~0011로 정리했으나, 2026-05-18 Phase 1 통합 결정으로 ECS Fargate Backend, RDS PostgreSQL, Redis, WebSocket, Bedrock 일간 보고서를 Phase 1 배포 목표에 포함했다.

```text
사용자 흐름:
  사용자 → Route53 (dashboard.<신규 도메인>)
        → CloudFront (+ WAF, OAC)
        → S3 (Vite + React 정적 SPA)
        → 브라우저 → Cognito Hosted UI (OIDC PKCE 로그인)
        → 브라우저 → ALB (Authorization: Bearer JWT)
        → ECS Fargate Dashboard Backend (JWT 앱 레벨 검증)
        → DynamoDB LATEST/HISTORY (read)
        → S3 processed (read, 장기 이력)
        → RDS PostgreSQL (메타·권한 read)
        → Redis (캐시·Pub/Sub)

데이터 흐름:
  Edge Agent → IoT Core
            ├ IoT Rule → S3 raw (aegis-bucket-data/raw/...)
            └ IoT Rule → Lambda data processor (VPC 밖)
                        ├ DynamoDB LATEST overwrite
                        ├ DynamoDB HISTORY (TTL 24h)
                        └ S3 processed (aegis-bucket-data/processed/...)
                           └ DynamoDB Streams → Lambda notifier → Redis → WebSocket

보고서 흐름:
  EventBridge Scheduler (09:00 KST)
    → Lambda report-generator
    → Bedrock Claude 3 Haiku
    → S3 reports/ + DynamoDB aegis-daily-report
```

확정 결정:

| 항목 | 결정 | ADR |
| --- | --- | --- |
| Frontend | Vite + React 정적 SPA, S3 + CloudFront 배포 | 0006 |
| API 런타임 | ECS Fargate Dashboard Backend + ALB. ADR 0007의 Dashboard API 부분 supersede | 0012 |
| Lambda data processor | IoT Rule trigger Lambda. ADR 0007 중 이 부분은 유효 | 0007 |
| 인증 | Cognito User Pool (Self sign-up Disabled, MFA Required) + 앱 레벨 JWT 검증 | 0008 |
| S3 | 단일 bucket `aegis-bucket-data` + raw/processed prefix 분리 | 0009 |
| 도메인 | Gabia 신규 + Route53 위임, Admin UI(`*.minsoo-tech.cloud`)와 분리 | 0010 |
| 1번 VPC NAT Gateway | ADR 0011 supersede. NAT GW × 1 단일 AZ 재도입 | 0012 |
| 메타 저장소 | RDS PostgreSQL `db.t4g.micro`, Single-AZ, gp3 20GiB | 0017 |
| 캐시/실시간 | ElastiCache Redis + DynamoDB Streams + Lambda notifier + WebSocket | 0014/0015 |
| 일간 보고서 | Bedrock Claude 3 Haiku + EventBridge + Lambda report-generator | 0016 |
| Replay/Near-miss/AI Worker | Phase 1 범위 외. Phase 3 트리거 기반 검토 | 17 로드맵 |

## 2026-05-14 수정 방향

`docs/specs/data_storage_pipeline.md`를 IoT Core 이후 데이터 저장의 최신 source of truth로 둔다.

이전 문서에서 쓰던 `Event Processor`, `Risk Engine`, `Risk Normalizer`, `pipeline-status-aggregator`는 별도 장기 실행 컨테이너 서비스명이 아니라 Lambda data processor 내부 처리 단계로 해석한다.

MVP 최신 흐름은 아래와 같다.

```text
Edge Agent
  -> AWS IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor
          -> DynamoDB LATEST
          -> DynamoDB HISTORY
          -> S3 processed
  -> Dashboard API/Web
```
