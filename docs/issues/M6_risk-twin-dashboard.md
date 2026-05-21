# M6. Risk Twin + 관제 화면

수정 이력:
- 2026-05-20 v0.2  Risk Score 기준을 안전점수 방식(100=가장 안전, 0=가장 위험)으로 정정.

> **마일스톤 목표**: 수집된 데이터를 기반으로 Risk Score를 계산하고 본사 관제 담당자가 사용할 Dashboard VPC 기반 관제 화면을 완성한다.
> M2(Hub-Spoke 연결)와 M4(데이터 플레인) 완료 후 진행한다.  
> 이 마일스톤이 완료되면 공장 상태 변화 → Risk Score 변화 → 관제 화면 반영이 end-to-end로 동작한다.
> 외부 관리자 화면은 Grafana public 노출이 아니라 Route53/ALB/WAF/Auth 뒤의 Dashboard Web/API를 기본 방향으로 한다.

---

## 2026-05-13 멘토링 반영: 일일 운영 리포트 최소 포함

### 기존 초안

기존 M6 초안은 Risk Score Engine과 Dashboard Web/API를 구현해 공장별 안전/주의/위험 상태를 보여주는 데 집중했다. 최신 기준에서는 별도 Risk Score Engine 파드 대신 Lambda data processor 내부 Risk 계산 로직과 Dashboard Web/API를 구현한다.

```text
IoT Core
  -> Lambda data processor
  -> DynamoDB LATEST/HISTORY + S3 processed
  -> Dashboard Web/API
```

### 변경 이유

멘토링에서는 CI/CD와 ArgoCD가 필요한 이유를 더 명확히 설명해야 한다는 피드백이 있었다. 단순 대시보드 표시만으로는 이후 모델/설정 업데이트와 배포 파이프라인의 필요성이 약해질 수 있다.

### 보강 방향

MVP에는 완전 자동화된 고도화 리포트가 아니라, 하루 1회 운영 리포트 초안을 생성하는 최소 기능을 포함하는 방향을 검토한다.

```text
S3 raw / processed / latest
  + 사고 이미지 또는 이상 이벤트
  + 최근 Risk Score 변화
  -> LLM/VLM 기반 요약
  -> 일일 운영 리포트 초안
  -> 모델/설정 업데이트 후보
  -> 운영자 승인 후 GitOps 배포
```

MVP에서 제외하는 범위는 유지한다.

- 자동 모델 재학습
- 운영자 승인 없는 모델/설정 자동 교체
- 장기 이력 기반 고급 분석
- 복잡한 자연어 질의 시스템

즉, 일일 리포트는 자동 조치 시스템이 아니라 Edge AI 판단 결과를 다시 검토하고 모델/설정 업데이트 필요성을 발견하는 운영 피드백 루프다.

---

## Issue 1 - [Risk/Lambda] Lambda Risk 계산 로직 구현 (가중치 초기안)

### 🎯 목표 (What & Why)

IoT Core 메시지를 처리하는 Lambda data processor 안에 공장별 Risk Score(0~100)를 계산하고 상태(안전/주의/위험)를 판정하는 로직을 구현한다.
이 이슈에서는 초기 하드코딩 가중치와 임계시간을 기준으로 먼저 동작 가능한 계산 로직을 만든다.
설정 파일 연동과 세부 제어는 다음 이슈에서 확장한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Lambda data processor의 Risk 계산 로직 구현
- [ ] 가중치 초기안 하드코딩 적용
  - 온도 이상: `-15`
  - 습도 이상: `-10`
  - 센서 무수신: `-15`
  - 엣지 에이전트 이상: `-15`
  - 노드 이상: `-20`
  - 카메라 이상: `-10`
  - 마이크 이상: `-10`
  - 데이터 수집 파이프라인 이상: `-15`
- [ ] 위험도 구간 적용
  - 안전: `85~100`
  - 주의: `50~84`
  - 위험: `0~49`
- [ ] 이상 판정 임계시간 적용
  - 센서: 3분
  - 엣지 에이전트: 2분
  - 노드: 1분
  - 카메라: 3분
  - 마이크: 3분
  - 데이터 수집 파이프라인: 2분
