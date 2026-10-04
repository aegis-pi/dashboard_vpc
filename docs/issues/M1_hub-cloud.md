# M1. Hub 클라우드 기반 구성

> **마일스톤 목표**: EKS 클러스터와 AWS 관리형 서비스(IoT Core, S3, AMP), Dashboard VPC 기준을 구성한다.
> 이 단계에서는 Spoke 연결 없이 Hub 자체를 세우는 것이 목표다.  
> M0(`factory-a` 기준선) 완료 후 진행하며, M2(Mesh VPN 연결)의 전제 조건이다.
> 관리자 대시보드 접근 구조는 `docs/planning/07_dashboard_vpc_extension_plan.md`를 따른다.
> AWS CLI MFA 및 Terraform 접근 준비는 `docs/planning/08_aws_cli_mfa_terraform_access.md`를 따른다.
> EKS/VPC MVP 설계 결정은 `docs/planning/09_m1_eks_vpc_decision_record.md`를 따른다.

---

## 수정 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-05-04 | rev-20260504-01 | Issue 3 Hub ArgoCD 설치 완료 결과, 접근 운영 기준, Terraform 편입 계획을 반영 |
| 2026-05-04 | rev-20260504-02 | ArgoCD Helm release를 `infra/platform` Terraform 관리 대상으로 편입하고 포트포워딩 스크립트 기준을 반영 |
| 2026-05-04 | rev-20260504-03 | Hub/Platform destroy 완료 상태와 재적용 시 ArgoCD 자동 재생성 기준을 반영 |
| 2026-05-04 | rev-20260504-04 | ArgoCD와 Hub namespace 재생성을 Terraform에서 Ansible dynamic inventory 기반 bootstrap으로 전환 |
| 2026-05-04 | rev-20260504-05 | Terraform, Ansible, GitHub Actions, GitHub+ArgoCD 책임 경계 기준을 반영 |
| 2026-05-04 | rev-20260504-06 | Issue 4 S3 데이터 버킷을 `infra/foundation` Terraform root에 추가하고 raw/processed/latest prefix 및 lifecycle 기준을 반영 |
| 2026-05-04 | rev-20260504-07 | `aegis-bucket-data` S3 버킷 apply 및 versioning, SSE-S3, public access block, lifecycle 검증 결과를 반영 |
| 2026-05-04 | rev-20260504-08 | Hub EKS/ArgoCD 재생성 및 `factory-a` IoT Thing/Policy/K3s Secret 생성 결과를 현재 상태로 반영 |
| 2026-05-04 | rev-20260504-09 | 전체 destroy 완료 후 Hub/Foundation/IoT/K3s Secret 삭제 상태를 현재 기준으로 반영 |
| 2026-05-06 | rev-20260506-01 | IoT Rule -> S3 raw prefix 적재 Terraform 적용 및 테스트 메시지 검증 결과를 반영 |
| 2026-05-06 | rev-20260506-02 | `risk/risk-normalizer` IRSA 기반 S3 read/write 권한과 EKS pod 검증 결과를 반영 |
| 2026-05-06 | rev-20260506-03 | AMP Workspace 생성, Prometheus remote_write IRSA 구성, EKS pod assume-role 검증 결과를 반영 |
| 2026-05-06 | rev-20260506-04 | Issue 7 Prometheus Agent 설치, AMP remote_write 수신, build-all 연동 검증 결과를 반영 |
| 2026-05-06 | rev-20260506-05 | Issue 8 내부 Grafana 설치, AMP datasource, IRSA query 검증 결과를 반영 |
| 2026-05-06 | rev-20260506-06 | 관리자 ArgoCD/Grafana HTTPS 외부 접근을 M1 Issue 9~11로 재정렬하고 WAF/Cognito/OIDC는 운영 보안 강화 백로그로 분리 |
| 2026-05-06 | rev-20260506-07 | Issue 9 AWS Load Balancer Controller 설치/검증 완료와 Issue 10 Route53/ACM/Admin Ingress 준비 상태를 반영 |
| 2026-05-06 | rev-20260506-08 | Hub 재생성 시 Gabia 위임용 Route53 NS 파일 자동 갱신 기준을 반영 |
| 2026-05-06 | rev-20260506-09 | Issue 10 Admin UI HTTPS Ingress 활성화와 ArgoCD/Grafana HTTPS 검증 완료 결과를 반영 |
| 2026-05-06 | rev-20260506-10 | Issue 12 runtime-config.yaml 구조와 VM dummy data 추천값을 반영 |
| 2026-05-08 | rev-20260508-01 | 전체 destroy 후 Hub/Foundation/IoT/K3s Secret 삭제 상태를 현재 기준으로 반영 |

---

## Issue 0 - [AWS/Auth] AWS CLI MFA 및 Terraform 접근 설정

### 목표 (What & Why)

M1 Hub 인프라를 Terraform으로 생성하기 전에 로컬 터미널에서 AWS CLI와 Terraform이 MFA 기반 STS 임시 세션으로 동작하도록 준비한다.

이 이슈는 새 IAM 사용자 생성을 포함하지 않는다. 이미 준비된 IAM 사용자, Access Key, 권한, MFA 장치를 사용한다.

### 완료 조건 (Definition of Done)

- [x] 기존 IAM Access Key / Secret Access Key를 `aws configure`로 등록
- [x] MFA device ARN 확인
- [x] `aws-mfa-script` 설치 및 `mfa.cfg` 구성
- [x] `.bashrc`에 Aegis AWS 환경 로더 등록
- [x] `mfa <OTP>` 실행 후 STS 임시 환경 변수 설정 확인
- [x] `aws sts get-caller-identity`로 대상 AWS 계정 확인
- [x] `terraform init` 및 인증 오류 없는 `terraform plan` 확인
- [x] Access Key, Secret Key, Session Token, MFA OTP를 문서와 Git에 기록하지 않음

### Acceptance Criteria

- `AWS_SESSION_TOKEN`이 설정된 동일 shell에서 AWS CLI 명령이 동작한다.
- Terraform provider가 하드코딩된 credential 없이 현재 shell의 MFA 세션을 사용한다.
- 인증 실패와 권한 부족을 구분해 설명할 수 있다.

### 완료 기록

- 완료일: 2026-04-30
- 기본 리전: `ap-south-1`
- 로컬 도구 경로: `/home/vicbear/Aegis/.tools`
- 세부 절차: `docs/planning/08_aws_cli_mfa_terraform_access.md`

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: AWS CLI와 Terraform이 MFA 기반 STS 세션으로 동작하도록 로컬 실행 기준을 정리했다.
- 변경/확인: `docs/planning/08_aws_cli_mfa_terraform_access.md`, `scripts/lib/aws-mfa.sh`, `scripts/lib/config.sh` 기준으로 MFA 로더와 실행 흐름을 확인했다.
- 검증: `aws sts get-caller-identity`, Terraform init/plan 계열 명령이 하드코딩 credential 없이 현재 shell 세션을 사용하도록 확인했다.
- 후속: 없음

