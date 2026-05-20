# M5. VM Spoke 확장 - `factory-b`, `factory-c`

> **마일스톤 목표**: Mac mini(`factory-b`)와 Windows VM(`factory-c`)을 테스트베드형 Spoke로 추가한다.  
> M3(배포 파이프라인)과 M4(데이터 플레인)가 `factory-a` 기준으로 검증된 후 진행한다.  
> VM Spoke는 실센서/Longhorn/NFS 없이 Dummy Sensor 기반으로 동작한다.

## 수정 이력

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-05-19 | rev-20260519-01 | Issue 2 (`factory-c`) 토폴로지를 single-node → **master + worker 2-VM K3s cluster** 로 확정 (ADR 0019). Issue 3 의 Tailscale 참여를 두 VM 모두 명시. 단계별 실행 절차는 `docs/ops/19_factory_c_windows_virtualbox_k3s.md` v5+ source of truth. IoT Rule factory-c 확장은 ADR 0018 로 분리 추적. factory-b 의 토폴로지 결정은 본 갱신 범위 밖 (Mac mini 사양 확정 후 별도 판단) |

---

## 2026-05-13 멘토링 반영: VM Spoke 검증 목적 보강

### 기존 초안

기존 M5 초안은 Mac mini VM과 Windows VM을 각각 `factory-b`, `factory-c` 테스트베드 Spoke로 추가하는 데 집중했다.

### 변경 이유

멘토링에서는 VM Spoke가 실제 공장을 완전히 대체하는 증거가 아니라는 점을 명확히 해야 한다는 피드백이 있었다. 고객 요구사항 관점에서는 초당 데이터 크기, 성공률/실패율, 지연시간처럼 무엇을 증명할지 정의해야 한다.

### 보강 방향

`factory-b/c`는 실제 센서 정확도 검증이 아니라 멀티 factory 흐름 검증용 테스트베드로 설명한다. 핵심 검증 대상은 factory별 클러스터 식별, ApplicationSet 배포, IoT topic 분리, S3 prefix 분리, latest status 반영, Risk Score 분리 계산, Dashboard 카드 분리 표시다.

---

## Issue 1 - [Spoke/K3s] Mac mini VM K3s 구성 (`factory-b`)

### 🎯 목표 (What & Why)

Mac mini(M4, 24GB)에 VM을 구성하고 K3s를 설치하여 `factory-b` Spoke 기반을 만든다.  
VM 기반 Spoke는 파이프라인 검증에 집중하므로 Longhorn, NFS, 버퍼링 구조는 제외한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Mac mini에서 VM 구성 방식 결정 및 적용
  - 방식 예: UTM, Multipass, OrbStack 등
- [ ] VM 스펙 결정 (CPU, 메모리, 디스크)
- [ ] VM 내부 Ubuntu 또는 Debian 기반 OS 설치
- [ ] K3s 단일 노드 또는 경량 클러스터 설치
  - 제외 항목: Longhorn, NFS 티어링, 실센서 의존 구성
- [ ] `factory-b` 기본 레이블 및 환경 설정 적용
  - `environment_type: vm-mac`
  - `input_module_type: dummy`
- [ ] K3s 정상 동작 확인 (`kubectl get nodes`)

### 🔍 Acceptance Criteria

- `kubectl get nodes`에서 `factory-b` 노드 `Ready` 상태
- K3s 버전 확인 및 기록
- VM 재부팅 후에도 K3s 자동 시작 확인

---

## Issue 2 - [Spoke/K3s] Windows VirtualBox K3s 구성 (`factory-c`, master + worker 2-VM)

### 🎯 목표 (What & Why)

Windows 환경 (Computer 3) 에 VirtualBox 기반 VM **2 대** (`factory-c-master`, `factory-c-worker`) 를 구성하고, K3s server + agent 2-노드 클러스터를 만들어 `factory-c` Spoke 기반을 만든다.

토폴로지 확정 근거: `docs/changes/0019-factory-c-master-worker-cluster.md`. 단계별 실행 절차: `docs/ops/19_factory_c_windows_virtualbox_k3s.md`.

