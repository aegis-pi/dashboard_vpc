# M2. Mesh VPN + Hub-Spoke 연결

> **마일스톤 목표**: Tailscale을 기반으로 EKS Hub와 `factory-a` Spoke를 연결한다.  
> Hub(M1)와 Spoke(M0)가 모두 구성된 상태에서 진행하며,  
> 이 마일스톤이 완료되어야 ArgoCD 기반 배포(M3)와 데이터 플레인(M4)이 가능해진다.

---

## 수정 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-05-04 | rev-20260504-01 | Issue 3에 ArgoCD UI Tailscale private access 전환과 EKS API endpoint CIDR 축소 기준을 추가 |
| 2026-05-06 | rev-20260506-01 | Issue 1 Tailscale Tailnet/Auth Key 정책, 키 보관 방식, 장애 대응 원칙을 문서화 |
| 2026-05-06 | rev-20260506-02 | Tailscale Hub-Spoke 실제 진행 절차 runbook 참조를 추가 |
| 2026-05-07 | rev-20260507-01 | Tailnet tag 정책 적용, `factory-a-master` 및 Windows 운영자 PC Tailnet 참여 검증 결과를 반영 |
| 2026-05-07 | rev-20260507-02 | EKS Tailscale Operator egress, ArgoCD/Grafana Tailscale IP UI, ArgoCD sync 장애/복구 검증 결과를 반영 |

---

## Issue 1 - [Mesh/Tailscale] 계정 및 Spoke별 키 발급 정책 수립

### 목표 (What & Why)

Tailscale 네트워크의 인증/키 관리 정책을 먼저 수립한다.  
키가 Spoke별로 분리 발급되어야 개별 Spoke의 접근을 독립적으로 제어할 수 있다.  
정책 없이 키를 나누면 이후 운영 중 Tailscale 장애 대응이 어려워진다.

### 완료 조건 (Definition of Done)

- [x] Tailscale 계정 생성 및 Tailnet 구성
- [x] Spoke별 Auth Key 발급 방식 결정
  - `factory-a`, `factory-b`, `factory-c`, EKS Hub 각각 별도 키
- [x] Reusable Key vs One-time Key 정책 결정 및 기록
- [x] 키 보관 방법 결정 (Secret, 환경변수 등)
- [x] Tailscale 장애 시 대응 원칙 기록
  - 운영형(`factory-a`): 배포 중단, 보수 판단
  - 테스트베드형(`factory-b`, `factory-c`): 검증 중단, 재시도
- [x] 접근 정책을 Mesh VPN 관련 문서에 반영

### Acceptance Criteria

- Tailscale Admin 콘솔에서 Tailnet 생성 확인
- 각 환경별 Auth Key 생성 확인
- 키 관리 정책 문서화 완료

### 진행 상태

- 상태: 완료
- 정책 문서: `infra/mesh-vpn/README.md`
- 실행 절차: `docs/ops/20_tailscale_hub_spoke_runbook.md`
- 실제 키 값, Tailnet 이름, 계정 이메일, Secret 값은 issue/document에 기록하지 않는다.
- Tailscale Admin Console에서 Aegis-Pi 전용 Tailnet을 확인하고, tag owner 정책을 적용했다.
- `factory-a`용 one-off tagged Auth Key는 생성했지만, secret 노출을 피하기 위해 실제 `factory-a-master` 등록은 interactive login 후 ACL tag 수동 적용 방식으로 완료했다. 생성했던 미사용 Auth Key는 revoke 대상이다.

### 실행 절차 문서

Tailscale Admin Console 설정, OAuth client 생성, Spoke별 Auth Key 생성, Hub EKS Tailscale Operator 설치, Spoke Tailnet 참여, Tailscale IP 기반 kubeconfig 생성, ArgoCD cluster 등록 순서는 `docs/ops/20_tailscale_hub_spoke_runbook.md`를 따른다.

