# 0009. S3 저장소: `aegis-bucket-data` 단일 bucket + prefix 분리

상태: accepted
결정일: 2026-05-15
관련 범위: M4 데이터 플레인, 1번 Data/Dashboard VPC, 워크스트림 A↔B 합류 지점

## 기존 계획

`docs/planning/16_data_dashboard_vpc_workplan.md`는 S3 raw bucket(`aegis-bucket-data`)과 동일 bucket에 `processed/` prefix를 둘지, 별 bucket(예: `aegis-bucket-data-processed`)을 만들지 결정 단계에서 명시하기로 placeholder만 두었다.

`docs/specs/data_storage_pipeline.md`는 raw/processed 경로를 정의하지만 bucket 분리 여부는 명시하지 않는다.

`docs/ops/15_aws_cost_baseline.md`에는 `aegis-bucket-data` 단일 bucket이 등록되어 있다.

## 변경된 실제 기준

본 ADR은 **데이터 저장(raw/processed)** 영역만 다룬다. 정적 SPA 호스팅용 bucket은 별도로 만든다 (`docs/changes/0006-frontend-static-spa-with-vite.md` 참조).

데이터 영역 S3 저장소는 **`aegis-bucket-data` 단일 bucket**을 사용하고 **prefix로 raw/processed를 분리**한다.

```text
aegis-bucket-data/
  raw/{factory_id}/{source_type}/yyyy=YYYY/mm=MM/dd=DD/{message_id}.json
  processed/risk-score/{factory_id}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
  processed/factory-state/{factory_id}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
  processed/infra-state/{factory_id}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
```

쓰기 책임:

| Prefix | 쓰기 주체 | 워크스트림 |
| --- | --- | --- |
| `raw/` | IoT Rule (`AEGIS_IoTRule_factory_a_raw_s3` 외) | A |
| `processed/` | Lambda data processor | B |

읽기 책임:

| Prefix | 읽기 주체 | 권한 |
| --- | --- | --- |
| `raw/` | Lambda data processor (재처리), 분석 작업 | read-only |
| `processed/` | Dashboard API Lambda (장기 이력 조회) | read-only |

## 변경 이유

### 단일 bucket 선택

- 운영 단순: lifecycle 정책, 모니터링, 태깅 한 곳에서 관리
- 비용: bucket 수 자체는 무료지만 lifecycle/Inventory/replication 설정이 분산되면 운영 부담 증가
- 워크스트림 A↔B 사이 코드/IaC 합류 지점이 prefix 단위로 좁혀짐 (bucket 자체는 워크스트림 A의 `infra/foundation`에서 생성됨을 그대로 유지)
- 이미 `aegis-bucket-data` 단일 bucket 패턴이 운영 문서/비용 baseline에 정착되어 있음

### prefix 단위 권한 분리로 보안 충분

- IAM Policy의 `Resource`에 `arn:aws:s3:::aegis-bucket-data/processed/*` 형태로 prefix-scoped 부여 가능 → bucket을 분리하지 않아도 권한 격리 유지
- Dashboard API Lambda는 `processed/*`만 read 가능 → raw 데이터 노출 위험 차단
- IoT Rule의 쓰기 권한은 `raw/*`로만 제한

### 별 bucket을 쓰지 않는 이유

- KMS 키 분리 요구가 아직 없음 (Compliance/PII 분리 요구가 명시되지 않은 단계)
- 별 bucket을 쓰면 IaC root와 권한 정책이 두 배가 됨
- 후속에 정말 분리가 필요해지면 cross-account replication 또는 별 bucket으로 마이그레이션 가능

## 영향

### IAM 정책

- IoT Rule role: `s3:PutObject` on `arn:aws:s3:::aegis-bucket-data/raw/*` (현재 상태 유지)
- Lambda data processor role: `s3:PutObject` on `arn:aws:s3:::aegis-bucket-data/processed/*`
- Dashboard API Lambda role: `s3:GetObject`, `s3:ListBucket` on `arn:aws:s3:::aegis-bucket-data/processed/*` (read-only)

### Lifecycle 정책 (후속 결정)

prefix별 lifecycle은 별 ADR로 결정한다. 현재 적용 후보:

```text
raw/        Standard → 30일 → IA → 90일 → Glacier (장기 보존)
processed/  Standard → 60일 → IA → 180일 → Glacier (재처리/리포트 기반)
```

본 ADR은 lifecycle 정책 자체는 결정하지 않는다 (후속).

### IaC 책임

- bucket 자체와 `raw/` prefix용 IoT Rule = 워크스트림 A `infra/foundation`이 계속 관리
- `processed/` prefix는 별 IaC 리소스가 아님(prefix는 객체 키의 일부) → Lambda IAM policy에서만 prefix 참조
- 워크스트림 B `infra/data-dashboard/`는 bucket을 새로 만들지 않고 기존 bucket의 ARN을 data source로 참조

### 합류 규칙

- bucket 정책(`aws_s3_bucket_policy`)은 워크스트림 A가 관리. 워크스트림 B가 read 권한이 필요한 IAM은 본인 IAM role에서 처리
- bucket 자체의 KMS 키, versioning, public access block 같은 bucket-level 속성 변경은 워크스트림 A 영역

## 업데이트 필요한 문서

- `docs/planning/16_data_dashboard_vpc_workplan.md` (S3 결정 placeholder를 확정으로 갱신)
- `docs/specs/data_storage_pipeline.md` (bucket 명시: 단일 `aegis-bucket-data`)
- `docs/ops/15_aws_cost_baseline.md` (S3 storage 항목에 raw/processed 두 prefix 운영 명시)

## 검증

- `aegis-bucket-data` rebuild 시 IoT Rule이 `raw/...` prefix에 객체 생성하는지 확인
- Lambda data processor가 `processed/...` prefix에 객체 생성하는지 확인
- Dashboard API Lambda IAM role의 S3 권한이 `processed/*`로만 제한되어 있는지 정책 검증
- `s3:ListBucket` 시 `Condition.StringLike.s3:prefix`로 prefix 노출이 제한되는지 확인
