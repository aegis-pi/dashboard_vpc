# Risk Twin Web Screen Data Mapping

상태: source of truth
기준일: 2026-05-29
수정 이력:
  - 2026-05-29  Environment History 안전 점수 그래프를 avg/max/threshold/tooltip 기준으로 갱신.

## 목적

이 문서는 Risk Twin Web Dashboard를 구현하는 개발자가 화면별로 어떤 데이터를 조회하고 어떤 필드를 렌더링해야 하는지 정의한다.

화면 레이아웃과 wireframe은 `04_risk_twin_web_screen_design.md`를 따른다. 이 문서는 wireframe을 구현하기 위한 데이터 소스, DynamoDB key, 필드 경로, API 응답 shape, 렌더링 로직을 정의한다.

## 공통 데이터 소스

| 이름 | 저장소 | 용도 |
| --- | --- | --- |
| `DynamoDB LATEST` | `AEGIS-DynamoDB-FactoryStatus` | 공장별 현재 상태, 카드, 현재 요약 |
| `DynamoDB HISTORY#STATE` | `AEGIS-DynamoDB-FactoryStatus` | 1h Safety/Risk, 환경, AI score, 노드 CPU/memory/disk/Ready 그래프 |
| `DynamoDB GRAPH#5M` | `AEGIS-DynamoDB-FactoryStatus` | 6h/12h/24h 집계 그래프 |
| `S3 processed` | `processed/*` | 상세 이력, 리포트, 장기 조회 |
| `S3 raw` | `raw/*` | 원본 확인, 감사, 재처리 |

MVP 기본 화면은 DynamoDB만으로 그린다. S3는 상세/감사/장기 이력에서만 조회한다.

## DynamoDB Key 기준

테이블:

```text
AEGIS-DynamoDB-FactoryStatus
```

LATEST:

```text
pk = FACTORY#{factory_id}
sk = LATEST
```

HISTORY:

```text
pk = FACTORY#{factory_id}
sk = HISTORY#STATE#{timestamp}
```

timestamp는 UTC ISO 8601 문자열을 사용한다. lexicographical sort가 시간순과 같아야 하므로 아래 형식을 사용한다.

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

## 공통 LATEST 필드

아래 필드는 여러 화면에서 공통 사용한다.

| 필드 경로 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `pk` | string | Y | `FACTORY#{factory_id}` |
| `sk` | string | Y | `LATEST` |
| `factory_id` | string | Y | 공장 ID |
| `schema_version` | string | Y | 저장 스키마 버전 |
| `updated_at` | string | Y | latest item 최종 갱신 시각 |
| `last_factory_state_at` | string | Y | 마지막 `factory_state` 반영 시각 |
| `last_infra_state_at` | string | Y | 마지막 `infra_state` 반영 시각 |
| `risk.score` | number | Y | 0~100 Safety Score. 높을수록 안전 |
| `risk.level` | string | Y | `safe`, `warning`, `danger` |
| `risk.top_causes[]` | array | Y | 주요 원인 목록 |
| `factory_state.sensor` | object | Y | 현재 환경 센서 요약 |
| `factory_state.ai_result` | object | Y | 현재 AI score 요약 |
| `infra_state.node_summary` | object | Y | 노드 ready 요약 |
| `infra_state.nodes[]` | array | Y | 노드별 상태 |
| `infra_state.workload_summary` | object | Y | 워크로드 요약 |
| `infra_state.device_summary` | object | Y | 장치 요약 |
| `pipeline_status.status` | string | Y | `normal`, `warning`, `critical` |
| `dashboard.display_status` | string | Y | 화면 표시 상태. 예: `안전`, `주의`, `위험` |
| `dashboard.summary` | string | N | 요약 문장 |

## 1. Fleet Overview

### 화면 목적

전체 공장의 현재 상태를 보여주고, 위험 공장을 우선 식별한다.

