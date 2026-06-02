# Data Storage Pipeline and Formats

상태: source of truth
기준일: 2026-06-02
수정 이력:
  - 2026-06-02  S3 Reports Path 섹션 추가. `reports/daily/yyyy=…/{factory_id}/report.md` 경로와 Dashboard Backend S3 조회 기준(ADR 0029) 반영.
  - 2026-06-01  GRAPH#5M Dashboard 응답에 센서 min 필드와 AI mean/max 분리 기준 추가. Environment History 6h/12h/24h 렌더링 기준 현행화.
  - 2026-05-29  안전 점수 그래프용 `risk_score_max` 추출/응답 기준 추가.
  - 2026-05-29  ADR 0025 구현 완료 반영. GRAPH#5M 계층 추가, 데이터 흐름 갱신, Dashboard 조회 기준 window 분기 현행화.
  - 2026-05-28  HISTORY 섹션에 TTL 48h 스케일 이슈와 Multi-resolution 전환 계획(ADR 0025) 추가.

## 목적

이 문서는 AWS IoT Core 수신 이후 데이터를 어디에 어떤 형태로 저장하는지 정의한다.

범위는 아래 저장 계층이다.

```text
S3 raw
S3 processed
S3 processed_agg (GRAPH#5M 보조 복사본)
S3 reports/daily (일간 Markdown 보고서, Dashboard read-only)
DynamoDB LATEST
DynamoDB HISTORY#STATE  (short-term 실시간 buffer, TTL 2h 목표)
DynamoDB GRAPH#5M       (5분 집계 버킷, TTL 48h)
```

전송 데이터 포맷 자체는 `docs/specs/iot_data_format.md`를 따른다. 이 문서는 해당 메시지를 cloud-side에서 어떻게 저장하고 Dashboard가 어떻게 조회하는지를 정의한다.

MVP 기준 Dashboard의 현재 상태 조회는 S3 `latest/` 객체가 아니라 DynamoDB LATEST item을 기준으로 한다. S3는 raw 원본 보존과 processed 장기 이력 저장소로 사용한다.

## 전체 데이터 흐름

최종 MVP 데이터 처리 흐름은 아래 구조를 기준으로 한다.

```text
factory-{a,b,c} edge-agent / dummy-sensor
  -> local spool/outbox
  -> edge-iot-publisher
  -> AWS IoT Core
      -> IoT Rule
          -> S3 raw
      -> Lambda AEGIS-Lambda-DataProcessor
          -> DynamoDB LATEST
          -> DynamoDB HISTORY#STATE  (TTL: 현재 48h, 목표 2h)
          -> S3 processed

EventBridge Scheduler (5분 주기)
  -> Lambda AEGIS-Lambda-GraphAggregator5m
      -> DynamoDB HISTORY#STATE query (직전 5분 window)
      -> DynamoDB GRAPH#5M put  (TTL 48h)
      -> S3 processed_agg

Dashboard API/Web
  -> DynamoDB LATEST          (현재 상태 카드)
  -> DynamoDB HISTORY#STATE   (window=1h 그래프)
  -> DynamoDB GRAPH#5M        (window=6h/12h/24h 그래프)
```

역할:

| 구성 요소 | 역할 |
| --- | --- |
| IoT Core | factory별 MQTT 데이터 수신 진입점 |
| IoT Rule | 수신 원본을 S3 raw에 저장 |
| Lambda DataProcessor | 메시지 정규화, Risk 계산, LATEST/HISTORY#STATE/S3 processed 저장 |
| Lambda GraphAggregator5m | 5분마다 HISTORY#STATE → GRAPH#5M 집계. EventBridge 5분 주기 |
| DynamoDB LATEST | Dashboard 카드와 현재 상태 조회 |
| DynamoDB HISTORY#STATE | 1h 실시간 그래프용 raw snapshot buffer |
| DynamoDB GRAPH#5M | 6h/12h/24h 그래프용 5분 집계 버킷 |
| S3 raw | Edge data-plane 원본 JSON 장기 보존 |
| S3 processed | Lambda 계산 결과와 상태 요약 이력 보존 |
| S3 processed_agg | GRAPH#5M 보조 JSON 복사본. 장기 재처리용 |

