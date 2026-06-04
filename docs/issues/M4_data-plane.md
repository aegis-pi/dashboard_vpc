# M4. 데이터 플레인 - `factory-a` 단일 Spoke 기준

수정 이력:
- 2026-06-04 v0.2  cloud-side 소비 경로(Lambda data processor / pipeline_status / DDB·S3 저장 계약) 구현·검증 완료 반영. GitHub Issue Comment Draft 추가. Issue 1~5(Edge Agent→IoT→S3)는 워크스트림 A 팀 합의 영역으로 유지, Issue 8 실시간 edge 경로는 factory-a Edge Agent 비활성으로 후속.

> **마일스톤 목표**: `factory-a` Spoke의 센서/상태 데이터가 Edge Agent → IoT Core → S3까지 실제로 흐르는 것을 검증한다.
> M2(Hub-Spoke 연결) 완료 후 M3(배포 파이프라인)과 병렬로 진행 가능하다.  
> 이 마일스톤이 완료되어야 M6(Risk Twin)에서 실데이터 기반 Risk Score 계산이 가능해진다.
> Dashboard VPC가 Spoke에 직접 붙지 않으므로 노드, 장치, 워크로드 상태도 Edge Agent가 송신한다.

---

## 2026-05-13 멘토링 반영: S3 raw와 latest status 역할 분리

### 기존 초안

기존 M4 초안은 `factory-a` 데이터가 Edge Agent -> IoT Core -> S3까지 실제로 흐르는 것을 먼저 검증하는 구조였다. 이 초안은 IoT Core와 S3 raw 적재를 검증하는 기준으로 유지한다.

```text
입력 모듈
  -> Edge Agent
  -> IoT Core
  -> S3 raw
```

### 변경 이유

멘토링에서는 Dashboard의 "실시간성"을 수치로 정의해야 하고, S3 raw만으로 latest status를 설명하면 준실시간 관제 근거가 약하다는 피드백이 있었다. 또한 factory별 메시지 주기, payload 크기, 수신 성공률, 지연시간을 검증 기준으로 잡아야 한다.

### 보강 방향

S3 raw 적재 흐름은 유지하되, Dashboard가 조회할 최신 상태는 DynamoDB LATEST/HISTORY와 S3 processed 경로로 반영한다.

```text
Edge Agent
  -> IoT Core
  -> Lambda data processor
  -> DynamoDB LATEST/HISTORY
  -> S3 processed
  -> Dashboard API/Web

동시에:

IoT Core
  -> S3 raw
  -> 재처리 / 감사 / 일일 리포트
```

M4 문서의 기존 이슈들은 삭제하지 않고, 구현 시 아래 항목을 추가 검증 대상으로 둔다.

- source_type별 payload 크기 예상값
- factory별 전송 주기
- 초당 메시지 수
- IoT Core 수신 후 DynamoDB LATEST/HISTORY 반영 지연
- 10분 이상 연속 송신 기준 수신 성공률/실패율
- S3 raw와 DynamoDB/S3 processed 양쪽 경로 검증

---

## Issue 1 - [데이터/Schema] 표준 입력 스키마 확정

### 🎯 목표 (What & Why)

`입력 모듈 → Edge Agent` 사이의 데이터 구조를 고정한다.  
이 스키마가 확정되어야 Edge Agent, Dummy Sensor, Lambda data processor가 모두 같은 포맷을 기준으로 구현된다.
라즈베리파이와 VM의 입력 차이는 이 스키마 안에서 `input_module_type`으로만 구분한다.

2026-05-14 기준 표준 입력 스키마 source of truth는 `docs/specs/iot_data_format.md`다.
최종 source type은 `factory_state`, `infra_state` 두 개로 단순화한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 필수 공통 필드 확정
  - `factory_id` (string)
  - `node_id` (string: `master` / `worker1` / `worker2` / `cluster`)
  - `source_timestamp` (ISO 8601 UTC)
  - `published_at` (ISO 8601 UTC)
  - `message_id` (idempotency key)
  - `source_type` (`factory_state` / `infra_state`)
  - `environment_type` (`physical-rpi` / `vm-mac` / `vm-windows`)
- [ ] source_type별 payload 구조 확정 및 샘플 작성
  - `factory_state`: 3초 주기, 온도/습도/기압 평균과 AI score 평균
  - `infra_state`: 20초 주기, heartbeat, cluster, nodes, workloads, devices
  - `pipeline_status`: Hub derived 상태 (Edge가 직접 보내지 않음)
- [ ] 선택 필드 `null` 허용 원칙 명시
- [ ] 스키마 예시 JSON 작성 및 관련 입력/데이터 모델 문서에 반영

