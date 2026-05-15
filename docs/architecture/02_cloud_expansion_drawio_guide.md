# Cloud Expansion Draw.io Guide

상태: draft
기준일: 2026-05-15
수정 이력:
  - 2026-05-15  ADR 0006~0011 반영. 신규 목표 다이어그램 `02_re5_two_vpc_target.drawio` 추가. 기존 `01_re4.drawio`는 pre-2VPC 단일 VPC historical reference로 유지.
  - 2026-04-29  초안

## 목적

M0 `factory-a` Safe-Edge 기준선을 AWS Hub 중심의 멀티 Spoke 구조로 확장할 때, draw.io에서 그릴 아키텍처 다이어그램의 구성 기준을 정리한다.

이 문서는 구현 완료 상태가 아니라 M1~M7 클라우드 확장 목표 구조를 도식화하기 위한 가이드다.

## 현재 다이어그램 파일

| 파일 | 위상 | 비고 |
| --- | --- | --- |
| `drawio/01_re4.drawio` / `images/01_re4.jpg` | historical reference (단일 VPC, ADR 0005 이전) | EKS Hub 안에 Risk Normalizer/Risk Score Engine 컨테이너 표기. 최신 결정과 어긋나므로 신규 다이어그램을 source of truth로 사용 |
| `drawio/02_re5_two_vpc_target.drawio` | **현재 source of truth** (2026-05-15, ADR 0006~0011 반영) | 2 VPC 분리, Lambda data processor (VPC 밖), 정적 SPA + CloudFront, Cognito, API Gateway, NAT GW 제거, 단일 S3 prefix 분리 |

신규 다이어그램은 단일 페이지 Overview 형태다. 후속에 본 가이드의 5개 분할(Overview / Data Plane / Control Plane / CI/CD / Dashboard Access) 권장에 맞춰 페이지를 추가한다.

## 최신 기준

2026-05-09 기준 확정된 클라우드 리소스 배치와 VPC 명명은 `docs/planning/15_cloud_architecture_final.md`를 source of truth로 한다.

이 문서의 `Processing VPC`와 `Dashboard VPC` 분리 표현은 이전 다이어그램 초안이다. 새 다이어그램을 작성할 때는 아래 경계를 우선한다.

```text
2번 VPC: Control / Management VPC
  - EKS Hub
  - Hub ArgoCD
  - Tailscale
  - Prometheus Agent
  - Grafana

1번 VPC: Data / Dashboard VPC
  - Lambda data processor
  - DynamoDB LATEST/HISTORY
  - S3 processed
  - Dashboard Backend/API
  - Dashboard Web
```

그릴 다이어그램은 다섯 장으로 나눈다.

1. Overview
2. Data Plane
3. Control Plane
4. CI/CD
5. Dashboard Access

## 공통 표현 규칙

### 시스템 경계

draw.io에서는 아래 경계를 큰 컨테이너로 먼저 나눈다.

```text
2번 VPC / Control Management
1번 VPC / Data Dashboard
factory-a / physical Safe-Edge Spoke
factory-b / Mac VM Spoke
factory-c / Windows VM Spoke
GitHub
Operator / Admin
```

### 공장 역할

| Factory | 유형 | 현재 기준 | 클라우드 확장 후 역할 |
| --- | --- | --- | --- |
| `factory-a` | 운영형 Spoke | M0 완료 | 실제 센서/AI/Audio 입력을 Hub로 전송 |
| `factory-b` | 테스트베드형 Spoke | 후속 | Dummy Sensor 기반 VM Spoke |
| `factory-c` | 테스트베드형 Spoke | 후속 | Dummy Sensor 기반 VM Spoke |

### 공통 라벨

화살표에는 가능하면 아래 종류의 라벨을 붙인다.

```text
MQTT publish
IoT Rule -> S3
S3 read / normalize
Prometheus scrape
remote_write
ArgoCD sync
kube API over Tailscale
image push / image pull
values update
```

### 현재 완료와 후속 목표 구분

`factory-a` 로컬 Safe-Edge 기준선은 완료된 기반으로 표시한다.

아래 항목은 클라우드 확장 목표로 표시한다.

```text
AWS EKS Hub
AWS IoT Core
S3
ECR
AMP
Control / Management VPC
Data / Dashboard VPC
Route53 / ALB / WAF / Auth
Tailscale Hub-Spoke
GitHub Actions
ApplicationSet
Lambda data processor
DynamoDB LATEST/HISTORY
factory-b / factory-c
```

