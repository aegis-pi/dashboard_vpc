# Aegis 5분 그래프 Bucket 설계 문서

상태: implementation plan
기준일: 2026-05-28
대상 repo: `/home/vicbear/Aegis/git_clone/Aegis-pi`

## 목적

현재 Dashboard가 DynamoDB `HISTORY#STATE` 또는 S3 `state_snapshot`의 고빈도 snapshot을 그대로 읽어 24시간 그래프를 그리면 데이터 포인트가 많아 렌더링 시간이 길어진다.

이 문서는 현재 데이터 파이프라인을 크게 바꾸지 않고, DynamoDB `HISTORY#STATE`를 2시간 TTL의 short-lived buffer로 사용한 뒤 5분 단위 graph bucket을 생성하는 설계를 정의한다.

목표:

- `LATEST` 현재 상태 저장은 유지한다.
- `HISTORY#STATE#...`는 현재처럼 `LATEST`와 같은 snapshot 구조를 저장하되 TTL을 2시간으로 줄인다.
- 새 `GraphAggregator` Lambda를 5분마다 실행한다.
- `GraphAggregator`는 최근 닫힌 5분 window의 `HISTORY#STATE#...` item을 DynamoDB에서 Query한다.
- Lambda는 sensor/risk/AI/infra 값을 5분 bucket으로 집계한다.
- 집계 결과를 DynamoDB `GRAPH#5M#...` item으로 저장한다.
- 같은 집계 결과를 S3 `processed_agg/metrics_5m/...`에 저장한다.
- Dashboard는 최근 그래프를 DynamoDB `GRAPH#5M#...`에서 읽고, 장기/재처리는 S3 집계 결과를 사용한다.

## 현재 기준

현재 data-pipeline 구성:

```text
IoT Core
  -> AEGIS-Lambda-DataProcessor
    -> DynamoDB AEGIS-DynamoDB-FactoryStatus
       PK: pk
       SK: sk
       LATEST
       HISTORY#STATE#{updated_at}
    -> S3 aegis-bucket-data
       processed/{factory_id}/factory_state/...
       processed/{factory_id}/risk_score/...
       processed/{factory_id}/infra_state/...
       processed/{factory_id}/state_snapshot/...
```

현재 코드 위치:

| 영역 | 파일 |
| --- | --- |
| DataProcessor Lambda | `apps/data-processor/lambda_function.py` |
| DynamoDB write 로직 | `apps/data-processor/processor/dynamo.py` |
| S3 processed write 로직 | `apps/data-processor/processor/s3_writer.py` |
| data-pipeline Terraform | `infra/data-pipeline/` |
| Foundation DynamoDB table | `infra/foundation/dynamodb.tf` |

현재 DynamoDB table:

```text
table: AEGIS-DynamoDB-FactoryStatus
hash key: pk
range key: sk
billing: PAY_PER_REQUEST
TTL attribute: ttl
PITR: enabled
Streams: NEW_AND_OLD_IMAGES
```

현재 item key:

```text
pk = FACTORY#{factory_id}
sk = LATEST

pk = FACTORY#{factory_id}
sk = HISTORY#STATE#{updated_at}
```

예:

```text
pk = FACTORY#factory-b
sk = LATEST

pk = FACTORY#factory-b
sk = HISTORY#STATE#2026-05-28T10:05:03.123Z
```

현재 `HISTORY#STATE`는 `LATEST`와 같은 전체 snapshot 구조에 `ttl`만 추가한 item이다. S3 `state_snapshot`은 같은 snapshot에서 `ttl`을 제거한 object다.

중요한 전제:

```text
HISTORY#STATE item 안에 sensor, risk, AI detection score, infra cpu/memory/disk 값이 모두 있다.
```

따라서 새 aggregator는 S3 snapshot을 다시 읽지 않고 DynamoDB만 Query해도 5분 그래프 bucket을 만들 수 있다.

## 최종 아키텍처

```text
IoT Core
  -> AEGIS-Lambda-DataProcessor
    -> DynamoDB
       FACTORY#factory-b / LATEST
       FACTORY#factory-b / HISTORY#STATE#2026-05-28T10:05:03.123Z  (TTL 2h)
    -> S3 processed/state_snapshot

EventBridge Scheduler, every 5 minutes
  -> AEGIS-Lambda-GraphAggregator5m
    -> Query DynamoDB HISTORY#STATE for closed 5-minute bucket
    -> Aggregate sensor/risk/AI/infra
    -> PutItem DynamoDB GRAPH#5M#{bucket_start}
    -> PutObject S3 processed_agg/metrics_5m

Dashboard
  -> GetItem LATEST for current cards
  -> Query GRAPH#5M for recent graph
  -> Use latest HISTORY#STATE or GRAPH#5M timestamp to show collection gap
  -> Use S3 processed_agg for longer-range graph/replay if needed
```

## DynamoDB 설계

같은 table을 계속 사용한다.

```text
table = AEGIS-DynamoDB-FactoryStatus
pk    = FACTORY#{factory_id}
sk    = item type + timestamp
```

### Key 패턴

| Item | PK | SK | TTL |
| --- | --- | --- | --- |
| 최신 상태 | `FACTORY#{factory_id}` | `LATEST` | 없음 |
| 최근 snapshot buffer | `FACTORY#{factory_id}` | `HISTORY#STATE#{updated_at}` | 2시간 |
| 5분 graph bucket | `FACTORY#{factory_id}` | `GRAPH#5M#{bucket_start}` | 48시간 |

