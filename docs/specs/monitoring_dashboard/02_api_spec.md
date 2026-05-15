# Monitoring Dashboard API Spec

상태: draft
기준일: 2026-05-15
수정 이력:
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

## 1번 Data / Dashboard VPC API (확정 경로)

ADR 0007/0008로 런타임과 인증이 확정됨. Dashboard API는 Spoke K3s, ArgoCD, Control/Management VPC의 EKS API, Tailscale 관리망을 직접 호출하지 않는다. DynamoDB LATEST/HISTORY와 S3 processed를 조회한다.

### 접근 경로

```text
브라우저 (정적 SPA)
  -> Route53 (api.<신규 도메인>)
  -> API Gateway custom domain (TLS/ACM)
  -> API Gateway Cognito Authorizer (JWT 검증)
  -> Dashboard API Lambda (VPC 밖)
      -> DynamoDB LATEST/HISTORY (read-only IAM)
      -> S3 processed (read-only IAM, 장기 이력)
```

### 인증 헤더

```text
Authorization: Bearer <Cognito Access Token>
```

- Cognito Hosted UI에서 OIDC PKCE flow로 발급받은 JWT
- API Gateway Cognito Authorizer가 서명/만료/audience 자동 검증
- Lambda는 검증된 claim을 `event.requestContext.authorizer.jwt.claims`로 받음

### Endpoint 후보 (MVP)

기준 데이터 모델은 `docs/specs/data_storage_pipeline.md`의 DynamoDB schema를 따른다.

| Method | Path | 동작 | 백엔드 조회 |
| --- | --- | --- | --- |
| GET | `/factories` | 공장 목록과 latest 요약 | DDB Query (pk=FACTORY#*, sk=LATEST) |
| GET | `/factories/{factory_id}` | 단일 공장 latest 전체 | DDB GetItem |
| GET | `/factories/{factory_id}/risk-history?window=1h` | Risk 그래프 | DDB Query (sk begins_with HISTORY#RISK#) |
| GET | `/factories/{factory_id}/factory-history?window=1h` | 환경 그래프 | DDB Query (sk begins_with HISTORY#FACTORY#) |
| GET | `/factories/{factory_id}/infra-history?window=1h` | 노드 그래프 | DDB Query (sk begins_with HISTORY#INFRA#) |
| GET | `/factories/{factory_id}/processed/{path}` | 장기 이력 단건 조회 (감사) | S3 GetObject (processed/...) |

### API Gateway 정책

- Throttling: account 기본값 외에 usage plan으로 burst/rate 제한
- Request validation: JSON Schema (path/query parameter)
- CORS: 정적 SPA 도메인(`https://dashboard.<신규 도메인>`)만 Allow-Origin
- X-Ray tracing: 활성

### Lambda 정책

- Lambda Powertools (구조화 로그, 메트릭, X-Ray)
- IAM: DDB `Query`/`GetItem` + S3 `GetObject`만 허용 (write 없음)
- Reserved concurrency 또는 Provisioned concurrency는 후속 결정

### 목표 반영 지연

```text
일반 상태 변화: 10~35초
장애 판정: 40~60초
```

(`docs/planning/07_dashboard_vpc_extension_plan.md` 기준 그대로)

### 명시적으로 다루지 않는 것

- 쓰기 API (관리자가 데이터 수정/이벤트 입력) — MVP 범위 외
- WebSocket/SSE 푸시 — MVP는 SPA의 polling(10초 refresh)으로 처리
- Replay/Near-miss API — M7+ 후속 (옵션 a 채택)

## 현재 판단

- `factory-a` 운영 dashboard는 Grafana datasource query로 충분하다.
- API spec은 M6 Risk Twin / Data / Dashboard VPC 구현 시 source of truth로 승격한다.
- 현재는 후속 설계 초안으로만 유지한다.
