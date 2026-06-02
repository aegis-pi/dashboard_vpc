ID:        0028
제목:      dashboard-staleness-threshold-alignment
상태:      accepted
결정일:    2026-06-02
영향 범위: M4/M6, apps/data-processor, apps/dashboard-web, Dashboard stale 표시

## 기존 계획

- Dashboard `데이터 지연` 배지는 `factory_state` age > 10초 또는 `infra_state` age > 40초에서 표시됐다.
- `infra_state` stale critical 기준은 60초였다.
- `pipeline_status` 실제 계산은 `warning > 40초`, `critical > 60초`였고, 일부 문서는 60/120초를 가리켜 기준이 섞여 있었다.
- Dashboard Web의 stale 배지는 자체 10초 ticker로 화면 refresh/WS 갱신과 별개로 age 표시를 갱신할 수 있었다.

## 변경된 실제 기준

- Dashboard `데이터 지연` 배지는 `last_infra_state_at` 기준 age > 60초일 때만 표시한다.
- 배지 tone은 age > 60초 warning, age > 120초 critical이다.
- `pipeline_status`도 `normal <= 60초`, `warning > 60초`, `critical > 120초`로 통일한다.
- Dashboard Web stale 배지는 자체 ticker를 갖지 않고, refresh/WS로 받은 현재 화면 snapshot의 수신 시각 기준으로만 다시 계산한다.

## 변경 이유

- `infra_state` 수집 주기는 20초이므로 60초는 3회 이상 누락을 의미해 운영 화면의 지연 표시 기준으로 더 적절하다.
- 사용자가 refresh를 끈 상태에서 배지 age만 계속 증가하면 그래프/상태 snapshot과 배지의 시간 모델이 달라져 혼란을 만든다.
- `데이터 지연` 배지와 `pipeline_status`가 같은 화면에 함께 노출되므로 40/60과 60/120 기준을 분리하면 운영자가 상태를 다르게 해석할 수 있다.

## 영향

- 60초 이하의 일시적 infra 수집 지연은 `데이터 지연` 배지와 `pipeline_status.warning`으로 표시되지 않는다.
- 120초 초과부터 critical로 전환되어 장기 지연만 위험 상태로 강조한다.
- Backend API는 `last_infra_state_at` 원본 timestamp를 계속 내려주며, 이번 변경에서 read-time stale flag를 추가하지 않는다.

## 업데이트 필요한 문서

- `docs/specs/iot_data_format.md`
- `docs/specs/monitoring_dashboard/02_api_spec.md`
- `docs/specs/monitoring_dashboard/05_screen_data_mapping.md`
- `apps/data-processor/README.md`

## 검증

- `apps/dashboard-web`: stale 배지 경계값 테스트 추가.
- `apps/data-processor`: `pipeline_status` 60/120초 경계값 테스트 갱신.
