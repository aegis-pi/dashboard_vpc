# M3. 배포 파이프라인

> **마일스톤 목표**: GitHub Actions → ECR → ArgoCD → Spoke 롤아웃 흐름을 자동화한다.  
> M2(Hub-Spoke 연결) 완료 후 진행하며, M4(데이터 플레인)와 병렬 진행 가능하다.  
> 이 마일스톤이 완료되면 push 한 번으로 `factory-a`에 배포가 자동으로 흐른다.

---

## 수정 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-05-04 | rev-20260504-01 | GitHub Actions는 CI, GitHub+ArgoCD는 CD로 사용하는 책임 경계 기준을 반영 |
| 2026-05-13 | rev-20260513-01 | 기존 배포 파이프라인 초안은 유지하고, CI/CD가 필요한 이유를 일일 리포트 기반 모델/설정 업데이트 피드백 루프로 보강 |
| 2026-05-14 | rev-20260514-01 | M3 Issue 1 GitOps 저장소 구조, 공장별 values, smoke chart, manifest validation 완료 상태 반영 |
| 2026-05-14 | rev-20260514-02 | M3 Issue 2 ECR 범위를 `edge-agent`로 확정하고 `infra/foundation` Terraform source를 추가 |
| 2026-05-15 | rev-20260515-01 | M3 Issue 4 ApplicationSet을 Ansible bootstrap으로 적용하고 `factory-a` Sync/Healthy 검증 완료 상태 반영 |

---

## 책임 경계

이 마일스톤은 `docs/planning/11_delivery_ownership_flow.md`를 따른다.

```text
GitHub Actions:
  CI, image build, test, ECR push, manifest/value update

GitHub + ArgoCD:
  CD, Application/ApplicationSet sync, deployment drift control
```

GitHub Actions는 운영 클러스터에 직접 `kubectl apply`하지 않는다. 실제 배포는 GitHub repository에 남은 desired state를 ArgoCD가 sync하는 방식으로 수행한다.

---

## 2026-05-13 멘토링 반영: CI/CD 필요성 보강

### 기존 초안

기존 M3 초안은 GitHub Actions -> ECR -> ArgoCD -> Spoke rollout 흐름을 자동화하는 데 집중했다. 이 초안은 유지한다.

```text
GitHub Actions
  -> image build / ECR push
  -> Helm values update
  -> Hub ArgoCD sync
  -> factory-a rollout
```

### 변경 이유

멘토링에서는 "이 서비스가 지속적인 CI/CD가 필요한 환경인지"를 먼저 설명해야 한다는 피드백이 있었다. Edge Agent를 한 번 배포하는 것만으로는 CI/CD의 필요성이 약해 보일 수 있다.

### 보강 방향

Aegis-Pi는 Edge AI 추론 결과, 사고 이미지, Risk Score를 중앙에 모아 일일 운영 리포트 초안을 만들고, 이 결과를 바탕으로 모델 또는 설정 업데이트 후보를 찾는다.

```text
Edge AI / Sensor 이벤트
  -> IoT Core / S3 raw / latest status
  -> Risk Score + 일일 운영 리포트
  -> 실패/불확실 사례와 설정 보정 후보 확인
  -> 운영자 승인
  -> GitHub Actions / ECR / ArgoCD로 Edge workload 업데이트
```

따라서 M3 배포 파이프라인은 단순 자동화가 아니라, 운영 피드백을 Edge 워크로드 개선으로 연결하기 위한 기반이다. MVP에서는 자동 재학습이나 운영자 승인 없는 자동 배포는 포함하지 않고, 승인된 변경을 GitOps로 배포하는 범위까지 검증한다.

---

## Issue 1 - [배포/Helm] GitHub 저장소 구조 설계 (베이스 + 공장별 values)

### 목표 (What & Why)

공통 베이스 Helm 차트와 공장별 values 파일을 분리하는 저장소 구조를 확정한다.  
이 구조가 ArgoCD ApplicationSet 자동화와 공장별 독립 배포 관리의 기반이 된다.

