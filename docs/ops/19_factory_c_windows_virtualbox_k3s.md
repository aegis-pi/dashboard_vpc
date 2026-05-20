# Factory C Windows VirtualBox K3s Runbook

상태: candidate
기준일: 2026-05-19

## 수정 이력

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-05-20 | v6 | Step 11 가데이터 루프를 문서 내 임시 bash heredoc 에서 repo 관리 코드 `apps/dummy-sensor/factory_c_dummy_generator.py` + `factory_c_iot_publisher.py` 기준으로 변경. Factory A 최신 구현과 동일하게 canonical JSON outbox → MQTT publish 경계를 사용하고 `data_plane_instance_id` 필드를 기준 필드로 반영 |
| 2026-05-19 | v5 | 노드/VM/변수 호칭을 master/worker 로 통일. `factory-c-server` → `factory-c-master`, `factory-c-agent` → `factory-c-worker`, `TS_IP_SERVER` → `TS_IP_MASTER`, `TS_IP_AGENT` → `TS_IP_WORKER`. K3s 자체 용어 (`INSTALL_K3S_EXEC="server"`, `k3s.service`, `k3s-agent.service`, `K3S_URL/K3S_TOKEN`) 와 yaml 의 `topology: server-agent` · `role: k3s-server/k3s-agent` 는 K3s 정의 그대로 유지. ADR 0019 (파일명 `0019-factory-c-master-worker-cluster.md`), `configs/runtime/runtime-config.yaml` factory-c 블록, `docs/changes/README.md` 인덱스도 동시 정렬 완료 |
| 2026-05-19 | v4 | 토폴로지 single-node → **server + agent 2-VM cluster** 전면 반영 (ADR 0019). VM 사이즈 분리 (server 2 vCPU/2 GiB · agent 2 vCPU/4 GiB), Tailscale 2 노드 join, K3s server 토큰 추출 → agent join, 노드 label 분리, dummy publisher 위치 = worker VM, `infra_state.payload.nodes` 배열 2개, Windows Task Scheduler 2개 작업 (60s 지연), 재부팅 검증에 두 노드 Ready 확인 추가 |
| 2026-05-19 | v3 | factory-a 데이터 형상 참고 절차, IoT Rule factory-c 확장 (ADR 0018) 흡수, 가데이터 자동 발행 루프 (systemd `aegis-dummy-publisher`) 추가, Step 11~16 재번호, S3 적재 검증 기준을 "채워짐" 으로 갱신, Edge Agent 전환 시 dummy publisher 중단 절차 명시 |
| 2026-05-19 | v2 | PC 분리 (Computer 1 작업 PC / Computer 3 상시 운영 PC), 각 단계 실행 위치 명시, MFA OTP 인자 / kubectl PATH / ArgoCD context rename / Windows 무인 운영 자동 시작 / S3 적재 빈 결과 정상 처리 보강 |
| 2026-05-19 | v1 | 초안 |

## 목적

Windows 호스트에서 VirtualBox 기반 Linux VM **2 대**를 만들고 `factory-c` 테스트베드형 Spoke K3s 를 **master + worker 2-노드 클러스터** (K3s 컴포넌트 명칭으로는 server + agent) 로 상시 무인 운영 가능하게 구성한다.

이 문서는 운영자가 다른 문서를 함께 열지 않고도 처음부터 끝까지 따라갈 수 있도록 작성되었다. 목표는 두 VM 으로 이뤄진 `factory-c` 클러스터가 IoT Core 로 `aegis/factory-c/*` topic 데이터를 송신하고, IoT Rule (ADR 0018) 을 통해 S3 `raw/factory-c/...` 에 적재되며, Hub/ArgoCD 가 Tailscale 을 통해 `factory-c` K3s API (master 노드) 를 인식하는 기준선을 만드는 것이다.

2-VM 구성으로 가는 이유와 변경 근거는 `docs/changes/0019-factory-c-master-worker-cluster.md` 참조. 워크스트림 A↔B 합류 지점인 IoT Rule 확장은 `docs/changes/0018-iot-rule-extend-to-factory-c.md` 참조.

## PC 구성

이 작업은 **두 대의 PC**를 사용한다.

| 식별 | 역할 | 설명 |
| --- | --- | --- |
| **Computer 1** | 작업 PC (지금 사용 중) | WSL + 이 repository checkout. Terraform · AWS CLI · argocd · kubeconfig 보관. 사람이 매일 켜고 끄는 PC |
| **Computer 3** | 상시 운영 PC (신규, 백지 Windows) | VirtualBox 호스팅. 안에 `factory-c` Ubuntu VM **2 대** (`factory-c-master`, `factory-c-worker`). 절대 끄지 않는다 |

Computer 3 안의 VM 들은 별도 환경이므로 세 번째/네 번째 환경으로 다룬다.

| 식별 | 역할 |
| --- | --- |
| **Computer 3 Windows 호스트** | VirtualBox 호스트, Windows 자체 설정, Task Scheduler 2 작업 |
| **Computer 3 VM (server)** | factory-c-master. Ubuntu Server, K3s server (control plane), Tailscale, IoT 인증서 cluster Secret 위치 |
| **Computer 3 VM (agent)** | factory-c-worker. Ubuntu Server, K3s agent (worker), Tailscale, dummy publisher systemd, Edge Agent dummy mode 배치 노드 |

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
| BIOS/UEFI 에서 Virtualization (VT-x/AMD-V) 활성 | 펌웨어 설정 |
| 호스트 사양 (권장) | CPU 8 코어 이상 / RAM 16 GiB 이상 / Disk 100 GiB 여유 |
| VirtualBox 7.x 설치 | Oracle 공식 사이트 |
| Ubuntu Server LTS ISO | 24.04 LTS 권장 |
| Windows 절전/슬립 영구 OFF | Step 15 에서 설정 |
| Windows 자동 로그인 | Step 15 에서 설정 |
| VirtualBox VM **2 개** 자동 시작 (Task Scheduler) | Step 15 에서 설정 (master / worker 각각) |
| (권장) Tailscale Windows 클라이언트 | 호스트 자체 원격 관리용 |

### Computer 3 VM × 2 (Ubuntu Server 안)

| 항목 | master | worker |
| --- | --- | --- |
| VM 이름 / hostname | `factory-c-master` | `factory-c-worker` |
| vCPU | 2 | 2 |
| RAM | 2 GiB | 4 GiB |
| Disk | 20 GiB | 40 GiB |
| Ubuntu Server LTS | Step 2A | Step 2B |
| `curl`, `jq`, `openssh-server`, `mosquitto-clients` | Step 3 | Step 3 |
| Tailscale | Step 4 | Step 4 |
| K3s | Step 5-1 (server) | Step 5-2 (agent) |
| K3s 컴포넌트 | K3s server (control plane) | K3s agent (worker join) |
| AWS IoT 인증서 사본 (Computer 1 에서 scp) | Step 8 (cluster Secret 등록) | Step 9 (smoke publish) · Step 11 (dummy publisher) |
| dummy publisher systemd | 미배치 | Step 11 |

### 민감 정보 보관 규칙

- Tailscale Auth Key · AWS credential · IoT private key · kubeconfig token 은 **Git 에 절대 커밋하지 않는다**
- IoT 인증서 산출물은 Computer 1 의 `secret/iot/factory-c/` 디렉터리에만 둔다 (이 디렉터리는 Git 추적 제외)
- Computer 3 의 두 VM 내부 인증서 사본은 `/etc/aegis/iot/factory-c/` (chmod 700, 파일 600) 에만 둔다
- `factory-c.kubeconfig` 는 Computer 1 의 `~/.aegis/secrets/kubeconfig/` 에만 둔다

## Factory C 확정 구성

