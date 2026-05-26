# 0015. Dashboard 실시간 푸시: WebSocket + DynamoDB Streams

상태: accepted
결정일: 2026-05-18
관련 범위: M6 Dashboard, 실시간 통신, 1번 Data/Dashboard VPC

> 2026-05-18 갱신: 초안에서는 Phase 1.5(포트폴리오 확장 단계)로 표기했으나, Phase 1 통합 결정에 따라 Phase 1 배포 목표의 일부다.
> 2026-05-21 후속 보정: ADR 0022에 따라 DynamoDB Streams source table은 `aegis-factory-status`가 아니라 공식 hot store `AEGIS-DynamoDB-FactoryStatus`다.

## 기존 계획

초안 MVP는 Dashboard Web이 API Gateway + Lambda로 DynamoDB를 read-only 폴링하는 형태로 정의됐다 (ADR 0006/0007). 폴링 주기는 `docs/planning/07_dashboard_vpc_extension_plan.md`의 "일반 상태 변화 10~35초, 장애 판정 40~60초" 기준에 맞춰 5~10초 간격을 암묵 가정했다.

폴링 방식의 한계:

- 동시 사용자가 5명 이상이면 빈 호출 비율(no-change 응답) 폭증 → DDB 비용 + 무의미한 응답 트래픽
- 클라이언트 측 갱신 지연 = 폴링 주기. 진짜 실시간 아님
- API Gateway·DDB 호출 수 증가 → 비용·throttling 위험

## 변경된 실제 기준

### WebSocket 기반 실시간 푸시 도입

Dashboard Web ↔ Backend 사이를 WebSocket으로 연결하고, Lambda data processor가 DDB에 write할 때마다 자동으로 클라이언트에 push한다.

```text
factory-a/b/c
  → IoT Core → IoT Rule → Lambda data processor
                              → DDB LATEST (write)
                                  │
                                  ▼ (DynamoDB Streams)
                              Lambda notifier (VPC-attach)
                                  │
                                  ▼ (Redis PUBLISH)
                              ElastiCache Redis Pub/Sub
                                  │
                                  ▼ (SUBSCRIBE)
                              ECS Fargate Backend × N
                                  │
                                  ▼ (WebSocket)
                              Dashboard Web 클라이언트
```

### 구성 요소

| 컴포넌트 | 역할 |
| --- | --- |
| DynamoDB Streams | `AEGIS-DynamoDB-FactoryStatus` LATEST/HISTORY 테이블에 활성화. NEW_AND_OLD_IMAGES |
| Lambda notifier | Streams trigger, VPC-attach, Redis publish 전담 |
| Redis Pub/Sub | ECS task 간 fan-out 채널 (ADR 0014) |
| ECS Fargate Backend | WebSocket endpoint 호스팅, Redis subscribe |
| Dashboard Web (React) | WebSocket client, 수신 메시지로 store 갱신 |

### Endpoint 설계

- WebSocket URL: `wss://api.<도메인>/ws/factories/{factory_id}`
- 인증: 연결 시 query parameter 또는 첫 메시지로 Cognito JWT 전달. Backend가 검증
- 채널 분리: `factory_id`별 별도 WebSocket session
- 메시지 포맷: JSON
  ```json
  {
    "type": "factory_update",
    "factory_id": "factory-a",
    "timestamp": "2026-05-18T12:00:00Z",
    "payload": {
      "risk_score": 42,
      "current_status": "safe",
      "top_causes": ["temp_high"]
    }
  }
  ```

### Fallback

- WebSocket 연결 실패 시 자동으로 30초 폴링으로 degradation
- 재연결 시도: 1s → 2s → 5s → 10s exponential backoff (최대 30s)

## 변경 이유

### 폴링 한계 정량

- 동시 사용자 5명 × 5초 폴링 = 분당 60건 DDB read → 한 달 ~2.6M read units
- WebSocket 전환 시 DDB read는 클라이언트 초기 접속 1회 + Streams trigger 시점에만 → 90% 이상 감소

### WebSocket 선택 (vs SSE / AppSync / API GW WebSocket)

| 옵션 | 장점 | 단점 |
| --- | --- | --- |
| **WebSocket on Fargate** ★ | 양방향, Backend·언어 자유, Redis Pub/Sub 자연스러움 | LB sticky session 필요(ALB로 해결) |
| Server-Sent Events (SSE) | 구현 단순, HTTP/1.1 기반 | 단방향, 일부 프록시 호환성 |
| AppSync GraphQL | 관리형, schema 강제 | 학습 곡선, 자유도 낮음, Cognito federation 별도 |
| API Gateway WebSocket | 서버리스, 자동 스케일 | $1.00/M msg, 동시 연결 비용, 백엔드 통합 복잡 |