## 저장 계층 구분

| 계층 | 저장 내용 | 조회 목적 | 보존 방식 |
| --- | --- | --- | --- |
| `S3 raw` | Edge data-plane 원본 `factory_state`, `infra_state` | 감사, 재처리, 원본 확인 | 장기 보존 |
| `S3 processed` | Lambda가 계산한 Risk 결과, pipeline summary, status summary | 리포트, 장기 이력, 재처리 비교 | 장기 보존 |
| `S3 processed_agg` | GraphAggregator5m이 생성한 GRAPH#5M 보조 JSON | 장기 재처리, 검증 | 장기 보존 |
| `DynamoDB LATEST` | 공장별 현재 상태 1건 | 대시보드 상단 카드, 현재 노드 상태 | 계속 overwrite |
| `DynamoDB HISTORY#STATE` | 최근 1h 그래프용 raw snapshot buffer | window=1h 그래프 | TTL 2h (현재 48h 유지 중) |
| `DynamoDB GRAPH#5M` | 5분 avg/min/max 집계 버킷 | window=6h/12h/24h 그래프 | TTL 48h |

DynamoDB는 원본의 source of truth가 아니다. 원본 정본은 `S3 raw`이고, 처리 결과 이력 정본은 `S3 processed`다. DynamoDB는 Dashboard가 빠르게 읽기 위한 hot store다.

## S3 Raw Path

IoT Rule은 IoT Core 수신 메시지를 원본 그대로 저장한다.

경로:

```text
raw/{factory_id}/{source_type}/yyyy={YYYY}/mm={MM}/dd={DD}/{message_id}.json
```

예시:

```text
raw/factory-a/factory_state/yyyy=2026/mm=05/dd=14/factory-a:factory_state:worker2:2026-05-14T12:00:06Z.json
raw/factory-a/infra_state/yyyy=2026/mm=05/dd=14/factory-a:infra_state:cluster:2026-05-14T12:00:20Z.json
```

저장 내용:

- `factory_state`: 온도, 습도, 기압, AI score, 이상소음 대표 라벨
- `infra_state`: heartbeat, node, workload, device 상태 원본 요약

Object body 기준:

- S3 raw object body는 Edge data-plane이 publish한 canonical JSON과 동일한 payload를 저장한다.
- 검증 기준은 `schema_version`, `message_id`, `factory_id`, `node_id`, `source_type`, `source_timestamp`, `published_at`, `data_plane_instance_id`, `payload`다.
- IoT Rule SQL은 `SELECT *`만 사용하고 raw body에 `received_at` 같은 보조 필드를 추가하지 않는다.
- `message_id`는 local outbox 파일명, MQTT payload, S3 raw object key, Lambda 처리 결과의 `source_message_id`를 연결하는 idempotency key다.

## S3 Processed Path

Lambda는 계산 결과와 상태 요약을 S3 processed에 저장한다.

Risk 결과:

```text
processed/{factory_id}/risk_score/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{message_id}.json
```

환경 상태 처리 결과:

```text
processed/{factory_id}/factory_state/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{message_id}.json
```

인프라 상태 처리 결과:

```text
processed/{factory_id}/infra_state/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{message_id}.json
```

전체 상태 snapshot:

```text
processed/{factory_id}/state_snapshot/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{updated_at}.json
```

예시:

```text
processed/factory-a/risk_score/yyyy=2026/mm=05/dd=14/hh=12/factory-a:factory_state:worker2:2026-05-14T12:00:06Z.json
processed/factory-a/infra_state/yyyy=2026/mm=05/dd=14/hh=12/factory-a:infra_state:cluster:2026-05-14T12:00:20Z.json
processed/factory-a/state_snapshot/yyyy=2026/mm=05/dd=14/hh=12/2026-05-14T12:00:06.123Z.json
```

