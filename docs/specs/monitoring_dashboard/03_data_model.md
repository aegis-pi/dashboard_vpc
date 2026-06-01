# Monitoring Dashboard Data Model

상태: source of truth
기준일: 2026-06-01
수정 이력:
  - 2026-06-01  Cloud infra read model(`pk=CLOUD#infra`) 추가. 데이터 계약은 `docs/planning/29` / ADR 0027, 화면 매핑은 `06_cloud_infra_view.md`.
  - 2026-06-01  GRAPH#5M 환경 센서 mean/min/max와 AI mean/max 화면 모델 반영.
  - 2026-05-29  GRAPH#5M 집계 모델과 안전 점수 avg/min/max 필드 반영.
  - 2026-05-15  ADR 0007/0009 반영. 후속 모델 섹션을 data_storage_pipeline.md 인용 + 화면-모델 매핑으로 갱신.
  - 2026-04-28  초안

## 목적

현재 `factory-a` Grafana dashboard가 읽는 InfluxDB measurement와 field를 정의한다.

## InfluxDB

Database:

```text
safe_edge_db
```

Retention:

```text
1d
```

## Measurement

### environment_data

용도:
- BME280 환경 센서 데이터

Fields:

```text
temperature
humidity
pressure
```

Grafana 표시:

```text
Time series
```

### ai_detection

용도:
- 영상 기반 AI 감지 결과

Fields:

```text
fire_detected
fallen_detected
bending_detected
```

값:

```text
0 또는 1
```

Grafana 표시:

```text
최근 N개 평균 -> 안전 / 주의 / 위험 레이블
```

### acoustic_detection

용도:
- 소리 기반 이상 감지 결과

Fields:

```text
is_danger
```

값:

```text
0 또는 1
```

Grafana 표시:

```text
최근 N개 평균 -> 안전 / 주의 / 이상 소음
```

## 상태 매핑

```text
0.0-0.2: 안전
0.3-0.7: 주의
0.8-1.0: 위험 레이블
```

## Prometheus

Prometheus는 Node Exporter Full dashboard `1860`에서 사용한다.

용도:

```text
CPU
Memory
Disk
Network
Node up/down
```

## 후속 모델 (1번 Data/Dashboard VPC)

AWS Hub/Risk Twin 단계의 데이터 모델은 **`docs/specs/data_storage_pipeline.md`를 source of truth로 인용**한다. 본 문서는 화면-모델 매핑만 정리한다.

### 1차 저장소

| 저장소 | 사용처 |
| --- | --- |
| DynamoDB `AEGIS-DynamoDB-FactoryStatus` LATEST | 공장 카드, 현재 상태 화면 |
| DynamoDB `AEGIS-DynamoDB-FactoryStatus` HISTORY | 최근 1~2시간 그래프 |
| DynamoDB `AEGIS-DynamoDB-FactoryStatus` GRAPH#5M | 6h/12h/24h 집계 그래프 |
| DynamoDB `AEGIS-DynamoDB-FactoryStatus` `CLOUD#infra` | Cloud infra 상태 화면 (LATEST / HISTORY#FAST / HISTORY#SLOW) |
| S3 `aegis-bucket-data/processed/...` | 장기 이력 / 감사 / drill-down |
| S3 `aegis-bucket-data/processed/cloud_infra/...` | Cloud infra full snapshot (drill-down) |
| S3 `aegis-bucket-data/raw/...` | 원본 보존 (Dashboard 직접 조회 제한) |

### 화면 ↔ 모델 매핑

| 화면 영역 | 사용 모델 | DDB key 또는 S3 prefix |
| --- | --- | --- |
| 공장 카드 (SAFE/WARNING/DANGER) | `LATEST.risk` + `LATEST.dashboard` | `pk=FACTORY#{factory_id}, sk=LATEST` |
| 환경 상태 카드 | `LATEST.factory_state.sensor` + `.ai_result` | 위와 동일 |
| 노드 상태 | `LATEST.infra_state.nodes[]` | 위와 동일 |
| 장치 상태 (BME/Camera/Mic) | `LATEST.infra_state.device_summary` | 위와 동일 |
| 워크로드 상태 | `LATEST.infra_state.workload_summary` | 위와 동일 |
| 파이프라인 상태 | `LATEST.pipeline_status` | 위와 동일 |
| Risk 그래프 (1h) | `HISTORY#STATE#*`의 `risk` | `sk begins_with HISTORY#STATE#` |
| Risk 그래프 (6h/12h/24h) | `GRAPH#5M#*`의 `risk.score.mean/min/max` | `sk begins_with GRAPH#5M#` |
| 환경 그래프 (1h) | `HISTORY#STATE#*`의 `factory_state` | `sk begins_with HISTORY#STATE#` |
| 환경 그래프 (6h/12h/24h) | `GRAPH#5M#*`의 `sensor.*.mean/min/max` | `sk begins_with GRAPH#5M#` |
| AI 탐지 그래프 (6h/12h/24h) | `GRAPH#5M#*`의 `ai_detection.by_type.*.mean/max` | `sk begins_with GRAPH#5M#` |
| 노드 그래프 (1h) | `HISTORY#STATE#*`의 `infra_state` | `sk begins_with HISTORY#STATE#` |
| Cloud infra 상태 카드 | `CLOUD#infra` LATEST의 `fast`/`slow` + backend 계산 staleness | `pk=CLOUD#infra, sk=LATEST` |
| Cloud infra 추이 | `CLOUD#infra` HISTORY reduced | `pk=CLOUD#infra, sk begins_with HISTORY#FAST#\|HISTORY#SLOW#` |
| 장기 이력 / 감사 | S3 processed | `processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json` |

### Risk Twin 상태 매핑 (LATEST.risk.level)

| level | 표시 | 기준 |
| --- | --- | --- |
| `safe` | 안전 | (Lambda data processor가 계산, 임계값은 `risk-v0.1.0` 기준) |
| `warning` | 주의 | 위와 동일 |
| `danger` | 위험 | 위와 동일 |

### 명시적 비채택

- Dashboard는 InfluxDB / Prometheus / EKS API / ArgoCD API에 직접 붙지 않는다 (`docs/planning/07_dashboard_vpc_extension_plan.md` 결정 유지)
- Cloud infra 화면도 이 경계를 지킨다. Backend는 EKS/ArgoCD를 직접 조회하지 않고 collector가 써둔 `CLOUD#infra` read model만 읽는다 (EKS/ArgoCD 접근은 collector 책임, ADR 0027)
- Replay/Near-miss/AI Worker 모델은 M7+ 후속
