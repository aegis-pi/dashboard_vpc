# Aegis-Pi Risk Twin

> Safe-Edge 기반 단일 공장 엣지를 멀티 공장 중앙 관제 구조로 확장하는 Risk Twin 플랫폼

## 프로젝트 개요

기존 Safe-Edge는 Raspberry Pi 3-node K3s 클러스터 기반의 단일 공장 엣지 모니터링 시스템이다.
Aegis-Pi는 이 기준선을 먼저 `factory-a`로 복구하고, 이후 AWS Hub와 테스트베드 Spoke로 확장한다.

| 항목 | 내용 |
| --- | --- |
| 프로젝트명 | Aegis-Pi Risk Twin |
| 현재 단계 (본 환경 = 워크스트림 B) | **Phase 1 Step 10 운영 정리** — 1번 Data / Dashboard VPC 운영 배포 및 build/destroy 절차 정리 |
| 현재 단계 (워크스트림 A · 팀) | M3 Issue 2 ECR push/pull 검증 등. 본 환경에서는 수정/실행하지 않음 |
| AI 에이전트 진입점 | `docs/AI_AGENT_HARNESS.md` — phase별 DoD · 허용/금지 파일 · 검증 명령 · 프롬프트 가이드 |
| 현재 완료 범위 | M0 `factory-a`, M1 Issue 0~10/12, M2 Issue 1~6, M3 Issue 1/4 완료. 워크스트림 B는 Data/Dashboard Backend/Web, Cloud Infra, RBAC 사용자 관리, Reports S3 조회, 이미지 스냅샷, AI 채팅 데이터 QA까지 운영 배포 완료 |
| 현재 AWS 상태 | 2026-05-15 rebuild 이후 Hub/Foundation/IoT/Admin UI 기준 관리. Data/Dashboard는 `infra/data-dashboard/` 재생성 root와 `infra/data-dashboard-dns/`, `infra/data-dashboard-permanent/` 영구 root로 분리 운영 |
| 다음 작업 (본 환경) | Data/Dashboard 운영 문서/데모 정리, 인증 사용자 수기 검증, LLM 보고서 생성기 후속. 상세는 `docs/ops/22_data_dashboard_vpc_runbook.md`와 `docs/planning/16_data_dashboard_vpc_workplan.md` |
| 비용 기준 | Data/Dashboard 데모/상시/destroy 후 잔여 비용은 `docs/ops/15_aws_cost_baseline.md` 기준. destroy 후에도 Terraform backend S3, Route53 hosted zone, permanent root, RDS final snapshot은 유지 |

## Data/Dashboard 빠른 실행

올리기:

```bash
scripts/build/build-data-dashboard.sh
```

내리기:

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud
```

비대화형 destroy가 필요한 자동화에서만:

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud --yes
```

root 역할:

| root | 역할 |
| --- | --- |
| `infra/data-dashboard/` | VPC, NAT, ALB, ECS Backend, RDS, Redis, Lambda 등 재생성 자원 |
| `infra/data-dashboard-dns/` | Route53 hosted zone 영구 자원 |
| `infra/data-dashboard-permanent/` | Cognito, ECR, S3 web, CloudFront, report table, GitHub OIDC 영구 자원 |
| `infra/foundation/` | 워크스트림 A 공용 기반 자원. Data/Dashboard build/destroy 대상 아님 |

상세 절차는 `docs/ops/22_data_dashboard_vpc_runbook.md`를 따른다.

## 현재 완료된 Factory-A 기준선

```text
Cluster: Raspberry Pi 3-node K3s
K3s: v1.34.6+k3s1
master: 10.10.10.10
worker1: 10.10.10.11
worker2: 10.10.10.12

ArgoCD UI: 10.10.10.200
Longhorn UI: 10.10.10.201
Grafana UI: 10.10.10.202

GitOps repo: https://github.com/aegis-pi/safe-edge-config-main.git
```

현재 `factory-a`에서 완료된 항목:

