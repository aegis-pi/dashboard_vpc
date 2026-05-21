# M7. 통합 검증

수정 이력:
- 2026-05-20 v0.2  Risk Score 기준을 안전점수 방식(100=가장 안전, 0=가장 위험)으로 정정.

> **마일스톤 목표**: 3개 Spoke + Hub 전체를 연결하여 시나리오별 end-to-end 검증을 완료하고,  
> `docs/ops/03_test_checklist.md`의 모든 보정 항목을 마무리하여 `docs/`와 `configs/` 기준 문서를 실제 구현 상태와 일치시킨다.  
> M0~M6 전체 완료 후 진행한다.

---

## 2026-05-13 멘토링 반영: 통합 검증 기준 보강

### 기존 초안

기존 M7 초안은 `factory-a/b/c`, Hub, 데이터 플레인, Risk Score, Dashboard가 end-to-end로 동작하는지 확인하는 통합 검증에 집중했다.

### 변경 이유

멘토링에서는 단순히 "연결됐다"보다 어떤 부하와 지연 조건에서 얼마나 안정적으로 동작했는지 보여줘야 한다는 피드백이 있었다. 특히 VM Spoke는 실제 공장 대체가 아니라 데이터 분리와 처리 성능을 검증하는 테스트베드임을 명확히 해야 한다.

### 보강 방향

기존 통합 검증 항목은 유지하되, latest status 반영 지연, S3 raw 적재, factory별 수신 성공률/실패율, dummy anomaly 상태 변화, 일일 운영 리포트 초안 생성 여부를 추가 검증 기준으로 둔다.

---

## Issue 0 - [리팩토링/CI-CD] 최종 테스트 전 Repository 분리 및 OIDC 기반 파이프라인 정리

### 🎯 목표 (What & Why)

M0~M6 기능 구현이 완료된 뒤 최종 통합 검증에 들어가기 전에 repository 구조와 CI/CD 책임 경계를 정리한다.

현재 단계에서는 전체 구성요소가 실제로 동작하는지 확인하는 것이 우선이다. 기능 구현이 안정화되기 전부터 문서 repo, 코드 repo, 인프라 repo를 강하게 분리하면 변경 비용이 커진다.

따라서 M7 시작 전에 리팩토링 단계로 아래를 정리한다.

```text
문서 변경 흐름
코드/인프라 변경 흐름
GitOps 배포 흐름
AWS OIDC 인증 경계
Destroy 수동 실행 경계
```

### Repository 분리 방향

최종 테스트 전 아래 구조로 분리할지 결정한다.

```text
Aegis-pi-docs
  - docs/
  - planning/
  - issues/
  - architecture/spec 문서

Aegis-pi
  - apps/
  - infra/
  - scripts/
  - tests/
  - CI/CD workflow

aegis-pi-gitops
  - Helm charts
  - envs/factory-a|b|c values
  - ApplicationSet
  - GitOps manifest validation workflow
```

목표는 문서 변경과 코드/인프라 변경의 release cadence를 분리하고, CI/CD가 코드 repo의 실제 빌드/테스트/배포 책임에 집중하게 만드는 것이다.

### 공통 보안 기반 - GitHub OIDC

모든 AWS 접근 workflow는 GitHub OIDC(OpenID Connect)를 공통 기반으로 사용한다.

```text
GitHub Actions
  -> AWS STS AssumeRoleWithWebIdentity
  -> short-lived credentials
  -> AWS API
```

원칙:

- GitHub Secrets에 장기 AWS Access Key를 저장하지 않는다.
- PR 검증, main 배포, destroy, ECR push 권한을 role 단위로 분리한다.
- branch, repository, workflow, environment 조건으로 role assume 범위를 제한한다.

후속 role 후보:

```text
aegis-github-actions-plan-role
aegis-github-actions-apply-role
aegis-github-actions-destroy-role
aegis-github-actions-ecr-push-role
```

### CI 파이프라인 정리

트리거:

```text
pull_request -> main
```

목적:

```text
문법 오류와 계획 오류를 사전에 잡는다.
실제 AWS 리소스는 생성하지 않는다.
```

실행 흐름:

```text
checkout
configure AWS credentials with OIDC
terraform fmt -check
terraform init
terraform validate
terraform plan
```

PR reviewer는 `terraform plan` 결과를 보고 실제 생성/수정/삭제될 리소스를 검토한다.

### CD 파이프라인 정리

트리거:

```text
push -> main
```

목적:

```text
리뷰가 끝난 인프라 변경을 AWS에 반영한다.
```

실행 흐름:

```text
checkout
configure AWS credentials with OIDC
terraform init
terraform apply -auto-approve
```

`foundation`, `hub`, 후속 `dashboard` root는 생명주기가 다르므로 workflow를 분리한다.