single-node 가 아닌 2-VM 으로 가는 이유는 (1) Dashboard 가 표시하는 `infra_state.payload.nodes` 배열이 2개로 보여 "실제 공장처럼" 시연되도록 하고, (2) `aegis.input-module-type=dummy` label + workload placement 검증이 의미를 갖게 하기 위함이다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Computer 3 (Windows 11, i7-10700F + 16 GiB 권장) 에 VirtualBox 7.x 설치
- [ ] VM `factory-c-master` 생성 (2 vCPU / 2 GiB / 20 GiB, Ubuntu Server LTS 24.04, NAT)
- [ ] VM `factory-c-worker` 생성 (2 vCPU / 4 GiB / 40 GiB, Ubuntu Server LTS 24.04, NAT)
- [ ] 두 VM 에서 swap off, 기본 패키지 (`curl jq openssh-server mosquitto-clients`) 설치
- [ ] master VM 에 K3s server 설치 (`--tls-san ${TS_IP_MASTER}` 포함) → cluster token 추출
- [ ] worker VM 에 K3s agent 설치 (`K3S_URL`, `K3S_TOKEN`, `--node-ip ${TS_IP_WORKER}`)
- [ ] `kubectl get nodes` 두 노드 Ready: `factory-c-master` (control-plane), `factory-c-worker` (worker)
- [ ] 노드 label 적용
  - `factory-c-master`: `aegis.factory-id=factory-c`, `aegis.environment-type=vm-windows`, `aegis.spoke-type=testbed`
  - `factory-c-worker`: 위 3개 + `aegis.input-module-type=dummy`
- [ ] master 노드에 control-plane taint (`NoSchedule`) 유지 확인
- [ ] Windows 호스트 무인 운영 설정: 절전 OFF / 자동 로그인 / Task Scheduler 2 작업 (master 즉시 + worker 60s 지연)
- [ ] Windows 재부팅 후 사람 개입 없이 두 VM 부팅 + 두 노드 Ready 자동 복구

### 🔍 Acceptance Criteria

- `kubectl get nodes` 에 `factory-c-master` (`control-plane,master`) + `factory-c-worker` (`<none>`) 모두 `Ready`
- K3s 버전 두 노드 동일하게 기록
- master 노드 taint 에 `node-role.kubernetes.io/control-plane:NoSchedule` 존재, worker 노드는 미부착
- Windows 호스트 재부팅 후 3~5분 내 사람 개입 없이 두 노드 Ready 복구
- 호스트 자원 합 4 vCPU / 6 GiB / 60 GiB 가 안정 동작

---

## Issue 3 - [Spoke/Tailscale] `factory-b`, `factory-c` Tailscale 참여 및 Hub 연결

### 🎯 목표 (What & Why)

두 VM Spoke를 Tailscale 네트워크에 참여시키고 Hub ArgoCD에서 접근 가능하게 한다.  
테스트베드형 Spoke는 운영형보다 상대적으로 넓은 접근 허용 범위를 가진다.

### ✅ 완료 조건 (Definition of Done)

- [ ] `factory-b` VM에 Tailscale 설치 및 네트워크 참여
  - M2에서 발급한 `factory-b` Auth Key 사용
- [ ] `factory-c` 두 VM (`factory-c-master`, `factory-c-worker`) 에 Tailscale 설치 및 네트워크 참여
  - M2에서 발급한 `factory-c` Auth Key 사용 (두 VM 이 같은 키를 쓰려면 **Reusable** 옵션 필요)
  - tags 공통: `tag:aegis-spoke-testbed`, `tag:factory-c`
  - hostname: `factory-c-master`, `factory-c-worker`
- [ ] Tailscale Admin 콘솔에서 세 노드 (`factory-b`, `factory-c-master`, `factory-c-worker`) `Connected` 확인
- [ ] EKS Hub에서 모든 Spoke Tailscale IP (`factory-b`, `factory-c-master`, `factory-c-worker`) 로 `ping` 성공
- [ ] kubeconfig Tailscale IP 기반으로 각각 생성 (cluster 단위 1개씩)
  - `factory-b.kubeconfig`
  - `factory-c.kubeconfig` (master VM 기준, `server:` 필드를 `TS_IP_MASTER` 로 rewrite)
- [ ] EKS 환경에서 두 kubeconfig로 `kubectl get nodes` 성공
  - `factory-c.kubeconfig` 는 두 노드 (`factory-c-master`, `factory-c-worker`) 모두 Ready 출력

### 🔍 Acceptance Criteria

- EKS에서 `factory-b`, `factory-c` kubeconfig로 K3s API 접근 성공
- Tailscale Admin 콘솔에서 `factory-b` + `factory-c-master` + `factory-c-worker` 모두 `Connected` 상태

---

## Issue 4 - [배포/ArgoCD] ApplicationSet에 `factory-b`, `factory-c` 추가

### 🎯 목표 (What & Why)

M3에서 구성한 ApplicationSet에 `factory-b`, `factory-c` Spoke를 추가하여  
3개 공장 모두 중앙 Hub에서 배포 관리되는 구조를 완성한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] ArgoCD에 `factory-b`, `factory-c` 클러스터 등록
  ```bash
  argocd cluster add factory-b --kubeconfig factory-b.kubeconfig
  argocd cluster add factory-c --kubeconfig factory-c.kubeconfig
  ```
- [ ] `factory-b`, `factory-c` values 파일 준비 및 검증
  - `environment_type`, `input_module_type`, 이미지/배포 대상 경로 반영
- [ ] ArgoCD ApplicationSet에 `factory-b`, `factory-c` values 경로 추가
- [ ] ApplicationSet에서 `aegis-spoke-factory-b`, `aegis-spoke-factory-c` Application 자동 생성 확인