### 화면 wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Aegis Risk Twin                         1h  2h  24h  Refresh │
├──────────────────────────────────────────────────────────────┤
│ 전체 3개 공장   위험 1   주의 1   안전 1   데이터 지연 0       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ factory-a    │ │ factory-b    │ │ factory-c    │          │
│ │ 위험         │ │ 주의         │ │ 안전         │          │
│ │ Risk 72.4    │ │ Risk 45.7    │ │ Risk 18.2    │          │
│ │ 원인: 넘어짐 │ │ 원인: 마이크 │ │ 원인: 없음   │          │
│ │ 노드 3/3     │ │ 노드 1/1     │ │ 노드 1/1     │          │
│ │ 갱신 6초 전  │ │ 갱신 12초 전 │ │ 갱신 8초 전  │          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ 최근 상태 변화                                                │
│ 12:00 factory-a 주의 -> 위험, 원인: fall_score                 │
│ 11:58 factory-b microphone unavailable                        │
└──────────────────────────────────────────────────────────────┘
```

### API

```text
GET /factories
```

### Backend 조회

MVP 구현에서는 아래 둘 중 하나를 사용한다.

권장:

```text
GSI1PK = LATEST
GSI1SK = RISK#{risk_sort_key}#FACTORY#{factory_id}
```

대안:

```text
Scan sk = LATEST
```

공장이 3개 수준이면 Scan도 가능하지만, 구현 기준은 GSI를 전제로 잡는다.

### 필요한 DynamoDB 필드

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| 공장 ID | `factory_id` | Y | 카드 제목 |
| 상태 | `risk.level`, `dashboard.display_status` | Y | `안전 / 주의 / 위험` badge |
| Risk Score | `risk.score` | Y | 숫자 또는 progress bar |
| 주요 원인 | `risk.top_causes[0..2].name` | Y | 최대 3개 label |
| 노드 상태 | `infra_state.node_summary.ready`, `infra_state.node_summary.total` | Y | `3/3 Ready` |
| Pipeline | `pipeline_status.status` | Y | normal/warning/critical badge |
| 최종 갱신 | `updated_at` | Y | `N초 전` relative time |
| 환경 최신성 | `last_factory_state_at` | Y | stale 판단 |
| 인프라 최신성 | `last_infra_state_at` | Y | stale 판단 |

### 응답 예시

```json
{
  "summary": {
    "total": 3,
    "danger": 1,
    "warning": 1,
    "safe": 1,
    "delayed": 0
  },
  "factories": [
    {
      "factory_id": "factory-a",
      "display_status": "위험",
      "risk_score": 72.4,
      "risk_level": "danger",
      "top_causes": ["fall_score", "temperature_celsius_avg"],
      "node_ready": 3,
      "node_total": 3,
      "pipeline_status": "normal",
      "updated_at": "2026-05-14T12:00:20Z",
      "last_factory_state_at": "2026-05-14T12:00:06Z",
      "last_infra_state_at": "2026-05-14T12:00:20Z"
    }
  ]
}
```

### 렌더링 로직

상태 수 집계:

```text
danger = count(risk.level == "danger")
warning = count(risk.level == "warning")
safe = count(risk.level == "safe")
delayed = count(pipeline_status.status != "normal")
```

정렬:

```text
danger first
warning second
safe last
within same level: risk.score desc
pipeline warning/critical should be highlighted
```

빈 상태:

| 조건 | 표시 |
| --- | --- |
| factory item 없음 | `등록된 공장이 없습니다` |
| `risk` 없음 | Risk `미계산` |
| `pipeline_status.status` 없음 | Pipeline `확인 필요` |
| `updated_at` 오래됨 | `데이터 지연` badge |

## 2. Factory Detail - Overview

### 화면 목적

선택한 공장의 현재 위험 상태, 원인, 환경, 인프라를 한 화면에 요약한다.

### 화면 wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a                                  위험   Risk 72.4  │
│ 마지막 갱신 6초 전 | Pipeline normal | 노드 3/3 Ready          │
├──────────────────────────────────────────────────────────────┤
│ 주요 원인                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ 넘어짐 score │ │ 온도 상승     │ │ 굽힘 score   │          │
│ │ 0.67         │ │ 38.2°C       │ │ 0.20         │          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
├──────────────────────────────────────────────────────────────┤
│ 현재 환경                                                     │
│ 온도 38.2°C   습도 64%   기압 1011.8hPa                      │
│ 화재 0.00     넘어짐 0.67   굽힘 0.20   소음 impact           │
├──────────────────────────────────────────────────────────────┤
│ 현재 인프라                                                   │
│ Node Ready 3/3   Workload Running 3/3                         │
│ BME280 정상   Camera 정상   Microphone 정상                   │
└──────────────────────────────────────────────────────────────┘
```