권장 TTL:

```text
LATEST: TTL 없음
HISTORY#STATE: 2시간
GRAPH#5M: 48시간
S3 processed_agg/metrics_5m: S3 lifecycle 기준 장기 보존
```

`GRAPH#5M` TTL은 48시간으로 확정한다. 24시간 그래프를 DynamoDB에서 직접 제공하되, TTL 만료 경계에서 아이템이 사라지는 edge case를 방지하기 위해 쿼리 window(24h)의 2배로 설정한다. DynamoDB TTL 삭제는 eventually consistent라 만료 직후에도 잠시 아이템이 남을 수 있으므로, 48h TTL이면 24h 조회 시 경계 아이템이 항상 안전하게 존재한다.

주의:

- DynamoDB TTL 삭제는 즉시 실행을 보장하지 않는다.
- Dashboard Query는 TTL에 의존하지 말고 반드시 `SK BETWEEN` 시간 범위로 제한한다.

### Query 패턴

현재 상태:

```text
GetItem
  pk = FACTORY#factory-b
  sk = LATEST
```

최근 닫힌 5분 window history 조회:

```text
Query
  pk = FACTORY#factory-b
  sk BETWEEN HISTORY#STATE#2026-05-28T10:05:00Z
       AND HISTORY#STATE#2026-05-28T10:09:59.999Z
```

최근 1시간 graph 조회:

```text
Query
  pk = FACTORY#factory-b
  sk BETWEEN GRAPH#5M#2026-05-28T09:10:00Z
       AND GRAPH#5M#2026-05-28T10:10:00Z
```

## 5분 bucket 시간 기준

모든 graph bucket은 UTC 기준으로 정렬한다.

5분 bucket boundary:

```text
00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
```

예:

```text
bucket_start = 2026-05-28T10:05:00Z
bucket_end   = 2026-05-28T10:09:59.999Z
sk           = GRAPH#5M#2026-05-28T10:05:00Z
```

Scheduler는 5분마다 실행한다. EventBridge 호출이 약간 늦을 수 있으므로 Lambda 내부에서 항상 닫힌 직전 bucket을 계산한다.

권장 실행:

```text
EventBridge Scheduler: rate(5 minutes)
또는 cron(1/5 * * * ? *)  # 01, 06, 11...분 실행
```

권장 bucket 계산:

```text
now = current UTC
floor = now rounded down to 5-minute boundary
target_bucket_start = floor - 5 minutes
target_bucket_end = floor - 1 millisecond
```

예:

```text
10:10:02 실행 -> 10:05:00~10:09:59.999 집계
10:11:00 실행 -> 10:05:00~10:09:59.999 집계
```

운영 안정성:

- `LOOKBACK_BUCKETS=1`이면 직전 bucket만 처리한다.
- `LOOKBACK_BUCKETS=2`이면 직전 2개 bucket을 재처리해 직전 실행 실패를 보완한다.
- 같은 `GRAPH#5M#{bucket_start}`에 overwrite 가능하게 만들어 idempotent하게 동작시킨다.

## Graph bucket 데이터 포맷

### DynamoDB item

최종 item 예시:

```json
{
  "pk": "FACTORY#factory-b",
  "sk": "GRAPH#5M#2026-05-28T10:05:00Z",
  "item_type": "GRAPH#5M",
  "factory_id": "factory-b",
  "schema_version": "graph-5m-v0.1.0",
  "bucket_minutes": 5,
  "bucket_start": "2026-05-28T10:05:00Z",
  "bucket_end": "2026-05-28T10:09:59.999Z",
  "ttl": 1779950000,
  "sensor": {
    "temperature_celsius": {
      "unit": "celsius",
      "count": 97,
      "min": 24.1,
      "min_at": "2026-05-28T10:06:12Z",
      "max": 25.0,
      "max_at": "2026-05-28T10:08:45Z",
      "mean": 24.6,
      "first": 24.4,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 24.8,
      "last_at": "2026-05-28T10:09:58Z"
    },
    "humidity_percent": {
      "unit": "percent",
      "count": 97,
      "min": 43.0,
      "min_at": "2026-05-28T10:05:10Z",
      "max": 47.0,
      "max_at": "2026-05-28T10:09:20Z",
      "mean": 45.1,
      "first": 44.0,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 46.0,
      "last_at": "2026-05-28T10:09:58Z"
    },
    "pressure_hpa": {
      "unit": "hPa",
      "count": 97,
      "min": 1007.8,
      "min_at": "2026-05-28T10:07:00Z",
      "max": 1008.9,
      "max_at": "2026-05-28T10:08:51Z",
      "mean": 1008.2,
      "first": 1008.1,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 1008.4,
      "last_at": "2026-05-28T10:09:58Z"
    }
  },
  "risk": {
    "score": {
      "unit": "score",
      "count": 97,
      "min": 91.2,
      "min_at": "2026-05-28T10:06:30Z",
      "max": 100.0,
      "max_at": "2026-05-28T10:05:01Z",
      "mean": 97.8,
      "first": 98.0,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 99.1,
      "last_at": "2026-05-28T10:09:58Z"
    }
  },
  "ai_detection": {
    "threshold": 0.7,
    "max_score": 0.87,
    "max_score_type": "fire_score",
    "max_score_at": "2026-05-28T10:08:45Z",
    "above_threshold_count": 2,
    "by_type": {
      "fire_score": {
        "count": 97,
        "min": 0.0,
        "max": 0.87,
        "max_at": "2026-05-28T10:08:45Z",
        "mean": 0.04,
        "last": 0.01,
        "last_at": "2026-05-28T10:09:58Z",
        "threshold": 0.7,
        "above_threshold_count": 2,
        "above_threshold_ratio": 0.0206,
        "first_above_threshold_at": "2026-05-28T10:08:42Z"
      },
      "fall_score": {
        "count": 97,
        "min": 0.0,
        "max": 0.21,
        "max_at": "2026-05-28T10:07:15Z",
        "mean": 0.02,
        "last": 0.01,
        "last_at": "2026-05-28T10:09:58Z",
        "threshold": 0.7,
        "above_threshold_count": 0,
        "above_threshold_ratio": 0.0,
        "first_above_threshold_at": null
      },
      "bend_score": {
        "count": 97,
        "min": 0.0,
        "max": 0.34,
        "max_at": "2026-05-28T10:06:40Z",
        "mean": 0.03,
        "last": 0.02,
        "last_at": "2026-05-28T10:09:58Z",
        "threshold": 0.7,
        "above_threshold_count": 0,
        "above_threshold_ratio": 0.0,
        "first_above_threshold_at": null
      }
    }
  },
  "infra": {
    "cpu_usage_percent": {
      "unit": "percent",
      "count": 97,
      "min": 18.2,
      "min_at": "2026-05-28T10:05:20Z",
      "max": 72.4,
      "max_at": "2026-05-28T10:08:40Z",
      "mean": 41.6,
      "first": 40.1,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 44.1,
      "last_at": "2026-05-28T10:09:58Z"
    },
    "memory_usage_percent": {
      "unit": "percent",
      "count": 97,
      "min": 51.3,
      "min_at": "2026-05-28T10:05:20Z",
      "max": 63.9,
      "max_at": "2026-05-28T10:09:40Z",
      "mean": 58.4,
      "first": 54.0,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 63.9,
      "last_at": "2026-05-28T10:09:58Z"
    },
    "disk_usage_percent": {
      "unit": "percent",
      "count": 97,
      "min": 71.1,
      "min_at": "2026-05-28T10:05:20Z",
      "max": 71.4,
      "max_at": "2026-05-28T10:09:40Z",
      "mean": 71.2,
      "first": 71.1,
      "first_at": "2026-05-28T10:05:01Z",
      "last": 71.4,
      "last_at": "2026-05-28T10:09:58Z"
    }
  },
  "quality": {
    "source_dataset": "DynamoDB HISTORY#STATE",
    "source_count": 97,
    "expected_count": 100,
    "collection_rate": 0.97,
    "missing_count": 3,
    "is_empty": false,
    "is_partial": false,
    "window_lag_seconds": 3,
    "infra_values_from_snapshot": true,
    "source_window_start_sk": "HISTORY#STATE#2026-05-28T10:05:00Z",
    "source_window_end_sk": "HISTORY#STATE#2026-05-28T10:09:59.999Z"
  },
  "created_at": "2026-05-28T10:10:03Z",
  "updated_at": "2026-05-28T10:10:03Z"
}
```

### Empty bucket item

집계 대상 5분에 source item이 없으면 empty bucket도 저장한다. 그래야 Dashboard가 수집 공백을 명시적으로 표시할 수 있다.

```json
{
  "pk": "FACTORY#factory-b",
  "sk": "GRAPH#5M#2026-05-28T10:05:00Z",
  "item_type": "GRAPH#5M",
  "factory_id": "factory-b",
  "schema_version": "graph-5m-v0.1.0",
  "bucket_minutes": 5,
  "bucket_start": "2026-05-28T10:05:00Z",
  "bucket_end": "2026-05-28T10:09:59.999Z",
  "ttl": 1779950000,
  "sensor": {},
  "risk": {},
  "ai_detection": {
    "threshold": 0.7,
    "max_score": null,
    "max_score_type": null,
    "max_score_at": null,
    "above_threshold_count": 0,
    "by_type": {}
  },
  "infra": {},
  "quality": {
    "source_dataset": "DynamoDB HISTORY#STATE",
    "source_count": 0,
    "expected_count": 100,
    "collection_rate": 0.0,
    "missing_count": 100,
    "is_empty": true,
    "is_partial": true,
    "infra_values_from_snapshot": true
  },
  "created_at": "2026-05-28T10:10:03Z",
  "updated_at": "2026-05-28T10:10:03Z"
}
```

## 값 추출 경로

현재 `HISTORY#STATE` snapshot은 `LATEST`와 같은 구조다. GraphAggregator는 아래 경로를 우선 사용한다.

| Graph group | Metric | Snapshot path | 비고 |
| --- | --- | --- | --- |
| sensor | `temperature_celsius` | `factory_state.temperature_celsius` | factory_state 수신 시 갱신 |
| sensor | `humidity_percent` | `factory_state.humidity_percent` | factory_state 수신 시 갱신 |
| sensor | `pressure_hpa` | `factory_state.pressure_hpa` | factory_state 수신 시 갱신 |
| risk | `score` | `risk.score` | factory_state 수신 시 계산 |
| AI | `fire_score` | `factory_state.fire_score` | 0~1 score |
| AI | `fall_score` | `factory_state.fall_score` | 0~1 score |
| AI | `bend_score` | `factory_state.bend_score` | 0~1 score |
| infra | `cpu_usage_percent` | `infra_state.nodes[*].cpu_usage_percent` | node별 값을 평균해 snapshot value 생성 |
| infra | `memory_usage_percent` | `infra_state.nodes[*].memory_usage_percent` | node별 값을 평균해 snapshot value 생성 |
| infra | `disk_usage_percent` | `infra_state.nodes[*].disk_usage_percent` | node별 값을 평균해 snapshot value 생성 |

