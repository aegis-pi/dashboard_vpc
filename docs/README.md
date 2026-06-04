# Aegis-Pi Docs

상태: source of truth
기준일: 2026-06-04

## 목적

이 디렉터리는 Aegis-Pi 프로젝트의 설계, 운영, 검증, 시연, 보고 문서를 관리한다.

## 현재 상태

- 현재 완료된 구현 범위는 `factory-a` Safe-Edge 기준선, M1 Hub Issue 0~10/12, M2 Issue 1~6, M3 Issue 1/4이다.
- `factory-a`는 Raspberry Pi 3-node K3s 기반 운영형 Spoke다.
- 2026-04-30 기준 AI snapshot은 node-local hostPath를 사용하며, AI 추론 결과는 InfluxDB PVC를 통해 Longhorn에 저장한다.
- 2026-04-30 기준 LAN 제거 및 `k3s-agent` 중지 failover/failback 재검증을 완료했다.
- 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI가 활성 상태다.
- **1번 Data/Dashboard VPC(워크스트림 B)는 Phase 1 Step 0~9.5 구현 완료 후 운영 배포 단계다(Step 10 운영 자동화/데모 진행 중).** Step 9.5 permanent split 이후 `infra/data-dashboard` 일시 root를 build/destroy 사이클로 운영하며, 영구 자원(CloudFront/Cognito/S3 web/ECR/도메인)은 `infra/data-dashboard-permanent`/`infra/data-dashboard-dns`에 상시 유지된다. 운영 backend image `sha-e96bf81`(ECS revision 37), https://dashboard.aegis-pi.cloud / https://api.aegis-pi.cloud 활성. destroy 사이클 시 Terraform backend S3 bucket·RDS final snapshot·permanent/dns 자원만 잔존. 코드는 UI 마무리 보정만 남기고 구현 완료.
- `build-hub`는 AWS Hub EKS/VPC/NAT/EIP, ArgoCD, Prometheus Agent, Grafana, AWS Load Balancer Controller, Admin UI, Hub Tailscale Operator/egress/UI/cluster Secret 복구를 자동화한다.
- M1 Issue 5에서 IoT Rule -> S3 raw 적재와 M1 검증용 `risk/risk-normalizer` IRSA S3 권한 검증을 완료했다. 최신 데이터 처리 방향은 Lambda data processor와 DynamoDB/S3 processed다.
- M1 Issue 6에서 AMP Workspace와 `observability/prometheus-agent` IRSA remote_write 권한 검증을 완료했다.
- M1 Issue 7에서 Hub Prometheus Agent를 설치하고 AMP Query API로 `up{cluster="AEGIS-EKS"}` 수신을 검증했다.
- M1 Issue 8에서 내부 Grafana를 설치하고 AMP datasource를 SigV4 + IRSA로 검증했다.
- M1 Issue 9에서 AWS Load Balancer Controller를 설치하고 IRSA/subnet discovery 기준을 검증했다.
- M1 Issue 10에서 `argocd.minsoo-tech.cloud`, `grafana.minsoo-tech.cloud` HTTPS Admin Ingress를 공유 Public ALB로 검증했다.
- M1 Issue 12에서 `configs/runtime/runtime-config.yaml`과 VM dummy data 추천값을 작성했다.
- M2 Issue 1에서 Tailnet/tag/Auth Key 정책을 수립하고 Tailnet을 확인했다.
- M2 Issue 2에서 `factory-a-master` Tailscale 참여, tag 적용, Windows 운영자 PC의 ping/SSH 접근을 검증했다.
- M2 Issue 3에서 EKS Hub Tailscale Operator 설치, egress Service 생성, EKS 내부 `factory-a-master` K3s API TCP `6443` reachability, ArgoCD/Grafana Tailscale IP UI 접근 검증까지 완료했다.
- M2 Issue 4/5에서 `tls-server-name: 10.10.10.10` 기반 `factory-a` kubeconfig와 ArgoCD cluster 등록을 완료했고, cluster status `Successful`을 확인했다.
- M2 Issue 6에서 `factory-a-podinfo-smoke` Application을 `factory-a`에 Sync해 `Synced` + `Healthy`, Pod 2개 `Running`을 확인했고, Tailscale egress Service 삭제 시 sync failure 및 재생성 후 복구를 검증했다.
- M3 Issue 1에서 `aegis-pi-gitops` GitOps 저장소 구조, `aegis-spoke` Helm chart, 공장별 values, ApplicationSet skeleton, manifest validation workflow를 완료했다.
- 워크스트림 A는 M3 Issue 2 ECR push/pull 검증을 진행 중이며, 본 환경에서는 수정/실행하지 않는다.
- 본 환경(워크스트림 B)은 1번 Data/Dashboard VPC Phase 1 Step 0~9.5를 구현 완료하고 Dashboard Backend/Web/Cloud Infra/RBAC/보고서 조회를 운영 배포했다. 현재는 Step 10 운영 자동화/데모와 UI 마무리 보정 단계다.
- `factory-b`, `factory-c`, GitHub Actions build/deploy CI는 워크스트림 A/후속 단계다.
- 현재 운영 source of truth는 `docs/ops/` 문서다.
- 마일스톤 추적은 `docs/issues/` 문서를 따른다.
- 계획과 실제 구현이 달라진 결정은 `docs/changes/`에서 추적한다.
- 사용자 대시보드는 `planning/16_data_dashboard_vpc_workplan.md`와 `planning/17_expansion_roadmap.md`의 Phase 1 통합 목표를 따른다.
- AWS CLI MFA 및 Terraform 접근 준비는 `planning/08_aws_cli_mfa_terraform_access.md`를 따른다.
- 인프라/설정/CI/CD 책임 경계는 `planning/11_delivery_ownership_flow.md`를 따른다.
- M1 EKS/VPC 설계 결정은 `planning/09_m1_eks_vpc_decision_record.md`를 따른다.
- AWS 리소스 비용 기준과 갱신 규칙은 `ops/15_aws_cost_baseline.md`를 따른다.

