# DynamoDB Key Model

상태: 운영 확인 기준
기준일: 2026-05-29

## 목적

이 문서는 Aegis 데이터 파이프라인이 사용하는 DynamoDB 테이블의 현재 PK/SK 스키마와 실제 아이템 키 패턴을 정리한다.

대상 테이블:

```text
AEGIS-DynamoDB-FactoryStatus
region: ap-south-1
```

## 테이블 키 스키마

실제 AWS `describe-table` 조회 결과와 Terraform 정의가 일치한다.

| 구분 | Attribute | Type | DynamoDB KeyType |
| --- | --- | --- | --- |
| PK | `pk` | `S` | `HASH` |
| SK | `sk` | `S` | `RANGE` |

운영 설정:

| 항목 | 값 |
| --- | --- |
| Billing mode | `PAY_PER_REQUEST` |
| TTL attribute | `ttl` |
| PITR | enabled |
| Stream | `NEW_AND_OLD_IMAGES` |

Terraform source:

- `infra/foundation/dynamodb.tf`
- `infra/foundation/variables.tf`

## 현재 PK 패턴

현재 factory별 파티션을 사용한다.

```text
pk = FACTORY#{factory_id}
```

확인된 PK:

| PK | 의미 |
| --- | --- |
| `FACTORY#factory-a` | Factory A 상태/이력/그래프 |
| `FACTORY#factory-b` | Factory B 상태/이력/그래프 |
| `FACTORY#factory-c` | Factory C 상태/이력/그래프 |

## 현재 SK 패턴

| SK 패턴 | 생성 주체 | TTL | 용도 |
| --- | --- | --- | --- |
| `LATEST` | Lambda data processor | 없음 | factory별 최신 전체 상태 1건 |
| `HISTORY#STATE#{updated_at}` | Lambda data processor | 있음 | LATEST snapshot 이력 |
| `GRAPH#5M#{bucket_start}` | Graph metrics aggregator | 있음 | 5분 단위 그래프/지표 집계 |

### LATEST

```text
pk = FACTORY#{factory_id}
sk = LATEST
```

`factory_state` 또는 `infra_state` 수신 시 같은 아이템을 부분 갱신한다.

주요 필드:

- `factory_state`
- `infra_state`
- `risk`
- `pipeline_status`
- `last_factory_state_at`
- `last_infra_state_at`
- `updated_at`

### HISTORY#STATE

```text
pk = FACTORY#{factory_id}
sk = HISTORY#STATE#{updated_at}
```

`LATEST` 아이템을 복사해 snapshot으로 저장하고 `ttl`을 추가한다. Dashboard의 단기 이력 조회와 graph aggregator 입력으로 사용한다.

### GRAPH#5M

```text
pk = FACTORY#{factory_id}
sk = GRAPH#5M#{bucket_start}
```

`HISTORY#STATE` window를 읽어 5분 단위로 집계한 결과다. Dashboard 그래프 조회와 S3 `processed_agg/` 보조 산출물의 DynamoDB 기준 키로 사용한다.

## 실제 조회 샘플

2026-05-29 조회 기준 실제 AWS 테이블에서 확인한 샘플이다. 시간 값은 테이블에 저장된 UTC 문자열이다.

| PK | LATEST | 최신 HISTORY#STATE 샘플 | 최신 GRAPH#5M 샘플 |
| --- | --- | --- | --- |
| `FACTORY#factory-a` | `updated_at=2026-05-28T07:54:49.765Z` | `HISTORY#STATE#2026-05-28T07:54:49.779Z` | `GRAPH#5M#2026-05-29T00:10:00Z` |
| `FACTORY#factory-b` | `updated_at=2026-05-29T00:19:33.071Z` | `HISTORY#STATE#2026-05-29T00:20:26.737Z` | `GRAPH#5M#2026-05-29T00:10:00Z` |
| `FACTORY#factory-c` | `updated_at=2026-05-29T00:19:32.874Z` | `HISTORY#STATE#2026-05-29T00:20:27.223Z` | `GRAPH#5M#2026-05-29T00:10:00Z` |

공장별 Query count 샘플:

| PK | Count |
| --- | ---: |
| `FACTORY#factory-a` | 34517 |
| `FACTORY#factory-b` | 78745 |
| `FACTORY#factory-c` | 78724 |

## 조회 패턴

현재 상태 조회:

```text
GetItem
pk = FACTORY#{factory_id}
sk = LATEST
```

상태 이력 조회:

```text
Query
pk = FACTORY#{factory_id}
sk begins_with HISTORY#STATE#
```

5분 그래프 조회:

```text
Query
pk = FACTORY#{factory_id}
sk begins_with GRAPH#5M#
```

특정 시간 범위 조회는 SK가 ISO-8601 UTC 문자열을 포함하므로 `between` 조건을 사용한다.

## 관련 코드

| 파일 | 역할 |
| --- | --- |
| `infra/foundation/dynamodb.tf` | DynamoDB 테이블 생성 |
| `infra/data-pipeline/dynamodb.tf` | foundation 테이블 data source 참조 |
| `apps/data-processor/processor/dynamo.py` | `LATEST`, `HISTORY#STATE` 읽기/쓰기 |
| `apps/graph-metrics-aggregator/aggregator/dynamo.py` | `HISTORY#STATE` query, graph item put |
| `apps/graph-metrics-aggregator/aggregator/metrics.py` | `GRAPH#5M` item 생성 |
| `docs/ops/23_data_pipeline.md` | 전체 데이터 파이프라인 운영 기준 |

## 주의 사항

- 테이블에는 GSI가 없다. 현재 조회는 `pk`와 `sk` range 조건에 의존한다.
- `LATEST`는 TTL이 없어 계속 유지된다.
- `HISTORY#STATE`와 `GRAPH#5M`은 TTL 대상이다.
- Dashboard/API가 전체 공장 목록을 직접 조회해야 한다면 현재 구조에서는 factory id 목록을 별도 설정으로 갖거나, 제한적인 scan 또는 별도 registry item을 추가해야 한다.
