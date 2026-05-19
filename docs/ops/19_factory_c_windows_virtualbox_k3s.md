# Factory C Windows VirtualBox K3s Runbook

상태: candidate
기준일: 2026-05-19

## 수정 이력

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-05-19 | v3 | factory-a 데이터 형상 참고 절차, IoT Rule factory-c 확장 (ADR 0018) 흡수, 가데이터 자동 발행 루프 (systemd `aegis-dummy-publisher`) 추가, Step 11~16 재번호, S3 적재 검증 기준을 "채워짐" 으로 갱신, Edge Agent 전환 시 dummy publisher 중단 절차 명시 |
| 2026-05-19 | v2 | PC 분리 (Computer 1 작업 PC / Computer 3 상시 운영 PC), 각 단계 실행 위치 명시, MFA OTP 인자 / kubectl PATH / ArgoCD context rename / Windows 무인 운영 자동 시작 / S3 적재 빈 결과 정상 처리 보강 |
| 2026-05-19 | v1 | 초안 |

## 목적

Windows 호스트에서 VirtualBox 기반 Linux VM을 만들고 `factory-c` 테스트베드형 Spoke K3s를 **상시 무인 운영** 가능한 상태로 구성한다.

이 문서는 운영자가 다른 문서를 함께 열지 않고도 처음부터 끝까지 따라갈 수 있도록 작성되었다. 목표는 `factory-c` VM이 IoT Core 로 `aegis/factory-c/*` topic 데이터를 송신하고, Hub/ArgoCD가 Tailscale을 통해 `factory-c` K3s API를 인식하는 기준선을 만드는 것이다.

## PC 구성

이 작업은 **두 대의 PC**를 사용한다.

| 식별 | 역할 | 설명 |
| --- | --- | --- |
| **Computer 1** | 작업 PC (지금 사용 중) | WSL + 이 repository checkout. Terraform · AWS CLI · argocd · kubeconfig 보관. 사람이 매일 켜고 끄는 PC |
| **Computer 3** | 상시 운영 PC (신규, 백지 Windows) | VirtualBox만 호스팅. 안에 `factory-c` Ubuntu VM 1대. 절대 끄지 않는다 |

Computer 3 안의 VM은 별도 환경이므로 세 번째 환경으로 다룬다.

| 식별 | 역할 |
| --- | --- |
| **Computer 3 Windows 호스트** | VirtualBox 호스트, Windows 자체 설정 |
| **Computer 3 VM** | factory-c Ubuntu Server, K3s, Tailscale, IoT 클라이언트 |

각 Step 상단에 `실행 위치:` 라벨로 어디서 명령을 입력하는지 명시한다.

## 각 PC 준비물

### Computer 1 (작업 PC, WSL)

| 항목 | 비고 |
| --- | --- |
| WSL + 이 repo (`/home/jongwon/personal_project/Aegis-pi`) | 이미 존재 |
| AWS CLI v2 + 활성 MFA 세션 또는 OTP 입력 가능 환경 | `aws sts get-caller-identity` 로 확인 |
| `jq`, `curl`, `ssh`, `scp` | 표준 도구 |
| `kubectl` | factory-c kubeconfig 확인용 |
| `argocd` CLI | Step 13 cluster 등록용 |
| Tailscale (WSL 또는 Windows 호스트) | Computer 3 VM SSH 접근 안정성 확보. 권장 |

### Computer 3 Windows 호스트 (백지 상태에서 시작)

| 항목 | 비고 |
| --- | --- |
| BIOS/UEFI에서 Virtualization (VT-x/AMD-V) 활성 | 펌웨어 설정 |
| VirtualBox 7.x 설치 | Oracle 공식 사이트 |
| Ubuntu Server LTS ISO | 24.04 LTS 권장 |
| Windows 절전/슬립 영구 OFF | Step 15에서 설정 |
| Windows 자동 로그인 | Step 15에서 설정 |
| VirtualBox VM 자동 시작 (Task Scheduler) | Step 15에서 설정 |
| (권장) Tailscale Windows 클라이언트 | 호스트 자체 원격 관리용 |

### Computer 3 VM (Ubuntu Server 안)

| 항목 | 비고 |
| --- | --- |
| Ubuntu Server LTS | Step 2에서 설치 |
| `curl`, `jq`, `openssh-server`, `mosquitto-clients` | Step 3 |
| Tailscale | Step 4 |
| K3s | Step 5 |
| AWS IoT 인증서 파일 (Computer 1에서 scp) | Step 8 |

### 민감 정보 보관 규칙

- Tailscale Auth Key · AWS credential · IoT private key · kubeconfig token 은 **Git에 절대 커밋하지 않는다**
- IoT 인증서 산출물은 Computer 1 의 `secret/iot/factory-c/` 디렉터리에만 둔다 (이 디렉터리는 Git 추적 제외)
- Computer 3 VM 내부 인증서 사본은 VM 사용자 홈 안 `~/.aegis/iot/factory-c/` (chmod 700) 에만 둔다
- `factory-c.kubeconfig` 도 Computer 1 의 `~/.aegis/secrets/kubeconfig/` 에만 둔다

## Factory C 확정 구성

| 항목 | 값 |
| --- | --- |
| Factory ID | `factory-c` |
| 표시명 | `Factory C` |
| Host | Windows (Computer 3) |
| VM tool | VirtualBox |
| Guest OS | Ubuntu Server LTS 24.04 |
| Kubernetes | K3s single-node |
| Node name | `factory-c` |
| Spoke type | `testbed` |
| Environment type | `vm-windows` |
| Input module type | `dummy` |
| Dummy profile | `noisy-vm` |
| IoT Thing | `AEGIS-IoTThing-factory-c` |
| MQTT topic prefix | `aegis/factory-c` |
| S3 raw prefix 목표 | `raw/factory-c/{source_type}/yyyy=...` |
| K8s namespace | `ai-apps` |
| K8s Secret | `aws-iot-factory-c-cert` |
| Tailscale tags | `tag:aegis-spoke-testbed`, `tag:factory-c` |
| ArgoCD cluster context | `factory-c` (Step 12 에서 rename) |

제외 범위: Longhorn, NFS/cold storage, 실센서·카메라·마이크, Raspberry Pi 수준의 failover, production 자동 롤백.

`factory-c` 는 실제 공장 대체가 아니라 멀티 공장 식별 · 배포 · 데이터 분리 · Dashboard 표시를 검증하는 testbed 다.

## 전체 흐름

```text
Computer 1 (WSL)                       Computer 3 (Windows + VM)
─────────────────                      ─────────────────────────
register-thing.sh  ──── AWS IoT Thing
   └─ secret/iot/factory-c/  ─── scp ─→ VM: ~/.aegis/iot/factory-c/
                                          └─ mosquitto_pub (smoke)
register-k3s-secret.sh ─── ssh ──────→ VM: kubectl Secret 생성

aws iot create-topic-rule (factory-c)
   └─ AEGIS_IoTRule_factory_c_raw_s3
   └─ → S3 raw/factory-c/ (ADR 0018)

                                       VM: K3s single-node
                                       VM: Tailscale tag:factory-c
                                       VM: label 4종
                                       VM: systemd aegis-dummy-publisher
                                            (noisy-vm profile, 3s/20s)

kubeconfig 수신 ←─── scp ─────────────── VM: ~/.kube/config 사본
   └─ server를 Tailscale IP로 rewrite
   └─ context rename default → factory-c
   └─ argocd cluster add factory-c

aws s3 ls raw/factory-c/                AWS S3 (IoT Rule 통해)
   └─ factory_state, infra_state 누적 확인

                                       Windows 호스트:
                                       절전 OFF · 자동 로그인 · Task Scheduler 로 VM 자동 시작
```

데이터 경로:

```text
factory-c VM (mosquitto_pub 또는 edge-agent dummy mode)
  -> AWS IoT Core
  -> IoT Topic Rule
  -> S3 raw bucket: aegis-bucket-data
  -> (Lambda data processor, DynamoDB, Dashboard — 워크스트림 B 후속)
```