| 항목 | 값 |
| --- | --- |
| Factory ID | `factory-c` |
| 표시명 | `Factory C` |
| Host | Windows (Computer 3) |
| VM tool | VirtualBox |
| Guest OS | Ubuntu Server LTS 24.04 |
| Kubernetes | **K3s server + agent (2-노드 cluster)** |
| Master VM / 노드명 | `factory-c-master` (control-plane, 워크로드 미배치) |
| Worker VM / 노드명 | `factory-c-worker` (worker, dummy publisher + Edge Agent 배치) |
| Spoke type | `testbed` |
| Environment type | `vm-windows` |
| Input module type | `dummy` (worker 노드 label) |
| Dummy profile | `noisy-vm` |
| IoT Thing | `AEGIS-IoTThing-factory-c` |
| MQTT topic prefix | `aegis/factory-c` |
| S3 raw prefix | `raw/factory-c/{source_type}/yyyy=...` |
| K8s namespace | `ai-apps` |
| K8s Secret | `aws-iot-factory-c-cert` |
| Tailscale tags (두 노드 공통) | `tag:aegis-spoke-testbed`, `tag:factory-c` |
| Tailscale hostnames | `factory-c-master`, `factory-c-worker` |
| ArgoCD cluster context | `factory-c` (Step 12 에서 rename, master API 기준) |

제외 범위: Longhorn, NFS/cold storage, 실센서·카메라·마이크, Raspberry Pi 수준의 failover, production 자동 롤백, 3+ 노드 HA control plane.

`factory-c` 는 실제 공장 대체가 아니라 멀티 공장 식별 · 배포 · 데이터 분리 · multi-node 워크로드 배치 · Dashboard 표시를 검증하는 testbed 다.

## 전체 흐름

```text
Computer 1 (WSL)                       Computer 3 (Windows + 2 VM)
─────────────────                      ─────────────────────────
register-thing.sh  ──── AWS IoT Thing
   └─ secret/iot/factory-c/  ─── scp ─→ master: /etc/aegis/iot/factory-c/  (Step 8 Secret 등록용)
                                        worker: /etc/aegis/iot/factory-c/  (Step 9 smoke / Step 11 publisher)

register-k3s-secret.sh ─── ssh ──────→ server: kubectl Secret 생성 (cluster scope)

aws iot create-topic-rule (factory-c)
   └─ AEGIS_IoTRule_factory_c_raw_s3
   └─ → S3 raw/factory-c/ (ADR 0018)

                                       server: K3s server (control plane)
                                              + Tailscale tag:factory-c
                                              + label 3종
                                       agent : K3s agent (worker)
                                              + Tailscale tag:factory-c
                                              + label 4종 (input-module-type=dummy 포함)
                                              + systemd aegis-factory-c-dummy-generator / publisher
                                                (noisy-vm profile, 3s / 20s)

kubeconfig 수신 ←─── scp ─────────────── master: ~/.kube/config 사본
   └─ server 주소를 master Tailscale IP 로 rewrite
   └─ context rename default → factory-c
   └─ argocd cluster add factory-c (cluster 단위 1회)

aws s3 ls raw/factory-c/                AWS S3 (IoT Rule 통해)
   └─ factory_state, infra_state 누적 확인 (nodes 배열 길이 == 2)

                                       Windows 호스트:
                                       절전 OFF · 자동 로그인
                                       Task Scheduler:
                                         Start factory-c-master VM  (boot 시 즉시)
                                         Start factory-c-worker VM   (boot + 60s)
```

데이터 경로:

```text
factory-c-worker VM (systemd dummy publisher 또는 후속 Edge Agent dummy mode)
  -> AWS IoT Core
  -> IoT Topic Rule (AEGIS_IoTRule_factory_c_raw_s3)
  -> S3 raw bucket: aegis-bucket-data
  -> (Lambda data processor, DynamoDB, Dashboard — 워크스트림 B 후속)
```

제어 경로:

```text
Hub EKS / ArgoCD  -> Tailscale  -> factory-c-master K3s API (6443)
                                   └─ control plane 통해 cluster 전체 관리
```

Tailscale 은 제어/운영망이고, Dashboard Web/API 는 Tailscale 을 직접 사용하지 않는다.

## 데이터 포맷 요약

자세한 스펙은 `docs/specs/iot_data_format.md` 가 source of truth 다. Step 9 / Step 11 에서 사용하는 핵심만 요약한다.

- topic: `aegis/factory-c/factory_state`, `aegis/factory-c/infra_state`
- 공통 필드: `schema_version`, `message_id`, `factory_id`, `node_id`, `environment_type`, `input_module_type`, `source_type`, `source_timestamp`, `published_at`, `data_plane_instance_id`, `payload`
- `factory_state.payload`: `aggregation_window_seconds`, `sensor`, `ai_result`
- `infra_state.payload`: `heartbeat`, `node_summary`, `nodes` (**길이 2**: master + worker), `workload_summary`, `workloads`, `devices`

## Step 1. VirtualBox 네트워크 결정

실행 위치: **Computer 3 Windows 호스트**

권장은 **NAT + Tailscale** (두 VM 모두). 이유: Computer 1 ↔ Computer 3 VM 사이 SSH 경로를 Tailscale IP 로 안정화할 수 있고, master ↔ worker 간 K3s API (6443) 트래픽도 Tailscale 안에서 처리된다.

| 방식 | 사용 시점 | 장점 | 주의 |
| --- | --- | --- | --- |
| **NAT + Tailscale (권장)** | 무인 상시 운영 | Tailscale IP 안정, master↔worker 간 6443 도 Tailscale 안 | Tailscale 참여 전까지 SSH/Join 불편 |
| Bridged Adapter | 같은 LAN 안에서만 운영 | 즉시 SSH 가능 | Wi-Fi/회사망 정책에 막힐 수 있음 |
| NAT + Port Forwarding | 위 두 가지 불가 | Windows localhost로 SSH | 자동 스크립트 `register-k3s-secret.sh` 사용 불가 (Step 8 수동 경로만), agent join 어려움 |
| Host-only | 사용하지 않음 | — | 인터넷 차단되어 K3s/Tailscale 설치 불가 |

이 문서의 이후 단계는 **NAT + Tailscale** 기준으로 작성한다.

## Step 2. VirtualBox VM 생성 (2 대)

실행 위치: **Computer 3 Windows 호스트**

VM 두 개를 만든다. 사이즈를 서로 다르게 둔다 (master 는 control plane 만 돌아서 작게, worker 가 워크로드 받음).

### 2A. VM `factory-c-master`

| 항목 | 값 |
| --- | --- |
| Name | `factory-c-master` |
| Type | Linux |
| Version | Ubuntu (64-bit) |
| CPU | 2 vCPU |
| Memory | 2048 MiB (2 GiB) |
| Disk | 20 GiB (동적 할당) |
| Network | NAT |

Ubuntu Server 설치 중 기준:

```text
hostname: factory-c-master
ssh:      enabled
user:     운영자가 정한 일반 사용자 (예: aegis)
```

### 2B. VM `factory-c-worker`

| 항목 | 값 |
| --- | --- |
| Name | `factory-c-worker` |
| Type | Linux |
| Version | Ubuntu (64-bit) |
| CPU | 2 vCPU |
| Memory | 4096 MiB (4 GiB) |
| Disk | 40 GiB (동적 할당) |
| Network | NAT |

Ubuntu Server 설치 중 기준:

```text
hostname: factory-c-worker
ssh:      enabled
user:     운영자가 정한 일반 사용자 (예: aegis)
```

비밀번호와 SSH private key 는 문서에 기록하지 않는다.

> 두 VM 의 SSH 사용자 이름은 동일하게 두는 게 편하다 (이후 명령에서 `<vm-ssh-user>` 하나로 표기).

## Step 3. Guest OS 기본 설정