### Destroy 파이프라인 정리

트리거:

```text
workflow_dispatch
```

목적:

```text
실습/검증 종료 후 과금 방지를 위해 수동으로 리소스를 삭제한다.
```

실행 흐름:

```text
checkout
configure AWS credentials with OIDC
terraform init
terraform destroy -auto-approve
```

원칙:

- push나 PR로 destroy가 자동 실행되지 않게 한다.
- GitHub Environment protection과 required reviewer를 사용한다.
- `hub`, `foundation`, `all` 같은 입력값으로 삭제 범위를 명시한다.

### Image/GitOps 파이프라인 정리

실제 `edge-agent` 코드가 구현된 뒤 아래 파이프라인을 정리한다.

```text
apps/edge-agent change
  -> test / docker build
  -> ECR push
  -> aegis-pi-gitops values image tag update
  -> ArgoCD sync
  -> Spoke K3s rollout
```

이미지 태그 기준:

```text
deployment tag: sha-<7-char-git-sha>
moving tags: main, latest
```

주의:

- GitHub Actions는 운영 클러스터에 직접 `kubectl apply`하지 않는다.
- 실제 배포 상태는 `aegis-pi-gitops` repo와 ArgoCD가 소유한다.
- Spoke K3s는 EKS node가 아니므로 ECR pull은 `imagePullSecret` 또는 후속 secret 관리 도구로 별도 처리한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 문서 repo와 코드/인프라 repo를 분리할지 최종 결정
- [ ] repo 분리 시 migration 순서와 freeze window 정의
- [ ] GitHub OIDC provider와 role 분리 기준 확정
- [ ] CI plan role, CD apply role, Destroy role, ECR push role 권한 경계 정의
- [ ] CI workflow는 PR에서 `fmt/init/validate/plan`만 수행하도록 정리
- [ ] CD workflow는 main 병합 후 `apply`를 수행하도록 정리
- [ ] Destroy workflow는 `workflow_dispatch`와 environment protection만 허용하도록 정리
- [ ] `aegis-pi-gitops` validation workflow와 image tag update 흐름 정리
- [ ] 리팩토링 후 M7 Issue 1~6 최종 통합 검증을 시작할 수 있는 상태 확인

### 🔍 Acceptance Criteria

- 장기 AWS Access Key 없이 GitHub OIDC로 AWS 접근 가능
- PR에서는 리소스 생성/삭제 없이 plan만 확인 가능
- main merge 후 apply 경로가 명확함
- destroy는 수동 실행과 승인 경계를 가짐
- GitOps repo가 ArgoCD source of truth로 유지됨
- 최종 통합 테스트 전에 repo/CI/CD 책임 경계가 문서화됨

---

## Issue 1 - [검증/운영형] `factory-a` 운영형 시나리오 검증

### 🎯 목표 (What & Why)

실제 센서와 라즈베리파이 환경에서 `factory-a`의 전체 운영 흐름을 검증한다.  
실 데이터가 Edge Agent → IoT Core → S3 → Risk Score → 관제 화면까지 end-to-end로 흐르는 것을 확인한다.

> 실행 전 확인:
> 정상 상태 baseline(센서값, 관제 화면, 주요 파드 상태)을 먼저 기록하고,
> 테스트 시간창과 센서 해제/복구 절차를 확정한 뒤 시나리오를 시작한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 정상 상태 baseline 기록
  - 센서값 / 주요 파드 상태 / 관제 화면 캡처 또는 로그 확보
- [ ] 실제 센서값 수집 및 IoT Core 전송 확인 (온도/습도/카메라/마이크 상태)
- [ ] S3 경로 분리 적재 확인 (`sensor`, `system_status`, `device_status`, `workload_status`, `pipeline_heartbeat`)
- [ ] Risk Score 계산 및 관제 화면 반영 확인
- [ ] Data / Dashboard VPC 반영 지연 측정
  - 일반 상태 변화: 10~35초 목표
  - 장애 판정: 40~60초 목표
- [ ] 센서 무수신 시나리오
  - BME280 센서 연결 해제 → `sensor_no_data` 판정 → Risk Score 반영
  - 관제 화면 이상 시스템 목록 갱신 확인
- [ ] 배포 반영 확인
  - Git push → ArgoCD → `factory-a` 롤아웃 → 데이터 수집 재개 흐름 확인

### 🔍 Acceptance Criteria

- 정상 상태 baseline과 이상 상태 결과를 비교 가능하게 기록함
- 실 센서 데이터 기반 Risk Score 계산 확인
- 센서 무수신 → 이상 판정 → 관제 화면 반영 end-to-end 동작
- Dashboard가 Spoke K3s, ArgoCD, Control / Management VPC의 EKS API, Tailscale 관리망을 직접 조회하지 않음
- 배포 후 데이터 수집 자동 재개 확인