## 1. Overview Diagram

### 목적

전체 시스템을 한 장에서 설명한다.

이 그림은 세부 데이터 흐름보다 "어떤 큰 블록이 있고 서로 어떤 관계인지"를 보여주는 용도다.

### 큰 배치

```text
                          GitHub
                            |
                            | source / manifests / actions
                            v
                    AWS Cloud
        +------------------------------------------------+
        | Control VPC: EKS Hub | ArgoCD | Grafana | AMP   |
        | Managed: IoT Core | Lambda | S3 | DynamoDB | ECR |
        +------------------------------------------------+
                            |
                            | DynamoDB/S3 read-only IAM, no VPC peering
                            v
                    Data / Dashboard VPC
        +------------------------------------------------+
        | Route53 | ALB | WAF/Auth | Dashboard Web/API    |
        +------------------------------------------------+
             ^              ^              ^
             |              |              |
             | Tailscale    | MQTT/Data    | Metrics
             |              |              |
+----------------+ +----------------+ +----------------+
| factory-a      | | factory-b      | | factory-c      |
| RPi K3s        | | Mac VM K3s     | | Windows VM K3s |
| sensor/AI/audio| | dummy sensor   | | dummy sensor   |
+----------------+ +----------------+ +----------------+
```

### 포함할 리소스

AWS Cloud / Control 경계와 managed service 영역에는 아래 리소스를 둔다.

| 리소스 | 역할 |
| --- | --- |
| EKS Cluster | Hub 실행 기반 |
| ArgoCD | 멀티 Spoke 배포 제어 |
| IoT Core | Edge/Spoke 데이터 수신 진입점 |
| S3 raw/processed | 원본과 처리 결과 장기 적재 |
| ECR | 컨테이너 이미지 저장소 |
| AMP | Prometheus 메트릭 중앙 저장 |
| DynamoDB LATEST/HISTORY | 대시보드 빠른 조회용 현재 상태와 최근 그래프 |
| Lambda data processor | 정규화, Risk 계산, pipeline_status 계산 |

Data / Dashboard VPC 경계 안에는 아래 리소스를 둔다.

| 리소스 | 역할 |
| --- | --- |
| Route53 | 관리자 도메인 |
| ALB | HTTPS ingress |
| WAF | 외부 접근 보호 |
| Cognito/Auth | 관리자 인증 |
| Dashboard Web/API | 본사 중앙 관제 화면 |

각 Spoke 경계 안에는 아래 리소스를 둔다.

| Spoke | 포함 리소스 |
| --- | --- |
| `factory-a` | K3s, BME280, camera, mic, Edge Agent, 기존 monitoring/ai-apps, Longhorn |
| `factory-b` | VM K3s, Dummy Sensor, Edge Agent 또는 Dummy 송신 모듈 |
| `factory-c` | VM K3s, Dummy Sensor, Edge Agent 또는 Dummy 송신 모듈 |

### 주요 관계

| From | To | 관계 |
| --- | --- | --- |
| GitHub | GitHub Actions | 코드 push 또는 manifest 변경 트리거 |
| GitHub Actions | ECR | 컨테이너 이미지 build/push |
| GitHub Actions | GitHub manifests | 이미지 태그를 values에 반영 |
| ArgoCD | GitHub manifests | ApplicationSet이 chart/values를 감시 |
| ArgoCD | Spoke K3s | Tailscale 경유 Kubernetes API sync |
| Spoke Edge Agent | IoT Core | MQTT publish |
| IoT Core | S3 raw | IoT Rule 기반 원본 JSON 적재 |
| IoT Core | Lambda data processor | IoT Rule 또는 Lambda action으로 수신 메시지 전달 |
| Lambda data processor normalization step | Lambda data processor risk logic | 정규화 결과 전달 |
| Lambda data processor risk logic | DynamoDB LATEST/HISTORY / S3 processed | Risk Twin 결과 저장 |
| Lambda data processor pipeline_status logic | IoT Core / S3 | 수신/적재 상태 확인 |
| Dashboard Web/API | DynamoDB LATEST/HISTORY / S3 processed | read-only 중앙 관제 조회 |

### draw.io 권장 형태