제어 경로:

```text
Hub EKS / ArgoCD  -> Tailscale  -> factory-c K3s API
```

Tailscale 은 제어/운영망이고, Dashboard Web/API 는 Tailscale 을 직접 사용하지 않는다.

## 데이터 포맷 요약

자세한 스펙은 `docs/specs/iot_data_format.md` 가 source of truth 다. Step 9에서 사용하는 핵심만 요약한다.

- topic: `aegis/factory-c/factory_state`, `aegis/factory-c/infra_state`
- 공통 필드: `schema_version`, `message_id`, `factory_id`, `node_id`, `environment_type`, `input_module_type`, `source_type`, `source_timestamp`, `published_at`, `agent_instance_id`, `payload`
- `factory_state.payload`: `aggregation_window_seconds`, `sensor`, `ai_result`
- `infra_state.payload`: `heartbeat`, `cluster`, `nodes`, `workloads`, `devices`

## Step 1. VirtualBox 네트워크 결정

실행 위치: **Computer 3 Windows 호스트**

권장은 **NAT + Tailscale**. 이유: Computer 1 ↔ Computer 3 VM 사이 SSH 경로를 Tailscale IP 하나로 안정화할 수 있고, LAN/회사망 정책 변경에 영향받지 않는다.

| 방식 | 사용 시점 | 장점 | 주의 |
| --- | --- | --- | --- |
| **NAT + Tailscale (권장)** | 무인 상시 운영 | Tailscale IP 안정, 네트워크 변경에 강함 | Tailscale 참여 전까지 SSH 불편 |
| Bridged Adapter | 같은 LAN 안에서만 운영 | 즉시 SSH 가능 | Wi-Fi/회사망 정책에 막힐 수 있음 |
| NAT + Port Forwarding | 위 두 가지 불가 | Windows localhost로 SSH | 자동 스크립트 `register-k3s-secret.sh` 사용 불가 (Step 8 수동 경로만) |
| Host-only | 사용하지 않음 | — | 인터넷 차단되어 K3s/Tailscale 설치 불가 |

이 문서의 이후 단계는 **NAT + Tailscale** 기준으로 작성한다.

## Step 2. VirtualBox VM 생성

실행 위치: **Computer 3 Windows 호스트**

VirtualBox 에서 새 VM 을 만든다.

| 항목 | 값 |
| --- | --- |
| Name | `factory-c` |
| Type | Linux |
| Version | Ubuntu (64-bit) |
| CPU | 2 vCPU |
| Memory | 4096 MiB |
| Disk | 40 GiB (동적 할당) |
| Network | NAT (Step 1 결정 따름) |

Ubuntu Server 설치 중 적용 기준:

```text
hostname: factory-c
ssh: enabled
user: 운영자가 정한 일반 사용자 (예: aegis)
```

비밀번호와 SSH private key 는 문서에 기록하지 않는다.

## Step 3. Guest OS 기본 설정

실행 위치: **Computer 3 VM** (VirtualBox 콘솔에서 로그인)

```bash
hostnamectl
ip addr
systemctl status ssh
```

hostname 이 다르면 고정:

```bash
sudo hostnamectl set-hostname factory-c
```

패키지 갱신 + 기본 도구 설치:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl ca-certificates jq openssh-server mosquitto-clients
```

swap 끄기:

```bash
sudo swapoff -a
sudo sed -i.bak '/ swap / s/^/#/' /etc/fstab
```

시간 동기화:

```bash
timedatectl
```

정상 기준:

```text
Static hostname: factory-c
SSH service: active
System clock synchronized: yes
```

## Step 4. Tailscale 참여

실행 위치: **Computer 3 VM**

Tailscale Admin Console (https://login.tailscale.com/admin) 에서 `factory-c` 용 Auth Key 를 발급한다.

```text
Tags:        tag:aegis-spoke-testbed, tag:factory-c
Reusable:    No (One-off)
Pre-approved: Yes
Expiration:  90 days (기본)
```

발급된 Auth Key 는 다른 곳에 저장하지 말고 다음 단계 입력에 바로 사용한다.

Tailscale 설치:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

Auth Key 를 환경변수로만 받는다 (history 에 남지 않게 silent input):

```bash
read -r -s TAILSCALE_AUTH_KEY
export TAILSCALE_AUTH_KEY
```

> 명령 입력 후 화면에 아무것도 안 보이는 게 정상. Auth Key 를 붙여넣고 Enter.

Tailnet 참여:

```bash
sudo tailscale up \
  --authkey="${TAILSCALE_AUTH_KEY}" \
  --hostname=factory-c
```

확인:

```bash
tailscale status --self
tailscale ip -4
```

정상 기준:

```text
hostname:    factory-c
tags:        tag:aegis-spoke-testbed, tag:factory-c
tailscale IP: 100.x.y.z (이 값을 메모해 둔다 — Step 5, 8, 12에서 사용)
```

Auth Key 흔적 제거:

```bash
unset TAILSCALE_AUTH_KEY
history -c
```

## Step 5. K3s single-node 설치

실행 위치: **Computer 3 VM**

Tailscale IP 를 변수로 잡는다:

```bash
TS_IP="$(tailscale ip -4)"
echo "TS_IP=${TS_IP}"
```

`TS_IP` 가 비어 있지 않은지 확인 후 K3s 설치. `--tls-san ${TS_IP}` 가 빠지면 Step 12 외부 kubeconfig 가 TLS 오류로 동작하지 않으니 반드시 포함한다.

```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --node-name factory-c --tls-san ${TS_IP}" sh -
```

상태 확인:

```bash
sudo systemctl status k3s --no-pager
sudo kubectl get nodes -o wide
sudo kubectl get pods -A
```

일반 사용자가 `kubectl` 을 쓸 수 있게 kubeconfig 복사:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config
kubectl get nodes -o wide
```

K3s 버전 기록:

```bash
kubectl get node factory-c -o jsonpath='{.status.nodeInfo.kubeletVersion}{"\n"}'
```

정상 기준:

```text
factory-c node: Ready
node name: factory-c
K3s service: active (running)
```

## Step 6. Factory C label 적용

실행 위치: **Computer 3 VM**

```bash
kubectl label node factory-c aegis.factory-id=factory-c --overwrite
kubectl label node factory-c aegis.environment-type=vm-windows --overwrite
kubectl label node factory-c aegis.input-module-type=dummy --overwrite
kubectl label node factory-c aegis.spoke-type=testbed --overwrite
kubectl get node factory-c --show-labels
```

정상 기준:

```text
aegis.factory-id=factory-c
aegis.environment-type=vm-windows
aegis.input-module-type=dummy
aegis.spoke-type=testbed
```

## Step 7. IoT Thing 생성

실행 위치: **Computer 1 (WSL)**. Computer 3 에서 절대 실행하지 않는다.

`register-thing.sh` 는 첫 번째 인자로 **MFA OTP (6자리)** 를 받는다. 활성 MFA 세션이 이미 있어도 OTP 인자를 함께 주는 게 안전하다.

```bash
cd /home/jongwon/personal_project/Aegis-pi
FACTORY_ID=factory-c scripts/iot/register-thing.sh <6자리 OTP 코드>
```

> Authenticator 앱에서 새로 갱신된 코드를 사용해야 한다. 만료가 임박한 코드는 실패할 수 있으니, 새 코드가 막 갱신된 직후 입력한다.

스크립트가 만드는 결과:

```text
IoT Thing:   AEGIS-IoTThing-factory-c
IoT Policy:  AEGIS-IoTPolicy-factory-c
Topic root:  aegis/factory-c
Cert dir:    secret/iot/factory-c/
  - certificate.pem.crt
  - private.pem.key
  - AmazonRootCA1.pem
  - endpoint.txt
  - certificate-arn.txt
  - certificate-id.txt
  - registration-summary.txt
```

성공 메시지 마지막 4줄 확인:

```text
Registered IoT Thing and certificate.
Secret material directory: .../secret/iot/factory-c
Thing: AEGIS-IoTThing-factory-c
Policy: AEGIS-IoTPolicy-factory-c
```

