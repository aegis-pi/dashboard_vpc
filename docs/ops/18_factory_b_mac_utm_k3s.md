# Factory B Mac UTM K3s Runbook

상태: draft
기준일: 2026-05-20

## 수정 이력

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-05-20 | v2 | Mac UTM `factory-b` VM에서 사용하는 가데이터 generator/publisher 절차 추가. `stable-lab` 프로파일, single-node `factory-b`, `data_plane_instance_id`, outbox → MQTT publish 구조 반영 |
| 2026-05-06 | v1 | 초안 |

## 목적

Mac mini에서 UTM 기반 Linux VM을 만들고 `factory-b` 테스트베드형 Spoke K3s를 구성한다.

이 문서는 `docs/issues/M5_vm-spoke-expansion.md`의 Issue 1 실행 사전이다. 목표는 Hub/ArgoCD 연결 전, 독립 VM 안에서 `factory-b` 단일 노드 K3s가 재부팅 후에도 `Ready` 상태로 복구되는 기준선을 만드는 것이다.

## 범위

포함:

- UTM VM 생성 기준
- Ubuntu Server 또는 Debian 계열 guest OS 설치 기준
- K3s 단일 노드 설치
- `factory-b` hostname, label, 환경 기준 적용
- kubeconfig 확인
- VM 재부팅 후 K3s 자동 복구 확인

제외:

- Longhorn
- NFS 또는 cold storage
- 실센서, 카메라, 마이크 의존 구성
- 운영형 failover/failback 구성
- ArgoCD cluster 등록
- 운영형 Edge Agent 배포

## 권장 VM 기준

| 항목 | 값 |
| --- | --- |
| VM 이름 | `factory-b` |
| Host | Mac mini |
| VM tool | UTM |
| Guest OS | Ubuntu Server LTS 또는 Debian stable |
| CPU | 2 vCPU |
| Memory | 4GiB |
| Disk | 40GiB |
| Network | UTM Shared Network 또는 Bridged |
| Kubernetes | K3s single-node |

초기 로컬 검증은 UTM Shared Network로 충분하다. Hub EKS, ArgoCD, Tailscale 연결 단계에서는 Tailscale IP를 K3s API endpoint 기준으로 사용한다.

## UTM VM 생성

1. UTM에서 새 Virtual Machine을 만든다.
2. Virtualize를 선택한다.
3. Linux를 선택한다.
4. Ubuntu Server LTS 또는 Debian ISO를 지정한다.
5. CPU 2개, memory 4096MiB, disk 40GiB로 만든다.
6. Network는 우선 Shared Network로 둔다.
7. VM 이름은 `factory-b`로 둔다.

Guest OS 설치 중 사용자는 아래 기준을 적용한다.

```text
hostname: factory-b
user: 운영자가 정한 일반 사용자
ssh: enabled
```

비밀번호, SSH private key, token은 문서에 기록하지 않는다.

## Guest OS 기본 확인

VM 내부에서 실행한다.

```bash
hostnamectl
ip addr
systemctl status ssh
```

필요하면 hostname을 고정한다.

```bash
sudo hostnamectl set-hostname factory-b
```

기본 패키지를 갱신한다.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl ca-certificates
```

## K3s 설치

단일 노드 K3s로 설치한다.

```bash
curl -sfL https://get.k3s.io | sh -
```

설치 후 상태를 확인한다.

```bash
sudo systemctl status k3s
sudo kubectl get nodes -o wide
sudo kubectl get pods -A
```

일반 사용자로 `kubectl`을 실행하려면 kubeconfig를 복사한다.

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
chmod 600 ~/.kube/config
kubectl get nodes -o wide
```

## Factory B 기준 적용

노드 이름을 확인한다.

```bash
kubectl get nodes
```

노드가 `factory-b`로 보이면 아래 label을 적용한다.

```bash
kubectl label node factory-b aegis.factory-id=factory-b --overwrite
kubectl label node factory-b aegis.environment-type=vm-mac --overwrite
kubectl label node factory-b aegis.input-module-type=dummy --overwrite
kubectl label node factory-b aegis.spoke-type=testbed --overwrite
```

label을 확인한다.

```bash
kubectl get node factory-b --show-labels
```

`factory-b`의 환경 기준은 아래 값으로 고정한다.

