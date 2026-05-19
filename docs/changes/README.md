# Change Records

상태: source of truth
기준일: 2026-04-30

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
| 0015 | Dashboard 실시간 푸시: WebSocket + DynamoDB Streams | accepted | 2026-05-18 | M6, 실시간 통신 |
| 0016 | LLM 일간 보고서: Amazon Bedrock + EventBridge schedule | accepted | 2026-05-18 | M6, AI/LLM, 보고 자동화 |
| 0017 | 메타데이터 저장소: RDS PostgreSQL | accepted | 2026-05-19 | M6, 1번 VPC, 관계형 DB, 비용 |
| 0018 | IoT Topic Rule 확장: factory-a 단일 구독 → factory-c 추가 구독 | accepted | 2026-05-19 | M4 데이터 평면, M5 factory-c, 워크스트림 A↔B 합류 |

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