이 issue 본문에는 정책과 완료 상태만 남기고, 실제 실행 명령과 순서는 runbook에서 관리한다. secret 값은 runbook, issue, evidence, Git 어디에도 기록하지 않는다.

### 정책 결정

#### Tailnet 기준

- Aegis-Pi 전용 Tailnet을 사용한다.
- Tailscale은 Hub가 Spoke K3s API에 접근하고 ArgoCD가 배포를 제어하기 위한 운영/제어망이다.
- 관리자 대시보드 접근망은 Tailscale이 아니라 Dashboard VPC로 분리한다.
- Tailnet device 이름은 공장/역할을 바로 식별할 수 있게 아래 기준으로 둔다.
  - `factory-a-master`
  - `factory-b`
  - `factory-c`
  - `aegis-hub`

#### Auth Key 발급 단위

환경별로 Auth Key를 분리한다. 한 키를 여러 공장 또는 Hub에 재사용하지 않는다.

| 대상 | 용도 | 기본 키 유형 | 태그/식별 기준 | 비고 |
| --- | --- | --- | --- | --- |
| `factory-a` | 운영형 Raspberry Pi master | One-off, pre-approved, tagged | `tag:aegis-spoke-prod`, `tag:factory-a` | 초기 M2에서는 master만 참여한다. Worker 노드는 제외한다. |
| `factory-b` | Mac VM 테스트베드 | One-off 우선, VM 재생성 반복 시 short-lived reusable 허용 | `tag:aegis-spoke-testbed`, `tag:factory-b` | reusable 사용 시 7일 이하 만료 후 즉시 revoke한다. |
| `factory-c` | Windows VM 테스트베드 | One-off 우선, VM 재생성 반복 시 short-lived reusable 허용 | `tag:aegis-spoke-testbed`, `tag:factory-c` | reusable 사용 시 7일 이하 만료 후 즉시 revoke한다. |
| EKS Hub | ArgoCD/운영 제어망 | Issue 3 운영 방식 결정 후 발급 | `tag:aegis-hub` | Operator/DaemonSet/Subnet Router 방식 결정 전 실제 발급하지 않는다. |

#### One-off vs Reusable 원칙

- 기본값은 One-off Auth Key다.
- 운영형 `factory-a`에는 reusable key를 사용하지 않는다.
- 테스트베드형 `factory-b`, `factory-c`는 VM 삭제/재생성이 반복되는 동안에만 short-lived reusable key를 허용한다.
- reusable key는 7일 이하 만료로 만들고, VM bootstrap이 끝나면 즉시 revoke한다.
- EKS Hub는 Issue 3에서 운영 방식을 먼저 결정한다. 장기 실행 Subnet Router라면 one-off key를 쓰고, Kubernetes workload로 반복 생성되는 구조라면 Tailscale OAuth client 또는 짧은 수명의 key 발급 자동화를 검토한다.

#### 키 보관 원칙

- Auth Key, OAuth client secret, kubeconfig credential은 Git에 커밋하지 않는다.
- issue, README, evidence, screenshot, command output에 secret 값을 남기지 않는다.
- 로컬 임시 보관이 필요하면 repository 밖의 사용자 전용 경로에 둔다.
  - 예: `~/.aegis/secrets/tailscale/`
- Hub Kubernetes에서 사용할 값은 수동 생성 Kubernetes Secret 또는 후속 External Secrets/SOPS/SealedSecrets 후보로 관리한다.
- `.env`, `*.key`, `*tailscale*secret*`, `factory-*.kubeconfig`는 커밋 금지 대상으로 유지한다.

#### 접근 정책 초안