`S3 processed`는 장기 이력과 재처리 비교를 위한 저장소다. Dashboard의 기본 현재 상태와 최근 그래프는 DynamoDB를 먼저 조회한다.

Processed object body 기준:

- Lambda data processor가 정규화한 입력, Risk 계산 결과, pipeline summary, dashboard summary를 저장한다.
- `source_message_id`에는 원본 canonical JSON의 `message_id`를 저장한다.
- `processed/{factory_id}/risk_score/`는 `factory_state` 처리 결과와 Risk 계산 결과를 담는다.
- `processed/{factory_id}/factory_state/`는 Dashboard 환경 상태 조회에 필요한 정규화 결과를 담는다.
- `processed/{factory_id}/infra_state/`는 인프라 상태와 pipeline status 계산 결과를 담는다.
- `processed/{factory_id}/state_snapshot/`은 DynamoDB `HISTORY#STATE`와 같은 전체 상태 snapshot을 담되, DynamoDB TTL 정책 필드인 `ttl`은 저장하지 않는다.
- S3 processed는 장기 이력과 재처리 비교용이며, Dashboard current state의 1차 조회 대상은 아니다.

## S3 Reports Path

일간 Markdown 보고서는 `processed/`와 별도 prefix인 `reports/daily/`에 저장한다.

경로:

```text
reports/daily/yyyy={YYYY}/mm={MM}/dd={DD}/{factory_id}/report.md
```

예시:

```text
reports/daily/yyyy=2026/mm=06/dd=01/factory-a/report.md
```

- 보고서 본문 생성은 lambda-report-generator(ADR 0016, Bedrock)의 팀원/후속 작업이다. 현재 객체가 없을 수 있다.
- Dashboard Backend는 이 경로를 read-only로 조회한다(ADR 0029). `GET /reports`는 `reports/daily/` prefix를 `ListObjectsV2`로 나열하고, `GET /reports/{date}/{factory_id}`는 위 key를 `GetObject`로 읽어 `text/markdown`으로 반환한다.
- ECS task role IAM: `reports/daily/*` 한정 `s3:ListBucket` + `reports/*` `s3:GetObject` (`docs/changes/0028`/`0029`, `infra/data-dashboard/ecs.tf`).
- 보고서는 `aegis-daily-report` DynamoDB table이 아니라 S3가 1차 조회 대상이다. DDB `aegis-daily-report` table은 잔존하나 Dashboard 조회 경로에서 사용하지 않는다.

## DynamoDB Table

테이블명:

```text
AEGIS-DynamoDB-FactoryStatus
```

레이어: `infra/foundation` (영구 리소스. data-pipeline destroy와 무관하게 유지됨)

주의: `aegis-factory-status`는 Phase 1 Step 3~5 중복 생성 table로 확인되어 신규 사용을 중단한다. 공식 hot store는 실제 dummy/sensor 데이터가 적재 중인 `AEGIS-DynamoDB-FactoryStatus`다(ADR 0022).

기본 키:

| 필드 | 의미 |
| --- | --- |
| `pk` | `FACTORY#{factory_id}` |
| `sk` | item type과 timestamp |

공통 필드:

| 필드 | 의미 |
| --- | --- |
| `factory_id` | 공장 ID |
| `schema_version` | 저장 스키마 버전 |
| `updated_at` | item 갱신 시각 |
| `source_message_id` | 원본 IoT 메시지 ID |
| `ttl` | HISTORY item 자동 삭제 시각. LATEST에는 사용하지 않음 |

## DynamoDB LATEST

`LATEST` item은 공장별 현재 상태 1건이다.

키:

```text
pk = FACTORY#{factory_id}
sk = LATEST
```

저장 방식:

- `factory_state` 수신 시 `LATEST.factory_state`와 `LATEST.risk` 갱신
- `infra_state` 수신 시 `LATEST.infra_state`와 `LATEST.pipeline_status` 갱신
- 같은 `pk/sk` item을 계속 overwrite/update 한다
- 과거 이력은 `LATEST`에 남기지 않는다
- `LATEST.source_message_id`는 마지막으로 처리한 메시지 ID를 저장한다
- 중복 `message_id`가 들어오면 같은 처리 결과로 간주하고 item을 중복 증가시키지 않는다

Dashboard 사용처:

- 공장별 현재 Risk 카드
- 현재 환경 상태 요약
- 현재 노드/워크로드/장치 상태
- 현재 pipeline status
- 공장 목록 위험도 정렬

예시:

```json
{
  "pk": "FACTORY#factory-a",
  "sk": "LATEST",
  "factory_id": "factory-a",
  "schema_version": "0.1.0",
  "updated_at": "2026-05-14T12:00:20Z",
  "last_factory_state_at": "2026-05-14T12:00:06Z",
  "last_infra_state_at": "2026-05-14T12:00:20Z",
  "risk": {
    "score": 27.6,
    "level": "danger",
    "top_causes": [
      {
        "field": "temperature",
        "value": 38.2,
        "contribution": 42.86
      },
      {
        "field": "ai_event_rate",
        "value": 0.67,
        "contribution": 19.14
      }
    ],
    "calculated_at": "2026-05-14T12:00:06Z",
    "calculation_version": "risk-v0.2.0"
  },
  "factory_state": {
    "source_message_id": "factory-a:factory_state:worker2:2026-05-14T12:00:06Z",
    "aggregation_window_seconds": 3,
    "sensor": {
      "sample_count": 5,
      "temperature_celsius_avg": 38.2,
      "humidity_percent_avg": 64.0,
      "pressure_hpa_avg": 1011.8
    },
    "ai_result": {
      "sample_count": 3,
      "fire_score": 0.0,
      "fall_score": 0.67,
      "bend_score": 0.2,
      "abnormal_sound": "none"
    }
  },
  "infra_state": {
    "source_message_id": "factory-a:infra_state:cluster:2026-05-14T12:00:20Z",
    "node_summary": {
      "total": 3,
      "ready": 3,
      "not_ready": 0
    },
    "nodes": [
      {
        "node_id": "master",
        "ready": true,
        "cpu_usage_percent": 31.2,
        "memory_usage_percent": 55.4,
        "disk_usage_percent": 42.1
      },
      {
        "node_id": "worker1",
        "ready": true,
        "cpu_usage_percent": 22.8,
        "memory_usage_percent": 48.0,
        "disk_usage_percent": 39.5
      },
      {
        "node_id": "worker2",
        "ready": true,
        "cpu_usage_percent": 44.8,
        "memory_usage_percent": 63.0,
        "disk_usage_percent": 45.5
      }
    ],
    "workload_summary": {
      "total": 3,
      "running": 3,
      "unhealthy": 0,
      "restart_count_total": 0
    },
    "device_summary": {
      "bme280_available": true,
      "camera_available": true,
      "microphone_available": true
    }
  },
  "pipeline_status": {
    "status": "normal",
    "latest_infra_state_age_seconds": 6,
    "latest_s3_raw_age_seconds": 4
  },
  "dashboard": {
    "display_status": "위험",
    "summary": "넘어짐 score와 온도 상승으로 위험 상태",
    "updated_at": "2026-05-14T12:00:20Z"
  }
}
```

## DynamoDB HISTORY#STATE

`HISTORY#STATE` item은 `window=1h` 그래프를 위한 short-term raw snapshot buffer다. `LATEST`와 필드 구조를 동일하게 유지하고, `sk`와 `ttl`만 history용으로 바꾼 스냅샷을 저장한다.

보존:

```text
목표 TTL: 2시간 (window=1h의 2배 버퍼)
현재 TTL: 48시간 (data-processor 환경변수 변경 미적용 상태)
```