### API

```text
GET /factories/{factory_id}
```

### Backend 조회

```text
GetItem
pk = FACTORY#{factory_id}
sk = LATEST
```

### 필요한 DynamoDB 필드

| 화면 영역 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| 헤더 상태 | `dashboard.display_status` | Y | 큰 상태 label |
| Risk Score | `risk.score` | Y | 큰 숫자 |
| Risk Level | `risk.level` | Y | 색상 결정 |
| 마지막 갱신 | `updated_at` | Y | relative time |
| Pipeline | `pipeline_status.status` | Y | status badge |
| 노드 Ready | `infra_state.node_summary.ready`, `infra_state.node_summary.total` | Y | `3/3 Ready` |
| 주요 원인 카드 | `risk.top_causes[]` | Y | 원인명, value, contribution |
| 온도 | `factory_state.sensor.temperature_celsius_avg` | Y | `38.2°C` |
| 습도 | `factory_state.sensor.humidity_percent_avg` | Y | `64%` |
| 기압 | `factory_state.sensor.pressure_hpa_avg` | Y | `1011.8hPa` |
| 화재 score | `factory_state.ai_result.fire_score` | Y | `0.00` |
| 넘어짐 score | `factory_state.ai_result.fall_score` | Y | `0.67` |
| 굽힘 score | `factory_state.ai_result.bend_score` | Y | `0.20` |
| 이상소음 | `factory_state.ai_result.abnormal_sound` | N | `"none"` 또는 `acoustic_detection.event_type` 대표 라벨 |
| Workload 요약 | `infra_state.workload_summary.running`, `infra_state.workload_summary.total` | Y | `3/3 Running` |
| 장치 요약 | `infra_state.device_summary.*_available` | Y | 정상/확인 필요 |

### 응답 예시

```json
{
  "factory_id": "factory-a",
  "display_status": "위험",
  "risk": {
    "score": 72.4,
    "level": "danger",
    "top_causes": [
      {
        "name": "fall_score",
        "value": 0.67,
        "contribution": 23.45
      }
    ]
  },
  "current_environment": {
    "temperature_celsius_avg": 38.2,
    "humidity_percent_avg": 64.0,
    "pressure_hpa_avg": 1011.8,
    "fire_score": 0.0,
    "fall_score": 0.67,
    "bend_score": 0.2,
    "abnormal_sound": "none"
  },
  "current_infra": {
    "node_ready": 3,
    "node_total": 3,
    "workload_running": 3,
    "workload_total": 3,
    "bme280_available": true,
    "camera_available": true,
    "microphone_available": true,
    "pipeline_status": "normal"
  },
  "updated_at": "2026-05-14T12:00:20Z"
}
```

### 렌더링 로직

상태 색상:

| 값 | 표시 |
| --- | --- |
| `risk.level == "safe"` | 안전 |
| `risk.level == "warning"` | 주의 |
| `risk.level == "danger"` | 위험 |

장치 표시:

```text
true  -> 정상
false -> 확인 필요
null  -> 미수신
```

## 3. Factory Detail - Environment

### 화면 목적

Risk Score, 센서 값, AI score의 최근 추세를 보여준다.