---

## Issue 2 - [검증/테스트베드] `factory-b`, `factory-c` 테스트베드형 시나리오 검증

### 🎯 목표 (What & Why)

Dummy Sensor를 사용하여 정상/주의/위험 상태 전환 시나리오를 검증한다.  
Hub 배포 및 데이터 플레인 파이프라인이 VM 환경에서도 정상 동작하는지 확인한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] `factory-b` 시나리오 검증
  - `normal` → `warning` 전환: Risk Score 50~84 진입 확인
  - `warning` → `danger` 전환: Risk Score 49 이하 진입 확인
  - `danger` → `normal` 복구: Score 상승 및 관제 화면 정상화 확인
- [ ] `factory-c` 동일 시나리오 반복 검증
- [ ] 시스템 상태 변화 시나리오
  - Edge Agent 파드 강제 종료 → `edge_agent_down` 판정 → 관제 반영
  - 파드 재기동 → 자동 복구 확인
- [ ] 파이프라인 상태 변화 시나리오
  - Dummy Sensor 중지 → `pipeline_delay` 또는 `pipeline_no_data` 판정 확인
  - 재시작 후 정상화 확인

### 🔍 Acceptance Criteria

- `factory-b`, `factory-c` 각각 3단계 시나리오 전환 확인
- 관제 화면에서 두 공장 상태 변화 실시간 반영
- 자동 롤백 정책 동작 확인 (의도적 배포 실패 시)

---

## Issue 3 - [검증/Failover] Failover 시나리오 (Worker-2 장애 → Worker-1 승계 → Hub 반영)

### 🎯 목표 (What & Why)

`factory-a`의 핵심 생존성 기능인 Failover가 Hub 관제 관점에서도 올바르게 반영되는지 검증한다.  
Worker-2 장애 → Worker-1 AI 감시 승계 → Longhorn 데이터 보존 → Hub에서 `node_not_ready` 판정 → 관제 화면 반영의 전체 흐름을 확인한다.

> 실행 전 확인:
> 장애 실험 허용 시간, Worker-2 전원 차단 방식, 복구 절차, Longhorn baseline 상태,
> 관제에서 확인할 지표를 사전에 runbook으로 정리한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] Failover 테스트 runbook 작성
  - 장애 유발 방식
  - 복구 절차
  - 관측 대상 지표
  - 중단 허용 시간
- [ ] Worker-2 전원 차단 후 Failover 타임라인 측정
  - T+15s: NotReady 감지 확인
  - T+45s: Eviction + 재스케줄링 시작 확인
  - T+55s 안팎: Worker-1에서 AI 파드 재기동 확인
  - 목표: 2분 이내 감시 재개
- [ ] Longhorn 복제 데이터 보존 확인 (파드 재기동 후 이전 데이터 접근 가능)
- [ ] Hub 관제 화면 반영 확인
  - `node_not_ready` → Risk Score 반영 확인
  - 관제 화면 이상 시스템 목록에 노드 이상 표시
  - Worker-2 복구 후 관제 화면 정상화 확인
- [ ] Failover 전후 데이터 플레인 연속성 확인
  - Failover 중 IoT Core 수신 공백 → `pipeline_status` 이상 판정
  - Worker-1 재기동 후 데이터 수집 재개 → `pipeline_status` 정상화

### 🔍 Acceptance Criteria

- runbook 기준으로 장애 유발과 복구가 재현 가능하게 정리됨
- Failover 2분 이내 달성
- Longhorn 데이터 보존 확인
- Hub 관제 화면에서 Failover 전체 과정 추적 가능
- Data / Dashboard VPC에서 DynamoDB LATEST/HISTORY 기반으로 Failover 상태 확인 가능
- 복구 후 관제 화면 자동 정상화

---

## Issue 4 - [검증/ArgoCD] 배포 파이프라인 롤백 시나리오

### 🎯 목표 (What & Why)

배포 실패 상황에서 운영형/테스트베드형 Spoke의 롤백 정책이 각각 올바르게 동작하는지 검증한다.

### ✅ 완료 조건 (Definition of Done)

- [ ] 롤백 검증용 실패 패턴 정의
  - 존재하지 않는 이미지 태그 또는 기동 실패가 보장되는 manifest 오류 중 하나 선택
- [ ] 선택한 실패 패턴을 `factory-a`, `factory-b` 검증에 동일 기준으로 적용
- [ ] 운영형 Spoke(`factory-a`) 배포 실패 시나리오
  - 잘못된 이미지 태그로 배포 → ArgoCD `Degraded` 상태
  - 기존 파드 유지 확인 (자동 롤백 없음)
  - 수동으로 이전 values로 Sync → 복구 확인