---

## Issue 1 - [Hub/EKS] 클러스터 생성 및 기본 설정

### 목표 (What & Why)

Aegis-Pi Hub의 실행 환경인 EKS 클러스터를 생성한다.  
최신 클라우드 아키텍처 기준에서는 ArgoCD, Grafana 등 제어/관측 컴포넌트가 EKS Hub 위에서 동작하고, IoT Core 이후 데이터 처리는 Lambda data processor가 DynamoDB LATEST/HISTORY와 S3 processed로 저장한다.
따라서 이 클러스터 구성은 중앙 배포와 운영 관측 영역의 기반이 된다.

### 완료 조건 (Definition of Done)

- [x] Issue 0의 AWS CLI MFA 및 Terraform 접근 설정 완료
- [x] 리전, VPC/서브넷 사용 방식, EKS API endpoint 공개 범위 결정
- [x] EKS 클러스터 생성 (리전 결정 및 적용)
- [x] 노드그룹 구성 (인스턴스 타입, 최소/최대 노드 수 설정)
- [x] `kubectl` 로컬 접근 설정 (`kubeconfig` 업데이트)
- [x] EKS Add-on 설치
  - `vpc-cni`
  - `coredns`
  - `kube-proxy`
- [x] IAM OIDC Provider 연결 (IRSA 사용을 위한 전제)

### Acceptance Criteria

- `kubectl get nodes`에서 노드그룹 노드 `Ready` 상태 확인
- `kubectl cluster-info`에서 EKS API 엔드포인트 확인
- 로컬 환경에서 `kubectl` 명령 정상 동작

### 설계 결정 기록

- 문서: `docs/planning/09_m1_eks_vpc_decision_record.md`
- Delivery ownership: `docs/planning/11_delivery_ownership_flow.md`
- Region: `ap-south-1`
- VPC: Terraform 신규 생성
- VPC CIDR: `10.0.0.0/16`
- Subnet: `ap-south-1a`, `ap-south-1c`에 public 2개 + private 2개
- NAT Gateway: public Azone/Czone에 각 1개, private route table도 Azone/Czone 별도 구성
- Resource naming: `AEGIS-[resource]-[feature]-[zone]`
- Target cluster name: `AEGIS-EKS`
- Target Kubernetes version: `1.34`
- EKS nodegroup: private subnet, On-Demand, `t3.medium` 기본, 2대
- EKS API endpoint: MVP bootstrap 단계에서는 public endpoint + `0.0.0.0/0` 허용
- 테스트 종료 시 `terraform destroy`로 EKS, NAT Gateway, node group을 반드시 제거

### 완료 기록

- 완료일: 2026-04-30
- 최신 확인일: 2026-05-06
- Terraform apply 결과: `infra/hub 60 added, 0 changed, 0 destroyed`
- Cluster: `AEGIS-EKS`
- Region: `ap-south-1`
- Kubernetes API: `ACTIVE`, Kubernetes `1.34`
- VPC: `vpc-09c894826697d728f`
- Private subnets: `subnet-002dae5b51fec10e3`, `subnet-0fbe009eec8a23f95`
- Public subnets: `subnet-017c1e07df8bd8e1f`, `subnet-0ab9faef9ef8e6086`
- Node group: `AEGIS-EKS-node`, `t3.medium`, desired/min/max `2`
- `kubectl get nodes` 확인: worker node 2대 모두 `Ready`
- `kubectl cluster-info` 확인: control plane 및 CoreDNS endpoint 응답 정상
- 최소 분리 구조: `infra/hub`는 VPC/EKS, `scripts/ansible`은 namespace/LimitRange/ArgoCD bootstrap, `infra/foundation`은 S3/AMP/IoT Rule 같은 영속 리소스
- 이후 모든 신규 작업은 Terraform = 인프라, Ansible = bootstrap/설정/소프트웨어, GitHub Actions = CI, GitHub+ArgoCD = CD 기준으로 분류한다.
- 2026-05-08 현재 `infra/hub`는 destroy 완료 상태이며, Hub EKS와 ArgoCD는 삭제됐다. rebuild 시 같은 Terraform/Ansible 기준으로 재생성한다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: `infra/hub` Terraform root로 Hub VPC, public/private subnet, NAT Gateway, EKS cluster, managed node group을 구성했다. 최신 아키텍처 명칭으로는 2번 Control / Management VPC의 초기 구현이다.
- 변경/확인: `infra/hub/main.tf`, `infra/hub/variables.tf`, `infra/hub/outputs.tf`, `docs/planning/09_m1_eks_vpc_decision_record.md`를 확인했다.
- 검증: 2026-05-06 `build-all` 기준 Hub EKS `ACTIVE`, nodegroup `ACTIVE`, worker node 2대 `Ready`를 확인했다.
- 후속: EKS public endpoint CIDR 축소와 private 접근 전환은 M2/Tailscale 이후 진행한다.

---

## Issue 2 - [Hub/Kubernetes] 네임스페이스 설계 및 생성

### 목표 (What & Why)

EKS 내부 기능을 역할 기준으로 분리하여 관리한다.  
네임스페이스 경계가 명확해야 이후 ArgoCD ApplicationSet 배포 대상과 Grafana 데이터 소스 구분이 가능하다.
최신 클라우드 아키텍처 기준에서 별도 Risk 계산 파드는 두지 않고, Risk 계산은 Lambda data processor 내부 로직으로 처리한다.

### 완료 조건 (Definition of Done)

- [x] 아래 네임스페이스 생성 및 역할 정의 문서화
  - `argocd` - Hub에서 Spoke 배포 제어
  - `observability` - Grafana, AMP 연동 메트릭 관제
  - `risk` - M1 Hub 배포/IRSA 검증용 또는 임시 risk workload. 최신 목표에서는 별도 Risk 계산 파드를 두지 않음
  - `ops-support` - M1 보조 namespace. 최신 목표에서는 `pipeline_status` 갱신을 Lambda data processor가 담당
- [x] 각 네임스페이스에 기본 ResourceQuota 또는 LimitRange 설정 (선택)
- [x] 네임스페이스 구조를 `docs/architecture/00_current_architecture.md` 또는 Hub 운영 문서에 반영

### Acceptance Criteria

- `kubectl get namespaces`에서 4개 네임스페이스 확인
- 각 네임스페이스 역할이 문서에 명시되어 있음

### 구현 기록

