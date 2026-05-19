# 0019. factory-c 토폴로지: single-node → master + worker (2-VM K3s cluster)

상태: accepted
결정일: 2026-05-19
관련 범위: M5 VM Spoke 확장, factory-c testbed, 데모/시연 표현

## 기존 계획

`configs/runtime/runtime-config.yaml` 의 factory-c 블록은 `topology: single-node`, nodes 배열 1개 (`name: factory-c`, `role: single-node`) 로 정의되어 있었다.

`docs/ops/19_factory_c_windows_virtualbox_k3s.md` v3 도 VirtualBox VM 1대에 K3s single-node 를 까는 절차로 작성되어 있다.

같은 패턴이 factory-b (Mac UTM, `docs/ops/18_factory_b_mac_utm_k3s.md`) 에도 적용되어 있지만, factory-b 는 문서 상태 `draft` + runtime-config `status: planned` 로 실제 구축 전이다.

## 변경된 실제 기준

factory-c 는 **VirtualBox VM 2대로 구성되는 master + worker K3s cluster** 다. K3s 컴포넌트 명칭으로는 master VM 이 K3s server, worker VM 이 K3s agent 다.

| 노드 | 역할 | VM 사이즈 | label |
| --- | --- | --- | --- |
| `factory-c-master` | K3s server (control plane). 워크로드 미배치 | 2 vCPU / 2 GiB / 20 GiB | `aegis.factory-id=factory-c`, `aegis.environment-type=vm-windows`, `aegis.spoke-type=testbed` |
| `factory-c-worker` | K3s agent (worker). dummy publisher, Edge Agent dummy mode 배치 | 2 vCPU / 4 GiB / 40 GiB | 위 3개 + `aegis.input-module-type=dummy` |

`workload_placement.preferred_node` 는 `factory-c-worker` 로 변경. control plane 노드는 default taint (`node-role.kubernetes.io/control-plane:NoSchedule`) 유지.

cluster-level 자원은 변동 없음:

- IoT Thing 1개 (`AEGIS-IoTThing-factory-c`)
- K3s Secret 1개 (`ai-apps/aws-iot-factory-c-cert`)
- IoT Rule 1개 (ADR 0018, `AEGIS_IoTRule_factory_c_raw_s3`)
- ArgoCD cluster 등록 1회 (master API 기준)
- kubeconfig 1개 (master VM 기준)
- Tailscale 참여는 master / worker 각각 (reusable Auth Key 1개로 가능)

## 변경 이유

### "실제 공장처럼 보이는" 시연/검증 요구

- factory-c 의 명시 목적은 "멀티 공장 식별 · 배포 · 데이터 분리 · Dashboard 표시 검증" 이다 (`docs/ops/19_factory_c_windows_virtualbox_k3s.md` § Factory C 확정 구성).
- single-node 는 식별/데이터 분리에는 충분하지만, Dashboard 가 표시하는 `infra_state.payload.nodes` 배열이 1개라 "공장 안에 여러 노드가 있는 운영 환경" 으로 보이지 않는다.
- factory-a 는 3-node (master + worker1 + worker2) 라 Dashboard 가 multi-node 표를 보여주는데, factory-c 가 single-node 면 시연에서 한 공장만 정상으로 보이고 다른 공장은 단순화된 형태로 보여 일관성이 떨어진다.

### node label 4종 + workload placement 가 의미를 갖는 환경

- single-node 에서는 `aegis.input-module-type=dummy` label 부착 + `preferred_node` 설정이 항상 매칭되어 검증 가치가 낮다.
- master + worker 구성에서는 master 에 `NoSchedule` taint, worker 에 `input-module-type=dummy` label 이 부착되어 **워크로드가 의도된 노드(worker) 로 가는지** 가 검증된다.

### Computer 3 자원 여유

- 호스트 사양: 11th Gen i7-11700 (8 core / 16 thread) + 16 GiB RAM.
- 2-VM 할당 합 6 GiB → 호스트에 10 GiB 잔여, Windows + VirtualBox 오버헤드 후에도 안정 동작 가능.

### 2-VM 으로 가지 않는 대안의 한계

- single-node + 가짜 nodes 배열 (publisher 가 만들어 보냄) 도 가능하나, Edge Agent dummy mode (Step 14) 로 전환 시 실제 cluster 와 어긋나 일관성이 깨진다.
- 3-VM HA control plane 은 split-brain 회피 위해 3대 필요 → 자원 추가 부담 vs 시연 이득이 낮음.

## 영향

### Computer 3 Windows 호스트

- VM 2대 자동 시작: Task Scheduler 작업 2개 (`Start factory-c-master VM`, `Start factory-c-worker VM`).
- worker 는 master 가 먼저 떠 있어야 첫 join 이 매끄럽다. Task Scheduler 의 worker 작업은 master 작업보다 60초 지연으로 시작한다. 단, k3s-agent.service 는 retry 가 있으므로 부팅 순서 어긋나도 결국 join 된다.
- VirtualBox VM 자원 합 4 vCPU / 6 GiB / 60 GiB.

