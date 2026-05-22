# Build Scripts

상태: source of truth
기준일: 2026-05-22

## 목적

이 디렉터리는 Aegis-Pi 리소스 생성 진입점을 순서대로 관리한다.

새 리소스를 추가하거나 기존 리소스 생성 방식이 바뀌면 이 디렉터리의 스크립트와 문서를 함께 업데이트한다.

## 생성 순서

```text
1. foundation
   - infra/foundation Terraform apply
   - S3 data bucket, AMP Workspace, IoT Rule 같은 영속 리소스

2. hub
   - infra/hub Terraform apply
   - EKS, VPC, node group
   - Ansible Hub bootstrap
   - ArgoCD install/verify
   - Prometheus Agent install/verify and AMP remote_write
   - internal Grafana install/verify and AMP datasource query
   - local secret/hub-ui-credentials.txt 출력
   - AWS Load Balancer Controller install/verify
   - Admin UI Route53 name server file generation
   - Admin UI HTTPS Ingress prepare/verify, disabled by default until ACM is issued
   - Tailscale Operator, factory-a egress, ArgoCD/Grafana Tailscale UI, factory-a cluster Secret bootstrap/verify

3. iot factory-a
   - IoT Thing / Policy / certificate 등록
   - local secret/iot/factory-a 출력
   - K3s Secret 등록

4. data-dashboard
   - infra/data-dashboard Terraform apply
   - 워크스트림 B 1번 Data/Dashboard VPC만 생성
   - Hub/Foundation/EKS/Admin UI는 건드리지 않음
```

## 파일

| 파일 | 내용 |
| --- | --- |
| `build-all.sh` | 전체 생성 순서 실행 |
| `build-admin-ui-after-ns.sh` | Gabia NS 위임 후 ACM 발급을 기다리고 Admin UI HTTPS Ingress 활성화 |
| `build-foundation.sh` | `infra/foundation` Terraform apply |
| `build-hub.sh` | `infra/hub` Terraform apply 후 Ansible bootstrap. 기본적으로 Tailscale Hub 복구까지 실행 |
| `build-iot-factory-a.sh` | `factory-a` IoT Thing/certificate 생성 및 K3s Secret 등록 |
| `build-data-dashboard.sh` | `infra/data-dashboard` Terraform apply. 1번 Data/Dashboard VPC 전용 |

Hub build는 ArgoCD/Grafana 설치 검증 후 `secret/hub-ui-credentials.txt`를 갱신한다. 이 파일은 `.gitignore`의 `secret/` 규칙으로 Git에 들어가지 않으며, 파일 권한은 `0600`으로 설정된다.

## 전체 생성

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/build/build-all.sh
```

MFA OTP를 인자로 넘길 수도 있다.

```bash
scripts/build/build-all.sh <MFA_OTP>
```

Admin UI Route53/ACM 출력까지 함께 준비한다는 의도를 명시하려면 `--admin-ui`를 붙인다. 이 옵션은 Admin UI HTTPS Ingress/ALB를 켜지 않는다. Gabia NS 위임과 ACM 발급 이후 `build-admin-ui-after-ns.sh`를 별도로 실행한다.

```bash
scripts/build/build-all.sh --admin-ui
```

MFA OTP를 함께 넘길 수도 있다.

```bash
scripts/build/build-all.sh --admin-ui <MFA_OTP>
```

이미 NS 위임과 ACM 발급이 끝난 상태에서 Hub build 중 Admin UI HTTPS Ingress까지 강제로 켜야 한다면 `--admin-ui-ingress`를 사용한다.

```bash
scripts/build/build-all.sh --admin-ui-ingress
```

## 일부만 생성

Foundation만:

```bash
scripts/build/build-foundation.sh
```

Hub만:

```bash
scripts/build/build-hub.sh
```

Hub ArgoCD Helm release가 이미 `deployed` 상태이고 chart version이 같으면 `build-hub.sh`와 `build-all.sh`는 Helm upgrade를 건너뛴다. values 변경이나 강제 재적용이 필요하면 아래처럼 실행한다.

```bash
FORCE_ARGOCD_UPGRADE=true scripts/build/build-all.sh
```

AWS Load Balancer Controller도 이미 `deployed` 상태이고 chart version이 같으면 Helm upgrade를 건너뛴다. 강제 재적용이 필요하면 아래처럼 실행한다.

```bash
FORCE_AWS_LB_CONTROLLER_UPGRADE=true scripts/build/build-hub.sh
```

Hub Tailscale bootstrap도 `BUILD_HUB=true`일 때 기본 실행된다. 이 단계는 아래 리소스가 이미 있으면 생성하지 않고 상태만 검증한다.

```text
tailscale/tailscale-operator Helm release
argocd/factory-a-master-tailnet egress Service
argocd/argocd-server-tailscale UI Service
observability/grafana-tailscale UI Service
argocd/cluster-factory-a cluster Secret
```

필수 secret 파일:

```text
~/Aegis/.aegis/secrets/tailscale/operator.env
```

해당 파일에 `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`이 없으면 Hub build는 실패한다. Tailscale만 임시로 건너뛰려면 아래처럼 실행한다.

```bash
BUILD_TAILSCALE=false scripts/build/build-hub.sh
```

Tailscale Operator Helm release 강제 재적용이 필요하면 아래처럼 실행한다.

```bash
FORCE_TAILSCALE_OPERATOR_UPGRADE=true scripts/build/build-hub.sh
```

## Admin UI NS 위임 포함 재생성 순서

Admin UI HTTPS Ingress는 기본값에서 비활성화된다. `minsoo-tech.cloud`를 Gabia에서 Route53 Hosted Zone NS로 위임하고 ACM certificate가 `ISSUED`가 된 뒤에만 Admin UI Ingress를 활성화한다.

Hub build는 Terraform apply 직후 `secret/admin-ui-nameservers.txt`를 갱신한다. Gabia에 입력할 NS는 문서에 적힌 값보다 이 파일을 우선한다.

### 1. 전체 리소스 1차 생성

이 단계에서 foundation, Hub EKS, ArgoCD, Prometheus Agent, Grafana, AWS Load Balancer Controller, IoT `factory-a` 리소스를 생성하고, Admin UI용 Route53 Hosted Zone NS를 출력한다. `--admin-ui`를 붙여도 Ingress/ALB는 켜지지 않으며, Admin UI Route53/ACM 준비 의도만 명시한다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/build/build-all.sh
```

