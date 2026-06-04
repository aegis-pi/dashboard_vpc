# 현재 구조 요약

상태: source of truth
기준일: 2026-06-04

수정 이력:
- 2026-06-04 v0.4  1번 Data/Dashboard VPC(워크스트림 B) Phase 1 구현/운영 배포 완료 반영. "미구축" 서술 정정. Lambda data processor·IoT Rule·S3 processed·DynamoDB·ECS Dashboard 등 후속 항목 중 구현된 것을 분리. 상세 토폴로지는 `01_target_architecture.md`/`../planning/16_data_dashboard_vpc_workplan.md`.
- 2026-05-20 v0.3  2026-05-15 rebuild 이후 Hub/Foundation/IoT/Admin UI 활성 상태와 워크스트림 B Phase 1 진입 준비 상태 반영.
- 2026-05-08 v0.2  destroy-all 이후 비용 정리 상태 반영.

## 목적

현재 실제로 구축된 `factory-a` Safe-Edge 로컬 구조를 설명한다.

## 현재 상태

- 현재 운영 중인 구현 범위는 `factory-a` 운영형 Spoke와 2026-05-15 rebuild 후 활성화된 Hub/Foundation/IoT/Admin UI 기준선이다.
- AWS Hub는 M1 Issue 0~10에서 EKS/VPC/namespace/ArgoCD bootstrap, foundation S3/AMP/IoT Rule, IoT Thing/certificate/policy/K3s Secret, IRSA S3/AMP 권한, Prometheus Agent remote_write 수신, Grafana AMP datasource query, AWS Load Balancer Controller, Route53/ACM, Admin UI HTTPS Ingress를 검증했고 2026-05-15 rebuild 후 활성 상태다.
- M1 Issue 4에서 foundation S3 data bucket `aegis-bucket-data`를 생성했고, M1 Issue 5에서 IoT Thing/certificate/policy 및 K3s Secret 등록, IoT Rule -> S3 raw 적재 검증을 완료했다.
- 후속 구현 책임 경계는 Terraform = 인프라, Ansible = bootstrap/설정/소프트웨어, GitHub Actions = CI, GitHub+ArgoCD = CD로 고정한다.
- `factory-b`, `factory-c`, GitHub Actions(워크스트림 A CI)는 아직 구축 전이다. ECR `aegis/edge-agent` repository는 활성 상태이고, M3 Issue 2의 image push/pull 검증은 워크스트림 A에서 진행 중이다.
- **1번 Data/Dashboard VPC(워크스트림 B)는 Phase 1 구현 완료 후 운영 배포 단계다.** Step 9.5 permanent split 이후 `infra/data-dashboard` 일시 root를 build/destroy 사이클로 운영하며, IoT Rule → Lambda data processor → DynamoDB(`AEGIS-DynamoDB-FactoryStatus`)/S3 processed, DDB Streams → notifier → Redis, ECS Fargate Dashboard Backend(FastAPI) + ALB, CloudFront/S3 SPA(`apps/dashboard-web/`), Cognito + RDS RBAC, Cloud Infra collector가 동작한다. 영구 자원은 `infra/data-dashboard-permanent`/`infra/data-dashboard-dns`. 상세 토폴로지는 `01_target_architecture.md`와 `../planning/16_data_dashboard_vpc_workplan.md`를 본다.
- 이 문서는 현재 동작 중인 `factory-a` 로컬 기준선과 rebuild 가능한 Hub 기준선을 기록한다. 1번 Data/Dashboard VPC 상세는 목표 아키텍처 문서로 분리한다.

## 물리 / 클러스터 구조

```text
factory-a
├── master  10.10.10.10  K3s control plane
├── worker1 10.10.10.11  failover standby
└── worker2 10.10.10.12  sensor / AI / audio preferred
```

Kubernetes:

```text
K3s v1.34.6+k3s1
```

## Namespace 구조

```text
argocd
longhorn-system
monitoring
ai-apps
```

역할:

| Namespace | 역할 |
| --- | --- |
| `argocd` | GitOps 배포 제어 |
| `longhorn-system` | PVC 및 replica storage |
| `monitoring` | InfluxDB, Prometheus, Grafana |
| `ai-apps` | BME280, integrated AI, audio, image prepull |

## 관리 UI

| UI | 주소 |
| --- | --- |
| ArgoCD | `http://10.10.10.200` |
| Longhorn | `http://10.10.10.201` |
| Grafana | `http://10.10.10.202` |

## 배포 구조

현재 배포 흐름:

```text
GitHub safe-edge-config-main
    -> ArgoCD UI refresh / sync
    -> safe-edge-monitoring
    -> safe-edge-ai-apps
    -> factory-a K3s
```

GitOps repo:

```text
https://github.com/aegis-pi/safe-edge-config-main.git
```

Application:

```text
safe-edge-monitoring
safe-edge-ai-apps
```

현재는 GitHub Actions / ECR / ApplicationSet 기반 멀티 Spoke 배포가 아니라, GitHub repo와 ArgoCD Application을 이용한 로컬 `factory-a` GitOps 기준선이다.

## 현재 Hub 상태

M1 Hub 기준선은 Terraform과 Ansible로 생성/검증했으며 2026-05-15 rebuild 이후 Hub/Foundation/IoT/Admin UI가 활성 상태다.