`secret/iot/factory-c/` 는 Git 추적 대상이 아니다. 절대 커밋하지 말 것.

## Step 8. IoT 인증서를 K3s Secret 으로 주입

실행 위치: **Computer 1 (WSL) → Computer 3 VM** (스크립트가 SSH 로 원격 실행)

### 사전 조건: SSH 키 인증 설정 (1회만)

`register-k3s-secret.sh` 는 SSH 로 VM에 들어가 `kubectl` 을 실행한다. 매번 비밀번호를 묻지 않도록 SSH 키를 미리 등록한다.

```bash
# Computer 1 (WSL) 에서
TS_IP_C=<Step 4에서 메모한 factory-c Tailscale IP>
ssh-copy-id <vm-ssh-user>@${TS_IP_C}
ssh <vm-ssh-user>@${TS_IP_C} 'whoami && which kubectl'
```

`which kubectl` 가 빈 결과면 비-interactive SSH PATH 에 `/usr/local/bin` 이 빠진 것이다. VM 의 `~/.bashrc` 또는 `~/.profile` 맨 위에 다음 줄을 추가:

```bash
export PATH="$PATH:/usr/local/bin"
```

### 자동 주입 (권장)

```bash
# Computer 1 (WSL)
cd /home/jongwon/personal_project/Aegis-pi

FACTORY_ID=factory-c \
REMOTE_USER=<vm-ssh-user> \
REMOTE_HOST=${TS_IP_C} \
scripts/iot/register-k3s-secret.sh
```

스크립트 출력 마지막 줄:

```text
Registered K3s Secret ai-apps/aws-iot-factory-c-cert
```

### 수동 주입 (NAT Port Forwarding 등 SSH 자동 경로가 불가능할 때)

Computer 1 에서:

```bash
scp secret/iot/factory-c/certificate.pem.crt \
    secret/iot/factory-c/private.pem.key \
    secret/iot/factory-c/AmazonRootCA1.pem \
    secret/iot/factory-c/endpoint.txt \
    <vm-ssh-user>@${TS_IP_C}:/tmp/
```

Computer 3 VM 에서:

```bash
kubectl get namespace ai-apps >/dev/null 2>&1 || kubectl create namespace ai-apps

kubectl -n ai-apps create secret generic aws-iot-factory-c-cert \
  --from-file=certificate.pem.crt=/tmp/certificate.pem.crt \
  --from-file=private.pem.key=/tmp/private.pem.key \
  --from-file=AmazonRootCA1.pem=/tmp/AmazonRootCA1.pem \
  --from-file=endpoint.txt=/tmp/endpoint.txt \
  --dry-run=client -o yaml | kubectl apply -f -

rm -f /tmp/certificate.pem.crt /tmp/private.pem.key /tmp/AmazonRootCA1.pem /tmp/endpoint.txt
```

### 검증 (Computer 3 VM)

```bash
kubectl -n ai-apps get secret aws-iot-factory-c-cert
```

정상 기준:

```text
NAME                       TYPE     DATA   AGE
aws-iot-factory-c-cert     Opaque   4      <n>s
```

## Step 9. VM 에서 MQTT smoke publish

실행 위치: **Computer 1 → Computer 3 VM** (인증서 사본 전달 후 VM 에서 publish)

이 단계는 Edge Agent dummy mode 배포 전, factory-c VM 이 IoT Core 로 publish 할 수 있는지 확인하는 smoke test 다.

### 인증서 사본 전달 (Computer 1)

```bash
ssh <vm-ssh-user>@${TS_IP_C} 'mkdir -p ~/.aegis/iot/factory-c && chmod 700 ~/.aegis ~/.aegis/iot ~/.aegis/iot/factory-c'

scp secret/iot/factory-c/certificate.pem.crt \
    secret/iot/factory-c/private.pem.key \
    secret/iot/factory-c/AmazonRootCA1.pem \
    secret/iot/factory-c/endpoint.txt \
    <vm-ssh-user>@${TS_IP_C}:~/.aegis/iot/factory-c/

ssh <vm-ssh-user>@${TS_IP_C} 'chmod 600 ~/.aegis/iot/factory-c/*'
```

### factory_state publish (Computer 3 VM)

```bash
IOT_DIR="$HOME/.aegis/iot/factory-c"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg ts "${TS}" \
  '{
    schema_version: "0.1.0",
    message_id: ("factory-c:factory_state:factory-c:" + $ts),
    factory_id: "factory-c",
    node_id: "factory-c",
    environment_type: "vm-windows",
    input_module_type: "dummy",
    source_type: "factory_state",
    source_timestamp: $ts,
    published_at: $ts,
    agent_instance_id: "manual-smoke-factory-c",
    payload: {
      aggregation_window_seconds: 3,
      sensor: {
        sample_count: 1,
        temperature_celsius_avg: 27.0,
        humidity_percent_avg: 52.0,
        pressure_hpa_avg: 1012.0
      },
      ai_result: {
        sample_count: 1,
        fire_score: 0.0,
        fall_score: 0.0,
        bend_score: 0.0,
        abnormal_sound: ""
      }
    }
  }' > /tmp/factory-c-factory_state.json

mosquitto_pub \
  -h "$(cat "${IOT_DIR}/endpoint.txt")" \
  -p 8883 \
  --cafile "${IOT_DIR}/AmazonRootCA1.pem" \
  --cert "${IOT_DIR}/certificate.pem.crt" \
  --key "${IOT_DIR}/private.pem.key" \
  -i "AEGIS-IoTThing-factory-c" \
  -t "aegis/factory-c/factory_state" \
  -q 1 \
  -f /tmp/factory-c-factory_state.json

echo "exit=$?"
```

`exit=0` 이면 publish 성공. TLS/network 오류면 Step 7 인증서 또는 Step 4 Tailscale/방화벽을 다시 확인.

### infra_state publish (Computer 3 VM)

```bash
IOT_DIR="$HOME/.aegis/iot/factory-c"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
K3S_VERSION="$(kubectl get node factory-c -o jsonpath='{.status.nodeInfo.kubeletVersion}')"

jq -n \
  --arg ts "${TS}" \
  --arg k3s_version "${K3S_VERSION}" \
  '{
    schema_version: "0.1.0",
    message_id: ("factory-c:infra_state:cluster:" + $ts),
    factory_id: "factory-c",
    node_id: "cluster",
    environment_type: "vm-windows",
    input_module_type: "dummy",
    source_type: "infra_state",
    source_timestamp: $ts,
    published_at: $ts,
    agent_instance_id: "manual-smoke-factory-c",
    payload: {
      heartbeat: {
        agent_status: "alive",
        last_successful_publish_at: $ts,
        last_checkpoint_timestamp: $ts,
        publish_sequence: 1
      },
      cluster: {
        cluster_name: "factory-c",
        kubernetes_version: $k3s_version
      },
      nodes: [
        {
          node_id: "factory-c",
          role: "single-node",
          ready: true,
          cpu_usage_percent: 10.0,
          memory_usage_percent: 35.0,
          disk_usage_percent: 25.0,
          network_reachability: "ok"
        }
      ],
      workloads: [],
      devices: {
        bme280: { "available": false, "last_seen_at": null },
        camera: { "available": false, "last_seen_at": null },
        microphone: { "available": false, "last_seen_at": null }
      }
    }
  }' > /tmp/factory-c-infra_state.json

mosquitto_pub \
  -h "$(cat "${IOT_DIR}/endpoint.txt")" \
  -p 8883 \
  --cafile "${IOT_DIR}/AmazonRootCA1.pem" \
  --cert "${IOT_DIR}/certificate.pem.crt" \
  --key "${IOT_DIR}/private.pem.key" \
  -i "AEGIS-IoTThing-factory-c" \
  -t "aegis/factory-c/infra_state" \
  -q 1 \
  -f /tmp/factory-c-infra_state.json

echo "exit=$?"
```

두 publish 모두 `exit=0` 이면 Step 9 완료.

## Step 10. IoT Rule factory-c 확장 + S3 적재 검증

