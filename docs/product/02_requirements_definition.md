# Requirements Definition Traceability

상태: source of truth
기준일: 2026-05-20

수정 이력:
- 2026-05-20 v0.4  Risk Score 의미를 안전점수 기준(100=가장 안전, 0=가장 위험)으로 정정.
- 2026-05-20 v0.3  Phase 1 통합 결정(ADR 0012~0017) 반영. Cognito/WAF/WebSocket/Bedrock/RDS/Redis를 후속이 아닌 Phase 1 요구로 재분류.
- 2026-05-14 v0.2  요구사항 추적표와 수치 기준 정리.

## 목적

이 문서는 Aegis-Pi를 진행하며 선택한 제품, 아키텍처, 데이터, 운영, 배포, 보안, 비용 기준을 요구사항 정의서 관점으로 재정리한다.

핵심 목적은 특정 결정 몇 개를 사후 정당화하는 것이 아니라, 현재 설계와 구현 방향이 어떤 기업 도입 요구사항을 만족하기 위해 선택되었는지 추적 가능하게 만드는 것이다.

따라서 이 문서의 요구사항은 별도로 새로 만든 가정이 아니라, 기존 `docs/` 문서에 이미 기록된 선택 사항과 검증 기준을 요구사항 언어로 변환한 것이다.

## 요구사항 도출 방식

요구사항은 아래 순서로 도출한다.

```text
문서 탐색
  -> 프로젝트 선택 사항 수집
  -> 선택 이유와 제외 범위 확인
  -> 기업/운영 관점 요구사항으로 변환
  -> 설계 반영 위치와 검증 방법 연결
```

### 1. 문서군 분류

`docs/` 전체를 아래 기준으로 나누어 확인한다.

| 문서군 | 확인 목적 | 대표 문서 |
| --- | --- | --- |
| 제품/사용자 | 누가 어떤 판단을 해야 하는지 확인 | `docs/product/00_mvp_scope.md`, `docs/product/01_user_flow.md` |
| 아키텍처 | 공장, Hub, VPC, 데이터 흐름 경계 확인 | `docs/planning/12_two_vpc_mvp_architecture_decision.md`, `docs/planning/15_cloud_architecture_final.md` |
| 선택 이유 | 여러 대안 중 현재 방식을 택한 이유 확인 | `docs/planning/05_decision_rationale.md` |
| 배포/운영 책임 | Terraform, Ansible, CI, CD 책임 분리 확인 | `docs/planning/11_delivery_ownership_flow.md` |
| 마일스톤 | 단계별 완료 기준과 검증 항목 확인 | `docs/issues/M0_*.md` ~ `docs/issues/M7_*.md`, `docs/issues/MASTER_CHECKLIST.md` |
| 운영 기록 | 실제 운영 제약, 비용, 장애 검증 결과 확인 | `docs/ops/*` |
| 변경 기록 | 진행 중 바뀐 설계 선택 확인 | `docs/changes/*` |
| 스펙 | 데이터 포맷, 대시보드, API, 모델 기준 확인 | `docs/specs/*` |

### 2. 조항 후보 탐색 기준

각 문서에서 아래 표현을 요구사항 후보로 본다.

| 유형 | 탐색 표현 |
| --- | --- |
| 결정 | `확정`, `선택`, `채택`, `유지`, `분리`, `보류`, `제외`, `대체` |
| 요구 | `목표`, `요구`, `성공 기준`, `완료 기준`, `검증`, `관제`, `운영` |
| 근거 | `이유`, `왜`, `rationale`, `판단`, `trade-off`, `멘토링 반영` |
| 범위 | `MVP`, `후속`, `deferred`, `out of scope`, `backlog` |

### 3. 변환 규칙

발견한 항목은 바로 요구사항으로 쓰지 않고 먼저 프로젝트 선택 사항으로 정리한다.

| 원문에서 발견한 내용 | 요구사항 변환 기준 |
| --- | --- |
| 사용자가 보는 흐름 | 업무/사용자 요구사항 |
| 포함 기능과 제외 기능 | MVP 범위 요구사항 |
| 전송 주기, 지연 목표, 보존 기간 | 비기능 요구사항 |
| K3s, IoT Core, S3, ArgoCD 같은 채택 기술 | 아키텍처/제약 요구사항 |
| VPC 분리, Tailscale, IAM, WAF/Auth | 보안/접근 제어 요구사항 |
| failover, failback, retention, cleanup | 운영/가용성 요구사항 |
| 비용 baseline, destroy 절차 | 비용/운영성 요구사항 |
| 보류한 선택지 | MVP 제외 범위 또는 후속 요구사항 |

## 프로젝트 선택 사항 인벤토리

아래 표는 현재 문서에서 확인되는 주요 선택 사항을 요구사항으로 변환하기 전의 원본 인벤토리다.