- 관리 파일: `scripts/ansible/files/hub-bootstrap.yaml`
- 관리 방식: Ansible local bootstrap + `kubectl apply`
- Namespace 역할 문서: `infra/hub/README.md`, `docs/ops/13_hub_namespace_baseline.md`
- Terraform apply 결과: `infra/hub 60 added, 0 changed, 0 destroyed`
- `kubectl get namespaces argocd observability risk ops-support` 확인: 4개 namespace 모두 `Active`
- `kubectl get limitrange` 확인: 각 namespace에 `default-limits` 생성 완료
- namespace 관리는 Terraform이 아니라 Ansible bootstrap으로 전환했다.
- 현재 AWS에서는 2026-05-06~2026-05-07 `build-all` 실행으로 Hub EKS와 namespace를 검증했고, 2026-05-08 `destroy-all.sh`로 삭제했다. recreate 시에는 `scripts/build/build-hub.sh`가 Terraform apply와 Ansible bootstrap을 순서대로 수행한다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: Hub 내부 기능을 `argocd`, `observability`, `risk`, `ops-support` namespace로 분리하고 기본 LimitRange를 적용했다.
- 변경/확인: `scripts/ansible/files/hub-bootstrap.yaml`, `scripts/ansible/inventory/group_vars/hub_eks.yml`, `docs/ops/13_hub_namespace_baseline.md`를 확인했다.
- 검증: 4개 namespace `Active`와 각 namespace `default-limits` 생성을 확인했다.
- 후속: 없음

---

## Issue 3 - [Hub/ArgoCD] ArgoCD 설치 (Spoke 등록 전 단계)

### 목표 (What & Why)

Hub의 중앙 배포 제어 계층인 ArgoCD를 EKS에 설치한다.  
이 단계에서는 Spoke 클러스터 등록은 하지 않는다. (M2에서 Mesh VPN 연결 후 진행)  
ArgoCD 자체가 정상 동작하는 상태까지만 완료한다.

### 완료 조건 (Definition of Done)

- [x] `argocd` 네임스페이스에 ArgoCD 설치
- [x] ArgoCD 초기 admin 비밀번호 확인
- [x] ArgoCD UI 접근 가능 확인 (LoadBalancer 또는 포트포워딩)
- [x] ArgoCD CLI 로컬 설정 완료
- [x] ArgoCD 버전 및 설치 방식 관련 문서에 기록

### Acceptance Criteria

- ArgoCD UI 브라우저 접근 가능
- `argocd cluster list`에서 in-cluster(EKS 자체) 확인
- Spoke 등록 없이도 ArgoCD 자체 `Healthy` 상태

### 구현 기록

- 완료일: 2026-05-04
- 설치 방식: Helm chart `argo/argo-cd`
- Helm release: `argocd`
- Namespace: `argocd`
- Chart version: `argo-cd-9.5.11`
- ArgoCD app version: `v3.3.9`
- ArgoCD CLI: `/home/vicbear/Aegis/.tools/bin/argocd`, `v3.3.9`
- UI 접근 방식: `kubectl -n argocd port-forward service/argocd-server 8080:443`
- UI 검증: `https://127.0.0.1:8080` HTTP 200 확인
- Service 노출: `argocd-server`는 `ClusterIP` 유지. M1 Issue 3에서는 AWS LoadBalancer를 만들지 않았다.
- 초기 admin secret: `argocd-initial-admin-secret` 생성 확인. 비밀번호 값은 문서에 기록하지 않는다.
- CLI 검증: admin login 성공, `argocd cluster list`에서 `https://kubernetes.default.svc` / `in-cluster` 확인.
- Pod 검증: `argocd-application-controller`, `argocd-applicationset-controller`, `argocd-dex-server`, `argocd-notifications-controller`, `argocd-redis`, `argocd-repo-server`, `argocd-server` 모두 `Running` / `Ready` 확인.

### 운영 기준

- 현재 단계의 ArgoCD UI 접근은 사용자 로컬 PC에서 EKS kubeconfig를 설정한 뒤 `kubectl port-forward`로 수행한다.
- `argocd-server`는 `ClusterIP`로 유지한다.
- M1 단계에서는 ArgoCD public `LoadBalancer`를 만들지 않는다.
- UI는 상태 확인, diff 확인, 수동 sync 검증 용도로 사용한다.
- repo, Project, Application, ApplicationSet처럼 반복 적용해야 하는 설정은 UI 클릭에만 의존하지 않고 Git/YAML/ApplicationSet으로 코드화한다.
- M2에서 Tailscale을 구성할 때 ArgoCD 접근 경로를 private access로 전환한다.
- Tailscale 적용 후 EKS API endpoint public CIDR `0.0.0.0/0`를 더 좁힌다.

### Ansible bootstrap 기준

ArgoCD는 수동 Helm install과 Terraform Helm release 편입을 검증한 뒤, 최종 운영 기준을 Ansible local bootstrap으로 전환했다. 이후 EKS를 destroy/recreate할 때는 `infra/hub terraform apply` 후 Ansible playbook이 namespace, LimitRange, ArgoCD Helm release를 재생성한다.

구성:

- `scripts/ansible/inventory/hub_eks_dynamic.sh` 추가 완료
- `scripts/ansible/inventory/group_vars/hub_eks.yml` 추가 완료
- `scripts/ansible/files/hub-bootstrap.yaml` 추가 완료
- `scripts/ansible/files/argocd-values.yaml` 추가 완료
- `scripts/ansible/playbooks/hub_argocd_bootstrap.yml` 추가 완료
- `scripts/ansible/playbooks/hub_argocd_verify.yml` 추가 완료
- `helm upgrade --install`로 `argo/argo-cd` chart `9.5.11` 관리
- release name `argocd`, namespace `argocd` 유지
- `argocd-server` service type `ClusterIP` 명시
- repo, AppProject, Application, ApplicationSet은 후속으로 코드화

Ansible inventory는 EC2 node SSH 대상이 아니라 `localhost` 대상이다. `infra/hub`의 `terraform output -json`에서 `cluster_name`, `aws_region`, `update_kubeconfig_command`를 읽어 EKS Kubernetes API에 접근한다.

포트포워딩은 Ansible 설치 대상에 넣지 않는다. 장기 실행 로컬 프로세스이므로 `scripts/ops/argocd-port-forward.sh` 운영 스크립트로 제공한다.

### 현재 실행 상태

2026-05-06 `build-all` 재실행으로 Hub EKS와 ArgoCD를 검증했고, 2026-05-08 `destroy-all.sh`로 삭제했다.

결과:

- `infra/hub`: destroy complete
- Hub EKS/VPC/node group/NAT Gateway: deleted
- ArgoCD/Hub namespace: deleted with EKS
- ArgoCD Helm release: `argocd`, chart `argo-cd-9.5.11`, app `v3.3.9`
- `infra/foundation`: destroy complete
- S3 bucket `aegis-bucket-data`: deleted

