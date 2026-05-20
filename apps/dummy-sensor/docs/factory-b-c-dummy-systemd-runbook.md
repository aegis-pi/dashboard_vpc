# Factory B/C Dummy Data systemd Runbook

상태: draft
기준일: 2026-05-20

## 목적

`factory-b` Mac UTM VM과 `factory-c` Windows VirtualBox VM에서 실제 공장 센서가 있는 것처럼 가데이터를 계속 생성하고 AWS IoT Core로 전송한다.

구조는 Factory A 최신 data-plane 구현과 같은 경계를 따른다.

```text
dummy generator
  -> 3초마다 factory_state JSON 생성
  -> 20초마다 실제 K3s 상태를 조회해 infra_state JSON 생성
  -> /var/lib/aegis/outbox/*.json 저장

dummy IoT publisher
  -> outbox JSON scan
  -> AWS IoT Core MQTT publish
  -> 성공한 파일 삭제

AWS IoT Rule
  -> S3 raw/{factory_id}/{source_type}/yyyy=.../{message_id}.json
```

## 파일 역할

| 파일 | Factory | 역할 |
| --- | --- | --- |
| `apps/dummy-sensor/factory_b_dummy_generator.py` | factory-b | `stable-lab` canonical JSON 생성 |
| `apps/dummy-sensor/factory_b_iot_publisher.py` | factory-b | outbox → `aegis/factory-b/{source_type}` publish |
| `apps/dummy-sensor/factory_c_dummy_generator.py` | factory-c | `noisy-vm` canonical JSON 생성 |
| `apps/dummy-sensor/factory_c_iot_publisher.py` | factory-c | outbox → `aegis/factory-c/{source_type}` publish |

## 전제 조건

각 VM에 아래 파일이 있어야 한다.

```text
/etc/aegis/iot/<factory-id>/endpoint.txt
/etc/aegis/iot/<factory-id>/AmazonRootCA1.pem
/etc/aegis/iot/<factory-id>/certificate.pem.crt
/etc/aegis/iot/<factory-id>/private.pem.key
```

주의:

- private key, certificate 원문은 git이나 문서에 기록하지 않는다.
- Factory B와 Factory C는 서로 다른 IoT Thing/client id를 사용한다.
- 같은 factory 안에서 같은 MQTT client id를 쓰는 프로세스를 동시에 두 개 띄우지 않는다.

## Factory B와 C 차이

두 factory는 같은 envelope와 publish 경로를 쓰지만 profile과 topology가 다르다. `factory_state`는 가데이터이고, `infra_state`는 기본적으로 실제 K3s 상태를 읽는다.

| 항목 | Factory B | Factory C |
| --- | --- | --- |
| 실행 위치 | Mac UTM `factory-b` VM | Windows VirtualBox `factory-c-worker` VM |
| Factory ID | `factory-b` | `factory-c` |
| environment_type | `vm-mac` | `vm-windows` |
| IoT client id | `AEGIS-IoTThing-factory-b` | `AEGIS-IoTThing-factory-c` |
| MQTT topic | `aegis/factory-b/factory_state`, `aegis/factory-b/infra_state` | `aegis/factory-c/factory_state`, `aegis/factory-c/infra_state` |
| S3 raw prefix | `raw/factory-b/...` | `raw/factory-c/...` |
| profile | `stable-lab` | `noisy-vm` |
| topology | single-node | master + worker |
| nodes 배열 | `["factory-b"]` | `["factory-c-master", "factory-c-worker"]` |
| factory_state node_id | `factory-b` | `factory-c-worker` |
| temperature baseline/jitter | `24.5 ± 3.0` | `27.0 ± 4.0` |
| humidity baseline/jitter | `45.0 ± 8.0` | `52.0 ± 10.0` |
| pressure baseline/jitter | `1013.5 ± 1.5` | `1012.0 ± 2.0` |
| anomaly probability | `0.03` | `0.06` |
| abnormal_sound label | `brief lab impact` | `intermittent vibration` |
| sequence file | `/var/lib/aegis/factory-b-publish-sequence` | `/var/lib/aegis/factory-c-publish-sequence` |
| infra_state 기본 모드 | 실제 K3s 조회 | 실제 K3s 조회 |

이 차이 때문에 Dashboard나 S3 raw에서 두 testbed가 같은 데이터를 반복 송신하는 것처럼 보이지 않는다.

## infra_state 실제 조회 기준

generator는 `AEGIS_CLUSTER_STATE_MODE=auto` 기본값에서 아래 순서로 실제 K3s 상태를 읽는다.

