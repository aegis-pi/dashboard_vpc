# 0013. 메타데이터 저장소: Aurora Serverless v2 PostgreSQL

상태: superseded by 0017
결정일: 2026-05-18
관련 범위: M6 Dashboard, 1번 Data/Dashboard VPC, 관계형 데이터

> 2026-05-19 갱신: 1번 Data/Dashboard VPC의 메타데이터 저장소는 Aurora Serverless v2가 아니라 **RDS PostgreSQL**로 변경한다. 최신 기준은 `docs/changes/0017-rds-postgresql-for-metadata.md`를 따른다.

> 2026-05-18 갱신: 초안에서는 Phase 1.5(포트폴리오 확장 단계)로 표기했으나, Phase 1.5를 Phase 1으로 통합한 결정에 따라 본 ADR도 Phase 1 배포 목표의 일부다 (`docs/planning/17_expansion_roadmap.md`).

## 기존 계획

ADR 0009로 시계열·이벤트성 데이터(센서 측정값, risk 계산 결과, 처리 이력)는 S3 + DynamoDB로 저장한다고 결정했다. 사용자/공장/권한/알림룰 같은 메타데이터의 저장소는 명시적으로 결정되지 않았고, 암묵적으로 "DynamoDB 추가 테이블"이 가정되었다.

`docs/specs/data_storage_pipeline.md`는 `factory_id`, `node_id` 같은 키를 메시지 안에 포함시키는 형태로만 정의하고, "공장이 누구의 책임이고, 알림 임계값이 무엇이며, 어느 사용자가 어떤 공장에 접근 가능한가" 같은 관계형 엔티티는 다루지 않는다.

## 변경된 실제 기준

### Aurora Serverless v2 PostgreSQL을 메타데이터 저장소로 도입

공장·사용자·권한·알림룰·세션 같은 관계형 엔티티를 **Aurora Serverless v2 PostgreSQL**에 저장한다.

```text
DynamoDB LATEST/HISTORY   센서/risk 측정값 (시계열, hot store)
S3 raw/processed          원본 + 처리 결과 (장기 이력)
Aurora PostgreSQL         공장·사용자·권한·알림룰·감사 (관계형)
ElastiCache Redis         실시간 캐시 + WebSocket Pub/Sub (ADR 0014)
```

### 엔진 결정 — PostgreSQL

- 표준 SQL + JSONB 지원 (이벤트 payload 일부를 JSONB로 저장 가능)
- 시계열 확장(TimescaleDB) 호환 — Phase 2 시계열 DB 이전 시 옵션
- pgvector — Phase 3 LLM/검색 통합 시 옵션
- 팀 내 표준 SQL 친숙도가 MySQL과 비슷하거나 더 높음

### 배치 위치

- 1번 VPC **Private Data Subnet** (신규)
- Multi-AZ 비활성화 (Phase 1·데모 운영, 비용 절감)
- ACU: min 0.5 / max 2 (auto-scaling)
- Storage: 자동 확장 (Aurora 표준)

### 접근 경로

- ECS Fargate Backend (1번 VPC Private App) → Aurora (1번 VPC Private Data)
- 보안그룹: Fargate task SG만 5432 inbound 허용
- 자격증명: Secrets Manager (자동 회전 30일)

### 스키마 (초기)

```sql
-- 공장 메타
CREATE TABLE factory (
  factory_id        TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  environment_type  TEXT NOT NULL,        -- physical-rpi / vm-mac / vm-windows
  owner_user_id     TEXT REFERENCES app_user(user_id),
  location          TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 사용자 (Cognito sub와 매핑)
CREATE TABLE app_user (
  user_id           TEXT PRIMARY KEY,     -- Cognito sub
  email             TEXT UNIQUE,
  display_name      TEXT,
  role              TEXT NOT NULL,        -- admin / operator / viewer
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 사용자 ↔ 공장 권한
CREATE TABLE user_factory_access (
  user_id    TEXT REFERENCES app_user(user_id),
  factory_id TEXT REFERENCES factory(factory_id),
  permission TEXT NOT NULL,               -- read / write / admin
  PRIMARY KEY (user_id, factory_id)
);

-- 알림 임계값 / 룰
CREATE TABLE alert_rule (
  rule_id     UUID PRIMARY KEY,
  factory_id  TEXT REFERENCES factory(factory_id),
  metric      TEXT NOT NULL,              -- risk_score / temperature / ...
  threshold   NUMERIC NOT NULL,
  comparator  TEXT NOT NULL,              -- gt / lt / eq
  enabled     BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 감사 로그 (Backend 접근 기록)
CREATE TABLE audit_log (
  log_id     BIGSERIAL PRIMARY KEY,
  user_id    TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  details    JSONB,
  occurred_at TIMESTAMPTZ DEFAULT now()
);
```

## 변경 이유

### DynamoDB로는 부적합