### 완료 조건 (Definition of Done)

- [x] 저장소 구조 확정 및 초기화
  ```
  charts/
    aegis-spoke/          # 공통 베이스 Helm 차트
      Chart.yaml
      values.yaml         # 기본값
      templates/
  envs/
    factory-a/
      values.yaml         # factory-a 전용 override
    factory-b/
      values.yaml
    factory-c/
      values.yaml
  .github/
    workflows/
  ```
- [x] 공장별 values 범위 확정 및 초기값 작성
  - `factory_id`
  - `environment_type` (`physical-rpi` / `vm-mac` / `vm-windows`)
  - `input_module_type` (`sensor` / `dummy`)
  - 사용 필드 여부 (display, risk_enabled)
- [x] M3 배포 검증용 기준 앱 1개 선정
  - 실제 서비스 또는 `sample-app`
  - 이후 GitHub Actions / ArgoCD / end-to-end 검증의 공통 대상
- [x] `input_module_type` 기본 매핑 적용
  - `factory-a` = `sensor`
  - `factory-b` = `dummy`
  - `factory-c` = `dummy`
- [x] 베이스 차트와 values 경계 역할 분리 문서화

### Acceptance Criteria

- `helm template charts/aegis-spoke -f envs/factory-a/values.yaml` 정상 렌더링
- 기준 앱이 차트/values 구조 안에서 일관되게 표현됨
- 공장별 values 파일이 서로 독립적으로 동작
- 저장소 구조가 배포 파이프라인 관련 문서에 반영됨

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: `aegis-pi-gitops` 저장소에 M3 GitOps source of truth 구조를 만들고, `charts/aegis-spoke` 공통 Helm chart와 `envs/factory-a|b|c/values.yaml` 공장별 override를 분리했다. MVP 배포 검증 대상은 기존 `factory-a` 운영 workload를 건드리지 않는 `aegis-spoke-smoke`로 정했다.
- 변경/확인: `/home/vicbear/Aegis/aegis-pi-gitops`의 `README.md`, `charts/aegis-spoke/`, `envs/factory-a/values.yaml`, `envs/factory-b/values.yaml`, `envs/factory-c/values.yaml`, `applicationsets/aegis-spoke-applicationset.yaml`, `.github/workflows/validate.yaml`
- 검증: `helm lint charts/aegis-spoke -f envs/factory-a/values.yaml` 통과, `helm template aegis-spoke charts/aegis-spoke -f envs/factory-a|b|c/values.yaml` 렌더링 통과, GitHub Actions `Validate GitOps Manifests` 통과
- 후속: M3 Issue 2에서 ECR 저장소 구성과 이미지 태그 전략을 확정한다.

---

## Issue 2 - [배포/ECR] 저장소 구성 및 이미지 태그 전략

### 목표 (What & Why)

컨테이너 이미지를 저장하고 ArgoCD가 참조할 ECR 저장소를 구성한다.  
`git sha` 기반 태그로 배포 이력을 추적하고, 보조 태그로 운영 편의를 확보한다.

M3 기준 컨테이너 registry는 Docker Hub가 아니라 AWS ECR이다. Docker Hub는 초기 실습/로컬 검증 경로로만 취급하고, Hub ArgoCD가 Spoke로 배포할 운영 이미지는 ECR image reference를 사용한다.

### 완료 조건 (Definition of Done)

- [x] 서비스별 ECR 저장소 범위 확정
  - Edge Agent
  - Lambda data processor는 zip 배포를 기본으로 하며 ECR 대상에서 제외
  - Lambda를 container image로 배포하기로 결정할 때만 `aegis-data-processor` 같은 통합 처리기 repository 추가
- [x] ECR Terraform source 작성
  - `infra/foundation/ecr.tf`
  - repository: `aegis/edge-agent`
- [x] 표준 이미지 저장소 확정
  - AWS ECR: `611058323802.dkr.ecr.ap-south-1.amazonaws.com/aegis/edge-agent`
  - Docker Hub는 M3 GitOps 배포 기준에서 제외