| ID | 선택 사항 | 선택 이유 | 제외/보류한 대안 | 근거 문서 |
| --- | --- | --- | --- | --- |
| DEC-01 | MVP 사용자를 본사 관제 담당자로 둔다 | 여러 공장의 위험 상태와 원인을 빠르게 식별해야 한다 | 단일 공장 현장 Grafana만 제품 화면으로 유지 | `docs/product/01_user_flow.md` |
| DEC-02 | MVP는 `factory-a/b/c` 멀티 공장 구조로 둔다 | 운영형 1개와 테스트베드형 2개로 확장성을 검증한다 | 단일 공장 PoC에서 종료 | `docs/product/00_mvp_scope.md` |
| DEC-03 | Risk 상태는 `안전 / 주의 / 위험`으로 표현한다 | 숫자보다 상태를 먼저 이해해야 한다 | 원시 센서값 중심 화면 | `docs/product/00_mvp_scope.md`, `docs/product/01_user_flow.md` |
| DEC-04 | Edge 실행 환경은 K3s를 유지한다 | `factory-a`에서 K3s, ArgoCD, Longhorn, failover/failback 기준선이 검증됐다 | Greengrass를 MVP 메인 런타임으로 도입 | `docs/planning/05_decision_rationale.md` |
| DEC-05 | Edge Agent가 IoT Core로 MQTT publish한다 | 디바이스 인증, 라우팅, S3 적재를 표준 AWS 경로로 처리한다 | 직접 HTTP API 수신 | `docs/planning/05_decision_rationale.md` |
| DEC-06 | IoT Core 수신 원본은 S3 raw로 보존한다 | 재처리, 감사, Risk 로직 보정 근거를 남긴다 | Risk Service 직접 처리만 수행 | `docs/planning/05_decision_rationale.md`, `docs/specs/iot_data_format.md` |
| DEC-07 | Risk 계산은 Lambda data processor로 둔다 | 최근 상태, 이전 상태, 지속 시간, top causes는 DynamoDB LATEST/HISTORY를 상태 저장소로 두고 계산한다 | 별도 장기 실행 Risk 계산 서비스/worker | `docs/planning/05_decision_rationale.md`, `docs/specs/data_storage_pipeline.md` |
| DEC-08 | 공장 상태와 인프라 상태를 `factory_state`, `infra_state`로 나눈다 | Risk 입력과 운영 헬스 체크의 목적과 주기가 다르다 | 5~6개 source type을 모두 별도 전송 | `docs/specs/iot_data_format.md` |
| DEC-09 | `factory_state`는 3초 주기로 전송한다 | Risk Score 입력을 준실시간으로 반영한다 | AI 결과 변화 즉시 이벤트 전송 | `docs/specs/iot_data_format.md` |
| DEC-10 | AI 결과는 최근 window 평균 score로 보낸다 | 모델 오탐에 민감하게 반응하지 않고 Lambda data processor의 Risk 계산 로직이 가중치 계산을 하게 한다 | Edge에서 최종 `0/1` 판정 | `docs/specs/iot_data_format.md`, `docs/specs/monitoring_dashboard/00_requirements.md` |
| DEC-11 | `infra_state`는 20초 주기로 전송한다 | 1분 내 파이프라인 헬스 체크를 하면서 운영 부담을 줄인다 | heartbeat 별도 파이프라인 | `docs/specs/iot_data_format.md` |
| DEC-12 | `pipeline_status`는 cloud-side에서 계산한다 | Edge는 사실과 요약값만 보내고 최종 판단은 중앙에서 일관되게 한다 | Edge Agent가 최종 pipeline 상태를 직접 판단 | `docs/specs/iot_data_format.md` |
| DEC-13 | Dashboard는 DynamoDB LATEST/HISTORY를 우선 조회한다 | S3 raw만으로는 최신 상태 조회 근거가 약하다 | S3 raw 직접 조회 기반 화면 | `docs/specs/data_storage_pipeline.md`, `docs/planning/15_cloud_architecture_final.md` |
| DEC-14 | Control / Management VPC와 Data / Dashboard VPC를 분리한다 | 고객 보안, 역할 분리, 감사 요구가 강해질 때 설득력 있는 목표 구조다 | 단일 VPC만 고정 | `docs/planning/12_two_vpc_mvp_architecture_decision.md`, `docs/planning/15_cloud_architecture_final.md` |
| DEC-15 | Dashboard Web/API는 ArgoCD, Tailscale, EKS API, Spoke API를 직접 조회하지 않는다 | 사용자 조회망과 제어망의 lateral movement를 줄인다 | Dashboard가 제어 plane API 직접 조회 | `docs/planning/07_dashboard_vpc_extension_plan.md`, `docs/specs/monitoring_dashboard/00_requirements.md` |
| DEC-16 | Grafana는 운영자/개발자용 관측 도구로 둔다 | 사용자용 Risk Twin Dashboard와 역할이 다르다 | Grafana를 public 사용자 제품 화면으로 사용 | `docs/planning/12_two_vpc_mvp_architecture_decision.md` |
| DEC-17 | Hub ArgoCD/ApplicationSet 중심 배포를 목표로 한다 | 공장별 values, sync 정책, drift 확인을 GitOps로 관리한다 | GitHub Actions에서 각 Spoke에 직접 `kubectl apply` | `docs/planning/05_decision_rationale.md`, `docs/planning/11_delivery_ownership_flow.md` |
| DEC-18 | Terraform, Ansible, GitHub Actions, ArgoCD 책임을 분리한다 | 인프라, bootstrap, CI, CD의 source of truth를 분리한다 | Terraform/CI가 클러스터 앱 상태까지 장기 소유 | `docs/planning/11_delivery_ownership_flow.md` |
| DEC-19 | `factory-a`는 worker2 preferred, worker1 failover, cron failback 기준을 사용한다 | 실제 장애 테스트에서 failover/failback 기준선이 검증됐다 | 수동 복구만 사용 | `docs/ops/09_failover_failback_test_results.md` |
| DEC-20 | AI snapshot은 Longhorn PVC가 아니라 node-local hostPath로 둔다 | RWO PVC attach 문제가 AI failover를 막았다 | AI snapshot Longhorn RWO PVC 유지 | `docs/changes/0001-ai-snapshot-pvc-to-hostpath.md`, `docs/ops/09_failover_failback_test_results.md` |
| DEC-21 | InfluxDB는 1일 retention, AI snapshot은 24시간 cleanup을 적용한다 | 로컬 저장소가 무한히 증가하지 않아야 한다 | 로컬 장기 보존 | `docs/ops/08_data_retention.md` |
| DEC-22 | AWS Hub 비용은 active/destroy 상태를 기준으로 관리한다 | MVP 운영 비용을 설명하고 필요 시 0에 가깝게 낮출 수 있어야 한다 | 상시 리소스 비용 미관리 | `docs/ops/15_aws_cost_baseline.md` |
| DEC-23 | Tailscale은 MVP Hub-Spoke 제어망으로 유지한다 | Site-to-Site VPN, TGW, Direct Connect, WireGuard보다 MVP 복잡도가 낮다 | 전용망을 즉시 구현 | `docs/planning/12_two_vpc_mvp_architecture_decision.md`, `docs/ops/20_tailscale_hub_spoke_runbook.md` |
| DEC-24 | Phase 1 Dashboard는 Cognito, WAF, ECS Backend, RDS PostgreSQL, Redis, WebSocket, Bedrock 일간 보고서를 포함한다 | 발표/검증용 목표를 서버리스 최소 구성과 컨테이너 확장으로 나누지 않고 하나의 통합 배포 목표로 둔다 | Lambda Dashboard API만으로 Phase 1을 종료 | `docs/planning/16_data_dashboard_vpc_workplan.md`, `docs/planning/17_expansion_roadmap.md`, `docs/changes/0012-introduce-container-backend-for-dashboard.md` |
| DEC-25 | 장기 분석, Kinesis/Timestream/OpenSearch, Multi-AZ, IdP federation, PrivateLink, 컴플라이언스 기능은 Phase 2~4 트리거 기반 후속으로 둔다 | 현재는 측정값이 필요 기능 도입을 트리거하도록 설계한다 | 모든 고도화 기능을 Phase 1에 포함 | `docs/planning/17_expansion_roadmap.md` |

