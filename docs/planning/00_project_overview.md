# 프로젝트 개요

상태: source of truth
기준일: 2026-05-20

수정 이력:
- 2026-05-20 v0.4  2026-05-15 rebuild, 워크스트림 B Phase 1 통합 목표, M3 Issue 1/4 완료 상태 반영.

## 목적

Aegis-Pi 프로젝트의 문제 정의, 목표, 사용자, 핵심 기능, 현재 구현 기준을 한 문서에서 빠르게 이해하기 위한 기준 문서다.

## 현재 상태

- 현재 완료된 범위는 `factory-a` Safe-Edge 기준선 구축/실장 테스트, M1 Hub Issue 0~10/12, M2 Issue 1~6, M3 Issue 1/4이다.
- `factory-a`는 로컬 K3s 3노드, ArgoCD, Helm, Longhorn, InfluxDB, Grafana, AI 앱 failover/failback 기준선을 갖는다.
- GitOps 원격 저장소는 `https://github.com/aegis-pi/safe-edge-config-main.git`를 사용한다.
- AWS Hub EKS/VPC/namespace/ArgoCD bootstrap 기준선, foundation S3/AMP, AWS Load Balancer Controller, Route53/ACM, Admin UI HTTPS Ingress는 2026-05-06~2026-05-07 `build-all --admin-ui` 및 `build-hub`로 검증했고, 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI가 활성 상태다.
- M1 Issue 5에서 IoT Rule -> S3 raw 적재와 M1 검증용 `risk/risk-normalizer` IRSA S3 권한 검증을 완료했다. 최신 데이터 처리 방향은 별도 risk-normalizer 파드가 아니라 Lambda data processor와 DynamoDB/S3 processed다.
- M1 Issue 6에서 AMP Workspace와 `observability/prometheus-agent` IRSA remote_write 권한 검증을 완료했다.
- M1 Issue 7에서 Hub Prometheus Agent를 설치하고 AMP Query API로 기본 메트릭 수신을 검증했다.
- M1 Issue 8에서 내부 Grafana를 설치하고 AMP datasource query를 검증했다.
- M1 Issue 9에서 AWS Load Balancer Controller를 설치하고 IRSA/subnet discovery 기준을 검증했다.
- M1 Issue 10에서 ArgoCD/Grafana HTTPS Admin Ingress를 공유 Public ALB로 검증했다.
- 구현 책임 경계는 Terraform = 인프라, Ansible = bootstrap/설정/소프트웨어, GitHub Actions = CI, GitHub+ArgoCD = CD로 고정한다.
- M1 Issue 12에서 `configs/runtime/runtime-config.yaml`과 VM dummy data 추천값을 작성했다.
- M2 Issue 1~6에서 Tailnet/tag/Auth Key 정책 수립, `factory-a-master` Tailscale 참여, EKS Hub Tailscale Operator/egress 구성, `factory-a` kubeconfig/ArgoCD cluster 등록, `factory-a-podinfo-smoke` Sync/Healthy, Tailscale egress 장애/복구 검증을 완료했다.
- 워크스트림 A는 M3 Issue 2 ECR image push/pull 검증과 Spoke imagePullSecret 방식을 진행 중이다. 본 환경에서는 워크스트림 A 자산을 수정/실행하지 않는다.
- 본 환경의 다음 작업은 1번 Data/Dashboard VPC Phase 1 Step 0~3 진입 준비다.
- `factory-b`, `factory-c`, Edge Agent 송신 측, 일부 CI/CD 마무리는 워크스트림 A 또는 후속 확장 단계다.

## 프로젝트명

- Aegis-Pi Risk Twin

## 한 줄 소개

- Safe-Edge 기반 단일 공장 생존형 엣지를 멀티 공장 중앙 관제 구조로 확장하는 Risk Twin 프로젝트

## 문제 정의

기존 Safe-Edge는 단일 공장, 폐쇄망, 라즈베리파이 3노드 K3s 기준선으로 의미 있는 성과를 냈다. 그러나 다음 한계가 있었다.

1. 여러 공장을 중앙에서 함께 보는 운영 구조가 없다.
2. 공장 단위 위험 상태를 표준화해 보여주는 상위 관제가 없다.
3. 로컬 엣지 운영 기준선이 멀티 환경 Fleet 운영과 클라우드 데이터 플레인으로 확장돼야 한다.

## 해결 방향

Aegis-Pi는 아래 방향으로 Safe-Edge를 확장한다.

- `factory-a`에 Safe-Edge 기준선을 실제로 복구하고 검증한다.
- 로컬 GitOps는 GitHub repository와 ArgoCD UI sync를 기준으로 운영한다.
- Grafana는 InfluxDB 센서/AI 결과와 Prometheus 노드 상태를 함께 보여준다.
- `factory-b`, `factory-c`를 테스트베드형 Spoke로 추가한다.
- AWS EKS Hub에서 여러 Spoke를 중앙 배포한다.
- IoT Core -> IoT Rule/S3 raw와 IoT Core -> Lambda data processor -> DynamoDB/S3 processed 흐름으로 공장별 위험 상태를 만든다.
- 사용자 대시보드는 Tailscale에 의존하지 않는 1번 Data/Dashboard VPC에서 CloudFront/S3 SPA, Cognito, ALB/ECS Backend, RDS PostgreSQL, Redis/WebSocket, Bedrock 일간 보고서를 포함해 제공하고, DynamoDB LATEST/HISTORY와 S3 processed를 read-only로 조회한다.