Infra metric은 snapshot 안에 node별 값이 들어있다. 5분 bucket의 snapshot-level infra 값은 각 snapshot에서 ready 여부와 관계없이 값이 존재하는 node들의 평균으로 만든다.

예:

```text
snapshot_cpu_usage_percent =
  average(infra_state.nodes[*].cpu_usage_percent where value is number)
```

그 다음 5분 window 안의 snapshot-level 값들을 다시 `min/max/mean/first/last`로 집계한다.

이 방식의 의미:

- `HISTORY#STATE`가 3초 주기로 저장되면 infra 값도 3초 단위 snapshot에 반복 포함될 수 있다.
- 원천 infra 수집 주기가 20초여도 Dashboard graph는 "각 snapshot 시점에서 알려진 최신 infra 상태"를 보여준다.
- 이 사실은 `quality.infra_values_from_snapshot=true`로 명시한다.

## Metric별 집계 규칙

### 일반 numeric metric

대상:

```text
temperature_celsius
humidity_percent
pressure_hpa
risk.score
cpu_usage_percent
memory_usage_percent
disk_usage_percent
```

저장 필드:

```text
count
min
min_at
max
max_at
mean
first
first_at
last
last_at
unit
```

동률 처리:

- `min_at`은 최소값이 처음 나온 시각을 사용한다.
- `max_at`은 최대값이 처음 나온 시각을 사용한다.
- `first/last`는 source timestamp 기준 정렬 후 첫/마지막 값을 사용한다.

Risk score 해석:

- 일반 그래프에는 `mean` line을 그릴 수 있다.
- 위험 감지는 낮은 값이 중요하므로 tooltip/marker는 `min`과 `min_at`을 우선 표시한다.

Disk 해석:

- disk usage는 누적성 지표라 `last`와 `max`가 `mean`보다 중요하다.
- Dashboard 기본 line은 `last`, tooltip에는 `mean/max`를 같이 표시한다.

### AI detection metric

AI score는 0~1 값이고 순간 spike가 중요하다. 평균만 사용하면 smoothing으로 이벤트를 놓칠 수 있다.

대상:

```text
fire_score
fall_score
bend_score
```

MVP threshold:

```text
fire_score: 0.7
fall_score: 0.7
bend_score: 0.7
```

후속에서는 `configs/runtime/runtime-config.yaml`로 threshold를 이동한다.

AI 저장 필드:

```text
bucket 전체:
  max_score
  max_score_type
  max_score_at
  above_threshold_count
  threshold

by_type:
  count
  min
  max
  max_at
  mean
  last
  last_at
  threshold
  above_threshold_count
  above_threshold_ratio
  first_above_threshold_at
```

Dashboard 표시:

```text
AI Detection Max Score graph:
  line = ai_detection.max_score
  y-axis = 0.0~1.0
  threshold line = 0.7
  marker = max_score >= threshold
  tooltip = max_score_type, max_score_at, above_threshold_count, by_type max
```

세부 화면에서는 type별 line을 선택적으로 표시한다.

## S3 적재 경로

GraphAggregator는 DynamoDB graph item과 같은 내용을 S3에도 JSON으로 저장한다. S3는 TTL이 없으므로 장기 그래프, 재처리, 검증 기준으로 사용한다.

권장 prefix:

```text
s3://aegis-bucket-data/processed_agg/{factory_id}/metrics_5m/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/mm={mm}.json
```

예:

```text
s3://aegis-bucket-data/processed_agg/factory-b/metrics_5m/yyyy=2026/mm=05/dd=28/hh=10/mm=05.json
```

Object body:

```json
{
  "factory_id": "factory-b",
  "bucket_start": "2026-05-28T10:05:00Z",
  "bucket_end": "2026-05-28T10:09:59.999Z",
  "bucket_minutes": 5,
  "dynamodb_pk": "FACTORY#factory-b",
  "dynamodb_sk": "GRAPH#5M#2026-05-28T10:05:00Z",
  "schema_version": "graph-5m-v0.1.0",
  "sensor": {},
  "risk": {},
  "ai_detection": {},
  "infra": {},
  "quality": {},
  "created_at": "2026-05-28T10:10:03Z"
}
```

S3 object에는 DynamoDB `ttl`을 저장하지 않는다.

## Lambda 설계

새 앱 경로:

```text
apps/graph-metrics-aggregator/
  lambda_function.py
  graph_aggregator/
    __init__.py
    bucket.py
    dynamo.py
    metrics.py
    s3_writer.py
    handler.py
  tests/
    test_bucket.py
    test_metrics.py
    test_handler.py
```

### Environment variables

| Env | 기본값 | 설명 |
| --- | --- | --- |
| `DYNAMODB_TABLE_NAME` | `AEGIS-DynamoDB-FactoryStatus` | 기존 factory status table |
| `S3_BUCKET_NAME` | `aegis-bucket-data` | 기존 data bucket |
| `FACTORY_IDS` | `factory-a,factory-b,factory-c` | 집계 대상 factory |
| `BUCKET_MINUTES` | `5` | graph bucket 크기 |
| `LOOKBACK_BUCKETS` | `1` | 실행마다 처리할 닫힌 bucket 수 |
| `GRAPH_TTL_HOURS` | `48` | `GRAPH#5M` DynamoDB TTL |
| `EXPECTED_SAMPLE_INTERVAL_SECONDS` | `3` | expected count 계산 기준 |
| `AI_SCORE_THRESHOLD` | `0.7` | MVP 공통 AI threshold |
| `S3_OUTPUT_PREFIX` | `processed_agg` | S3 집계 output root |