실행 위치: **Computer 1 (WSL)**

본 단계는 워크스트림 A↔B 합류 지점이라 `docs/changes/0018-iot-rule-extend-to-factory-c.md` 가 결정 근거다. ADR 0018 을 먼저 확인 후 진행한다.

### 10-1. (참고) factory-a S3 raw 객체 1건 다운로드 — 데이터 형상 reference

factory-c 가데이터의 envelope · payload 스키마는 factory-a 가 운영 중인 실제 메시지와 동일해야 한다 (`docs/specs/iot_data_format.md` source of truth). 실측 형상을 직접 확인하기 위해 최신 객체 1건을 받는다.

```bash
# Computer 1
aws s3 ls s3://aegis-bucket-data/raw/factory-a/factory_state/ --recursive | tail -3
aws s3 ls s3://aegis-bucket-data/raw/factory-a/infra_state/ --recursive | tail -3

LATEST_A_FS="$(aws s3 ls s3://aegis-bucket-data/raw/factory-a/factory_state/ --recursive | sort | tail -1 | awk '{print $4}')"
LATEST_A_IS="$(aws s3 ls s3://aegis-bucket-data/raw/factory-a/infra_state/ --recursive | sort | tail -1 | awk '{print $4}')"

aws s3 cp "s3://aegis-bucket-data/${LATEST_A_FS}" /tmp/factory-a-factory_state-sample.json
aws s3 cp "s3://aegis-bucket-data/${LATEST_A_IS}" /tmp/factory-a-infra_state-sample.json

jq '{schema_version, factory_id, node_id, environment_type, input_module_type, source_type, payload_keys: (.payload|keys)}' \
  /tmp/factory-a-factory_state-sample.json /tmp/factory-a-infra_state-sample.json
```

기대 결과:

```text
factory-a factory_state: payload_keys = ["aggregation_window_seconds", "ai_result", "sensor"]
factory-a infra_state:   payload_keys = ["cluster", "devices", "heartbeat", "nodes", "workloads"]
```

factory-c 의 더미 메시지도 동일한 키 셋을 그대로 채운다. 값만 `noisy-vm` 프로파일로 흩어진다. `environment_type` 만 `physical-rpi` → `vm-windows`, `input_module_type` 만 `sensor` → `dummy` 로 바뀐다.

### 10-2. IoT Topic Rule + IAM Role 추가 (AWS CLI 임시 적용)

본 절차는 ADR 0018 의 "단기 (testbed 검증)" 경로다. 영구 Terraform 반영은 follow-up.

```bash
# Computer 1
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGION="ap-south-1"
BUCKET="aegis-bucket-data"

# 1) IoT Rule 전용 IAM Role
cat > /tmp/iot-rule-assume.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "iot.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
JSON

aws iam create-role \
  --role-name AEGIS-IAMRole-IoTRule-S3-factory-c \
  --assume-role-policy-document file:///tmp/iot-rule-assume.json \
  >/dev/null

cat > /tmp/iot-rule-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject"],
    "Resource": ["arn:aws:s3:::${BUCKET}/raw/factory-c/*"]
  }]
}
JSON

aws iam put-role-policy \
  --role-name AEGIS-IAMRole-IoTRule-S3-factory-c \
  --policy-name AEGIS-IAMPolicy-IoTRule-S3-factory-c \
  --policy-document file:///tmp/iot-rule-policy.json

# IAM 전파 대기
sleep 15

ROLE_ARN="$(aws iam get-role --role-name AEGIS-IAMRole-IoTRule-S3-factory-c --query 'Role.Arn' --output text)"

# 2) IoT Topic Rule (factory-a Rule 과 1:1 대응)
cat > /tmp/iot-rule-factory-c.json <<'JSON'
{
  "sql": "SELECT *, topic(3) AS source_type, timestamp() AS received_at FROM 'aegis/factory-c/+'",
  "description": "Route factory-c IoT messages to the Aegis raw S3 prefix.",
  "awsIotSqlVersion": "2016-03-23",
  "ruleDisabled": false,
  "actions": [{
    "s3": {
      "bucketName": "BUCKET_PLACEHOLDER",
      "key": "raw/factory-c/${topic(3)}/yyyy=${parse_time(\"yyyy\", timestamp(), \"UTC\")}/mm=${parse_time(\"MM\", timestamp(), \"UTC\")}/dd=${parse_time(\"dd\", timestamp(), \"UTC\")}/${get_or_default(message_id, newuuid())}.json",
      "roleArn": "ROLE_ARN_PLACEHOLDER"
    }
  }]
}
JSON

sed -i "s|BUCKET_PLACEHOLDER|${BUCKET}|; s|ROLE_ARN_PLACEHOLDER|${ROLE_ARN}|" /tmp/iot-rule-factory-c.json

aws iot create-topic-rule \
  --rule-name AEGIS_IoTRule_factory_c_raw_s3 \
  --topic-rule-payload file:///tmp/iot-rule-factory-c.json

# 3) 확인
aws iot list-topic-rules --query "rules[?ruleName=='AEGIS_IoTRule_factory_c_raw_s3'].{name:ruleName,disabled:ruleDisabled}"
aws iot get-topic-rule --rule-name AEGIS_IoTRule_factory_c_raw_s3 --query 'rule.sql'

rm -f /tmp/iot-rule-assume.json /tmp/iot-rule-policy.json /tmp/iot-rule-factory-c.json
```

정상 기준:

```text
list-topic-rules: name=AEGIS_IoTRule_factory_c_raw_s3, disabled=false
get-topic-rule  : "SELECT *, topic(3) AS source_type, timestamp() AS received_at FROM 'aegis/factory-c/+'"
```

> **롤백 (필요 시)**
> ```bash
> aws iot delete-topic-rule --rule-name AEGIS_IoTRule_factory_c_raw_s3
> aws iam delete-role-policy --role-name AEGIS-IAMRole-IoTRule-S3-factory-c --policy-name AEGIS-IAMPolicy-IoTRule-S3-factory-c
> aws iam delete-role --role-name AEGIS-IAMRole-IoTRule-S3-factory-c
> ```

### 10-3. smoke publish 후 S3 적재 확인

Step 9 의 `factory_state` / `infra_state` publish 두 개를 한 번 더 실행한 뒤 IoT Rule 이 새 객체를 만들었는지 확인한다 (IoT Core → S3 적재 지연 5~20초).

```bash
# Computer 1 (publish 후 20~30초 대기)
sleep 25
aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive --summarize | tail -5
aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive --summarize | tail -5

LATEST_C="$(aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive | sort | tail -1 | awk '{print $4}')"
aws s3 cp "s3://aegis-bucket-data/${LATEST_C}" /tmp/factory-c-sample.json
jq '{factory_id, node_id, environment_type, input_module_type, source_type, payload_keys: (.payload|keys)}' /tmp/factory-c-sample.json
```

정상 기준:

```text
raw/factory-c/factory_state/yyyy=2026/mm=05/dd=19/...json  (>= 1 객체)
raw/factory-c/infra_state/yyyy=2026/mm=05/dd=19/...json    (>= 1 객체)
factory_id == "factory-c"
environment_type == "vm-windows"
input_module_type == "dummy"
payload_keys 가 factory-a 와 동일
```

빈 결과면 → 문제 해결 § "S3 `raw/factory-c` 가 비어 있음 (Step 10 이후)" 참고.

## Step 11. factory-c 가데이터 자동 발행 루프

실행 위치: **Computer 3 VM**

Step 9 의 1회 publish 만으로는 testbed 가 의미 있는 데이터 양을 만들지 못한다. Edge Agent dummy mode (Step 14) 가 워크스트림 A 합류로 늦어지는 동안에도 factory-c → IoT → S3 경로를 검증할 수 있도록, `noisy-vm` 프로파일을 따르는 가데이터 publisher 를 systemd 로 띄운다.

`noisy-vm` 프로파일 (출처: `configs/runtime/runtime-config.yaml` factory-c 항목):