### 2026-05-13 멘토링 반영

기존 개요는 Safe-Edge를 멀티 공장 중앙 관제로 확장하는 목표를 기술 구조 중심으로 정리했다. 멘토링 이후에는 이 구조를 고객 요구사항과 검증 지표 중심으로 보강한다.

| 항목 | 기존 초안 | 보강 방향 |
| --- | --- | --- |
| 데이터 흐름 | IoT Core 이후 단순 위험도 처리 | 최신 기준은 IoT Rule -> S3 raw와 Lambda -> DynamoDB LATEST/HISTORY + S3 processed로 분리 |
| 실시간성 | 관제 화면에 최신 상태 표시 | 준실시간 관제로 정의하고 지연시간/성공률 측정 |
| 보고서 | Phase 1 범위 | Phase 1 통합 목표에 Bedrock 기반 일간 Markdown 보고서 포함 |
| CI/CD | 배포 자동화 | 리포트 기반 모델/설정 업데이트 후보를 승인 후 GitOps로 배포 |

## 대상 사용자

- 1차 사용자: 본사 관제 담당자
- 2차 사용자: 현장 운영자, 배포 담당 개발자, 시스템 관리자
- 후속 사용자: 발표/검토/지도용 이해관계자

## 핵심 기능

- `factory-a` 로컬 생존형 엣지 운영
- ArgoCD/Helm 기반 GitOps 배포
- Longhorn 기반 엣지 데이터 복제
- Grafana 기반 센서/AI/노드 상태 시각화
- AI 앱 failover/failback 검증
- 멀티 공장 Fleet 운영으로 확장
- AWS IoT Core/S3 기반 중앙 수집으로 확장
- 공장별 위험 상태 시각화로 확장

## 현재 구현 상태

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| `factory-a` K3s 3노드 | 완료 | master, worker1, worker2 |
| ArgoCD/Helm GitOps | 완료 | GitHub repo 등록 및 sync는 UI 기준 |
| Longhorn | 완료 | InfluxDB/PVC 복제 기준 |
| InfluxDB/Grafana | 완료 | Grafana `10.10.10.202` |
| Prometheus node dashboard | 완료 | Grafana dashboard ID `1860` |
| AI 앱 failover/failback | 완료 | LAN 제거 및 전원 제거 실측 |
| 이미지 prepull | 완료 | `safe-edge-image-prepull` DaemonSet |
| InfluxDB 1일 보존 | 완료 | retention policy 기준 |
| AI snapshot 1일 보존 | 완료 | `/app/snapshots` cleanup sidecar |
| AWS Hub | 완료/활성 | M1 Issue 0~10/12와 M2 Issue 3~6 검증 완료, 2026-05-15 rebuild 후 활성, Issue 11 보류 |
| Foundation S3 | 완료/활성 | `aegis-bucket-data`와 IoT Rule raw 적재 검증 완료, 2026-05-15 rebuild 후 활성 |
| AMP/Grafana | 완료/활성 | `AEGIS-AMP-hub`, `observability/prometheus-agent` remote_write 수신, Grafana datasource query와 HTTPS Admin UI 검증 완료 후 활성 |
| IoT Core | 완료/활성 | `factory-a` Thing/certificate/policy, K3s Secret, IoT Rule/S3 적재 검증 완료 후 활성 |
| AWS 비용 기준 | 완료 | `docs/ops/15_aws_cost_baseline.md`, destroy 이후 `$0.0000/hour` |
| ECR `aegis/edge-agent` | 진행 중 | repository 활성, push/pull 검증은 워크스트림 A |
| `factory-b`, `factory-c` | 후속 | 테스트베드형 Spoke |
| Risk Twin / Dashboard VPC | 진입 준비 | Phase 1 Step 0~3, 본 환경 워크스트림 B |

## 현재 freeze 범위

- `factory-a` 운영형 Spoke 기준선
- GitOps 저장소와 ArgoCD 앱 분리 방식
- `monitoring`, `ai-apps` namespace 분리
- Grafana/InfluxDB/Prometheus 관측 방식
- Longhorn 기반 로컬 데이터 보존 방식
- Failover/Failback 테스트 절차와 실측 결과

## 향후 확장

- AWS Hub와 Tailscale 기반 Hub-Spoke 연결
- Terraform / Ansible / GitHub Actions / ArgoCD 책임 경계 유지
- 1번 Data/Dashboard VPC 기반 사용자 관제 접근
- GitHub Actions/ECR 이미지 빌드 파이프라인
- `runtime-config.yaml` 구조 초안
- Edge Agent 기반 IoT Core/S3 데이터 플레인 확장
- `factory-b`, `factory-c` 테스트베드형 Spoke
- Risk Twin 상태 카드와 공장별 위험도
- WebSocket 기반 준실시간 갱신
- Bedrock 기반 일일 Markdown 보고서