### Handler input

스케줄러 기본 실행 input:

```json
{}
```

수동 재처리 input:

```json
{
  "factories": ["factory-b"],
  "bucket_start": "2026-05-28T10:05:00Z",
  "bucket_minutes": 5,
  "write_dynamodb": true,
  "write_s3": true
}
```

수동 실행에서 `bucket_start`가 있으면 해당 bucket만 처리한다.

### Handler output

```json
{
  "status": "ok",
  "bucket_minutes": 5,
  "processed": [
    {
      "factory_id": "factory-b",
      "bucket_start": "2026-05-28T10:05:00Z",
      "source_count": 97,
      "dynamodb_sk": "GRAPH#5M#2026-05-28T10:05:00Z",
      "s3_key": "processed_agg/factory-b/metrics_5m/yyyy=2026/mm=05/dd=28/hh=10/mm=05.json"
    }
  ]
}
```

## Lambda 처리 알고리즘

Pseudo-code:

```python
def handler(event, context):
    now = utc_now()
    factories = event.get("factories") or env_factory_ids()
    bucket_minutes = event.get("bucket_minutes") or env_bucket_minutes()

    if event.get("bucket_start"):
        buckets = [parse_bucket(event["bucket_start"])]
    else:
        buckets = closed_buckets(now, bucket_minutes, lookback_buckets)

    results = []
    for factory_id in factories:
        for bucket_start in buckets:
            bucket_end = bucket_start + 5 minutes - 1 millisecond
            items = query_history(factory_id, bucket_start, bucket_end)
            graph_item = aggregate(factory_id, bucket_start, bucket_end, items)
            put_graph_item(graph_item)
            put_s3_graph_object(graph_item_without_ttl)
            results.append(summary)

    return {"status": "ok", "processed": results}
```

Query:

```python
pk = f"FACTORY#{factory_id}"
start_sk = f"HISTORY#STATE#{bucket_start_iso}"
end_sk = f"HISTORY#STATE#{bucket_end_iso}"

table.query(
    KeyConditionExpression=Key("pk").eq(pk) & Key("sk").between(start_sk, end_sk)
)
```

Pagination:

- DynamoDB Query는 1MB 단위 pagination이 있으므로 `LastEvaluatedKey` loop를 구현한다.
- 최근 5분 약 100개 snapshot이면 일반적으로 1 page로 충분하지만, 구현은 pagination 안전하게 한다.

Idempotency:

- `GRAPH#5M#{bucket_start}` item은 같은 bucket 재처리 시 overwrite한다.
- `created_at`은 최초 생성 시각보다 구현이 복잡해지므로 MVP에서는 재처리 시 갱신해도 된다.
- 필요하면 `updated_at`만 갱신하고 `created_at`은 기존 item에서 유지하는 방식으로 후속 개선한다.

## Terraform 설계

현재 data-pipeline root가 foundation S3/DynamoDB를 data source로 조회하고 Lambda/IAM/IoT Rule을 관리한다. GraphAggregator도 data-pipeline의 일부로 두는 것을 추천한다.

수정 위치:

```text
infra/data-pipeline/
  lambda.tf 또는 graph_aggregator_lambda.tf 추가
  variables.tf 확장
  outputs.tf 확장
```

권장 신규 파일:

```text
infra/data-pipeline/graph_aggregator_lambda.tf
```

### Archive

```hcl
data "archive_file" "graph_aggregator_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/graph-metrics-aggregator"
  output_path = "${path.module}/lambda_graph_metrics_aggregator.zip"
  excludes    = ["**/__pycache__/**", "**/*.pyc", "**/*.pyo", "tests/**", ".pytest_cache/**"]
}
```

### Log group

```hcl
resource "aws_cloudwatch_log_group" "graph_aggregator" {
  name              = "/aws/lambda/${var.lambda_graph_aggregator_name}"
  retention_in_days = 30
  tags              = local.tags
}
```

### IAM role

새 Lambda role을 분리하는 것을 추천한다.

```hcl
resource "aws_iam_role" "graph_aggregator" {
  name               = "${local.naming_prefix}-IAMRole-Lambda-GraphAggregator5m"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.tags
}
```

필요 권한:

```text
logs:CreateLogStream
logs:PutLogEvents
dynamodb:Query
dynamodb:PutItem
s3:PutObject
```

IAM policy 범위:

```hcl
statement {
  sid    = "DynamoDBGraphReadWrite"
  effect = "Allow"

  actions = [
    "dynamodb:Query",
    "dynamodb:PutItem"
  ]

  resources = [data.aws_dynamodb_table.factory_status.arn]
}

statement {
  sid    = "S3GraphAggregateWrite"
  effect = "Allow"

  actions = ["s3:PutObject"]

  resources = ["${data.aws_s3_bucket.data.arn}/processed_agg/*"]
}
```

### Lambda function