실행 위치: **Computer 3 의 두 VM 모두** (VirtualBox 콘솔에서 로그인)

> 두 VM 각각에서 동일한 작업을 한다. 명령 자체는 차이가 없다 (hostname 만 다름).

```bash
hostnamectl
ip addr
systemctl status ssh
```

hostname 이 다르면 고정 (`factory-c-master` 또는 `factory-c-worker`):

```bash
# master VM
sudo hostnamectl set-hostname factory-c-master

# worker VM
sudo hostnamectl set-hostname factory-c-worker
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

정상 기준 (두 VM 모두):

```text
Static hostname: factory-c-master  (또는 factory-c-worker)
SSH service: active
System clock synchronized: yes
```

## Step 4. Tailscale 참여 (두 VM 모두)

실행 위치: **Computer 3 의 두 VM 각각**

Tailscale Admin Console (https://login.tailscale.com/admin) 에서 factory-c 용 Auth Key 를 발급한다. **두 VM 다 같은 Auth Key 를 쓰려면 Reusable 옵션이 필요**하다.

```text
Tags:         tag:aegis-spoke-testbed, tag:factory-c
Reusable:     Yes  (두 VM 모두 사용)
Pre-approved: Yes
Expiration:   90 days (기본)
```

발급된 Auth Key 는 다른 곳에 저장하지 말고 두 VM 입력에 바로 사용한다.

각 VM 에서:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

Auth Key 를 환경변수로만 받는다 (history 에 남지 않게 silent input):

```bash
read -r -s TAILSCALE_AUTH_KEY
export TAILSCALE_AUTH_KEY
```

> 명령 입력 후 화면에 아무것도 안 보이는 게 정상. Auth Key 를 붙여넣고 Enter.

### 4A. master VM 에서

```bash
sudo tailscale up \
  --authkey="${TAILSCALE_AUTH_KEY}" \
  --hostname=factory-c-master
tailscale status --self
tailscale ip -4    # 이 값을 메모. 이후 TS_IP_MASTER 로 표기 (Step 5, 8, 12 에서 사용)
unset TAILSCALE_AUTH_KEY
history -c
```

### 4B. worker VM 에서

```bash
sudo tailscale up \
  --authkey="${TAILSCALE_AUTH_KEY}" \
  --hostname=factory-c-worker
tailscale status --self
tailscale ip -4    # 이 값을 메모. 이후 TS_IP_WORKER 로 표기 (Step 9, 11 에서 사용)
unset TAILSCALE_AUTH_KEY
history -c
```

정상 기준 (두 VM 모두):

```text
hostname:     factory-c-master  (또는 factory-c-worker)
tags:         tag:aegis-spoke-testbed, tag:factory-c
tailscale IP: 100.x.y.z
```

> 이후 명령에서 두 IP 가 자주 등장하므로 명확히 구분해 메모해 둔다.
> - `TS_IP_MASTER` = factory-c-master 의 Tailscale IP
> - `TS_IP_WORKER`  = factory-c-worker  의 Tailscale IP

## Step 5. K3s 설치 (master → worker)

master (K3s server) 가 먼저 떠 있어야 worker (K3s agent) 가 join 할 수 있다. 두 단계로 나눠 진행한다.

### 5-1. server 설치 (실행 위치: master VM)

```bash
TS_IP_MASTER="$(tailscale ip -4)"
echo "TS_IP_MASTER=${TS_IP_MASTER}"

# server 설치 + Tailscale IP 를 TLS SAN 에 포함
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC="server --node-name factory-c-master --tls-san ${TS_IP_MASTER}" \
  sh -

sudo systemctl status k3s --no-pager
sudo kubectl get nodes -o wide
```

server 정상 기준:

```text
factory-c-master  Ready  control-plane,master
K3s service: active (running)
```

일반 사용자가 `kubectl` 을 쓸 수 있게 kubeconfig 복사:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config
kubectl get nodes -o wide
```

agent join 에 쓸 cluster token 추출:

```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

> 이 값을 다음 단계 (agent install) 에 그대로 붙여 넣는다. **문서/Git/채팅에 절대 기록하지 않는다.**

K3s 버전 기록 (Step 11 publisher 환경변수에 사용):

```bash
kubectl get node factory-c-master -o jsonpath='{.status.nodeInfo.kubeletVersion}{"\n"}'
# 예: v1.34.6+k3s1
```

### 5-2. agent 설치 (실행 위치: worker VM)

```bash
TS_IP_WORKER="$(tailscale ip -4)"
echo "TS_IP_WORKER=${TS_IP_WORKER}"

# Step 5-1 에서 얻은 master Tailscale IP 와 token 을 변수로 받는다 (silent input)
read -r -p "TS_IP_MASTER (master Tailscale IP): " TS_IP_MASTER
read -r -s -p "K3S_TOKEN: " K3S_TOKEN; echo
export K3S_TOKEN

curl -sfL https://get.k3s.io | \
  K3S_URL="https://${TS_IP_MASTER}:6443" \
  K3S_TOKEN="${K3S_TOKEN}" \
  INSTALL_K3S_EXEC="agent --node-name factory-c-worker --node-ip ${TS_IP_WORKER}" \
  sh -

unset K3S_TOKEN
history -c

sudo systemctl status k3s-agent --no-pager
```

정상 기준 (worker VM 기준):

```text
k3s-agent.service: active (running)
```

### 5-3. cluster 전체 확인 (실행 위치: master VM)

```bash
kubectl get nodes -o wide
```

정상 기준:

```text
NAME                STATUS   ROLES                  AGE   VERSION
factory-c-master    Ready    control-plane,master   ...   v1.34.x+k3s1
factory-c-worker     Ready    <none>                 ...   v1.34.x+k3s1
```

`factory-c-worker` 가 Ready 가 아니면 → 문제 해결 § "worker 가 master 에 join 못함" 참고.

## Step 6. Factory C node label 적용

실행 위치: **master VM** (master 의 kubectl 로 두 노드 모두 label)

```bash
# 두 노드 공통 label
for n in factory-c-master factory-c-worker; do
  kubectl label node "$n" aegis.factory-id=factory-c       --overwrite
  kubectl label node "$n" aegis.environment-type=vm-windows --overwrite
  kubectl label node "$n" aegis.spoke-type=testbed         --overwrite
done

# 입력 모듈 label 은 워크로드 받는 worker 노드에만
kubectl label node factory-c-worker aegis.input-module-type=dummy --overwrite

# 확인
kubectl get nodes --show-labels
```

정상 기준:

```text
factory-c-master : aegis.factory-id=factory-c, aegis.environment-type=vm-windows, aegis.spoke-type=testbed
                   (input-module-type 라벨 미부착)
                   taint: node-role.kubernetes.io/control-plane:NoSchedule  (K3s 기본)
factory-c-worker  : 위 3개 + aegis.input-module-type=dummy
                   (no taint)