1. K3s Pod 안에서 실행 중이면 ServiceAccount token으로 Kubernetes API 조회
2. VM systemd 실행이면 `kubectl` CLI로 조회
3. 조회 실패 시에만 synthetic fallback 사용

systemd 방식에서는 VM에 `kubectl`이 동작해야 한다.

Factory B는 단일 노드 server VM이므로 일반적으로 아래 kubeconfig가 이미 있다.

```bash
kubectl get nodes -o wide
kubectl get pods -A
```

Factory C는 publisher가 worker VM에서 실행되므로 worker VM에 `kubectl`과 kubeconfig를 준비해야 한다. K3s agent VM에 `kubectl` 명령이 없다면 먼저 symlink를 만든다.

```bash
# factory-c-worker VM
sudo ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl
kubectl version --client=true
```

가장 단순한 kubeconfig 준비 방식은 master VM의 `/etc/rancher/k3s/k3s.yaml`을 worker VM으로 안전하게 복사하고 server 주소를 master Tailscale IP 또는 reachable IP로 바꾸는 것이다.

```bash
# factory-c-worker VM 예시
mkdir -p ~/.kube
chmod 700 ~/.kube
# master VM에서 받은 kubeconfig를 ~/.kube/config 로 둔다
chmod 600 ~/.kube/config
kubectl get nodes -o wide
kubectl get pods -A
```

systemd에서 특정 kubeconfig를 쓰려면 env 파일에 추가한다.

```bash
KUBECONFIG=/home/<vm-ssh-user>/.kube/config
```

조회에 성공하면 `infra_state.payload.heartbeat.cluster_state_source` 값이 `kubernetes`가 된다. 실패해서 fallback하면 `synthetic`이 된다.

## 공통 배치 순서

Computer 1에서 대상 VM으로 파일을 복사한다.

Factory B:

```bash
scp apps/dummy-sensor/factory_b_dummy_generator.py \
    apps/dummy-sensor/factory_b_iot_publisher.py \
    apps/dummy-sensor/k8s_state.py \
    <vm-ssh-user>@<factory-b-ip>:/tmp/
```

Factory C:

```bash
scp apps/dummy-sensor/factory_c_dummy_generator.py \
    apps/dummy-sensor/factory_c_iot_publisher.py \
    apps/dummy-sensor/k8s_state.py \
    <vm-ssh-user>@${TS_IP_WORKER}:/tmp/
```

## Factory B 설치

실행 위치: **factory-b VM**

```bash
sudo mkdir -p /opt/aegis/dummy-sensor /etc/aegis /var/lib/aegis/outbox
sudo cp /tmp/factory_b_dummy_generator.py /tmp/factory_b_iot_publisher.py /tmp/k8s_state.py /opt/aegis/dummy-sensor/
sudo chmod 755 /opt/aegis/dummy-sensor/*.py

K3S_VER="$(/usr/local/bin/k3s --version | awk '/k3s version/ {print $3}')"

sudo tee /etc/aegis/factory-b-dummy.env >/dev/null <<EOF
AEGIS_OUTBOX_DIR=/var/lib/aegis/outbox
AEGIS_IOT_DIR=/etc/aegis/iot/factory-b
AEGIS_IOT_CLIENT_ID=AEGIS-IoTThing-factory-b
AEGIS_K3S_VERSION=${K3S_VER}
AEGIS_CLUSTER_STATE_MODE=auto
EOF

sudo chmod 600 /etc/aegis/factory-b-dummy.env
```

## Factory C 설치

실행 위치: **factory-c-worker VM**

```bash
sudo mkdir -p /opt/aegis/dummy-sensor /etc/aegis /var/lib/aegis/outbox
sudo cp /tmp/factory_c_dummy_generator.py /tmp/factory_c_iot_publisher.py /tmp/k8s_state.py /opt/aegis/dummy-sensor/
sudo chmod 755 /opt/aegis/dummy-sensor/*.py

K3S_VER="$(/usr/local/bin/k3s --version | awk '/k3s version/ {print $3}')"

sudo tee /etc/aegis/factory-c-dummy.env >/dev/null <<EOF
AEGIS_OUTBOX_DIR=/var/lib/aegis/outbox
AEGIS_IOT_DIR=/etc/aegis/iot/factory-c
AEGIS_IOT_CLIENT_ID=AEGIS-IoTThing-factory-c
AEGIS_K3S_VERSION=${K3S_VER}
AEGIS_CLUSTER_STATE_MODE=auto
EOF

sudo chmod 600 /etc/aegis/factory-c-dummy.env
```