### 화면 wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a > Environment                  1h  2h  24h          │
├──────────────────────────────────────────────────────────────┤
│ Risk Score                                                    │
│ 80 ┤                         ╭─────╮                         │
│ 60 ┤                ╭────────╯     ╰──                       │
│ 40 ┤        ╭───────╯                                        │
│ 20 ┤────────╯                                                │
│    └──────────────────────────────────────                    │
├──────────────────────────────────────────────────────────────┤
│ 온도 / 습도 / 기압                                             │
│ ┌──────────────────────────┐ ┌──────────────────────────┐     │
│ │ Temperature              │ │ Humidity                 │     │
│ │ 38.2°C                   │ │ 64%                      │     │
│ │ line chart               │ │ line chart               │     │
│ └──────────────────────────┘ └──────────────────────────┘     │
│ ┌──────────────────────────┐                                  │
│ │ Pressure                 │                                  │
│ │ 1011.8hPa                │                                  │
│ │ line chart               │                                  │
│ └──────────────────────────┘                                  │
├──────────────────────────────────────────────────────────────┤
│ AI Score                                                       │
│ Fire 0.00   Fall 0.67   Bend 0.20                              │
│ multi-line chart                                               │
└──────────────────────────────────────────────────────────────┘
```

### API

```text
GET /factories/{factory_id}/history?window=1h|6h|12h|24h
```

지원 window:

```text
1h
6h
12h
24h
```

MVP 기본 window:

```text
1h
```

### Backend 조회

1h:

```text
Query
pk = FACTORY#{factory_id}
sk BETWEEN HISTORY#STATE#{from} AND HISTORY#STATE#{to}
```

6h/12h/24h:

```text
Query
pk = FACTORY#{factory_id}
sk BETWEEN GRAPH#5M#{from} AND GRAPH#5M#{to}
```

표시 단위:

```text
6h:  5분 bucket 그대로 사용, 최대 72 points
12h: 5분 bucket 2개를 10분 단위로 재집계, 최대 72 points
24h: 5분 bucket 4개를 20분 단위로 재집계, 최대 72 points
```

### HISTORY#STATE 필드

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| x축 | `timestamp` | Y | chart timestamp |
| Risk Score | `risk_score` | Y | line y value |
| Risk Level | `risk_level` | Y | threshold background 또는 point color |
| Top causes | `top_cause_names[]` | N | tooltip |
| bucket | `bucket_seconds` | Y | sampling note |

### GRAPH#5M Risk 필드 (6h/12h/24h)

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| x축 | `bucket_start` 또는 `timestamp` | Y | chart timestamp |
| 시간 구간 | `bucket_start` + `bucket_end` | Y | tooltip |
| 평균 안전 점수 | `risk_score_avg` | Y | 굵은 실선 |
| 최대 안전 점수 | `risk_score_max` | Y | 얇은 점선 |
| 변동 폭 | `risk_score_avg` ~ `risk_score_max` | Y | 연한 음영 |
| 샘플 수 | `sample_count` | Y | tooltip |
| 임계값 | 85, 50 | Y | 수평 점선 |

### HISTORY#STATE 필드

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| x축 | `timestamp` | Y | chart timestamp |
| 온도 | `temperature_celsius_avg` | Y | line y value |
| 습도 | `humidity_percent_avg` | Y | line y value |
| 기압 | `pressure_hpa_avg` | Y | line y value |
| 화재 score | `fire_score` | Y | AI line |
| 넘어짐 score | `fall_score` | Y | AI line |
| 굽힘 score | `bend_score` | Y | AI line |
| bucket | `bucket_seconds` | Y | sampling note |

### 응답 예시

```json
{
  "factory_id": "factory-a",
  "window": "1h",
  "bucket_seconds": 30,
  "risk_points": [
    {
      "timestamp": "2026-05-14T12:00:00Z",
      "risk_score": 64.1,
      "risk_level": "warning",
      "top_cause_names": ["temperature_celsius_avg"]
    },
    {
      "timestamp": "2026-05-14T12:00:30Z",
      "risk_score": 72.4,
      "risk_level": "danger",
      "top_cause_names": ["fall_score", "temperature_celsius_avg"]
    }
  ],
  "factory_points": [
    {
      "timestamp": "2026-05-14T12:00:30Z",
      "temperature_celsius_avg": 38.2,
      "humidity_percent_avg": 64.0,
      "pressure_hpa_avg": 1011.8,
      "fire_score": 0.0,
      "fall_score": 0.67,
      "bend_score": 0.2
    }
  ]
}
```

### 렌더링 로직

Risk chart:

```text
x = timestamp 또는 bucket_start
1h y = risk_score
6h/12h/24h avg line = risk_score_avg
6h/12h/24h max line = risk_score_max
6h/12h/24h band = risk_score_avg ~ risk_score_max
safe range: 100~85
warning range: 84~50
danger range: 49~0
tooltip: 시간 구간, 평균값, 최대값, 샘플 수
```

AI chart:

```text
fire_score, fall_score, bend_score are 0.0~1.0 lines
0.0~0.2 safe
0.3~0.7 warning
0.8~1.0 danger label range
```

빈 상태:

| 조건 | 표시 |
| --- | --- |
| history 없음 | `선택한 시간 범위에 데이터가 없습니다` |
| 일부 point 누락 | line gap 또는 muted point |
| field null | tooltip에 `미수신` |

## 4. Factory Detail - Infrastructure

### 화면 목적

노드, 워크로드, 장치, pipeline의 현재 상태와 최근 리소스 추세를 보여준다.

### 화면 wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a > Infrastructure              1h  2h  24h           │
├──────────────────────────────────────────────────────────────┤
│ 현재 노드 상태                                                 │
│ ┌─────────┬───────┬─────┬────────┬──────┐                    │
│ │ Node    │ Ready │ CPU │ Memory │ Disk │                    │
│ ├─────────┼───────┼─────┼────────┼──────┤                    │
│ │ master  │ Yes   │ 31% │ 55%    │ 42%  │                    │
│ │ worker1 │ Yes   │ 22% │ 48%    │ 39%  │                    │
│ │ worker2 │ Yes   │ 44% │ 63%    │ 45%  │                    │
│ └─────────┴───────┴─────┴────────┴──────┘                    │
├──────────────────────────────────────────────────────────────┤
│ 리소스 추세                                                    │
│ CPU usage chart                                                │
│ Memory usage chart                                             │
│ Disk usage chart                                               │
├──────────────────────────────────────────────────────────────┤
│ Workloads                                                      │
│ safe-edge-integrated-ai   Running   worker2   restart 0        │
│ bme280-sensor             Running   worker2   restart 0        │
│ safe-edge-audio           Running   worker2   restart 0        │
├──────────────────────────────────────────────────────────────┤
│ Devices                                                        │
│ BME280 정상   Camera 정상   Microphone 정상                    │
└──────────────────────────────────────────────────────────────┘
```