```json
{
  "schema_version": "0.1.0",
  "message_id": "factory-a:factory_state:worker2:2026-05-14T01:00:00Z",
  "factory_id": "factory-a",
  "node_id": "worker2",
  "environment_type": "physical-rpi",
  "input_module_type": "sensor",
  "source_type": "factory_state",
  "source_timestamp": "2026-05-14T01:00:00Z",
  "published_at": "2026-05-14T01:00:01Z",
  "agent_instance_id": "edge-agent-7f8c9d",
  "payload": {
    "aggregation_window_seconds": 3,
    "sensor": {
      "sample_count": 5,
      "temperature_celsius_avg": 24.6,
      "humidity_percent_avg": 58.1,
      "pressure_hpa_avg": 1012.7
    },
    "ai_result": {
      "sample_count": 3,
      "fire_score": 0.0,
      "fall_score": 0.6667,
      "bend_score": 0.3333,
      "abnormal_sound": "intermittent impact sound"
    }
  }
}
```

### 🔍 Acceptance Criteria

- 스키마 JSON 예시가 관련 입력/데이터 모델 문서에 source_type별로 작성됨
- Edge Agent 구현 시 이 스키마를 기준으로 바로 개발 가능한 수준
- `pipeline_status`가 Hub derived임이 명확히 구분됨

---

## Issue 2 - [데이터/Edge Agent] `factory-a` Edge Agent 수집/변환 로직 구현

### 🎯 목표 (What & Why)

`factory-a` 라즈베리파이 환경에서 실제 센서 데이터와 시스템 상태를 수집하여 표준 스키마로 변환하는 Edge Agent 핵심 로직을 구현한다.  
이 이슈에서는 수집/변환 로직 자체에 집중하고, 컨테이너 이미지화와 K3s 배포 준비는 다음 이슈에서 진행한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Edge Agent 구현 언어/프레임워크 결정 (Python 권장, 라즈베리파이 ARM64 호환)
- [ ] 수집 대상 구현
  - BME280 온도/습도/기압 평균 (`factory_state`)
  - AI fire/fall/bend 최근 window 평균 score (`factory_state`)
  - 이상소음 대표 텍스트 (`factory_state`)
  - 노드 상태, CPU/memory/disk usage (`infra_state`)
  - BME280, 카메라, 마이크 장치 상태 (`infra_state`)
  - AI/audio/BME Pod 상태와 restart count (`infra_state`)
  - Edge Agent heartbeat와 마지막 publish 결과 (`infra_state`)
- [ ] 수집 데이터 → 표준 입력 스키마 변환 로직
- [ ] 수집 주기 설정 (주기값은 `docs/ops/03_test_checklist.md` 기반 테스트 후 확정)
  - 확정 초기값: `factory_state` 3초, `infra_state` 20초

### 🔍 Acceptance Criteria

- 로컬 실행 또는 개발 환경 기준으로 수집/변환 로직 동작 확인
- 표준 스키마 형식의 메시지 payload 생성 확인
- 센서값/시스템 상태가 source_type별로 올바르게 분리됨 확인

---

## Issue 3 - [데이터/Container] `factory-a` Edge Agent 컨테이너화 및 K3s 배포 준비

### 🎯 목표 (What & Why)

Issue 2에서 구현한 Edge Agent 로직을 ARM64 환경에서 실행 가능한 컨테이너 이미지로 만들고,  
`factory-a` K3s에 배포 가능한 상태까지 준비한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Edge Agent ARM64 Docker 이미지 빌드 가능 상태 확인
- [ ] ECR 푸시 가능한 이미지 태그 전략 연결
- [ ] K3s 배포 매니페스트 또는 Helm values 반영
- [ ] `worker-2` 배치 기준 배포 스펙 정리
- [ ] 파드 실행에 필요한 Secret / Config / 디바이스 마운트 요구사항 정리

### 🔍 Acceptance Criteria

- Edge Agent 이미지가 ARM64 기준으로 빌드됨 확인
- `factory-a` 배포 대상 매니페스트에서 Edge Agent를 참조 가능
- K3s 배포 전 필요한 환경값/Secret/마운트 요구사항이 문서화됨

---

## Issue 4 - [데이터/IoT Core] Edge Agent → IoT Core 연결 및 수신 확인

### 🎯 목표 (What & Why)