- [x] 이미지 태그 전략 확정
  - 기본 태그: `git sha` (`sha-<7자리>`)
  - 보조 태그: `main`, `latest`
- [ ] ECR 저장소 접근 IAM/인증 방식 설정
  - GitHub Actions -> ECR push role은 Issue 3에서 OIDC 기반으로 연결
  - Spoke K3s -> ECR pull은 EKS node role이 아니라 imagePullSecret 갱신 방식으로 연결
- [x] 이미지 스캔 설정 (선택)
  - Terraform source 기준 `scan_on_push = true`
- [x] Terraform apply/destroy로 ECR repository 생성 절차 검증

### Acceptance Criteria

- `terraform validate` 통과
- AWS CLI/콘솔에서 ECR 저장소 생성 확인
- 로컬 또는 GitHub Actions에서 `edge-agent` 이미지 push 후 ECR 저장소에 이미지 확인
- Spoke K3s 파드에서 ECR `edge-agent` 이미지 풀 성공

### 진행 기록

- 결정: M3 Issue 2의 ECR repository는 `edge-agent`만 생성한다.
- 제외: `risk-normalizer`, `risk-score-engine`, `pipeline-status-aggregator`는 최신 Lambda/DynamoDB 기준에서 별도 이미지 대상이 아니다.
- Terraform source: `infra/foundation/ecr.tf`
- Repository name: `aegis/edge-agent`
- Repository URL: `611058323802.dkr.ecr.ap-south-1.amazonaws.com/aegis/edge-agent`
- Repository ARN: `arn:aws:ecr:ap-south-1:611058323802:repository/aegis/edge-agent`
- Tag mutability: `MUTABLE`
  - 이유: 배포 기준은 `sha-<7자리>`지만, CI 확인용 `main`/`latest` 이동 태그를 허용해야 한다.
- Lifecycle:
  - untagged image: 7일 후 만료
  - `sha-*`: 최신 50개 보존
- 남은 작업:
  - GitHub Actions OIDC push role 연결
  - Spoke K3s `imagePullSecret` 갱신 방식 확정
  - 실제 `edge-agent` 이미지 push/pull 검증

### 이미지 저장소 및 Pull 경계

```text
edge-agent code repo
  -> GitHub Actions docker build
  -> AWS OIDC role assume
  -> ECR push
  -> aegis-pi-gitops envs/<factory>/values.yaml image tag update
  -> EKS Hub ArgoCD sync
  -> Tailscale egress path
  -> Raspberry Pi K3s rollout
```

이미지 기준:

```text
registry: 611058323802.dkr.ecr.ap-south-1.amazonaws.com
repository: aegis/edge-agent
deployment tag: sha-<7-char-git-sha>
moving tags: main, latest
```

Spoke K3s는 EKS node가 아니므로 EKS node role로 ECR pull 권한을 상속받지 않는다. 따라서 `factory-a` 같은 Raspberry Pi K3s cluster에는 대상 namespace에 ECR pull용 `imagePullSecret`을 생성/갱신해야 한다.

초기 기준:

```text
namespace: aegis-spoke-system
secret name: ecr-registry
secret type: kubernetes.io/dockerconfigjson
```

Helm chart는 ECR image reference와 `imagePullSecrets`를 values로 받을 수 있게 확장한다. GitHub Actions는 Raspberry Pi에 직접 `kubectl apply`하지 않고, 필요 시 image tag 변경 PR 또는 commit만 생성한다. 실제 sync와 rollout은 EKS Hub ArgoCD가 담당한다.

### 검증 기록