- [ ] `event` 계열은 구조만 수용, 점수 반영은 후속 단계

### 🔍 Acceptance Criteria

- Lambda data processor 실행 및 CloudWatch Logs 정상 처리 확인
- 정상 입력 시 Risk Score 85~100 범위 출력
- 노드 이상 입력 시 Score `-20` 반영 확인
- 하드코딩된 초기 가중치/임계시간 기준으로 점수 계산 동작 확인
- 3개 공장 각각 독립적으로 Risk Score 계산 확인

---

## Issue 2 - [Risk/Config] `runtime-config.yaml` 전역 설정 적용 및 필드 제어 구현

### 🎯 목표 (What & Why)

M1에서 작성한 `runtime-config.yaml` 구조를 Lambda data processor의 Risk 계산 로직이 실제로 읽어 동작하도록 연결한다.
`display` / `risk_enabled` 필드 제어가 관제 화면 표시와 Risk 계산에 실제로 반영되어야 한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Lambda data processor에서 `runtime-config.yaml` 읽기 로직 구현
  - ConfigMap 또는 파일 마운트 방식
- [ ] `risk_enabled: false` 필드는 점수 계산에서 제외 동작 확인
- [ ] `display: false` 필드는 관제 화면에서 숨김 처리 동작 확인
- [ ] 공장별 override 구조 동작 확인 (현재는 전역 설정만 사용, override 구조만 검증)
- [ ] 설정 변경 시 재시작 없이 반영 가능한지 여부 결정 및 기록

### 🔍 Acceptance Criteria

- `runtime-config.yaml`에서 특정 필드 `risk_enabled: false` 설정 후 해당 필드 점수 미반영 확인
- 설정 파일 변경 반영 방식 문서화 완료

---

## Issue 3 - [Risk/Config] 온도/습도 이상 기준값 초안 적용

### 🎯 목표 (What & Why)

Risk Score 계산에서 온도/습도 이상 판정에 사용할 기준값 초안을 결정하고 적용한다.  
구체 수치는 실측 기반 보정 대상이므로, 초안을 적용 후 M7(통합 검증)에서 보정한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 온도 이상 기준값 초안 결정 및 적용
  - 정상 / 주의 / 위험 구간 수치 설정
  - 예: 정상 < 30°C, 주의 30~40°C, 위험 > 40°C (BME280 실측 범위 참고)
- [ ] 습도 이상 기준값 초안 결정 및 적용
  - 예: 정상 30~70%, 주의 70~80%, 위험 > 80% 또는 < 20%
- [ ] `runtime-config.yaml`에 기준값 반영
- [ ] 기준값을 `docs/ops/03_test_checklist.md`에 보정 대상으로 기록

### 🔍 Acceptance Criteria

- 온도/습도 초안 기준값이 `runtime-config.yaml`에 반영됨
- Lambda data processor에서 기준값 기반 이상 판정 동작 확인

---

## Issue 4 - [Risk/Twin] Risk Twin 출력 구조 구현

### 🎯 목표 (What & Why)

Lambda data processor의 공식 Risk Twin 출력 구조를 구현한다.
관제 화면과 이후 확장 서비스(LLM 보고서 등)가 이 출력을 기준으로 데이터를 읽는다.  
MVP 단계에서는 Risk Twin 결과를 DynamoDB LATEST/HISTORY와 S3 processed에 기록한다. Dashboard Web/API는 DynamoDB와 S3 processed를 read-only로 조회한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Risk Twin 출력 구조 구현
  ```json
  {
    "factory_id": "factory-a",
    "current_status": "warning",
    "risk_score": 55,
    "score_delta_10m": +12,
    "top_causes": [
      { "code": "node_not_ready", "label": "노드 이상", "weight": 20 },
      { "code": "temp_high", "label": "온도 이상", "weight": 15 },
      { "code": "pipeline_delay", "label": "파이프라인 지연", "weight": 15 }
    ],
    "event_timestamp": "2026-04-24T12:00:00Z",
    "processed_at": "2026-04-24T12:00:05Z"
  }
  ```