### API

```text
GET /factories/{factory_id}/infra
GET /factories/{factory_id}/infra-history?window=1h
```

`/infra`는 `GET /factories/{factory_id}` 응답의 `current_infra`로 대체해도 된다.

### Backend 조회

현재 상태:

```text
GetItem
pk = FACTORY#{factory_id}
sk = LATEST
projection = infra_state, pipeline_status, updated_at, last_infra_state_at
```

History:

```text
Query
pk = FACTORY#{factory_id}
sk BETWEEN HISTORY#STATE#{from} AND HISTORY#STATE#{to}
```

### 현재 노드 표 필드

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| node id | `infra_state.nodes[].node_id` | Y | table row |
| Ready | `infra_state.nodes[].ready` | Y | Yes/No badge |
| CPU | `infra_state.nodes[].cpu_usage_percent` | Y | percent |
| Memory | `infra_state.nodes[].memory_usage_percent` | Y | percent |
| Disk | `infra_state.nodes[].disk_usage_percent` | Y | percent |

### Workload 필드

MVP 저장 구조는 `workload_summary`를 필수로 둔다. 상세 workload list가 있으면 표시한다.

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| total | `infra_state.workload_summary.total` | Y | count |
| running | `infra_state.workload_summary.running` | Y | count |
| unhealthy | `infra_state.workload_summary.unhealthy` | Y | count |
| restart total | `infra_state.workload_summary.restart_count_total` | Y | count |
| workload name | `infra_state.workloads[].name` | N | table row |
| status | `infra_state.workloads[].status` | N | badge |
| node | `infra_state.workloads[].node_id` | N | placement |
| restart count | `infra_state.workloads[].restart_count` | N | count |

### Device 필드

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| BME280 | `infra_state.device_summary.bme280_available` | Y | 정상/확인 필요 |
| Camera | `infra_state.device_summary.camera_available` | Y | 정상/확인 필요 |
| Microphone | `infra_state.device_summary.microphone_available` | Y | 정상/확인 필요 |

### Pipeline 필드