- Hub/ArgoCD 계층은 Spoke K3s API `tcp/6443`에 접근할 수 있어야 한다.
- 운영자 로컬 장비는 필요 시 Spoke SSH `tcp/22`와 K3s API `tcp/6443`에 접근한다.
- Spoke 간 직접 접근은 기본적으로 허용하지 않는다.
- Spoke에서 Hub/EKS/ArgoCD admin API로 직접 접근하는 흐름은 만들지 않는다.
- Dashboard VPC, Dashboard Web/API는 Tailscale, EKS API, ArgoCD API, Spoke K3s API에 접근하지 않는다.

#### 장애 대응 원칙

- `factory-a` 운영형: Tailscale 장애 시 ArgoCD 배포와 원격 운영을 중단한다. 로컬 Safe-Edge workload는 계속 운영하고, 복구 전까지 수동 배포/변경을 보류한다.
- `factory-b`, `factory-c` 테스트베드형: Tailscale 장애 시 해당 테스트를 중단하고 VM/Tailscale 재참여 후 재시도한다. 테스트 데이터 누락은 실패 evidence로 기록한다.
- Hub Tailscale 장애: 신규 Sync/검증은 중단한다. 이미 배포된 Spoke workload는 유지되며, 복구 후 ArgoCD cluster connection과 test Application sync를 다시 확인한다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: Tailnet tag owner 정책을 적용했고, `factory-a`용 one-off tagged Auth Key 생성 정책과 secret 비기록 원칙을 확인했다. 실제 `factory-a-master` 등록은 secret 노출을 피하기 위해 interactive login 후 ACL tag를 수동 적용하는 방식으로 완료했다.
- 변경/확인: `docs/issues/M2_mesh-vpn-hub-spoke.md`, `infra/mesh-vpn/README.md`, `docs/ops/20_tailscale_hub_spoke_runbook.md`
- 검증: Tailscale Admin Console에서 `factory-a-master`와 Windows 운영자 PC가 connected 상태로 표시되고, `factory-a-master`에는 `tag:aegis-spoke-prod`, `tag:factory-a`를 적용했다.
- 후속: 미사용 `factory-a-master` Auth Key는 revoke한다. EKS Hub는 M2 Issue 3에서 Tailscale Kubernetes Operator/OAuth client 방식으로 진행한다.

---

## Issue 2 - [Mesh/Tailscale] `factory-a` Master Tailscale 참여 및 확인

### 목표 (What & Why)

`factory-a` K3s 클러스터의 Master 노드를 Tailscale 네트워크에 참여시킨다.  
Worker 노드는 초기 Mesh 참여 대상에서 제외하고, Master 중심 접근 정책을 유지한다.

### 완료 조건 (Definition of Done)

- [x] Master 노드에 Tailscale 설치
- [x] Tailscale 네트워크 참여
- [x] Tailscale IP 확인 및 기록 (`tailscale ip`)
- [x] Tailscale Admin 콘솔에서 `factory-a` Master 노드 확인
- [x] Tailscale IP로 Master SSH 접근 가능 확인

### Acceptance Criteria

- Tailscale Admin 콘솔에서 `factory-a` Master 노드 `Connected` 상태
- 외부 환경(Host PC 또는 로컬)에서 Tailscale IP로 `ping` 응답
- Tailscale IP로 SSH 접근 성공

### 완료 기록

