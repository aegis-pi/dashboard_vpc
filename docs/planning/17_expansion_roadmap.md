# Data / Dashboard VPC 확장 로드맵

상태: source of truth
기준일: 2026-05-19
수정 이력:
  - 2026-05-19 v0.3  ADR 0017 반영. 메타 저장소를 RDS PostgreSQL로 변경하고 비용·Phase 2 Multi-AZ 표현 조정.
  - 2026-05-18 v0.2  Phase 1 MVP(서버리스 최소 구성)와 Phase 1.5(컨테이너 확장)를 통합. Phase 1 = 통합된 목표.
  - 2026-05-18 v0.1  초안. Phase 1 → 1.5 → 2 → 3 → 4 단계와 정량 트리거 정의.

## 목적

워크스트림 B(1번 Data/Dashboard VPC)의 단계별 확장 경로와 각 단계 진입을 결정하는 **정량적 트리거**를 정의한다.

이 문서의 핵심 원칙:

- **추측이 아니라 측정값이 다음 단계를 트리거한다**
- 각 전환은 ADR로 근거를 남기고, 운영 baseline metrics가 임계값을 넘을 때만 진행한다
- "지금 안 만들지만 언제 만들 것인지"가 명확해야 시니어 설계로 인정된다

## Phase 통합 결정 (2026-05-18)

초안에서는 두 단계로 분리했었다.

```text
[초안 — 폐기]
Phase 1   : MVP 서버리스 최소 구성 (Lambda Dashboard API + 1번 VPC 비어있음)
Phase 1.5 : 포트폴리오 확장 (ECS Fargate + RDS PostgreSQL + Redis + WebSocket + Bedrock)
```

본 환경 목적이 팀 포트폴리오 발표용이고, MVP 단계를 별도로 배포·운영하지 않기로 결정하면서 두 단계를 하나로 통합한다.

```text
[현재 — Phase 1]
Phase 1   : ECS Fargate + RDS PostgreSQL + Redis + WebSocket + Bedrock (= 통합된 배포 목표)
Phase 2   : Production-Ready 강화 (Timestream, Kinesis, OpenSearch, Multi-AZ)
Phase 3   : AI/Analytics (EKS GPU / SageMaker, Replay Builder, Near-miss)
Phase 4   : Multi-tenant / Compliance (IdP federation, Security Hub, PrivateLink)
```

ADR 0007(Dashboard API Lambda)·ADR 0011(NAT Gateway 제거) 중 Phase 1.5에서만 supersede한다고 표기됐던 부분은 본 통합 결정으로 **무조건 supersede**로 갱신한다. 단, ADR 0007의 Lambda data processor (IoT Rule trigger) 부분은 그대로 유효.

## Phase 1 — 통합된 배포 목표 (현재)

### 구성

```text
[변경 없음 — 팀 합의]
factory-a/b/c → Edge Agent → IoT Core (3s sensor, 20s heartbeat)
  IoT Rule → S3 raw/
  IoT Rule → Lambda data processor → DDB LATEST/HISTORY, S3 processed/

[워크스트림 B 자유 설계]
사용자 / 인증 / 정적 SPA   CloudFront + S3 + Cognito (VPC 밖)

1번 VPC Public Subnet      ALB (HTTPS, ACM)
                          NAT Gateway × 1 (단일 AZ)

1번 VPC Private App Subnet ECS Fargate Dashboard Backend (FastAPI)
                          ElastiCache Redis (단일 노드)

1번 VPC Private Data Subnet RDS PostgreSQL (db.t4g.micro, Single-AZ, gp3 20GiB)

실시간 푸시               DDB Streams → Lambda notifier (VPC-attach)
                          → Redis Pub/Sub → ECS WebSocket fan-out

LLM 일간 보고서            EventBridge schedule → Lambda report-generator
                          → Bedrock Claude 3 Haiku → S3 reports/
```

### 관련 ADR

| ADR | 결정 |
| --- | --- |
| 0005 | 워크스트림 분리 |
| 0006 | Frontend = Vite + React 정적 SPA |
| 0008 | Cognito Self sign-up Disabled, MFA Required |
| 0009 | S3 `aegis-bucket-data` 단일 bucket + prefix |
| 0010 | Dashboard 도메인 신규 + Gabia + Route53 위임 |
| 0012 | Dashboard Backend = ECS Fargate (Phase 1.5 → Phase 1로 통합) |
| 0013 | Aurora Serverless v2 PostgreSQL (superseded by 0017) |
| 0017 | RDS PostgreSQL |
| 0014 | ElastiCache Redis (캐시 + Pub/Sub) |
| 0015 | WebSocket + DynamoDB Streams |
| 0016 | Bedrock Claude 3 Haiku 일간 보고서 |