```text
AWS actual state: Hub EKS, ArgoCD, Prometheus Agent, Grafana, AWS Load Balancer Controller, Admin UI ALB, foundation S3/AMP/IoT active
EKS: AEGIS-EKS active
VPC CIDR: 10.0.0.0/16 target on rebuild
AZ: ap-south-1a, ap-south-1c
Hub namespaces: managed by Ansible bootstrap
Prometheus Agent: observability/prometheus-agent remote_writes to AMP
Grafana: observability/grafana queries AMP through SigV4 + IRSA
Admin UI: https://argocd.minsoo-tech.cloud and https://grafana.minsoo-tech.cloud through shared Public ALB
```

Terraform root:

```text
infra/hub         VPC, subnet, NAT Gateway, EKS cluster, node group, Route53/ACM, IRSA
infra/foundation  S3/AMP/IoT Rule
```

Hub Kubernetes bootstrap:

```text
scripts/ansible  kubeconfig 갱신, namespace, LimitRange, ArgoCD Helm install, Prometheus Agent remote_write, Grafana AMP datasource, AWS Load Balancer Controller, Admin UI Ingress
```

## 데이터 구조

현재 데이터 흐름:

```text
BME280 / camera / mic / AI
    -> ai-apps Pods
    -> InfluxDB safe_edge_db
    -> Grafana dashboard
```

`edge-agent`는 현재 운영 workload가 아니다. 후속 클라우드 확장 단계에서 기존 `bme280-sensor`, `safe-edge-integrated-ai`, `safe-edge-audio` 옆에 추가될 송신 컴포넌트다. 초기 계획은 직접 장치 접근이 아니라 InfluxDB query와 Kubernetes API status query를 사용해 AWS IoT Core로 전송하는 방식이다.

InfluxDB measurement:

```text
environment_data
ai_detection
acoustic_detection
```

주요 field:

```text
environment_data.temperature
environment_data.humidity
environment_data.pressure
ai_detection.fire_detected
ai_detection.fallen_detected
ai_detection.bending_detected
acoustic_detection.is_danger
```

## 저장소 구조

```text
InfluxDB PVC -> Longhorn
AI snapshot -> node-local hostPath
AI inference result -> InfluxDB PVC -> Longhorn
```

보존 정책:

```text
InfluxDB safe_edge_db: 1일 retention
AI snapshots: 24시간 초과 jpg/jpeg/png 삭제
AI snapshots: 매일 03:00 KST worker1/worker2 local directory 전체 purge
```

AI snapshot:

```text
mount path: /app/snapshots
hostPath: /var/lib/safe-edge/snapshots
cleanup: snapshot-cleanup sidecar
daily purge: safe-edge-snapshot-daily-purge-worker1 / worker2 CronJob
```

## 모니터링 구조

Grafana datasource:

```text
InfluxDB: 센서 / AI / 소리 데이터
Prometheus: 노드 상태
```

Dashboard:

```text
Factory-A sensor / AI dashboard
Node Exporter Full 1860
```

## Failover / Failback 구조

정책:

```text
worker2 preferred affinity
tolerationSeconds: 30
worker1 failover standby
master OS cron 기반 Kubernetes-only failback
```

대상 Pod:

```text
bme280-sensor
safe-edge-integrated-ai
safe-edge-audio
```

Failback 원칙:

- worker2가 Ready일 때만 진행한다.
- worker2에 대상 Pod가 이미 Running이면 skip한다.
- worker1에 남은 대상 Pod만 순차 삭제한다.
- Kubernetes CronJob이 아니라 master OS cron에서 `kubectl`만 실행한다.

## Image Prepull 구조

`safe-edge-image-prepull` DaemonSet은 worker1/worker2에 큰 이미지를 미리 받아 둔다.

목적:

```text
failover 시 worker1에서 이미지 pull 지연 감소
새 이미지 태그 배포 전 worker1/worker2 이미지 준비
```

## 현재 검증 결과

LAN 제거:

```text
Failover 성공
Failback 성공
AI/audio/BME worker1 Running 성공
worker2 복구 후 worker2 failback 성공
Longhorn Multi-Attach 재발 없음
```

`k3s-agent` 중지:

```text
Failover 성공
Failback 성공
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

## 현재 구조 밖의 항목

다음 항목은 `factory-a` 로컬 구조에는 포함되지 않는다. 이 중 상당수는 클라우드 측에서 이미 구축/운영 중이며, 상세 구조는 `docs/architecture/01_target_architecture.md`에서 관리한다.

이미 구축/운영 중 (로컬 클러스터 밖):

```text
AWS EKS Hub / ArgoCD / Prometheus Agent / Grafana / AMP   (워크스트림 A, 2026-05-15 rebuild 후 활성)
Tailscale Hub-Spoke 연결                                   (워크스트림 A)
IoT Core / S3 / ECR                                        (foundation, 워크스트림 A 소유)
Lambda data processor / Risk calculation                  (워크스트림 B, apps/data-processor)
ECS Dashboard Backend / DynamoDB hot store / Redis / RDS   (워크스트림 B, 1번 VPC)
ApplicationSet (aegis-spoke-factory-a)                     (M3 Issue 4)
```

아직 후속 목표:

```text
factory-b / factory-c VM Spoke
edge-agent 운영 송신 컴포넌트 (factory-a IoT 실시간 송신)
GitHub Actions edge-agent build/push 워크플로우 (워크스트림 A)
LLM 일간 보고서 생성기 (Bedrock, 팀원/후속)
```