- `terraform fmt`: 통과
- `terraform validate`: 통과
- `terraform apply -target=aws_ecr_repository.edge_agent -target=aws_ecr_lifecycle_policy.edge_agent`: 2 added
- AWS CLI `describe-repositories`: `aegis/edge-agent`, `MUTABLE`, `scanOnPush=true`, `AES256` 확인
- 사용자 요청에 따라 비용 정리 목적으로 `terraform destroy -target=aws_ecr_lifecycle_policy.edge_agent -target=aws_ecr_repository.edge_agent` 실행: 2 destroyed
- 2026-05-15 `build-all.sh --admin-ui` 재실행으로 `aegis/edge-agent` ECR repository 재생성 확인
- 현재 AWS 상태: `aegis/edge-agent` ECR repository active, `MUTABLE`, `scanOnPush=true`
- 보조 스크립트: `scripts/ops/copy-public-image-to-ecr.py`는 Docker Hub public image를 ECR로 복사하는 임시 검증 경로이고, `scripts/ops/refresh-factory-a-ecr-pull-secret.sh`는 factory-a K3s의 ECR pull secret 갱신 경로다.
- 남은 acceptance: 실제 image push, ECR image 확인, factory-a K3s image pull 성공

---

## Issue 3 - [배포/GitHub Actions] 빌드/푸시 워크플로우 구성

### 목표 (What & Why)

코드 변경 시 컨테이너 이미지를 자동으로 빌드하고 ECR에 푸시하는 워크플로우를 구성한다.  
서비스별 변경 감지나 세부 분기는 후속 단계에서 추가할 수 있게 구조만 열어둔다.

### 완료 조건 (Definition of Done)

- [ ] M3 배포 검증용 기준 앱 Dockerfile 및 빌드 대상 확정
- [ ] `.github/workflows/build-push.yaml` 생성
- [ ] 워크플로우 트리거 설정 (main 브랜치 push)
- [ ] AWS 인증 설정 (OIDC 기반 역할 연동, 시크릿 없이)
- [ ] Docker 빌드 및 ECR 푸시 스텝 구성
  - `git sha` 태그 자동 적용
- [ ] ARM64 빌드 지원 확인 (Raspberry Pi 대상 이미지)
- [ ] 빌드 성공/실패 알림 설정 (선택)

### Acceptance Criteria

- main 브랜치 push 후 GitHub Actions 워크플로우 `Success`
- ECR 저장소에 `sha-<커밋해시>` 태그 이미지 확인
- 기준 앱 이미지가 실제로 빌드/푸시됨 확인
- 빌드 로그에서 빌드/푸시 단계 정상 완료 확인

---

## Issue 4 - [배포/ArgoCD] ApplicationSet 구성 (`factory-a` 기준)

### 목표 (What & Why)

공장별 values 목록을 기준으로 ApplicationSet을 생성하여 공장 추가 시 자동으로 Application이 생기는 구조를 만든다.  
`factory-a`를 기준으로 먼저 검증하고, M5(VM Spoke 확장) 시 `factory-b`, `factory-c`를 추가한다.

### 완료 조건 (Definition of Done)

- [x] ArgoCD ApplicationSet 매니페스트 작성
  - Generator: `Git` 또는 `List` 기반 (공장별 values 경로 기준)
  - Template: 공통 베이스 차트 참조 + 공장별 values 경로 주입
- [x] `factory-a` ApplicationSet 적용 및 Application 자동 생성 확인
- [x] Application 이름 규칙 확정: `aegis-spoke-factory-a`
- [x] 기준 앱이 `factory-a` values 경로를 통해 실제 배포 대상으로 연결됨 확인
- [x] Sync 정책 설정: 운영형 `factory-a`는 보수적 수동 Sync

### Acceptance Criteria

- ArgoCD UI에서 `aegis-spoke-factory-a` Application 자동 생성 확인
- Application이 `factory-a` Spoke 클러스터를 대상으로 설정되어 있음
- 수동 Sync 동작 확인

### 진행 기록