```hcl
resource "aws_lambda_function" "graph_aggregator" {
  function_name    = var.lambda_graph_aggregator_name
  role             = aws_iam_role.graph_aggregator.arn
  runtime          = "python3.12"
  handler          = "lambda_function.handler"
  filename         = data.archive_file.graph_aggregator_zip.output_path
  source_code_hash = data.archive_file.graph_aggregator_zip.output_base64sha256
  timeout          = var.lambda_graph_aggregator_timeout
  memory_size      = var.lambda_graph_aggregator_memory

  environment {
    variables = {
      DYNAMODB_TABLE_NAME              = data.aws_dynamodb_table.factory_status.name
      S3_BUCKET_NAME                   = data.aws_s3_bucket.data.bucket
      FACTORY_IDS                      = join(",", var.graph_aggregator_factory_ids)
      BUCKET_MINUTES                   = tostring(var.graph_bucket_minutes)
      LOOKBACK_BUCKETS                 = tostring(var.graph_aggregator_lookback_buckets)
      GRAPH_TTL_HOURS                  = tostring(var.graph_bucket_ttl_hours)
      EXPECTED_SAMPLE_INTERVAL_SECONDS = tostring(var.graph_expected_sample_interval_seconds)
      AI_SCORE_THRESHOLD               = tostring(var.graph_ai_score_threshold)
      S3_OUTPUT_PREFIX                 = "processed_agg"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.graph_aggregator,
    aws_iam_role_policy.graph_aggregator,
  ]

  tags = local.tags
}
```

### Scheduler

EventBridge Scheduler를 사용한다.

```hcl
resource "aws_iam_role" "graph_aggregator_scheduler" {
  name               = "${local.naming_prefix}-IAMRole-Scheduler-GraphAggregator5m"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
  tags               = local.tags
}
```

If existing `scheduler_assume_role` data source is not present in `infra/data-pipeline`, add:

```hcl
data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}
```

Scheduler policy:

```hcl
statement {
  sid    = "InvokeGraphAggregator"
  effect = "Allow"

  actions = ["lambda:InvokeFunction"]

  resources = [aws_lambda_function.graph_aggregator.arn]
}
```

Schedule:

```hcl
resource "aws_scheduler_schedule" "graph_aggregator_5m" {
  name                         = "${local.naming_prefix}-Schedule-GraphAggregator5m"
  description                  = "Aggregate factory graph metrics every 5 minutes."
  schedule_expression          = "rate(5 minutes)"
  schedule_expression_timezone = "UTC"
  state                        = var.graph_aggregator_enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.graph_aggregator.arn
    role_arn = aws_iam_role.graph_aggregator_scheduler.arn
    input = jsonencode({
      bucket_minutes = var.graph_bucket_minutes
    })
  }
}
```

Lambda permission:

```hcl
resource "aws_lambda_permission" "graph_aggregator_scheduler" {
  statement_id  = "AllowSchedulerInvokeGraphAggregator5m"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graph_aggregator.function_name
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.graph_aggregator_5m.arn
}
```

### Variables

Add to `infra/data-pipeline/variables.tf`:

```hcl
variable "dynamodb_history_ttl_hours" {
  description = "TTL in hours for DynamoDB HISTORY items."
  type        = number
  default     = 2
}

variable "lambda_graph_aggregator_name" {
  description = "Lambda function name for 5-minute graph metric aggregation."
  type        = string
  default     = "AEGIS-Lambda-GraphAggregator5m"
}

variable "lambda_graph_aggregator_timeout" {
  description = "Graph aggregator Lambda timeout in seconds."
  type        = number
  default     = 60
}

variable "lambda_graph_aggregator_memory" {
  description = "Graph aggregator Lambda memory in MB."
  type        = number
  default     = 512
}

variable "graph_aggregator_enabled" {
  description = "Whether the 5-minute graph aggregator schedule is enabled."
  type        = bool
  default     = true
}

variable "graph_aggregator_factory_ids" {
  description = "Factories processed by the 5-minute graph aggregator."
  type        = list(string)
  default     = ["factory-a", "factory-b", "factory-c"]
}

variable "graph_bucket_minutes" {
  description = "Graph aggregation bucket size in minutes."
  type        = number
  default     = 5
}

variable "graph_aggregator_lookback_buckets" {
  description = "Number of closed buckets to aggregate on each scheduled run."
  type        = number
  default     = 1
}

variable "graph_bucket_ttl_hours" {
  description = "TTL in hours for GRAPH#5M DynamoDB items."
  type        = number
  default     = 48
}

variable "graph_expected_sample_interval_seconds" {
  description = "Expected state snapshot interval used for graph bucket quality."
  type        = number
  default     = 3
}

variable "graph_ai_score_threshold" {
  description = "Default threshold for AI detection score graph markers."
  type        = number
  default     = 0.7
}
```

Note: existing `dynamodb_history_ttl_hours` currently defaults to 48. Change default and `terraform.tfvars.example` to 2 only when the team accepts the TTL behavior.

### Outputs

Add to `infra/data-pipeline/outputs.tf`:

```hcl
output "graph_aggregator_lambda_name" {
  description = "Graph aggregator Lambda name."
  value       = aws_lambda_function.graph_aggregator.function_name
}

output "graph_aggregator_schedule_name" {
  description = "Graph aggregator schedule name."
  value       = aws_scheduler_schedule.graph_aggregator_5m.name
}
```

## Dashboard 조회 설계

### 현재 상태 cards

```text
GetItem FACTORY#{factory_id} / LATEST
```

### window=1h — HISTORY#STATE raw 조회

3초(factory_state), 20초(infra_state) 주기로 적재된 전체 원본 데이터를 그대로 보여준다.
TTL 2h 기준 최대 ~2,760개 item/공장.

