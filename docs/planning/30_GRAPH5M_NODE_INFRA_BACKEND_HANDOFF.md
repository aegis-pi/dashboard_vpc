# GRAPH#5M Node Infra Backend Handoff

기준일: 2026-06-01
대상 테이블: `AEGIS-DynamoDB-FactoryStatus`
리전: `ap-south-1`

## 목적

Dashboard Backend가 공장별 노드 CPU/Memory/Disk 시계열을 그릴 때는 `HISTORY#STATE`를 직접 1시간치 읽지 않고, 5분 집계 read model인 `GRAPH#5M`을 읽는다.

`GRAPH#5M`은 기존에 전체 node 평균만 제공했지만, 2026-06-01 배포 이후 `infra.nodes[]`에 node별 5분 집계도 함께 저장한다.

## 조회 API 권장안

Frontend -> Backend:

```text
GET /factories/{factory_id}/infra-history?window=1h
```

Backend -> DynamoDB:

```text
Query
  TableName = AEGIS-DynamoDB-FactoryStatus
  KeyConditionExpression =
    pk = FACTORY#{factory_id}
    AND sk BETWEEN GRAPH#5M#{from_bucket} AND GRAPH#5M#{to_bucket}
  ScanIndexForward = true
```

예시:

```bash
aws dynamodb query \
  --region ap-south-1 \
  --table-name AEGIS-DynamoDB-FactoryStatus \
  --key-condition-expression 'pk = :pk AND sk BETWEEN :from AND :to' \
  --expression-attribute-values '{
    ":pk":{"S":"FACTORY#factory-b"},
    ":from":{"S":"GRAPH#5M#2026-06-01T08:00:00Z"},
    ":to":{"S":"GRAPH#5M#2026-06-01T08:55:00Z"}
  }' \
  --scan-index-forward
```

`bucket_start`는 5분 경계다. 예: `08:00`, `08:05`, `08:10`.

## DynamoDB Key

```text
pk = FACTORY#{factory_id}
sk = GRAPH#5M#{bucket_start}
```

예시:

```text
pk = FACTORY#factory-b
sk = GRAPH#5M#2026-06-01T08:45:00Z
```

## 데이터 포맷

`HISTORY#STATE`는 원본 snapshot에 가까운 포맷이다.

```json
{
  "pk": "FACTORY#factory-b",
  "sk": "HISTORY#STATE#2026-06-01T08:45:19Z",
  "infra_state": {
    "nodes": [
      {
        "node_id": "master",
        "role": "control-plane",
        "cpu_usage_percent": 5.21,
        "memory_usage_percent": 29.23,
        "disk_usage_percent": 25.97
      }
    ]
  }
}
```

`GRAPH#5M`은 5분 bucket 집계 포맷이다.

```json
{
  "pk": "FACTORY#factory-b",
  "sk": "GRAPH#5M#2026-06-01T08:45:00Z",
  "bucket_start": "2026-06-01T08:45:00Z",
  "bucket_end": "2026-06-01T08:49:59.999Z",
  "infra": {
    "cpu_usage_percent": {
      "unit": "percent",
      "count": 14,
      "min": 6.685,
      "max": 9.505,
      "mean": 7.9086,
      "first": 6.805,
      "last": 7.165
    },
    "nodes": [
      {
        "node_id": "master",
        "role": "control-plane",
        "cpu_usage_percent": {
          "unit": "percent",
          "count": 14,
          "min": 5.02,
          "max": 8.4,
          "mean": 6.3064,
          "first": 5.21,
          "last": 5.22
        },
        "memory_usage_percent": {
          "unit": "percent",
          "count": 14,
          "mean": 31.9236
        },
        "disk_usage_percent": {
          "unit": "percent",
          "count": 14,
          "mean": 24.5386
        }
      },
      {
        "node_id": "worker1",
        "role": "worker",
        "cpu_usage_percent": {
          "unit": "percent",
          "count": 14,
          "mean": 9.5107
        }
      }
    ]
  },
  "quality": {
    "source_dataset": "DynamoDB HISTORY#STATE",
    "source_count": 117,
    "expected_count": 100,
    "collection_rate": 1,
    "is_empty": false,
    "is_partial": false
  }
}
```

## 필드 의미