ADR 0007(Dashboard API Lambda)과 ADR 0011(NAT GW 제거)는 Phase 1에서 **Dashboard API/NAT GW 영역에 한해** supersede. Lambda data processor 영역은 ADR 0007 그대로 유효.

### 운영 패턴 (확정)

```text
데모 직전:  scripts/build/build-data-dashboard.sh   (예정 — Terraform apply)
데모 직후:  scripts/destroy/destroy-data-dashboard.sh (예정 — snapshot 후 destroy)
```

- 월 데모 2회 × 8시간 가동 기준 ~$8~10/월
- 상시 가동 시 ~$125/월
- destroy 후 비용 ~$2~3 (RDS snapshot 보존 시)

### 비용 baseline

| 항목 | 시간당 (USD) | 730h 환산 | 데모 운영 (16h/월) |
| --- | --- | --- | --- |
| NAT Gateway × 1 | $0.056 | $40.88 | $0.90 |
| ALB | $0.0225 + LCU | $18~22 | $0.50 |
| ECS Fargate (0.5 vCPU / 1GB) | $0.025 | $18.25 | $0.40 |
| RDS PostgreSQL `db.t4g.micro` | $0.021 | $15.33 | $0.34 |
| RDS PostgreSQL gp3 20GiB | — | $2.62 | $2.62 |
| ElastiCache Redis (cache.t4g.micro) | $0.016 | $11.68 | $0.26 |
| Bedrock Claude 3 Haiku (일 3 호출) | — | $0.22 | $0.22 |
| Lambda + DDB + S3 + CloudFront + Cognito + API GW | — | ~$2 | ~$2 |
| **합계** | — | **~$125** | **~$6.55 + 사용량 ~$2 = ~$8~10** |

데모 운영 패턴은 ALB·RDS PostgreSQL compute·Redis·Fargate가 idle인 시간이 길어 실제 청구는 더 낮을 수 있다. RDS gp3 storage와 snapshot은 월정액 성격이 있으므로 첫 운영 사이클 후 Cost Explorer로 보정.

### 성공 기준

- factory-a 실제 센서 값이 IoT Core를 거쳐 1초 이내 대시보드 WebSocket으로 push됨
- factory-b/c dummy 값이 동일 경로로 표시됨
- RDS PostgreSQL의 사용자·공장·권한 관계로 권한 기반 공장 목록 필터링 정상
- 매일 09:00 KST 자동 일간 보고서 생성 + Dashboard 보고서 탭에서 열람
- `destroy-data-dashboard.sh` 후 AWS Cost Explorer에서 24h 이내 실행 리소스 비용이 0에 수렴. RDS snapshot 보존 비용은 별도 추적

## Phase 2 — Production-Ready 강화

### 무엇을 추가하는가

1. **Timestream** 시계열 DB — DDB HISTORY를 이전
2. **Kinesis Data Streams + Firehose** — IoT Rule fan-out에 추가, Parquet 변환
3. **OpenSearch** — 로그·이벤트 중앙 검색
4. **Multi-AZ RDS PostgreSQL / Redis** — 가용성
5. **VPC Endpoint (Interface)** Bedrock·Secrets·ECR — NAT GW 트래픽 일부 우회
6. **X-Ray + Container Insights 깊이 보강** — 분산 추적 완성

### 진입 트리거 (모두 측정 가능)

| 트리거 | 임계값 | 조치 |
| --- | --- | --- |
| DDB HISTORY 월 비용 | > $30 | Timestream으로 이전 |
| 시계열 윈도우 쿼리 응답 (p95) | > 1s | Timestream으로 이전 |
| HISTORY 보존 요구 | > 7일 | Timestream (수개월~수년 보존 저렴) |
| IoT Core 메시지율 | > 분당 1000건 | Kinesis 버퍼링 도입 |
| Lambda data processor 동시성 한계 도달 | throttling 발생 | Kinesis fan-out |
| 로그 검색 빈도 | 주 5회 이상 | OpenSearch 도입 |
| 데모가 아니라 상시 운영 결정 | — | Multi-AZ + NAT 트래픽 우회 |
| NAT GW 데이터 처리량 월 | > 100 GB | VPC Endpoint Interface 검토 |