- AWS Cloud는 가장 큰 박스로 둔다.
- Control / Management VPC와 Data / Dashboard VPC를 AWS Cloud 안의 별도 큰 박스로 둔다.
- EKS Hub는 Control / Management VPC 안의 큰 박스로 둔다.
- IoT Core, S3, ECR, AMP는 EKS 바깥의 AWS managed service로 둔다.
- ArgoCD와 Grafana는 EKS/Control VPC 안에 두고, Lambda data processor와 DynamoDB/S3는 AWS managed service 영역에 둔다.
- Dashboard VPC와 Control VPC 사이에는 VPC Peering을 그리지 않는다. Dashboard는 `read-only IAM / managed storage` 화살표로 DynamoDB/S3 processed를 조회하게 그린다.
- 각 factory는 AWS Cloud 바깥의 독립 박스로 둔다.
- Tailscale은 Hub와 Spoke 사이의 네트워크 오버레이 박스 또는 점선 영역으로 표현한다.

## 2. Data Plane Diagram

### 목적

센서/시스템 상태가 Spoke에서 Hub로 들어와 Risk Twin 결과와 관제 화면이 되는 흐름을 보여준다.

이 그림은 M4, M5, M6의 핵심이다.

### 기본 흐름

```text
factory-a real input
    -> Edge Agent
    -> AWS IoT Core
        -> IoT Rule -> S3 raw data
        -> Lambda data processor
            -> DynamoDB LATEST/HISTORY
            -> S3 processed
    -> Dashboard Web/API

factory-b / factory-c dummy input
    -> Dummy Sensor
    -> AWS IoT Core
        -> IoT Rule -> S3 raw data
        -> Lambda data processor
            -> DynamoDB LATEST/HISTORY
            -> S3 processed
    -> Dashboard Web/API
```

### Spoke 입력

`factory-a`는 실제 입력을 사용한다.

```text
BME280
camera
mic
node status
edge agent status
input module status
device status
workload status
pipeline heartbeat
```

`factory-b`, `factory-c`는 Dummy Sensor를 사용한다.

```text
normal
warning
danger
```

### 표준 메시지

Spoke에서 Hub로 보내는 메시지는 표준 입력 스키마를 따른다.

```json
{
  "factory_id": "factory-a",
  "node_id": "worker2",
  "timestamp": "2026-04-24T12:00:00Z",
  "source_type": "sensor",
  "environment_type": "physical-rpi",
  "payload": {
    "temperature": 24.5,
    "humidity": 58.2
  }
}
```

draw.io에서는 이 JSON 전체를 넣기보다 아래 필드만 작은 note로 표시한다.

```text
factory_id
node_id
timestamp
source_type
environment_type
payload
```

### source_type 흐름

| source_type | 생성 위치 | Hub 처리 |
| --- | --- | --- |
| `factory_state` | Edge Agent | Lambda 처리 후 DynamoDB/S3 processed 저장 |
| `infra_state` | Edge Agent | Lambda 처리 후 DynamoDB/S3 processed 저장 |
| `pipeline_status` | Lambda data processor | IoT/S3 상태를 집계해 DynamoDB LATEST/HISTORY에 저장 |
| `event` | 구조만 예약 | MVP에서는 점수 반영 제외 |

### S3 파티션

S3는 공장/source_type/날짜 기준으로 그린다.

```text
s3://<bucket>/
  raw/factory-a/factory_state/yyyy=YYYY/mm=MM/dd=DD/<message_id>.json
  raw/factory-a/infra_state/yyyy=YYYY/mm=MM/dd=DD/<message_id>.json
  processed/risk-score/factory-a/yyyy=YYYY/mm=MM/dd=DD/hh=HH/<message_id>.json
```

### Cloud-side 데이터 처리

Data / Dashboard VPC 또는 managed service 영역에는 아래 박스를 둔다.

```text
Lambda data processor
DynamoDB LATEST/HISTORY
S3 processed
```

처리 관계는 아래처럼 그린다.

| From | To | 라벨 |
| --- | --- | --- |
| IoT Core | Lambda data processor normalization step | Lambda action / message event |
| IoT Core | S3 raw data | IoT Rule raw archive |
| Lambda data processor normalization step | Lambda data processor risk logic | normalized input |
| IoT Core | Lambda data processor pipeline_status logic | latest received check |
| S3 | Lambda data processor pipeline_status logic | latest object check |
| Lambda data processor pipeline_status logic | Lambda data processor risk logic | pipeline_status |
| Lambda data processor risk logic | DynamoDB LATEST/HISTORY | current risk/status and recent graph |
| Lambda data processor risk logic | S3 processed | processed history |
| Dashboard Web/API | DynamoDB LATEST/HISTORY | read latest/recent graph |
| Dashboard Web/API | S3 processed | drill-down |