destroy 후 다시 올릴 때는 아래 단일 진입점을 사용하면 Terraform apply와 Ansible bootstrap이 순서대로 실행된다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/build/build-hub.sh
```

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: Hub EKS에 ArgoCD를 Helm으로 설치하고, 최종 기준을 Ansible local bootstrap으로 전환했다.
- 변경/확인: `scripts/ansible/playbooks/hub_argocd_bootstrap.yml`, `scripts/ansible/playbooks/hub_argocd_verify.yml`, `scripts/ansible/files/argocd-values.yaml`, `scripts/ops/argocd-port-forward.sh`를 확인했다.
- 검증: ArgoCD Helm release `argocd`, chart `argo-cd-9.5.11`, app `v3.3.9`, 주요 pod `Running/Ready`, UI port-forward 접근, CLI `in-cluster` 확인을 완료했다.
- 후속: Spoke cluster 등록과 ApplicationSet은 M2/M3에서 진행한다.

---

## Issue 4 - [Hub/S3] 버킷 생성 및 경로 파티셔닝 설계

### 목표 (What & Why)

Edge에서 올라온 데이터를 장기 보존하는 중앙 원본 적재 지점을 구성한다.  
공장/source_type/날짜 기준 파티셔닝으로 이후 정규화 서비스가 데이터를 효율적으로 읽을 수 있게 한다.

### 완료 조건 (Definition of Done)

- [x] S3 버킷 생성 (버킷 이름, 리전, 퍼블릭 액세스 차단 설정)
- [x] 경로 파티셔닝 규칙 확정 및 Terraform 코드 반영
  - raw: `raw/{factory_id}/{source_type}/yyyy={YYYY}/mm={MM}/dd={DD}/{message_id}.json`
  - processed: `processed/{dataset}/{factory_id}/yyyy={YYYY}/mm={MM}/dd={DD}/{message_id}.json`
  - latest: `latest/{factory_id}/status.json`, `latest/{factory_id}/risk-score.json`
- [x] IoT Rule → S3 적재 연결 확인 (Issue 5와 연계)
- [x] S3 버킷 정책 및 IAM Role 설정 (EKS 서비스 계정 접근 허용)
- [x] 파티셔닝 규칙을 foundation 문서에 반영

### Terraform 기준

- Root: `infra/foundation`
- Bucket: `aegis-bucket-data`
- Region: `ap-south-1`
- Versioning: enabled
- Encryption: SSE-S3 (`AES256`)
- Public access block: enabled
- Lifecycle:
  - `raw/`: 90일 후 Glacier Instant Retrieval 전환
  - `processed/`: 365일 후 Standard-IA 전환
  - `latest/`: current object 삭제 없음, noncurrent version 30일 후 삭제
  - 전체 incomplete multipart upload 7일 후 중단

Public access block은 다른 VPC 접근을 막기 위한 설정이 아니라 인터넷 공개를 차단하는 안전장치다. 다른 VPC, EKS, EC2에서 접근해야 할 때는 IAM Role, S3 VPC Endpoint, bucket policy로 허용한다.

### 완료 기록

- 완료일: 2026-05-04
- Terraform apply 결과: `10 added, 0 changed, 0 destroyed`
- Terraform state:
  - `aws_s3_bucket.data`
  - `aws_s3_bucket_lifecycle_configuration.data`
  - `aws_s3_bucket_ownership_controls.data`
  - `aws_s3_bucket_public_access_block.data`
  - `aws_s3_bucket_server_side_encryption_configuration.data`
  - `aws_s3_bucket_versioning.data`
- AWS API 검증:
  - versioning `Enabled`
  - public access block 4개 옵션 모두 `true`
  - server-side encryption `AES256`
  - lifecycle rule 4개 적용 확인
- IoT Rule 적재 검증:
  - Rule: `AEGIS_IoTRule_factory_a_raw_s3`
  - Topic filter: `aegis/factory-a/+`
  - Test topic: `aegis/factory-a/sensor`
  - Test object: `raw/factory-a/sensor/yyyy=2026/mm=05/dd=06/manual-20260506T014423Z-31668.json`
- IRSA 검증:
  - ServiceAccount: `risk/risk-normalizer`
  - IAM Role: `AEGIS-IAMRole-IRSA-risk-normalizer`
  - Assumed role ARN: `arn:aws:sts::611058323802:assumed-role/AEGIS-IAMRole-IRSA-risk-normalizer/botocore-session-1778033798`
  - Allowed read: `s3://aegis-bucket-data/raw/factory-a/`
  - Allowed write: `s3://aegis-bucket-data/latest/factory-a/irsa-test.json`
  - Denied write: `s3://aegis-bucket-data/raw/factory-a/irsa-denied.txt`

### Acceptance Criteria

- IoT Core 테스트 메시지 발행 후 S3 지정 경로에 파일 적재 확인
- EKS 내부 파드에서 S3 버킷 접근 가능 (IRSA 기반)
- 잘못된 경로에 데이터가 적재되지 않음

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: 중앙 raw/processed/latest 데이터 버킷을 `infra/foundation` Terraform root에 구성하고, IoT Rule 적재 및 `risk-normalizer` IRSA 접근 기준까지 검증했다.
- 변경/확인: `infra/foundation/s3.tf`, `infra/foundation/iot_rule.tf`, `infra/hub/irsa_risk_normalizer.tf`, `infra/foundation/README.md`를 확인했다.
- 검증: S3 versioning, SSE-S3, public access block, lifecycle 적용, IoT Rule 테스트 메시지 raw prefix 적재, IRSA read/write 허용 및 raw prefix write deny를 확인했다.
- 후속: 정규화 서비스 실제 구현은 M4에서 진행한다.

---

## Issue 5 - [Hub/IoT Core] Thing / 인증서 / 규칙 구성

### 목표 (What & Why)

각 Spoke의 Edge Agent가 데이터를 전송할 IoT Core 진입점을 구성한다.  
Thing, 인증서, 정책, IoT Rule을 설정하여 Edge → IoT Core → S3 파이프라인의 앞단을 완성한다.

### 완료 조건 (Definition of Done)

- [x] IoT Core Thing 생성 (공장별 Thing 또는 통합 Thing 방식 결정 및 적용)
- [x] X.509 인증서 생성 및 Thing 연결
- [x] IoT 정책 생성 (`iot:Connect`, `iot:Publish`, `iot:Subscribe` 권한)
- [x] IoT Rule 생성 (수신 메시지 → S3 적재 연결)
- [x] IoT Core 엔드포인트 확인 및 기록
- [x] 테스트 메시지 발행 및 IoT Core 수신 확인