- GitOps repo URL: `https://github.com/aegis-pi/aegis-pi-gitops.git`
- GitOps source: `applicationsets/aegis-spoke-applicationset.yaml`, `charts/aegis-spoke`, `envs/factory-a/values.yaml`
- Hub bootstrap source: `scripts/ansible/templates/aegis-spoke-applicationset.yaml.j2`
- Hub bootstrap playbook: `scripts/ansible/playbooks/hub_aegis_spoke_applicationset_bootstrap.yml`
- Hub verify playbook: `scripts/ansible/playbooks/hub_aegis_spoke_applicationset_verify.yml`
- 기본 ApplicationSet scope는 `envs/factory-a/values.yaml`로 제한한다. `factory-b`, `factory-c` 확장 시 `AEGIS_GITOPS_APPSET_VALUES_GLOB='envs/*/values.yaml'`로 넓힌다.
- 검증: `aegis-spoke-factory-a` Application 자동 생성, destination `factory-a / aegis-spoke-system`, Sync `Synced`, Health `Healthy`.
- factory-a K3s 검증: `aegis-spoke-system` namespace에 `aegis-spoke-smoke` Deployment `1/1`, Pod `Running`, Service `ClusterIP`.

### GitHub Issue Comment Draft

- 상태: 완료
- 진행 요약: Hub ArgoCD가 `https://github.com/aegis-pi/aegis-pi-gitops.git`를 source of truth로 읽도록 ApplicationSet을 Ansible bootstrap으로 적용했다. 기본 scope는 `factory-a`만 대상으로 제한했고, `aegis-spoke-factory-a` Application이 자동 생성되어 Tailscale 경유로 factory-a K3s에 smoke app을 배포했다.
- 변경/확인: `scripts/ansible/inventory/group_vars/hub_eks.yml`, `scripts/ansible/templates/aegis-spoke-applicationset.yaml.j2`, `scripts/ansible/playbooks/hub_aegis_spoke_applicationset_bootstrap.yml`, `scripts/ansible/playbooks/hub_aegis_spoke_applicationset_verify.yml`
- 검증: `hub_aegis_spoke_applicationset_verify.yml` 통과, ArgoCD `aegis-spoke-factory-a` `Synced` + `Healthy`, factory-a K3s `aegis-spoke-system/aegis-spoke-smoke` Pod `Running`
- 후속: M3 Issue 2/3에서 ECR image push/pull과 GitHub Actions OIDC build/push 흐름을 연결한다.

---

## Issue 5 - [배포/ArgoCD] 운영형 동기화 정책 및 롤백 정책 적용

### 목표 (What & Why)

`factory-a` 운영형 Spoke에 맞는 보수적 동기화 정책과 배포 실패 시 수동 확인 원칙을 적용한다.  
테스트베드형 Spoke(M5에서 추가)와 차별화된 정책을 명확히 한다.

### 완료 조건 (Definition of Done)

- [ ] 운영형 Spoke 동기화 정책 확정 및 적용
  - 자동 Sync with Prune 또는 수동 Sync 방식 결정
  - Self-heal 설정 여부 결정
- [ ] 배포 실패 시 처리 원칙 적용
  - 운영형(`factory-a`): 실패 시 수동 확인 후 조치
- [ ] RollingUpdate 전략 설정 (파드 교체 방식)
- [ ] 정책 내용을 배포 파이프라인 관련 문서에 반영

### Acceptance Criteria

- 의도적으로 잘못된 이미지 태그 배포 시 기존 파드 유지 확인
- ArgoCD에서 배포 실패 상태 명확히 표시
- 수동으로 이전 values로 Sync 시 이전 버전 복구 확인

---

## Issue 6 - [배포/GitHub Actions] manifest 갱신 워크플로우 구성

### 목표 (What & Why)

빌드된 이미지 태그를 Helm values 파일에 자동으로 반영하는 워크플로우를 구성한다.  
이 단계가 없으면 ArgoCD는 새 이미지를 자동으로 감지하지 못한다.

> 주의:
> 이 워크플로우는 자동 커밋 후 자기 자신을 다시 트리거하지 않도록 loop 방지 규칙을 포함해야 한다.

### 완료 조건 (Definition of Done)

- [ ] `.github/workflows/update-manifest.yaml` 생성
- [ ] 빌드 워크플로우 완료 후 연계 트리거 설정
- [ ] 신규 이미지 태그를 `envs/{factory}/values.yaml`의 이미지 태그 필드에 자동 반영
- [ ] 변경된 values 파일을 저장소에 자동 커밋 및 push
  - 커밋 메시지 형식 정의 (예: `chore: update image tag to sha-xxxxxxx`)