## 요구사항 정의

### 수치 기준 요약

아래 값들은 데이터 포맷 논의 과정에서 확정한 MVP 기준이며, 요구사항 정의서에서는 비기능 요구사항과 검증 기준으로 해석한다.

| 항목 | 확정값 | 요구사항 의미 | 검증 방법 | 근거 문서 |
| --- | ---: | --- | --- | --- |
| `factory_state` 전송 주기 | 3초 | 공장 상태를 Risk Score에 준실시간으로 반영해야 한다. | M4에서 10분 이상 연속 publish/S3 적재 확인 | `docs/specs/iot_data_format.md`, `docs/issues/M4_data-plane.md` |
| `infra_state` 전송 주기 | 20초 | 노드/워크로드/장치/heartbeat 상태를 1분 내 운영자가 인지할 수 있어야 한다. | M4에서 `infra_state` 누락 시 warning/critical 판정 확인 | `docs/specs/iot_data_format.md` |
| AI score 방식 | 최근 3초 또는 최근 N개 평균, `0.0~1.0` | AI 모델 순간 오탐에 즉시 반응하지 않고 Lambda data processor에서 가중치를 곱해 계산할 수 있어야 한다. | 샘플 window의 `fire_score`, `fall_score`, `bend_score` 계산 확인 | `docs/specs/iot_data_format.md`, `docs/specs/monitoring_dashboard/00_requirements.md` |
| source type 수 | 2개 | IoT topic, S3 partition, Dashboard 처리 경로를 단순하게 유지해야 한다. | `factory_state`, `infra_state` 두 경로 분리 적재 확인 | `docs/specs/iot_data_format.md` |
| `pipeline_status.normal` | latest `infra_state` age <= 20초 | 최신 인프라 상태가 정상 주기 안에 들어오면 정상으로 본다. | Lambda data processor 판단 결과 확인 | `docs/specs/iot_data_format.md`, `docs/specs/data_storage_pipeline.md` |
| `pipeline_status.warning` | latest `infra_state` age > 40초 | 20초 주기 기준 1회 이상 누락 가능성이 있으면 주의로 본다. | Edge Agent 중지/지연 테스트 | `docs/specs/iot_data_format.md` |
| `pipeline_status.critical` | latest `infra_state` age > 60초 | 인프라 상태 이상을 1분 내 감지해야 한다. | Edge Agent 중지 후 critical 전환 시간 측정 | `docs/specs/iot_data_format.md` |
| 일반 상태 Dashboard 반영 | 10~35초 목표 | 관제 화면은 실시간 제어가 아니라 준실시간 운영 관제 수준을 만족해야 한다. | M6에서 상태 변화 후 화면 반영 시간 측정 | `docs/planning/03_evaluation_plan.md`, `docs/planning/07_dashboard_vpc_extension_plan.md` |
| 장애 판정 Dashboard 반영 | 40~60초 목표 | 파이프라인/노드 장애는 운영자가 1분 내 파악할 수 있어야 한다. | M6/M7 장애 시나리오에서 반영 시간 측정 | `docs/planning/03_evaluation_plan.md`, `docs/planning/07_dashboard_vpc_extension_plan.md` |
| `factory_state` payload 크기 | 약 0.6 KB | 3초 주기 전송이 IoT Core/S3 병목을 만들 가능성이 낮아야 한다. | compact JSON 기준 실제 payload 크기 측정 | `docs/specs/iot_data_format.md` |
| `infra_state` payload 크기 | 약 1.6 KB | 20초 주기 상태 전송이 운영 부담 대비 충분한 헬스 체크 정보를 제공해야 한다. | compact JSON 기준 실제 payload 크기 측정 | `docs/specs/iot_data_format.md` |
| 공장 1개 일일 raw payload | 약 25 MB/day | S3 raw 보존과 재처리 비용이 MVP 규모에서 감당 가능해야 한다. | M4/M7에서 실제 S3 object 크기 합산 | `docs/specs/iot_data_format.md` |
| Risk Score 범위 | 0~100 | 공장 안전도를 단일 점수로 비교할 수 있어야 한다. 100은 가장 안전, 0은 가장 위험으로 해석한다. | 정상/주의/위험 시나리오별 score 산출 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| Risk 안전 구간 | 85~100 | 정상 상태 공장은 안전으로 분류되어야 한다. | 정상 입력 시 Risk Score 85~100 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| Risk 주의 구간 | 50~84 | 위험 징후가 있으나 즉시 위험은 아닌 상태를 구분해야 한다. | 주의 시나리오 입력 후 상태 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| Risk 위험 구간 | 0~49 | 즉시 우선 대응이 필요한 공장을 위험으로 분류해야 한다. | 위험 시나리오 입력 후 상태 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| WebSocket push | DDB Streams 이후 1~2초 목표 | 상태 변경 후 Dashboard가 폴링만 기다리지 않고 준실시간으로 갱신되어야 한다. | DDB update -> notifier -> Redis -> WebSocket 수신 시간 측정 | `docs/planning/16_data_dashboard_vpc_workplan.md`, `docs/changes/0015-websocket-for-dashboard-realtime.md` |
| Backend p95 응답 | < 500ms 목표, cache hit < 100ms 목표 | 사용자가 공장 목록/상세를 반복 조회할 때 관제 화면이 지연 없이 반응해야 한다. | k6 또는 artillery 부하 테스트, Redis hit/miss 확인 | `docs/planning/16_data_dashboard_vpc_workplan.md` |
| AI/Sound 안전 매핑 | 0.0~0.2 | 최근 평균 AI 값이 낮으면 안전으로 표시해야 한다. | Grafana 또는 Dashboard score-label 매핑 확인 | `docs/specs/monitoring_dashboard/00_requirements.md` |
| AI/Sound 주의 매핑 | 0.3~0.7 | 불확실한 AI 결과는 주의 상태로 표현해야 한다. | Grafana 또는 Dashboard score-label 매핑 확인 | `docs/specs/monitoring_dashboard/00_requirements.md` |
| AI/Sound 위험 매핑 | 0.8~1.0 | 높은 평균 AI 값은 위험 레이블로 표시해야 한다. | Grafana 또는 Dashboard score-label 매핑 확인 | `docs/specs/monitoring_dashboard/00_requirements.md` |
| stale 센서 기준 | 3분 | 센서 데이터 무수신이 일정 시간 지속되면 Risk 원인으로 반영해야 한다. | M6 stale 시나리오 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| stale Edge Agent 기준 | 2분 | Edge Agent 무응답을 공장 상태 원인으로 반영해야 한다. | M6 stale 시나리오 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| stale 노드 기준 | 1분 | 노드 상태 이상은 다른 장치보다 빠르게 반영해야 한다. | M6 stale 시나리오 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| stale 카메라/마이크 기준 | 3분 | 영상/음성 장치 무수신이 지속되면 장치 이상으로 반영해야 한다. | M6 stale 시나리오 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| stale 데이터 파이프라인 기준 | 2분 | 데이터 수집 파이프라인 이상을 Risk 원인으로 반영해야 한다. | M6 stale 시나리오 확인 | `docs/issues/M6_risk-twin-dashboard.md` |
| 로컬 InfluxDB 보존 | 1일 | 엣지 로컬 시계열 저장소가 무한 증가하지 않아야 한다. | retention policy 확인 | `docs/ops/08_data_retention.md` |
| AI snapshot 보존 | 24시간 | 이미지 스냅샷이 로컬 디스크를 장기 점유하지 않아야 한다. | cleanup sidecar와 purge 결과 확인 | `docs/ops/08_data_retention.md` |
| failover 관측 bucket | 10초/1초 | 장애 전환 중 데이터 공백과 중복 write를 측정할 수 있어야 한다. | InfluxDB bucket count 분석 | `docs/ops/09_failover_failback_test_results.md` |
| 장애 테스트 초기 판정 보류 | 5분 | 일시적인 Ready/Running 흔들림을 성공으로 오판하지 않아야 한다. | 장애 테스트 체크리스트 확인 | `docs/ops/03_test_checklist.md` |
| Hub active 고정 비용 | 약 $0.3606/hour | MVP Hub 운영 비용을 설명 가능해야 한다. | 비용 baseline 재계산 | `docs/ops/15_aws_cost_baseline.md` |
| Hub active 24시간 비용 | 약 $8.65/day | 단기 테스트 운영 비용을 예측할 수 있어야 한다. | 비용 baseline 재계산 | `docs/ops/15_aws_cost_baseline.md` |
| Hub active 월 비용 | 약 $263.24/730h | 상시 운영 비용 규모를 설명 가능해야 한다. | 비용 baseline 재계산 | `docs/ops/15_aws_cost_baseline.md` |
| Data/Dashboard Phase 1 상시 비용 | 약 $125/month | ECS/RDS/Redis/ALB/NAT 기반 사용자 Dashboard 운영 비용을 설명 가능해야 한다. | 비용 baseline 재계산 | `docs/ops/15_aws_cost_baseline.md` |
| Data/Dashboard 데모 운영 비용 | 약 $8~10/month | build/destroy 사이클로 발표·검증 비용을 낮출 수 있어야 한다. | `build-data-dashboard`/`destroy-data-dashboard` 실행 후 Cost Explorer 확인 | `docs/ops/15_aws_cost_baseline.md`, `docs/planning/16_data_dashboard_vpc_workplan.md` |
| destroy 이후 고정 비용 | $0.0000/hour | 테스트 종료 후 비용을 제거할 수 있어야 한다. | destroy-all 후 리소스 조회 | `docs/ops/15_aws_cost_baseline.md` |

