# 구현 전략 및 단계 계획

상태: source of truth
기준일: 2026-06-04

수정 이력:
- 2026-06-04 v0.6  워크스트림 B Phase 1 Step 0~9.5 완료 + Step 10 진행 반영. Dashboard Backend/Web/Cloud Infra/RBAC/보고서 조회 운영 배포 완료, "다음 단계 Step 6" 서술 정정.
- 2026-05-22 v0.5  워크스트림 B Phase 1 Step 2~5.5 완료 및 Data/Dashboard VPC destroy 상태, Step 6 진입 준비 반영.
- 2026-05-20 v0.4  2026-05-15 rebuild, M3 Issue 1/4 완료, 워크스트림 B Phase 1 Step 0~3 진입 준비 상태 반영.

## 목적

프로젝트를 어떤 순서로 구현할지, 각 단계에서 무엇을 만들어야 하고 어떤 조건이 만족되면 다음 단계로 넘어갈 수 있는지 정리한다.

## 현재 상태

- Phase 0 문서 기준선 정리는 완료 상태로 유지 보수 중이다.
- Phase 1 M0 `factory-a` Safe-Edge 기준선은 구축 및 실측 검증까지 완료됐다.
- Phase 2 M1은 AWS MFA/Terraform 접근, Hub EKS/VPC, Hub namespace, Hub ArgoCD, foundation S3/AMP, `factory-a` IoT Thing/Policy/K3s Secret, IoT Rule -> S3 raw 적재, IRSA S3 권한, Hub Prometheus Agent 설치, AMP remote_write 수신, Grafana AMP datasource query, AWS Load Balancer Controller, Admin UI HTTPS Ingress 검증까지 진행했다.
- Hub AWS 리소스와 foundation S3/AMP/Admin UI는 2026-05-06~2026-05-07 `build-all --admin-ui`와 `build-hub`로 재생성/검증했고, 2026-05-15 rebuild 후 활성 상태다.
- M1 Issue 12에서 `configs/runtime/runtime-config.yaml`과 VM dummy data 추천값을 작성했다.
- M2 Issue 1~6에서 Tailnet/tag/Auth Key 정책 수립, `factory-a-master` Tailscale 참여, EKS Hub Tailscale Operator/egress 구성, `factory-a` kubeconfig/ArgoCD cluster 등록, `factory-a-podinfo-smoke` Sync/Healthy, Tailscale egress 장애/복구 검증을 완료했다.
- 워크스트림 A의 현재 다음 단계는 M3 Issue 2 ECR image push/pull 검증과 Spoke imagePullSecret 방식 확정이다. 본 환경에서는 워크스트림 A 자산을 수정/실행하지 않는다.
- 본 환경(워크스트림 B)은 1번 Data/Dashboard VPC Phase 1 Step 0~9.5를 구현 완료하고 Dashboard Backend(ECS)/Web(CloudFront)/Cloud Infra 화면/RBAC 사용자 관리/보고서 조회까지 운영 배포했다. 현재 다음 단계는 Step 10 운영 자동화/데모와 UI 마무리 보정이다(`docs/planning/16_data_dashboard_vpc_workplan.md`).
- `docs/issues/` 하위 마일스톤 문서를 기준으로 구현 순서를 M0~M7로 관리한다.
- 구현 책임 경계는 `docs/planning/11_delivery_ownership_flow.md`를 source of truth로 삼는다.
- 사용자 대시보드는 Tailscale 의존을 줄이기 위해 `docs/planning/16_data_dashboard_vpc_workplan.md`와 `docs/planning/17_expansion_roadmap.md`의 Phase 1 통합 목표를 따른다.
- AWS 인프라 작업 전 로컬 AWS CLI MFA 및 Terraform 접근 설정은 `docs/planning/08_aws_cli_mfa_terraform_access.md`를 따른다.
- AWS 리소스 비용 기준은 `docs/ops/15_aws_cost_baseline.md`를 따른다.

## 단계 계획

### Phase 0. 문서 기준선 고정

주요 작업:

- `docs/` 기준 문서 정리
- 실제 `factory-a` 상태를 README, planning, architecture, ops, specs 문서에 반영
- 오래된 로컬 저장소/NFS/구현 전 표현을 현재 GitHub/ArgoCD/구현 완료 상태로 정리

완료 조건:

- 문서와 실제 `factory-a` 상태가 충돌 없이 읽힌다.
- README는 GitHub에서 바로 읽을 수 있는 이름을 유지한다.
- `docs/issues` 하위 issue 파일은 기존 issue 이름을 유지한다.

### Phase 1. M0 `factory-a` Safe-Edge 기준선 재구성

상태: 완료

주요 산출물:

- Raspberry Pi 3노드 K3s 클러스터
- 고정 IP 기준선
- ArgoCD 설치
- GitHub repo `https://github.com/aegis-pi/safe-edge-config-main.git`
- Helm 기반 `monitoring`, `ai-apps` 배포
- InfluxDB, Grafana, Prometheus
- Longhorn 기반 PVC
- InfluxDB 1일 retention policy
- AI snapshot node-local hostPath 및 24시간 cleanup, 매일 03:00 KST purge
- AI inference result InfluxDB PVC 기반 Longhorn 저장
- 이미지 prepull DaemonSet
- LAN 제거 및 k3s-agent 중지 기반 failover/failback 실측

완료 조건:

- Safe-Edge 핵심 동작 복구
- 센서/AI/모니터링 경로 확인
- Grafana에서 센서/AI/노드 상태 확인
- worker2 장애 시 worker1 승계 확인
- worker2 복구 시 조건부 failback 확인
- 데이터 공백 분석 결과 기록

보류 항목:

- NFS/Cold Storage
- Ansible 기반 Hot/Cold tiering
- 클라우드 장기 보존

### Phase 2. M1 Hub 기준선 구성

선행 조건:

- Phase 1 완료
- `factory-a` 기준선 문서와 GitOps repo 정합성 확인
- 기존 IAM 사용자, Access Key, MFA 장치, AWS 권한 준비
- `docs/planning/08_aws_cli_mfa_terraform_access.md` 기준으로 AWS CLI MFA 세션과 Terraform 접근 검증
- `docs/planning/09_m1_eks_vpc_decision_record.md` 기준으로 EKS/VPC MVP 설계값 확정

주요 작업:

- AWS CLI MFA 및 Terraform 접근 설정 검증 완료
- AWS EKS/VPC 기준선 검증 완료
- Hub namespace/LimitRange 기준선 검증 완료
- Hub ArgoCD Ansible bootstrap 기준 전환 완료
- Delivery ownership flow 확정: Terraform은 인프라, Ansible은 bootstrap/설정/소프트웨어, GitHub Actions는 CI, GitHub+ArgoCD는 CD
- Hub EKS/ArgoCD 재생성 및 active 상태 검증 후 destroy 완료
- 최소 책임 분리 완료: `infra/hub`, `scripts/ansible`, `infra/foundation`
- Dashboard VPC / public authenticated ingress 설계
- ArgoCD 설치 또는 중앙 ArgoCD 운영 기준 정리
- S3 버킷 및 경로 파티셔닝 설계
- IoT Core Thing / 인증서 / Policy / K3s Secret 생성 완료
- IoT Rule -> S3 raw 적재 검증 완료
- `risk/risk-normalizer` IRSA S3 read/write 권한 검증 완료
- AMP Workspace 생성 완료
- `observability/prometheus-agent` IRSA AMP remote_write 권한 검증 완료
- Hub Prometheus Agent 설치 및 AMP Query API 메트릭 수신 검증 완료
- 내부 Grafana 설치 및 AMP datasource query 검증 완료
- AWS Hub 비용 기준 문서화 완료
- latest status 저장소 후보 결정
- `runtime-config.yaml` 구조 초안
- `runtime-config.yaml` 구조 초안

완료 조건:

- Hub 자체가 독립적으로 배치되어 있음
- Spoke 연결을 받을 준비가 완료됨

ArgoCD 접근 운영 기준:

- 현재 단계에서는 사용자 로컬 PC에서 EKS kubeconfig를 설정한 뒤 `kubectl port-forward`로 ArgoCD UI에 접근한다.
- `argocd-server`는 `ClusterIP`로 유지하고 public `LoadBalancer`는 만들지 않는다.
- UI는 상태 확인, diff 확인, 수동 sync 같은 검증 용도로 사용한다.
- 반복 적용해야 하는 ArgoCD 설정은 UI 클릭에 의존하지 않고 Git/YAML/ApplicationSet으로 코드화한다.
- M2에서 Tailscale을 붙일 때 ArgoCD 접근 경로도 함께 정리한다.
- Tailscale 적용 후에는 EKS API endpoint public CIDR `0.0.0.0/0`를 더 좁힌다.