| 항목 | baseline | jitter | warning_threshold | critical_threshold |
| --- | --- | --- | --- | --- |
| `temperature_celsius_avg` | 27.0 | ±4.0 | 33.0 | 39.0 |
| `humidity_percent_avg` | 52.0 | ±10.0 | 72.0 | 88.0 |
| `pressure_hpa_avg` | 1012.0 | ±2.0 | - | - |
| AI anomaly probability | 0.06 | - | - | - |
| `network_loss_probability` | 0.03 | - | - | - |
| `pod_restart_probability` | 0.02 | - | - | - |

전송 주기 (factory-a 와 동일):

```text
factory_state  3초
infra_state   20초
```

### 11-1. 인증서를 system 위치로 복사

systemd 가 root 로 띄우든 운영자 계정으로 띄우든, 인증서 경로가 안정적이도록 `/etc/aegis/iot/factory-c/` 에 두고 600 권한을 준다.

```bash
# Computer 3 VM
sudo mkdir -p /etc/aegis/iot/factory-c /var/lib/aegis
sudo cp ~/.aegis/iot/factory-c/certificate.pem.crt \
        ~/.aegis/iot/factory-c/private.pem.key \
        ~/.aegis/iot/factory-c/AmazonRootCA1.pem \
        ~/.aegis/iot/factory-c/endpoint.txt \
        /etc/aegis/iot/factory-c/
sudo chmod 700 /etc/aegis /etc/aegis/iot /etc/aegis/iot/factory-c
sudo chmod 600 /etc/aegis/iot/factory-c/*
```

### 11-2. 더미 publisher 스크립트 작성

`/usr/local/bin/aegis-dummy-publisher.sh` 는 `noisy-vm` 프로파일대로 값을 흩어 두 토픽으로 publish 하는 무한 루프다. Step 9 의 메시지 envelope 와 동일하므로 IoT Rule (Step 10) 이 그대로 받는다.

```bash
# Computer 3 VM
sudo tee /usr/local/bin/aegis-dummy-publisher.sh >/dev/null <<'BASH'
#!/usr/bin/env bash
set -uo pipefail

IOT_DIR="/etc/aegis/iot/factory-c"
SEQ_FILE="/var/lib/aegis/publish-sequence"
THING="AEGIS-IoTThing-factory-c"
TOPIC_F="aegis/factory-c/factory_state"
TOPIC_I="aegis/factory-c/infra_state"

[ -d /var/lib/aegis ] || mkdir -p /var/lib/aegis
[ -f "${SEQ_FILE}" ] || echo 0 > "${SEQ_FILE}"

ENDPOINT="$(cat "${IOT_DIR}/endpoint.txt")"

K3S_VERSION="$(KUBECONFIG=/etc/rancher/k3s/k3s.yaml \
  kubectl get node factory-c -o jsonpath='{.status.nodeInfo.kubeletVersion}' 2>/dev/null || echo 'unknown')"

rand_jitter() {  # baseline jitter  → baseline ± jitter (소수점 2자리)
  awk -v b="$1" -v j="$2" 'BEGIN{srand(); printf "%.2f", b + (rand()*2-1)*j}'
}

prob_hit() {  # probability → 1/0
  awk -v p="$1" 'BEGIN{srand(); print (rand() < p) ? 1 : 0}'
}

ai_score() {  # 0.0~1.0 (소수점 4자리)
  awk 'BEGIN{srand(); printf "%.4f", rand()}'
}

publish_factory_state() {
  local ts t h p anomaly fire fall bend sound
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  t="$(rand_jitter 27.0 4.0)"
  h="$(rand_jitter 52.0 10.0)"
  p="$(rand_jitter 1012.0 2.0)"
  anomaly="$(prob_hit 0.06)"
  if [ "${anomaly}" = "1" ]; then
    fire="$(ai_score)"; fall="$(ai_score)"; bend="$(ai_score)"; sound="intermittent vibration"
  else
    fire="0.0"; fall="0.0"; bend="0.0"; sound=""
  fi

  jq -n \
    --arg ts "${ts}" \
    --argjson t "${t}" --argjson h "${h}" --argjson p "${p}" \
    --argjson fire "${fire}" --argjson fall "${fall}" --argjson bend "${bend}" \
    --arg sound "${sound}" \
    '{
      schema_version: "0.1.0",
      message_id: ("factory-c:factory_state:factory-c:" + $ts),
      factory_id: "factory-c",
      node_id: "factory-c",
      environment_type: "vm-windows",
      input_module_type: "dummy",
      source_type: "factory_state",
      source_timestamp: $ts,
      published_at: $ts,
      agent_instance_id: "dummy-publisher-factory-c",
      payload: {
        aggregation_window_seconds: 3,
        sensor: {
          sample_count: 1,
          temperature_celsius_avg: $t,
          humidity_percent_avg: $h,
          pressure_hpa_avg: $p
        },
        ai_result: {
          sample_count: 1,
          fire_score: $fire,
          fall_score: $fall,
          bend_score: $bend,
          abnormal_sound: $sound
        }
      }
    }' > /tmp/aegis-fc-factory_state.json

  mosquitto_pub -h "${ENDPOINT}" -p 8883 \
    --cafile "${IOT_DIR}/AmazonRootCA1.pem" \
    --cert "${IOT_DIR}/certificate.pem.crt" \
    --key "${IOT_DIR}/private.pem.key" \
    -i "${THING}" -t "${TOPIC_F}" -q 1 \
    -f /tmp/aegis-fc-factory_state.json
}

publish_infra_state() {
  local ts seq
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  seq="$(cat "${SEQ_FILE}")"
  seq=$((seq + 1))
  echo "${seq}" > "${SEQ_FILE}"

  jq -n \
    --arg ts "${ts}" --arg k3s "${K3S_VERSION}" --argjson seq "${seq}" \
    '{
      schema_version: "0.1.0",
      message_id: ("factory-c:infra_state:cluster:" + $ts),
      factory_id: "factory-c",
      node_id: "cluster",
      environment_type: "vm-windows",
      input_module_type: "dummy",
      source_type: "infra_state",
      source_timestamp: $ts,
      published_at: $ts,
      agent_instance_id: "dummy-publisher-factory-c",
      payload: {
        heartbeat: {
          agent_status: "alive",
          last_successful_publish_at: $ts,
          last_checkpoint_timestamp: $ts,
          publish_sequence: $seq
        },
        cluster: {
          cluster_name: "factory-c",
          kubernetes_version: $k3s
        },
        nodes: [{
          node_id: "factory-c",
          role: "single-node",
          ready: true,
          cpu_usage_percent: 10.0,
          memory_usage_percent: 35.0,
          disk_usage_percent: 25.0,
          network_reachability: "ok"
        }],
        workloads: [],
        devices: {
          bme280:     { available: false, last_seen_at: null },
          camera:     { available: false, last_seen_at: null },
          microphone: { available: false, last_seen_at: null }
        }
      }
    }' > /tmp/aegis-fc-infra_state.json

  mosquitto_pub -h "${ENDPOINT}" -p 8883 \
    --cafile "${IOT_DIR}/AmazonRootCA1.pem" \
    --cert "${IOT_DIR}/certificate.pem.crt" \
    --key "${IOT_DIR}/private.pem.key" \
    -i "${THING}" -t "${TOPIC_I}" -q 1 \
    -f /tmp/aegis-fc-infra_state.json
}

TICK=0
while true; do
  publish_factory_state || true
  if [ $((TICK % 20)) -eq 0 ]; then
    publish_infra_state || true
  fi
  TICK=$((TICK + 3))
  sleep 3
done
BASH

sudo chmod 755 /usr/local/bin/aegis-dummy-publisher.sh
```

> **MQTT client id 충돌 주의**: 본 publisher 와 Step 14 의 Edge Agent dummy mode 는 모두 client id `AEGIS-IoTThing-factory-c` 를 쓴다. AWS IoT 는 동일 client id 의 동시 연결을 강제로 끊으므로, **Edge Agent 자동화로 넘어가기 직전에 반드시 dummy publisher 를 중단**해야 한다 (Step 14 안내 참조).