### 업무/사용자 요구사항

| ID | 요구사항 | 근거 선택 |
| --- | --- | --- |
| BR-01 | 본사 관제 담당자는 여러 공장 중 현재 가장 위험한 공장을 한 화면에서 식별할 수 있어야 한다. | DEC-01, DEC-02 |
| BR-02 | 사용자는 위험 상태만 보는 것이 아니라, 그 공장이 왜 위험한지 센서/AI 축과 시스템 축으로 분리해 확인할 수 있어야 한다. | DEC-01, DEC-03, DEC-13 |
| BR-03 | 사용자는 최근 상태 변화 시간과 흐름을 확인해 운영 대응 또는 상세 확인으로 이어질 수 있어야 한다. | DEC-01, DEC-03 |
| BR-04 | 운영형 Spoke와 테스트베드형 Spoke는 같은 관제 구조 안에서 공장 단위로 식별되어야 한다. | DEC-02 |

### 기능 요구사항

| ID | 요구사항 | 근거 선택 |
| --- | --- | --- |
| FR-01 | Edge Agent는 공장 상태 데이터를 `factory_state` 메시지로 IoT Core에 전송해야 한다. | DEC-05, DEC-08 |
| FR-02 | `factory_state`는 온도, 습도, 기압, 화재 score, 넘어짐 score, 굽힘 score, 이상소음 텍스트를 포함해야 한다. | DEC-08, DEC-09, DEC-10 |
| FR-03 | Edge Agent는 클러스터, 노드, 워크로드, 장치, heartbeat 상태를 `infra_state` 메시지로 전송해야 한다. | DEC-08, DEC-11 |
| FR-04 | Lambda data processor는 Edge가 보낸 평균 score와 센서 요약값을 사용해 최종 Risk Score와 `안전 / 주의 / 위험` 상태를 계산해야 한다. | DEC-03, DEC-07, DEC-10, DEC-12 |
| FR-05 | 수신 원본 데이터는 S3 raw에 저장되어 재처리, 감사, 리포트 입력으로 사용할 수 있어야 한다. | DEC-06 |
| FR-06 | Dashboard는 DynamoDB LATEST/HISTORY와 S3 processed result를 조회해 공장별 최신 상태, 원인, 로그를 제공해야 한다. | DEC-13, DEC-15 |
| FR-07 | Hub ArgoCD는 `factory-a/b/c` Spoke의 Edge Agent와 공통 구성요소를 공장별 값으로 배포할 수 있어야 한다. | DEC-02, DEC-17 |
| FR-08 | Dashboard Backend는 ALB 뒤의 ECS Fargate FastAPI 서비스로 REST 조회와 WebSocket 연결을 제공해야 한다. | DEC-24 |
| FR-09 | Dashboard는 Cognito로 인증된 사용자에게 권한이 있는 공장만 보여줘야 한다. | DEC-15, DEC-24 |
| FR-10 | 상태 변경은 DynamoDB Streams, Lambda notifier, Redis Pub/Sub, WebSocket으로 Dashboard에 전달되어야 한다. | DEC-24 |
| FR-11 | 매일 09:00 KST 기준 공장별 Markdown 일간 보고서를 생성하고 Dashboard에서 열람할 수 있어야 한다. | DEC-24 |

