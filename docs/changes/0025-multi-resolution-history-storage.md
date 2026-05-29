# 0025 — Multi-resolution History Storage (history_raw TTL 단축 + history_bucket 집계 테이블)

상태: accepted
결정일: 2026-05-28
구현 완료: 2026-05-29
영향 범위: Phase 1 data pipeline, DynamoDB HISTORY, Lambda data processor, Lambda Aggregator(신규), Dashboard Backend API, Dashboard Frontend Chart

## 기존 계획

- `AEGIS-DynamoDB-FactoryStatus` 단일 테이블에 `HISTORY#STATE#*` sk prefix로 모든 시계열 이력 저장
- TTL: 48시간 (`HISTORY_TTL_HOURS=48`)
- Dashboard `/history?window=` 파라미터(1h/6h/24h)에 관계없이 동일 `HISTORY#STATE#` prefix 조회
- 프론트엔드는 LineChart 단일 추이 선 그래프

## 변경된 실제 기준 (2026-05-29 구현 완료)

### 스토리지 계층화

| 계층 | sk prefix / 구조 | TTL | 역할 |
| --- | --- | --- | --- |
| history_raw | 기존 `HISTORY#STATE#*` (변경 없음) | **2h** (기존 48h → 단축) | 1h 실시간 정밀 차트 전용 (쿼리 window 1h의 2배 버퍼) |
| history_bucket | 기존 테이블 내 `GRAPH#5M#*` prefix (`example_data.md` 기준) | **48h** | 5분 단위 avg/min 집계. 6h/12h/24h 그래프 |

history_bucket 아이템 구조 예시 (`example_data.md` 기준 `GRAPH#5M#` prefix 사용):

```json
{
  "pk": "FACTORY#{factory_id}",
  "sk": "GRAPH#5M#{bucket_start_iso}",
  "factory_id": "factory-a",
  "bucket_start": "2026-05-28T10:00:00Z",
  "bucket_end": "2026-05-28T10:04:59.999Z",
  "risk_score_avg": 42.3,
  "risk_score_min": 28.5,
  "temperature_avg": 36.8,
  "temperature_max": 39.2,
  "sample_count": 100,
  "ttl": 1760000000
}
```

**Risk Score 방향**: 100 = 최안전, 0 = 최위험. 낮은 값이 이상 징후 기준이다.

| 구간 | level |
| --- | --- |
| 85 ~ 100 | 안전 |
| 50 ~ 84 | 주의 |
| 0 ~ 49 | 위험 |

### Lambda Aggregator (2026-05-29 배포 완료)

- 이름: `AEGIS-Lambda-GraphAggregator5m`
- 트리거: EventBridge Scheduler — `rate(5 minutes)`
- 동작: 직전 완료된 5분 window (`floor(now, 5min) - 5min`) 기준으로 HISTORY#STATE 조회 → avg/min 계산 → GRAPH#5M PutItem
- 비용: 8,640 invocations/월 (Lambda 무료 티어 내), GRAPH#5M 추가 WCU ~$0.03/월

공장별 GRAPH#5M 현황 (2026-05-29):
- factory-b, factory-c: 데이터 적재 중
- factory-a: Edge Agent 비활성으로 GRAPH#5M 데이터 없을 수 있음

**Edge case**: Aggregator는 완료된 버킷만 처리한다. 현재 진행 중인 마지막 5분 버킷은 다음 주기까지 GRAPH#5M에 없다.

### Dashboard Backend window 분기

```text
window=1h   → HISTORY#STATE# query (history_raw, TTL 2h, ~2,760 items/공장)
window=6h   → GRAPH#5M# query   (history_bucket, 72 items/공장)
window=12h  → GRAPH#5M# query   (history_bucket, 144 items/공장)
window=24h  → GRAPH#5M# query   (history_bucket, 288 items/공장)
```

### Dashboard Frontend ComposedChart

- 기존 LineChart → Recharts ComposedChart로 교체
- 평균 추이: 시안색 Area 그래프 (`risk_score_avg`)
- 경고 마커: `risk_score_min <= 84` (주의 이하 구간 진입)인 버킷 위치에 붉은 Scatter Overlay 표시
  - `risk_score_min <= 49` → 위험 (danger 색상)
  - `50 <= risk_score_min <= 84` → 주의 (warning 색상)

