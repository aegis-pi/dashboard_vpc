# Quick Start

상태: source of truth
기준일: 2026-06-10
수정 이력:
  - 2026-06-10  Data/Dashboard VPC 운영 빠른 실행, destroy 절차, Foundation/Data-Dashboard 책임 경계 요약 추가.

## 목적

현재 `factory-a` Safe-Edge 기준선과 Data/Dashboard 운영 상태를 빠르게 확인하고, 다음 운영 문서로 이동할 수 있게 안내한다.

## 현재 상태

- `factory-a` 로컬 Raspberry Pi 3-node K3s 기준선 구축이 완료됐다.
- ArgoCD, Longhorn, Grafana, InfluxDB, AI/Audio/BME280 워크로드가 동작한다.
- AWS Hub EKS/VPC/namespace/ArgoCD bootstrap 기준선은 2026-05-15 rebuild 이후 Hub/Foundation/IoT/Admin UI 기준으로 관리한다. 워크스트림 A 자산은 본 문서에서 실행하지 않는다.
- Foundation은 여러 워크스트림이 공유하는 AWS 기반 자원 묶음이다. 대표적으로 `aegis-bucket-data`, IoT Core raw 적재 Rule, AMP/ECR/OIDC 같은 공용 자원이 포함된다. Data/Dashboard VPC build/destroy 대상이 아니다.
- Data/Dashboard는 워크스트림 B의 1번 VPC 운영 영역이다. `infra/data-dashboard/`는 재생성 자원, `infra/data-dashboard-dns/`와 `infra/data-dashboard-permanent/`는 destroy 후에도 유지하는 영구 자원이다.
- IoT Core `factory-a` Thing/certificate/policy와 K3s Secret은 워크스트림 A/Foundation 기준으로 관리한다. 인증서·Secret 원문은 문서에 기록하지 않는다.
- `risk/risk-normalizer` IRSA S3 권한과 `observability/prometheus-agent` AMP remote_write 수신은 검증 완료 상태다. 단, `risk/risk-normalizer`는 M1 권한 검증 이력이며 최신 데이터 처리 구현 대상은 Lambda data processor와 DynamoDB/S3 processed다.
- Hub Prometheus Agent는 rebuild 시 `observability` 네임스페이스에서 재설치되며, 이전 검증에서는 AMP Query API로 `up{cluster="AEGIS-EKS"}` 수신을 확인했다.
- 내부 Grafana는 rebuild 시 `observability` 네임스페이스에서 재설치되며, 이전 검증에서는 AMP datasource `AEGIS-AMP`가 SigV4 + IRSA로 query 가능했다.
- AWS Load Balancer Controller와 Admin UI HTTPS Ingress는 워크스트림 A 기준 운영 문서를 따른다. 본 환경의 Data/Dashboard build/destroy에서 수정하지 않는다.
- Dashboard VPC, GitHub Actions CI, CloudFront/S3 Dashboard Web, ECS Dashboard Backend, Cognito/RBAC, Cloud Infra/보고서/챗봇 기능은 운영 배포 완료 상태다. 인증 사용자 수기 검증과 LLM 보고서 생성기는 후속이다.
- 후속 구현은 Terraform = 인프라, Ansible = bootstrap/설정/소프트웨어, GitHub Actions = CI, GitHub+ArgoCD = CD 기준을 따른다.

## 현재 운영 주소

| 항목 | 값 |
| --- | --- |
| master | `10.10.10.10` |
| worker1 | `10.10.10.11` |
| worker2 | `10.10.10.12` |
| ArgoCD UI | `http://10.10.10.200` |
| Longhorn UI | `http://10.10.10.201` |
| Grafana UI | `http://10.10.10.202` |
| GitOps repo | `https://github.com/aegis-pi/safe-edge-config-main.git` |

## 우선 읽을 문서

