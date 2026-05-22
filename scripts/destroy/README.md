# Destroy Scripts

상태: source of truth
기준일: 2026-05-22

## 목적

이 디렉터리는 Aegis-Pi 리소스 삭제 진입점을 순서대로 관리한다.

새 리소스를 추가하거나 기존 리소스 삭제 방식이 바뀌면 이 디렉터리의 스크립트와 문서를 함께 업데이트한다.

## 삭제 순서

```text
0. K3s factory-a IoT Secret 사전 삭제
   - DESTROY_IOT=true일 때 AWS MFA 전에 SSH로 K3s Secret 삭제
   - 이후 IoT destroy 단계에서는 같은 Secret 삭제를 건너뜀

1. iot factory-a
   - IoT certificate detach/delete
   - IoT Policy 삭제
   - IoT Thing 삭제

2. hub
   - Admin UI Ingress가 켜져 있었다면 Route53 CNAME, Ingress, ALB/TargetGroup/SecurityGroup 선삭제
   - Tailscale Kubernetes 리소스는 별도 cleanup하지 않음
   - infra/hub Terraform destroy
   - EKS, VPC, node group, NAT Gateway 삭제
   - AMP remote write, Grafana AMP query, AWS Load Balancer Controller용 IRSA IAM role/policy 삭제
   - Route53 Hosted Zone과 ACM certificate 삭제
   - infra/hub가 AMP/IRSA 배선을 위해 foundation output을 읽으므로 foundation tfstate 필요

3. foundation
   - infra/foundation Terraform destroy
   - S3 data bucket, IoT Rule, AMP Workspace 같은 영속 리소스

4. data-dashboard
   - infra/data-dashboard Terraform destroy
   - 워크스트림 B 1번 Data/Dashboard VPC만 삭제
   - Hub/Foundation/EKS/Admin UI는 건드리지 않음
   - Terraform backend S3 bucket과 RDS final snapshot은 잔존
```

## 파일

| 파일 | 내용 |
| --- | --- |
| `destroy-all.sh` | K3s IoT Secret 사전 삭제 후 IoT, hub, foundation 순서 전체 삭제 |
| `destroy-iot-factory-a.sh` | 직접 실행 시 `factory-a` K3s Secret과 IoT 리소스 삭제. `destroy-all.sh`에서 호출될 때는 Secret 삭제를 건너뜀 |
| `destroy-k3s-iot-secret.sh` | K3s Secret만 삭제 |
| `destroy-hub.sh` | Hub EKS/VPC와 hub-bound IAM 리소스 삭제 |
| `destroy-foundation.sh` | Foundation 영속 리소스 삭제. `DESTROY_FOUNDATION=true` 필요 |
| `destroy-data-dashboard.sh` | `infra/data-dashboard` Terraform destroy. 1번 Data/Dashboard VPC 전용 |

## 기본 전체 삭제

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/destroy/destroy-all.sh
```

MFA OTP를 인자로 넘길 수도 있다.

```bash
scripts/destroy/destroy-all.sh <MFA_OTP>
```

기본 동작:

```text
DESTROY_IOT=true
DESTROY_HUB=true
DESTROY_FOUNDATION=true
```

즉, 기본 `destroy-all.sh`는 `build-all.sh`의 전체 생성 범위에 대응해 K3s IoT Secret, IoT factory-a, Hub EKS/VPC/NAT Gateway/node group, Admin UI Route53/ACM/ALB 관련 리소스, foundation S3/IoT Rule/AMP Workspace를 순서대로 삭제한다. EKS 내부 Tailscale Operator와 proxy 리소스는 EKS 삭제와 함께 사라지므로 별도 cleanup하지 않는다.

`DESTROY_IOT=true`일 때는 AWS MFA 입력 전에 먼저 `scripts/destroy/destroy-k3s-iot-secret.sh`를 실행한다. 이 단계에서 OpenSSH가 `minsoo@10.10.10.10` 비밀번호를 물을 수 있다. Secret 삭제가 끝나면 `SKIP_K3S_IOT_SECRET_DESTROY=true`를 설정해 뒤의 `destroy-iot-factory-a.sh`가 같은 SSH 작업을 반복하지 않게 한다.

## Foundation 보존 삭제

S3 data bucket, IoT Rule, AMP Workspace 같은 foundation 영속 리소스를 보존하고 Hub 비용만 줄이려면 foundation 삭제를 명시적으로 끈다.

```bash
DESTROY_FOUNDATION=false scripts/destroy/destroy-all.sh
```

비용 절감만 목적이면 아래처럼 Hub만 삭제하는 편이 더 명확하다.

```bash
scripts/destroy/destroy-hub.sh
```

전체 삭제 순서는 항상 IoT factory-a, hub, foundation 순서이며, foundation은 마지막에 삭제한다.

Foundation만 삭제:

```bash
DESTROY_FOUNDATION=true scripts/destroy/destroy-foundation.sh
```

## 일부만 삭제

IoT만:

```bash
scripts/destroy/destroy-iot-factory-a.sh
```

K3s Secret만:

```bash
scripts/destroy/destroy-k3s-iot-secret.sh
```

Hub만:

```bash
scripts/destroy/destroy-hub.sh
```

Data/Dashboard VPC만:

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud
```