**Multi-resolution storage 전환 (ADR 0025, 2026-05-29 구현 완료)**

| 계층 | sk prefix | TTL | Dashboard 역할 | 아이템 수 (3공장) |
| --- | --- | --- | --- | --- |
| HISTORY#STATE | `HISTORY#STATE#*` | 2h 목표 (현재 48h) | window=1h 실시간 정밀 차트 | ~7,200개 (TTL 2h 기준) |
| GRAPH#5M | `GRAPH#5M#*` (기존 테이블 내) | 48h | window=6h/12h/24h 5분 집계 차트 | ~864개 (24h 기준) |

Lambda AEGIS-Lambda-GraphAggregator5m이 EventBridge 5분 주기로 HISTORY#STATE → GRAPH#5M 집계를 수행한다. (2026-05-29 배포 완료)

cascade 504 사고 배경: `docs/ops/04_troubleshooting.md` #42

키:

```text
pk = FACTORY#{factory_id}
sk = HISTORY#STATE#{updated_at}   ← 예: HISTORY#STATE#2026-05-14T12:00:06.123Z
```

저장 방식:

- `factory_state` 수신 시 `LATEST.factory_state`, `LATEST.risk`, `LATEST.pipeline_status`를 부분 갱신한 뒤, 갱신된 `LATEST` 전체를 `HISTORY#STATE#{updated_at}`으로 복사한다.
- `infra_state` 수신 시 `LATEST.infra_state`, `LATEST.pipeline_status`를 부분 갱신한 뒤, 갱신된 `LATEST` 전체를 `HISTORY#STATE#{updated_at}`으로 복사한다.
- `HISTORY#STATE` item은 `LATEST`와 같은 구조이며, `ttl` 필드만 추가된다.
- 정밀 이력 원본은 S3 raw와 S3 processed에 별도 보존한다.

예시:

```json
{
  "pk": "FACTORY#factory-a",
  "sk": "HISTORY#STATE#2026-05-14T12:00:06.123Z",
  "factory_id": "factory-a",
  "schema_version": "0.1.0",
  "factory_state": {
    "message_id": "factory-a:factory_state:worker2:2026-05-14T12:00:06Z",
    "source_timestamp": "2026-05-14T12:00:06Z",
    "aggregation_window_seconds": 3,
    "temperature_celsius": 38.2,
    "humidity_percent": 64.0,
    "pressure_hpa": 1011.8,
    "sample_count": 5,
    "fire_score": 0.0,
    "fall_score": 0.67,
    "bend_score": 0.2,
    "abnormal_sound": "none",
    "ai_sample_count": 3
  },
  "infra_state": {
    "message_id": "factory-a:infra_state:cluster:2026-05-14T12:00:00Z",
    "source_timestamp": "2026-05-14T12:00:00Z",
    "agent_status": "running",
    "cluster_name": "factory-a",
    "nodes_total": 3,
    "nodes_ready": 3,
    "pods_ready": 12,
    "pods_total": 12,
    "nodes": [],
    "workloads": [],
    "devices": {}
  },
  "risk": {
    "score": 72.4,
    "level": "warning",
    "calculation_version": "risk-v0.2.0"
  },
  "pipeline_status": {
    "status": "normal",
    "latest_infra_state_age_seconds": 6,
    "latest_s3_raw_age_seconds": 4
  },
  "last_factory_state_at": "2026-05-14T12:00:06Z",
  "last_infra_state_at": "2026-05-14T12:00:00Z",
  "updated_at": "2026-05-14T12:00:06.123Z",
  "ttl": 1760000000
}
```

## DynamoDB GRAPH#5M

`GRAPH#5M` item은 `window=6h/12h/24h` 그래프를 위한 5분 단위 집계 버킷이다. Lambda GraphAggregator5m이 5분마다 직전 window의 HISTORY#STATE를 읽어 집계하고 저장한다.