## 변경 이유

2026-05-28 production incident: `AEGIS-DynamoDB-FactoryStatus` HISTORY 테이블에
`HISTORY_TTL_HOURS=48h` × factory_state 3초 주기 × 3공장 기준으로 약 116,000개 이상의
아이템이 상주했다.

`/history?window=24h` × 3공장 동시 요청 → 50+ DynamoDB Query 페이지 호출 →
asyncio semaphore(한도 10) 포화 → cascade 504 Gateway Timeout 발생.

임시방편으로 `max_items=500 cap + ScanIndexForward=False`를 적용했으나,
500건 초과 구간의 스파이크(위험 수치 급등 이벤트)가 차트에서 유실되는 문제가 잔존한다.

자세한 사고 기록: `docs/ops/04_troubleshooting.md` #42

## Steady-state 아이템 수 추정 (3공장 기준)

| 계층 | 계산 | 아이템 수 |
| --- | --- | ---: |
| history_raw | factory_state(3초) + infra_state(20초) × 2h × 3공장 | ~7,200 |
| history_bucket (24h 기준) | 12 버킷/h × 24h × 3공장 | ~864 |
| **합계** | | **~8,064** |

현재 116,000+ 대비 **93% 감소**, 504 재발 없음.

## 영향

- Lambda data processor: `HISTORY_TTL_HOURS` 환경변수 48 → 2 예정 (Terraform data-pipeline 재배포 필요, 미완)
- Lambda GraphAggregator5m: 신규 Python Lambda (`apps/graph-metrics-aggregator/`) + EventBridge Scheduler (Terraform data-pipeline) — **2026-05-29 배포 완료**
- DynamoDB: 기존 `AEGIS-DynamoDB-FactoryStatus` 테이블 내 `GRAPH#5M#` prefix 신설 — **2026-05-29 데이터 적재 확인**
- Dashboard Backend `services/ddb.py`: `get_factory_history()` window 분기 — **2026-05-29 구현 완료**
  - `window=1h` → `HISTORY#STATE#` + `_extract()` + max_items=500 cap 유지
  - else → `GRAPH#5M#` + `_extract_graph_5m()`
- Dashboard Backend `tests/`: GRAPH#5M 테스트 8개 추가 — **52 passed**
- Dashboard Frontend `api/types.ts`: `HistoryItem`에 `is_bucket`, `risk_score_avg`, `risk_score_min`, infra aggregate 필드 추가 — **2026-05-29 완료**
- Dashboard Frontend `components/Chart.tsx`: `RiskScoreChart` ComposedChart + Area(avg) + Scatter 마커, `NodeResourceChart` aggregate fallback — **2026-05-29 완료**

## 업데이트 필요한 문서

- `docs/specs/data_storage_pipeline.md` — HISTORY 섹션 TTL 및 계층화 기준 갱신
- `docs/specs/monitoring_dashboard/02_api_spec.md` — history endpoint window 분기 명세 추가
- `docs/ops/04_troubleshooting.md` — #40 cascade 504 사고 기록
- `docs/ops/22_data_dashboard_vpc_runbook.md` — 알려진 이슈 및 현재 임시방편 기록
- `docs/ops/15_aws_cost_baseline.md` — Lambda Aggregator + history_bucket DynamoDB 비용 추가 (구현 완료 후)
- `docs/changes/README.md` — 0025 항목 추가

## 검증 기준 (구현 완료 후)

```text
1. history_raw steady-state item count: 3공장 합계 < 5,000
2. /history?window=24h × 3공장 동시 요청: semaphore 포화 없음, 응답 < 2초
3. history_bucket: 24h 기준 factory당 288개 항목, max_items cap 제거 가능
4. 스파이크 보존: risk_score_min ≤ 84 이벤트가 history_bucket에 저장되고 프론트엔드 마커로 표시
   - risk_score_min ≤ 49: 위험 마커 (danger)
   - 50 ≤ risk_score_min ≤ 84: 주의 마커 (warning)
5. 마지막 5분 버킷 미완성: 24h 차트 우측 끝에 빈 포인트 없이 처리됨
```
