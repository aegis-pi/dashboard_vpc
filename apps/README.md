# Apps

이 디렉터리는 Aegis-Pi에서 직접 구현할 애플리케이션 코드를 서비스별로 나누어 두는 공간이다.

현재는 `dummy-sensor/`에 factory-b/c 테스트베드용 가데이터 생성 및 IoT publish 코드가 들어 있다. `risk-normalizer`, `risk-score-engine`, `pipeline-status-aggregator`는 legacy placeholder이며, IoT Core 이후 정규화/Risk 계산/latest 저장은 Lambda data processor와 DynamoDB/S3 processed로 처리한다.

## 하위 폴더

| 경로 | 역할 |
| --- | --- |
| `edge-agent/` | `factory-a` 로컬 데이터와 상태를 수집해 AWS IoT Core로 송신하는 Edge Agent |
| `dummy-sensor/` | `factory-b`, `factory-c` 테스트베드용 더미 입력 생성 + outbox + IoT publish + outage drill |
| `risk-normalizer/` | legacy placeholder. 최신 기준에서는 Lambda data processor의 정규화 로직으로 대체 |
| `risk-score-engine/` | legacy placeholder. 최신 기준에서는 Lambda data processor의 Risk 계산 로직으로 대체 |
| `pipeline-status-aggregator/` | legacy placeholder. 최신 기준에서는 Lambda data processor가 DynamoDB LATEST/HISTORY에 `pipeline_status`를 갱신 |

## 2026-05-20 현재 구현

- `dummy-sensor/`는 systemd 실행 기준의 VM 테스트베드 코드다.
- Factory B/C 모두 Factory A와 같은 canonical JSON → outbox → MQTT publish 경계를 따른다.
- `factory_state`는 profile 기반 가데이터다.
- `infra_state`는 기본적으로 실제 K3s 상태를 `kubectl`/Kubernetes API로 읽고, 실패 시에만 synthetic fallback을 사용한다.
- VM에서 1~2일 데이터 미수신 후 재수신을 테스트하는 outage drill shell script를 포함한다.
- `risk-normalizer`, `risk-score-engine`, `pipeline-status-aggregator`를 ECR 컨테이너 이미지 대상으로 잡지 않는다.
- Lambda를 container image로 배포하기로 결정할 때만 별도 ECR repository를 추가하며, 그 이름은 기존 legacy 서비스명이 아니라 `aegis-data-processor` 같은 통합 Lambda 처리기 기준으로 정한다.