- [ ] Top 3 원인 우선순위 로직 구현 (가중치 기여도 기준, 최신성 보조)
- [ ] 원인 코드 사전 구현 (MVP 기준)
  - `temp_high`, `humidity_high`, `sensor_no_data`
  - `edge_agent_down`, `node_not_ready`, `camera_down`, `mic_down`
  - `pipeline_delay`, `pipeline_no_data`
- [ ] 출력 결과를 DynamoDB LATEST/HISTORY와 S3 processed에 기록
  - 예: `risk_score`, `risk_status`, `risk_cause_weight`, `risk_cause_rank`
- [ ] Dashboard Web/API에서 조회 가능한 구조로 정리

### 🔍 Acceptance Criteria

- Risk Twin 출력 JSON 구조 유효성 확인
- Top 3 원인이 가중치 기여도 순으로 정렬됨 확인
- `event_timestamp`와 `processed_at` 둘 다 기록됨 확인
- Risk Twin 결과가 DynamoDB LATEST/HISTORY에 반영됨 확인
- 3개 공장 각각 독립 출력 확인

---

## Issue 5 - [관제/Dashboard] 메인 대시보드 - 공장별 위험도 카드

### 🎯 목표 (What & Why)

관제 담당자가 가장 먼저 보는 상단 위험도 카드를 Dashboard Web에서 구현한다.
각 공장의 현재 상태, 변화 방향, 이상 시스템 개수를 한눈에 파악할 수 있어야 한다.  
이 패널은 DynamoDB LATEST의 Risk Twin 결과를 기준으로 구성한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Dashboard Web/API 생성 (본사 관제 메인)
- [ ] Route53 -> ALB -> WAF/Auth -> Dashboard 접근 경로 구성
- [ ] 공장별 위험도 카드 패널 구현 (3개 공장)
  - 공장명 (`factory-a`, `factory-b`, `factory-c`)
  - 현재 상태 (안전 🟢 / 주의 🟡 / 위험 🔴)
  - 최근 10분 변화 방향 (상승 ↑ / 유지 → / 하락 ↓)
  - 현재 이상 시스템 개수
- [ ] 상태별 색상 구분 적용 (안전: 녹색, 주의: 노랑, 위험: 빨강)
- [ ] 카드에 점수 직접 노출하지 않음 (상태 중심 표시)

### 🔍 Acceptance Criteria

- Dashboard에서 3개 공장 위험도 카드 확인
- 실제 Risk Score 변화 시 카드 상태 자동 갱신 확인
- 상태별 색상 구분 시각적으로 명확함

---

## Issue 6 - [관제/Dashboard] 메인 대시보드 - 센서 현황 + 이상 시스템 목록

### 🎯 목표 (What & Why)

관제 화면 중단의 센서 현황과 이상 시스템 목록 패널을 구현한다.  
온도/습도 추세와 현재 이상이 발생한 시스템을 빠르게 파악할 수 있어야 한다.  
이 이슈는 혼합형 데이터 소스를 사용한다.
센서 현황은 원시 센서 시계열(M4 데이터 플레인)에서 조회하고,
이상 시스템 목록은 Risk Twin latest 결과 기반으로 구성한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 센서 현황 패널 구현 (중단 왼쪽)
  - 공장별 현재 온도 / 현재 습도
  - 최근 짧은 추세선 (공장별 미니 차트)
  - 데이터 소스: DynamoDB LATEST 및 S3 processed
- [ ] 이상 시스템 목록 패널 구현 (중단 오른쪽)
  - 이상 발생 시스템 목록 (센서 / 엣지 에이전트 / 노드 / 카메라 / 마이크 / 파이프라인)
  - 정렬 기준: 1차 공장 위험도 순 (위험 > 주의 > 안전), 2차 최신 발생 순
  - 목록 표시 방식: 구성요소 개수형 (메인 카드 기준)
  - 데이터 소스: DynamoDB LATEST (`top_causes`, 상태 값)

### 🔍 Acceptance Criteria

- Dashboard에서 3개 공장 온도/습도 추세선 확인
- 이상 시스템 발생 시 목록에 자동 표시
- 이상 해소 시 목록에서 자동 제거
- 패널별 데이터 소스가 문서와 실제 구성에서 일치함

---

## Issue 7 - [관제/Dashboard] 메인 대시보드 - 하단 이벤트/상태 변화 로그