| 화면 요소 | 필드 경로 | 필수 | 렌더링 |
| --- | --- | --- | --- |
| status | `pipeline_status.status` | Y | normal/warning/critical |
| infra age | `pipeline_status.latest_infra_state_age_seconds` | Y | seconds |
| s3 raw age | `pipeline_status.latest_s3_raw_age_seconds` | Y | seconds |

### HISTORY#STATE 필드

| 그래프 | 필드 경로 | 필수 | 비고 |
| --- | --- | --- | --- |
| Ready node count | `node_summary.ready` | Y | 20초 point |
| Not ready count | `node_summary.not_ready` | Y | 20초 point |
| Node CPU | `nodes[].cpu_usage_percent` | Y | node별 series |
| Node Memory | `nodes[].memory_usage_percent` | Y | node별 series |
| Node Disk | `nodes[].disk_usage_percent` | Y | node별 series |
| Unhealthy workloads | `workload_summary.unhealthy` | Y | count |

### 응답 예시

```json
{
  "factory_id": "factory-a",
  "current": {
    "pipeline_status": "normal",
    "node_summary": {
      "total": 3,
      "ready": 3,
      "not_ready": 0
    },
    "nodes": [
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
  "history_points": [
    {
      "timestamp": "2026-05-14T12:00:20Z",
      "node_summary": {
        "total": 3,
        "ready": 3,
        "not_ready": 0
      },
      "nodes": [
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
      }
    }
  ]
}
```

### 렌더링 로직

Node table:

```text
ready true  -> Yes
ready false -> No, row warning
cpu/memory/disk >= 80 -> warning color
cpu/memory/disk >= 90 -> danger color
```

Pipeline:

```text
normal   -> 정상
warning  -> 주의
critical -> 위험
```

빈 상태:

| 조건 | 표시 |
| --- | --- |
| nodes empty | `노드 상태 미수신` |
| device false | `확인 필요` |
| history empty | `선택한 시간 범위에 인프라 이력이 없습니다` |

## 5. Factory Detail - Timeline

### 화면 목적

Risk, 환경, 인프라, pipeline 변화 이벤트를 시간순으로 보여준다.

### 화면 wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a > Timeline                                          │
├──────────────────────────────────────────────────────────────┤
│ 12:00:30  Risk 주의 -> 위험                                   │
│          원인: fall_score 0.67, temperature 38.2°C             │
│                                                              │
│ 11:58:20  Microphone unavailable                              │
│                                                              │
│ 11:56:00  worker2 CPU 80% 초과                                │
│                                                              │
│ 11:52:30  Pipeline normal                                     │
└──────────────────────────────────────────────────────────────┘
```

### API

```text
GET /factories/{factory_id}/timeline?window=1h
```

### Backend 조회

MVP 기본:

```text
Query HISTORY#STATE
Query HISTORY#STATE
Query HISTORY#STATE
merge by timestamp
derive changes in API layer
```

후속 최적화:

```text
HISTORY#EVENT#{timestamp}
```

MVP에서는 별도 event item 없이 history point를 비교해 timeline을 만든다.

### 이벤트 생성 로직

| 이벤트 | 비교 필드 | 생성 조건 |
| --- | --- | --- |
| Risk level 변화 | `HISTORY#STATE.risk_level` | 이전 point와 값이 다름 |
| Risk 급등 | `HISTORY#STATE.risk_score` | 이전 point 대비 +10 이상 |
| 주요 원인 변화 | `HISTORY#STATE.top_cause_names` | 목록이 바뀜 |
| 온도 상승 | `HISTORY#STATE.temperature_celsius_avg` | 이전 point 대비 +5 이상 또는 threshold 초과 |
| AI score 상승 | `fire_score`, `fall_score`, `bend_score` | 이전 point 대비 +0.3 이상 |
| Pipeline 변화 | `HISTORY#STATE.pipeline_status.status` | 이전 point와 값이 다름 |
| Node Ready 변화 | `HISTORY#STATE.node_summary.ready/not_ready` | 이전 point와 값이 다름 |
| Workload 이상 | `HISTORY#STATE.workload_summary.unhealthy` | 0에서 1 이상으로 증가 |
| Device 이상 | `device_summary.*_available` | true에서 false로 변경 |