```text
factory_id: factory-b
environment_type: vm-mac
input_module_type: dummy
spoke_type: testbed
```

## Kubeconfig 보관 기준

Hub 연결 전에는 VM 내부 kubeconfig만 확인한다.

후속 Tailscale 연결 후 외부에서 사용할 kubeconfig는 별도 파일로 만든다.

```text
factory-b.kubeconfig
server: https://<factory-b-tailscale-ip>:6443
```

`factory-b.kubeconfig`에는 인증 정보가 포함될 수 있으므로 repository에 커밋하지 않는다.

## 재부팅 검증

VM을 재부팅한다.

```bash
sudo reboot
```

재접속 후 확인한다.

```bash
systemctl is-active k3s
kubectl get nodes -o wide
kubectl get pods -A
kubectl get node factory-b --show-labels
```

정상 기준:

```text
k3s: active
factory-b node: Ready
aegis.factory-id=factory-b
aegis.environment-type=vm-mac
aegis.input-module-type=dummy
aegis.spoke-type=testbed
```

## Factory B 가데이터 자동 발행 루프

실행 위치: **factory-b VM**

`factory-b`는 Mac UTM 단일 노드 K3s testbed다. 실제 센서 대신 `stable-lab` 프로파일의 가데이터를 AWS IoT Core로 보낸다.

Factory C와 같은 코드 구조를 사용하지만 데이터 특성은 다르게 둔다.

상세 systemd 자동화 절차와 Factory B/C 차이 비교는 `apps/dummy-sensor/docs/factory-b-c-dummy-systemd-runbook.md`도 함께 참고한다.

`factory_state`는 가데이터지만, `infra_state`는 기본적으로 실제 K3s 상태를 조회한다. `kubectl get nodes -o json` 이 VM에서 성공해야 `cluster_state_source="kubernetes"` 로 기록된다. 실패하면 임시 fallback으로 synthetic 상태가 들어가므로, 장애 테스트 전에는 반드시 이 값을 확인한다.

| 항목 | factory-b | factory-c |
| --- | --- | --- |
| Host | Mac UTM | Windows VirtualBox |
| profile | `stable-lab` | `noisy-vm` |
| topology | single-node `factory-b` | master + worker |
| temperature baseline / jitter | 24.5 / ±3.0 | 27.0 / ±4.0 |
| humidity baseline / jitter | 45.0 / ±8.0 | 52.0 / ±10.0 |
| anomaly probability | 0.03 | 0.06 |

전송 주기:

```text
factory_state  3초
infra_state   20초
```

### 코드 배치 + 환경 파일 작성

Computer 1 에서 factory-b VM 으로 코드 복사:

```bash
# Computer 1 (WSL 또는 작업 PC)
scp apps/dummy-sensor/factory_b_dummy_generator.py \
    apps/dummy-sensor/factory_b_iot_publisher.py \
    apps/dummy-sensor/k8s_state.py \
    <vm-ssh-user>@<factory-b-ip>:/tmp/
```

factory-b VM 에서 설치:

```bash
sudo mkdir -p /opt/aegis/dummy-sensor /etc/aegis /var/lib/aegis/outbox
sudo cp /tmp/factory_b_dummy_generator.py /tmp/factory_b_iot_publisher.py /tmp/k8s_state.py /opt/aegis/dummy-sensor/
sudo chmod 755 /opt/aegis/dummy-sensor/*.py

K3S_VER="$(/usr/local/bin/k3s --version | awk '/k3s version/ {print $3}')"
echo "${K3S_VER}"

sudo tee /etc/aegis/factory-b-dummy.env >/dev/null <<EOF
AEGIS_OUTBOX_DIR=/var/lib/aegis/outbox
AEGIS_IOT_DIR=/etc/aegis/iot/factory-b
AEGIS_IOT_CLIENT_ID=AEGIS-IoTThing-factory-b
AEGIS_K3S_VERSION=${K3S_VER}
EOF

sudo chmod 600 /etc/aegis/factory-b-dummy.env
```

> IoT 인증서 파일은 `/etc/aegis/iot/factory-b/` 아래에 둔다. `endpoint.txt`, `AmazonRootCA1.pem`, `certificate.pem.crt`, `private.pem.key` 가 필요하다. private key 원문은 문서에 기록하지 않는다.

### 1회 생성/발행 확인