### 🔍 Acceptance Criteria

- ArgoCD UI에서 3개 Application 모두 확인
  - `aegis-spoke-factory-a` (운영형)
  - `aegis-spoke-factory-b` (테스트베드형)
  - `aegis-spoke-factory-c` (테스트베드형)
- `factory-b`, `factory-c` 클러스터가 ArgoCD 배포 대상으로 정상 등록됨
- ApplicationSet에서 두 Application이 자동 생성됨 확인

---

## Issue 5 - [Spoke/Dummy Sensor] Dummy Sensor 모듈 구현 및 배포

### 🎯 목표 (What & Why)

VM 환경에서 실센서 없이 표준 입력 스키마에 맞는 더미 데이터를 생성하여 IoT Core로 전송하는 Dummy Sensor 모듈을 구현한다.  
시나리오별(정상/주의/위험) 값 생성과 수동 전환이 가능해야 한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Dummy Sensor 모듈 구현
  - 표준 입력 스키마 준수
  - `environment_type`: `vm-mac` / `vm-windows` 자동 설정
  - `input_module_type: dummy` 명시
- [ ] 시나리오 모드 구현 (수동 전환 방식)
  - `normal`: 정상 범위 값 생성
  - `warning`: 주의 범위 값 생성
  - `danger`: 위험 범위 값 생성
  - 구체 수치는 `docs/ops/03_test_checklist.md` 기반 테스트 후 보정
- [ ] 시나리오 전환 방법 구현 (예: 환경변수, ConfigMap)
- [ ] IoT Core 연결 및 메시지 전송 로직 (Edge Agent와 동일 방식)
- [ ] `factory-b`, `factory-c`에 각각 배포

### 🔍 Acceptance Criteria

- `factory-b`, `factory-c` K3s에서 Dummy Sensor 파드 `Running`
- ArgoCD에서 `factory-b`, `factory-c` Application `Synced` + `Healthy` 확인
- IoT Core에서 두 공장의 더미 메시지 수신 확인
- 시나리오 전환 후 생성되는 값의 범위 변화 확인

---

## Issue 6 - [배포/ArgoCD] 테스트베드형 동기화 정책 및 자동 롤백 적용

### 🎯 목표 (What & Why)

`factory-b`, `factory-c`에 운영형(`factory-a`)과 차별화된 배포 정책을 적용한다.  
테스트베드형은 빠른 반영과 자동 롤백을 허용하여 검증 사이클을 단축한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 테스트베드형 Sync 정책 적용
  - 자동 Sync (운영형보다 빠른 주기)
  - Self-heal 활성화
- [ ] 배포 실패 시 자동 롤백 설정
  - 운영형은 수동 확인 / 테스트베드형은 자동 롤백
- [ ] 정책 차이가 ArgoCD ApplicationSet에 명확히 반영됨 확인
- [ ] 정책 내용을 배포 파이프라인 관련 문서에 반영

### 🔍 Acceptance Criteria

- 의도적으로 잘못된 이미지 배포 후 `factory-b` 자동 롤백 확인
- `factory-a`는 동일 상황에서 자동 롤백 없이 `Degraded` 상태 유지
- ArgoCD UI에서 두 Spoke의 동기화 정책 차이 확인 가능

---

## Issue 7 - [검증/데이터] `factory-b`, `factory-c` 데이터 플레인 연결 확인

### 🎯 목표 (What & Why)

Dummy Sensor에서 생성된 데이터가 `factory-a`와 동일한 파이프라인으로  
IoT Core → S3까지 흐르는지 확인한다.  
3개 Spoke 모두 Hub에서 배포/수집 가능한 상태를 완성한다.

> 실행 전 확인:
> M4의 Lambda data processor가 `factory_id` 기준으로 다중 공장을 식별하고,
> Grafana/Hub에서 3개 공장 상태를 구분해 조회할 수 있어야 한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] `factory-b` 더미 데이터 → IoT Core → S3 적재 확인
  - 경로: `s3://bucket/factory-b/...`
- [ ] `factory-c` 더미 데이터 → IoT Core → S3 적재 확인
  - 경로: `s3://bucket/factory-c/...`
- [ ] S3에서 3개 공장 데이터가 독립 경로에 분리 적재 확인
- [ ] `pipeline_status` 집계 대상에 `factory-b`, `factory-c` 추가

### 🔍 Acceptance Criteria

- S3 콘솔에서 `factory-a/`, `factory-b/`, `factory-c/` 경로에 각각 데이터 적재 확인
- 3개 공장 `pipeline_status` 집계 결과 확인 가능
- Grafana 또는 Hub 관제 기준에서 3개 공장 상태가 분리 표시됨
- Dummy Sensor 중지 시 해당 공장 `pipeline_status` 이상 판정 확인