MFA OTP를 함께 넘기려면:

```bash
scripts/build/build-all.sh <MFA_OTP>
```

실행 중 아래 형식으로 Gabia에 입력할 NS가 출력된다.

```text
Set these name servers in Gabia for minsoo-tech.cloud:

ns-...
ns-...
ns-...
ns-...
```

같은 내용은 아래 파일에도 저장된다.

```text
secret/admin-ui-nameservers.txt
```

### 2. Gabia NS 입력

Gabia 관리 콘솔에서 `minsoo-tech.cloud`의 네임서버를 1단계에서 출력된 NS 4개로 변경한다.

Hosted Zone을 destroy/recreate하면 NS 값이 바뀔 수 있다. 재생성할 때마다 기존 문서나 기억한 값을 쓰지 말고, 반드시 방금 출력된 값 또는 `secret/admin-ui-nameservers.txt`를 다시 확인한다.

### 3. Admin UI HTTPS Ingress 활성화

Gabia에 NS를 저장한 뒤 아래 스크립트를 실행한다. 이 스크립트는 ACM certificate가 `ISSUED`가 될 때까지 기다린 다음 Admin UI Ingress bootstrap/verify만 실행한다.

```bash
scripts/build/build-admin-ui-after-ns.sh
```

MFA OTP를 함께 넘기려면:

```bash
scripts/build/build-admin-ui-after-ns.sh <MFA_OTP>
```

성공하면 아래 HTTPS endpoint가 출력된다.

```text
https://argocd.minsoo-tech.cloud
https://grafana.minsoo-tech.cloud
```

이미 NS 위임과 ACM 발급이 끝난 상태에서 Hub 전체를 다시 적용해야 한다면 아래처럼 직접 Admin UI Ingress를 활성화할 수도 있다.

```bash
ADMIN_UI_INGRESS_ENABLED=true scripts/build/build-hub.sh
```

IoT `factory-a`만:

```bash
scripts/build/build-iot-factory-a.sh
```

Data/Dashboard VPC만:

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud
```

MFA 세션이 없으면 OTP를 전달한다.

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

이 스크립트는 삭제 예약 중인 `kjw-aegis-data-*` Secrets Manager secret을 강제 삭제해 재생성 이름 충돌을 막는다.

전체 생성에서 특정 단계를 건너뛰려면 환경 변수를 사용한다.

```bash
BUILD_HUB=false scripts/build/build-all.sh
```

```bash
BUILD_FOUNDATION=false BUILD_HUB=false scripts/build/build-all.sh
```

## 주의

- `build-all.sh`는 Hub EKS와 NAT Gateway를 생성할 수 있어 비용이 발생한다.
- Admin UI Ingress를 활성화하면 Public ALB와 ALB LCU, public IPv4 비용이 추가된다.
- Tailscale Operator 자체는 EKS 내부 Kubernetes 리소스다. EKS를 destroy하면 사라지므로 다음 `build-hub.sh` 실행 때 secret 파일을 기준으로 다시 등록한다.
- 전체 생성 범위에 대응하는 전체 삭제는 `scripts/destroy/destroy-all.sh`로 실행한다.
- ArgoCD UI port-forward는 장기 실행 프로세스이므로 전체 build에는 포함하지 않는다.
- UI 접속은 별도로 `scripts/ops/argocd-port-forward.sh`를 실행한다.
- 인증서/private key 출력은 `secret/`에만 저장되고 Git에는 들어가지 않는다.