### Acceptance Criteria

- AWS 콘솔 IoT Core `MQTT 테스트 클라이언트`에서 테스트 메시지 수신 확인
- IoT Rule이 트리거되어 S3에 메시지 적재 확인 (Issue 4 이후)
- 인증서 파일이 안전하게 보관됨 (Edge Agent 배포 시 사용)

### 현재 기록

- Thing: `AEGIS-IoTThing-factory-a`
- Policy: `AEGIS-IoTPolicy-factory-a`
- Topic prefix: `aegis/factory-a`
- Local secret path: `secret/iot/factory-a/`
- K3s Secret: `ai-apps/aws-iot-factory-a-cert`
- Rule: `AEGIS_IoTRule_factory_a_raw_s3`
- Rule topic filter: `aegis/factory-a/+`
- Rule target: `s3://aegis-bucket-data/raw/factory-a/${source_type}/yyyy=${YYYY}/mm=${MM}/dd=${DD}/${message_id}.json`
- Test message ID: `manual-20260506T014423Z-31668`
- Test S3 object: `raw/factory-a/sensor/yyyy=2026/mm=05/dd=06/manual-20260506T014423Z-31668.json`
- 다음 작업: Issue 6의 AMP Workspace 생성, Issue 7 Prometheus Agent 실제 전송, Issue 8 Grafana, Issue 9 AWS Load Balancer Controller, Issue 10 Admin UI HTTPS Ingress는 완료했다. 다음은 Issue 12 `runtime-config.yaml` 구조 초안이다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: `factory-a` Edge Agent가 사용할 IoT Core Thing, 인증서, 정책, K3s Secret, IoT Rule을 구성해 Edge -> IoT Core -> S3 raw 적재 앞단을 완성했다.
- 변경/확인: `scripts/iot/register-thing.sh`, `scripts/iot/register-k3s-secret.sh`, `infra/foundation/iot_rule.tf`, `scripts/build/build-iot-factory-a.sh`를 확인했다.
- 검증: IoT certificate active/Thing attach, K3s Secret 데이터 구성, 테스트 topic publish 후 S3 raw object 생성을 확인했다.
- 후속: 실제 Edge Agent 송신 구현과 end-to-end 데이터 플레인 검증은 M4에서 진행한다.

---

## Issue 6 - [관제/AMP] AMP(Amazon Managed Prometheus) Workspace 생성 및 접근 권한 준비

### 목표 (What & Why)

각 Spoke 메트릭의 중앙 수집 대상이 되는 AMP Workspace를 먼저 준비한다.  
이 이슈에서는 Workspace 생성과 쓰기 권한 준비까지 완료하고, 실제 메트릭 전송은 다음 이슈에서 수행한다.

### 완료 조건 (Definition of Done)

- [x] AMP Workspace 생성
- [x] IAM Role 및 IRSA 설정 (Prometheus → AMP 쓰기 권한)
- [x] AMP Workspace ARN 및 엔드포인트 기록
- [x] AMP 접근 정책을 Hub 관제 관련 문서에 반영

### Acceptance Criteria

- AWS 콘솔에서 AMP Workspace 생성 확인
- Prometheus 서비스 계정에 연결할 IAM/IRSA 구성이 준비됨
- AMP Workspace ARN 및 remote_write 엔드포인트를 참조 가능

### 현재 기록

- Workspace alias: `AEGIS-AMP-hub`
- Workspace ID: `ws-6a8853dc-0eb4-43e7-9b97-efade5b75765`
- Workspace ARN: `arn:aws:aps:ap-south-1:611058323802:workspace/ws-6a8853dc-0eb4-43e7-9b97-efade5b75765`
- Prometheus endpoint: `https://aps-workspaces.ap-south-1.amazonaws.com/workspaces/ws-6a8853dc-0eb4-43e7-9b97-efade5b75765/`
- Remote write endpoint: `https://aps-workspaces.ap-south-1.amazonaws.com/workspaces/ws-6a8853dc-0eb4-43e7-9b97-efade5b75765/api/v1/remote_write`
- IRSA Role: `AEGIS-IAMRole-IRSA-prometheus-remote-write`
- IRSA Policy: `AEGIS-IAMPolicy-IRSA-prometheus-remote-write-AMP`
- ServiceAccount: `observability/prometheus-agent`
- Allowed action: `aps:RemoteWrite` to the workspace ARN only
- EKS pod assume-role 검증:
  - Assumed role ARN: `arn:aws:sts::611058323802:assumed-role/AEGIS-IAMRole-IRSA-prometheus-remote-write/botocore-session-1778037092`
- 다음 작업: Issue 7 Prometheus Agent 실제 전송 검증, Issue 8 Grafana/AMP 기준 결정, Issue 9 AWS Load Balancer Controller, Issue 10 ArgoCD/Grafana HTTPS Admin Ingress는 완료했다. 다음은 Issue 12 `runtime-config.yaml` 구조 초안이다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: AMP Workspace를 `infra/foundation`에 생성하고, Hub EKS의 `observability/prometheus-agent` ServiceAccount가 AMP remote_write 권한을 assume할 수 있도록 IRSA를 구성했다.
- 변경/확인: `infra/foundation/amp.tf`, `infra/hub/irsa_prometheus_remote_write.tf`, `infra/hub/outputs.tf`, `scripts/ansible/playbooks/hub_argocd_bootstrap.yml`를 확인했다.
- 검증: AMP workspace active, remote_write endpoint 기록, ServiceAccount annotation, EKS 내부 pod의 assume-role 성공을 확인했다.
- 후속: Prometheus Agent 설치와 실제 remote_write 메트릭 수신 검증은 Issue 7에서 완료했고, Grafana/AMP 기준은 Issue 8에서 완료했다. AWS Load Balancer Controller와 Admin UI Ingress는 Issue 9~10에서 완료했으며, 다음은 Issue 12 `runtime-config.yaml` 구조 초안이다.

---

## Issue 7 - [관제/Prometheus] Hub Prometheus 설치 및 AMP remote_write 구성

### 목표 (What & Why)

Hub EKS 내부에서 메트릭을 수집할 Prometheus(또는 Agent)를 설치하고 AMP로 전송한다.  
이 단계가 완료되어야 내부 관측용 Grafana 또는 후속 Dashboard API가 AMP/metrics 계층을 참조할 수 있다.

### 완료 조건 (Definition of Done)

- [x] `observability` 네임스페이스에 Prometheus 또는 Prometheus Agent 설치
- [x] EKS 기본 메트릭 수집 대상 확인
  - 노드/파드/클러스터 기본 메트릭