```

이렇게 두면 후속 Edge Agent dummy mode (Step 14) 가 `nodeSelector: aegis.input-module-type=dummy` 또는 단순히 control plane taint 회피로 자연스럽게 worker 노드에 배치된다.

## Step 7. IoT Thing 생성

실행 위치: **Computer 1 (WSL)**. Computer 3 의 어느 VM 에서도 절대 실행하지 않는다.

`register-thing.sh` 는 첫 번째 인자로 **MFA OTP (6자리)** 를 받는다. 활성 MFA 세션이 있어도 OTP 인자를 함께 주는 게 안전하다.

```bash
cd /home/jongwon/personal_project/Aegis-pi
FACTORY_ID=factory-c scripts/iot/register-thing.sh <6자리 OTP 코드>
```

> Authenticator 앱에서 새로 갱신된 코드 (잔여 시간 25초 이상) 를 사용한다.

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

## Step 8. IoT 인증서를 K3s Secret 으로 주입 (cluster scope, master VM)

실행 위치: **Computer 1 (WSL) → Computer 3 master VM** (스크립트가 SSH 로 master 에 들어가 `kubectl` 실행)

Secret 은 cluster scope (`ai-apps` namespace) 라 master 에서 한 번 등록하면 worker 에 스케줄된 pod 도 그대로 마운트한다.

### 사전 조건: master VM SSH 키 인증 (1회만)

```bash
# Computer 1 (WSL) 에서
TS_IP_MASTER=<Step 4A 에서 메모한 master Tailscale IP>
ssh-copy-id <vm-ssh-user>@${TS_IP_MASTER}
ssh <vm-ssh-user>@${TS_IP_MASTER} 'whoami && which kubectl'
```

`which kubectl` 가 빈 결과면 비-interactive SSH PATH 에 `/usr/local/bin` 이 빠진 것이다. master VM 의 `~/.bashrc` 또는 `~/.profile` 맨 위에 다음 줄을 추가:

```bash
export PATH="$PATH:/usr/local/bin"
```

### 자동 주입 (권장)

```bash
# Computer 1 (WSL)
cd /home/jongwon/personal_project/Aegis-pi

FACTORY_ID=factory-c \
REMOTE_USER=<vm-ssh-user> \
REMOTE_HOST=${TS_IP_MASTER} \
scripts/iot/register-k3s-secret.sh
```

스크립트 출력 마지막 줄:

```text
Registered K3s Secret ai-apps/aws-iot-factory-c-cert
```

### 수동 주입 (자동 경로가 불가능할 때)

Computer 1 에서:

```bash
scp secret/iot/factory-c/certificate.pem.crt \
    secret/iot/factory-c/private.pem.key \
    secret/iot/factory-c/AmazonRootCA1.pem \
    secret/iot/factory-c/endpoint.txt \
    <vm-ssh-user>@${TS_IP_MASTER}:/tmp/
```

master VM 에서:

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

### 검증 (master VM)

```bash
kubectl -n ai-apps get secret aws-iot-factory-c-cert
```

정상 기준:

```text
NAME                       TYPE     DATA   AGE
aws-iot-factory-c-cert     Opaque   4      <n>s
```

## Step 9. worker VM 에서 MQTT smoke publish

실행 위치: **Computer 1 → Computer 3 worker VM** (인증서 사본 전달 후 worker 에서 publish)

dummy publisher 는 Step 11 에서 worker VM 에 systemd 로 띄울 예정이므로, 인증서 사본은 처음부터 worker VM 에 둔다 (master VM 에는 Step 8 자동 스크립트가 이미 cluster Secret 용도로 임시 복사했고 자동 삭제됨 — worker VM 에는 영구적으로 둔다).

### 인증서 사본 전달 (Computer 1 → worker VM)

```bash
TS_IP_WORKER=<Step 4B 에서 메모한 worker Tailscale IP>

ssh <vm-ssh-user>@${TS_IP_WORKER} 'sudo mkdir -p /etc/aegis/iot/factory-c'

scp secret/iot/factory-c/certificate.pem.crt \
    secret/iot/factory-c/private.pem.key \
    secret/iot/factory-c/AmazonRootCA1.pem \
    secret/iot/factory-c/endpoint.txt \
    <vm-ssh-user>@${TS_IP_WORKER}:/tmp/

