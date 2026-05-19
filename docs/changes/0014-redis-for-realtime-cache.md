# 0014. 실시간 캐시 + Pub/Sub: ElastiCache Redis

상태: accepted
결정일: 2026-05-18
관련 범위: M6 Dashboard, 1번 Data/Dashboard VPC, 실시간 통신

> 2026-05-18 갱신: 초안에서는 Phase 1.5(포트폴리오 확장 단계)로 표기했으나, Phase 1 통합 결정에 따라 Phase 1 배포 목표의 일부다.

## 기존 계획

초안 MVP는 Dashboard API Lambda가 DynamoDB와 S3 processed만 read-only로 조회하는 구조였다 (ADR 0007). 캐시 계층은 정의되지 않았고, 클라이언트가 폴링하는 형태가 암묵적으로 가정되었다.

ADR 0012로 Dashboard Backend가 ECS Fargate 컨테이너로 전환되고, ADR 0015로 WebSocket 실시간 푸시가 도입되면 다음 두 가지 문제가 발생한다.

1. 동일 데이터 (예: factory-a 현재 risk_score)를 다수 사용자가 동시 조회 시 DDB 호출 폭증 + 비용 증가
2. WebSocket 클라이언트가 여러 Fargate task에 분산 연결될 때, 한 task만 DDB Streams 이벤트를 받는다면 다른 task의 클라이언트는 push를 못 받음

## 변경된 실제 기준

### ElastiCache Redis 도입 (두 가지 역할)

ElastiCache Redis를 1번 VPC Private App Subnet에 두고 두 가지 용도로 사용한다.

```text
[Cache]   API 응답 캐싱 (Cache-Aside 패턴)
            - factory:LATEST:<factory_id>     TTL 5s
            - factory:meta:<factory_id>       TTL 60s
            - user:permissions:<user_id>      TTL 300s

[Pub/Sub] WebSocket 메시지 fan-out (ECS Task 간 broadcast)
            - channel: factory:update:<factory_id>
            - publisher: Lambda notifier (DDB Streams trigger)
            - subscriber: 각 ECS Fargate task의 WebSocket handler
```

### 인스턴스 선택

- 엔진: Redis 7.x (Pub/Sub + Streams + JSON 모듈)
- 노드: `cache.t4g.micro` (2 vCPU, 0.5 GiB) — 단일 노드
- Multi-AZ replication 비활성화 (Phase 1·데모 한정, Phase 2에서 검토)
- 클러스터 모드 비활성화 (단일 primary)

### 배치 위치

- 1번 VPC **Private App Subnet**
- 보안그룹: Fargate task SG와 Lambda notifier SG에서만 6379 inbound 허용

### 자격증명

- AUTH token: Secrets Manager 저장
- TLS in-transit 암호화 활성화 (`transit_encryption_enabled = true`)

## 변경 이유

### Cache가 필요한 이유

- WebSocket fan-out 후에도 클라이언트 초기 접속 시 LATEST 조회는 DDB hit → 다수 동시접속 시 비용·지연 증가
- RDS PostgreSQL 사용자 권한 조회는 매 API 호출마다 발생 → 동일 사용자 반복 호출 시 캐시 hit이 명백히 효율적
- DynamoDB DAX는 분당 호출 수가 적어 비용 대비 효과가 낮음. ElastiCache가 다용도(캐시+Pub/Sub)로 유리

### Pub/Sub이 필요한 이유

- ECS Fargate task가 1개 이상으로 늘어나면, DynamoDB Streams 이벤트는 Lambda notifier가 한 번만 받는다 → 어느 task가 WebSocket 클라이언트를 들고 있는지 모름
- 해결: notifier가 Redis Pub/Sub에 publish → 모든 ECS task가 subscribe → 자신이 들고 있는 WebSocket 클라이언트에만 forward
- 데모는 task 1개로 시작하지만, **scale-out 가능한 구조**를 처음부터 설계 (포트폴리오 신호)

### 트리거 기록

Phase 1 통합 결정과 함께 다음이 충족됨:

- WebSocket 실시간 푸시 도입 결정 (ADR 0015)
- ECS task 수평 확장 가능성 (동시 사용자 5명 이상 데모)
- 동일 데이터 반복 조회 패턴 (대시보드 갱신 주기 5s 이내)

## 영향

### Terraform IaC

- `infra/data-dashboard/`에 신규:
  - `aws_elasticache_subnet_group` (Private App Subnet 2개)
  - `aws_elasticache_replication_group` (single node, transit_encryption, AUTH)
  - `aws_secretsmanager_secret` (AUTH token)
  - 보안그룹 규칙: Fargate task SG + Lambda notifier SG에서 6379 inbound

### Backend 코드 (FastAPI)

- 라이브러리: `redis-py` async (`redis.asyncio`)
- 캐시 헬퍼:
  ```python
  async def get_factory_latest(factory_id: str) -> dict:
      key = f"factory:LATEST:{factory_id}"
      cached = await redis.get(key)
      if cached:
          return json.loads(cached)
      latest = await ddb.get_item(...)
      await redis.set(key, json.dumps(latest), ex=5)
      return latest
  ```
- WebSocket handler:
  ```python
  pubsub = redis.pubsub()
  await pubsub.subscribe(f"factory:update:{factory_id}")
  async for msg in pubsub.listen():
      await websocket.send_json(msg["data"])
  ```

### Lambda notifier (ADR 0015 참조)

- DDB Streams trigger
- 변경된 factory_id에 대해 `PUBLISH factory:update:<factory_id> <payload>`
- Redis 접속 자격증명: Secrets Manager
- Lambda VPC-attach 필요 (Redis가 VPC 안에 있으므로) — Phase 1 한정

### 비용

- `cache.t4g.micro` 상시: ~$12/월
- 데모 운영 (월 2회 × 8h): ~$1.50/월
- destroy 후: $0

### 명시적 비채택

- DynamoDB DAX → 분당 호출 수가 적고, Pub/Sub 기능 없음
- AWS MemoryDB → Redis 100% 호환이지만 비용 ~$80/월, Phase 1 범위에서 과잉
- Self-hosted Redis on Fargate → 운영 부담, persistence 관리 복잡
- Apache Kafka (MSK) → 메시지 보장 등급 필요 없음, 비용 ~$150/월

### 합류 지점 영향

- 없음. 워크스트림 A 영향 없음
- DDB Streams는 워크스트림 B의 DDB 테이블에 직접 활성화

## 업데이트 필요한 문서

- `docs/changes/README.md` (인덱스에 0014 추가)
- `docs/architecture/01_target_architecture.md` (Redis 위치 + 두 가지 역할)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (Phase 1 자원 목록에 Redis 추가)
- `docs/planning/17_expansion_roadmap.md` (Phase 1 트리거 표)
- `docs/ops/15_aws_cost_baseline.md` (Redis 비용)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (WebSocket fan-out 동작 설명)

## 검증

- `terraform plan`에 ElastiCache replication group + subnet group + SG 포함
- `aws elasticache describe-replication-groups` → status `available`
- ECS Backend에서 Redis 연결 (`PING` → `PONG`)
- Cache hit 메트릭 (`redis_keyspace_hits`) 측정 가능
- Pub/Sub 검증: 별도 publisher가 `PUBLISH factory:update:factory-a "test"` → ECS Backend log에 수신 기록
- WebSocket end-to-end 테스트 (ADR 0015 검증과 합산): DDB write → Lambda notifier → Redis publish → ECS subscribe → WebSocket client 수신
- AUTH 미인증 시 연결 거부 확인
- destroy 후 잔존 자원 없음
