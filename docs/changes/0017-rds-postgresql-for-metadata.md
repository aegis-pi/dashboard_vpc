# 0017. 메타데이터 저장소: RDS PostgreSQL

상태: accepted
결정일: 2026-05-19
관련 범위: M6 Dashboard, 1번 Data/Dashboard VPC, 관계형 데이터, 비용 기준

## 기존 계획

ADR 0013은 공장·사용자·권한·알림룰·감사 로그 같은 관계형 메타데이터를 Aurora Serverless v2 PostgreSQL에 저장하기로 결정했다.

이후 1번 Data/Dashboard VPC 설계를 재검토하면서 Phase 1의 목적이 "대규모 상시 운영"이 아니라 "데모 운영 패턴으로 비용을 낮춘 포트폴리오형 구현"임을 다시 확인했다. Aurora Serverless v2의 min 0.5 ACU 상시 비용은 작은 메타데이터 워크로드에는 과하다.

## 변경된 실제 기준

### RDS PostgreSQL을 메타데이터 저장소로 사용

공장·사용자·권한·알림룰·세션 같은 관계형 엔티티를 **Amazon RDS for PostgreSQL**에 저장한다.

```text
DynamoDB LATEST/HISTORY   센서/risk 측정값 (시계열, hot store)
S3 raw/processed          원본 + 처리 결과 (장기 이력)
RDS PostgreSQL            공장·사용자·권한·알림룰·감사 (관계형)
ElastiCache Redis         실시간 캐시 + WebSocket Pub/Sub (ADR 0014)
```

### 초기 배치 기준

- 엔진: Amazon RDS for PostgreSQL
- 인스턴스: `db.t4g.micro` (Single-AZ)
- Storage: gp3 20 GiB, storage autoscaling max 100 GiB
- 배치: 1번 VPC Private Data Subnet
- 가용성: Multi-AZ 비활성화 (Phase 1·데모 한정)
- 백업: 자동 백업 7일, destroy 전 manual snapshot 옵션

### 접근 경로

- ECS Fargate Backend (1번 VPC Private App) → RDS PostgreSQL (1번 VPC Private Data)
- 보안그룹: Fargate task SG만 5432 inbound 허용
- 자격증명: Secrets Manager
- Backend: SQLAlchemy 2.x async + asyncpg, Alembic migration

## 변경 이유

- Phase 1 메타데이터는 사용자·공장·권한·알림룰 중심이라 초기 부하가 작다.
- RDS PostgreSQL은 PostgreSQL 표준 기능(JSONB, extension, SQLAlchemy/Alembic 호환)을 유지하면서 Aurora Serverless v2보다 월 고정 비용이 낮다.
- `db.t4g.micro` + gp3 20 GiB는 데모·초기 운영에 충분하고, 필요 시 `db.t4g.small` 이상 또는 Multi-AZ로 증설 가능하다.
- Aurora Serverless v2의 자동 compute scaling은 매력적이지만, Phase 1에서는 비용 대비 필요성이 낮다.

## 영향

### Terraform IaC

- `infra/data-dashboard/` 데이터 저장소 리소스는 Aurora cluster가 아니라 일반 RDS DB instance로 작성한다.
  - `aws_db_instance` (engine=`postgres`, instance_class=`db.t4g.micro`)
  - `aws_db_subnet_group` (Private Data Subnet 2개)
  - `aws_secretsmanager_secret` (마스터 비밀번호)
  - 보안그룹: Fargate task SG inbound 5432 허용
- 기존 ADR 0013의 `aws_rds_cluster`, `aws_rds_cluster_instance`, `serverlessv2_scaling_configuration` 기준은 폐기한다.

### 비용

2026-05-19 AWS Price List API 기준, `ap-south-1`:

- RDS PostgreSQL `db.t4g.micro` Single-AZ: `$0.021 / hour` → `$15.33 / month`
- gp3 PostgreSQL storage: `$0.131 / GB-month`, 최소 20 GiB → `$2.62 / month`
- 상시 합계: 약 `$17.95 / month` (+ backup/snapshot 사용량)
- 데모 운영 16h/월: compute 약 `$0.34`, storage 약 `$2.62`

### 명시적 비채택

- Aurora Serverless v2 PostgreSQL → 초기 메타데이터 워크로드 대비 min ACU 비용이 큼
- DynamoDB 단일 사용 → JOIN·권한 관계·알림룰 CRUD에 부적합
- MySQL → JSONB, PostgreSQL extension, Phase 2 이후 TimescaleDB/pgvector 선택지를 유지하기 위해 비채택
- Multi-AZ RDS PostgreSQL → Phase 1·데모 한정 비용 부담. 상시 운영 결정 시 Phase 2에서 활성화

## 업데이트 필요한 문서

- `docs/changes/README.md` (0013 superseded, 0017 추가)
- `docs/architecture/01_target_architecture.md`
- `docs/planning/16_data_dashboard_vpc_workplan.md`
- `docs/planning/17_expansion_roadmap.md`
- `docs/ops/15_aws_cost_baseline.md`
- `docs/issues/SESSION_STATE.md`
- `docs/issues/MASTER_CHECKLIST.md`
- `docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio`

## 검증

- 문서 검증: `rg -n "Aurora|aurora|Serverless v2|ACU|aws_rds_cluster" docs`
- Terraform 검증(구현 후): `terraform plan`에 `aws_db_instance` + subnet group + Secrets 생성 포함
- 런타임 검증(구현 후): ECS Fargate task가 RDS PostgreSQL에 연결 (`SELECT 1` 헬스체크 통과)
- Alembic migration 실행: `alembic upgrade head`
- Backend `/healthz`가 RDS PostgreSQL connection pool 상태 포함하여 200 반환
