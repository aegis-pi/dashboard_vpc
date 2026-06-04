# 데모 시나리오

상태: source of truth
기준일: 2026-06-04

수정 이력:
- 2026-06-04 v0.3  AWS 상태 정정(2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성). 1번 Data/Dashboard VPC Phase 1 운영 배포에 따른 Dashboard 데모 섹션 추가.
- 2026-05-08 v0.2  destroy-all 이후 비용 정리 상태 반영.

## 목적

현재 구현된 `factory-a` Safe-Edge 기준선과 1번 Data/Dashboard VPC(워크스트림 B) Phase 1 관제 화면으로 시연 가능한 데모 흐름을 정리한다.

## 현재 가능한 데모

```text
factory-a 단독 Safe-Edge 운영 상태 확인
Grafana 센서/AI dashboard 확인
ArgoCD GitOps sync 확인
Longhorn storage 확인
worker2 장애 -> worker1 failover -> worker2 failback 확인
```

AWS Hub EKS/VPC/namespace/ArgoCD bootstrap 기준선, Hub Prometheus Agent, Grafana/AMP datasource, AWS Load Balancer Controller, Admin UI HTTPS Ingress, Foundation S3 bucket, AMP Workspace, IoT Rule -> S3 raw 적재, `factory-a` IoT Thing/Policy/K3s Secret, Hub IRSA S3/AMP 권한은 2026-05-15 rebuild 후 활성 상태다(`build-all --admin-ui` / `build-hub`). `factory-b`, `factory-c`는 후속 데모다.

## Phase 1 Dashboard 데모 (1번 Data/Dashboard VPC, 운영 배포)

1번 Data/Dashboard VPC는 build/destroy 사이클로 운영한다(`scripts/build/build-data-dashboard.sh` / `scripts/destroy/destroy-data-dashboard.sh`). 일시 root가 build된 상태에서 아래 관제 화면을 시연한다. 영구 자원(CloudFront/Cognito/S3 web/도메인)은 상시 유지된다.

```text
Dashboard Web : https://dashboard.aegis-pi.cloud  (Cognito 로그인)
Dashboard API : https://api.aegis-pi.cloud/healthz
```

보여줄 것:

```text
Login         Cognito Hosted UI 로그인 → 권한(RBAC)에 따른 공장 노출
Fleet         공장별 위험도(안전점수) 카드, 자동 refresh interval
Factory       센서 현황 + 이상 항목 + Timeline(10m/1h/custom) + top_causes 원인, WebSocket 실시간 갱신
Cloud Infra   backend/datastores/data_pipeline/factory_freshness 등 인프라 상태(Fast/Slow collector)
Reports       S3 reports/daily/ 기반 일간 보고서 조회 (PDF/Word 내보내기)
Admin Users   /admin/users 관리자 사용자 생성·수정·삭제 및 공장 권한 편집 (super_admin/org_admin)
```

전달 메시지:
- 단일 공장 엣지(factory-a) 데이터가 IoT Core → Lambda data processor → DynamoDB로 적재되고, ECS Dashboard Backend가 이를 REST/WebSocket으로 본사 관제 화면에 제공한다.
- 실시간 갱신은 준실시간(1~수 초) 기준이며, factory-a Edge Agent 재활성 시 실제 센서 변화가 대시보드에 반영된다(현재 Edge Agent 비활성으로 주입/저장 데이터 기반 시연).
- LLM 일간 보고서 생성기(Bedrock)는 팀원/후속이며, 본 데모는 S3에 적재된 보고서 조회 화면까지 보여준다.

## 데모 순서

### 1. Factory-A 구조 설명

보여줄 것:

```text
master 10.10.10.10
worker1 10.10.10.11
worker2 10.10.10.12
```

전달 메시지:
- 현재 완료된 것은 실제 Raspberry Pi 기반 `factory-a` 운영형 기준선이다.
- worker2가 센서/AI/Audio 우선 노드이고 worker1이 failover standby다.

### 2. ArgoCD GitOps 확인

보여줄 것:

```text
ArgoCD UI: 10.10.10.200
safe-edge-monitoring
safe-edge-ai-apps
```

전달 메시지:
- monitoring과 ai-apps를 분리해 배포한다.
- GitHub repo push 후 ArgoCD UI sync로 반영한다.

### 3. Grafana Dashboard 확인

보여줄 것:

```text
Grafana UI: 10.10.10.202
InfluxDB sensor / AI dashboard
Node Exporter Full 1860
```

전달 메시지:
- 온도/습도/기압과 AI 결과를 InfluxDB에서 읽는다.
- 노드 상태는 Prometheus 1860 dashboard로 본다.

### 4. Longhorn Storage 확인

보여줄 것:

```text
Longhorn UI: 10.10.10.201
InfluxDB PVC
ai-apps PVC 없음
AI snapshot hostPath /var/lib/safe-edge/snapshots
```

전달 메시지:
- 시계열 데이터와 AI 추론 결과는 InfluxDB PVC를 통해 Longhorn에 저장된다.
- AI event snapshot은 node-local hostPath에 임시 저장하고, 24시간 cleanup과 매일 03:00 KST purge를 적용했다.

### 5. 장애 복구 결과 설명

보여줄 것:

```text
docs/ops/09_failover_failback_test_results.md
```

전달 메시지:
- LAN 제거와 k3s-agent 중지 테스트에서 failover/failback이 성공했다.
- AI snapshot PVC 제거 후 Longhorn Multi-Attach 없이 AI가 worker1로 정상 failover됐다.
- 데이터 공백과 중복 write 후보도 측정했다.

## 핵심 수치

```text
전원 제거 첫 관찰 -> worker2 NotReady: 약 42초
worker2 NotReady -> worker1 전체 Running: 약 32초
전원 제거 첫 관찰 -> worker1 전체 Running: 약 74초
전원 재연결 첫 관찰 -> worker2 전체 Running: 약 2분 11초
failover 1초 bucket 최대 공백: 65-75초
failback 1초 bucket 최대 공백: 2초
```

## 데모 성공 기준

```text
ArgoCD apps Synced / Healthy
Grafana dashboard 갱신
Longhorn volumes healthy
대상 Pod 3개 worker2 Running
장애 테스트 결과 문서화 완료
```