```bash
/usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_dummy_generator.py --once all --no-write --pretty
```

outbox 생성:

```bash
sudo env $(cat /etc/aegis/factory-b-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_dummy_generator.py --once all

sudo find /var/lib/aegis/outbox -maxdepth 1 -type f -name '*.json' -print
```

1회 publish:

```bash
sudo env $(cat /etc/aegis/factory-b-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_iot_publisher.py --once
```

정상 기준:

```text
published /var/lib/aegis/outbox/...factory_state...json -> aegis/factory-b/factory_state
published /var/lib/aegis/outbox/...infra_state...json -> aegis/factory-b/infra_state
```

### systemd 서비스 등록

```bash
sudo tee /etc/systemd/system/aegis-factory-b-dummy-generator.service >/dev/null <<'UNIT'
[Unit]
Description=Aegis factory-b dummy data generator
Wants=network-online.target
After=network-online.target k3s.service

[Service]
Type=simple
EnvironmentFile=/etc/aegis/factory-b-dummy.env
ExecStart=/usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_dummy_generator.py --loop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/aegis-factory-b-dummy-publisher.service >/dev/null <<'UNIT'
[Unit]
Description=Aegis factory-b dummy IoT publisher
Wants=network-online.target
After=network-online.target tailscaled.service k3s.service aegis-factory-b-dummy-generator.service

[Service]
Type=simple
EnvironmentFile=/etc/aegis/factory-b-dummy.env
ExecStart=/usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_iot_publisher.py --loop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now aegis-factory-b-dummy-generator.service
sudo systemctl enable --now aegis-factory-b-dummy-publisher.service
sudo systemctl status aegis-factory-b-dummy-generator.service --no-pager
sudo systemctl status aegis-factory-b-dummy-publisher.service --no-pager
```

발행 로그:

```bash
sudo journalctl -u aegis-factory-b-dummy-generator.service -n 30 --no-pager
sudo journalctl -u aegis-factory-b-dummy-publisher.service -n 30 --no-pager
watch -n 5 cat /var/lib/aegis/factory-b-publish-sequence
```

### S3 적재 확인

실행 위치: **Computer 1**

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-b/factory_state/ --recursive | tail
aws s3 ls s3://aegis-bucket-data/raw/factory-b/infra_state/ --recursive | tail

LATEST="$(aws s3 ls s3://aegis-bucket-data/raw/factory-b/infra_state/ --recursive | sort | tail -1 | awk '{print $4}')"
aws s3 cp "s3://aegis-bucket-data/${LATEST}" - | jq '.payload.nodes | map(.node_id)'
```

정상 기준:

```text
factory_state 는 3초마다 증가
infra_state 는 20초마다 증가
.payload.nodes node_id 목록 = ["factory-b"]
```

## 후속 TODO

- Tailscale 설치 및 `factory-b` auth key로 tailnet 참여
- Tailscale IP 기준 kubeconfig 생성
- EKS Hub 또는 운영자 로컬에서 `factory-b.kubeconfig`로 `kubectl get nodes` 확인
- ArgoCD에 `factory-b` cluster 등록
- `envs/factory-b/values.yaml` 작성
- Dummy Sensor를 GitOps 배포 방식으로 전환

## 완료 체크리스트

- [ ] UTM VM `factory-b` 생성
- [ ] Guest OS 설치 및 SSH 활성화
- [ ] K3s single-node 설치
- [ ] `kubectl get nodes`에서 `factory-b` Ready 확인
- [ ] K3s version 기록
- [ ] `factory-b` label 적용
- [ ] `/opt/aegis/dummy-sensor/factory_b_dummy_generator.py` 배포
- [ ] `/opt/aegis/dummy-sensor/factory_b_iot_publisher.py` 배포
- [ ] systemd `aegis-factory-b-dummy-generator.service` enabled + active
- [ ] systemd `aegis-factory-b-dummy-publisher.service` enabled + active
- [ ] `aegis/factory-b/factory_state` publish 성공
- [ ] `aegis/factory-b/infra_state` publish 성공
- [ ] S3 `raw/factory-b/factory_state/`, `raw/factory-b/infra_state/` 적재 확인
- [ ] VM 재부팅 후 K3s 자동 복구 확인
- [ ] 민감 정보가 문서와 repository에 남지 않았는지 확인