- 완료일: 2026-05-07
- Device: `factory-a-master`
- Tailscale IPv4: `100.117.40.125`
- Tailscale FQDN: `factory-a-master.tailf83767.ts.net`
- 적용 tag: `tag:aegis-spoke-prod`, `tag:factory-a`
- 운영자 Windows PC device: `minsoog14`, Tailscale IPv4 `100.67.181.8`
- 설치 버전: Tailscale `1.96.4`
- 검증: `factory-a-master`에서 `tailscale status --self`, `tailscale ip -4` 정상 확인. Windows PC에서 `100.117.40.125` ping 및 SSH 접근 성공 확인.
- 비고: 초기 등록은 secret 노출 방지를 위해 Auth Key CLI 입력 대신 interactive login 후 ACL tag 수동 적용 방식으로 수행했다. Worker 노드는 초기 M2 Tailnet 참여 대상에서 제외한다.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: `factory-a-master`에 Tailscale `1.96.4`를 설치하고 Tailnet에 참여시켰다. Admin Console에서 `tag:aegis-spoke-prod`, `tag:factory-a`를 적용했으며 Windows 운영자 PC도 Tailnet에 참여시켰다.
- 변경/확인: `factory-a-master` Tailscale IPv4 `100.117.40.125`, Windows 운영자 PC `minsoog14` Tailscale IPv4 `100.67.181.8`
- 검증: Windows PC에서 `100.117.40.125` ping 및 SSH 접근 성공을 확인했다.
- 후속: M2 Issue 3에서 EKS Hub Tailscale Kubernetes Operator/OAuth client 구성을 진행하고, Hub 내부에서 `factory-a-master` Tailscale IP reachability를 검증한다.

---

## Issue 3 - [Mesh/Tailscale] EKS Hub Tailscale 참여 및 확인

### 목표 (What & Why)

EKS Hub가 Tailscale 네트워크에 참여하여 각 Spoke Master에 도달할 수 있는 경로를 확보한다.  
EKS 환경에서는 Operator, DaemonSet, 또는 별도 Subnet Router 중 하나의 운영 방식을 먼저 결정해야 하며,  
이 결정이 이후 kubeconfig 접근 방식과 ArgoCD 연결 구조의 기준이 된다.

이 이슈에서 ArgoCD UI 접근 경로도 함께 정리한다. M1에서는 사용자가 로컬 PC에서 `kubectl port-forward`로 접속하고, M2 이후에는 public LoadBalancer 없이 Tailscale 기반 private access로 접근하는 것을 목표로 한다.

### 완료 조건 (Definition of Done)

- [x] EKS 환경에서 Tailscale 운영 방식 결정 및 적용
  - 방식 예: Tailscale Operator, DaemonSet, 또는 별도 EC2 Subnet Router
- [x] 선택한 방식의 장단점과 운영 기준 기록
- [x] EKS Hub Tailscale 네트워크 참여
- [x] Tailscale Admin 콘솔에서 EKS Hub 노드 확인
- [x] EKS → `factory-a` Master K3s API TCP `6443` reachability 확인
- [x] ArgoCD UI 접근 경로를 Tailscale 기반 private access로 정리
- [x] ArgoCD public `LoadBalancer`를 만들지 않는 기준 유지
- [x] EKS API endpoint public CIDR `0.0.0.0/0` 축소는 설계 마무리 후 재검토로 보류 기록

### Acceptance Criteria

- 선택한 운영 방식이 문서에 명시되어 있음
- Tailscale Admin 콘솔에서 EKS Hub `Connected` 상태
- EKS 파드 내부에서 `factory-a` Master K3s API TCP `6443` reachability 성공
- 사용자 로컬에서 Tailscale 경유로 ArgoCD UI 접근 가능
- EKS API endpoint 접근 범위 축소 여부는 전체 설계 마무리 후 재검토 대상으로 기록됨

### 진행 기록

2026-05-07 기준 EKS Hub는 Tailscale Kubernetes Operator 방식으로 진행한다. 별도 EC2 Subnet Router는 Hub EKS 외부 리소스를 늘리므로 보류하고, DaemonSet/sidecar 직접 구성은 장기 운영 기준에서 Operator보다 우선하지 않는다.

적용/검증:

- `tailscale-operator` Helm release를 `tailscale` namespace에 설치 완료
- `tailscale/operator` Pod `1/1 Running`, Deployment `1/1 Available` 확인
- Tailscale CRD `connectors`, `dnsconfigs`, `proxyclasses`, `proxygroups`, `tailnets` 생성 확인
- `argocd/factory-a-master-tailnet` ExternalName Service 생성
- Operator가 Service `spec.externalName`을 `ts-factory-a-master-tailnet-wp5c2.tailscale.svc.cluster.local`로 갱신
- egress proxy Pod `tailscale/ts-factory-a-master-tailnet-wp5c2-0` `1/1 Running` 확인
- EKS `argocd` namespace 임시 busybox Pod에서 `factory-a-master-tailnet:6443` TCP open 확인
- Tailscale Admin Console에서 `tailscale-operator` (`tag:k8s-operator`)와 `argocd-factory-a-master-tailnet` (`tag:k8s`) Connected 확인
- ArgoCD Tailscale UI Service `argocd/argocd-server-tailscale` 생성, `https://100.108.140.35/` HTTP 200 확인
- Grafana Tailscale UI Service `observability/grafana-tailscale` 생성, `http://100.108.4.6/api/health` HTTP 200 확인
- 기존 M1 Public ALB는 단기 운영 검증을 위해 유지한다. M2에서는 Tailscale IP 경로를 추가 검증했고, ArgoCD `argocd-server` 자체를 public Kubernetes `LoadBalancer` Service로 전환하지 않았다.

결정/보류:

- Issue 본문은 `ping`이라고 되어 있으나 현재 검증 경로는 Operator egress proxy를 통한 K3s API TCP `6443` reachability다. ICMP 검증이 반드시 필요하면 별도 Connector/Subnet Router 방식 여부를 다시 판단한다.
- EKS API endpoint public CIDR 축소는 이후 설계가 닫힌 뒤 재검토한다. 현재 단계에서 축소하면 후속 bootstrap/운영 경로를 불필요하게 막을 수 있어 M2 필수 실행 범위에서 제외한다.

---

## Issue 4 - [Mesh/Tailscale] kubeconfig Tailscale IP 기반 구성

### 목표 (What & Why)

ArgoCD가 `factory-a` K3s API에 접근할 수 있도록 kubeconfig를 Tailscale IP 기반으로 구성한다.  
이름 기반 주소는 후속 전환 시에만 사용하고, 현재는 Tailscale IP를 기준으로 한다.

> 실행 전 확인:
> K3s API 서버 인증서가 Tailscale IP 접속을 허용하는지 먼저 검증한다.
> 필요하면 API 서버 인증서 SAN 설정 또는 접근 방식을 조정한다.

### 완료 조건 (Definition of Done)

- [x] `factory-a` K3s API 서버 인증서의 Tailscale IP 허용 여부 확인
- [x] `factory-a` K3s API 서버 주소를 Tailscale IP로 교체한 kubeconfig 생성
  - 예: `server: https://<tailscale-ip>:6443`
- [x] kubeconfig 유효성 확인
  - `kubectl --kubeconfig=factory-a.kubeconfig get nodes`
- [x] kubeconfig 파일 보안 보관 방법 결정 (Secret 또는 파일)
- [x] EKS 환경에서 해당 kubeconfig로 `factory-a` K3s API 접근 확인

### Acceptance Criteria

- Tailscale IP 기반 K3s API 접속 시 TLS/인증서 오류 없이 `kubectl get nodes` 성공
- EKS 환경에서 `factory-a` kubeconfig로 `kubectl get nodes` 성공
- 응답 결과에 `master`, `worker-1`, `worker-2` 노드 확인

### 진행 기록

2026-05-07 기준 `factory-a-master`의 원본 K3s kubeconfig를 로컬 secret 경로에 저장했다.

보관 기준:

```text
~/Aegis/.aegis/secrets/kubeconfig/factory-a.raw.kubeconfig
~/Aegis/.aegis/secrets/kubeconfig/factory-a.lan.kubeconfig
~/Aegis/.aegis/secrets/kubeconfig/factory-a.tailscale-ip.kubeconfig
~/Aegis/.aegis/secrets/kubeconfig/factory-a.tailscale-ip-tlsname.kubeconfig
~/Aegis/.aegis/secrets/kubeconfig/factory-a.argocd-egress.kubeconfig
```