### 응답 예시

```json
{
  "factory_id": "factory-a",
  "window": "1h",
  "events": [
    {
      "timestamp": "2026-05-14T12:00:30Z",
      "type": "risk_level_changed",
      "severity": "danger",
      "title": "Risk 주의 -> 위험",
      "description": "fall_score 0.67, temperature 38.2°C",
      "source": "HISTORY#STATE"
    },
    {
      "timestamp": "2026-05-14T11:58:20Z",
      "type": "device_unavailable",
      "severity": "warning",
      "title": "Microphone unavailable",
      "description": "microphone_available=false",
      "source": "HISTORY#STATE"
    }
  ]
}
```

### 렌더링 로직

Severity:

| 값 | 표시 |
| --- | --- |
| `info` | 일반 |
| `warning` | 주의 |
| `danger` | 위험 |

빈 상태:

```text
선택한 시간 범위에 상태 변화가 없습니다.
```

## 화면별 구현 체크리스트

### Fleet Overview

- [ ] `GET /factories` API 구현
- [ ] `DynamoDB LATEST` 목록 조회
- [ ] `risk.level` 기준 summary count 계산
- [ ] `risk.score` 기준 카드 정렬
- [ ] `pipeline_status.status` abnormal 표시
- [ ] `updated_at` relative time 계산

### Factory Overview

- [ ] `GET /factories/{factory_id}` API 구현
- [ ] `DynamoDB LATEST` 단건 조회
- [ ] Risk, 환경, 인프라 current summary 변환
- [ ] `top_causes` 최대 3개 표시
- [ ] null/미수신 필드 처리

### Environment

- [ ] `GET /risk-history` API 구현
- [ ] `GET /factory-history` API 구현
- [ ] `HISTORY#STATE` range query
- [ ] `HISTORY#STATE` range query
- [ ] 1h/2h/24h window 처리
- [ ] Risk threshold band 렌더링

### Infrastructure

- [ ] `GET /infra-history` API 구현
- [ ] `DynamoDB LATEST.infra_state` 조회
- [ ] `HISTORY#STATE` range query
- [ ] node별 CPU/memory/disk series 생성
- [ ] node/workload/device empty state 처리

### Timeline

- [ ] `GET /timeline` API 구현
- [ ] RISK/FACTORY/INFRA history merge
- [ ] 이전 point와 비교해 이벤트 생성
- [ ] severity 계산
- [ ] 이벤트 없을 때 empty state 표시

## S3 조회 사용 기준

기본 화면은 S3를 직접 조회하지 않는다.

S3 조회가 필요한 경우:

| 경우 | 조회 대상 |
| --- | --- |
| 특정 timestamp의 계산 결과 상세 | `S3 processed/{factory_id}/risk_score/*` |
| 원본 메시지 확인 | `S3 raw/{factory_id}/{source_type}/*` |
| 장기 리포트 | `S3 processed/*` |
| DynamoDB HISTORY TTL 이후 이력 조회 | `S3 processed/{factory_id}/state_snapshot/*` |
| 재처리 검증 | `S3 raw/*`와 `S3 processed/*` 비교 |

## 공통 시간 처리

API 입력:

```text
window=1h
window=2h
window=24h
from=2026-05-14T11:00:00Z
to=2026-05-14T12:00:00Z
```

우선순위:

```text
from/to가 있으면 from/to 사용
없으면 window 기준으로 now - window 계산
```

시간대:

```text
저장/쿼리: UTC
화면 표시: 사용자 locale 또는 KST
```

## 공통 결측 처리

| 필드 상태 | 처리 |
| --- | --- |
| 필드 없음 | `미수신` |
| 값 `null` | `미수신` |
| boolean false | `확인 필요` |
| timestamp stale | `데이터 지연` |
| risk 없음 | `미계산` |
| history 없음 | 빈 그래프와 안내문 |

stale 기본 기준:

| 항목 | 기준 |
| --- | --- |
| `factory_state` | 최신값 age > 10초 |
| `infra_state` | 최신값 age > 40초 warning, > 60초 critical |
| `pipeline_status` | 저장된 `pipeline_status.status` 우선 |