| 필드 | 의미 |
| --- | --- |
| `infra.cpu_usage_percent` | bucket 안 snapshot별 전체 node 평균을 다시 5분 집계한 하위 호환 필드 |
| `infra.memory_usage_percent` | 전체 node memory 평균 기반 하위 호환 필드 |
| `infra.disk_usage_percent` | 전체 node disk 평균 기반 하위 호환 필드 |
| `infra.nodes[]` | node별 5분 집계 series의 원본 |
| `infra.nodes[].node_id` | node series key. Backend는 이 값으로 묶는다 |
| `infra.nodes[].role` | node role 표시용 metadata |
| `count` | 해당 5분 bucket에서 집계에 사용된 point 수 |
| `mean` | chart 기본값으로 권장 |
| `min`, `max` | tooltip 또는 range 표시용 |
| `first`, `last` | bucket 시작/끝 값 |
| `*_at` | 해당 값의 source timestamp |

## Backend 변환 권장안

DynamoDB item 배열을 받아 `node_id` 기준으로 series를 만든다.

응답 예시:

```json
{
  "factory_id": "factory-b",
  "bucket_minutes": 5,
  "nodes": [
    {
      "node_id": "master",
      "role": "control-plane",
      "cpu": [
        {
          "t": "2026-06-01T08:45:00Z",
          "mean": 6.3064,
          "min": 5.02,
          "max": 8.4,
          "count": 14
        }
      ],
      "memory": [
        {
          "t": "2026-06-01T08:45:00Z",
          "mean": 31.9236,
          "count": 14
        }
      ],
      "disk": [
        {
          "t": "2026-06-01T08:45:00Z",
          "mean": 24.5386,
          "count": 14
        }
      ]
    }
  ]
}
```

Mapping:

```text
t      <- GRAPH#5M.bucket_start
cpu    <- infra.nodes[].cpu_usage_percent
memory <- infra.nodes[].memory_usage_percent
disk   <- infra.nodes[].disk_usage_percent
```

## 최신 운영 데이터 확인

2026-06-01 조회 기준 최신 `GRAPH#5M` bucket:

```text
bucket_start = 2026-06-01T08:45:00Z
bucket_end   = 2026-06-01T08:49:59.999Z
created_at   = 2026-06-01T08:51:30Z
updated_at   = 2026-06-01T08:51:30Z
```

| factory | latest sk | node count | nodes | source_count | collection_rate |
| --- | --- | ---: | --- | ---: | ---: |
| `factory-a` | `GRAPH#5M#2026-06-01T08:45:00Z` | 3 | `master`, `worker1`, `worker2` | 117 | 1 |
| `factory-b` | `GRAPH#5M#2026-06-01T08:45:00Z` | 2 | `master`, `worker1` | 117 | 1 |
| `factory-c` | `GRAPH#5M#2026-06-01T08:45:00Z` | 2 | `factory-c-master`, `factory-c-worker` | 118 | 1 |

Node별 latest mean sample:

| factory | node_id | cpu mean | memory mean | disk mean |
| --- | --- | ---: | ---: | ---: |
| `factory-a` | `master` | 6.0167 | 54.27 | 14.54 |
| `factory-a` | `worker1` | 4.38 | 17.1853 | 22.9 |
| `factory-a` | `worker2` | 13.4907 | 20.1813 | 22.11 |
| `factory-b` | `master` | 6.3064 | 31.9236 | 24.5386 |
| `factory-b` | `worker1` | 9.5107 | 35.3443 | 25.1521 |
| `factory-c` | `factory-c-master` | 8.8253 | 28.2633 | 21.916 |
| `factory-c` | `factory-c-worker` | 12.7707 | 37.698 | 27.1213 |

## 주의사항

- `factory-a`는 node 3개, `factory-b/c`는 node 2개다. Backend는 `infra.nodes[]` 길이를 고정값으로 가정하면 안 된다.
- node가 교체되거나 일시적으로 누락되면 bucket마다 `node_id` 목록과 metric `count`가 달라질 수 있다.
- 배포 이전에 생성된 오래된 `GRAPH#5M` item에는 `infra.nodes[]`가 없을 수 있다. 이 경우 Backend는 해당 bucket을 skip하거나 `infra.cpu_usage_percent` 전체 평균으로 fallback한다.
- 신규 UI는 `infra.nodes[]`를 우선 사용한다.
- `infra.cpu_usage_percent`, `infra.memory_usage_percent`, `infra.disk_usage_percent`는 하위 호환용 전체 평균 필드다.
- 오래된 bucket을 새 포맷으로 보정하려면 `HISTORY#STATE` TTL 안에 있을 때 GraphAggregator5m을 bucket별로 재실행해야 한다.