보존:

```text
TTL: 48시간 (window=24h의 2배 버퍼, TTL eventually-consistent 삭제 edge case 방지)
```

키:

```text
pk = FACTORY#{factory_id}
sk = GRAPH#5M#{bucket_start}   ← 예: GRAPH#5M#2026-05-29T00:35:00Z
```

bucket_start는 5분 경계 UTC ISO-8601 문자열이다. 밀리초 없음.

```text
5분 경계: 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55분
예) bucket_start=2026-05-29T00:35:00Z, bucket_end=2026-05-29T00:39:59.999Z
```

주요 필드 (실제 DDB 구조 기준, 2026-05-29 확인):

```json
{
  "pk": "FACTORY#factory-b",
  "sk": "GRAPH#5M#2026-05-29T00:35:00Z",
  "factory_id": "factory-b",
  "item_type": "GRAPH#5M",
  "schema_version": "graph-5m-v0.1.0",
  "bucket_minutes": 5,
  "bucket_start": "2026-05-29T00:35:00Z",
  "bucket_end": "2026-05-29T00:39:59.999Z",
  "ttl": 1780188090,
  "sensor": {
    "temperature_celsius": { "mean": 24.41, "min": 21.58, "max": 27.48, "count": 100 },
    "humidity_percent":    { "mean": 45.50, "min": 37.01, "max": 52.95, "count": 100 },
    "pressure_hpa":        { "mean": 1013.56, "min": 1012.0, "max": 1014.99, "count": 100 }
  },
  "risk": {
    "score": { "mean": 99.80, "min": 79.83, "max": 100.0, "count": 100 }
  },
  "ai_detection": {
    "threshold": 0.7,
    "max_score": 0.6559,
    "max_score_type": "bend_score",
    "max_score_at": "2026-05-29T00:39:38Z",
    "above_threshold_count": 0,
    "by_type": {
      "fire_score": { "max": 0.3805, "mean": 0.004, "count": 100, "threshold": 0.7, "above_threshold_count": 0 },
      "fall_score": { "max": 0.4249, "mean": 0.004, "count": 100, "threshold": 0.7, "above_threshold_count": 0 },
      "bend_score": { "max": 0.6559, "mean": 0.007, "count": 100, "threshold": 0.7, "above_threshold_count": 0 }
    }
  },
  "infra": {
    "cpu_usage_percent":    { "mean": 8.26,  "max": 9.55, "last": 9.55, "count": 16 },
    "memory_usage_percent": { "mean": 34.35, "max": 37.24, "last": 34.55, "count": 16 },
    "disk_usage_percent":   { "mean": 24.85, "max": 25.86, "last": 24.33, "count": 16 }
  },
  "quality": {
    "source_dataset": "DynamoDB HISTORY#STATE",
    "source_count": 216,
    "expected_count": 100,
    "collection_rate": 1.0,
    "is_empty": false,
    "is_partial": false,
    "infra_values_from_snapshot": true
  },
  "created_at": "2026-05-29T00:41:30Z",
  "updated_at": "2026-05-29T00:41:30Z"
}
```

주의:
- `infra` 섹션의 `count`는 5분 window 내 infra_state 수신 횟수다 (20초 주기 → 약 16개).
- `quality.source_count`가 `expected_count`보다 클 수 있다 (factory_state 3초 주기 실제 수신량).
- source item이 없는 bucket은 `sensor: {}`, `risk: {}`, `infra: {}` 구조로 저장되고 `quality.is_empty=true`가 된다.
- Dashboard는 `is_empty=true` bucket을 필터링해 그래프 공백으로 표현한다.

Dashboard 추출 필드 (backend `_extract_graph_5m` 기준):