### 비기능 요구사항

| ID | 요구사항 | 기준 | 근거 선택 |
| --- | --- | --- | --- |
| NFR-01 | 공장 상태 데이터는 준실시간 Risk 계산에 사용할 수 있어야 한다. | Edge publish 주기 3초 | DEC-09 |
| NFR-02 | 인프라 이상은 운영자가 1분 내 인지할 수 있어야 한다. | Edge publish 주기 20초, heartbeat miss는 cloud-side에서 판정 | DEC-11, DEC-12 |
| NFR-03 | Dashboard의 일반 상태 변화는 MVP 목표 지연 범위 안에 반영되어야 한다. | 10~35초 목표 | DEC-13 |
| NFR-04 | 장애 판정은 운영 관제에서 실용적인 시간 안에 반영되어야 한다. | 40~60초 목표 | DEC-11, DEC-13 |
| NFR-05 | AI 오탐 민감도를 낮추기 위해 순간 `0/1` 이벤트보다 최근 window 평균 score를 사용해야 한다. | 최근 3초 또는 최근 N개 평균 | DEC-10 |
| NFR-06 | 로컬 저장소는 무한 증가하지 않도록 보존 정책을 가져야 한다. | InfluxDB 1일, AI snapshot 24시간 cleanup | DEC-21 |
| NFR-07 | 장애 테스트 결과는 데이터 공백, failover/failback 시간, 중복 write 가능성을 측정 가능해야 한다. | 1초/10초 bucket 분석 | DEC-19 |
| NFR-08 | Dashboard API는 반복 조회 부하를 줄이기 위해 Redis 캐시를 사용할 수 있어야 한다. | Backend p95 < 500ms, cache hit < 100ms 목표 | DEC-24 |
| NFR-09 | Dashboard 상태 변경 푸시는 폴링 없이 준실시간으로 사용자 화면에 반영되어야 한다. | DDB Streams 이후 WebSocket push 1~2초 목표 | DEC-24 |