- [ ] 특정 공장 values만 선택적으로 갱신하는 구조 확인
- [ ] workflow loop 방지 규칙 적용
  - 봇 커밋 메시지 필터 또는 경로 필터
  - 자기 자신이 만든 커밋에 재반응하지 않도록 설정

### Acceptance Criteria

- 빌드 워크플로우 완료 후 `envs/factory-a/values.yaml` 이미지 태그 자동 갱신
- 갱신된 커밋이 저장소 히스토리에 기록
- 자동 커밋 후 동일 워크플로우가 무한 반복되지 않음
- ArgoCD가 변경된 values 파일 감지 후 `OutOfSync` 상태 전환

---

## Issue 7 - [배포/GitHub Actions] 배포 검증 워크플로우 구성

### 목표 (What & Why)

ArgoCD Sync 완료 후 배포 성공 여부를 자동으로 확인하는 워크플로우를 구성한다.  
성공 기준(`Sync` + `Healthy` + 대상 파드 `Running`)을 코드로 정의한다.

### 완료 조건 (Definition of Done)

- [ ] `.github/workflows/verify-deploy.yaml` 생성
- [ ] 검증 경로 확정
  - ArgoCD API/CLI 상태 확인
  - `factory-a.kubeconfig` 기반 `kubectl` 상태 확인
- [ ] ArgoCD CLI를 사용한 Sync 상태 폴링 로직 구성
- [ ] 배포 성공 판정 기준 적용
  - `Sync` 상태: `Synced`
  - `Health` 상태: `Healthy`
  - 대상 파드: `Running`
- [ ] 타임아웃 설정 (배포 대기 최대 시간)
- [ ] 검증 실패 시 Slack/이메일 알림 설정 (선택)

### Acceptance Criteria

- 배포 성공 시 워크플로우 `Success` 종료
- 기준 앱 Deployment/Pod 상태를 `kubectl`로 검증 가능
- 배포 실패(파드 CrashLoopBackOff 등) 시 워크플로우 `Failure` 종료
- 타임아웃 초과 시 워크플로우 `Failure` 종료

---

## Issue 8 - [검증/ArgoCD] `factory-a` end-to-end 배포 검증

### 목표 (What & Why)

GitHub push부터 `factory-a` Spoke 파드 롤아웃까지 전체 파이프라인이 자동으로 흐르는지 검증한다.  
이 검증이 완료되어야 M3 마일스톤이 완료된다.

### 완료 조건 (Definition of Done)

- [ ] 기준 앱 코드 또는 이미지 태그에 실제 변경을 만들어 main 브랜치 push
- [ ] 빌드 → ECR 푸시 → manifest 갱신 → ArgoCD Sync → Spoke 롤아웃 전체 흐름 자동 완료 확인
- [ ] `factory-a` K3s에서 새 이미지 파드 `Running` 확인
- [ ] 배포 지연 시간 측정 (참고 지표, 강제 기준 아님)
  - push 시각 → `factory-a` 파드 Running 시각
- [ ] 측정 결과를 배포 파이프라인 관련 문서에 기록

### Acceptance Criteria

- GitHub Actions 3개 워크플로우 전부 `Success`
- ArgoCD `aegis-spoke-factory-a` Application `Synced` + `Healthy`
- `kubectl --kubeconfig=factory-a.kubeconfig get pods`에서 새 이미지 파드 `Running`
- 배포 지연 시간 실측값 기록 완료

### 후속 분리 원칙

M3에서는 현재 구성요소가 실제로 배포 흐름을 타는지 확인하는 데 집중한다.
문서 repo와 코드/인프라 repo 분리, OIDC 기반 전체 CI/CD/Destroy 고도화는 M7 최종 통합 검증 전에 별도 리팩토링 이슈로 진행한다.

단, `aegis-pi-gitops` repository는 이번 M3 흐름에서 Helm/YAML validation과 ArgoCD source of truth 역할을 계속 담당한다.