- [x] AMP remote_write 설정 적용
- [x] IRSA 기반으로 AMP 쓰기 권한 연결
- [x] 메트릭 수신 여부 확인 및 설정 기록

### Acceptance Criteria

- Prometheus(또는 Agent) 파드 `Running`
- AMP 콘솔 또는 쿼리로 메트릭 수신 확인
- remote_write 오류 없이 지속 수집되는 로그 확인

### 완료 기록

- 완료일: 2026-05-06
- 운영 문서: `docs/ops/16_hub_prometheus_amp.md`
- 관리 파일:
  - `scripts/ansible/playbooks/hub_prometheus_agent_bootstrap.yml`
  - `scripts/ansible/playbooks/hub_prometheus_agent_verify.yml`
  - `scripts/ansible/templates/prometheus-agent.yaml.j2`
  - `scripts/build/build-hub.sh`
- Prometheus Agent namespace/service account: `observability/prometheus-agent`
- 수집 job: `prometheus-agent`, `kubernetes-apiservers`, `kubernetes-nodes`, `kubernetes-pods`
- 검증 결과:
  - prometheus-agent pod `Running`, `1/1 Ready`, restarts `0`
  - ServiceAccount IRSA annotation 확인
  - 최근 로그에서 remote_write 오류 패턴 없음
  - AMP Query API에서 `up{cluster="AEGIS-EKS"}` 수신 확인

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: Hub EKS `observability` 네임스페이스에 Prometheus Agent를 배포하고 AMP remote_write로 기본 Kubernetes 메트릭을 전송하도록 구성했다.
- 변경/확인: `scripts/ansible/playbooks/hub_prometheus_agent_bootstrap.yml`, `scripts/ansible/playbooks/hub_prometheus_agent_verify.yml`, `scripts/ansible/templates/prometheus-agent.yaml.j2`, `docs/ops/16_hub_prometheus_amp.md`, `scripts/build/build-hub.sh`를 확인했다.
- 검증: prometheus-agent pod `Running/Ready`, IRSA annotation, remote_write 오류 없는 최근 로그, AMP Query API의 `up{cluster="AEGIS-EKS"}` 수신을 확인했다.
- 후속: 내부 관측용 Grafana/AMP 데이터 소스 기준은 Issue 8에서 결정했고, 관리자 HTTPS 접근 경로는 Issue 9~10에서 구성/검증했다.

---

## Issue 8 - [관제/Grafana] 내부 관측용 Grafana/AMP 데이터 소스 기준 결정

### 목표 (What & Why)

Hub 내부 관측에 사용할 Grafana 또는 AMP 조회 기준을 구성한다.

본사 관리자용 최종 대시보드는 Dashboard VPC의 Web/API로 확장한다. 다만 MVP 단계에서는 관리자들이 ArgoCD와 Grafana 웹 UI에 실제 HTTPS 경로로 접근할 수 있는지 검증하기 위해 Issue 9~10에서 별도 Admin Ingress를 구성/검증했다.

### 완료 조건 (Definition of Done)

- [x] `observability` 네임스페이스에 Grafana 설치 여부 결정
- [x] Grafana를 설치하는 경우 초기 admin 비밀번호 설정
- [x] Grafana 접근 방식을 내부 운영용으로 시작하고, 별도 Issue에서 HTTPS Admin Ingress로 확장할지 결정
- [x] 데이터 소스 연결
  - AMP (Prometheus 호환)
- [x] Grafana 버전 및 설치 방식 기록
- [x] Dashboard VPC가 조회할 DynamoDB LATEST/HISTORY와 S3 processed 후보를 문서에 명시

### Acceptance Criteria

- Grafana를 설치하는 경우 UI 접근 가능
- AMP 데이터 소스 `Test` 버튼 성공
- Explore 탭에서 AMP 기본 메트릭 쿼리 결과 확인
- 외부 관리자 대시보드, 내부 Grafana, MVP Admin Ingress의 역할 차이가 문서화됨

### 완료 기록

- 완료일: 2026-05-06
- 운영 문서: `docs/ops/17_hub_grafana_amp.md`
- 선택 방식: EKS 내부 Grafana OSS + AMP datasource + IRSA + ClusterIP/port-forward로 시작
- Grafana chart: `grafana/grafana` `10.5.15`
- Grafana app version: `12.3.1`
- Namespace/service account: `observability/grafana`
- IRSA role: `arn:aws:iam::611058323802:role/AEGIS-IAMRole-IRSA-grafana-amp-query`
- Service type: `ClusterIP`
- Datasource: `AEGIS-AMP`, uid `aegis-amp`, SigV4 enabled
- Admin password: Kubernetes Secret `observability/grafana-admin`에 최초 1회 생성, Git/문서에 저장하지 않음
- Access: `scripts/ops/grafana-port-forward.sh` 후 `http://127.0.0.1:30080`
- 후속 접근 계획: Issue 10에서 `grafana` Service는 `ClusterIP`로 유지하되, Public ALB + HTTPS Ingress host rule로 관리자 외부 접근을 검증했다.
- Verification:
  - `scripts/build/build-hub.sh` 전체 통과
  - Grafana Deployment `1/1 available`
  - Grafana Service `ClusterIP`
  - Grafana API proxy로 `up{cluster="AEGIS-EKS"}` AMP query 성공
  - Query result: `kubernetes-apiservers`, `kubernetes-nodes`, `kubernetes-pods`, `prometheus-agent` 모두 `1`
- Dashboard VPC 최신 상태 저장소 후보: 최신 기준은 DynamoDB LATEST/HISTORY와 S3 processed. M1 당시 S3 `latest/` prefix 후보는 과거 검토안으로만 남김

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: Hub 내부 관측은 public 노출 없는 Grafana OSS를 `observability`에 설치하고 AMP datasource를 SigV4 + IRSA로 연결하는 방식으로 결정/구현했다.
- 변경/확인: `infra/hub/irsa_grafana_amp_query.tf`, `scripts/ansible/playbooks/hub_grafana_bootstrap.yml`, `scripts/ansible/playbooks/hub_grafana_verify.yml`, `scripts/ansible/templates/grafana-values.yaml.j2`, `scripts/ops/grafana-port-forward.sh`, `docs/ops/17_hub_grafana_amp.md`를 확인했다.
- 검증: `scripts/build/build-hub.sh` 전체 경로가 통과했고, Grafana API proxy를 통해 AMP `up{cluster="AEGIS-EKS"}` 쿼리가 성공했다.
- 후속: AWS Load Balancer Controller와 ArgoCD/Grafana HTTPS Admin Ingress는 M1 Issue 9~10에서 완료했다. 다음은 M1 Issue 12 `runtime-config.yaml` 구조 초안이다.

---

## Issue 9 - [Hub/Ingress] AWS Load Balancer Controller 준비