**선택 이유**: ADR 0012로 이미 Fargate Backend가 있으므로 추가 인프라 0. Redis Pub/Sub fan-out (ADR 0014) 와 결합해 scale-out 가능.

### DynamoDB Streams를 트리거로 쓰는 이유

- IoT Rule → Lambda data processor 안에서 직접 publish하면 처리 단계가 비대해짐
- DDB Streams는 "데이터가 실제로 저장됨"을 보장하는 시점에 발화 → 정확성 ↑
- Lambda notifier 분리로 retry·DLQ·관측을 독립적으로 관리 가능

### 트리거 기록

Phase 1 통합 결정과 함께 다음이 충족됨:

- 동시 사용자 5명 이상 데모 시나리오
- 폴링 주기 < 5s 요구 (실시간성 강화)
- "실시간 알림" 발표 항목

## 영향

### Terraform IaC

- DynamoDB `AEGIS-DynamoDB-FactoryStatus` 공식 hot store에 Streams 활성화(ADR 0022):
  ```hcl
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
  ```
- `aws_lambda_function` (notifier): Python, VPC-attach (Redis 접근용)
- `aws_lambda_event_source_mapping`: DDB Streams → notifier
- 보안그룹: notifier Lambda → Redis 6379 inbound 허용

### Backend 코드 (FastAPI)

- `websockets` 라이브러리 + FastAPI WebSocket route
- 연결당 Redis pubsub subscribe
- JWT 검증: 연결 시 `?token=` 또는 첫 메시지 `auth` event
- 그레이스풀 종료: 연결 끊김 시 subscribe 해제

### Frontend 코드 (React)

- `react-use-websocket` 또는 직접 `WebSocket` API
- Zustand/Redux store에 push 메시지 반영
- 연결 상태 표시 (connected / reconnecting / disconnected)
- Cognito access token을 query param으로 전달

### 비용

- DDB Streams: $0.02/100k read units (매우 적음)
- Lambda notifier: 호출당 ~0.001s, 분당 60~80 호출 → 한 달 ~$0 (free tier)
- 추가 비용: 거의 0 (Redis는 ADR 0014에서 이미 계상)

### Trace / 관측

- X-Ray segment: DDB Stream → Lambda notifier → Redis publish → ECS receive → WebSocket send
- CloudWatch 메트릭:
  - DDB Streams iterator age (지연 측정)
  - Lambda notifier duration / error
  - Redis pub/sub command rate
  - WebSocket 활성 연결 수 (Backend custom metric)

### 명시적 비채택

- 폴링 단독 유지 → 비용·실시간성 한계, ADR 0011 destroy 패턴과 충돌 없음에도 portfolio 신호 약함
- AppSync GraphQL subscriptions → 학습 곡선·비용, Phase 1 범위에서 과잉
- API Gateway WebSocket → Backend가 이미 Fargate라 중복
- MQTT broker (HiveMQ 등) → 외부 시스템 추가, IoT Core와 역할 혼동

## 업데이트 필요한 문서

- `docs/changes/README.md` (인덱스에 0015 추가)
- `docs/architecture/01_target_architecture.md` (실시간 푸시 흐름 신설)
- `docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio` (WebSocket fan-out 표현)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (Phase 1 구현 순서에 notifier·WebSocket)
- `docs/planning/17_expansion_roadmap.md` (Phase 1 트리거 표)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (WebSocket endpoint·메시지 스키마)
- `docs/ops/15_aws_cost_baseline.md` (DDB Streams·Lambda notifier 항목)

## 검증

- DDB LATEST에 임의 item write → CloudWatch에서 notifier Lambda invocation 확인
- Redis `MONITOR` 명령으로 publish 이벤트 관측
- ECS Backend log에 subscribe 메시지 수신 기록
- 브라우저 WebSocket 클라이언트가 `wss://api.<도메인>/ws/factories/factory-a` 연결 → DDB write 후 1초 이내 push 수신
- JWT 미인증 시 연결 거부 (`401` 또는 close code `4001`)
- 연결 1000개 시나리오 (k6 또는 artillery) 부하 테스트 → ECS task CPU/메모리 안정
- Fallback 폴링 동작: WebSocket 차단(보안그룹으로 모의) → 클라이언트가 30초 폴링으로 전환
- destroy 후 잔존 Stream / Lambda 없음