| Dashboard 필드 | 원천 경로 | 용도 |
| --- | --- | --- |
| `risk_score` / `risk_score_avg` | `risk.score.mean` | Risk Score 평균 라인 |
| `risk_score_min` | `risk.score.min` | 안전 점수 최저 피크와 평균~최소 음영 |
| `risk_score_max` | `risk.score.max` | tooltip/검증용 최대값 |
| `temperature_celsius_avg` | `sensor.temperature_celsius.mean` | 온도 평균선 |
| `temperature_celsius_min` | `sensor.temperature_celsius.min` | 온도 tooltip/재집계 |
| `temperature_celsius_max` | `sensor.temperature_celsius.max` | 온도 최대 피크와 평균~최대 음영 |
| `humidity_percent_avg` | `sensor.humidity_percent.mean` | 습도 평균선 |
| `humidity_percent_min` | `sensor.humidity_percent.min` | 습도 최소~최대 범위 음영 |
| `humidity_percent_max` | `sensor.humidity_percent.max` | 습도 최소~최대 범위 음영 |
| `pressure_hpa_avg` | `sensor.pressure_hpa.mean` | 기압 평균선 |
| `pressure_hpa_min` | `sensor.pressure_hpa.min` | 기압 최소~최대 변동폭 음영 |
| `pressure_hpa_max` | `sensor.pressure_hpa.max` | 기압 최소~최대 변동폭 음영 |
| `fire_score` | `ai_detection.by_type.fire_score.mean` | AI 탐지 평균선 |
| `fall_score` | `ai_detection.by_type.fall_score.mean` | AI 탐지 평균선 |
| `bend_score` | `ai_detection.by_type.bend_score.mean` | AI 탐지 평균선 |
| `fire_score_max` | `ai_detection.by_type.fire_score.max` | AI 탐지 spike marker/tooltip |
| `fall_score_max` | `ai_detection.by_type.fall_score.max` | AI 탐지 spike marker/tooltip |
| `bend_score_max` | `ai_detection.by_type.bend_score.max` | AI 탐지 spike marker/tooltip |
| `cpu_usage_percent_mean` | `infra.cpu_usage_percent.mean` | 인프라 그래프 |
| `memory_usage_percent_mean` | `infra.memory_usage_percent.mean` | 인프라 그래프 |
| `disk_usage_percent_last` | `infra.disk_usage_percent.last` | 인프라 그래프 |

공장별 GRAPH#5M 데이터 존재 여부:
- factory-b, factory-c: GRAPH#5M 데이터 존재 (2026-05-29 기준)
- factory-a: Edge Agent 비활성 구간에 따라 데이터 없을 수 있음. 빈 결과는 EmptyChart로 표시

## 환경 데이터와 노드 상태 데이터 분리

### 환경 데이터

source type:

```text
factory_state
```

주기:

```text
3초
```

저장:

| 저장소 | 저장 방식 | 용도 |
| --- | --- | --- |
| `DynamoDB LATEST.factory_state` | 3초마다 overwrite | 현재 환경 상태 카드 |
| `DynamoDB LATEST.risk` | 3초마다 overwrite | 현재 Risk 카드 |
| `DynamoDB HISTORY#STATE` | LATEST snapshot + TTL | window=1h 온도/습도/기압/AI score/Risk 그래프 |
| `DynamoDB GRAPH#5M` | 5분 집계 (GraphAggregator) | window=6h/12h/24h 그래프 |
| `S3 raw` | 3초 원본 전체 | 원본 보존 |
| `S3 processed` | 3초 계산 결과 | 장기 이력/재처리 |

### 노드 상태 데이터

source type:

```text
infra_state
```

주기:

```text
20초
```

저장:

| 저장소 | 저장 방식 | 용도 |
| --- | --- | --- |
| `DynamoDB LATEST.infra_state` | 20초마다 overwrite | 현재 노드/워크로드/장치 상태 |
| `DynamoDB LATEST.pipeline_status` | 20초마다 overwrite | 현재 파이프라인 상태 |
| `DynamoDB HISTORY#STATE` | LATEST snapshot + TTL | window=1h 노드 CPU/memory/disk/Ready 그래프 |
| `DynamoDB GRAPH#5M` | 5분 집계 인프라 평균 (GraphAggregator) | window=6h/12h/24h 집계 인프라 그래프 |
| `S3 raw` | 20초 원본 전체 | 장애 분석/원본 보존 |
| `S3 processed` | 20초 상태 요약 | 운영 이력/리포트 |