### 11-3. systemd 서비스 등록

```bash
# Computer 3 VM
sudo tee /etc/systemd/system/aegis-dummy-publisher.service >/dev/null <<'UNIT'
[Unit]
Description=Aegis factory-c dummy publisher (testbed)
Wants=network-online.target
After=network-online.target tailscaled.service k3s.service

[Service]
Type=simple
ExecStart=/usr/local/bin/aegis-dummy-publisher.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now aegis-dummy-publisher.service
sudo systemctl status aegis-dummy-publisher.service --no-pager
```

정상 기준:

```text
Loaded: loaded (/etc/systemd/system/aegis-dummy-publisher.service; enabled; ...)
Active: active (running)
```

### 11-4. 발행 로그 확인 (VM)

```bash
sudo journalctl -u aegis-dummy-publisher.service -n 30 --no-pager
```

`mosquitto_pub` 는 성공 시 출력이 없으므로 journal 에 에러가 반복되지 않으면 정상이다. publish_sequence 가 누적되는지 확인:

```bash
watch -n 5 cat /var/lib/aegis/publish-sequence
```

5초 간격으로 1씩 늘어나야 한다 (publish_sequence 는 `infra_state` 가 발행될 때만 증가하므로 20초마다 +1).

### 11-5. S3 누적 확인 (Computer 1, 가동 1~2분 후)

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive | wc -l
aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | wc -l
```

정상 기준 (가동 1분 후 기준값):

```text
factory_state ≈ 20개  (3초 주기 × 60초)
infra_state   ≈ 3개   (20초 주기 × 60초)
```

비율 (factory_state : infra_state ≈ 6~7 : 1) 이 유지되면 publisher · IoT Rule · S3 적재 경로가 모두 정상이다.

## Step 12. Tailscale IP 기반 kubeconfig 생성 + Context rename

실행 위치: **Computer 3 VM → Computer 1 (WSL)**

### Computer 3 VM 에서: kubeconfig 임시 사본

```bash
sudo install -m 600 -o "$USER" -g "$USER" /etc/rancher/k3s/k3s.yaml /tmp/factory-c.kubeconfig
ls -l /tmp/factory-c.kubeconfig
```

### Computer 1 에서: 받아와서 rewrite + rename

```bash
TS_IP_C=<Step 4에서 메모한 factory-c Tailscale IP>
mkdir -p ~/.aegis/secrets/kubeconfig

scp <vm-ssh-user>@${TS_IP_C}:/tmp/factory-c.kubeconfig \
    ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig

# server 주소를 127.0.0.1 -> Tailscale IP 로 변경
sed -i "s|server: https://127\.0\.0\.1:6443|server: https://${TS_IP_C}:6443|" \
    ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig

# K3s 기본 context 이름 'default' -> 'factory-c' 로 rename (ArgoCD 등록 시 필요)
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig \
  config rename-context default factory-c

# 기본 권한 강화
chmod 600 ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig
```

### 검증 (Computer 1)

```bash
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig get nodes
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig config current-context
```

정상 기준:

```text
factory-c   Ready   control-plane,master   ...
current-context: factory-c
```

### VM 임시 파일 정리 (Computer 3 VM)

```bash
rm -f /tmp/factory-c.kubeconfig
```

TLS 오류가 나면 Step 5 에서 `--tls-san ${TS_IP}` 가 빠진 것이다. 초기 구축 단계라면 K3s 재설치가 가장 단순하다 — `문제 해결` 섹션 참고.

## Step 13. ArgoCD cluster 등록

실행 위치: **Computer 1 (WSL)**

이 단계는 Hub EKS / ArgoCD 가 활성 상태이고, Computer 1 에서 `argocd login <hub-domain>` 이 끝난 상태여야 한다.

```bash
argocd cluster add factory-c \
  --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig \
  --name factory-c \
  --upsert
```

> `factory-c` 가 kubeconfig 의 context 이름 (Step 12 에서 rename 완료) 이어야 한다. context 이름이 아직 `default` 면 위 명령은 "context not found" 로 실패한다.

확인:

```bash
argocd cluster list
```

정상 기준:

```text
SERVER                          NAME        STATUS
https://100.x.y.z:6443          factory-c   Successful
```

장기 운영 desired state 는 ArgoCD UI 클릭이 아니라 GitOps repo 의 ApplicationSet/values 기준으로 유지한다.

## Step 14. Edge Agent dummy mode 배포 (워크스트림 A 합류 지점)

실행 위치: **Hub GitOps repo (워크스트림 A 영역)** — 본 환경(워크스트림 B, Computer 1) 단독으로는 진행 불가.

> **선결 조건**: Edge Agent 도 동일 MQTT client id (`AEGIS-IoTThing-factory-c`) 를 사용한다. 본 단계 시작 전에 **반드시 Step 11 의 dummy publisher 를 중단**한다.
>
> ```bash
> # Computer 3 VM
> sudo systemctl disable --now aegis-dummy-publisher.service
> sudo systemctl status aegis-dummy-publisher.service --no-pager
> # Active: inactive (dead) 확인
> ```
>
> 중단 누락 시 IoT Core 가 둘 중 하나의 연결을 반복적으로 끊어 양쪽 publish 가 모두 흔들린다.

이 단계는 다음이 모두 준비되어야 한다:

- M3 Edge Agent image (`aegis/edge-agent:sha-<...>`) 가 ECR 에 push 됨
- M4 ECR pull secret (`aegis-spoke-system/ecr-registry`) 이 factory-c 에 주입됨
- GitOps repo (`safe-edge-config-main`) 에 factory-c values 가 추가됨

`factory-c` values 핵심:

```yaml
factory_id: factory-c
environment_type: vm-windows
input_module_type: dummy
spoke_type: testbed
edge_agent_mode: dummy
iot:
  thing_name: AEGIS-IoTThing-factory-c
  topic_prefix: aegis/factory-c
  secret_name: aws-iot-factory-c-cert
dummy_data:
  profile: noisy-vm
```

배포 후 확인 (Computer 3 VM 또는 Computer 1 의 factory-c kubeconfig 로):

```bash
kubectl -n ai-apps get pods -o wide
kubectl -n ai-apps logs deploy/edge-agent --tail=100
```

정상 기준:

```text
edge-agent Pod: Running
mode: dummy
factory_id: factory-c
published topic: aegis/factory-c/factory_state
published topic: aegis/factory-c/infra_state
```

ECR image pull 이 실패하면 `aegis-spoke-system/ecr-registry` imagePullSecret 갱신 상태를 워크스트림 A 측에서 확인한다.

> **Step 13 까지만 완료해도 factory-c 가 IoT Core → S3 까지 데이터를 보내는 testbed 평면은 이미 완성된 상태다** (Step 10 IoT Rule + Step 11 dummy publisher 덕분에). Step 14 는 Edge Agent 자동화로 dummy publisher 를 대체하는 단계로, 워크스트림 A 진행에 맞춰 후속 진행한다.

## Step 15. Windows 호스트 무인 운영 설정

실행 위치: **Computer 3 Windows 호스트**

이 단계는 Computer 3 가 정전/재부팅/Windows Update 후 사람 개입 없이 factory-c VM 까지 자동으로 올라오게 만든다.

### 15-1. 전원/절전 OFF

PowerShell (관리자 권한):

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
powercfg /change disk-timeout-ac 0
powercfg /change disk-timeout-dc 0
powercfg /change monitor-timeout-ac 15
powercfg /change monitor-timeout-dc 15
```

GUI 확인: 설정 → 시스템 → 전원 및 절전 → "절전 모드로 전환: 안 함", "하드 디스크 끄기: 사용 안 함".

### 15-2. Windows 자동 로그인

가장 안정적인 방법은 SysInternals `Autologon` 도구다.

1. https://learn.microsoft.com/sysinternals/downloads/autologon 에서 다운로드
2. `Autologon64.exe` 실행 → Username / Domain / Password 입력 → Enable
3. 한 번 로그아웃 후 자동으로 로그인되는지 확인