검증 결과:

- 원본 kubeconfig `server`는 `https://127.0.0.1:6443`
- LAN 검증용 `server: https://10.10.10.10:6443`에서 `kubectl get nodes -o wide` 성공
- Tailscale IP만 사용한 `server: https://100.117.40.125:6443`는 TLS SAN 오류 발생
- K3s API certificate SAN은 `10.10.10.10`, `10.43.0.1`, `127.0.0.1`, `192.168.0.45`, `::1`이며 `100.117.40.125`는 없음
- `tls-server-name: 10.10.10.10`을 kubeconfig에 추가하면 `server: https://100.117.40.125:6443`로 `kubectl get nodes -o wide` 성공
- EKS 내부 검증은 `server: https://factory-a-master-tailnet.argocd.svc.cluster.local:6443`와 `tls-server-name: 10.10.10.10` 조합으로 성공
- EKS `argocd` namespace 임시 kubectl Pod에서 `master`, `worker1`, `worker2` 모두 `Ready` 확인

결론: K3s server certificate를 재발급하지 않고도 kubeconfig의 `tls-server-name`으로 M2/MVP 검증은 가능하다. 장기 운영에서는 K3s `tls-san`에 `factory-a-master` Tailnet IP 또는 MagicDNS 이름을 추가할지 별도 판단한다.

---

## Issue 5 - [배포/ArgoCD] `factory-a` Spoke 클러스터 등록

### 목표 (What & Why)

ArgoCD가 `factory-a` K3s 클러스터를 배포 대상으로 인식하게 한다.  
이 등록이 완료되어야 ArgoCD에서 Application/ApplicationSet을 생성해 Spoke에 배포할 수 있다.

### 완료 조건 (Definition of Done)

- [x] ArgoCD CLI로 `factory-a` 클러스터 등록
  ```bash
  argocd cluster add factory-a --kubeconfig factory-a.kubeconfig
  ```
- [x] ArgoCD UI에서 `factory-a` 클러스터 확인
- [x] ArgoCD에서 `factory-a` 클러스터 상태 `Successful` 확인
- [x] 클러스터 이름 및 레이블 규칙 기록 (추후 ApplicationSet 자동화 기반)

### Acceptance Criteria

- ArgoCD UI Clusters 탭에서 `factory-a` 클러스터 확인
- 클러스터 상태 `Connection Status: Successful`
- ArgoCD에서 `factory-a`로 테스트 Application 배포 가능

### 진행 기록

2026-05-07 기준 ArgoCD에 `factory-a` cluster를 등록했다.

등록 방식:

- `argocd cluster add`는 로컬 CLI가 target cluster에 먼저 접속해 `argocd-manager` ServiceAccount/RBAC/token을 만든다.
- EKS 내부 Service DNS인 `factory-a-master-tailnet.argocd.svc.cluster.local` kubeconfig로는 로컬 CLI 단계가 실패하므로, 로컬 등록 단계는 `factory-a.tailscale-ip-tlsname.kubeconfig`로 수행했다.
- `argocd cluster add`가 target cluster의 `kube-system/argocd-manager` ServiceAccount, ClusterRole, ClusterRoleBinding, long-lived token Secret 생성을 완료했다.
- 최종 ArgoCD cluster secret은 EKS 내부 egress Service를 바라보도록 `argocd/cluster-factory-a` Secret으로 구성했다.

등록 결과:

```text
cluster name: factory-a
server: https://factory-a-master-tailnet.argocd.svc.cluster.local:6443
tls server name: 10.10.10.10
status: Successful
version: v1.34.6
```

ApplicationSet 대비 cluster 이름은 `factory-a`로 고정한다. 후속 label 규칙은 M3 ApplicationSet 설계에서 `factory`, `spoke-type`, `environment-type` 기준으로 정한다.

---