### 관련 ADR (작성 예정)

- 0017 Timestream for HISTORY (조건부 도입)
- 0018 Kinesis Data Streams for IoT Rule fan-out
- 0019 OpenSearch for centralized logging
- 0020 Multi-AZ RDS PostgreSQL / Redis activation

### 예상 추가 비용

- Timestream: $0.50/GB write + $0.036/GB-h memory + $0.03/GB-h SSD → 사용량 의존, 데모 운영 시 ~$5/월
- Kinesis Data Streams: 1 shard × $0.015/h × 730 = ~$11/월
- OpenSearch t3.small.search × 1 = ~$25/월
- Multi-AZ RDS PostgreSQL: standby instance 추가로 DB compute 비용 약 2배 (+~$15/월부터)

상시 운영 시 ~$200/월 수준 예상.

## Phase 3 — AI / Analytics

### 무엇을 추가하는가

1. **EKS GPU 노드 또는 SageMaker** — 영상·음성 분류, anomaly detection 모델 학습·서빙
2. **Replay Builder / Near-miss Aggregator** — ECS Fargate batch task
3. **Kinesis Data Analytics (Flink)** — 윈도우 집계 룰 (e.g. "최근 5분 평균 risk > 80")
4. **ElastiCache Redis Cluster** — 실시간 캐시 확장

### 진입 트리거

| 트리거 | 임계값 | 조치 |
| --- | --- | --- |
| LLM 보고서 품질 한계 | Bedrock Haiku로 불충분 → Sonnet 또는 자체 fine-tune 요구 | SageMaker / 모델 교체 ADR |
| 영상 분석 요구 | 발생 | EKS GPU 또는 SageMaker endpoint |
| Lambda data processor 실행 시간 p95 | > 10s | ECS stream consumer로 이전 |
| 의존성 패키지 (예: OpenCV, PyTorch) | > 200MB | 컨테이너 워크로드 |
| stateful 처리 (slide window 큰 메모리) 요구 | 발생 | ECS Fargate |
| 동시 사용자 | > 100명 | Redis Cluster, ECS scale-out |

### 관련 ADR (작성 예정)

- 0021 EKS GPU / SageMaker for ML workload
- 0022 ECS stream consumer (Replay Builder)
- 0023 Near-miss Aggregator
- 0024 Kinesis Data Analytics for windowed aggregation

### 예상 추가 비용

- SageMaker endpoint (ml.t2.medium): ~$50/월
- EKS GPU 노드 (g4dn.xlarge): ~$380/월 (사용 시간 한정 권장)
- ECS Fargate batch: 호출 빈도 의존, 보통 ~$10~30/월

## Phase 4 — Multi-tenant / Compliance

### 무엇을 추가하는가

1. **Cognito + IdP federation** (Okta, Azure AD, Google Workspace)
2. **CloudTrail + AWS Config + Security Hub + GuardDuty** — 감사·컴플라이언스
3. **WAF + Shield Advanced** — DDoS·L7 공격
4. **PrivateLink** — 협력사 공장 데이터 격리 전송
5. **Athena + Glue Catalog** — S3 raw/processed ad-hoc 분석
6. **Backup + Disaster Recovery** — cross-region snapshot, RPO/RTO 정의

### 진입 트리거

| 트리거 | 임계값 | 조치 |
| --- | --- | --- |
| 외부 공장(타사) 수 | ≥ 1개 | tenant 격리 설계 |
| 인증·컴플라이언스 요구 | ISMS / SOC2 / ISO27001 | CloudTrail + Config + Security Hub |
| 사용자 수 | > 50명 | IdP federation |
| 외부 노출 API endpoint 공격 | WAF로그 ratio > 5% | Shield Advanced |
| S3 ad-hoc 분석 빈도 | 주 5회 이상 | Athena + Glue |

### 관련 ADR (작성 예정)

- 0025 Cognito IdP federation
- 0026 CloudTrail + Config + Security Hub baseline
- 0027 WAF + Shield Advanced
- 0028 PrivateLink for cross-account data transfer

### 예상 추가 비용

- Shield Advanced: $3000/월 (대규모 외부 노출 시에만)
- Security Hub + Config + GuardDuty: ~$30~80/월
- Athena: $5/TB scanned (사용량 기반)

