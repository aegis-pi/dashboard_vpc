# Data Storage Pipeline and Formats

상태: source of truth
기준일: 2026-05-21

## 목적

이 문서는 AWS IoT Core 수신 이후 데이터를 어디에 어떤 형태로 저장하는지 정의한다.

범위는 아래 네 가지 저장 계층이다.

```text
S3 raw
S3 processed
DynamoDB LATEST
DynamoDB HISTORY
```

전송 데이터 포맷 자체는 `docs/specs/iot_data_format.md`를 따른다. 이 문서는 해당 메시지를 cloud-side에서 어떻게 저장하고 Dashboard가 어떻게 조회하는지를 정의한다.

MVP 기준 Dashboard의 현재 상태 조회는 S3 `latest/` 객체가 아니라 DynamoDB LATEST item을 기준으로 한다. S3는 raw 원본 보존과 processed 장기 이력 저장소로 사용한다.

## 전체 데이터 흐름

최종 MVP 데이터 처리 흐름은 아래 구조를 기준으로 한다.

```text
factory-a-log-adapter / dummy-data-generator
  -> local spool/outbox
  -> edge-iot-publisher
  -> AWS IoT Core
      -> IoT Rule
          -> S3 raw
      -> Lambda
          -> DynamoDB LATEST
          -> DynamoDB HISTORY
          -> S3 processed

Dashboard API/Web
  -> DynamoDB LATEST/HISTORY
  -> S3 processed
```

역할:

| 구성 요소 | 역할 |
| --- | --- |
| IoT Core | factory별 MQTT 데이터 수신 진입점 |
| IoT Rule | 수신 원본을 S3 raw에 저장 |
| Lambda | 메시지 정규화, Risk 계산, latest/history/processed 저장 |
| DynamoDB LATEST | Dashboard 카드와 현재 상태 조회 |
| DynamoDB HISTORY | 최근 1시간/2시간 그래프 조회 |
| S3 raw | Edge data-plane 원본 JSON 장기 보존 |
| S3 processed | Lambda 계산 결과와 상태 요약 이력 보존 |

## 저장 계층 구분

| 계층 | 저장 내용 | 조회 목적 | 보존 방식 |
| --- | --- | --- | --- |
| `S3 raw` | Edge data-plane 원본 `factory_state`, `infra_state` | 감사, 재처리, 원본 확인 | 장기 보존 |
| `S3 processed` | Lambda가 계산한 Risk 결과, pipeline summary, status summary | 리포트, 장기 이력, 재처리 비교 | 장기 보존 |
| `DynamoDB LATEST` | 공장별 현재 상태 1건 | 대시보드 상단 카드, 현재 노드 상태 | 계속 overwrite |
| `DynamoDB HISTORY` | 최근 그래프용 short-term 시계열 | 최근 1h/2h 그래프 | TTL로 최근 N시간/일만 보존 |

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

## DynamoDB HISTORY

`HISTORY` item은 최근 그래프를 빠르게 그리기 위한 short-term 시계열이다. `LATEST`와 필드 구조를 동일하게 유지하고, `sk`와 `ttl`만 history용으로 바꾼 스냅샷을 저장한다.

보존:

```text
TTL: 48시간
```

MVP Dashboard는 최근 1시간 또는 2시간 그래프를 기본으로 조회한다. TTL은 48시간이 기본값이며, Lambda 환경변수 `HISTORY_TTL_HOURS`로 조정 가능하다.

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
| `DynamoDB HISTORY#STATE` | LATEST snapshot + TTL | 온도/습도/기압/AI score/Risk 그래프 |
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
| `DynamoDB HISTORY#STATE` | LATEST snapshot + TTL | 노드 CPU/memory/disk/Ready 그래프 |
| `S3 raw` | 20초 원본 전체 | 장애 분석/원본 보존 |
| `S3 processed` | 20초 상태 요약 | 운영 이력/리포트 |

## Dashboard 조회 기준

| 화면 요소 | 기본 조회 저장소 | 설명 |
| --- | --- | --- |
| 공장별 현재 Risk 카드 | `DynamoDB LATEST` | score, level, top causes |
| 현재 환경 상태 | `DynamoDB LATEST.factory_state` | 온도, 습도, 기압, AI score |
| 현재 노드 상태 | `DynamoDB LATEST.infra_state` | Ready, CPU, memory, disk |
| 현재 pipeline 상태 | `DynamoDB LATEST.pipeline_status` | normal/warning/critical |
| 최근 Risk 그래프 | `DynamoDB HISTORY#STATE` | factory_state 수신 시점 snapshot |
| 최근 환경 그래프 | `DynamoDB HISTORY#STATE` | factory_state 수신 시점 snapshot |
| 최근 노드 그래프 | `DynamoDB HISTORY#STATE` | infra_state 수신 시점 snapshot |
| 장기 이력/감사 | `S3 processed`, `S3 raw` | 장기 조회, 재처리, 리포트 |

Dashboard API 예시:

```text
GET /factories
  -> DynamoDB LATEST list/query

GET /factories/{factory_id}
  -> DynamoDB LATEST get item

GET /factories/{factory_id}/risk-history?window=1h
  -> DynamoDB HISTORY#STATE query, risk 필드 추출

GET /factories/{factory_id}/factory-history?window=1h
  -> DynamoDB HISTORY#STATE query, factory_state 필드 추출

GET /factories/{factory_id}/infra-history?window=1h
  -> DynamoDB HISTORY#STATE query, infra_state 필드 추출
```

## 구현 기준

- Lambda는 `message_id` 기준으로 idempotent하게 처리한다.
- `S3 raw` 저장은 IoT Rule이 담당한다.
- Lambda는 `DynamoDB LATEST`, `DynamoDB HISTORY`, `S3 processed`를 담당한다.
- Dashboard current state는 S3 `latest/` prefix가 아니라 DynamoDB LATEST를 기준으로 조회한다.
- `DynamoDB HISTORY#STATE`는 갱신된 `LATEST`와 같은 구조를 저장하고 TTL만 추가한다.
- `S3 processed state_snapshot`은 `DynamoDB HISTORY#STATE`와 같은 구조를 저장하되 TTL은 제외한다.
- `DynamoDB HISTORY`에는 TTL을 적용한다.
- 장기 보존과 재처리는 DynamoDB가 아니라 S3 raw/processed를 기준으로 한다.
- Dashboard는 기본적으로 DynamoDB를 조회하고, 상세/감사/장기 이력에서만 S3를 조회한다.