1. `docs/ops/05_factory_a_status.md`
2. `docs/ops/22_data_dashboard_vpc_runbook.md`
3. `docs/ops/15_aws_cost_baseline.md`
4. `docs/ops/06_argocd_gitops.md`
5. `docs/ops/07_grafana_dashboard.md`
6. `docs/ops/08_data_retention.md`
7. `docs/ops/09_failover_failback_test_results.md`
8. `docs/ops/04_troubleshooting.md`
9. `docs/changes/README.md`

## Data/Dashboard 빠른 실행

대상:

```text
재생성 root: infra/data-dashboard/
영구 root:   infra/data-dashboard-dns/, infra/data-dashboard-permanent/
상세 절차:   docs/ops/22_data_dashboard_vpc_runbook.md
```

올리기:

```bash
scripts/build/build-data-dashboard.sh
```

MFA 세션 토큰이 없으면 OTP를 전달한다.

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

내리기:

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud
```

비대화형 실행이 필요한 경우에만 명시 확인 플래그를 사용한다.

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud --yes
```

주의:

- `destroy-data-dashboard.sh`는 `infra/data-dashboard/`만 삭제한다.
- Route53 hosted zone, Cognito, ECR, S3 web bucket, CloudFront, report table은 영구 root에서 유지한다.
- Foundation 공유 자원(`aegis-bucket-data`, `AEGIS-DynamoDB-FactoryStatus`, 기존 IoT raw Rule 등)은 삭제하지 않는다.
- 사용자 승인 없이 destroy 스크립트를 실행하지 않는다.

## 빠른 상태 확인

master에서 확인한다.

```bash
kubectl get nodes -o wide
kubectl -n argocd get application
kubectl -n monitoring get pod -o wide
kubectl -n ai-apps get pod -o wide
kubectl -n ai-apps get ds safe-edge-image-prepull -o wide
kubectl -n monitoring get pvc
kubectl -n ai-apps get pvc
kubectl -n longhorn-system get volumes.longhorn.io -o wide
```

정상 기준:

```text
master, worker1, worker2: Ready
safe-edge-monitoring: Synced / Healthy
safe-edge-ai-apps: Synced / Healthy
monitoring/influxdb, prometheus, grafana: Running
ai-apps/bme280-sensor, safe-edge-integrated-ai, safe-edge-audio: worker2 Running
safe-edge-image-prepull: worker1, worker2 Running
Longhorn volumes: attached / healthy
```

## 현재 완료된 범위

```text
K3s 3-node 구성
Longhorn PVC 저장소
MetalLB 내부 IP 노출
ArgoCD Helm 설치
GitHub GitOps repo 기반 배포
monitoring / ai-apps Application 분리
InfluxDB safe_edge_db 1일 retention
Grafana InfluxDB dashboard 구성
Prometheus Node Exporter Full 1860 dashboard 사용
worker2 preferred affinity + 30초 tolerationSeconds
master OS cron 기반 Kubernetes-only failback
safe-edge-image-prepull DaemonSet
AI snapshot node-local hostPath + 24시간 cleanup + 매일 03:00 KST purge
AI inference result InfluxDB PVC 기반 Longhorn 저장
LAN 제거 장애 테스트
k3s-agent 중지 장애 테스트
```

## 다음 단계

1. 계획과 실제 구현이 달라진 항목은 `docs/changes/`에 Change Record로 남긴다.
2. `README.md`, `docs/README.md`, architecture 문서를 현재 `factory-a` 기준으로 유지한다.
3. Grafana/dashboard 스펙을 실제 InfluxDB + Prometheus 기준으로 유지한다.
4. M1 Issue 9 AWS Load Balancer Controller, M1 Issue 10 ArgoCD/Grafana HTTPS Admin Ingress, M1 Issue 12 `runtime-config.yaml` 구조 초안, M3 Issue 1 GitOps 저장소 구조 설계는 완료됐다. 다음 작업은 M3 Issue 2 ECR 저장소 구성 및 이미지 태그 전략이다.