MFA 세션이 없으면 OTP를 전달한다.

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

RDS final snapshot 이름은 Terraform random suffix를 포함하므로 반복 destroy 시 snapshot 이름이 충돌하지 않는다. 오래된 snapshot은 복구 필요 여부 확인 후 수동 삭제한다.

Hub destroy는 `infra/hub`가 foundation output을 읽는 구조라 `infra/foundation/terraform.tfstate`가 있어야 한다. foundation state가 이미 사라졌다면 먼저 state를 복구하거나, Hub 리소스가 이미 삭제된 상태에서 `destroy-all.sh`를 실행할 때는 `DESTROY_HUB=false`로 제외한다.

## 주의

- `destroy-all.sh`는 Hub EKS와 NAT Gateway를 삭제한다.
- `destroy-hub.sh`는 Terraform destroy 전에 Admin UI Ingress cleanup playbook을 먼저 실행한다. Ingress가 비활성화된 상태면 cleanup은 no-op에 가깝게 지나간다.
- `destroy-hub.sh`는 Tailscale OAuth client, Tailscale Admin Console device, `factory-a-master` Tailscale 상태를 삭제하거나 revoke하지 않는다.
- `factory-a-master` Tailscale은 라즈베리파이 OS 레벨 상태이므로 비용이 없고 유지한다. 라즈베리파이 재부팅 후에는 `scripts/ansible/playbooks/start_test.yml`로 `tailscaled`와 Tailnet IP를 확인한다.
- EKS를 다시 만들면 `scripts/build/build-hub.sh`가 `~/Aegis/.aegis/secrets/tailscale/operator.env`를 사용해 Tailscale Operator, egress Service, UI Service, ArgoCD cluster Secret을 다시 생성/검증한다.
- `destroy-foundation.sh`는 S3/AMP/IoT Rule 같은 영속 리소스를 삭제하는 자리다.
- `scripts/destroy/destroy-all.sh`가 `scripts/build/build-all.sh`에 대응하는 전체 삭제 실행이다.
- Foundation만 직접 삭제할 때는 안전장치로 `DESTROY_FOUNDATION=true scripts/destroy/destroy-foundation.sh`가 필요하다.
- Foundation을 보존하는 부분 삭제가 필요하면 `DESTROY_FOUNDATION=false scripts/destroy/destroy-all.sh` 또는 `scripts/destroy/destroy-hub.sh`를 사용한다.
- CLI로 만든 IoT 리소스는 Terraform state에 없으므로 `scripts/iot/cleanup-thing.sh` 또는 이 디렉터리의 destroy 스크립트로 정리한다.
- K3s Secret은 Terraform state에 없으므로 SSH 기반 `kubectl delete secret`로 정리한다.
- SSH 비밀번호는 스크립트가 저장하지 않는다. 반복 입력을 피하려면 운영 PC와 `factory-a-master` 사이에 SSH key 인증을 구성한다.