### 아키텍처/제약 요구사항

| ID | 요구사항 | 근거 선택 |
| --- | --- | --- |
| ARC-01 | `factory-a` 운영형 Spoke는 기존 Raspberry Pi 3-node K3s 기준선을 유지해야 한다. | DEC-04, DEC-19 |
| ARC-02 | MVP Edge 런타임은 K3s workload와 Edge Agent를 기본으로 하고, Greengrass는 후속 재검토 대상으로 둔다. | DEC-04 |
| ARC-03 | Cloud 수신 진입점은 AWS IoT Core MQTT와 IoT Rule을 기본 경로로 둔다. | DEC-05 |
| ARC-04 | 데이터 처리 흐름은 IoT Core, IoT Rule/S3 raw, Lambda data processor, DynamoDB LATEST/HISTORY, S3 processed, Dashboard 순서로 구성한다. | DEC-06, DEC-07, DEC-13 |
| ARC-05 | Control / Management VPC와 Data / Dashboard VPC는 고객 보안과 역할 분리 요구가 있을 때의 목표 구조로 유지한다. | DEC-14 |
| ARC-06 | 단일 VPC 대안은 가능하지만, MVP 문서화 기준에서는 제어 plane과 사용자 조회 plane의 경계를 분리해 설명해야 한다. | DEC-14, DEC-15 |
| ARC-07 | Grafana는 운영 관측 도구로 유지하고, 사용자-facing 제품 화면은 Dashboard Web/API로 분리한다. | DEC-16 |
| ARC-08 | Phase 1 Data/Dashboard VPC는 Public/Private App/Private Data 3-tier 구조로 구성한다. | DEC-24 |
| ARC-09 | Dashboard 메타데이터와 사용자-공장 권한은 RDS PostgreSQL에 저장한다. | DEC-24 |

### 보안/접근 제어 요구사항

| ID | 요구사항 | 근거 선택 |
| --- | --- | --- |
| SEC-01 | Dashboard Web/API는 Spoke K3s API, EKS admin API, ArgoCD admin API, Tailscale 관리망을 직접 조회하지 않아야 한다. | DEC-15 |
| SEC-02 | Dashboard API는 processed/latest 데이터에 대한 조회 권한 중심으로 제한해야 한다. | DEC-13, DEC-15 |
| SEC-03 | Hub-Spoke 제어망은 MVP에서 Tailscale을 사용하되, Dashboard/Risk 접근망으로 확장하지 않아야 한다. | DEC-23 |
| SEC-04 | Secret 값, MFA OTP, Access Key, Session Token은 Git과 문서에 기록하지 않아야 한다. | DEC-18 |
| SEC-05 | Phase 1 Dashboard는 Cognito Hosted UI와 앱 레벨 JWT 검증을 사용한다. | DEC-24 |
| SEC-06 | CloudFront/ALB 진입점은 HTTPS만 허용하고, CloudFront 앞단 WAF는 Phase 1 기본 보호선으로 둔다. | DEC-24 |

### 배포/운영 요구사항

| ID | 요구사항 | 근거 선택 |
| --- | --- | --- |
| OPS-01 | AWS 인프라는 Terraform을 source of truth로 관리해야 한다. | DEC-18 |
| OPS-02 | 클러스터 bootstrap, 초기 설정, 운영 검증은 Ansible이 담당해야 한다. | DEC-18 |
| OPS-03 | GitHub Actions는 CI, 이미지 빌드, 테스트, registry push, manifest/value update에 집중해야 한다. | DEC-18 |
| OPS-04 | 런타임 배포 상태와 drift 제어는 GitHub repository와 ArgoCD가 담당해야 한다. | DEC-17, DEC-18 |
| OPS-05 | GitHub Actions는 운영 클러스터에 직접 `kubectl apply`를 수행하지 않아야 한다. | DEC-17, DEC-18 |
| OPS-06 | 운영형 `factory-a`는 failover/failback 기준선을 유지하고, AI snapshot 저장 구조는 failover를 방해하지 않아야 한다. | DEC-19, DEC-20 |
| OPS-07 | 물리 장애 유발은 MVP에서 수동 유지하되, 상태 수집과 evidence pack 생성은 Ansible 자동화 대상으로 둔다. | DEC-18, DEC-19 |