### 목표 (What & Why)

Hub EKS의 Kubernetes Ingress가 AWS Application Load Balancer를 생성하고 관리할 수 있도록 AWS Load Balancer Controller를 구성한다.

이 이슈는 ArgoCD/Grafana를 외부에 직접 노출하지 않는다. Issue 10에서 HTTPS Admin Ingress를 구성하기 위한 선행 작업이다.

### 완료 조건 (Definition of Done)

- [x] AWS Load Balancer Controller용 IAM policy와 IRSA role 구성
- [x] `kube-system` 또는 지정 namespace에 AWS Load Balancer Controller Helm release 설치
- [x] Hub public subnet에 ALB discovery tag 확인 또는 보강
  - `kubernetes.io/role/elb = 1`
  - `kubernetes.io/cluster/AEGIS-EKS = shared` 또는 controller가 요구하는 동등 기준
- [x] EKS OIDC provider와 controller ServiceAccount annotation 연결 확인
- [x] `scripts/build/build-hub.sh`에서 재생성 시 controller가 자동 설치/검증되도록 연결
- [x] `scripts/destroy/destroy-hub.sh` 또는 관련 destroy 흐름에서 controller/Ingress 생성 ALB가 삭제되는 순서 확인
- [x] 운영 문서에 controller 책임 경계와 비용 영향 기록

### Acceptance Criteria

- `aws-load-balancer-controller` pod가 `Running/Ready` 상태다.
- controller ServiceAccount가 IRSA role annotation을 가진다.
- controller 로그에 AWS credential 또는 subnet discovery 오류가 없다.
- 테스트 Ingress 또는 dry-run 검증으로 ALB 생성 전제 조건이 충족됨을 확인한다.
- Terraform/Ansible/build/destroy 책임 경계가 문서화되어 있다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: AWS Load Balancer Controller용 IAM policy/IRSA를 `infra/hub`에 추가하고, `kube-system/aws-load-balancer-controller` Helm release를 Ansible bootstrap에 연결했다.
- 변경/확인: `infra/hub/irsa_aws_load_balancer_controller.tf`, `scripts/ansible/playbooks/hub_aws_load_balancer_controller_bootstrap.yml`, `scripts/ansible/playbooks/hub_aws_load_balancer_controller_verify.yml`, `scripts/build/build-hub.sh`, `scripts/destroy/destroy-hub.sh`를 추가/갱신했다.
- 검증: `scripts/build/build-hub.sh` 통과. Helm release `aws-load-balancer-controller-1.14.0`, app `v2.14.0`, Deployment `2/2 Available`, ServiceAccount IRSA annotation, public subnet discovery tag, controller recent log 오류 부재를 확인했다.
- 후속: Issue 10에서 Gabia DNS 위임, ACM 발급, ArgoCD/Grafana HTTPS host rule 활성화를 완료했다. 운영 보안 강화는 Issue 11로 분리했지만 MVP 이후로 보류한다.

---

## Issue 10 - [Hub/Admin UI] ArgoCD/Grafana HTTPS Admin Ingress 구성

### 목표 (What & Why)

관리자가 로컬 `kubectl port-forward`나 SSM 터널 없이 브라우저에서 ArgoCD와 Grafana UI에 접근할 수 있도록 HTTPS 기반 Admin Ingress를 구성한다.

ArgoCD와 Grafana는 계속 EKS 내부 Pod/Service로 실행한다. Service는 `ClusterIP`로 유지하고, 외부 진입점은 Public ALB 1개와 host 기반 Ingress rule로 통합한다.

### 완료 조건 (Definition of Done)

- [x] Admin UI용 도메인과 ACM public certificate 기준 결정
  - `argocd.minsoo-tech.cloud`, `grafana.minsoo-tech.cloud`
  - ACM 인증서는 ALB/Route53에 쓰는 non-exportable public certificate 기준
- [x] Public ALB 1개를 공유하는 Ingress group 기준 정의
- [x] ArgoCD Ingress host rule 작성
- [x] Grafana Ingress host rule 작성
- [x] HTTPS listener `443`을 외부 진입점으로 사용
- [x] HTTP `80`은 HTTPS redirect 용도로만 사용
- [x] MVP 임시 허용 CIDR 기준 적용
- [x] ArgoCD/Grafana 자체 로그인은 유지
- [x] Route53 record 생성 또는 수동 DNS 연결 절차 문서화
- [x] `build-all`/`build-hub` 재실행 시 Admin Ingress가 재현되는 경로 구성
- [x] `destroy-all`/`destroy-hub` 실행 시 Ingress가 만든 ALB/TargetGroup/SecurityGroup이 삭제되는 순서 구성
- [x] 비용 문서에 ALB, public IPv4, Route53, ACM 비용 기준 반영
- [x] Gabia에서 `minsoo-tech.cloud` 네임서버를 Route53 Hosted Zone NS로 위임
- [x] ACM certificate `ISSUED` 상태 확인
- [x] `ADMIN_UI_INGRESS_ENABLED=true`로 Admin Ingress 실제 적용 및 HTTPS 접속 검증

### Acceptance Criteria

- `https://argocd.<domain>`으로 ArgoCD 로그인 화면에 접근할 수 있다.
- `https://grafana.<domain>`으로 Grafana 로그인 화면에 접근할 수 있다.
- 두 host가 같은 Public ALB를 공유한다.
- `argocd-server`와 `grafana` Kubernetes Service는 `ClusterIP` 상태를 유지한다.
- 인증서가 브라우저에서 유효하게 인식된다.
- 허용되지 않은 IP에서 접근이 차단되거나, 최소한 관리자 IP allowlist 적용 계획과 한계가 문서화되어 있다.
- AWS 리소스 정리 후 ALB, target group, listener, security group, public IPv4 잔여물이 없는지 확인한다.

### MVP 범위

- 포함:
  - Public ALB 1개
  - HTTPS
  - host 기반 Ingress
  - MVP 임시 허용 CIDR `0.0.0.0/0`
  - ArgoCD/Grafana 자체 로그인