### Tailscale

- master / worker 각각 Tailscale 노드. hostname: `factory-c-master`, `factory-c-worker`. tags 동일 (`tag:aegis-spoke-testbed`, `tag:factory-c`).
- worker 의 K3s agent 가 master API (6443) 에 도달하기 위해 Tailscale IP 를 사용. K3s install 명령에 `K3S_URL=https://<TS_IP_MASTER>:6443` 명시.

### K3s

- master VM 에 K3s server 설치 후 token (`/var/lib/rancher/k3s/server/node-token`) 추출이 새로 필요.
- worker VM 에 K3s agent 설치 시 `K3S_TOKEN`, `K3S_URL`, `INSTALL_K3S_EXEC="agent --node-name factory-c-worker"` 사용.
- K3s server 의 `--tls-san` 에 master 자신의 Tailscale IP 만 포함하면 충분 (kubeconfig 가 master 기준).

### dummy publisher (Step 11)

- worker VM 에 systemd 로 배치 (worker 노드가 워크로드 실행 위치라는 의미와 일치).
- worker VM 에는 kubectl 이 기본 미설치 → `k3s` 바이너리에 포함된 `k3s kubectl` 사용 또는 K3s 버전을 install 시점에 `/etc/aegis/dummy-publisher.env` 에 박아 두고 publisher 가 환경변수로 읽음 (본 ADR 은 후자 채택, runtime 의존성 최소화).
- publisher 의 `infra_state.payload.nodes` 배열을 master / worker 두 개로 갱신. 각 `role` 값은 `control-plane` / `worker`.

### Step 8 K3s Secret 주입

- `register-k3s-secret.sh` 의 `REMOTE_HOST` 는 master VM 의 Tailscale IP. Secret 은 cluster-scope 의 ns `ai-apps` 에 등록되어 worker 노드에 스케줄된 pod 도 그대로 마운트 가능.

### Step 12 kubeconfig

- master VM 에서만 추출 (`/etc/rancher/k3s/k3s.yaml`).
- master 의 Tailscale IP 로 server 주소 rewrite. context rename `default` → `factory-c` 변동 없음.

### Step 13 ArgoCD

- 변경 없음. cluster 등록 1회.

### Step 14 Edge Agent

- ApplicationSet / Helm values 에 `nodeSelector: { aegis.input-module-type: dummy }` 추가 권장 → worker 노드에만 배치.
- (선택) `tolerations` 으로 control plane taint 회피는 default 거동.

### factory-b 영향

- factory-b 의 topology 결정은 본 ADR 범위 밖. factory-b 실제 구축 시점 (Mac mini RAM/CPU 사양 확정 후) 별도 ADR 또는 본 ADR follow-up 으로 결정한다.

### 비용

- AWS 측 영향 없음 (IoT Thing/Rule/S3/Hub 동일).
- 운영 호스트 (Computer 3) 자원 부담만 증가.

### 회귀 위험

- 기존 single-node 구성 미배포 상태에서의 변경이므로 회귀 위험 없음.
- factory-a (3-node Pi) 와 factory-b (single-node 미구축) 에는 영향 없음.

## 업데이트 필요한 문서

- `configs/runtime/runtime-config.yaml` factory-c 블록 (nodes 배열 2개, preferred_node 갱신)
- `docs/ops/19_factory_c_windows_virtualbox_k3s.md` 전반 (v4)
- `docs/changes/README.md` 인덱스
- (follow-up) `docs/specs/iot_data_format.md` 의 `infra_state.payload.nodes` 예시에 server+agent 사례 추가 검토
- (follow-up) `docs/issues/M5_vm-spoke-expansion.md` factory-c 항목

## 검증

- `kubectl get nodes` 두 노드 (`factory-c-master` control-plane, `factory-c-worker` worker) 모두 Ready
- `kubectl get node factory-c-master -o jsonpath='{.spec.taints}'` 에 `NoSchedule` taint 존재
- `kubectl get node factory-c-worker --show-labels` 에 `aegis.input-module-type=dummy` 포함, master 노드에는 미부착
- dummy publisher journal 에 `mosquitto_pub` 반복 호출 + `/var/lib/aegis/publish-sequence` 가 20초마다 증가
- S3 `raw/factory-c/infra_state/...json` 1건 다운로드 시 `payload.nodes` 배열 길이 == 2, `role` 값이 각각 `control-plane`, `worker`
- ArgoCD cluster `factory-c` Successful (master API 기준 1회 등록)
- Computer 3 재부팅 후 사람 개입 없이 master VM → worker VM 자동 부팅 → 두 노드 Ready 확인 (약 3~5분)