## 통합 트리거 표 (한 눈에)

| 신호 | Phase | 측정 방법 |
| --- | --- | --- |
| DDB HISTORY 비용 > $30/월 | 2 (Timestream) | Cost Explorer |
| 시계열 윈도우 쿼리 p95 > 1s | 2 (Timestream) | CloudWatch latency |
| 메시지율 > 분당 1000건 | 2 (Kinesis) | IoT Core 메시지 카운터 |
| 로그 검색 주 5회 이상 | 2 (OpenSearch) | 운영 회고 |
| Lambda data processor p95 > 10s | 3 (Container 이전) | CloudWatch Lambda Duration |
| ML/영상 워크로드 도입 | 3 (SageMaker/EKS GPU) | 비즈니스 결정 |
| 동시 사용자 > 100 | 3 (Redis Cluster) | Backend custom metric |
| 외부 공장(타사) ≥ 1개 | 4 (Multi-tenant) | 비즈니스 결정 |
| 컴플라이언스 인증 요구 | 4 (Audit baseline) | 비즈니스 결정 |

## 비용 곡선 (개략)

```text
월 비용 (USD)
  │
  │                                                ┌─ Phase 4 (~$3500)
  │                                          ┌─────┘ Shield Advanced 포함 시
  │                                          │
  │                                    ┌─────┘ Phase 3 (~$500)
  │                              ┌─────┘ SageMaker, ECS, Redis Cluster
  │                              │
  │                        ┌─────┘ Phase 2 (~$200)
  │                  ┌─────┘ Timestream, Kinesis, OpenSearch, Multi-AZ
  │                  │
  │  Phase 1 상시   ┌─┘ (~$125)
  │  ──────────────┘
  │
  │  Phase 1 데모  ── (~$8~10)
  │  ──────────────
  └─────────────────────────────────────────────────→ 시간/규모
```

## 의사결정 워크플로

각 Phase 진입 결정은 아래 단계를 거친다.

1. **Baseline metrics 수집** — CloudWatch 대시보드, Cost Explorer, 운영 회고에서 트리거 측정
2. **임계값 초과 확인** — 단발이 아니라 2주 이상 지속되는지
3. **ADR 작성** — `docs/changes/0NNN-...md`로 결정 근거·대안·영향·비용 정리
4. **Terraform module 추가** — `infra/data-dashboard/` 안에 신규 리소스
5. **테스트 환경에서 검증** — 데모 운영 패턴으로 build/destroy 사이클 통과
6. **운영 문서 갱신** — `docs/ops/15_aws_cost_baseline.md`, runbook, 아키텍처 다이어그램
7. **회고** — 운영 1~2주 후 ADR `검증` 섹션 갱신

## 명시적 비채택 (현 시점)

다음은 Phase 1 시점에 매력적이지만 의도적으로 미루는 결정이다.

| 항목 | 비채택 이유 | 재검토 조건 |
| --- | --- | --- |
| AppSync GraphQL | WebSocket on Fargate로 충분 (ADR 0015), 학습 곡선 부담 | Schema 강제·여러 데이터소스 통합 요구 |
| Self-hosted MQTT (EMQX/HiveMQ) | IoT Core가 무료 티어 안에서 충분 | 메시지율 > 분당 1만, 비용 검토 |
| MSK (Apache Kafka) | Kinesis로 충분 | 외부 시스템 연동 다수, schema registry 요구 |
| RDS Proxy | RDS PostgreSQL + 컨테이너 풀이면 Phase 1에 충분 | Lambda가 RDS PostgreSQL을 직접 호출하기 시작할 때 |
| AWS Lambda Power Tuning | Lambda data processor만 남아 단순 | data processor 비용·시간 최적화 시 |

## 참조

- `docs/changes/0012-introduce-container-backend-for-dashboard.md`
- `docs/changes/0013-aurora-serverless-for-metadata.md` (superseded)
- `docs/changes/0017-rds-postgresql-for-metadata.md`
- `docs/changes/0014-redis-for-realtime-cache.md`
- `docs/changes/0015-websocket-for-dashboard-realtime.md`
- `docs/changes/0016-bedrock-for-llm-report.md`
- `docs/planning/15_cloud_architecture_final.md`
- `docs/planning/16_data_dashboard_vpc_workplan.md`
- `docs/architecture/01_target_architecture.md`
- `docs/ops/15_aws_cost_baseline.md`