```text
Query FACTORY#{factory_id}
SK BETWEEN HISTORY#STATE#{now-1h} AND HISTORY#STATE#~
ScanIndexForward=True
```

Backend `_extract()` 반환 필드:

| Graph | 필드 | 비고 |
| --- | --- | --- |
| Risk Score | `risk_score` | 낮을수록 위험, min 값이 경고 기준 |
| Temperature | `temperature_celsius_avg` | |
| Humidity | `humidity_percent_avg` | |
| Pressure | `pressure_hpa_avg` | |
| AI fire | `fire_score` | 0~1 |
| AI fall | `fall_score` | 0~1 |
| AI bend | `bend_score` | 0~1 |
| Infra | `node_summary`, `nodes` | 노드별 cpu/memory/disk |

### window=6h/12h/24h — GRAPH#5M 집계 조회

5분 단위 avg/min 집계 버킷. 최대 72/144/288개 item/공장.

```text
Query FACTORY#{factory_id}
SK BETWEEN GRAPH#5M#{now-Nh floored} AND GRAPH#5M#{latest_closed_bucket}
ScanIndexForward=True
```

Line chart recommendations:

| Graph | 기본 line | 경고 마커 조건 |
| --- | --- | --- |
| Temperature | `sensor.temperature_celsius.mean` | max marker |
| Humidity | `sensor.humidity_percent.mean` | — |
| Pressure | `sensor.pressure_hpa.mean` | — |
| Risk Score | `risk.score.mean` | `risk.score.min <= 84` (주의), `<= 49` (위험) |
| AI Detection | `ai_detection.max_score` | `>= 0.7` threshold line + event marker |
| CPU | `infra.cpu_usage_percent.mean` | max marker |
| Memory | `infra.memory_usage_percent.mean` | max marker |
| Disk | `infra.disk_usage_percent.last` | max marker |

공백 표시:

- 마지막 `GRAPH#5M` bucket의 `bucket_end`와 현재 시각 차이를 계산한다.
- 차이가 10분 이상이면 Dashboard에 "graph data delayed"를 표시한다.
- `quality.is_empty=true` bucket은 선을 연결하지 않고 gap으로 표시한다.