Edge Agent가 실제 IoT Core 엔드포인트에 연결되어 데이터가 수신되는지 확인한다.  
인증서 관리와 연결 안정성을 검증하고, 연결 장애 시 재연결 로직을 확인한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] IoT Core 인증서 파일을 K3s Secret으로 배포
- [ ] Edge Agent 파드에서 인증서 마운트 및 MQTT 연결 성공
- [ ] IoT Core MQTT 테스트 클라이언트에서 메시지 실시간 수신 확인
- [ ] 연결 장애 시 재연결 로직 동작 확인
- [ ] IoT Core 연결 로그 확인 (CloudWatch 또는 파드 로그)

### 🔍 Acceptance Criteria

- IoT Core 콘솔 `MQTT 테스트 클라이언트`에서 `factory-a` 메시지 수신 확인
- 메시지 구조가 표준 입력 스키마와 일치
- 파드 재시작 후에도 자동 재연결 확인

---

## Issue 5 - [데이터/S3] IoT Core → S3 적재 확인 (경로 파티셔닝 포함)

### 🎯 목표 (What & Why)

IoT Core Rule이 수신된 메시지를 S3 지정 경로에 자동 적재하는지 확인한다.  
`factory_id` / `source_type` / 날짜 기반 파티셔닝이 올바르게 적용되는지 검증한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] IoT Rule Action이 S3에 메시지 적재하는 것 확인
- [ ] 경로 파티셔닝 규칙 적용 확인
  - `s3://bucket/raw/factory-a/factory_state/yyyy=2026/mm=05/dd=14/<message_id>.json`
  - `s3://bucket/raw/factory-a/infra_state/yyyy=2026/mm=05/dd=14/<message_id>.json`
  - 현재 Terraform IoT Rule은 MQTT topic `aegis/factory-a/{source_type}`의 세 번째 segment를 `source_type`으로 사용한다.
- [ ] `source_type`별 경로가 올바르게 분리되어 적재되는지 확인
- [ ] S3 적재 실패 시 IoT Rule 오류 로그 확인 방법 정의

### 🔍 Acceptance Criteria

- S3 콘솔에서 `raw/factory-a/factory_state/`, `raw/factory-a/infra_state/` 경로에 파일 적재 확인
- 적재된 파일 내용이 표준 스키마와 일치
- 두 `source_type` 경로에 파일이 분리 적재됨

---

## Issue 6 - [데이터/Lambda] IoT Core Lambda data processor 구현

### 🎯 목표 (What & Why)

IoT Core 수신 메시지를 Lambda data processor로 처리해 정규화, Risk 계산, `pipeline_status` 계산, DynamoDB/S3 processed 저장까지 수행한다.
S3 raw는 IoT Rule로 원본 보존을 유지하고, Dashboard 현재 상태 조회는 DynamoDB LATEST/HISTORY를 기준으로 한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Lambda data processor 구현
  - IoT Core Rule 또는 메시지 라우팅으로 Lambda 호출
  - 필드 정규화 (타입 변환, null 처리, 단위 통일)
  - Risk Score 계산
  - `pipeline_status` 계산
  - DynamoDB LATEST overwrite/update
  - DynamoDB HISTORY TTL item 저장
  - S3 processed 처리 결과 저장
- [ ] Lambda IAM 권한 설정
  - DynamoDB read/write
  - S3 processed write
  - 필요 시 S3 raw read
- [ ] 정규화 실패 데이터 처리 원칙 정의 (스킵 또는 오류 로그)
- [ ] Dashboard VPC 조회용 DynamoDB/S3 processed 계약 반영

### 🔍 Acceptance Criteria

- IoT Core 메시지 수신 후 Lambda가 자동 실행됨
- `factory_state` 처리 후 DynamoDB LATEST의 `factory_state`, `risk`가 갱신됨
- `infra_state` 처리 후 DynamoDB LATEST의 `infra_state`, `pipeline_status`가 갱신됨
- DynamoDB HISTORY와 S3 processed에 처리 결과가 저장됨
- Lambda CloudWatch Logs에서 정상 처리와 실패 로그를 확인할 수 있음

---

## Issue 7 - [데이터/Pipeline] `pipeline_status` Lambda 처리 검증

### 🎯 목표 (What & Why)

IoT Core 수신 상태와 S3 적재 상태를 기준으로 `pipeline_status`가 Lambda data processor에서 계산되고 DynamoDB LATEST/HISTORY에 반영되는지 검증한다.
`pipeline_status`는 Edge가 직접 보내는 값이 아니라 cloud-side에서 계산하는 관제용 상태다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Lambda data processor의 `pipeline_status` 계산 구현
  - IoT Core `infra_state` 수신 여부 확인 로직
  - S3 최신 적재 시각 기준 지연 판단 로직
  - DynamoDB LATEST/HISTORY 업데이트 로직
  - `infra_state` 20초 주기 기준 warning/critical 판단
