# Ops Docs

이 디렉터리는 실제 운영, 점검, 장애 대응, 인증서 주입 같은 실행 절차 문서를 둔다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_quick_start.md` | `factory-a` 현재 상태와 빠른 확인 명령 |
| `01_safe_edge_bootstrap.md` | Safe-Edge 기준선 구축 절차 |
| `02_self_check.md` | 운영자가 직접 상태를 점검하는 기준 |
| `03_test_checklist.md` | 장애/데이터/통합 테스트 체크리스트 |
| `04_troubleshooting.md` | 구축과 운영 중 발생한 문제와 해결 기록 |
| `05_factory_a_status.md` | `factory-a`의 최신 운영 상태 요약 |
| `06_argocd_gitops.md` | ArgoCD GitOps 운영 방식 |
| `07_grafana_dashboard.md` | Grafana dashboard 구성과 확인 기준 |
| `08_data_retention.md` | InfluxDB, snapshot, Longhorn 데이터 보존 기준 |
| `09_failover_failback_test_results.md` | failover/failback 검증 결과 |
| `10_edge_workload_placement.md` | Edge workload 배치 정책 |
| `11_ansible_test_automation.md` | Ansible 기반 반복 점검 자동화 계획 |
| `12_iot_core_thing_secret_mount.md` | IoT Core Thing 등록과 K3s Secret mount 절차 |
| `13_hub_namespace_baseline.md` | Hub EKS namespace 기준 |
| `14_hub_run_commands.md` | Hub 실행 및 ArgoCD 초기 비밀번호 확인 명령어 |
| `15_aws_cost_baseline.md` | AWS Hub 시간당 비용 기준과 갱신 규칙 |
| `16_hub_prometheus_amp.md` | Hub Prometheus Agent와 AMP remote_write 운영 기준 |
| `17_hub_grafana_amp.md` | Hub 내부 Grafana와 AMP datasource 운영 기준 |
| `18_factory_b_mac_utm_k3s.md` | Mac UTM 기반 `factory-b` 테스트베드 K3s 구성 사전 |
| `19_factory_c_windows_virtualbox_k3s.md` | Windows VirtualBox 기반 `factory-c` K3s 구축과 IoT 데이터 송신 검증 |
| `20_tailscale_hub_spoke_runbook.md` | Tailscale 기반 Hub-Spoke 연결 실행 절차 |
| `21_hub_admin_ui_ingress.md` | ArgoCD/Grafana 관리자 HTTPS Ingress 운영 절차 |
| `22_data_dashboard_vpc_runbook.md` | 1번 Data/Dashboard VPC apply/destroy 및 backend image rollout 절차 |

## 기준

- 현재 실제 운영 절차는 이 디렉터리의 문서를 우선한다.
- 요구사항 정의서/SRS는 운영 절차 문서가 아니므로 `docs/report/03_요구사항정의서.md`와 `docs/product/02_requirements_definition.md`를 기준으로 한다.
- 비밀번호, token, private key, certificate 원문은 문서에 기록하지 않는다.
- AWS 리소스, 상시 실행 컴포넌트, 저장소, 네트워크 경로가 추가되면 `15_aws_cost_baseline.md`의 비용 기준을 함께 갱신한다.
