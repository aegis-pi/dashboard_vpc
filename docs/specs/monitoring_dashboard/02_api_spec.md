# Monitoring Dashboard API Spec

상태: source of truth
기준일: 2026-06-01
수정 이력:
  - 2026-06-01  GRAPH#5M 응답 필드에 센서 min/max와 AI mean/max 분리 기준 추가.
  - 2026-05-29  안전 점수 그래프용 `risk_score_max` 응답 필드 추가.
  - 2026-05-29  ADR 0025 구현 완료 반영. history endpoint window 분기 현행화. GRAPH#5M 응답 필드 명세 추가.
  - 2026-05-28  history endpoint에 ADR 0025 window 분기 계획 추가. 현행 max_items=500 cap 임시방편 명시.
  - 2026-05-26  Step 6 구현 결과 반영. history endpoint 3개 분리 → 1개 통합(/history?window=). reports endpoint path 구조 갱신. WebSocket JWT 전달 방식 ?token= 파라미터로 확정. skeleton 항목 명시.
  - 2026-05-20  Phase 1 통합 결정(ADR 0012~0017) 반영. API Gateway/Lambda API 초안을 ALB + ECS Fargate Backend + 앱 레벨 JWT 검증 + WebSocket 기준으로 갱신.
  - 2026-05-15  ADR 0007/0008로 API Gateway + Lambda + Cognito Authorizer 확정. 후속 API 후보를 확정 경로로 갱신.
  - 2026-04-28  초안

## 목적

현재 `factory-a` dashboard와 후속 Hub/Risk Twin dashboard의 API 경계를 구분한다.

## 현재 Factory-A 기준

현재 dashboard는 별도 API를 사용하지 않는다.

```text
Grafana -> InfluxDB
Grafana -> Prometheus
```

따라서 현재 운영 기준 API는 없다.

## 현재 Query 기준

환경 센서:

```sql
SELECT mean("temperature") FROM "environment_data" WHERE $timeFilter GROUP BY time($__interval) fill(null)
SELECT mean("humidity") FROM "environment_data" WHERE $timeFilter GROUP BY time($__interval) fill(null)
SELECT mean("pressure") FROM "environment_data" WHERE $timeFilter GROUP BY time($__interval) fill(null)
```

AI/Sound 최근 N개:

```sql
SELECT "fire_detected" FROM "ai_detection" WHERE $timeFilter ORDER BY time DESC LIMIT 10
SELECT "fallen_detected" FROM "ai_detection" WHERE $timeFilter ORDER BY time DESC LIMIT 10
SELECT "bending_detected" FROM "ai_detection" WHERE $timeFilter ORDER BY time DESC LIMIT 10
SELECT "is_danger" FROM "acoustic_detection" WHERE $timeFilter ORDER BY time DESC LIMIT 10
```

## 1번 Data / Dashboard VPC API (Phase 1 확정 경로)

ADR 0012~0017로 Phase 1 API 런타임과 저장소/실시간 경로가 확정됐다. ADR 0007의 Dashboard API Lambda 부분은 supersede됐고, Lambda data processor 부분만 유효하다.

Dashboard Backend는 Spoke K3s, ArgoCD, Control/Management VPC의 EKS API, Tailscale 관리망을 직접 호출하지 않는다. DynamoDB LATEST/HISTORY, S3 processed/reports, RDS PostgreSQL, Redis를 조회한다.

### 접근 경로

```text
브라우저 (정적 SPA)
  -> Route53 (api.<신규 도메인>)
  -> ALB (HTTPS/TLS, ACM)
  -> ECS Fargate Dashboard Backend (FastAPI)
      -> Cognito JWT 앱 레벨 검증
      -> DynamoDB LATEST/HISTORY (read-only IAM)
      -> S3 processed (read-only IAM, 장기 이력)
      -> S3 reports (read-only IAM, Markdown 보고서)
      -> RDS PostgreSQL (사용자·공장·권한 메타데이터)
      -> Redis (캐시 + Pub/Sub subscribe)
```