ssh <vm-ssh-user>@${TS_IP_WORKER} '
  sudo mv /tmp/certificate.pem.crt /tmp/private.pem.key /tmp/AmazonRootCA1.pem /tmp/endpoint.txt \
          /etc/aegis/iot/factory-c/
  sudo chown -R root:root /etc/aegis
  sudo chmod 700 /etc/aegis /etc/aegis/iot /etc/aegis/iot/factory-c
  sudo chmod 600 /etc/aegis/iot/factory-c/*
'
```

### factory_state publish (worker VM)

```bash
# worker VM 에 SSH 로 들어와서
sudo -i
IOT_DIR="/etc/aegis/iot/factory-c"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg ts "${TS}" \
  '{
    schema_version: "0.1.0",
    message_id: ("factory-c:factory_state:factory-c-worker:" + $ts),
    factory_id: "factory-c",
    node_id: "factory-c-worker",
    environment_type: "vm-windows",
    input_module_type: "dummy",
    source_type: "factory_state",
    source_timestamp: $ts,
    published_at: $ts,
    data_plane_instance_id: "manual-smoke-factory-c",
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

`exit=0` 이면 publish 성공.

### infra_state publish (worker VM, 두 노드 포함)

```bash
# 여전히 sudo -i 안. master / worker 의 K3s 버전을 미리 채집
# master 에 ssh 해 가져오거나 (worker VM 에 kubectl 없음), 또는 단순히 5-1 에서 기록해 둔 값을 변수에 직접 넣는다
K3S_VERSION="v1.34.6+k3s1"   # Step 5-1 에서 기록한 값으로 교체

IOT_DIR="/etc/aegis/iot/factory-c"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg ts "${TS}" \
  --arg k3s "${K3S_VERSION}" \
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
    data_plane_instance_id: "manual-smoke-factory-c",
    payload: {
      heartbeat: {
        agent_status: "alive",
        last_successful_publish_at: $ts,
        last_checkpoint_timestamp: $ts,
        publish_sequence: 1
      },
      cluster: {
        cluster_name: "factory-c",
        kubernetes_version: $k3s
      },
      nodes: [
        {
          node_id: "factory-c-master",
          role: "control-plane",
          ready: true,
          cpu_usage_percent: 8.0,
          memory_usage_percent: 30.0,
          disk_usage_percent: 22.0,
          network_reachability: "ok"
        },
        {
          node_id: "factory-c-worker",
          role: "worker",
          ready: true,
          cpu_usage_percent: 12.0,
          memory_usage_percent: 38.0,
          disk_usage_percent: 27.0,
          network_reachability: "ok"
        }
      ],
      workloads: [],
      devices: {
        bme280:     { available: false, last_seen_at: null },
        camera:     { available: false, last_seen_at: null },
        microphone: { available: false, last_seen_at: null }
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
exit   # sudo -i 종료
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

jq '{schema_version, factory_id, node_id, environment_type, input_module_type, source_type, payload_keys: (.payload|keys), nodes_len: (.payload.nodes|length // 0)}' \
  /tmp/factory-a-factory_state-sample.json /tmp/factory-a-infra_state-sample.json
```

기대 결과:

```text
factory-a factory_state: payload_keys = ["aggregation_window_seconds", "ai_result", "sensor"], nodes_len = 0
factory-a infra_state:   payload_keys = ["cluster", "devices", "heartbeat", "nodes", "workloads"], nodes_len = 3
```

factory-c 의 더미 메시지도 동일한 키 셋을 그대로 채운다. 값만 `noisy-vm` 프로파일로 흩어지고, `infra_state.payload.nodes` 길이는 factory-c 가 2-노드라 **2** 가 정상이다. `environment_type` 은 `physical-rpi` → `vm-windows`, `input_module_type` 은 `sensor` → `dummy`.

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

LATEST_C_IS="$(aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | sort | tail -1 | awk '{print $4}')"
aws s3 cp "s3://aegis-bucket-data/${LATEST_C_IS}" /tmp/factory-c-infra-sample.json
jq '{factory_id, environment_type, input_module_type, source_type, nodes_len: (.payload.nodes|length), nodes: [.payload.nodes[].node_id]}' /tmp/factory-c-infra-sample.json
```

정상 기준:

```text
raw/factory-c/factory_state/yyyy=2026/mm=05/dd=19/...json  (>= 1 객체)
raw/factory-c/infra_state/yyyy=2026/mm=05/dd=19/...json    (>= 1 객체)
factory_id == "factory-c"
environment_type == "vm-windows"
input_module_type == "dummy"
nodes_len == 2
nodes == ["factory-c-master", "factory-c-worker"]
```

빈 결과면 → 문제 해결 § "S3 `raw/factory-c` 가 비어 있음 (Step 10 이후)" 참고.

## Step 11. factory-c 가데이터 자동 발행 루프 (worker VM)

실행 위치: **Computer 3 worker VM**

Step 9 의 1회 publish 만으로는 testbed 가 의미 있는 데이터 양을 만들지 못한다. Edge Agent dummy mode (Step 14) 가 워크스트림 A 합류로 늦어지는 동안에도 factory-c → IoT → S3 경로를 검증할 수 있도록, `noisy-vm` 프로파일을 따르는 가데이터 publisher 를 systemd 로 띄운다.

publisher 는 cluster 의 worker 노드인 **worker VM 에 1개만** 띄운다 (master VM 에 두지 않는다). cluster 단위 1회 publish 면 충분하다.

Factory B/C 공통 systemd 자동화 절차와 두 factory의 가데이터 차이 비교는 `apps/dummy-sensor/docs/factory-b-c-dummy-systemd-runbook.md`도 함께 참고한다.

`factory_state`는 가데이터지만, `infra_state`는 기본적으로 실제 K3s 상태를 조회한다. worker VM에서 `kubectl get nodes -o json` 이 성공해야 `cluster_state_source="kubernetes"` 로 기록된다. 실패하면 임시 fallback으로 synthetic 상태가 들어가므로, 장애 테스트 전에는 반드시 이 값을 확인한다.

`noisy-vm` 프로파일 (`configs/runtime/runtime-config.yaml` factory-c 참고):

| 항목 | baseline | jitter | warning_threshold | critical_threshold |
| --- | --- | --- | --- | --- |
| `temperature_celsius_avg` | 27.0 | ±4.0 | 33.0 | 39.0 |
| `humidity_percent_avg` | 52.0 | ±10.0 | 72.0 | 88.0 |
| `pressure_hpa_avg` | 1012.0 | ±2.0 | - | - |
| AI anomaly probability | 0.06 | - | - | - |

전송 주기 (factory-a 와 동일):

```text
factory_state  3초
infra_state   20초
```

### 11-1. repo 코드 배치 + 환경 파일 작성

Step 11 은 더 이상 문서 안에 임시 bash publisher 를 직접 작성하지 않는다. repo 관리 코드 2개를 worker VM 에 복사해서 실행한다.

| 파일 | 역할 |
| --- | --- |
| `apps/dummy-sensor/factory_c_dummy_generator.py` | Factory A canonical JSON 과 같은 envelope 로 `factory_state`/`infra_state` 를 outbox 에 생성 |
| `apps/dummy-sensor/factory_c_iot_publisher.py` | outbox JSON 을 `aegis/{factory_id}/{source_type}` MQTT topic 으로 publish |

Computer 1 에서 worker VM 으로 코드 복사:

```bash
# Computer 1 (WSL)
scp apps/dummy-sensor/factory_c_dummy_generator.py \
    apps/dummy-sensor/factory_c_iot_publisher.py \
    apps/dummy-sensor/k8s_state.py \
    <vm-ssh-user>@${TS_IP_WORKER}:/tmp/
```

worker VM 에서 설치:

```bash
# worker VM
sudo mkdir -p /opt/aegis/dummy-sensor /etc/aegis /var/lib/aegis/outbox
sudo cp /tmp/factory_c_dummy_generator.py /tmp/factory_c_iot_publisher.py /tmp/k8s_state.py /opt/aegis/dummy-sensor/
sudo chmod 755 /opt/aegis/dummy-sensor/*.py

K3S_VER="$(/usr/local/bin/k3s --version | awk '/k3s version/ {print $3}')"
echo "${K3S_VER}"   # 예: v1.34.6+k3s1

sudo tee /etc/aegis/factory-c-dummy.env >/dev/null <<EOF
AEGIS_OUTBOX_DIR=/var/lib/aegis/outbox
AEGIS_IOT_DIR=/etc/aegis/iot/factory-c
AEGIS_IOT_CLIENT_ID=AEGIS-IoTThing-factory-c
AEGIS_K3S_VERSION=${K3S_VER}
EOF

sudo chmod 600 /etc/aegis/factory-c-dummy.env
```

> K3s 업그레이드 후에는 `AEGIS_K3S_VERSION` 값을 수동 갱신한다.

### 11-2. 1회 로컬 생성/발행 확인

먼저 JSON 생성만 확인한다.

```bash
# worker VM
/usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_dummy_generator.py --once all --no-write --pretty
```

outbox 생성 확인:

```bash
# worker VM
sudo env $(cat /etc/aegis/factory-c-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_dummy_generator.py --once all

sudo find /var/lib/aegis/outbox -maxdepth 1 -type f -name '*.json' -print
```

1회 publish 확인:

```bash
# worker VM
sudo env $(cat /etc/aegis/factory-c-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_iot_publisher.py --once
```

정상 기준:

```text
published /var/lib/aegis/outbox/...factory_state...json -> aegis/factory-c/factory_state
published /var/lib/aegis/outbox/...infra_state...json -> aegis/factory-c/infra_state
```

> **MQTT client id 충돌 주의**: 본 publisher 와 Step 14 의 Edge Agent dummy mode 는 모두 client id `AEGIS-IoTThing-factory-c` 를 쓴다. AWS IoT 는 동일 client id 의 동시 연결을 강제로 끊으므로, **Edge Agent 자동화로 넘어가기 직전에 반드시 dummy publisher 를 중단**해야 한다 (Step 14 안내 참조).

### 11-3. systemd 서비스 등록

```bash
# worker VM
sudo tee /etc/systemd/system/aegis-factory-c-dummy-generator.service >/dev/null <<'UNIT'
[Unit]
Description=Aegis factory-c dummy data generator
Wants=network-online.target
After=network-online.target k3s-agent.service

[Service]
Type=simple
EnvironmentFile=/etc/aegis/factory-c-dummy.env
ExecStart=/usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_dummy_generator.py --loop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/aegis-factory-c-dummy-publisher.service >/dev/null <<'UNIT'
[Unit]
Description=Aegis factory-c dummy IoT publisher
Wants=network-online.target
After=network-online.target tailscaled.service k3s-agent.service aegis-factory-c-dummy-generator.service

[Service]
Type=simple
EnvironmentFile=/etc/aegis/factory-c-dummy.env
ExecStart=/usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_iot_publisher.py --loop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now aegis-factory-c-dummy-generator.service
sudo systemctl enable --now aegis-factory-c-dummy-publisher.service
sudo systemctl status aegis-factory-c-dummy-generator.service --no-pager
sudo systemctl status aegis-factory-c-dummy-publisher.service --no-pager
```

정상 기준:

```text
Loaded: loaded (/etc/systemd/system/aegis-factory-c-dummy-*.service; enabled; ...)
Active: active (running)
```

### 11-4. 발행 로그 확인 (worker VM)

```bash
sudo journalctl -u aegis-factory-c-dummy-generator.service -n 30 --no-pager
sudo journalctl -u aegis-factory-c-dummy-publisher.service -n 30 --no-pager
watch -n 5 cat /var/lib/aegis/factory-c-publish-sequence
```

publisher journal 에 `published ... -> aegis/factory-c/...` 로그가 반복되고 `factory-c-publish-sequence` 가 20초마다 +1 되면 정상.

### 11-5. S3 누적 확인 (Computer 1, 가동 1~2분 후)

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive | wc -l
aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | wc -l

# 최신 infra_state 객체에서 nodes 배열 길이가 2 인지 확인
LATEST="$(aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | sort | tail -1 | awk '{print $4}')"
aws s3 cp "s3://aegis-bucket-data/${LATEST}" - | jq '.payload.nodes | map(.node_id)'
```

정상 기준 (가동 1분 후):

```text
factory_state ≈ 20개  (3초 주기 × 60초)
infra_state   ≈ 3개   (20초 주기)
.payload.nodes node_id 목록 = ["factory-c-master", "factory-c-worker"]
```

## Step 12. Tailscale IP 기반 kubeconfig 생성 + Context rename

실행 위치: **Computer 3 master VM → Computer 1 (WSL)**

cluster 단위 kubeconfig 는 master 의 kubeconfig 를 외부에서 쓸 수 있게 만든다.

### Computer 3 master VM 에서: kubeconfig 임시 사본

```bash
sudo install -m 600 -o "$USER" -g "$USER" /etc/rancher/k3s/k3s.yaml /tmp/factory-c.kubeconfig
ls -l /tmp/factory-c.kubeconfig
```

### Computer 1 에서: 받아와서 rewrite + rename

```bash
TS_IP_MASTER=<Step 4A 에서 메모한 master Tailscale IP>
mkdir -p ~/.aegis/secrets/kubeconfig

scp <vm-ssh-user>@${TS_IP_MASTER}:/tmp/factory-c.kubeconfig \
    ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig

# kubeconfig 의 server: 필드 (127.0.0.1) → master Tailscale IP 로 변경
sed -i "s|server: https://127\.0\.0\.1:6443|server: https://${TS_IP_MASTER}:6443|" \
    ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig

# K3s 기본 context 이름 'default' -> 'factory-c' 로 rename (ArgoCD 등록 시 필요)
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig \
  config rename-context default factory-c

chmod 600 ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig
```

### 검증 (Computer 1)

```bash
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig get nodes
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig config current-context
```

정상 기준:

```text
factory-c-master   Ready   control-plane,master   ...
factory-c-worker    Ready   <none>                 ...
current-context: factory-c
```

### master VM 임시 파일 정리

```bash
rm -f /tmp/factory-c.kubeconfig
```

TLS 오류가 나면 Step 5-1 에서 `--tls-san ${TS_IP_MASTER}` 가 빠진 것이다. 초기 구축 단계라면 K3s server 재설치가 가장 단순하다 — `문제 해결` 섹션 참고.

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
https://<TS_IP_MASTER>:6443     factory-c   Successful
```

장기 운영 desired state 는 ArgoCD UI 클릭이 아니라 GitOps repo 의 ApplicationSet/values 기준으로 유지한다.

## Step 14. Edge Agent dummy mode 배포 (워크스트림 A 합류 지점)

실행 위치: **Hub GitOps repo (워크스트림 A 영역)** — 본 환경(워크스트림 B, Computer 1) 단독으로는 진행 불가.

> **선결 조건**: Edge Agent 도 동일 MQTT client id (`AEGIS-IoTThing-factory-c`) 를 사용한다. 본 단계 시작 전에 **반드시 Step 11 의 dummy publisher 를 중단**한다.
>
> ```bash
> # worker VM
> sudo systemctl disable --now aegis-factory-c-dummy-generator.service
> sudo systemctl disable --now aegis-factory-c-dummy-publisher.service
> sudo systemctl status aegis-factory-c-dummy-generator.service --no-pager
> sudo systemctl status aegis-factory-c-dummy-publisher.service --no-pager
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
nodeSelector:
  aegis.input-module-type: dummy   # worker 노드에만 배치
```

배포 후 확인 (Computer 1 의 factory-c kubeconfig 또는 master VM 에서):

```bash
kubectl -n ai-apps get pods -o wide
kubectl -n ai-apps logs deploy/edge-agent --tail=100
```

정상 기준:

```text
edge-agent Pod: Running, NODE=factory-c-worker  (worker 노드 배치)
mode: dummy
factory_id: factory-c
published topic: aegis/factory-c/factory_state
published topic: aegis/factory-c/infra_state
```

ECR image pull 이 실패하면 `aegis-spoke-system/ecr-registry` imagePullSecret 갱신 상태를 워크스트림 A 측에서 확인한다.

> **Step 13 까지만 완료해도 factory-c 가 IoT Core → S3 까지 데이터를 보내는 testbed 평면은 이미 완성된 상태다** (Step 10 IoT Rule + Step 11 dummy publisher 덕분에). Step 14 는 Edge Agent 자동화로 dummy publisher 를 대체하는 단계로, 워크스트림 A 진행에 맞춰 후속 진행한다.

## Step 15. Windows 호스트 무인 운영 설정

실행 위치: **Computer 3 Windows 호스트**

이 단계는 Computer 3 가 정전/재부팅/Windows Update 후 사람 개입 없이 master VM → worker VM 까지 자동으로 올라오게 만든다.

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

대안 (로컬 계정인 경우): `netplwiz` → "사용자가 이 컴퓨터를 사용하려면 사용자 이름과 암호를 입력해야 합니다" 체크 해제.

### 15-3. VirtualBox VM 2 개 자동 시작 (Task Scheduler)

master / worker 각각 작업을 만든다. worker 작업은 master 가 먼저 떠 있도록 60초 지연을 둔다.

#### 15-3A. `Start factory-c-master VM`

1. 시작 메뉴 → "작업 스케줄러" → **기본 작업 만들기**
   - 이름: `Start factory-c-master VM`
   - 설명: `VirtualBox factory-c-master headless autostart`
2. **트리거**: "컴퓨터 시작 시"
3. **동작**: "프로그램 시작"
   - 프로그램/스크립트: `"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"`
   - 인수 추가: `startvm "factory-c-master" --type headless`
4. 마지막 화면 "[속성] 대화 상자 열기" 체크 후 **마침**
5. 속성:
   - "사용자가 로그온했는지 여부에 관계없이 실행" + "가장 높은 수준의 권한으로 실행" 둘 다 체크
   - 설정 탭 → "작업이 실패하는 경우 다시 시작 간격: 1분, 횟수: 3"

#### 15-3B. `Start factory-c-worker VM` (60초 지연)

1. 같은 절차로 작업 추가
   - 이름: `Start factory-c-worker VM`
   - 설명: `VirtualBox factory-c-worker headless autostart (after master)`
2. **트리거**: "컴퓨터 시작 시"
3. **트리거 → 고급 설정**: "지연 시간: **1분**" 체크 (60초 후 시작)
4. **동작**: "프로그램 시작"
   - 프로그램/스크립트: `"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"`
   - 인수 추가: `startvm "factory-c-worker" --type headless`
5. 속성:
   - "사용자가 로그온했는지 여부에 관계없이 실행" + "가장 높은 수준의 권한으로 실행"
   - "작업이 실패하는 경우 다시 시작: 1분, 3회"

> agent 가 server 보다 먼저 떠도 K3s agent 가 retry 하므로 결국 join 되지만, 첫 부팅 시점의 매끄러움을 위해 60초 지연이 권장된다.

#### 수동 검증

```powershell
# 두 VM 종료
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" controlvm "factory-c-worker"  poweroff
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" controlvm "factory-c-master" poweroff

# 작업 스케줄러로 master 먼저 즉시 실행
schtasks /Run /TN "Start factory-c-master VM"
Start-Sleep -Seconds 60
schtasks /Run /TN "Start factory-c-worker VM"

# VM 상태 확인
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" list runningvms
```

`factory-c-master`, `factory-c-worker` 둘 다 list 에 보이면 성공.

### 15-4. Windows Update 강제 재시작 통제

- 설정 → Windows Update → 고급 옵션 → "사용 중인 시간" 을 운영자가 자주 확인하는 시간대로 설정
- 또는 `gpedit.msc` → 컴퓨터 구성 → 관리 템플릿 → Windows 구성 요소 → Windows Update → "자동 업데이트 즉시 설치 사용 안 함"

업데이트 자체를 막을 필요는 없다. 재시작 타이밍을 운영자가 통제할 수 있는 시간대로 옮기는 것이 목적이다.

### 15-5. (권장) Tailscale Windows 클라이언트 설치

두 VM 안 Tailscale 과 별개로 Windows 호스트에도 Tailscale 을 깔아두면, VM 이 죽었을 때 호스트에 RDP 로 들어가 VirtualBox 를 직접 재시작할 수 있다.

- https://tailscale.com/download/windows 에서 설치
- 같은 Tailnet 계정으로 로그인
- 태그 (선택): `tag:aegis-operator-host`

## Step 16. 재부팅 검증

실행 위치: **Computer 3 Windows 호스트 + 두 VM + Computer 1 (WSL)**

### Computer 3 Windows 호스트 재부팅

PowerShell:

```powershell
Restart-Computer
```

또는 시작 → 전원 → 다시 시작.

### Windows 부팅 후 자동 진행 확인 (사람 개입 없이)

1. Windows 자동 로그인 완료
2. Task Scheduler `Start factory-c-master VM` 실행 → master VM 부팅 → K3s server + Tailscale active
3. (60초 후) Task Scheduler `Start factory-c-worker VM` 실행 → worker VM 부팅 → K3s agent join + Tailscale + `aegis-factory-c-dummy-generator.service` / `aegis-factory-c-dummy-publisher.service` active

### Computer 1 (WSL) 에서 외부 검증 (약 3~4분 후)

```bash
TS_IP_MASTER=<master Tailscale IP>
TS_IP_WORKER=<worker Tailscale IP>

# Tailscale 도달 확인
ping -c 3 ${TS_IP_MASTER}
ping -c 3 ${TS_IP_WORKER}

# K3s API 도달 + 두 노드 상태
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig get nodes -o wide
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig -n ai-apps get secret aws-iot-factory-c-cert
```

정상 기준:

```text
factory-c-master   Ready   control-plane,master
factory-c-worker    Ready   <none>
aws-iot-factory-c-cert   Opaque   4
```

### Computer 3 두 VM 에서 내부 검증

#### master VM

```bash
systemctl is-active k3s
systemctl is-active tailscaled
tailscale status --self
kubectl get nodes -o wide
kubectl get nodes --show-labels
```

정상:

```text
k3s: active
tailscaled: active
factory-c-master Ready
factory-c-worker  Ready
label: master 에 aegis.factory-id=factory-c, environment-type=vm-windows, spoke-type=testbed
       worker 에 위 3개 + aegis.input-module-type=dummy
```

#### worker VM

```bash
systemctl is-active k3s-agent
systemctl is-active tailscaled
systemctl is-active aegis-factory-c-dummy-generator
systemctl is-active aegis-factory-c-dummy-publisher
tailscale status --self
cat /var/lib/aegis/factory-c-publish-sequence
```

정상:

```text
k3s-agent: active
tailscaled: active
aegis-factory-c-dummy-generator: active
aegis-factory-c-dummy-publisher: active
factory-c-publish-sequence: 재부팅 전 값보다 증가
```

### S3 적재 누적 확인 (Computer 1, 재부팅 후 1~2분)

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive | wc -l
aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | wc -l
```

재부팅 시각 이후 신규 객체가 추가되면 dummy publisher + IoT Rule + S3 경로가 무인 부팅 후에도 정상 동작하는 것이다.

## 최종 검증 체크리스트

### Computer 1 (작업 PC)

- [ ] AWS CLI MFA 세션 활성 / OTP 입력 가능
- [ ] `argocd` CLI 로 Hub 로그인 완료
- [ ] `secret/iot/factory-c/` 산출물 존재
- [ ] factory-a S3 raw 객체 1건 다운로드 및 envelope 확인 (Step 10-1)
- [ ] IoT Rule `AEGIS_IoTRule_factory_c_raw_s3` + IAM Role `AEGIS-IAMRole-IoTRule-S3-factory-c` 생성됨 (Step 10-2)
- [ ] `~/.aegis/secrets/kubeconfig/factory-c.kubeconfig` 존재 + context 이름 `factory-c`
- [ ] `argocd cluster list` 에 `factory-c` Successful (master API)

### Computer 3 Windows 호스트

- [ ] VirtualBox 설치
- [ ] VM `factory-c-master` (2 vCPU / 2 GiB / 20 GiB) 생성
- [ ] VM `factory-c-worker`  (2 vCPU / 4 GiB / 40 GiB) 생성
- [ ] 절전/슬립 영구 OFF
- [ ] Windows 자동 로그인 enabled
- [ ] Task Scheduler `Start factory-c-master VM` 등록 + 검증 완료
- [ ] Task Scheduler `Start factory-c-worker VM` 등록 (60초 지연) + 검증 완료
- [ ] Windows 재부팅 후 사람 개입 없이 두 VM 부팅까지 자동 완료
- [ ] (권장) Tailscale Windows 클라이언트 연결

### Computer 3 master VM (factory-c-master)

- [ ] hostname `factory-c-master`
- [ ] SSH 접속 가능
- [ ] Tailscale connected (`tag:aegis-spoke-testbed`, `tag:factory-c`)
- [ ] K3s server 설치 + node Ready (`--tls-san` 포함)
- [ ] cluster token 추출 후 안전하게 처리 (문서/Git 금지)
- [ ] node label 3종 (`aegis.factory-id`, `environment-type`, `spoke-type`) — `input-module-type` 미부착
- [ ] control-plane taint 유지 (`NoSchedule`)
- [ ] IoT Thing `AEGIS-IoTThing-factory-c` 생성 (Computer 1 에서)
- [ ] K3s Secret `ai-apps/aws-iot-factory-c-cert` 생성됨 (Step 8)

### Computer 3 worker VM (factory-c-worker)

- [ ] hostname `factory-c-worker`
- [ ] SSH 접속 가능
- [ ] Tailscale connected (같은 태그)
- [ ] K3s agent join 성공 → `kubectl get nodes` 에 Ready
- [ ] node label 4종 (`aegis.factory-id`, `environment-type`, `input-module-type=dummy`, `spoke-type`) 부착
- [ ] `/etc/aegis/iot/factory-c/` 인증서 600 권한 복사
- [ ] `/opt/aegis/dummy-sensor/factory_c_dummy_generator.py` 배포 + 755 권한
- [ ] `/opt/aegis/dummy-sensor/factory_c_iot_publisher.py` 배포 + 755 권한
- [ ] `/etc/aegis/factory-c-dummy.env` `AEGIS_K3S_VERSION` 기록
- [ ] systemd `aegis-factory-c-dummy-generator.service` enabled + active(running)
- [ ] systemd `aegis-factory-c-dummy-publisher.service` enabled + active(running)
- [ ] `/var/lib/aegis/factory-c-publish-sequence` 가 20초마다 증가
- [ ] `aegis/factory-c/factory_state` 1회 publish 성공 (`exit=0`)
- [ ] `aegis/factory-c/infra_state` 1회 publish 성공 (`exit=0`) — nodes 배열 길이 2

### IoT / S3 적재 (Step 10, 11 완료 후)

- [ ] `aws iot get-topic-rule --rule-name AEGIS_IoTRule_factory_c_raw_s3` 성공 + SQL 일치
- [ ] `aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/` 가동 1분 후 약 20개
- [ ] `aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/` 가동 1분 후 약 3개
- [ ] 적재된 객체 envelope: `factory_id=factory-c`, `environment_type=vm-windows`, `input_module_type=dummy`
- [ ] `infra_state.payload.nodes` 길이 == 2, node_id = `factory-c-master`, `factory-c-worker`
- [ ] factory-a S3 적재가 회귀 없이 계속 진행 (factory-a Rule 미수정 확인)

### 운영

- [ ] 민감 정보 (OTP, Auth Key, K3s token, private key, kubeconfig token) 가 문서/Git 에 남지 않음
- [ ] Computer 3 가 24시간 켜진 상태에서 안정 동작
- [ ] ADR `docs/changes/0018-iot-rule-extend-to-factory-c.md` 반영 완료
- [ ] ADR `docs/changes/0019-factory-c-master-worker-cluster.md` 반영 완료
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

- SSH 키 미등록 → `ssh-copy-id <user>@${TS_IP_MASTER}` 1회 실행 (대상은 master VM)
- VM 의 sshd 미동작 → master VM 에서 `sudo systemctl status ssh` 확인
- 방화벽/NAT → Tailscale IP 사용으로 우회

### `register-k3s-secret.sh` 가 `kubectl: command not found` 로 실패

증상: SSH 는 되지만 원격 `kubectl` 실행 단계에서 실패.

원인: 비-interactive SSH 의 PATH 에 `/usr/local/bin` 미포함. **대상은 master VM**.

해결: master VM 의 `~/.bashrc` 또는 `~/.profile` 맨 위에 `export PATH="$PATH:/usr/local/bin"` 추가.

### worker 가 master 에 join 못함 (Step 5-2 / 5-3)

증상: master 의 `kubectl get nodes` 에 `factory-c-worker` 가 안 보임 또는 NotReady.

원인 후보:

- worker VM 의 `k3s-agent.service` 미동작 → `sudo systemctl status k3s-agent --no-pager` / `journalctl -u k3s-agent -n 100`
- worker → master Tailscale 도달 실패 → worker VM 에서 `curl -k https://${TS_IP_MASTER}:6443/healthz` 결과 확인 (정상이면 `ok`)
- `K3S_TOKEN` 오타 → `sudo cat /var/lib/rancher/k3s/agent/server-token` 으로 agent 가 사용 중인 token 확인 (있는 경우)
- `--node-ip` 누락 → worker (K3s agent) 가 NAT 내부 IP 로 광고되어 클러스터 통신 깨짐. install 명령에 `--node-ip ${TS_IP_WORKER}` 가 포함되었는지 확인
- worker 재설치 절차:

  ```bash
  # worker VM 에서
  sudo /usr/local/bin/k3s-agent-uninstall.sh
  # 그 후 Step 5-2 다시 수행
  ```

### `argocd cluster add factory-c` 가 context not found 로 실패

증상: `the cluster 'factory-c' is not in your kubeconfig contexts`.

원인: Step 12 의 context rename 누락.

해결:

```bash
kubectl --kubeconfig ~/.aegis/secrets/kubeconfig/factory-c.kubeconfig \
  config rename-context default factory-c
```

### 외부 kubeconfig TLS 오류 (`x509: certificate is valid for ...`)

원인: Step 5-1 K3s server 설치 시 `--tls-san ${TS_IP_MASTER}` 누락.

초기 구축 단계 해결:

```bash
# master VM 에서
sudo /usr/local/bin/k3s-uninstall.sh
TS_IP_MASTER="$(tailscale ip -4)"
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --node-name factory-c-master --tls-san ${TS_IP_MASTER}" sh -

mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config

# master 재설치 후에는 worker 의 token 도 갱신되므로 worker 도 재설치
# (worker VM 에서)  sudo /usr/local/bin/k3s-agent-uninstall.sh  → Step 5-2 재실행
# 그 후 Step 12 처음부터 다시 수행
```

운영 데이터가 생긴 뒤에는 재설치하지 말고 별도 유지보수 절차를 잡는다.

### IoT publish 인증 실패

확인 항목:

- `/etc/aegis/iot/factory-c/endpoint.txt` 가 현재 IoT endpoint 인지 (region 변경 시 갱신 필요)
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
| `mosquitto_pub` network 오류 | worker VM 인터넷, DNS, 방화벽 확인 |
| IoT Rule 자체가 없음 | Step 10-2 의 `create-topic-rule` 누락. ADR 0018 절차 재실행 |

### factory-c dummy publisher 가 자주 재시작 (worker VM)

증상: `journalctl -u aegis-factory-c-dummy-publisher` 에 publish 오류가 반복.

원인 후보:

- 인증서 경로/권한 → `/etc/aegis/iot/factory-c/` 600 권한, `endpoint.txt` 내용 확인
- `EnvironmentFile=/etc/aegis/factory-c-dummy.env` 누락 또는 `AEGIS_K3S_VERSION` 미설정 → `cat /etc/aegis/factory-c-dummy.env`
- IoT Core 가 같은 client id 의 다른 연결을 끊는 중 → Step 14 Edge Agent 가 떠 있는지 확인. 동시 사용 금지

### Edge Agent 와 dummy publisher 가 충돌 (Step 14 전환 직후)

증상: IoT Core 가 client id 충돌로 양쪽 연결을 번갈아 끊어 둘 다 데이터가 띄엄띄엄 들어옴.

원인: Step 14 의 dummy publisher 중단 누락 (worker VM).

해결:

```bash
# worker VM
sudo systemctl disable --now aegis-factory-c-dummy-generator.service
sudo systemctl disable --now aegis-factory-c-dummy-publisher.service
sudo systemctl status aegis-factory-c-dummy-generator.service --no-pager   # inactive (dead)
sudo systemctl status aegis-factory-c-dummy-publisher.service --no-pager   # inactive (dead)
```

이후 Edge Agent Pod log 에서 publish 가 안정화되는지 확인.

### VM 인터넷 접근 실패 (두 VM 어느 쪽이든)

```bash
ip route
resolvectl status
curl -I https://get.k3s.io
```

- VirtualBox 네트워크가 NAT 또는 Bridged 인지 확인 (Host-only 면 인터넷 불가)
- DNS 응답 확인
- 호스트 측 방화벽/보안 제품 차단 여부 확인

### Windows 재부팅 후 VM 이 자동 시작되지 않음

확인 순서:

1. 작업 스케줄러 `Start factory-c-master VM` 및 `Start factory-c-worker VM` 둘 다 "준비" 상태인지 (마지막 실행 결과 코드 0)
2. "사용자가 로그온했는지 여부에 관계없이 실행" 체크 여부
3. 작업의 사용자 계정이 Windows 자동 로그인 계정과 동일한지
4. `VBoxManage.exe` 절대 경로가 정확한지 (`C:\Program Files\Oracle\VirtualBox\VBoxManage.exe`)
5. worker 작업의 트리거 지연 1분 설정 여부
6. 수동 실행: PowerShell 관리자로 master → 60초 → worker 순서로 `schtasks /Run /TN ...` 후 `VBoxManage list runningvms`

### VM 시작은 됐지만 K3s/Tailscale/publisher 가 올라오지 않음

각 VM 안에서:

```bash
systemctl status k3s --no-pager           # master VM
systemctl status k3s-agent --no-pager     # worker VM
systemctl status tailscaled --no-pager
systemctl status aegis-factory-c-dummy-generator --no-pager   # worker VM
systemctl status aegis-factory-c-dummy-publisher --no-pager   # worker VM
journalctl -u k3s -n 100 --no-pager
journalctl -u k3s-agent -n 100 --no-pager
journalctl -u aegis-factory-c-dummy-generator -n 100 --no-pager
journalctl -u aegis-factory-c-dummy-publisher -n 100 --no-pager
```

- K3s 실패는 대부분 디스크 공간/메모리 부족 또는 네트워크 문제
- Tailscale 실패는 Auth Key 만료 (Reusable 인 경우 이미 등록된 상태이므로 재인증 불필요). 재설치한 경우만 `sudo tailscale up --authkey=... --hostname=factory-c-<master|worker>` 로 재참여
- publisher 실패는 위 § "factory-c dummy publisher 가 자주 재시작" 항목 참고