### Risk Twin 출력

Lambda data processor risk logic 옆에는 아래 출력 note를 둔다.

```text
risk_score: 0~100
current_status: safe / warning / danger
top_causes: top 3
score_delta_10m
processed_at
```

### Data Plane에서 그리지 않아도 되는 것

이 그림에서는 CI/CD 세부 흐름을 생략한다.

```text
GitHub Actions
ECR push
ApplicationSet generator
ArgoCD sync detail
```

## 3. Control Plane Diagram

### 목적

Hub가 각 Spoke Kubernetes 클러스터를 어떻게 제어하고 배포 대상으로 등록하는지 보여준다.

이 그림은 M1, M2, M3, M5의 배포 제어 관계를 설명한다.

### 기본 흐름

```text
Operator
    -> GitHub / ArgoCD UI
    -> Hub ArgoCD on EKS
    -> Tailscale network
    -> factory-a K3s API
    -> factory-b K3s API
    -> factory-c K3s API
```

### Hub EKS namespace

EKS Hub 안에는 namespace를 기준으로 박스를 나눈다.

```text
argocd
observability
risk
ops-support
```

| Namespace | Control Plane 관점 역할 |
| --- | --- |
| `argocd` | Spoke 클러스터 등록, ApplicationSet sync |
| `observability` | Grafana와 Prometheus/AMP 연동 |
| `risk` | legacy/M1 검증용. 최신 MVP에서는 Risk 서비스 배포 대상 아님 |
| `ops-support` | legacy pipeline 집계 후보. 최신 MVP에서는 Lambda가 `pipeline_status` 계산 |

### Tailscale 경계

Tailscale은 Hub와 Spoke 사이의 제어 네트워크로 표시한다.

```text
Tailscale Tailnet
  - EKS Hub connector/operator/subnet-router
  - factory-a master
  - factory-b VM
  - factory-c VM
```

초기 기준은 각 Spoke의 master/API endpoint만 Hub에서 접근하는 구조다.

### kubeconfig 관계

ArgoCD는 Spoke별 kubeconfig 또는 cluster secret을 통해 각 K3s API를 바라본다.

```text
factory-a.kubeconfig -> https://<factory-a-tailscale-ip>:6443
factory-b.kubeconfig -> https://<factory-b-tailscale-ip>:6443
factory-c.kubeconfig -> https://<factory-c-tailscale-ip>:6443
```

draw.io에서는 ArgoCD 옆에 아래 박스를 둔다.

```text
ArgoCD cluster secrets
  - factory-a
  - factory-b
  - factory-c
```

### ArgoCD 관계

| From | To | 라벨 |
| --- | --- | --- |
| ArgoCD | GitHub repo | watch charts/envs |
| ArgoCD | factory-a K3s API | sync via Tailscale |
| ArgoCD | factory-b K3s API | sync via Tailscale |
| ArgoCD | factory-c K3s API | sync via Tailscale |
| Operator | ArgoCD UI | approve/sync/check |
| Operator | Tailscale Admin | auth key / device status |

### ApplicationSet 관계

ApplicationSet은 공장별 values 경로를 읽어 Application을 만든다.

```text
charts/aegis-spoke
envs/factory-a/values.yaml -> aegis-spoke-factory-a
envs/factory-b/values.yaml -> aegis-spoke-factory-b
envs/factory-c/values.yaml -> aegis-spoke-factory-c
```

draw.io에서는 아래처럼 그린다.

```text
GitHub repo
  charts/aegis-spoke
  envs/factory-a
  envs/factory-b
  envs/factory-c
        |
        v
ApplicationSet
        |
        +--> Application: aegis-spoke-factory-a -> factory-a
        +--> Application: aegis-spoke-factory-b -> factory-b
        +--> Application: aegis-spoke-factory-c -> factory-c
```

### 운영형과 테스트베드형 정책

Control Plane 다이어그램에는 sync 정책 차이를 note로 붙인다.

| Factory | 정책 |
| --- | --- |
| `factory-a` | 운영형, 보수적 sync, 실패 시 수동 확인 |
| `factory-b` | 테스트베드형, 빠른 자동 sync, 자동 롤백 후보 |
| `factory-c` | 테스트베드형, 빠른 자동 sync, 자동 롤백 후보 |