대안 (Microsoft Account 가 아닌 로컬 계정인 경우): `netplwiz` → "사용자가 이 컴퓨터를 사용하려면 사용자 이름과 암호를 입력해야 합니다" 체크 해제.

### 15-3. VirtualBox VM 자동 시작 (Task Scheduler)

1. 시작 메뉴 → "작업 스케줄러" 실행
2. **기본 작업 만들기** 클릭
   - 이름: `Start factory-c VM`
   - 설명: `VirtualBox factory-c headless autostart`
3. **트리거**: "컴퓨터 시작 시"
4. **동작**: "프로그램 시작"
   - 프로그램/스크립트: `"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"`
   - 인수 추가: `startvm "factory-c" --type headless`
5. 마지막 화면에서 "[이 작업을 마칠 때 [속성] 대화 상자 열기]" 체크 후 **마침**
6. 속성 창에서:
   - "사용자가 로그온했는지 여부에 관계없이 실행"
   - "가장 높은 수준의 권한으로 실행" (둘 다 체크)
   - 설정 탭 → "작업이 실패하는 경우 다시 시작 간격: 1분, 다시 시작 시도 횟수: 3"
7. 저장 시 사용자 암호 입력

수동 검증:

```powershell
# VM 종료
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" controlvm "factory-c" poweroff

# 작업 스케줄러로 즉시 실행
schtasks /Run /TN "Start factory-c VM"

# VM 상태 확인
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" list runningvms
```

`"factory-c"` 가 list 에 보이면 성공.

### 15-4. Windows Update 강제 재시작 통제

- 설정 → Windows Update → 고급 옵션 → "사용 중인 시간" 을 운영자가 자주 확인하는 시간대로 설정
- 또는 그룹 정책 편집기 (`gpedit.msc`) → 컴퓨터 구성 → 관리 템플릿 → Windows 구성 요소 → Windows Update → "자동 업데이트 즉시 설치 사용 안 함"

업데이트 자체를 막을 필요는 없다. **재시작 타이밍을 운영자가 통제할 수 있는 시간대로 옮기는 것이 목적이다.**

### 15-5. (권장) Tailscale Windows 클라이언트 설치

VM 안 Tailscale 과 별개로 Windows 호스트에도 Tailscale 을 깔아두면, VM 이 죽었을 때 Windows 호스트에 원격 RDP 로 들어가 VirtualBox 를 직접 재시작할 수 있다.

- https://tailscale.com/download/windows 에서 설치
- 같은 Tailnet 계정으로 로그인
- 태그 (선택): `tag:aegis-operator-host`

## Step 16. 재부팅 검증

실행 위치: **Computer 3 Windows 호스트 + Computer 3 VM + Computer 1 (WSL)**

### Computer 3 Windows 호스트 재부팅

PowerShell:

```powershell
Restart-Computer
```

또는 시작 → 전원 → 다시 시작.

### Windows 부팅 후 자동 진행 확인 (사람 개입 없이)

1. Windows 자동 로그인 완료
2. Task Scheduler 가 `Start factory-c VM` 실행 → `VBoxManage startvm factory-c --type headless`
3. VirtualBox 가 백그라운드에서 VM 부팅
4. VM 안 Ubuntu 부팅 → systemd 가 `k3s.service`, `tailscaled.service`, `aegis-dummy-publisher.service` 자동 시작

### Computer 1 (WSL) 에서 외부 검증 (약 2~3분 후)

```bash
TS_IP_C=<factory-c Tailscale IP>

# Tailscale 도달 확인
tailscale ping factory-c   # Computer 1 에 tailscale 깔린 경우
# 또는
ping -c 3 ${TS_IP_C}

# K3s API 도달 + 노드 상태
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig get nodes
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig -n ai-apps get secret aws-iot-factory-c-cert
```

정상 기준:

```text
factory-c   Ready
aws-iot-factory-c-cert   Opaque   4
```

### Computer 3 VM 에서 내부 검증 (SSH 접속 후)

```bash
systemctl is-active k3s
systemctl is-active tailscaled
systemctl is-active aegis-dummy-publisher
tailscale status --self
kubectl get nodes -o wide
kubectl get node factory-c --show-labels
kubectl -n ai-apps get secret aws-iot-factory-c-cert
cat /var/lib/aegis/publish-sequence
```

정상 기준:

```text
k3s: active
tailscaled: active
aegis-dummy-publisher: active
factory-c node: Ready
aegis.factory-id=factory-c
aegis.environment-type=vm-windows
aegis.input-module-type=dummy
aegis.spoke-type=testbed
aws-iot-factory-c-cert: exists
publish-sequence: 재부팅 전 값보다 증가
```

### S3 적재 누적 확인 (Computer 1, 재부팅 후 1~2분)

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive | wc -l
aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | wc -l
```

재부팅 시각 이후 신규 객체가 추가되면 dummy publisher + IoT Rule + S3 경로가 무인 부팅 후에도 정상 동작하는 것이다.

### 추가: Step 9 MQTT smoke 1회 반복

systemd publisher 와 별개로 manual publish 도 동작하는지 확인하려면 Step 9 의 `factory_state` publish 한 번을 반복한다 (단, dummy publisher 가 같은 client id 를 쓰므로 IoT Core 가 dummy publisher 의 연결을 잠시 끊고 mosquitto_pub 으로 전환된 뒤 다시 dummy 로 복구된다 — 짧은 중단은 정상).

## 최종 검증 체크리스트

### Computer 1 (작업 PC)

- [ ] AWS CLI MFA 세션 활성 / OTP 입력 가능
- [ ] `argocd` CLI 로 Hub 로그인 완료
- [ ] `secret/iot/factory-c/` 산출물 존재
- [ ] factory-a S3 raw 객체 1건 다운로드 및 envelope 확인 (Step 10-1)
- [ ] IoT Rule `AEGIS_IoTRule_factory_c_raw_s3` + IAM Role `AEGIS-IAMRole-IoTRule-S3-factory-c` 생성됨 (Step 10-2)
- [ ] `~/.aegis/secrets/kubeconfig/factory-c.kubeconfig` 존재 + context 이름 `factory-c`
- [ ] `argocd cluster list` 에 `factory-c` Successful

### Computer 3 Windows 호스트

- [ ] VirtualBox 설치
- [ ] 절전/슬립 영구 OFF
- [ ] Windows 자동 로그인 enabled
- [ ] Task Scheduler `Start factory-c VM` 등록 + 검증 완료
- [ ] Windows 재부팅 후 사람 개입 없이 VM 부팅까지 자동 완료
- [ ] (권장) Tailscale Windows 클라이언트 연결

### Computer 3 VM (factory-c)

- [ ] hostname `factory-c`
- [ ] SSH 접속 가능
- [ ] Tailscale `factory-c` connected (`tag:aegis-spoke-testbed`, `tag:factory-c`)
- [ ] K3s single-node 설치 + `Ready`
- [ ] K3s 버전 기록됨
- [ ] node label 4종 (`aegis.factory-id`, `environment-type`, `input-module-type`, `spoke-type`) 적용
- [ ] IoT Thing `AEGIS-IoTThing-factory-c` 생성
- [ ] K3s Secret `ai-apps/aws-iot-factory-c-cert` 생성
- [ ] `aegis/factory-c/factory_state` 1회 publish 성공 (`exit=0`)
- [ ] `aegis/factory-c/infra_state` 1회 publish 성공 (`exit=0`)
- [ ] `/etc/aegis/iot/factory-c/` 인증서 600 권한 복사
- [ ] `/usr/local/bin/aegis-dummy-publisher.sh` 배포 + 755 권한
- [ ] systemd `aegis-dummy-publisher.service` enabled + active(running)
- [ ] `/var/lib/aegis/publish-sequence` 가 20초마다 증가

### IoT / S3 적재 (Step 10, 11 완료 후)

- [ ] `aws iot get-topic-rule --rule-name AEGIS_IoTRule_factory_c_raw_s3` 성공 + SQL 일치
- [ ] `aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/` 가동 1분 후 약 20개 (3초 주기)
- [ ] `aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/` 가동 1분 후 약 3개 (20초 주기)
- [ ] 적재된 객체 1건 envelope: `factory_id=factory-c`, `environment_type=vm-windows`, `input_module_type=dummy`
- [ ] factory-a S3 적재가 회귀 없이 계속 진행 (factory-a Rule 미수정 확인)

### 운영

- [ ] 민감 정보 (OTP, Auth Key, private key, kubeconfig token) 가 문서/Git 에 남지 않음
- [ ] Computer 3 가 24시간 켜진 상태에서 안정 동작
- [ ] ADR `docs/changes/0018-iot-rule-extend-to-factory-c.md` 반영 완료
- [ ] Edge Agent (Step 14) 전환 시 dummy publisher 중단 절차 숙지

## 문제 해결

### `register-thing.sh` 가 MFA 요구로 멈춤

증상: 명령 실행 후 OTP 프롬프트 또는 `aws sts` 권한 오류.

원인: MFA 세션 만료 + OTP 인자 누락.

해결:

```bash
FACTORY_ID=factory-c scripts/iot/register-thing.sh <6자리 OTP 코드>
```

Authenticator 코드가 새로 갱신된 직후 (남은 시간 25초 이상) 입력한다.

### `register-k3s-secret.sh` SSH 연결 실패

증상: `Permission denied (publickey)` 또는 `Connection refused`.

원인 후보:

- SSH 키 미등록 → `ssh-copy-id <user>@<vm-ip>` 1회 실행
- VM 의 sshd 미동작 → VM 안에서 `sudo systemctl status ssh` 확인
- 방화벽/NAT → Tailscale IP 사용으로 우회

### `register-k3s-secret.sh` 가 `kubectl: command not found` 로 실패

증상: SSH 는 되지만 원격 `kubectl` 실행 단계에서 실패.

원인: 비-interactive SSH 의 PATH 에 `/usr/local/bin` 미포함.

해결: VM 의 `~/.bashrc` 또는 `~/.profile` 맨 위에 `export PATH="$PATH:/usr/local/bin"` 추가.

### `argocd cluster add factory-c` 가 context not found 로 실패

증상: `the cluster 'factory-c' is not in your kubeconfig contexts`.

원인: Step 12 의 context rename 누락.

해결:

```bash
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig \
  config rename-context default factory-c
