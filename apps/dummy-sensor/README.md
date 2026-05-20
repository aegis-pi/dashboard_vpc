# Dummy Sensor

`factory-b`, `factory-c` 테스트베드 Spoke에서 사용하는 더미 데이터 생성 코드를 둔다.

현재 구현 범위는 `factory-b` Mac UTM K3s testbed 와 `factory-c` Windows VirtualBox K3s testbed 용이다.

## Factory B/C 구조

Factory A 최신 데이터 플레인과 같은 경계를 따른다.

```text
factory_b_dummy_generator.py / factory_c_dummy_generator.py
  -> canonical JSON 생성
  -> local outbox 파일 저장

factory_b_iot_publisher.py / factory_c_iot_publisher.py
  -> outbox JSON scan
  -> AWS IoT Core MQTT publish
  -> IoT Rule
  -> S3 raw/{factory_id}/{source_type}/...
```

생성되는 source type:

| source type | 기본 주기 | 내용 |
| --- | --- | --- |
| `factory_state` | 3초 | factory별 profile 기반 센서/AI 가데이터 |
| `infra_state` | 20초 | factory별 K3s node/workload 상태 |

Factory별 프로파일:

| Factory | Host | Profile | Node topology | 값 특성 |
| --- | --- | --- | --- | --- |
| `factory-b` | Mac UTM | `stable-lab` | single-node `factory-b` | 낮은 anomaly 확률, 낮은 온습도 기준 |
| `factory-c` | Windows VirtualBox | `noisy-vm` | 2-node `factory-c-master`/`factory-c-worker` | 높은 anomaly 확률, 높은 온습도 jitter |

공통 envelope는 Factory A 구현과 맞춰 `data_plane_instance_id`를 포함한다.

## Local Preview

```bash
python3 apps/dummy-sensor/factory_b_dummy_generator.py --once all --no-write --pretty
python3 apps/dummy-sensor/factory_c_dummy_generator.py --once all --no-write --pretty
```

outbox에 1회 생성:

```bash
AEGIS_OUTBOX_DIR=/tmp/aegis-factory-c-outbox \
  python3 apps/dummy-sensor/factory_c_dummy_generator.py --once all
```

Factory B는 파일명과 경로만 바꾼다.

```bash
AEGIS_OUTBOX_DIR=/tmp/aegis-factory-b-outbox \
  python3 apps/dummy-sensor/factory_b_dummy_generator.py --once all
```

outbox를 1회 publish:

```bash
AEGIS_OUTBOX_DIR=/tmp/aegis-factory-c-outbox \
AEGIS_IOT_DIR=/etc/aegis/iot/factory-c \
AEGIS_IOT_CLIENT_ID=AEGIS-IoTThing-factory-c \
  python3 apps/dummy-sensor/factory_c_iot_publisher.py --once
```

Factory B:

```bash
AEGIS_OUTBOX_DIR=/tmp/aegis-factory-b-outbox \
AEGIS_IOT_DIR=/etc/aegis/iot/factory-b \
AEGIS_IOT_CLIENT_ID=AEGIS-IoTThing-factory-b \
  python3 apps/dummy-sensor/factory_b_iot_publisher.py --once
```

`AEGIS_IOT_DIR` 기본값은 factory별로 `/etc/aegis/iot/factory-b` 또는 `/etc/aegis/iot/factory-c` 이며 아래 파일을 읽는다.

```text
endpoint.txt
AmazonRootCA1.pem
certificate.pem.crt
private.pem.key
```

인증서 경로를 직접 지정하려면 아래 환경변수를 사용한다.

| 환경변수 | 기본값 |
| --- | --- |
| `AEGIS_IOT_ENDPOINT` | `AEGIS_IOT_DIR/endpoint.txt` |
| `AEGIS_IOT_CA_FILE` | `AEGIS_IOT_DIR/AmazonRootCA1.pem` |
| `AEGIS_IOT_CERT_FILE` | `AEGIS_IOT_DIR/certificate.pem.crt` |
| `AEGIS_IOT_KEY_FILE` | `AEGIS_IOT_DIR/private.pem.key` |
| `AEGIS_IOT_CLIENT_ID` | `AEGIS-IoTThing-factory-b` 또는 `AEGIS-IoTThing-factory-c` |
| `AEGIS_OUTBOX_DIR` | `/var/lib/aegis/outbox` |
| `AEGIS_CLUSTER_STATE_MODE` | `auto` (`infra_state`에서 실제 K3s 조회, 실패 시 fallback) |
| `KUBECONFIG` | 선택. systemd 실행 시 특정 kubeconfig를 지정할 때 사용 |

## Factory B VM systemd 예시

`factory-b` Mac UTM VM에서:

```bash
sudo mkdir -p /opt/aegis/dummy-sensor /var/lib/aegis/outbox /etc/aegis
sudo cp factory_b_dummy_generator.py factory_b_iot_publisher.py k8s_state.py /opt/aegis/dummy-sensor/
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

generator service:

```ini
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

[Install]
WantedBy=multi-user.target
```

publisher service:

```ini
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

[Install]
WantedBy=multi-user.target
```

## Factory C Worker VM systemd 예시

`factory-c-worker` VM에서:

```bash
sudo mkdir -p /opt/aegis/dummy-sensor /var/lib/aegis/outbox /etc/aegis
sudo cp factory_c_dummy_generator.py factory_c_iot_publisher.py k8s_state.py /opt/aegis/dummy-sensor/
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

generator service:

```ini
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

[Install]
WantedBy=multi-user.target
```

publisher service:

```ini
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

[Install]
WantedBy=multi-user.target
```

## Tests

```bash
python3 -m unittest discover -s apps/dummy-sensor/tests
```

## Runbook

VM에 파일을 복사하고 systemd로 상시 실행하는 전체 절차는 아래 문서를 기준으로 한다.

- `apps/dummy-sensor/docs/factory-b-c-dummy-systemd-runbook.md`

미수신/재수신 드릴용 script:

| 파일 | 용도 |
| --- | --- |
| `apps/dummy-sensor/scripts/factory-dummy-outage-drill.sh` | VM에서 systemd 서비스를 멈췄다가 재시작 |
| `apps/dummy-sensor/scripts/check-s3-ingestion-gap.sh` | Computer 1에서 S3 raw gap 확인 |