### Control Plane에서 그리지 않아도 되는 것

이 그림에서는 MQTT, S3 적재, Risk Score 계산 세부 흐름을 생략한다.

```text
IoT Core payload
S3 partition detail
Risk weight detail
Grafana panel detail
```

## 4. CI/CD Diagram

### 목적

코드 변경이 컨테이너 이미지와 Helm values 변경을 거쳐 각 Spoke로 배포되는 흐름을 보여준다.

이 그림은 M3의 핵심이다.

### 기본 흐름

```text
Developer push
    -> GitHub repository
    -> GitHub Actions build-push
    -> Amazon ECR
    -> GitHub Actions update-manifest
    -> envs/{factory}/values.yaml commit
    -> ArgoCD detects OutOfSync
    -> ArgoCD sync
    -> Spoke rollout
    -> GitHub Actions verify-deploy
```

### GitHub repository 구조

draw.io의 GitHub 박스 안에 아래 하위 박스를 둔다.

```text
apps/
charts/aegis-spoke/
charts/aegis-hub/
envs/factory-a/values.yaml
envs/factory-b/values.yaml
envs/factory-c/values.yaml
.github/workflows/
```

### 워크플로우

| Workflow | 역할 |
| --- | --- |
| `build-push.yaml` | Docker image build, ECR push |
| `update-manifest.yaml` | 신규 image tag를 values 파일에 반영 |
| `verify-deploy.yaml` | ArgoCD/Spoke 배포 결과 검증 |

### 이미지 저장소

ECR에는 서비스별 repository를 둔다.

```text
edge-agent
# Lambda를 container image로 배포할 때만 후속으로 aegis-data-processor 추가
```

이미지 태그는 기본적으로 git sha 기반으로 표시한다.

```text
sha-<7 chars>
```

### 배포 대상별 values

| values 파일 | 대상 | 주요 값 |
| --- | --- | --- |
| `envs/factory-a/values.yaml` | `factory-a` | `factory_id=factory-a`, `environment_type=physical-rpi`, `input_module_type=sensor` |
| `envs/factory-b/values.yaml` | `factory-b` | `factory_id=factory-b`, `environment_type=vm-mac`, `input_module_type=dummy` |
| `envs/factory-c/values.yaml` | `factory-c` | `factory_id=factory-c`, `environment_type=vm-windows`, `input_module_type=dummy` |

### CI/CD 관계

| From | To | 라벨 |
| --- | --- | --- |
| Developer | GitHub | git push |
| GitHub | GitHub Actions | trigger |
| GitHub Actions | ECR | docker push `sha-xxxxxxx` |
| GitHub Actions | GitHub values | update image tag |
| GitHub values | ArgoCD | OutOfSync detected |
| ArgoCD | Spoke K3s | sync / rollout |
| Spoke K3s | ECR | image pull |
| GitHub Actions verify | ArgoCD API | sync/health check |
| GitHub Actions verify | Spoke K3s API | pod Running check |

### 성공 기준

CI/CD 다이어그램 하단에는 아래 success criteria를 note로 붙인다.

```text
GitHub Actions: Success
ECR: sha tag exists
ArgoCD: Synced / Healthy
Spoke Pod: Running
Data path: message resumes after rollout
```

### 실패/롤백 표현

운영형과 테스트베드형의 실패 처리 차이를 점선으로 표시한다.

```text
factory-a:
  bad image -> Degraded -> manual rollback

factory-b / factory-c:
  bad image -> auto rollback candidate -> previous pod Running
```

## 5. Dashboard Access Diagram

### 목적

관리자가 Tailscale 없이 대시보드에 접근하고, Data / Dashboard VPC가 Control / Management VPC와 직접 네트워크 연결 없이 managed storage만 조회하는 구조를 보여준다.

이 그림은 `docs/planning/07_dashboard_vpc_extension_plan.md`의 핵심 구조를 시각화한다.

### 기본 흐름

```text
Admin Browser
  -> Route53
  -> ALB
  -> WAF
  -> Cognito/Auth
  -> Dashboard Web/API
  -> DynamoDB LATEST/HISTORY
  -> S3 processed
```

IoT Core 이후 data processing은 아래처럼 표현한다.

```text
IoT Core
  -> IoT Rule -> S3 raw
  -> Lambda data processor
      -> DynamoDB LATEST/HISTORY
      -> S3 processed
```