- JOIN 미지원 → 사용자/공장/권한 3-way 조회 시 N+1 또는 application-side join
- 트랜잭션 제약 (단일 region, 25 item 한계) → 권한·사용자 변경 시 일관성 위험
- 스키마 변경 시 백필·재인덱싱 비용 큼
- 관계형 ERD를 ADR로 보여줄 수 없음 (Single Table Design은 학습 난이도 ↑)

### Aurora Serverless v2 선택

- Provisioned 대비 idle 비용 최소화 (min 0.5 ACU = ~$45/월 상시, 데모 운영 시 ~$5/월)
- Multi-AZ 비활성화로 추가 비용 절감 (Phase 1·데모 한정)
- 표준 PostgreSQL 호환 → 마이그레이션·로컬 개발 친화
- pgvector·TimescaleDB 등 확장으로 Phase 2~3 진화 가능

### 트리거 기록

`docs/planning/17_expansion_roadmap.md`의 Phase 1 통합 결정과 함께 다음이 충족됨:

- 공장·사용자·권한 엔티티 수 > 5개 관계
- JOIN 필요 쿼리 발생 (사용자 권한 기반 공장 조회)
- 알림 룰 CRUD 화면 도입 결정

## 영향

### Terraform IaC

- `infra/data-dashboard/`에 신규 모듈:
  - `aws_rds_cluster` (engine=`aurora-postgresql`, mode=`provisioned`, serverlessv2_scaling)
  - `aws_rds_cluster_instance` (writer 1개)
  - `aws_db_subnet_group` (Private Data Subnet 2개)
  - `aws_secretsmanager_secret` (마스터 비밀번호, 자동 회전)
  - 보안그룹: Fargate task SG inbound 5432 허용
- 신규 subnet: 1번 VPC Private Data Subnet × 2 (ap-south-1a, ap-south-1c)
  - Aurora는 subnet group에 2개 이상 AZ subnet이 필요해서 Multi-AZ 비활성화여도 subnet은 2개 정의

### Backend 코드

- FastAPI에 SQLAlchemy 2.x async + asyncpg 도입
- Connection pool: pool_size=5, max_overflow=10
- 마이그레이션: Alembic
- 모델: factory, app_user, user_factory_access, alert_rule, audit_log

### 데이터 흐름 (예시)

```text
사용자 로그인 (Cognito JWT)
  -> ECS Backend
      -> Cognito sub로 app_user 조회
      -> user_factory_access JOIN factory 으로 권한 있는 공장 목록 반환
      -> 각 공장의 LATEST는 DDB에서, HISTORY는 DDB 또는 S3에서 조합
```

### 비용

- 상시 (min 0.5 ACU): ~$45/월
- 데모 운영 (월 2회 × 8h): ~$5/월
- destroy 후: $0 (DB snapshot은 S3에 저장하면 ~$0.10/월)

### 백업 / 복구

- 자동 백업 7일 보존 (Aurora 표준)
- destroy 전 manual snapshot 생성 (`scripts/destroy/destroy-data-dashboard.sh` 안에 절차 포함)
- 다음 build 시 snapshot에서 복원 옵션

### 명시적 비채택

- RDS PostgreSQL (Aurora 아닌 일반 RDS) → 자동 storage scaling 없음, Serverless v2 없음
- MySQL → Phase 2 시계열 확장(TimescaleDB)·pgvector 활용 시 PostgreSQL 우위
- DynamoDB 단일 사용 → JOIN·트랜잭션 제약으로 메타데이터 부적합
- Multi-AZ Aurora → Phase 1·데모 한정 비용 부담 (필요 시 Phase 2에서 활성화 ADR)

## 업데이트 필요한 문서

- `docs/changes/README.md` (인덱스에 0013 추가)
- `docs/architecture/01_target_architecture.md` (Aurora 위치 + 스키마 요약)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (자원 목록에 Aurora 추가)
- `docs/planning/17_expansion_roadmap.md` (Phase 1 구성 + Phase 2 Multi-AZ 트리거)
- `docs/ops/15_aws_cost_baseline.md` (Aurora 비용 항목)
- `docs/specs/monitoring_dashboard/03_data_model.md` (신규 또는 갱신 — ERD 포함)

## 검증

- `terraform plan`에 Aurora cluster + instance + subnet group + Secrets 생성 포함
- `aws rds describe-db-clusters` → status `available`
- ECS Fargate task가 Aurora에 연결 (`SELECT 1` 헬스체크 통과)
- Alembic migration이 깨끗하게 실행 (`alembic upgrade head`)
- Backend `/healthz`가 Aurora connection pool 상태 포함하여 200 반환
- 데모 종료 후 destroy 절차: snapshot → cluster delete → snapshot S3 보존 확인
- 다음 build 시 snapshot에서 복원 검증 (옵션 시나리오)