- K3s 3-node cluster
- Longhorn PVC storage
- MetalLB 내부 IP 노출
- ArgoCD Helm 설치
- GitHub GitOps repo 기반 배포
- `monitoring`, `ai-apps` ArgoCD Application 분리
- InfluxDB `safe_edge_db` 1일 retention
- Grafana InfluxDB dashboard
- Prometheus Node Exporter Full `1860` dashboard
- worker2 preferred affinity + 30초 `tolerationSeconds`
- master OS cron 기반 Kubernetes-only failback
- `safe-edge-image-prepull` DaemonSet
- AI event snapshot node-local hostPath + 24시간 cleanup + 매일 03:00 KST purge
- AI inference result는 InfluxDB PVC를 통해 Longhorn 저장
- worker2 LAN 제거 장애 테스트
- worker2 `k3s-agent` 중지 장애 테스트
- 과거 worker2 전원 제거 장애 테스트

## 현재 로컬 구조

```text
factory-a
├── master  (10.10.10.10)
├── worker1 (10.10.10.11, failover standby)
└── worker2 (10.10.10.12, sensor / AI / audio preferred)
```

Namespace:

```text
argocd
longhorn-system
monitoring
ai-apps
```

## 현재 배포 흐름

```text
safe-edge-config-main GitHub repo
    -> ArgoCD UI refresh / sync
    -> safe-edge-monitoring
    -> safe-edge-ai-apps
    -> factory-a K3s
```

현재는 로컬 `factory-a` GitOps 기준선이 완료된 상태다. GitHub Actions, ECR, AWS Hub ApplicationSet은 후속 단계에서 진행한다.

## 현재 Mesh VPN 기준

2026-05-07 기준 Tailscale Tailnet policy/tag 기준을 적용했고, 운영형 Spoke 대표 노드인 `factory-a-master`를 Tailnet에 참여시켰다. Worker 노드는 초기 M2 참여 대상에서 제외한다. EKS Hub는 Tailscale Kubernetes Operator로 Tailnet egress를 구성했고, ArgoCD는 이 경로로 `factory-a` K3s API에 접근한다.

| 대상 | Device name | Tailscale IPv4 | 상태 |
| --- | --- | --- | --- |
| `factory-a` Raspberry Pi master | `factory-a-master` | `100.117.40.125` | Connected, tagged |
| EKS operator | `tailscale-operator` | `100.92.186.18` | Connected, tagged |
| ArgoCD -> factory-a egress proxy | `argocd-factory-a-master-tailnet` | `100.104.73.68` | Connected, tagged |
| Windows 운영자 PC | `minsoog14` | `100.67.181.8` | Connected |

`factory-a-master`에는 `tag:aegis-spoke-prod`, `tag:factory-a`를 적용했다. Windows 운영자 PC에서 `100.117.40.125` ping 및 SSH 접근을 확인했다. EKS 내부에서 `factory-a-master-tailnet:6443` TCP open, ArgoCD `factory-a` cluster `Successful`, `factory-a-podinfo-smoke` `Synced` + `Healthy`를 확인했다.

M2 단기 UI 접근 기준:

```text
ArgoCD Tailscale UI: https://100.108.140.35/ -> HTTP 200
Grafana Tailscale health: http://100.108.4.6/api/health -> HTTP 200
Public ALB: 단기 유지
```

## 현재 Hub bootstrap 기준

M1 Issue 0~10에서는 AWS MFA/Terraform 접근, Hub EKS/VPC 기준선, Hub namespace 기준선, Hub ArgoCD bootstrap, foundation S3 data bucket `aegis-bucket-data`, AMP Workspace `AEGIS-AMP-hub`, `factory-a` IoT Thing/certificate/policy/K3s Secret, IoT Rule -> S3 `raw/` prefix 적재, M1 검증용 `risk/risk-normalizer` IRSA S3 권한, `observability/prometheus-agent` 설치 및 AMP remote_write 수신, Grafana AMP datasource query, AWS Load Balancer Controller, Route53/ACM, ArgoCD/Grafana HTTPS Admin Ingress를 검증했다.

2026-05-08 기준 `scripts/build/build-hub.sh`는 Hub EKS bootstrap 이후 Tailscale Operator, `factory-a` egress, ArgoCD/Grafana Tailscale UI, ArgoCD `factory-a` cluster Secret까지 자동 복구/검증한다. 기본 전체 재생성은 `scripts/build/build-all.sh`, Admin UI까지 포함한 재생성은 `scripts/build/build-all.sh --admin-ui`, 전체 삭제는 `scripts/destroy/destroy-all.sh`를 사용한다. `destroy-all.sh`는 AWS MFA 전에 `factory-a` K3s IoT Secret을 먼저 삭제하고, 이후 IoT/Hub/foundation을 정리한다. 비용 기준은 `docs/ops/15_aws_cost_baseline.md`를 따른다.