```

### 외부 kubeconfig TLS 오류 (`x509: certificate is valid for ...`)

원인: Step 5 K3s 설치 시 `--tls-san ${TS_IP}` 누락.

초기 구축 단계 해결:

```bash
# Computer 3 VM 에서
sudo /usr/local/bin/k3s-uninstall.sh
TS_IP="$(tailscale ip -4)"
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --node-name factory-c --tls-san ${TS_IP}" sh -

mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config

# 그 후 Step 12 처음부터 다시 수행
```

운영 데이터가 생긴 뒤에는 재설치하지 말고 별도 유지보수 절차를 잡는다.

### IoT publish 인증 실패

확인 항목:

- `~/.aegis/iot/factory-c/endpoint.txt` 가 현재 IoT endpoint 인지 (region 변경 시 갱신 필요)
- mosquitto_pub `-i` 인자가 `AEGIS-IoTThing-factory-c` 인지
- Policy 가 `aegis/factory-c/*` publish 를 허용하는지 (`register-thing.sh` 가 자동 부여)
- 인증서가 ACTIVE 상태인지 (`register-thing.sh` 가 자동 처리)
- private key 파일 권한이 600 인지

### S3 `raw/factory-c` 가 비어 있음 (Step 10 이후)

ADR 0018 / Step 10 의 IoT Rule 확장이 적용된 뒤에도 S3 가 비어 있다면 아래 순서로 진단한다.

| 현상 | 해석 / 조치 |
| --- | --- |
| `mosquitto_pub exit=0` 인데 S3 비어 있음 | (1) `aws iot get-topic-rule --rule-name AEGIS_IoTRule_factory_c_raw_s3` 가 disabled=false 인지 (2) SQL 이 `FROM 'aegis/factory-c/+'` 정확한지 |
| Rule 존재하나 S3 PUT 실패 | IAM Role 의 `s3:PutObject` 권한이 `arn:aws:s3:::aegis-bucket-data/raw/factory-c/*` 와 정확히 일치하는지. CloudWatch Logs (IoT Logging) 에 `AccessDenied` 가 찍힘 |
| Rule 권한 OK 인데 S3 비어 있음 | bucket 정책 (`aws_s3_bucket_policy`) 이 외부 IoT Rule role 의 PutObject 를 막고 있지 않은지. 워크스트림 A 측 정책 확인 |
| `mosquitto_pub` TLS/auth 오류 | 인증서, Policy, endpoint, client id 확인 |
| `mosquitto_pub` network 오류 | VM 인터넷, DNS, 방화벽 확인 |
| IoT Rule 자체가 없음 | Step 10-2 의 `create-topic-rule` 누락. ADR 0018 절차 재실행 |

### `aegis-dummy-publisher.service` 가 자주 재시작

증상: `journalctl -u aegis-dummy-publisher` 에 mosquitto_pub 오류 또는 `kubectl get node` 실패가 반복.

원인 후보:

- 인증서 경로 오타 / 권한 문제 → `/etc/aegis/iot/factory-c/` 600 권한, `endpoint.txt` 내용 확인
- K3s 부팅 전에 publisher 가 먼저 떠 `kubectl` 호출 실패 → systemd unit `After=k3s.service` 확인. K3s_VERSION 조회는 `2>/dev/null || echo 'unknown'` 으로 fallback 처리되어 있으므로 무한 실패는 아님
- IoT Core 가 같은 client id 의 다른 연결을 끊는 중 → Step 14 Edge Agent 가 떠 있는지 확인. 동시 사용 금지

### Edge Agent 와 dummy publisher 가 충돌 (Step 14 전환 직후)

증상: IoT Core 가 client id 충돌로 양쪽 연결을 번갈아 끊어 둘 다 데이터가 띄엄띄엄 들어옴.

원인: Step 14 의 dummy publisher 중단 누락.

해결:

```bash
# Computer 3 VM
sudo systemctl disable --now aegis-dummy-publisher.service
sudo systemctl status aegis-dummy-publisher.service --no-pager   # inactive (dead)
```

이후 Edge Agent Pod log 에서 publish 가 안정화되는지 확인.

### VM 인터넷 접근 실패

```bash
ip route
resolvectl status
curl -I https://get.k3s.io
```

- VirtualBox 네트워크가 NAT 또는 Bridged 인지 확인 (Host-only 면 인터넷 불가)
- DNS 응답 확인
- VM 외부 (Windows 호스트) 의 방화벽/보안 제품 차단 여부 확인

### Windows 재부팅 후 VM 이 자동 시작되지 않음

확인 순서:

1. 작업 스케줄러에서 `Start factory-c VM` 작업 상태가 "준비" 인지 (마지막 실행 결과 코드 0 인지)
2. "사용자가 로그온했는지 여부에 관계없이 실행" 체크 여부
3. 작업의 사용자 계정이 Windows 자동 로그인 계정과 동일한지
4. `VBoxManage.exe` 절대 경로가 정확한지 (`C:\Program Files\Oracle\VirtualBox\VBoxManage.exe`)
5. 수동 실행: PowerShell 관리자로 `schtasks /Run /TN "Start factory-c VM"` 후 `VBoxManage list runningvms` 결과 확인

### VM 시작은 됐지만 K3s/Tailscale 이 올라오지 않음

VM 안에서:

```bash
systemctl status k3s --no-pager
systemctl status tailscaled --no-pager
journalctl -u k3s -n 100 --no-pager
journalctl -u tailscaled -n 100 --no-pager
```

- K3s 실패는 대부분 디스크 공간/메모리 부족 또는 네트워크 문제
- Tailscale 실패는 Auth Key 만료 (One-off 인 경우 이미 등록된 상태이므로 재인증 불필요). 재설치를 한 경우만 `sudo tailscale up --authkey=... --hostname=factory-c` 로 재참여
