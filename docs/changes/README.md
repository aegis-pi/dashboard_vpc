# Change Records

상태: source of truth
기준일: 2026-06-02

## 목적

이 디렉터리는 초기 계획과 실제 구현/운영 기준이 달라진 결정을 추적한다.

운영 문서는 현재 기준을 설명하고, 변경 기록은 왜 계획이 바뀌었는지와 어떤 영향을 남겼는지 설명한다.

## 기록 기준

- 계획과 실제 구현이 달라진 경우 기록한다.
- 장애 테스트, 운영 안정성, 보안, 비용, 보존 정책에 영향을 주는 변경은 반드시 기록한다.
- 단순 오탈자나 문서 표현 보정은 기록하지 않는다.
- SSH 비밀번호, token, certificate private key 같은 민감 정보는 기록하지 않는다.

## 목록

| ID | 제목 | 상태 | 결정일 | 영향 범위 |
| --- | --- | --- | --- | --- |
| 0001 | AI snapshot storage: Longhorn PVC -> node-local hostPath | accepted | 2026-04-29 | M0, ai-apps, failover |
| 0002 | Failback controller: Kubernetes CronJob -> master OS cron | accepted | 2026-04-29 | M0, failback |
| 0003 | NFS cold storage and hot/cold tiering deferred | accepted | 2026-04-29 | M0, data retention |
| 0004 | GitOps source: local repo -> GitHub repo + ArgoCD UI sync | accepted | 2026-04-28 | M0, deployment |
| 0005 | Workstream split: team -> 2번 Control/Management VPC, this env -> 1번 Data/Dashboard VPC | accepted | 2026-05-15 | M3~M6, 작업 환경 분리 |
| 0006 | Dashboard frontend: Vite + React 정적 SPA + S3/CloudFront | accepted | 2026-05-15 | M6, frontend, 1번 VPC |
| 0007 | Dashboard API runtime: Lambda + API Gateway, Lambda는 VPC 밖 | Dashboard API 부분 superseded by 0012 / Lambda data processor 부분 accepted | 2026-05-15 | M6, Lambda, 1번 VPC |
| 0008 | Dashboard 인증: Cognito User Pool (관리자 전용) + API Gateway Authorizer | accepted | 2026-05-15 | M6, 인증/인가 |
| 0009 | S3 저장소: `aegis-bucket-data` 단일 bucket + prefix 분리 | accepted | 2026-05-15 | M4, S3, 워크스트림 합류 |
| 0010 | Dashboard 도메인: Gabia 신규 + Route53 위임 + Admin UI 도메인과 분리 | accepted | 2026-05-15 | M6, 도메인/DNS |
| 0011 | 1번 Data/Dashboard VPC NAT Gateway 제거 | superseded by 0012 | 2026-05-15 | M4/M6, 1번 VPC 비용/네트워크 |
| 0012 | Dashboard Backend 런타임: ECS Fargate 컨테이너 | accepted | 2026-05-18 | M6, 1번 VPC |
| 0013 | 메타데이터 저장소: Aurora Serverless v2 PostgreSQL | superseded by 0017 | 2026-05-18 | M6, 1번 VPC, 관계형 DB |
| 0014 | 실시간 캐시 + Pub/Sub: ElastiCache Redis | accepted | 2026-05-18 | M6, 1번 VPC, 실시간 |
| 0015 | Dashboard 실시간 푸시: WebSocket + DynamoDB Streams | accepted | 2026-05-18 | M6, 실시간 통신, DDB table 기준은 0022 |
| 0016 | LLM 일간 보고서: Amazon Bedrock + EventBridge schedule | accepted | 2026-05-18 | M6, AI/LLM, 보고 자동화 |
| 0017 | 메타데이터 저장소: RDS PostgreSQL | accepted | 2026-05-19 | M6, 1번 VPC, 관계형 DB, 비용 |
| 0018 | IoT Topic Rule 확장: factory-a 단일 구독 → factory-c 추가 구독 | accepted | 2026-05-19 | M4 데이터 평면, M5 factory-c, 워크스트림 A↔B 합류 |
| 0019 | factory-c 토폴로지: single-node → master + worker (2-VM K3s cluster) | accepted | 2026-05-19 | M5 VM Spoke 확장, factory-c testbed, 시연 표현 |
| 0020 | data-processor 계약 정렬: 팀원 코드 수용, DDB pk/sk, TTL 48h, S3 processed 경로 스펙 보정 | accepted | 2026-05-21 | M4 데이터 플레인, apps/data-processor, 중간 DDB table(0022에서 교체) |
| 0021 | Lambda data processor IoT Rule 트리거: 신규 Rule 2개 추가 (factory_state / infra_state), 기존 Rule 미수정 | accepted | 2026-05-21 | Phase 1 Step 4, M4 합류 지점, infra/data-dashboard, IoT Rule |
| 0022 | Dashboard hot store: 신규 `aegis-factory-status` 대신 기존 `AEGIS-DynamoDB-FactoryStatus` 사용 | accepted | 2026-05-21 | Phase 1 Step 3~6, DynamoDB, Lambda data processor/notifier, Dashboard Backend |
| 0023 | GitHub OIDC Web Deploy Role: 별도 role 신설 (ADR 0023) | accepted | 2026-05-26 | Phase 1 Step 9, GitHub Actions, IAM, S3/CloudFront |
| 0024 | Permanent resource split: CloudFront/Cognito/ECR/S3-web 영구 root 분리 | accepted | 2026-05-26 | Phase 1 Step 9.5, infra/data-dashboard-permanent/, Terraform state |
| 0025 | Multi-resolution history storage: history_raw TTL 2h + GRAPH#5M 5분 집계 | accepted | 2026-05-29 | Phase 1 data pipeline, DynamoDB HISTORY/GRAPH#5M, Lambda Aggregator(팀원 배포), Dashboard Backend/Frontend |
| 0026 | DynamoDB key model: FACTORY pk + LATEST/HISTORY#STATE/GRAPH#5M sk 운영 확인 | accepted | 2026-05-29 | AEGIS-DynamoDB-FactoryStatus, Dashboard Backend, data pipeline |
| 0027 | Cloud infra metrics collector: Container Insights 상시 수집 대신 Fast(1m)/Slow(5m) collector read model | proposed | 2026-06-01 | M4/M6 데이터 플레인, Dashboard BE/FE, CLOUD#infra, EKS/ArgoCD 합류 지점, 비용 |
| 0028 | Dashboard staleness threshold: infra 지연 표시와 pipeline_status 60/120초 통일 | accepted | 2026-06-02 | M4/M6, apps/data-processor, apps/dashboard-web, stale 표시 |
| 0029 | Dashboard 보고서 조회: DynamoDB `aegis-daily-report` 대신 S3 `reports/daily/` Markdown read | accepted | 2026-06-02 | M6, apps/dashboard-backend/web, S3 reports prefix, ECS IAM |
| 0030 | ECS backend right-sizing(0.5→1 vCPU) + Application Auto Scaling(min 2, ALBRequestCountPerTarget 40 + CPU 50%) | accepted | 2026-06-04 | M6, infra/data-dashboard ECS, 비용 baseline |

## 파일 형식

각 변경 기록은 아래 항목을 가진다.

```text
기존 계획
변경된 실제 기준
변경 이유
영향
업데이트 필요한 문서
검증
```