앞으로 모든 작업은 `docs/planning/11_delivery_ownership_flow.md`의 책임 경계를 따른다.

책임 범위는 아래처럼 분리한다.

| 경로 | 역할 | 현재 상태 |
| --- | --- | --- |
| `infra/hub` | VPC, subnet, NAT Gateway, EKS cluster, node group, Route53/ACM, EKS OIDC 기반 IRSA | 워크스트림 A 기준으로 rebuild/운영 |
| `scripts/ansible/playbooks` | kubeconfig 갱신, namespace, LimitRange, ArgoCD Helm install, Prometheus Agent remote_write, Grafana AMP datasource, AWS Load Balancer Controller, Admin UI Ingress bootstrap/검증 | rebuild 시 재실행 |
| `infra/foundation` | S3, AMP Workspace, IoT Rule 같은 EKS destroy와 분리할 영속 리소스 | 워크스트림 A 공용 기반 자원. Data/Dashboard build/destroy 대상 아님 |

Hub 기본값:

```text
Region: ap-south-1
VPC CIDR: 10.0.0.0/16
AZ: ap-south-1a, ap-south-1c
EKS: AEGIS-EKS
Kubernetes: 1.34
Node group: AEGIS-EKS-node, t3.medium x 2
Naming: AEGIS-[resource]-[feature]-[zone]
```

## 현재 데이터 흐름

```text
BME280 / camera / mic / AI
    -> ai-apps workloads
    -> InfluxDB safe_edge_db
    -> Grafana dashboard
```

저장 정책:

- InfluxDB retention: 1일
- AI event snapshot: `/app/snapshots`
- AI event snapshot backing: node-local `/var/lib/safe-edge/snapshots`
- AI snapshot cleanup: 24시간 초과 이미지 삭제
- AI snapshot daily purge: 매일 03:00 KST 전체 비우기
- AI inference result: InfluxDB PVC를 통해 Longhorn에 저장

## 장애 검증 결과

LAN 제거 테스트:

```text
Failover: 성공
Failback: 성공
AI/audio/BME worker1 Running 성공
worker2 복구 후 worker2 failback 성공
Longhorn Multi-Attach 재발 없음
10초 bucket 기준 데이터 공백: AI/audio 약 80초, BME 약 70초
```

`k3s-agent` 중지 테스트:

```text
Failover: 성공
Failback: 성공
AI/audio/BME worker1 Running 성공
worker2 복구 후 worker2 failback 성공
Longhorn Multi-Attach 재발 없음
```

LAN 제거 InfluxDB 공백:

```text
1초 bucket:
  ai_detection:        87초
  acoustic_detection:  90초
  environment_data:    83초

10초 bucket 운영 기준:
  ai_detection:        80초
  acoustic_detection:  80초
  environment_data:    70초
```

## 목표 확장 구조

최신 확정 클라우드 아키텍처는 `docs/planning/15_cloud_architecture_final.md`를 기준으로 한다.

```text
AWS EKS Hub
    ├── factory-a  (현재 완료된 운영형 Raspberry Pi Safe-Edge)
    ├── factory-b  (후속 Mac mini VM 테스트베드)
    └── factory-c  (후속 Windows VM 테스트베드)

2번 VPC: Control / Management
    └── EKS Hub / Hub ArgoCD / Tailscale / Prometheus Agent / Grafana

1번 VPC: Data / Dashboard
    └── ALB / WAF / Dashboard Web/API / Lambda data processor / DynamoDB LATEST+HISTORY / S3 processed
```

후속 확장에서는 `edge-agent`를 추가해 `factory-a` 로컬 데이터와 노드/장치/워크로드 상태를 AWS IoT Core로 송신하고, IoT Core -> S3 raw 보존, IoT Core -> Lambda -> DynamoDB/S3 processed 데이터 플레인, ApplicationSet 기반 배포를 추가한다.