## Dashboard 조회 기준

| 화면 요소 | 조회 저장소 | 설명 |
| --- | --- | --- |
| 공장별 현재 Risk 카드 | `DynamoDB LATEST` | score, level, top causes |
| 현재 환경 상태 | `DynamoDB LATEST.factory_state` | 온도, 습도, 기압, AI score |
| 현재 노드 상태 | `DynamoDB LATEST.infra_state` | Ready, CPU, memory, disk |
| 현재 pipeline 상태 | `DynamoDB LATEST.pipeline_status` | normal/warning/critical |
| 24h header sparkline | `DynamoDB GRAPH#5M` | window=24h, risk_score (mean) |
| 최근 그래프 window=1h | `DynamoDB HISTORY#STATE` | raw snapshot, max_items=500 cap |
| 최근 그래프 window=6h/12h/24h | `DynamoDB GRAPH#5M` | 5분 avg/min/max 집계, 최대 288 items |
| 장기 이력/감사 | `S3 processed`, `S3 raw` | 장기 조회, 재처리, 리포트 |

Dashboard API:

```text
GET /factories/{factory_id}/history?window=1h
  -> DynamoDB HISTORY#STATE query (max_items=500 cap, ScanIndexForward=False)
  -> 응답: timestamp, risk_score, temperature_celsius_avg, fire_score, nodes[], ...

GET /factories/{factory_id}/history?window=6h|12h|24h
  -> DynamoDB GRAPH#5M query (ScanIndexForward=True, 최대 288 items)
  -> 응답: timestamp, is_bucket=true, risk_score_avg, risk_score_min, risk_score_max,
           temperature_celsius_avg/min/max, humidity_percent_avg/min/max,
           pressure_hpa_avg/min/max, fire_score, fire_score_max,
           cpu_usage_percent_mean, ...
  -> 해당 공장에 GRAPH#5M 데이터 없으면 []
```

Risk Score 방향: **100 = 최안전, 0 = 최위험**. 낮은 값이 이상 징후 기준.

| 구간 | level |
| --- | --- |
| 85 ~ 100 | 안전 |
| 50 ~ 84 | 주의 (risk_score_min ≤ 84 → warning 마커) |
| 0 ~ 49 | 위험 (risk_score_min ≤ 49 → danger 마커) |

## 구현 기준

- Lambda DataProcessor는 `message_id` 기준으로 idempotent하게 처리한다.
- `S3 raw` 저장은 IoT Rule이 담당한다.
- Lambda DataProcessor는 `DynamoDB LATEST`, `DynamoDB HISTORY#STATE`, `S3 processed`를 담당한다.
- Lambda GraphAggregator5m은 `DynamoDB GRAPH#5M`, `S3 processed_agg`를 담당한다.
- Dashboard current state는 S3 `latest/` prefix가 아니라 DynamoDB LATEST를 기준으로 조회한다.
- `DynamoDB HISTORY#STATE`는 갱신된 `LATEST`와 같은 구조를 저장하고 TTL만 추가한다.
- `S3 processed state_snapshot`은 `DynamoDB HISTORY#STATE`와 같은 구조를 저장하되 TTL은 제외한다.
- `DynamoDB HISTORY#STATE`와 `DynamoDB GRAPH#5M` 모두 TTL을 적용한다.
- 장기 보존과 재처리는 DynamoDB가 아니라 S3 raw/processed를 기준으로 한다.
- Dashboard는 기본적으로 DynamoDB를 조회하고, 상세/감사/장기 이력에서만 S3를 조회한다.
