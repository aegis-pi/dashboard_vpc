# Cloud Architecture Final

상태: source of truth
기준일: 2026-05-09

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
Public Subnet
  - 골격만 (MVP에서 NAT GW / IGW / ALB / EC2 모두 두지 않음)
  - 외부 진입은 모두 VPC 밖 또는 글로벌 자원이 담당:
      CloudFront (글로벌, S3 SPA 앞단)
      WAF (CloudFront 앞단)
      Route53 (Gabia 신규 도메인 위임)
      ACM (us-east-1: CloudFront, ap-south-1: API Gateway)
      API Gateway custom domain
      Cognito Hosted UI
```

> Note: ALB는 MVP에서 1번 VPC에 두지 않는다. SPA는 CloudFront, API는 API Gateway custom domain이 직접 받는다. 후속에 컨테이너 기반 백엔드가 추가되면 ALB 도입을 재검토한다.
> NAT Gateway도 MVP에서 만들지 않는다 (`docs/changes/0011-no-nat-gateway-in-data-dashboard-vpc.md`). Lambda가 VPC 밖에 있어 1번 VPC 안에서 외부로 나갈 워크로드가 없다.

### Private App Subnet

```text
Private App Subnet
  - (MVP에서는 비어 있음)
  - 후속 단계에서 컨테이너 기반 워크로드가 추가될 경우 사용
```

MVP에서 1번 VPC 안에는 상시 실행 워크로드를 두지 않는다.

- Dashboard Web은 정적 SPA로 빌드해 S3 + CloudFront로 제공한다 (`docs/changes/0006-frontend-static-spa-with-vite.md`)
- Dashboard Backend/API와 Lambda data processor는 모두 VPC 밖 Lambda + API Gateway로 동작한다 (`docs/changes/0007-dashboard-api-runtime-lambda.md`)
- Replay Builder / Near-miss Aggregator / AI Analytics Worker는 MVP 범위 외 (후속, M7+)

### Private Data Subnet

```text
Private Data Subnet
  - MVP에서는 만들지 않음
  - 후속 RDS / PostgreSQL / Redis / ElastiCache / OpenSearch 추가 시 신규 생성
```

MVP에서 사용하는 DynamoDB와 S3는 VPC 밖 managed service이므로 subnet 안에 두지 않는다. 필요 시 VPC Gateway Endpoint(S3, DynamoDB — 무료)만 추가한다.

### 데이터 흐름

```text
factory-a/b/c telemetry
  -> IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor
          -> DynamoDB LATEST
          -> DynamoDB HISTORY
          -> S3 processed
  -> Dashboard Backend/API
  -> Dashboard Web
```

### Dashboard Web/API 제공 범위

Dashboard Web/API가 제공하는 화면은 아래 범위다.

```text
Dashboard Web/API
  - 공장별 Risk Score
  - 공장별 latest status
  - 이벤트 목록
  - near-miss 요약
  - replay 결과
  - 센서 / AI / 장비 상태 요약
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

### Data / Dashboard VPC (MVP)

```text
Data / Dashboard VPC
  - VPC + Public/Private subnet 골격만 (MVP에서 모든 subnet 비어 있음)
  - NAT Gateway 없음 (ADR 0011)
  - Internet Gateway 없음 (필요 시 후속에 ALB/IGW 함께 추가)
  - VPC Gateway Endpoint: S3, DynamoDB (무료, 후속 워크로드 대비 권장)

  ※ 1번 VPC 내부 워크로드 없음. 아래는 모두 VPC 밖 또는 글로벌 자원.

VPC 외부 / 글로벌 (1번 VPC와 한 영역으로 다이어그램 표기)
  - S3 dashboard-web bucket (정적 SPA 호스팅, OAC, `aegis-bucket-data`와 분리된 신규 bucket)
  - CloudFront (+ WAF) → S3 dashboard-web bucket
  - Lambda Dashboard API + API Gateway (Cognito Authorizer)
  - Lambda data processor (IoT Rule trigger)
  - DynamoDB LATEST/HISTORY (`aegis-factory-status`)
  - S3 raw / S3 processed (단일 bucket `aegis-bucket-data` + prefix, ADR 0009)
  - Cognito User Pool (관리자 전용, MFA Required)
  - Route53 (신규 도메인) + ACM
```

후속 (MVP 외):

```text
- 1번 VPC Private App Subnet에 컨테이너 기반 워크로드 (필요 시)
- Replay Builder
- Near-miss Aggregator
- AI / Analytics Worker
- 1번 VPC Private Data Subnet 신규 + RDS / Redis / OpenSearch
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
  -> Dashboard API
  -> Dashboard Web
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
           Dashboard API (Lambda + API Gateway, ADR 0007),
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

## 2026-05-15 1번 VPC MVP 토폴로지 확정

워크스트림 분리 후 1번 Data/Dashboard VPC 세부 구성을 ADR 0006~0010으로 확정했다.

```text
사용자 흐름:
  사용자 → Route53 (dashboard.<신규 도메인>)
        → CloudFront (+ WAF, OAC)
        → S3 (Vite + React 정적 SPA)
        → 브라우저 → Cognito Hosted UI (OIDC PKCE 로그인)
        → 브라우저 → API Gateway (Authorization: Bearer JWT)
        → API Gateway Cognito Authorizer 검증
        → Dashboard API Lambda (VPC 밖)
        → DynamoDB LATEST/HISTORY (read)
        → S3 processed (read, 장기 이력)

데이터 흐름:
  Edge Agent → IoT Core
            ├ IoT Rule → S3 raw (aegis-bucket-data/raw/...)
            └ IoT Rule → Lambda data processor (VPC 밖)
                        ├ DynamoDB LATEST overwrite
                        ├ DynamoDB HISTORY (TTL 24h)
                        └ S3 processed (aegis-bucket-data/processed/...)
```

확정 결정:

| 항목 | 결정 | ADR |
| --- | --- | --- |
| Frontend | Vite + React 정적 SPA, S3 + CloudFront 배포 | 0006 |
| API 런타임 | Lambda + API Gateway, Lambda는 VPC 밖 | 0007 |
| 인증 | Cognito User Pool (Self sign-up Disabled, MFA Required) + API Gateway Cognito Authorizer | 0008 |
| S3 | 단일 bucket `aegis-bucket-data` + raw/processed prefix 분리 | 0009 |
| 도메인 | Gabia 신규 + Route53 위임, Admin UI(`*.minsoo-tech.cloud`)와 분리 | 0010 |
| 1번 VPC NAT Gateway | MVP에서 만들지 않음 (Lambda VPC 밖, 내부 워크로드 없음) | 0011 |
| Replay/Near-miss/AI Worker | MVP 범위 외 (M7+로 미룸) | (이 문서) |

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