사용자 대시보드는 Tailscale에 의존하지 않는 1번 Data / Dashboard VPC에서 제공한다. Dashboard Web/API는 processed data와 latest status를 조회하고, ArgoCD/Tailscale/EKS API 같은 제어 plane에는 직접 접근하지 않는다.

### 2026-05-13 멘토링 반영: 목표 구조 보강

아래 표의 `기존 초안` 열은 당시 표현을 보존한 비교용이다. 2026-05-14 최신 구현 기준은 오른쪽 보강 방향의 Lambda/DynamoDB 데이터 플레인을 따른다.

| 항목 | 기존 초안 | 멘토링 후 보강 방향 |
| --- | --- | --- |
| VPC 분리 | Control / Management VPC와 Data / Dashboard VPC를 분리 | 2VPC가 항상 정답이라는 표현은 피하고, 고객 요구사항상 역할/접근/보안 책임이 분리되는 경우를 고려한 목표 구조로 설명 |
| 데이터 흐름 | IoT Core -> S3 raw -> 별도 위험도 서비스 -> Dashboard | 최신 기준은 IoT Core -> IoT Rule -> S3 raw와 IoT Core -> Lambda -> DynamoDB LATEST/HISTORY + S3 processed 병렬 경로. S3 raw는 원본 보존/재처리/리포트 입력으로 두고 Dashboard는 DynamoDB hot store를 우선 조회 |
| 실시간성 | 관제 화면의 최신 상태 표시 | 초저지연 실시간 제어가 아니라 1~5초 또는 수십 초 기준의 준실시간 관제로 정의하고, 데이터 주기/크기/성공률/지연시간을 수치로 검증 |
| VM Spoke | factory-b/c를 테스트베드 Spoke로 추가 | 실제 공장 대체가 아니라 topic/prefix 분리, 수신 성공률, 지연시간, Risk Score 분리 계산을 검증하는 VM 테스트베드로 설명 |
| CI/CD | GitHub Actions/ECR/ArgoCD 배포 파이프라인 | 일일 운영 리포트가 제안하는 모델/설정 업데이트 후보를 운영자 승인 후 GitOps로 배포하는 운영 피드백 루프로 설명 |

즉, 기존 구조를 폐기하는 것이 아니라 평가/실무 관점에서 설계 이유와 검증 기준을 더 명확히 추가한다.

## 구현 단계

> 본 표는 **마일스톤 축**이다. 본 환경(워크스트림 B)의 **확장 단계 축**(Phase 1~4) 은 `docs/planning/17_expansion_roadmap.md`, **실제 구현 Step 축**(Step 0~10) 은 `docs/planning/16_data_dashboard_vpc_workplan.md` 와 `docs/AI_AGENT_HARNESS.md` § 5.4. 세 축의 매핑은 harness § 4 / § 5.6 참조.

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| Phase 0 | 문서 기준선 고정 | 완료 |
| M0 | `factory-a` Safe-Edge 기준선 구축 | 완료 (Issue 6 NFS, Issue 12 일부 보류) |
| M1 | AWS EKS Hub 기준선 구성 | 핵심 완료, Issue 0~10/12 완료, Issue 11 보류 |
| M2 | Hub-Spoke 연결 (Tailscale) | 완료, Issue 1~6 완료 |
| M3 | 배포 파이프라인 (Helm/ECR/GHA/ArgoCD) | Issue 1/4 완료. Issue 2/3/5~8 진행 중·미진행 — **워크스트림 A 영역, 본 환경 미진행** |
| M4 | 데이터 플레인 (소비측) | **본 환경 = Phase 1 Step 4/5/9 로 매핑**. 송신측(Issue 1~5)은 워크스트림 A |
| M5 | `factory-b`, `factory-c` VM Spoke 확장 | 대기 — 워크스트림 A 영역 |
| M6 | Risk Twin + Dashboard | **본 환경 = Phase 1 Step 1/3/6/8/9 로 매핑** |
| M7 | 통합 검증 | 대기 — repo/CD 분리 결정 포함 |
| 본 환경 워크스트림 B Phase 1 | ECS Fargate Backend + RDS PostgreSQL + Redis + WebSocket + Dashboard Web/API 운영 배포 | Step 0~10 대부분 완료. 운영 문서/데모 정리와 LLM 보고서 생성기 후속 |