- [ ] DynamoDB LATEST/HISTORY 저장 확인
- [ ] Dashboard VPC 조회용 latest/status 저장소 반영
- [ ] `pipeline_status` 판단 기준을 데이터 플레인 관련 문서에 반영

### 🔍 Acceptance Criteria

- Lambda 처리 결과에서 `factory-a`의 pipeline 상태 확인 가능
- DynamoDB LATEST에서 `factory-a`의 pipeline 상태 조회 가능
- IoT Core 메시지가 일정 시간 이상 없을 때 `pipeline_status` 이상으로 판정

---

## Issue 8 - [검증/데이터] `factory-a` 데이터 플레인 end-to-end 검증

### 🎯 목표 (What & Why)

`factory-a` 센서 데이터가 Edge Agent에서 IoT Core, S3 raw, Lambda, DynamoDB/S3 processed까지 실제로 흐르는 전체 파이프라인을 검증한다.
이 검증이 완료되어야 M4 마일스톤이 완료되고 M5(VM Spoke 확장)와 M6(Risk Twin)으로 넘어갈 수 있다.

### ✅ 완료 조건 (Definition of Done)

- [ ] `입력 모듈 → Edge Agent → IoT Core → S3 raw` 흐름 end-to-end 확인
- [ ] `IoT Core → Lambda data processor → DynamoDB/S3 processed` 흐름 확인
- [ ] source_type별 경로 분리 적재 확인 (`factory_state`, `infra_state`)
- [ ] Lambda 정규화/Risk 계산 처리 확인
- [ ] `pipeline_status` Lambda 계산 동작 확인
- [ ] DynamoDB LATEST/HISTORY에 Dashboard 조회용 최신 상태 반영 확인
- [ ] 데이터 지연/누락 발생 시 `pipeline_status` 이상 판정 확인
- [ ] 검증 결과를 데이터 플레인 관련 문서와 `docs/ops/03_test_checklist.md`에 반영

### 🔍 Acceptance Criteria

- S3에서 `factory-a` 데이터 주기적 적재 확인 (최소 10분 이상 연속)
- `factory_state`, `infra_state` 두 경로에 데이터 분리 적재 확인
- Edge Agent 강제 중지 후 `pipeline_status` 이상 판정 확인
- 재기동 후 파이프라인 자동 복구 확인

## 2026-05-14 수정 방향

이 문서의 이전 `정규화 서비스`, `Risk Score Engine`, `pipeline-status-aggregator`, `ops-support` 표현은 최신 MVP 기준에서 별도 컨테이너 서비스/파드가 아니다.

최신 기준은 아래 흐름이다.

```text
Edge Agent
  -> IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor
          -> DynamoDB LATEST
          -> DynamoDB HISTORY
          -> S3 processed
  -> Dashboard API/Web
```

M4의 cloud-side 구현 대상은 Lambda data processor와 DynamoDB/S3 저장 계약 검증으로 정리한다.

## GitHub Issue Comment Draft

- 상태: 부분 완료 (cloud-side 완료, factory-a 실시간 edge 경로 후속)
- 진행 요약: 본 환경(워크스트림 B)의 소비측 데이터 플레인을 구현·검증 완료했다. IoT Rule → Lambda data processor → DynamoDB(LATEST/HISTORY) + S3 processed, 그리고 DDB Streams → notifier → Redis PUBLISH 경로가 동작한다. Issue 1~5(Edge Agent → IoT Core → S3 raw)는 워크스트림 A 팀 합의 영역으로 본 환경에서 직접 검증하지 않는다.
- 변경/확인: `apps/data-processor/`(envelope·normalizer·risk·pipeline_status·dynamo·s3_writer), `apps/lambda-notifier/`, `infra/data-dashboard/`(lambda_data_processor.tf·iot_rule.tf·lambda_notifier.tf·iam), 공식 hot store `AEGIS-DynamoDB-FactoryStatus`(ADR 0022), S3 processed 경로 스펙(ADR 0020), staleness 60/120초(ADR 0028).
- 검증: data-processor pytest 통과, IoT Rule 2개 active, 직접 invoke 및 IoT Rule 경유 DDB LATEST/HISTORY + S3 processed 생성 확인, DDB write → Redis PUBLISH ~0.45초(ADR 0021/Step 5), notifier DLQ=0.
- 후속: factory-a Edge Agent 재활성 후 Edge → IoT Core → DDB 실시간 경로(Issue 8) end-to-end 검증.