- [ ] 테스트베드형 Spoke(`factory-b`) 배포 실패 시나리오
  - 잘못된 이미지 태그로 배포 → 자동 롤백 확인
  - 자동 롤백 후 이전 버전 파드 Running 확인
- [ ] 배포 실패 시 GitHub Actions 워크플로우 `Failure` 종료 확인
- [ ] 배포 실패 알림 동작 확인 (설정한 경우)

### 🔍 Acceptance Criteria

- 선택한 실패 패턴으로 배포 실패를 재현 가능하게 유도함
- `factory-a`: 실패 시 기존 파드 유지, 수동 롤백으로 복구
- `factory-b`: 실패 시 자동 롤백으로 이전 버전 복구
- ArgoCD UI에서 두 Spoke의 다른 롤백 동작 명확히 확인 가능

---

## Issue 5 - [검증/Test Checklist] `docs/ops/03_test_checklist.md` 전수 보정

### 🎯 목표 (What & Why)

`docs/ops/03_test_checklist.md`에 정리된 "테스트 후 정할 것" 항목들을 실측 결과를 기반으로 모두 보정한다.  
이 이슈가 완료되어야 설계 문서와 실제 구현이 일치하는 상태가 된다.

### ✅ 완료 조건 (Definition of Done)

- [ ] **데이터 플레인 보정**
  - 표준 입력 스키마 내부 구조 최종 확정 (실측 기반)
  - `pipeline_status` 주기 집계 간격 보정
  - source_type별 지연/누락 수치 기준 확정
  - heartbeat 주기와 장애 판정 miss count 확정
  - Dashboard DynamoDB LATEST/HISTORY 반영 지연 기준 확정
  - 데이터 보존 기간 수치 확정

- [ ] **Risk 모델 보정**
  - 온도/습도 이상 기준값 실측 기반 보정
  - 가중치 초기안 실측 기반 조정 (과대/과소 반응 항목 수정)
  - 공장별 override 활성화 조건 문장으로 정의

- [ ] **입력/데이터 소스 보정**
  - VM Dummy 시나리오 세부값 확정 (normal / warning / danger 수치 범위)
  - `null` 허용 필드 목록 및 Risk 계산 처리 방식 확정

- [ ] **테스트 전략 보정**
  - 장애/복구 리허설 포함 여부 결정 및 범위 정의

### 🔍 Acceptance Criteria

- `docs/ops/03_test_checklist.md`의 모든 체크 항목 완료 표시
- 보정된 수치가 각 관련 문서에 반영됨
- 미확정 상태로 남아 있는 항목이 없음 (후속 확장 항목 제외)

---

## Issue 6 - [문서화/Docs] `docs/` 및 `configs/` 기준 문서 최종 갱신

### 🎯 목표 (What & Why)

M0~M7 전체 구현이 완료된 상태에서 `docs/`와 `configs/` 기준 문서를 실제 구현 상태와 일치하도록 최종 갱신한다.  
이 문서가 완료되면 `Aegis-pi/`만 보고 전체 시스템을 이해하고 운영할 수 있는 상태가 된다.

### ✅ 완료 조건 (Definition of Done)

- [ ] `data-plane.md` - 확정된 스키마, 주기, 보존 기간 반영
- [ ] `risk-model.md` - 최종 가중치, 이상 기준값, Top 3 원인 코드 사전 반영
- [ ] `input-schema.md` - 최종 필드 목록, null 허용 정책 반영
- [ ] `test-strategy.md` - 실제 수행한 시나리오 및 결과 반영
- [ ] `config-management.md` - 최종 `runtime-config.yaml` 구조 반영
- [ ] `deploy-pipeline.md` - 배포 지연 시간 실측값 및 정책 반영
- [ ] `hub-cloud.md` - 실제 네임스페이스 구조 및 서비스 배치 반영
- [ ] `data-dashboard-vpc.md` - Data / Dashboard VPC, ALB/WAF/Auth, 조회 경계 반영
- [ ] `mesh-vpn.md` - 최종 Tailscale 구성 및 접근 정책 반영
- [ ] `safe-edge-setup-plan.md` - 실제 설치 과정에서 달라진 부분 보정
- [ ] `README.md` - 전체 구현 완료 상태 반영 및 운영 시작 선언

### 🔍 Acceptance Criteria

- 위 10개 문서 전부 갱신 완료
- `Aegis-pi/` 내부 문서와 설정만 읽어도 현재 시스템 구조, 운영 방법, 주요 수치를 이해 가능
- 문서와 실제 구현 사이에 알려진 불일치가 없음
- **Aegis-Pi MVP 완료 선언 가능한 상태**