### 비용/범위 요구사항

| ID | 요구사항 | 근거 선택 |
| --- | --- | --- |
| COST-01 | 새 AWS 상시 리소스가 추가되면 비용 baseline 문서를 함께 갱신해야 한다. | DEC-22 |
| COST-02 | 장시간 사용하지 않는 Hub 리소스는 destroy 절차로 비용을 낮출 수 있어야 한다. | DEC-22 |
| COST-03 | Phase 1 Data/Dashboard는 데모 직전 build, 데모 직후 destroy 패턴으로 비용을 낮출 수 있어야 한다. | DEC-24 |
| COST-04 | Phase 1은 데이터 수집, Risk Score, 관제, 사용자 권한, 실시간 push, 일간 보고서 검증에 집중하고 장기 분석/완전 자동 운영은 후속으로 둔다. | DEC-24, DEC-25 |

## 요구사항-설계 추적표

| 요구사항 | 설계 반영 | 검증 방법 | 근거 문서 |
| --- | --- | --- | --- |
| BR-01, BR-02 | 메인 Dashboard에 공장별 상태 카드, 원인, 이상 시스템 목록, 로그를 둔다. | M6에서 상태 카드/이상 목록/로그 패널 확인 | `docs/product/01_user_flow.md`, `docs/planning/03_evaluation_plan.md` |
| FR-01, FR-02, NFR-01 | Edge Agent가 `factory_state`를 3초 주기로 publish한다. | M4에서 IoT Core -> S3 적재와 Risk 처리 확인 | `docs/specs/iot_data_format.md`, `docs/issues/M4_data-plane.md` |
| FR-03, NFR-02 | Edge Agent가 `infra_state`를 20초 주기로 publish하고 cloud-side가 pipeline 상태를 계산한다. | M4에서 infra 상태 적재와 latest 반영 확인 | `docs/specs/iot_data_format.md`, `docs/planning/03_evaluation_plan.md` |
| FR-04, NFR-05 | Lambda data processor가 평균 score와 센서 요약값을 기반으로 Risk Score를 계산한다. | M6에서 Risk Score 변화가 화면에 반영되는지 확인 | `docs/specs/iot_data_format.md`, `docs/specs/data_storage_pipeline.md` |
| FR-05 | IoT Rule이 raw JSON을 `raw/{factory_id}/{source_type}/...` 경로에 저장한다. | M4에서 S3 raw object와 partition 확인 | `docs/planning/05_decision_rationale.md`, `docs/specs/iot_data_format.md` |
| FR-06, NFR-03, NFR-04 | Dashboard Backend/API가 DynamoDB LATEST/HISTORY와 S3 processed result를 조회한다. | M6에서 일반 상태 10~35초, 장애 판정 40~60초 목표 확인 | `docs/specs/data_storage_pipeline.md`, `docs/planning/03_evaluation_plan.md` |
| FR-08~FR-10, NFR-08~NFR-09 | ALB + ECS Fargate Backend + Redis + WebSocket 경로를 사용한다. | M6에서 `/healthz`, REST 조회, WebSocket handshake, DDB Streams 이후 push 지연 확인 | `docs/planning/16_data_dashboard_vpc_workplan.md`, `docs/changes/0012-introduce-container-backend-for-dashboard.md`, `docs/changes/0015-websocket-for-dashboard-realtime.md` |
| FR-11 | Lambda report-generator가 Bedrock으로 일간 보고서를 생성하고 S3/DDB에 기록한다. | 수동 invoke와 다음 09:00 KST 자동 트리거 확인 | `docs/changes/0016-bedrock-for-llm-report.md`, `docs/planning/16_data_dashboard_vpc_workplan.md` |
| ARC-01, OPS-06 | `factory-a` K3s workload는 worker2 preferred, worker1 failover, 조건부 failback을 유지한다. | failover/failback 테스트 결과와 M0 회귀 확인 | `docs/ops/09_failover_failback_test_results.md` |
| ARC-02, ARC-03 | K3s + Edge Agent + IoT Core 구조를 사용한다. | Edge Agent 배포와 MQTT publish 확인 | `docs/planning/05_decision_rationale.md` |
| ARC-04 | IoT Core 이후 IoT Rule/S3 raw와 Lambda/DynamoDB/S3 processed/Dashboard 흐름을 사용한다. | M4, M6, M7 통합 검증 | `docs/specs/data_storage_pipeline.md`, `docs/planning/15_cloud_architecture_final.md` |
| ARC-05, SEC-01 | Dashboard와 Control plane을 네트워크/권한 경계로 분리한다. | M1/M6에서 Dashboard가 ArgoCD/Tailscale/EKS/Spoke API를 직접 조회하지 않음을 확인 | `docs/planning/12_two_vpc_mvp_architecture_decision.md`, `docs/specs/monitoring_dashboard/00_requirements.md` |
| OPS-01 ~ OPS-05 | Terraform, Ansible, GitHub Actions, ArgoCD 책임 경계를 따른다. | M3에서 push -> ECR -> ArgoCD rollout 확인 | `docs/planning/11_delivery_ownership_flow.md` |
| COST-01, COST-02 | 비용 baseline과 destroy 절차를 운영 문서에 유지한다. | AWS 리소스 추가 시 비용 문서 갱신 여부 확인 | `docs/ops/15_aws_cost_baseline.md` |
| COST-03, COST-04 | Data/Dashboard build/destroy 사이클과 Phase 2~4 트리거를 분리한다. | 데모 운영 비용과 상시 운영 비용을 Cost Explorer로 비교 | `docs/ops/15_aws_cost_baseline.md`, `docs/planning/17_expansion_roadmap.md` |