### 인증 헤더

```text
Authorization: Bearer <Cognito Access Token>
```

- Cognito Hosted UI에서 OIDC PKCE flow로 발급받은 JWT
- FastAPI backend가 JWKS 기반으로 서명/만료/audience를 앱 레벨에서 검증
- 사용자-공장 권한은 RDS PostgreSQL의 메타데이터를 기준으로 필터링

### REST Endpoint (Phase 1 Step 6 구현 완료)

기준 데이터 모델은 `docs/specs/data_storage_pipeline.md`의 DynamoDB schema를 따른다.

| Method | Path | 인증 | 동작 | 백엔드 조회 | 상태 |
| --- | --- | --- | --- | --- | --- |
| GET | `/healthz` | 없음 | liveness | `{"status":"ok"}` | 구현 완료 |
| GET | `/factories` | Cognito JWT | 공장 목록 + latest 요약 | DDB Query (pk=FACTORY#*, sk=LATEST) | 구현 완료 |
| GET | `/factories/{factory_id}` | Cognito JWT | 단일 공장 latest 전체 | DDB GetItem | 구현 완료 |
| GET | `/factories/{factory_id}/history?window=1h` | Cognito JWT | 시계열 (risk/factory_state/infra_state 통합) | DDB Query (`sk BETWEEN HISTORY#STATE#`, max_items=500 cap) | 구현 완료 |
| GET | `/factories/{factory_id}/history?window=6h\|12h\|24h` | Cognito JWT | 5분 avg/min/max 집계 시계열 | DDB Query (`sk BETWEEN GRAPH#5M#`, 최대 288 items) | **구현 완료** (ADR 0025) |
| GET | `/reports` | Cognito JWT | 보고서 목록 (skeleton) | DDB Query `aegis-daily-report` — LLM report-generator 후속 작업 이후 | skeleton |
| GET | `/reports/{report_date}/{factory_id}` | Cognito JWT | 공장별 Markdown 보고서 (skeleton) | DDB GetItem + S3 GetObject (reports/) — LLM report-generator 후속 작업 이후 | skeleton |

**Note**: history endpoint sk prefix 규칙 (ADR 0022 + ADR 0025):
- `HISTORY#STATE#*`: window=1h 전용. max_items=500 cap으로 semaphore 포화 방지.
- `GRAPH#5M#*`: window=6h/12h/24h 전용. 5분 집계, 최대 288 items/factory.
- `HISTORY#RISK`, `HISTORY#FACTORY`, `HISTORY#INFRA` prefix는 사용하지 않는다.

**window=1h 응답 필드 (HISTORY#STATE)**:

| 필드 | 설명 |
| --- | --- |
| `timestamp` | sk에서 추출한 ISO timestamp |
| `risk_score` | risk.score (현재값) |
| `risk_level` | safe / warning / danger |
| `temperature_celsius_avg` | factory_state 센서 평균 |
| `humidity_percent_avg` | factory_state 센서 평균 |
| `pressure_hpa_avg` | factory_state 센서 평균 |
| `fire_score` / `fall_score` / `bend_score` | AI 탐지 점수 (0~1) |
| `node_summary` | infra_state 노드 요약 |
| `nodes` | infra_state 노드별 CPU/memory/disk |

**window=6h/12h/24h 응답 필드 (GRAPH#5M, ADR 0025)**:

| 필드 | 원천 | 설명 |
| --- | --- | --- |
| `timestamp` | `bucket_start` | 버킷 시작 시각 |
| `is_bucket` | 고정 `true` | GRAPH#5M 아이템 구분 플래그 |
| `risk_score` / `risk_score_avg` | `risk.score.mean` | 5분 평균 |
| `risk_score_min` | `risk.score.min` | 5분 최솟값. 안전 점수 위험 피크와 평균~최소 음영 기준 |
| `risk_score_max` | `risk.score.max` | 5분 최댓값. tooltip/검증용 |
| `temperature_celsius_avg` | `sensor.temperature_celsius.mean` | 5분 평균 |
| `temperature_celsius_min` / `temperature_celsius_max` | `sensor.temperature_celsius.min/max` | 온도 최대 피크·음영·tooltip |
| `humidity_percent_avg` | `sensor.humidity_percent.mean` | 5분 평균 |
| `humidity_percent_min` / `humidity_percent_max` | `sensor.humidity_percent.min/max` | 습도 최소~최대 범위 |
| `pressure_hpa_avg` | `sensor.pressure_hpa.mean` | 5분 평균 |
| `pressure_hpa_min` / `pressure_hpa_max` | `sensor.pressure_hpa.min/max` | 기압 최소~최대 변동폭 |
| `fire_score` / `fall_score` / `bend_score` | `ai_detection.by_type.*.mean` | AI 탐지 평균선 |
| `fire_score_max` / `fall_score_max` / `bend_score_max` | `ai_detection.by_type.*.max` | 버킷 내 최대값. 0.8 이상 spike marker/tooltip |
| `cpu_usage_percent_mean` | `infra.cpu_usage_percent.mean` | 노드 평균 집계 |
| `memory_usage_percent_mean` | `infra.memory_usage_percent.mean` | |
| `disk_usage_percent_last` | `infra.disk_usage_percent.last` | |

Risk Score 방향: **100 = 최안전, 0 = 최위험**

| 구간 | level | Frontend 표시 |
| --- | --- | --- |
| 85 ~ 100 | 안전 | threshold line y=85 |
| 50 ~ 84 | 주의 | threshold line y=50/85 |
| 0 ~ 49 | 위험 | threshold line y=50 |

공장에 GRAPH#5M 데이터가 없으면 빈 배열 `[]` 반환. factory-a는 Edge Agent 비활성 구간에 따라 데이터 없을 수 있음.

### WebSocket Endpoint (Phase 1 Step 6 구현 완료)

| Method | Path | 인증 | 동작 | 백엔드 경로 | 상태 |
| --- | --- | --- | --- | --- | --- |
| WS | `/ws/factories/{factory_id}` | Cognito JWT (?token= 파라미터) | 공장 상태 변경 push | Redis Pub/Sub `factory:update:<factory_id>` subscribe | 구현 완료 |

**Note**: WebSocket JWT는 `Authorization` 헤더 대신 `?token=<JWT>` 쿼리 파라미터로 전달한다. 브라우저 WebSocket API는 커스텀 헤더를 지원하지 않기 때문이다.

### ALB / Backend 정책

- ALB listener는 HTTPS만 허용하고 HTTP는 redirect
- CORS: 정적 SPA 도메인(`https://dashboard.<신규 도메인>`)만 Allow-Origin
- Backend logging: 구조화 JSON 로그 + CloudWatch Logs
- Backend IAM: DDB `Query`/`GetItem`, S3 `GetObject`, Secrets Manager read 등 최소 권한
- ECS service circuit breaker와 `/healthz` health check 사용

### 목표 반영 지연

```text
일반 상태 변화: 10~35초
장애 판정: 40~60초
DDB Streams -> WebSocket push: 1~2초
```

(`docs/planning/07_dashboard_vpc_extension_plan.md` 기준 그대로)

### 명시적으로 다루지 않는 것

- 쓰기 API (관리자가 데이터 수정/이벤트 입력) — MVP 범위 외
- Replay/Near-miss API — Phase 3 후속
- Timestream/Kinesis/OpenSearch 조회 API — Phase 2 후속

## 현재 판단

- `factory-a` 운영 dashboard는 Grafana datasource query로 충분하다.
- API spec은 M6 Risk Twin / Data / Dashboard VPC 구현 시 source of truth로 승격한다.
- 현재는 후속 설계 초안으로만 유지한다.