## Issue 6 - [검증/ArgoCD] Hub → `factory-a` K3s API 접근 및 Sync 확인

### 목표 (What & Why)

Hub ArgoCD가 `factory-a` Spoke를 실제로 바라보고 Sync가 동작하는지 end-to-end로 검증한다.  
이 확인이 완료되어야 M2 마일스톤이 완료되고 M3(배포 파이프라인), M4(데이터 플레인)로 넘어갈 수 있다.

### 완료 조건 (Definition of Done)

- [x] 테스트용 최소 Application 정의
  - 예: 단순 Deployment + Service 형태의 `nginx` 또는 동등 수준 앱
  - 별도 테스트 namespace 사용
- [x] ArgoCD에서 `factory-a` 대상 테스트 Application 생성
- [x] ArgoCD Sync 동작 확인 (`Synced` 상태 전환)
- [x] `factory-a` K3s에 테스트 리소스 배포 확인
  - `kubectl --kubeconfig=factory-a.kubeconfig get pods`
- [x] Tailscale 연결이 끊어진 상태에서 ArgoCD Sync 실패 동작 확인 (장애 대응 검증)
- [x] M2 완료 기준 및 결과를 Mesh VPN 관련 문서에 반영

### Acceptance Criteria

- ArgoCD에서 `factory-a` 대상 Application `Synced` + `Healthy` 확인
- 테스트용 Application이 `factory-a`에 실제 배포되어 `Running` 확인
- `factory-a` K3s에 테스트 파드 배포 확인
- Tailscale 차단 시 ArgoCD sync failure 확인

### 진행 기록

2026-05-07 기준 정상 경로 Sync와 Tailscale egress 장애/복구 검증을 완료했다.

테스트 Application:

```text
name: factory-a-podinfo-smoke
repo: https://github.com/stefanprodan/podinfo
path: kustomize
destination cluster: factory-a
destination server: https://factory-a-master-tailnet.argocd.svc.cluster.local:6443
namespace: aegis-m2-smoke
sync option: CreateNamespace=true
```

검증 결과:

- `argocd app sync factory-a-podinfo-smoke --timeout 180` 성공
- Application `Sync Status: Synced`
- Application `Health Status: Healthy`
- `factory-a` K3s namespace `aegis-m2-smoke` 생성 확인
- `podinfo` Deployment `2/2 Available`
- `podinfo` Pod 2개 `Running`, worker1/worker2에 배치 확인
- 장애 검증: `argocd/factory-a-master-tailnet` Service 삭제 시 EKS 내부 DNS가 `factory-a-master-tailnet`을 해석하지 못했고, `argocd app sync factory-a-podinfo-smoke --timeout 60`이 `no such host` 오류로 실패했다.
- 복구 검증: 동일 Service를 재생성하자 Operator가 `ts-factory-a-master-tailnet-jfvcc.tailscale.svc.cluster.local`로 externalName을 다시 설정했고, proxy Pod `tailscale/ts-factory-a-master-tailnet-jfvcc-0` `1/1 Running`, TCP `6443` open, `argocd app sync factory-a-podinfo-smoke --timeout 180` 성공, Application `Synced` + `Healthy`, cluster status `Successful`을 확인했다.

시도 후 제외한 테스트:

- `argoproj/argocd-example-apps`의 `guestbook`은 `gcr.io/google-samples/gb-frontend:v5`가 Raspberry Pi ARM64에서 `exec format error`로 실패해 smoke 기준에서 제외했다.
- Bitnami nginx Helm chart는 ArgoCD repo-server가 chart manifest generation 중 재시작해 smoke 기준에서 제외했다.

결론: M2의 Hub -> `factory-a` 제어망은 Tailscale Operator egress proxy 기준으로 검증 완료다. Public ALB는 단기 접근 경로로 유지하고, ArgoCD/Grafana Tailscale IP UI 경로는 병행 검증 완료 상태로 둔다.