ArgoCD 재생성 자동화 기준:

- `scripts/ansible`에 Terraform output 기반 dynamic inventory와 Hub ArgoCD bootstrap playbook을 추가했다.
- ArgoCD chart version은 현재 검증된 `argo-cd-9.5.11`, app version은 `v3.3.9`를 기준으로 고정한다.
- `scripts/ansible/files/argocd-values.yaml`을 두고 `server.service.type=ClusterIP`를 명시한다.
- `infra/hub terraform apply` 후 `ansible-playbook` 실행으로 namespace, LimitRange, ArgoCD Helm release가 재생성되게 한다.
- repo, AppProject, Application, ApplicationSet은 이후 별도 GitOps bootstrap 디렉터리 또는 ArgoCD self-management 구조로 코드화한다.
- 포트포워딩은 Terraform 리소스로 관리하지 않는다. 로컬에서 실행하는 운영 스크립트로 제공한다.
- 포트포워딩 스크립트는 `scripts/ops/argocd-port-forward.sh`에 두고, 내부에서 `aws eks update-kubeconfig`, `kubectl -n argocd wait`, `kubectl -n argocd port-forward service/argocd-server 8080:443` 순서로 실행하게 한다.
- 초기 admin 비밀번호 조회는 별도 명령 또는 `--print-password` 옵션처럼 명시적인 경우에만 수행하고, 문서나 로그에 저장하지 않는다.

Hub 생성 순서:

- `scripts/build/build-hub.sh`를 실행해 VPC, NAT Gateway, EKS, node group을 생성한다.
- 같은 실행 흐름에서 `aws eks update-kubeconfig --region ap-south-1 --name AEGIS-EKS`로 로컬 kubeconfig를 갱신한다.
- Ansible `hub_argocd_bootstrap.yml`이 namespace, LimitRange, ArgoCD Helm release를 생성한다.
- ArgoCD UI가 필요하면 `scripts/ops/argocd-port-forward.sh`를 실행해 로컬 `https://127.0.0.1:8080`으로 접근한다.

### Phase 3. M2 Mesh VPN + Hub-Spoke 연결

선행 조건:

- Phase 2 완료
- `factory-a` master API 접근 정책 확정

주요 작업:

- Tailscale 계정 및 Spoke별 키 정책: 완료
- `factory-a` master Tailscale 참여: 완료
- EKS Hub Tailscale 참여: 완료
- ArgoCD/Grafana UI 접근 경로를 Tailscale 기반 private access로 검증 완료
- kubeconfig Tailscale IP 기반 구성: 완료
- ArgoCD `factory-a` 등록: 완료
- Hub -> `factory-a` Sync 검증: 완료
- Tailscale egress 장애/복구 검증: 완료
- EKS API endpoint public CIDR 축소: 설계 마무리 후 재검토로 보류

완료 조건:

- Hub에서 `factory-a` Spoke API 접근 가능
- ArgoCD가 `factory-a`에 테스트 배포 가능
- ArgoCD UI를 public LoadBalancer 없이 접근 가능
- EKS API endpoint CIDR 축소는 M2 완료 조건에서 제외하고 운영 보안 강화/설계 마무리 후 재검토한다.

### Phase 4. M3 배포 파이프라인 구성

선행 조건:

- Phase 3 완료
- 기준 앱과 공통 차트 구조 준비

주요 작업:

- Helm base + 공장별 values 구조
- ECR 저장소 및 이미지 태그 전략
- GitHub Actions 기반 CI, 이미지 빌드/테스트/ECR push
- GitHub repository와 ArgoCD ApplicationSet 기반 CD
- manifest 갱신 워크플로우
- 배포 검증 워크플로우

완료 조건:

- push -> 이미지 갱신 -> ArgoCD Sync -> `factory-a` 롤아웃 확인
- 이미지 prepull 정책과 최신 태그 유지 방식 정리

### Phase 5. M4 데이터 플레인 - `factory-a` 단일 Spoke 기준

선행 조건:

- Phase 3, 4 완료
- `factory-a` Edge Agent 구현 준비

주요 작업:

- 표준 입력 스키마 확정
- Edge Agent 구현 / 컨테이너화
- `docs/planning/06_edge_agent_deployment_plan.md` 기준으로 `factory-a` real mode와 `factory-b/c` dummy mode를 분리
- 초기 데이터 수집은 직접 장치 접근이 아니라 InfluxDB query와 Kubernetes API status query로 구현
- Edge Agent가 `system_status`, `device_status`, `workload_status`, `pipeline_heartbeat`를 함께 송신해 Dashboard VPC가 Spoke에 직접 붙지 않아도 현장 상태를 볼 수 있게 한다.
- IoT Core 연결
- S3 적재
- 정규화/판단 서비스
- `pipeline_status` 집계 및 latest status 저장소 반영

완료 조건:

- `factory-a` 데이터가 S3까지 실제 적재되고 Hub에서 처리 가능
- worker2 장애 시 edge-agent가 worker1로 재스케줄되고 `system_status` 또는 pipeline 관련 상태를 계속 송신

### Phase 6. M5 VM Spoke 확장 - `factory-b`, `factory-c`

선행 조건:

- Phase 4, 5 완료
- 운영형 Spoke 배포 및 데이터 플레인 기준선 확인

주요 작업:

- `factory-b` K3s
- `factory-c` K3s
- 두 VM의 Tailscale 참여
- ApplicationSet 확장
- Dummy Sensor 구현 / 배포
- 테스트베드형 자동 롤백 정책 적용
- 두 VM의 S3 적재 및 `pipeline_status` 확인

완료 조건:

- 3개 공장이 Hub에서 독립 공장으로 배포/수집 가능

### Phase 7. M6 Risk Twin + 관제 화면

선행 조건:

- Phase 5, 6 완료
- 3개 공장 데이터가 Hub에서 읽힘

주요 작업:

- Lambda data processor Risk 계산 로직 구현
- `runtime-config.yaml` 적용
- 온도/습도 기준 초안 반영
- Risk Twin 출력 구조 구현
- Dashboard Web/API 또는 Grafana 관제 화면 구현
- Dashboard VPC에서 ALB/WAF/Auth를 통해 접근하고, DynamoDB LATEST/HISTORY와 S3 processed를 read-only로 조회

완료 조건:

- 상태 변화 -> Risk Score -> 관제 화면 반영 end-to-end 확인

### Phase 8. M7 통합 검증 및 문서 보정

선행 조건:

- Phase 1~7 완료

주요 작업:

- 운영형 시나리오 검증
- 테스트베드형 시나리오 검증
- Failover 검증
- 롤백 검증
- `docs/ops/03_test_checklist.md` 보정
- `docs/` 및 `configs/` 기준 문서 최종 갱신

완료 조건:

- 문서와 실제 구현 상태가 일치
- MVP 완료 선언 가능

## 단계별 선행 관계 요약

| 단계 | 현재 상태 | 핵심 산출물 |
| --- | --- | --- |
| Phase 0 | 완료 | 기준 문서 |
| Phase 1 (M0) | 완료 | `factory-a` Safe-Edge 기준선 |
| Phase 2 (M1) | 핵심 완료, Issue 0~10/12 완료, Issue 11 보류 | Hub 핵심 서비스 |
| Phase 3 (M2) | 완료, Issue 1~6 완료 | Mesh 기반 `factory-a` 연결 |
| Phase 4 (M3) | 후속 | 배포 파이프라인 |
| Phase 5 (M4) | 후속 | `factory-a` 중앙 데이터 플레인 |
| Phase 6 (M5) | 후속 | VM Spoke 확장 |
| Phase 7 (M6) | 후속 | Risk Twin + Dashboard VPC 관제 |
| Phase 8 (M7) | 후속 | 통합 검증 + 문서 보정 |

## 구현 중 테스트로 결정할 항목

- Hub-Spoke 연결 지연
- IoT Core -> S3 적재 지연
- Risk Score 가중치
- source_type별 지연 기준
- Dummy 시나리오 값
- `pipeline_status` 주기 집계 간격
- 배포 지연 시간 수치
- null 허용 정책 세부값

## 현재 실측 완료 항목

- worker2 LAN 제거 failover/failback
- worker2 k3s-agent 중지 failover/failback
- LAN 제거 테스트 1초/10초 bucket 데이터 공백
- 이미지 prepull 적용 후 failover 준비 상태
- InfluxDB 1일 retention policy
- AI snapshot 24시간 cleanup 및 매일 03:00 KST purge
