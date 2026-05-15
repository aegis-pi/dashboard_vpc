# docs/ops/ AGENTS.md

> 실제 운영·점검·장애 대응 절차 문서 (도구 중립).
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- **본 디렉터리는 Aegis-Pi 운영의 source of truth**다
- 운영 절차가 실제 구현과 어긋날 경우 우선 이쪽을 갱신한다

## 파일 (현재 운영 기준)

| 파일 | 내용 |
| --- | --- |
| `00_quick_start.md` | factory-a 빠른 확인 명령 + 진입점 |
| `01_safe_edge_bootstrap.md` | Safe-Edge 기준선 구축 절차 |
| `02_self_check.md` | 운영자 직접 점검 기준 |
| `03_test_checklist.md` | 장애/데이터/통합 테스트 체크리스트 |
| `04_troubleshooting.md` | 구축/운영 중 발생한 문제와 해결 |
| `05_factory_a_status.md` | factory-a 최신 운영 상태 요약 |
| `06_argocd_gitops.md` | ArgoCD GitOps 운영 방식 |
| `07_grafana_dashboard.md` | Grafana 대시보드 구성/확인 |
| `08_data_retention.md` | InfluxDB / snapshot / Longhorn 보존 기준 |
| `09_failover_failback_test_results.md` | failover/failback 검증 결과 |
| `10_edge_workload_placement.md` | Edge workload 배치 정책 |
| `11_ansible_test_automation.md` | Ansible 반복 점검 자동화 |
| `12_iot_core_thing_secret_mount.md` | IoT Thing 등록 + K3s Secret mount |
| `13_hub_namespace_baseline.md` | Hub EKS namespace 기준 |
| `14_hub_run_commands.md` | Hub 실행/ArgoCD 초기 password 확인 |
| `15_aws_cost_baseline.md` | **AWS Hub 시간당 비용 기준** |
| `16_hub_prometheus_amp.md` | Hub Prometheus Agent + AMP remote_write |
| `17_hub_grafana_amp.md` | Hub Grafana + AMP datasource |
| `18_factory_b_mac_utm_k3s.md` | factory-b (Mac UTM) K3s 사전 구성 |
| `19_factory_c_windows_virtualbox_k3s.md` | factory-c (Windows VirtualBox) K3s 사전 구성 |
| `20_tailscale_hub_spoke_runbook.md` | Tailscale Hub-Spoke 실행 절차 |
| `21_hub_admin_ui_ingress.md` | ArgoCD/Grafana Admin HTTPS Ingress |

## 작성 규칙

- 비밀번호 / token / private key / certificate 원문은 절대 기록 금지
- AWS 리소스·상시 실행 컴포넌트·저장소·네트워크 경로 추가 시 `15_aws_cost_baseline.md` 동시 갱신
- UI에서 수행하는 작업은 UI 절차로 명시 (ArgoCD repo 등록, dashboard import 등)
- 테스트 결과는 시간·측정 기준·해석을 함께 남긴다
- 명령어는 실제 검증된 형태로만. `# TODO` 명령어 남기지 않는다
- 새 운영 기준 추가 시 `00_quick_start.md`의 진입 흐름에서 누락되지 않게 점검

## 현재 운영 상태 요약

- factory-a Raspberry Pi 3-node K3s (master 10.10.10.10 / worker1 .11 / worker2 .12) 운영 중
- AWS Hub는 2026-05-08 `destroy-all.sh` 이후 삭제. rebuild는 `scripts/build/build-all.sh` 또는 `build-hub.sh`
- ArgoCD `10.10.10.200` / Longhorn `10.10.10.201` / Grafana `10.10.10.202`
- GitOps repo: `https://github.com/aegis-pi/safe-edge-config-main.git`

## 참조

- Hub 명령 모음: `14_hub_run_commands.md`
- 비용 기준: `15_aws_cost_baseline.md`
- 책임 경계: `../planning/11_delivery_ownership_flow.md`