### 🎯 목표 (What & Why)

관제 화면 하단의 실시간 상태 변화 로그 패널을 구현한다.  
공장 위험 상태 변화, 시스템 정상→이상, 이상→복구 이벤트를 시간순으로 표시한다.  
이 로그는 별도 이벤트 저장소를 두지 않고, Risk Twin의 이전 상태와 현재 상태를 비교하여 파생 생성한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 하단 로그 패널 구현
  - 핵심 상태 변화 표시
    - 공장 위험 상태 변화 (안전 → 주의, 주의 → 위험 등)
    - 시스템 정상 → 이상 전환
    - 시스템 이상 → 복구 전환
  - 운영 판단에 영향을 주는 이벤트만 선별 표시
- [ ] 로그 항목 형식 정의
  - 시각 / 공장 ID / 이벤트 유형 / 내용
- [ ] 상태 변화 파생 생성 규칙 정의
  - 공장 상태 변화 (`safe → warning`, `warning → danger`, 복구 포함)
  - 구성요소 이상 발생 / 복구 전환
- [ ] 확장 대비형 구조 (향후 이벤트형 입력 수용 가능하게)
- [ ] 최근 N개 또는 N분 범위 표시 방식 결정

### 🔍 Acceptance Criteria

- 실제 시스템 이상 발생 시 로그 패널에 자동 기록
- 복구 이벤트도 로그에 기록됨 확인
- 로그 항목에 시각/공장/내용이 명확히 표시됨
- 이전 상태와 현재 상태 비교로 로그가 일관되게 생성됨 확인

---

## Issue 8 - [검증/Risk] 시나리오별 Risk Score 변화 확인

### 🎯 목표 (What & Why)

여러 이상 시나리오를 적용했을 때 Risk Score와 관제 화면이 의도대로 반응하는지 검증한다.  
이 검증이 완료되어야 M6 마일스톤이 완료되고 M7(통합 검증)으로 넘어갈 수 있다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 시나리오별 Risk Score 변화 확인
  - 시나리오 1: 정상 상태 → Risk Score 85~100 (안전)
  - 시나리오 2: 온도 이상 발생 → Score -15 반영 확인
  - 시나리오 3: 노드 이상 발생 → Score -20 반영, 위험 상태 전환 확인
  - 시나리오 4: 복수 이상 동시 발생 → 합산 점수 확인
  - 시나리오 5: 이상 해소 → Score 상승 및 상태 복구 확인
- [ ] 기준값 초과 시 위험도 카드 상태 변화 확인
- [ ] 각 시나리오에서 Top 3 원인 올바르게 출력 확인
- [ ] 관제 화면 변화(카드 색상, 이상 목록, 로그)가 시나리오와 일치 확인
- [ ] 현장 상태 변화부터 Dashboard 반영까지 지연 측정
  - 일반 상태 변화 목표: 10~35초
  - 장애 판정 목표: 40~60초
- [ ] 검증 결과를 Risk 관련 문서와 `docs/ops/03_test_checklist.md`에 반영

### 🔍 Acceptance Criteria

- 5개 시나리오 전부 예상 Risk Score 범위 내 결과 확인
- 기준값 초과/복구에 따라 위험도 카드 상태가 기대대로 변경됨 확인
- Dashboard 관제 화면이 Score 변화에 따라 갱신
- Top 3 원인이 가중치 순으로 올바르게 출력됨
- M6 전체 완료 기준: Spoke 상태 변화 → Risk Score → 관제 화면 end-to-end 동작

## 2026-05-14 수정 방향

이 문서의 이전 `Risk Score Engine` 표현은 최신 MVP 기준에서 별도 장기 실행 컨테이너 서비스/파드를 의미하지 않는다.

Risk 계산은 Lambda data processor 내부 로직으로 구현하고, 결과 저장과 Dashboard 조회는 아래 계약을 따른다.

```text
Lambda data processor
  -> DynamoDB LATEST
  -> DynamoDB HISTORY
  -> S3 processed
Dashboard Web/API
  -> DynamoDB + S3 processed read-only 조회
```

M6 구현 시 `risk-score-engine` ECR 이미지나 Kubernetes 파드 완료 조건은 사용하지 않는다.