## 1회 동작 확인

Factory B:

```bash
/usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_dummy_generator.py --once all --no-write --pretty

sudo env $(cat /etc/aegis/factory-b-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_dummy_generator.py --once all

sudo env $(cat /etc/aegis/factory-b-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_iot_publisher.py --once
```

Factory C:

```bash
/usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_dummy_generator.py --once all --no-write --pretty

sudo env $(cat /etc/aegis/factory-c-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_dummy_generator.py --once all

sudo env $(cat /etc/aegis/factory-c-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_iot_publisher.py --once
```

정상 기준:

```text
published /var/lib/aegis/outbox/...factory_state...json -> aegis/<factory-id>/factory_state
published /var/lib/aegis/outbox/...infra_state...json -> aegis/<factory-id>/infra_state
```

`infra_state`가 실제 K3s를 읽는지 확인:

```bash
sudo env $(cat /etc/aegis/factory-b-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_b_dummy_generator.py --once infra_state --no-write --pretty \
  | jq '.payload.heartbeat.cluster_state_source, .payload.nodes, .payload.workloads'

sudo env $(cat /etc/aegis/factory-c-dummy.env | xargs) \
  /usr/bin/python3 /opt/aegis/dummy-sensor/factory_c_dummy_generator.py --once infra_state --no-write --pretty \
  | jq '.payload.heartbeat.cluster_state_source, .payload.nodes, .payload.workloads'
```

정상 기준은 `"kubernetes"`다. `"synthetic"`이면 `kubectl get nodes -o json`이 해당 VM에서 성공하는지 먼저 확인한다.

## systemd 등록

### Factory B

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
```

### Factory C

```bash
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
```

## 상태 확인

Factory B:

```bash
systemctl is-active aegis-factory-b-dummy-generator
systemctl is-active aegis-factory-b-dummy-publisher
sudo journalctl -u aegis-factory-b-dummy-publisher -n 30 --no-pager
cat /var/lib/aegis/factory-b-publish-sequence
```

Factory C:

```bash
systemctl is-active aegis-factory-c-dummy-generator
systemctl is-active aegis-factory-c-dummy-publisher
sudo journalctl -u aegis-factory-c-dummy-publisher -n 30 --no-pager
cat /var/lib/aegis/factory-c-publish-sequence
```

정상 기준:

```text
generator: active
publisher: active
publisher journal: published ... -> aegis/<factory-id>/...
sequence file: 20초마다 증가
```

## S3 확인

Computer 1에서 확인한다.

Factory B:

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-b/factory_state/ --recursive | tail
aws s3 ls s3://aegis-bucket-data/raw/factory-b/infra_state/ --recursive | tail
```

Factory C:

```bash
aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/ --recursive | tail
aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | tail
```

nodes 배열 확인:

```bash
LATEST_B="$(aws s3 ls s3://aegis-bucket-data/raw/factory-b/infra_state/ --recursive | sort | tail -1 | awk '{print $4}')"
aws s3 cp "s3://aegis-bucket-data/${LATEST_B}" - | jq '.payload.nodes | map(.node_id)'

LATEST_C="$(aws s3 ls s3://aegis-bucket-data/raw/factory-c/infra_state/ --recursive | sort | tail -1 | awk '{print $4}')"
aws s3 cp "s3://aegis-bucket-data/${LATEST_C}" - | jq '.payload.nodes | map(.node_id)'
```

정상 기준:

```text
factory-b nodes = ["factory-b"]
factory-c nodes = ["factory-c-master", "factory-c-worker"]
```

## 중단 / 재시작

Factory B:

```bash
sudo systemctl restart aegis-factory-b-dummy-generator.service
sudo systemctl restart aegis-factory-b-dummy-publisher.service

sudo systemctl disable --now aegis-factory-b-dummy-generator.service
sudo systemctl disable --now aegis-factory-b-dummy-publisher.service
```

Factory C:

```bash
sudo systemctl restart aegis-factory-c-dummy-generator.service
sudo systemctl restart aegis-factory-c-dummy-publisher.service

sudo systemctl disable --now aegis-factory-c-dummy-generator.service
sudo systemctl disable --now aegis-factory-c-dummy-publisher.service
```

운영형 Edge Agent 또는 다른 publisher로 전환하기 전에는 해당 factory의 dummy publisher를 반드시 중단한다.

## 미수신 / 재수신 드릴

1~2일 동안 데이터가 들어오지 않다가 다시 들어오는 상황은 systemd 서비스를 멈췄다가 다시 시작해서 테스트한다.