Tooltip (GRAPH#5M):

```text
10:05~10:10
temperature mean 24.6, min 24.1 at 10:06:12, max 25.0 at 10:08:45
risk mean 97.8, min 91.2 at 10:06:30
AI max fire_score 0.87 at 10:08:45, threshold hits 2
CPU mean 41.6, max 72.4 at 10:08:40
source_count 97/100, collection_rate 97%
```

## 비용/성능 영향

이 설계는 S3 snapshot을 매번 다시 읽지 않는다. 5분마다 DynamoDB Query로 최근 `HISTORY#STATE`만 읽는다.

대략적인 item 수:

```text
factory_state/state_snapshot 주기: 약 3초
5분 source_count: 약 100 item/factory
factory 3개: 약 300 source item / 5분 run
하루 run 수: 288
하루 source read: 약 86,400 item
하루 graph write: 864 item (3 factories * 288)
```

`GRAPH#5M` item은 factory당 하루 288개다. 최근 24시간 그래프를 DynamoDB에서 조회하면 factory당 최대 288개 item을 읽는다. 1시간 그래프는 최대 12개다.

비용을 키우는 방식:

- GraphAggregator가 매번 최근 24시간 `HISTORY#STATE`를 다시 Query하는 방식
- S3 `state_snapshot` 작은 object를 매번 다량 `GetObject`하는 방식
- Dashboard가 `HISTORY#STATE` 전체를 직접 읽는 방식

피해야 할 것:

```text
매 5분마다 24시간치 raw/history 전체 재집계
Dashboard에서 raw snapshot으로 그래프 렌더링
S3 processed/state_snapshot 수천 object 직접 GET
```

## 구현 순서

### 1. DataProcessor TTL 변경

현재:

```text
infra/data-pipeline/variables.tf
dynamodb_history_ttl_hours default = 48
```

변경:

```text
dynamodb_history_ttl_hours default = 2
infra/data-pipeline/terraform.tfvars.example = 2
```

또는 운영 환경별 override:

```hcl
dynamodb_history_ttl_hours = 2
```

검증:

```bash
python -m pytest -q apps/data-processor
terraform -chdir=infra/data-pipeline fmt -check -diff
terraform -chdir=infra/data-pipeline validate
```

### 2. GraphAggregator 앱 추가

Add:

```text
apps/graph-metrics-aggregator/
```

필수 테스트:

| Test | 내용 |
| --- | --- |
| bucket boundary | 10:10:02 실행 시 10:05 bucket 계산 |
| query key | `FACTORY#factory-b`, `HISTORY#STATE#...` range 생성 |
| numeric metrics | min/max/mean/first/last/count 계산 |
| min/max time | `min_at`, `max_at` 첫 발생 시각 보존 |
| AI metrics | max_score, max_score_type, threshold count 계산 |
| infra node average | node별 cpu/memory/disk 평균 후 bucket 집계 |
| empty bucket | source_count 0이면 empty graph item 생성 |
| DynamoDB Decimal | boto3 resource float reject 방지 |
| S3 body | ttl 제거 후 `processed_agg/...` key 생성 |

### 3. Terraform 추가

Add:

```text
infra/data-pipeline/graph_aggregator_lambda.tf
```

Update:

```text
infra/data-pipeline/variables.tf
infra/data-pipeline/outputs.tf
infra/data-pipeline/terraform.tfvars.example
```

검증:

```bash
python -m compileall -q apps/graph-metrics-aggregator
python -m pytest -q apps/graph-metrics-aggregator
terraform -chdir=infra/data-pipeline fmt -check -diff
terraform -chdir=infra/data-pipeline init
terraform -chdir=infra/data-pipeline validate
terraform -chdir=infra/data-pipeline plan
```

### 4. 배포

기존 data-pipeline build 스크립트를 사용한다.

```bash
scripts/build/build-data-pipe.sh <MFA_OTP>
```

배포 후 확인:

```bash
terraform -chdir=infra/data-pipeline output

aws lambda get-function \
  --region ap-south-1 \
  --function-name AEGIS-Lambda-GraphAggregator5m

aws scheduler get-schedule \
  --region ap-south-1 \
  --name AEGIS-Schedule-GraphAggregator5m
```

### 5. 수동 실행 검증

최근 데이터가 있는 factory 하나로 실행한다.

```bash
aws lambda invoke \
  --region ap-south-1 \
  --function-name AEGIS-Lambda-GraphAggregator5m \
  --payload '{"factories":["factory-b"],"bucket_start":"2026-05-28T10:05:00Z","bucket_minutes":5}' \
  /tmp/graph-aggregator-output.json
```

DynamoDB 확인:

```bash
aws dynamodb query \
  --region ap-south-1 \
  --table-name AEGIS-DynamoDB-FactoryStatus \
  --key-condition-expression "pk = :pk AND sk BETWEEN :from AND :to" \
  --expression-attribute-values '{
    ":pk": {"S": "FACTORY#factory-b"},
    ":from": {"S": "GRAPH#5M#2026-05-28T10:05:00Z"},
    ":to": {"S": "GRAPH#5M#2026-05-28T10:05:00Z"}
  }'
```

S3 확인:

```bash
aws s3 ls \
  s3://aegis-bucket-data/processed_agg/factory-b/metrics_5m/yyyy=2026/mm=05/dd=28/hh=10/mm=05.json \
  --region ap-south-1
```

### 6. Scheduler 실행 검증

10~15분 기다린 뒤:

```bash
aws dynamodb query \
  --region ap-south-1 \
  --table-name AEGIS-DynamoDB-FactoryStatus \
  --key-condition-expression "pk = :pk AND sk BETWEEN :from AND :to" \
  --expression-attribute-values '{
    ":pk": {"S": "FACTORY#factory-b"},
    ":from": {"S": "GRAPH#5M#"},
    ":to": {"S": "GRAPH#5M#9999"}
  }' \
  --scan-index-forward false \
  --limit 5
```

CloudWatch Logs:

```bash
aws logs filter-log-events \
  --region ap-south-1 \
  --log-group-name /aws/lambda/AEGIS-Lambda-GraphAggregator5m \
  --max-items 20
```

## Rollback

비용/오동작 시 우선 Scheduler만 끈다.

```bash
aws scheduler update-schedule \
  --region ap-south-1 \
  --name AEGIS-Schedule-GraphAggregator5m \
  --state DISABLED
```

Terraform variable로도 비활성화한다.

```hcl
graph_aggregator_enabled = false
```

완전 제거는 `infra/data-pipeline` destroy 또는 해당 리소스 제거 apply로 한다. DynamoDB/S3 데이터는 foundation 소유라 data-pipeline destroy로 삭제되지 않는다.

## Open Decisions

1. `GRAPH#5M` TTL — **확정: 48시간**
   - 24시간 그래프를 DynamoDB에서 직접 제공. TTL 경계 edge case 방지를 위해 쿼리 window(24h)의 2배로 설정.

2. Scheduler timing
   - `rate(5 minutes)` + Lambda 내부 closed bucket 계산으로 충분.
   - late-arriving item이 많으면 `cron(1/5 * * * ? *)` 또는 `PROCESSING_DELAY_SECONDS=60` 추가.

3. AI threshold source
   - MVP는 env `AI_SCORE_THRESHOLD=0.7`.
   - 후속은 `configs/runtime/runtime-config.yaml`과 factory override 연결.

4. Infra metric aggregation
   - MVP는 snapshot별 node 평균을 만든 뒤 5분 bucket 집계.
   - 후속은 node별 graph가 필요하면 `infra.nodes_by_id.{node_id}.cpu_usage_percent` 구조 추가.

5. S3 lifecycle
   - `processed_agg/`는 `processed/`와 같은 lifecycle로 둘지 별도 lifecycle을 둘지 결정 필요.

## 완료 기준

구현 완료 판정:

- `HISTORY#STATE` TTL이 2시간으로 설정된다.
- `AEGIS-Lambda-GraphAggregator5m`가 배포된다.
- EventBridge Scheduler가 5분마다 Lambda를 실행한다.
- DynamoDB에 `GRAPH#5M#...` item이 factory별로 생성된다.
- S3에 `processed_agg/{factory_id}/metrics_5m/...` object가 생성된다.
- Dashboard가 최근 24시간 그래프를 `GRAPH#5M#...` item만으로 그릴 수 있다.
- AI graph는 `max_score`와 threshold marker를 사용한다.
- CPU/memory/disk graph는 `infra.*` aggregate를 사용한다.
- source item이 없는 bucket은 empty bucket으로 저장되어 graph gap을 표현할 수 있다.
- DataProcessor 기존 `LATEST`, S3 `processed/state_snapshot`, reporting pipeline 계약은 깨지지 않는다.