2026-05-13 멘토링 이후 Phase 6에는 MVP 최소 범위의 일일 운영 리포트 초안을 포함하는 방향을 검토한다. 이 리포트는 자동 재학습이나 자동 배포가 아니라, S3 raw/processed/latest와 사고 이미지, Risk 결과를 바탕으로 Edge AI 판단의 실패/불확실 사례와 모델/설정 업데이트 후보를 정리하는 용도다.

## 문서 구조

```text
docs/
├── README.md
├── issues/
├── changes/
├── ops/
│   ├── 00_quick_start.md
│   ├── 01_safe_edge_bootstrap.md
│   ├── 03_test_checklist.md
│   ├── 04_troubleshooting.md
│   ├── 05_factory_a_status.md
│   ├── 06_argocd_gitops.md
│   ├── 07_grafana_dashboard.md
│   ├── 08_data_retention.md
│   ├── 09_failover_failback_test_results.md
│   ├── 10_edge_workload_placement.md
│   ├── 11_ansible_test_automation.md
│   ├── 12_iot_core_thing_secret_mount.md
│   ├── 13_hub_namespace_baseline.md
│   ├── 14_hub_run_commands.md
│   └── 15_aws_cost_baseline.md
├── architecture/
├── planning/
│   ├── 00_project_overview.md
│   ├── 01_safe_edge_transition.md
│   ├── 02_implementation_plan.md
│   ├── 03_evaluation_plan.md
│   ├── 04_document_creation_priority.md
│   ├── 05_decision_rationale.md
│   ├── 06_edge_agent_deployment_plan.md
│   ├── 07_dashboard_vpc_extension_plan.md
│   ├── 08_aws_cli_mfa_terraform_access.md
│   ├── 09_m1_eks_vpc_decision_record.md
│   ├── 10_portfolio_idea_assessment.md
│   └── 11_delivery_ownership_flow.md
├── product/
├── specs/
├── demo/
├── presentation/
└── report/
```

```text
infra/
├── hub/
├── foundation/
├── safe-edge/
├── mesh-vpn/
└── deploy/
```

## 추천 읽기 순서

### AI 에이전트용 최단 진입 (본 환경에서 새 작업을 시작할 때)

1. `docs/AI_AGENT_HARNESS.md` — phase별 DoD · 허용/금지 · 검증 · 프롬프트 가이드
2. `docs/issues/SESSION_STATE.md` — 현재 상태 스냅샷
3. `docs/planning/16_data_dashboard_vpc_workplan.md` — Phase 1 Step 0~10
4. `docs/planning/17_expansion_roadmap.md` — Phase 1~4 트리거
5. `docs/planning/11_delivery_ownership_flow.md` — Terraform/Ansible/GHA/ArgoCD 책임 경계
6. `docs/changes/README.md` — ADR 0001~0017 색인

### 사람 / 신규 합류 멤버용 (배경 + 현재 운영)

1. `docs/planning/00_project_overview.md`
2. `docs/ops/05_factory_a_status.md`
3. `docs/ops/00_quick_start.md`
4. `docs/ops/06_argocd_gitops.md`
5. `docs/ops/07_grafana_dashboard.md`
6. `docs/ops/08_data_retention.md`
7. `docs/ops/09_failover_failback_test_results.md`
8. `docs/ops/10_edge_workload_placement.md`
9. `docs/ops/11_ansible_test_automation.md`
10. `docs/planning/06_edge_agent_deployment_plan.md`
11. `docs/planning/07_dashboard_vpc_extension_plan.md`
12. `docs/planning/09_m1_eks_vpc_decision_record.md`
13. `docs/planning/15_cloud_architecture_final.md`
14. `docs/issues/M0_factory-a_safe-edge-baseline.md`
15. `docs/issues/M1_hub-cloud.md`
16. `docs/ops/13_hub_namespace_baseline.md`
17. `docs/ops/14_hub_run_commands.md`

## 문서 상태 기준

| 상태 | 의미 |
| --- | --- |
| `source of truth` | 현재 구현/운영 기준 문서 |
| `draft` | 방향은 있으나 세부값 미정 |
| `candidate` | 후속 확장 또는 검토용 |

기준일: 2026-05-19