스크립트:

| 파일 | 실행 위치 | 역할 |
| --- | --- | --- |
| `apps/dummy-sensor/scripts/factory-dummy-outage-drill.sh` | 대상 VM | generator/publisher를 멈췄다가 지정 시간 후 재시작 |
| `apps/dummy-sensor/scripts/check-s3-ingestion-gap.sh` | Computer 1 | S3 raw object가 outage window 동안 끊기고 이후 재개됐는지 확인 |

### 드릴 모드

| mode | 동작 | 검증 목적 |
| --- | --- | --- |
| `drop` | generator와 publisher 모두 중단 | 실제 현장/네트워크 중단처럼 새 데이터 자체가 없음. 재개 후 최신 데이터만 다시 들어옴 |
| `backlog` | publisher만 중단, generator는 계속 outbox 작성 | 통신 장애 후 밀린 로컬 outbox가 한 번에 flush되는 상황 확인 |

운영 관제의 "1~2일간 데이터 미수신" 테스트는 기본적으로 `drop` 모드를 사용한다. `backlog`는 별도 보상/재처리 동작을 확인할 때만 쓴다.

### VM에 드릴 스크립트 복사

Factory B:

```bash
scp apps/dummy-sensor/scripts/factory-dummy-outage-drill.sh \
    <vm-ssh-user>@<factory-b-ip>:/tmp/

ssh <vm-ssh-user>@<factory-b-ip> \
  'sudo install -m 755 /tmp/factory-dummy-outage-drill.sh /usr/local/bin/factory-dummy-outage-drill.sh'
```

Factory C:

```bash
scp apps/dummy-sensor/scripts/factory-dummy-outage-drill.sh \
    <vm-ssh-user>@${TS_IP_WORKER}:/tmp/

ssh <vm-ssh-user>@${TS_IP_WORKER} \
  'sudo install -m 755 /tmp/factory-dummy-outage-drill.sh /usr/local/bin/factory-dummy-outage-drill.sh'
```

### 짧은 smoke 드릴

먼저 2분짜리로 절차를 검증한다.

Factory B:

```bash
sudo /usr/local/bin/factory-dummy-outage-drill.sh --factory factory-b --duration 2m --mode drop
```

Factory C:

```bash
sudo /usr/local/bin/factory-dummy-outage-drill.sh --factory factory-c --duration 2m --mode drop
```

스크립트 출력의 `outage_start`, `outage_end`를 기록한다.

### 1~2일 드릴

Factory B:

```bash
sudo /usr/local/bin/factory-dummy-outage-drill.sh --factory factory-b --duration 1d --mode drop
```

Factory C:

```bash
sudo /usr/local/bin/factory-dummy-outage-drill.sh --factory factory-c --duration 1d --mode drop
```

2일 테스트는 `--duration 2d`를 사용한다.

터미널을 계속 열어두기 어렵다면 `--no-sleep`으로 중단만 수행하고, 원하는 시점에 수동 재시작한다.

```bash
sudo /usr/local/bin/factory-dummy-outage-drill.sh --factory factory-b --duration 2d --mode drop --no-sleep

# 재개 시점
sudo systemctl start aegis-factory-b-dummy-generator.service
sudo systemctl start aegis-factory-b-dummy-publisher.service
```

### S3 gap 확인

Computer 1에서 실행한다.

```bash
apps/dummy-sensor/scripts/check-s3-ingestion-gap.sh \
  --factory factory-b \
  --start 2026-05-20T00:00:00Z \
  --end 2026-05-21T00:00:00Z
```

Factory C:

```bash
apps/dummy-sensor/scripts/check-s3-ingestion-gap.sh \
  --factory factory-c \
  --start 2026-05-20T00:00:00Z \
  --end 2026-05-21T00:00:00Z
```

정상 해석:

```text
drop 모드:
  during = 0 또는 거의 0
  after  = 다시 증가

backlog 모드:
  during = 0 또는 거의 0
  after  = 밀린 outbox flush 때문에 일시적으로 급증 가능
```

Dashboard/Lambda 측에서는 이 드릴을 통해 아래를 확인한다.

- `infra_state` 미수신 시간이 warning/critical 상태로 반영되는지
- `factory_state` 미수신 중 risk 계산이 오래된 값을 그대로 정상처럼 표시하지 않는지
- 재수신 후 latest 상태가 다시 정상으로 복귀하는지
- 1~2일 gap 이후에도 S3 raw prefix와 DynamoDB history가 깨지지 않는지