- 제외:
  - WAF
  - Cognito
  - 외부 OIDC/SSO
  - 별도 Dashboard VPC Web/API
  - 일반 사용자용 공개 대시보드

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: `minsoo-tech.cloud` 기준 Route53 Hosted Zone, ACM public certificate, shared ALB Ingress template, bootstrap/verify/cleanup playbook을 구성하고 실제 Admin Ingress를 활성화했다.
- 변경/확인: `infra/hub/admin_ui_dns.tf`, `scripts/ansible/templates/admin-ui-ingress.yaml.j2`, `scripts/ansible/playbooks/hub_admin_ingress_bootstrap.yml`, `scripts/ansible/playbooks/hub_admin_ingress_verify.yml`, `scripts/ansible/playbooks/hub_admin_ingress_cleanup.yml`, `docs/ops/21_hub_admin_ui_ingress.md`를 추가했다.
- 검증: ACM status `ISSUED`, shared ALB `aegis-admin-ui-1532265527.ap-south-1.elb.amazonaws.com`, `https://argocd.minsoo-tech.cloud/` HTTP 200, `https://grafana.minsoo-tech.cloud/api/health` HTTP 200, ArgoCD/Grafana Service `ClusterIP` 유지 확인. 재생성 시에는 `scripts/build/build-all.sh`로 Route53/ACM/NS 파일까지 준비하고, Gabia NS 위임 뒤 `scripts/build/build-admin-ui-after-ns.sh`로 Admin UI Ingress를 활성화한다.
- 후속: MVP 이후 운영 노출 기준이 필요해지면 Issue 11에서 WAF/Cognito/OIDC 또는 관리자 IP 제한을 적용한다.

---

## Issue 11 - [Hub/Admin UI] 운영 보안 강화 백로그

### 목표 (What & Why)

MVP HTTPS Admin Ingress가 검증된 뒤, 운영 전환에 필요한 추가 보안 계층을 설계하고 적용한다.

이 이슈는 MVP 필수 범위가 아니다. 외부 접근 가능 여부를 먼저 검증한 뒤, 운영 노출 기준이 필요해질 때 진행한다.

### 완료 조건 (Definition of Done)

- [ ] WAF 적용 여부와 rule set 결정
- [ ] Cognito 자체 User Pool과 외부 OIDC/SSO 중 인증 방식 결정
- [ ] 관리자 그룹/계정/MFA 정책 정의
- [ ] ALB access log와 감사 로그 보관 위치 결정
- [ ] IP allowlist만으로 충분하지 않은 운영 위험 정리
- [ ] 비용 문서에 WAF/Cognito/OIDC 추가 비용 기준 반영

### Acceptance Criteria

- Route53 -> ALB -> WAF/Auth -> ArgoCD/Grafana 흐름이 설명 가능하다.
- WAF/Cognito/OIDC를 적용하지 않는 MVP 상태와 운영 전환 상태의 차이가 문서화되어 있다.
- 운영 보안 적용 후에도 ArgoCD/Grafana Service는 `ClusterIP`를 유지한다.

### GitHub Issue Comment Draft

- 상태: 보류
- 진행 요약: WAF, Cognito, OIDC는 MVP 외부 접근 검증에는 과하므로 운영 보안 강화 백로그로 분리했다.
- 변경/확인: 현재는 이슈 범위와 판단 기준만 문서화했다.
- 검증: 미실행
- 후속: HTTPS Admin Ingress 검증은 Issue 10에서 완료했다. 운영 전환 필요성이 생기면 이 보안 강화 이슈를 진행한다.

---

## Issue 12 - [Risk/Config] `runtime-config.yaml` 파일 구조 초안 작성

### 목표 (What & Why)

Hub 단에서 공장별 필드 사용 여부와 Risk 가중치를 제어하는 중앙 설정 파일 구조를 확정한다.  
이 구조가 M6(Risk Twin)에서 실제 가중치 계산의 기반이 되며,  
공장별 override 구조도 이 파일에서 관리된다.

### 완료 조건 (Definition of Done)

- [x] `configs/runtime/runtime-config.yaml` 경로 생성
- [x] 전역(`global`) 섹션 구조 정의
  - 필드별 `display` / `risk_enabled` 불리언
  - 필드별 가중치 초기값
- [x] 공장별(`factories`) override 섹션 구조 정의
  - `factory_id` 기준 override 키
  - `factory-a`는 전역 설정 사용, `factory-c`는 VM 네트워크 특성을 반영해 일부 override 예시 포함
- [x] 구조 예시 작성

```yaml
global:
  fields:
    temperature:
      display: true
      risk_enabled: true
      weight: 15
    humidity:
      display: true
      risk_enabled: true
      weight: 10
    node_status:
      display: true
      risk_enabled: true
      weight: 20
    # ... 전체 필드 목록

factories:
  factory-a:
    fields: {}      # 현재는 전역 설정 사용
  factory-b:
    fields: {}
  factory-c:
    fields:
      network_reachability:
        weight: 10
```

- [x] 구조를 구성 관리 관련 문서에 반영

### 현재 추천값

- `factory-a`: 실제 Raspberry Pi 3-node production-edge, real input, dummy data 비활성화
- `factory-b`: Mac mini + UTM 단일 노드 K3s, `stable-lab` dummy profile
  - temperature baseline `24.5C`, humidity baseline `45%`
  - 낮은 anomaly/network loss 확률로 정상 테스트베드 기준을 표현
- `factory-c`: Windows + VirtualBox 단일 노드 K3s, `noisy-vm` dummy profile
  - temperature baseline `27.0C`, humidity baseline `52%`
  - `factory-b`보다 높은 anomaly/network loss 확률로 불안정 테스트베드 기준을 표현
- 전역 risk weight 합계: `100`

### Acceptance Criteria

- `configs/runtime/runtime-config.yaml` 파일이 존재하고 유효한 YAML 형식
- `global` / `factories` 섹션 구조 확인
- Risk Score 가중치 합산이 100 이하임을 문서에 명시

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: `configs/runtime/runtime-config.yaml`을 추가해 전역 Risk field, 공장별 override, VM dummy data profile 초안을 정의했다.
- 변경/확인: `factory-a`는 real input production-edge, `factory-b`는 Mac UTM `stable-lab`, `factory-c`는 Windows VirtualBox `noisy-vm` 기준으로 추천값을 작성했다.
- 검증: Ansible `from_yaml`로 YAML 파싱을 확인했고, 전역 risk weight 합계가 `100`임을 확인했다.
- 후속: M2에서 Tailscale Tailnet/Auth Key 실발급과 Spoke K3s API 연결을 진행한다.

## 2026-05-14 수정 방향

이 문서의 `risk/risk-normalizer`와 `risk` namespace 기록은 M1 당시 IRSA와 S3 권한을 검증한 과거 이력이다.

최신 데이터 처리 기준은 별도 `risk-normalizer`, `risk-score-engine`, `pipeline-status-aggregator` 파드가 아니라 Lambda data processor와 DynamoDB/S3 processed다.

```text
IoT Core
  -> IoT Rule -> S3 raw
  -> Lambda data processor
      -> DynamoDB LATEST
      -> DynamoDB HISTORY
      -> S3 processed
```

따라서 M1 문서의 Risk 관련 Kubernetes 리소스는 현재 구현 대상이 아니라 과거 검증 결과로만 해석한다.