## 먼저 읽을 문서

1. `issues/SESSION_STATE.md`
2. `AI_AGENT_HARNESS.md`
3. `planning/16_data_dashboard_vpc_workplan.md`
4. `planning/17_expansion_roadmap.md`
5. `planning/15_cloud_architecture_final.md`
6. `ops/22_data_dashboard_vpc_runbook.md`
7. `ops/15_aws_cost_baseline.md`
8. `product/02_requirements_definition.md`
9. `report/03_요구사항정의서.md`
10. `ops/05_factory_a_status.md`
11. `ops/00_quick_start.md`
12. `ops/01_safe_edge_bootstrap.md`
13. `ops/06_argocd_gitops.md`
14. `ops/07_grafana_dashboard.md`
15. `ops/08_data_retention.md`
16. `ops/09_failover_failback_test_results.md`
17. `ops/10_edge_workload_placement.md`
18. `ops/11_ansible_test_automation.md`
19. `ops/12_iot_core_thing_secret_mount.md`
20. `changes/README.md`
21. `planning/11_delivery_ownership_flow.md`
22. `issues/MASTER_CHECKLIST.md`

## 문서 구조

```text
docs/
├── README.md
├── issues/
│   ├── MASTER_CHECKLIST.md
│   ├── M0_factory-a_safe-edge-baseline.md
│   └── M1~M7...
├── changes/
│   ├── README.md
│   └── 0001~...
├── ops/
│   ├── 00_quick_start.md
│   ├── 01_safe_edge_bootstrap.md
│   ├── 02_self_check.md
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
│   ├── 15_aws_cost_baseline.md
│   ├── 16_hub_prometheus_amp.md
│   ├── 17_hub_grafana_amp.md
│   ├── 18_factory_b_mac_utm_k3s.md
│   ├── 19_factory_c_windows_virtualbox_k3s.md
│   ├── 20_tailscale_hub_spoke_runbook.md
│   ├── 21_hub_admin_ui_ingress.md
│   └── 22_data_dashboard_vpc_runbook.md
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

## 현재 운영 기준

```text
master: 10.10.10.10
worker1: 10.10.10.11
worker2: 10.10.10.12
ArgoCD UI: 10.10.10.200
Longhorn UI: 10.10.10.201
Grafana UI: 10.10.10.202
GitOps repo: https://github.com/aegis-pi/safe-edge-config-main.git
safe-edge-ai-apps revision: 8e9ae861d9e374e24edaba5efbe63c785292878a
factory-a-master Tailscale IPv4: 100.117.40.125
Windows operator PC Tailscale IPv4: 100.67.181.8
```

## 현재 Hub 기준

```text
AWS actual state: Hub/Foundation/IoT/Admin UI active after 2026-05-15 rebuild; 1번 Data/Dashboard VPC destroyed on 2026-05-22
Hub bootstrap roots:
- infra/hub: VPC/EKS/node group, Route53/ACM, IRSA
- scripts/ansible: namespace/LimitRange/ArgoCD/Prometheus Agent/Grafana/AWS Load Balancer Controller/Admin UI Ingress bootstrap
- infra/foundation: S3 data bucket, AMP Workspace, IoT Rule, and future durable resources
Build entrypoint: scripts/build/build-all.sh
Admin UI post-NS entrypoint: scripts/build/build-admin-ui-after-ns.sh
Hub UI entrypoint after rebuild: https://argocd.minsoo-tech.cloud and https://grafana.minsoo-tech.cloud
Local fallback UI entrypoint: scripts/ops/argocd-port-forward.sh, scripts/ops/grafana-port-forward.sh
Hub destroy entrypoint: scripts/destroy/destroy-hub.sh
Data/Dashboard build entrypoint: scripts/build/build-data-dashboard.sh
Data/Dashboard destroy entrypoint: scripts/destroy/destroy-data-dashboard.sh
Full destroy entrypoint: scripts/destroy/destroy-all.sh
Cost baseline: docs/ops/15_aws_cost_baseline.md
Delivery flow: Terraform -> Ansible -> GitHub Actions CI -> GitHub/ArgoCD CD
```

## 문서 상태 규칙

- `source of truth`: 현재 구현/운영 기준 문서
- `draft`: 방향은 있으나 세부값이 미정인 문서
- `candidate`: 후속 확장 또는 검토용 문서

## 작성 원칙

- 완료된 `factory-a` 내용과 후속 Hub 확장 내용을 섞지 않는다.
- SSH 비밀번호, 토큰, 인증 정보는 문서에 기록하지 않는다.
- ArgoCD repo 등록과 dashboard 등록처럼 UI에서 수행하는 작업은 UI 절차로 명시한다.
- 테스트 결과는 시간, 측정 기준, 해석을 함께 남긴다.
- AWS 리소스나 상시 운영 경로를 추가하면 비용 영향을 분석하고 `ops/15_aws_cost_baseline.md`를 갱신한다.

## 다음 문서 업데이트 우선순위

1. `apps/dashboard-web/**` 마이그레이션 결과에 맞춘 화면 설계서 갱신
2. `apps/dashboard-backend/**` 구현 결과에 맞춘 Data/Dashboard runbook 갱신
3. `docs/ops/15_aws_cost_baseline.md` 실측 비용 재갱신
4. `docs/issues/SESSION_STATE.md` 작업 스냅샷 갱신