## 검증 기준

요구사항 검증은 마일스톤별로 나눈다.

| 단계 | 검증 초점 | 주요 요구사항 |
| --- | --- | --- |
| M0 | `factory-a` K3s 기준선, 로컬 데이터, Grafana, failover/failback | ARC-01, OPS-06, NFR-07 |
| M1 | Hub 핵심 서비스, VPC/접근 경계 설명 가능성 | ARC-05, SEC-01 |
| M2 | Hub-Spoke 연결과 `factory-a` 테스트 배포 | SEC-03, FR-07 |
| M3 | CI/CD와 ArgoCD rollout | OPS-01 ~ OPS-05 |
| M4 | IoT Core, S3 raw, Lambda data processor, DynamoDB LATEST/HISTORY, S3 processed | FR-01 ~ FR-05, NFR-01, NFR-02 |
| M5 | `factory-b/c` 테스트베드 추가와 3개 공장 Fleet 인식 | BR-04, FR-07 |
| M6 | Risk Twin Dashboard, 상태 카드, 원인, 로그, 지연 목표 | BR-01 ~ BR-03, FR-06, NFR-03, NFR-04 |
| M7 | 운영형/테스트베드형/장애/롤백 통합 시나리오 | 전체 요구사항 회귀 |

## MVP 제외 범위와 후속 요구사항

아래 항목은 요구가 없다는 뜻이 아니라, 현재 MVP에서 핵심 검증을 흐리지 않기 위해 후속 요구사항으로 분리한 것이다.

| 항목 | 현재 분류 | 후속 재검토 조건 |
| --- | --- | --- |
| AWS IoT Greengrass 메인 런타임 | MVP 제외 | 장시간 오프라인 버퍼링, Greengrass fleet 관리, 로컬 메시징이 핵심 병목이 되는 경우 |
| 직접 HTTP API 수신 | MVP 제외 | IoT Core 인증/Rules/S3 경로보다 직접 API가 명확히 단순해지는 경우 |
| 별도 장기 실행 Risk 서비스/worker | MVP 제외 | Lambda 처리 한계, 복잡한 재처리, 별도 스케일링 요구가 확인되는 경우 |
| 별도 이벤트 전용 파이프라인 | MVP 제외 | 평균 score 기반 Risk로 설명하기 어려운 이벤트 요구가 생기는 경우 |
| Timestream / 장기 이력 분석 계층 | Phase 2 후속 | DDB HISTORY 비용 > $30/월, 시계열 쿼리 p95 > 1s, 보존 요구 > 7일 |
| Kinesis / OpenSearch / Multi-AZ | Phase 2 후속 | 메시지율 > 분당 1000건, 로그 검색 주 5회 이상, 상시 운영 결정 |
| IdP federation / Security Hub / PrivateLink | Phase 4 후속 | 외부 공장/사용자/컴플라이언스 요구가 실제 운영 요구로 확정되는 경우 |
| Site-to-Site VPN, TGW, Direct Connect, self-hosted WireGuard | Phase 2+ 후속 | Tailscale 운영 한계나 고객 네트워크 정책 요구가 확인되는 경우 |
| 완전 자동 물리 장애 유발 | Phase 2+ 후속 | 정기 무인 장애 리허설이 운영 요구가 되는 경우 |

## 갱신 규칙

아래 상황이 생기면 이 문서를 함께 갱신한다.

- `docs/planning/`에 새로운 아키텍처 결정이 추가된다.
- `docs/specs/`의 데이터 포맷, API, Dashboard 모델이 바뀐다.
- `docs/issues/`의 마일스톤 완료 기준이 바뀐다.
- `docs/ops/`의 검증 결과가 기존 요구사항 수치를 바꾼다.
- MVP 포함/제외 범위가 바뀐다.
- 새 AWS 상시 리소스나 비용 구조가 추가된다.

## 2026-05-14 수정 방향

이 문서의 최신 요구사항 기준은 Lambda/DynamoDB 데이터 처리 방향이다.

Risk 계산은 별도 장기 실행 `risk-score-engine` 서비스가 아니라 Lambda data processor 내부 로직으로 구현한다. 최신 데이터 저장 source of truth는 `docs/specs/data_storage_pipeline.md`이며, 흐름은 아래와 같다.

```text
IoT Core
  -> IoT Rule -> S3 raw
  -> Lambda data processor
      -> DynamoDB LATEST
      -> DynamoDB HISTORY
      -> S3 processed
Dashboard Web/API
  -> DynamoDB + S3 processed read-only 조회
```