### 금지 경로 표현

아래 연결은 그리지 않거나, 빨간 점선 `no direct network path`로 표시한다.

```text
Dashboard VPC -> Control VPC private service
Dashboard VPC -> EKS admin API
Dashboard VPC -> ArgoCD admin API
Dashboard VPC -> Spoke K3s API
```

### 지연 note

Dashboard Access 그림 하단에는 아래 지연 기준을 note로 붙인다.

```text
일반 상태 변화: 10~35초
장애 판정: 40~60초
heartbeat: 10초
full status: 30초
```

## 다이어그램별 최종 체크리스트

### Overview

- [ ] AWS Cloud / Control VPC / Data-Dashboard VPC / 3개 Spoke / GitHub 경계가 보인다.
- [ ] Hub가 중앙 배포와 관측을 담당하고, Data / Dashboard VPC와 managed storage가 데이터 처리 결과 조회를 담당하는 것이 보인다.
- [ ] `factory-a`는 운영형, `factory-b/c`는 테스트베드형으로 구분된다.
- [ ] 현재 완료된 M0와 후속 M1~M7이 섞여 보이지 않는다.

### Data Plane

- [ ] Edge/Dummy 입력이 IoT Core로 들어간다.
- [ ] IoT Core Rule이 S3에 적재한다.
- [ ] S3 파티션이 factory/source_type/date 기준으로 보인다.
- [ ] Lambda data processor 내부에 normalization, risk logic, pipeline_status 계산 단계가 보인다.
- [ ] `pipeline_status`가 Edge가 아니라 Hub derived임이 보인다.
- [ ] Dashboard Web/API가 DynamoDB LATEST/HISTORY와 S3 processed를 조회하는 구조가 보인다.

### Control Plane

- [ ] ArgoCD가 Hub EKS 안에 있다.
- [ ] Tailscale이 Hub와 Spoke K3s API 사이에 있다.
- [ ] Spoke별 kubeconfig/cluster secret 관계가 보인다.
- [ ] ApplicationSet이 3개 Application을 생성하는 구조가 보인다.
- [ ] 운영형/테스트베드형 sync 정책 차이가 보인다.

### CI/CD

- [ ] GitHub push에서 시작한다.
- [ ] GitHub Actions가 ECR에 이미지를 push한다.
- [ ] values 파일 이미지 태그 갱신이 표현된다.
- [ ] ArgoCD가 변경을 감지하고 Spoke로 sync한다.
- [ ] Spoke가 ECR에서 이미지를 pull한다.
- [ ] 검증 워크플로우가 ArgoCD와 Spoke 상태를 확인한다.

### Dashboard Access

- [ ] Route53 -> ALB -> WAF/Auth -> Dashboard Web/API 접근 경로가 보인다.
- [ ] Dashboard VPC와 Control VPC 사이에 VPC Peering/TGW가 없다.
- [ ] Dashboard API가 DynamoDB LATEST/HISTORY와 S3 processed만 read-only로 조회한다.
- [ ] Tailscale은 Dashboard 접근망이 아니라 Control Plane 접근망으로 구분된다.

## 권장 파일 분리

draw.io에서는 한 파일 안에 탭 5개를 두는 방식을 권장한다.

```text
Aegis-Pi Cloud Expansion.drawio
  - 01 Overview
  - 02 Data Plane
  - 03 Control Plane
  - 04 CI-CD
  - 05 Dashboard Access
```

각 탭은 같은 색상 규칙과 같은 리소스 이름을 사용한다.

```text
AWS managed service: 연한 주황
EKS workload: 연한 파랑
Spoke cluster: 연한 초록
GitHub/CI: 연한 회색
Dashboard VPC: 연한 노랑
Network/Tailscale: 점선 보라
Data flow: 실선
Control flow: 점선
```

## 2026-05-14 수정 방향

이 다이어그램 가이드는 Lambda/DynamoDB 최신 데이터 처리 기준을 따른다.

이전 `Risk Normalizer`, `Risk Score Engine`, `pipeline-status-aggregator`, `Event Processor` 박스는 별도 EKS/ECR 서비스가 아니라 Lambda data processor 내부 처리 단계로 그린다.

최신 데이터 흐름:

```text
Edge Agent
  -> IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor
          -> DynamoDB LATEST
          -> DynamoDB HISTORY
          -> S3 processed
  -> Dashboard API/Web
```
