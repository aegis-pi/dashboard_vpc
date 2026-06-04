# AI Agent Harness — Aegis-Pi Risk Twin

상태: source of truth
기준일: 2026-06-04
수정 이력:
  - 2026-06-04  Phase 1 Step 0~9.5 완료 후 Step 10 진행 + Dashboard 운영 기능 반복 배포 반영. Cloud Infra 화면 + Fast/Slow collector(ADR 0027), Factory Timeline/top_causes, GRAPH#5M(ADR 0025/0026), staleness 통일(ADR 0028), S3 보고서 조회(ADR 0029), ECS Auto Scaling(ADR 0030), RBAC 사용자 관리(ADR 0031). 운영 backend image `sha-e96bf81`(ECS revision 37), desired/running 2. TL;DR·§ 2 갱신. 코드는 UI 마무리 보정만 잔여, LLM 보고서 생성기(ADR 0016)만 팀원/후속.
  - 2026-05-27  Aegis-frontend reference 추가와 운영 Dashboard UI 포팅 진행 상태 반영. web `e055583`, backend ECS image `sha-3b8439f`, `/healthz` 200, post-apply plan No changes.
  - 2026-05-27  Dashboard 운영 UI/실데이터 shape 정합성 수정 배포 반영. commit `439e27a`, backend/web CI 성공, ECS backend image `sha-439e27a`, `/healthz` 200, post-apply plan No changes.
  - 2026-05-27  post-migration permanent diff 정리 완료 반영. infra/data-dashboard-permanent apply: 0 added, 3 changed, 0 destroyed. 이후 permanent/dns plan No changes, state count 0/25/1 확인.
  - 2026-05-26  Step 9.5 permanent resource split migration 완료 반영. infra/data-dashboard-permanent/ 신규 root, 25 resources import, data-dashboard state rm 20개, 엔드포인트 HTTP 200 확인. 다음은 post-migration plan diff 정리 및 Step 10.
  - 2026-05-26  Step 9.5 설계 완료 반영. ADR 0024 작성. § 5.4 Step 9.5 DoD 추가. TL;DR·§ 2·§ 10.1·§ 13 갱신.
  - 2026-05-26  Step 9 end-to-end 통합 검증 완료 반영. Backend/Web/Auth/DDB/Lambda/IoT/Cognito/CloudFront 검증 완료. IoT→DDB 실시간 경로는 factory-a Edge Agent 비활성으로 미검증. TL;DR·§ 2 갱신.
  - 2026-05-26  Step 9 S3+CloudFront 배포 CI/CD 구현/적용/SPA 배포 반영. dashboard-web.yml, IAM web deploy role(ADR 0023), Terraform apply, GitHub Actions 배포 성공, Node 24 workflow runtime 확인. TL;DR·§ 2·§ 5.4·§ 10.1·§ 13 갱신. 다음 단계 Step 9 end-to-end 통합 검증.
  - 2026-05-26  Step 8 완료 반영. apps/dashboard-web/ Vite+React SPA 구현. TL;DR·현재 구현 상태·Known Gaps 갱신. 다음 작업 Step 9로 전환.
  - 2026-05-26  Step 7 Backend 활성화 검증 반영. ECR `sha-9d2c200`, ECS desired/running 1, `/healthz` 200 확인. GitHub Secret은 organization 수준 등록으로 갱신.
  - 2026-05-26  Step 7 apply 완료 + Step 7.5 Route53 영구 분리 완료 반영. infra/data-dashboard-dns/ allowlist 추가. TL;DR 갱신.
  - 2026-05-26  Step 8을 운영용 Frontend Vite + React 마이그레이션으로 재정의. LLM 일간 보고서는 팀원/후속 작업으로 분리. Backend Bedrock 권한/환경변수 제거.
  - 2026-05-26  Step 6 완료 반영. TL;DR·현재 구현 상태·Known Gaps 갱신. Step 1 frontend prototype/reference vs apps/dashboard-web/ 공식 경로 구분 추가. 변경 이력 추가.
대상: Claude Code, Codex, 또는 동급의 AI 코딩 에이전트
언어: 한국어 (개조식 우선) / 코드·식별자는 원문 유지

> 이 문서는 본 저장소에서 작업하는 AI 코딩 에이전트(이하 "에이전트")가 **어떤 phase에서 무엇을, 어떤 파일을, 어떤 검증으로 끝내야 하는지** 단일 지점에서 찾을 수 있도록 정리한 운영 harness다.
> 모든 세부 결정의 source of truth는 `docs/changes/`(ADR)와 `docs/planning/15_cloud_architecture_final.md`이며, 본 문서는 그 내용을 에이전트 작업 흐름에 맞게 색인한다.
> 본 문서와 다른 문서가 충돌하면, **ADR > 본 harness > 그 외 문서** 순으로 신뢰한다. 충돌을 발견하면 즉시 `docs/changes/`에 새 ADR을 만들거나 본 문서에 `Needs Decision` 메모를 추가한다.

---

## 0. 한 페이지 요약 (TL;DR)

- **프로젝트**: Aegis-Pi Risk Twin — Safe-Edge 단일 공장 엣지를 멀티 공장 중앙 관제로 확장하는 Risk Twin 플랫폼
- **본 작업 환경(워크스트림 B)**: 1번 Data / Dashboard VPC 구현 (Phase 1 통합 결정)
- **본 환경의 다음 작업**: Phase 1 Step 0~9.5 완료. Dashboard Backend/Web/Cloud Infra/RBAC/보고서 조회 운영 배포 완료(backend `sha-e96bf81`, ECS revision 37, desired/running 2). 다음: UI 마무리 보정, Step 10 운영 자동화(build/destroy 스크립트는 존재, drawio 갱신 잔여)/데모 준비, 사용자 수동 화면 검증/캡처. LLM 보고서 생성기(ADR 0016)만 팀원/후속
- **본 환경이 손대지 않는 영역(워크스트림 A)**: `infra/hub/`, `infra/foundation/`, `infra/mesh-vpn/`, `charts/aegis-hub/`, `charts/aegis-spoke/`, `scripts/build/build-hub.sh`, `scripts/destroy/destroy-hub.sh`, Admin UI 도메인 (`*.minsoo-tech.cloud`), `aegis/edge-agent` ECR repo, Tailscale ACL/태그
- **금지**: 비밀번호 / token / private key / certificate / MFA OTP / 계정 세부 ARN 의 문서 기록, `kubectl apply` 직결로 GitOps drift 만들기, 미완료 마일스톤을 "complete" 마킹, 사용자 승인 없이 `destroy-*.sh` 실행
- **세션 시작 시 우선 읽기**: `docs/issues/SESSION_STATE.md` → 본 문서 § 3·5·6 → `docs/planning/16_data_dashboard_vpc_workplan.md`
- **Claude Code 세션 기준**: 같은 Step의 검증·수정은 기존 터미널을 이어서 사용. Step/Phase 전환 시에는 새 Claude Code 세션을 시작하고 위 문서들을 다시 읽는다.

---

## 1. 프로젝트 개요 (Project Overview)

| 항목 | 내용 |
| --- | --- |
| 프로젝트명 | Aegis-Pi Risk Twin |
| 한 줄 | Safe-Edge 단일 공장 엣지(`factory-a`)를 AWS Hub와 VM Spoke(`factory-b/c`)로 확장하고, 별도 Data/Dashboard VPC에서 본사 관제 화면을 제공하는 플랫폼 |
| 1차 사용자 | 본사 관제 담당자 |
| 2차 사용자 | 현장 운영자, 배포 담당, 시스템 관리자 |
| 본 환경 GitHub | (배포는 GitOps repo `aegis-pi-gitops`로 push, 본 repo는 코드·문서·IaC) |
| AWS 계정 / 리전 | `611058323802` / `ap-south-1` (CloudFront ACM은 `us-east-1`) |
| 도메인 정책 | Admin UI = `*.minsoo-tech.cloud` (워크스트림 A 소유). Dashboard 도메인 = Gabia 신규 (ADR 0010) |

---

## 2. 현재 구현 상태 (Current Implemented State, 2026-06-04 기준)

- **완료**: M0 전체, M1 Issue 0~10/12, M2 Issue 1~6, M3 Issue 1/4
- **진행 중(워크스트림 A · 본 환경 미진행)**: M3 Issue 2 (ECR push/pull 검증, Spoke imagePullSecret)
- **완료(워크스트림 B · 본 환경)**: Phase 1 Step 0~9.5 완료. Step 9 end-to-end 통합 검증(2026-05-26, cloud-side 주입 기반), Step 9.5 permanent resource split(`infra/data-dashboard-permanent/` 25 resources). 이후 운영 배포로 추가: Cloud Infra 화면 + Fast/Slow collector(`apps/cloud-infra-collector/`, ADR 0027), Factory Timeline/top_causes, GRAPH#5M(ADR 0025/0026), staleness 통일(ADR 0028), S3 보고서 조회(ADR 0029), ECS Auto Scaling(ADR 0030), RBAC 사용자 관리(ADR 0031). M4 소비측(Lambda data processor/notifier/pipeline_status)·M6 Dashboard 화면 구현 완료
- **진행 중(워크스트림 B)**: Phase 1 Step 10 운영 자동화/데모, UI 마무리 보정
- **보류**: M0 Issue 6 (NFS), M1 Issue 11 (운영 보안 강화), EKS API endpoint CIDR 축소
- **후속(워크스트림 B)**: LLM 일간 보고서 생성기(Bedrock, ADR 0016 · 팀원/후속), factory-a Edge Agent 재활성 후 IoT→DDB 실시간 경로 검증
- **현재 AWS 상태**: 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성. Data/Dashboard는 Step 9.5 이후 `infra/data-dashboard` 일시 root를 build/destroy 사이클로 운영(Backend ECS `sha-e96bf81`/revision 37, desired/running 2, `/healthz`·`/readyz` ok). 영구 자원은 `infra/data-dashboard-permanent`/`infra/data-dashboard-dns`. https://dashboard.aegis-pi.cloud / https://api.aegis-pi.cloud 활성

본 환경의 시점별 정확한 상태 스냅샷은 항상 `docs/issues/SESSION_STATE.md`를 우선한다. 본 harness 본문은 phase 경계와 책임 경계만 정의한다.

---

## 3. 워크스트림 분리 (Workstream Split, ADR 0005)

> **AI 에이전트 필수 인식**: 본 저장소는 두 워크스트림이 같은 코드 트리를 공유한다. 본 환경(이 파일이 있는 `/home/jongwon/personal_project/Aegis-pi`)은 **워크스트림 B만** 다룬다.

| 항목 | 워크스트림 A (팀, 다른 환경) | 워크스트림 B (본 환경) |
| --- | --- | --- |
| VPC | 2번 Control / Management | 1번 Data / Dashboard |
| 마일스톤 | M1, M2, M3, M5 | M4 (소비측), M6, Phase 1 Step 0~10 |
| 핵심 자산 | EKS Hub, ArgoCD, Tailscale, Prometheus, Grafana, Admin UI, edge-agent ECR | 1번 VPC, ALB, ECS Fargate Backend, RDS PostgreSQL, Redis, Lambda data processor / notifier, Dashboard SPA, Cognito. report-generator/Bedrock은 팀원/후속 작업 |
| Lambda data processor | **합류 지점** (코드/Terraform은 본 환경, IoT Rule 트리거는 워크스트림 A와 ADR로 합의) | **합류 지점** |
| S3 `aegis-bucket-data` | bucket·정책·KMS 소유 | `processed/`·`reports/` prefix 와 본 환경 IAM 만 추가 |

### 3.1 본 환경 `허용 / 금지` 파일 (Allowlist · Denylist)

| 분류 | 경로 | 본 환경 권한 |
| --- | --- | --- |
| 허용 | `infra/data-dashboard/**` *(신설, Phase 1 Step 2)* | 자유 |
| 허용 | `infra/data-dashboard-dns/**` *(신설, Phase 1 Step 7.5 — Route53 영구 자원 전용 root)* | 자유 |
| 허용 | `apps/dashboard-backend/**` *(신설, Phase 1 Step 6)* | 자유 |
| 허용 | `apps/dashboard-web/**` *(신설, Phase 1 Step 8)* | 자유 |
| 허용 | `apps/data-processor/**` *(ADR 0020/0021/0022)* | 자유 (IoT Rule 트리거는 ADR 0021 신규 Rule 2개로 합의 완료) |
| 허용 | `apps/lambda-notifier/**` | 자유 |
| 허용 | `apps/cloud-infra-collector/**` *(ADR 0027, Fast/Slow collector — 구현·배포 완료)* | 자유 (EKS/ArgoCD 조회는 합류 지점) |
| 보류 | `apps/lambda-report-generator/**` | LLM 일간 보고서 생성기 팀원/후속 작업 (ADR 0016) |
| 허용 | `docs/**` (워크스트림 A 운영 문서 제외) | 자유 (편집 규칙 § 9 준수) |
| 허용 | `docs/changes/0NNN-*.md` (신규 ADR 추가) | 자유 |
| 허용 | `scripts/build/build-data-dashboard.sh`, `scripts/destroy/destroy-data-dashboard.sh` *(신설)* | 자유 |
| 금지 | `infra/hub/**`, `infra/foundation/**`, `infra/mesh-vpn/**`, `infra/safe-edge/**`, `infra/deploy/**` | 수정 / 추가 / 삭제 금지 (사용자가 명시 지시 시에만) |
| 금지 | `charts/aegis-hub/**`, `charts/aegis-spoke/**` | 수정 금지 |
| 금지 | `scripts/build/build-hub.sh`, `scripts/build/build-all.sh`, `scripts/build/build-admin-ui-after-ns.sh`, `scripts/destroy/destroy-hub.sh`, `scripts/destroy/destroy-all.sh` | 실행·수정 금지 |
| 금지 | `scripts/ansible/**` (Hub bootstrap) | 수정 금지 |
| 금지 | `docs/ops/13_hub_namespace_baseline.md`, `14_hub_run_commands.md`, `16_hub_prometheus_amp.md`, `17_hub_grafana_amp.md`, `20_tailscale_hub_spoke_runbook.md`, `21_hub_admin_ui_ingress.md` | 워크스트림 A 운영 문서 — 수정 금지 |
| 금지 | `docs/issues/M1_hub-cloud.md`, `M2_mesh-vpn-hub-spoke.md`, `M3_deploy-pipeline.md`, `M5_vm-spoke-expansion.md` 내 **본 환경 외 영역의 진행/완료 표기 변경** | 표기 변경 금지. 본 환경 합류 지점(예: M4 Issue 6) 표기는 가능 |
| 금지 | 모든 `*.tfvars`, `secret/**`, `~/.aegis/secrets/**` | git 추적 금지, 문서 인용 금지 |
| 합류 지점 | `aegis-bucket-data` bucket-level 정책, `AEGIS_IoTRule_factory_a_raw_s3` Rule, ECR `aegis/edge-agent`, GitHub 본 repo·`aegis-pi-gitops` | 변경 전 반드시 ADR 작성 (`docs/changes/0NNN-…`) |

### 3.2 사용자 의도가 모호할 때

요청이 `1번 VPC` / `워크스트림 B` / `Data/Dashboard` / `Phase 1 Step N` 중 어느 것에도 명시되지 않고 모호하면, **에이전트는 작업을 시작하기 전에 워크스트림을 확인 질문한다.** 추정으로 워크스트림 A 자산을 건드리지 않는다.

---

## 4. 마일스톤 ↔ Phase 매핑

> 본 저장소에는 **두 가지 단계 개념**이 동시에 존재한다. 혼동 금지.

| 개념 | 위치 | 의미 |
| --- | --- | --- |
| 마일스톤 M0~M7 | `docs/issues/M0~M7_*.md` + `MASTER_CHECKLIST.md` | 프로젝트 전체 구현 마일스톤. Acceptance Criteria 단위 |
| Phase 1~4 | `docs/planning/17_expansion_roadmap.md` | 워크스트림 B의 **확장 단계** (Phase 1 = 통합 배포 목표, Phase 2~4 = 트리거 기반 후속 확장) |
| Phase 1 Step 0~10 | `docs/planning/16_data_dashboard_vpc_workplan.md` | 본 환경 Phase 1을 실제로 구현하는 **순차 작업 Step** |

본 harness § 5는 두 축을 한 곳에 표로 정리한다. 작업 시작 시 항상 본 표에서 자신의 작업이 어느 마일스톤·Phase·Step에 속하는지 확인한다.

---

## 5. Phase별 정의 (Phase-by-Phase Definition of Done)

### 5.0 작업 시작 / 종료 표준 절차

**시작**

1. `docs/issues/SESSION_STATE.md` 의 `다음에 할 일` 섹션 확인
2. 본 harness § 3 (워크스트림 경계) 와 § 5의 해당 phase DoD 확인
3. 해당 ADR (`docs/changes/0NNN-*.md`) 정독
4. `git status` / `git diff --stat` 으로 현재 상태 파악
5. 필요한 경우 `TaskCreate` 로 작업 단위 분해

**Claude Code 세션 운영**

- 같은 Phase 1 Step 안에서 이어지는 검증, 작은 수정, 재실행은 기존 Claude Code 터미널을 이어서 사용한다.
- Phase 또는 Step이 바뀌면 새 Claude Code 세션을 시작한다. 예: Step 2 완료 후 Step 3 진입, Phase 1 완료 후 Phase 2 진입.
- 새 세션 첫 작업은 `SESSION_STATE.md`, 본 harness, `16_data_dashboard_vpc_workplan.md`의 해당 Step을 다시 읽고 현재 `git status` / `git diff --stat`를 확인하는 것이다.
- 세션 종료 전에는 `SESSION_STATE.md`, 비용 영향이 있는 경우 `docs/ops/15_aws_cost_baseline.md`, 새 결정이 있는 경우 `docs/changes/` ADR을 갱신한다.

**종료**

1. § 7 의 verification 명령 실행
2. `git diff --stat` 결과 요약
3. 해당 issue 문서의 `GitHub Issue Comment Draft` 갱신 (양식 § 9)
4. 새 결정이 있었다면 `docs/changes/0NNN-*.md` 추가
5. `docs/issues/SESSION_STATE.md` 의 스냅샷 갱신 (누적 아님)
6. 비용 영향이 있으면 `docs/ops/15_aws_cost_baseline.md` 동시 갱신

### 5.1 Phase 0 — 문서 기준선 (완료)

- 완료. 본 harness 가 그 산물.

### 5.2 Phase M0 — `factory-a` Safe-Edge 기준선 (완료, 워크스트림 A 영역)

- DoD: `docs/issues/M0_factory-a_safe-edge-baseline.md` 원본 Acceptance Criteria 통과
- 본 환경에서 신규 작업 금지. NFS(Issue 6)는 보류 유지

### 5.3 Phase M1~M3 — Hub / Mesh / 배포 (워크스트림 A)

- 본 환경에서 **수정·실행하지 않음**
- 합류 지점이 발생하면 (예: ECR `aegis/edge-agent` 의 prod tag 정책) ADR 작성 후 협의

### 5.4 Phase 1 — 1번 Data / Dashboard VPC 통합 (본 환경의 현재 주 작업)

> Phase 1 = ADR 0006, 0008, 0009, 0010, 0012, 0014, 0015, 0016, 0017 + (0007/0011 supersede)
> 구현 순서 = Phase 1 Step 0~10 (`docs/planning/16_data_dashboard_vpc_workplan.md`)

각 Step의 **목표 / DoD / 허용 파일 / 검증 명령**을 아래 표에 고정한다.

#### Phase 1 Step 0 — 외부 사전 작업: Gabia 도메인

- 목표: Dashboard용 신규 도메인을 Gabia에서 구매하고 DNS 전파 시간(1~24h)을 확보
- DoD: 도메인 결정·구매 완료, Route53 hosted zone 생성·NS 위임 후 `dig <도메인> NS` 가 AWS NS 4개를 반환
- 허용 파일: 본 단계는 코드 변경 없음. 도메인명·NS는 `secret/dashboard-nameservers.txt`(git 추적 금지) 또는 본 단계 ADR 에만 기록
- 금지: 도메인명·AWS account ID·NS 풀세트를 git 추적 파일에 commit
- 검증: `dig <도메인> NS +short` 가 AWS NS 4개 / `aws route53 list-hosted-zones-by-name --dns-name <도메인>` 응답 1개
- 롤백: Gabia 측 NS 원복 / Route53 hosted zone 삭제
- 본 단계는 Step 1과 병렬 가능

#### Phase 1 Step 1 — Frontend prototype/reference 정리

- 목표: `frontend/` prototype reference(기존 `Aegis-pi/`, `Aegis-pi2/` 정리 경로)를 화면 설계 기준으로 유지한다. 운영용 공식 SPA 구현은 Step 8에서 진행한다.
- **경로 구분 (필수)**:
  - `frontend/` = 화면 설계 prototype/reference. 기존 `Aegis-pi/`, `Aegis-pi2/` prototype이 정리된 경로
  - `apps/dashboard-web/` = 운영 배포용 공식 Vite + React SPA. Step 8의 구현 대상
  - `frontend/`를 배포/CI/S3 source path로 직접 사용하지 않는다
- DoD: prototype/reference 경로와 운영용 공식 경로가 문서에 명확히 분리되어 있음
- 허용 파일: `frontend/**`(reference 정리), 문서
- 금지: `frontend/` 를 공식 배포/CI/S3 source path로 직접 사용하지 않는다.
- 롤백: `frontend/` reference 정리 이전 상태로 되돌림. 운영용 `apps/dashboard-web/`는 Step 8에서만 신설

#### Phase 1 Step 2 — Terraform 1번 VPC 골격 (`infra/data-dashboard/`)

- 목표: 신규 Terraform root 생성. Public + Private App + Private Data subnet × 2 AZ, IGW, NAT GW × 1, ALB, ACM × 2, Route53, CloudFront, S3 SPA, Cognito UserPool/App Client/Hosted UI Domain
- DoD: `terraform -chdir=infra/data-dashboard plan` 가 정상, **state 가 `infra/hub` / `infra/foundation` 과 분리**되어 있음, `terraform apply` 후 ALB DNS·CloudFront domain·Cognito Hosted UI URL 출력
- 허용 파일: `infra/data-dashboard/**`, `docs/ops/15_aws_cost_baseline.md` (NAT GW 1개 비용 반영), `docs/ops/2N_dashboard_domain_runbook.md` (신설)
- 금지: `infra/hub/` / `infra/foundation/` Terraform 코드·state·backend 변경. `infra/data-dashboard/` 는 별도 backend (S3 key 또는 별도 backend block) 필수
- 네이밍 규칙: 기존 `AEGIS-[resource]-[feature]-[zone]` 앞에 개인 작업 prefix `KJW` 를 붙인다. Data 영역 기본 prefix는 `KJW-AEGIS-Data-*`
- Claude Code handoff guard:
  - 사용자가 Terraform 구현을 요청하면 먼저 이 Step의 허용/금지 파일을 재확인한다.
  - `https://github.com/aegis-pi/Aegis-pi/tree/main` 의 `infra/hub`, `infra/foundation`, `infra/mesh-vpn`, `infra/safe-edge`, `infra/deploy` 는 참고 전용이다. PR/patch 대상에 포함하지 않는다.
  - 원격 main 기준 `infra/foundation/github_actions_ecr_push.tf` 는 팀원 ECR/GitHub Actions OIDC 작업이다. VPC 1 작업에서 role/provider/policy 이름을 재사용하거나 수정하지 않는다.
  - VPC 1 CIDR은 Hub VPC `10.0.0.0/16` 과 겹치지 않는 새 CIDR로 둔다.
  - Terraform `locals.naming_prefix` 는 `KJW-AEGIS-Data` 또는 동등한 조합(`owner_prefix = "KJW"`, `project_prefix = "AEGIS"`, `area_prefix = "Data"`)으로 둔다. `Name` tag와 IAM/SG/ALB/ECS/RDS/Redis 등 사람이 지정하는 이름은 `KJW-AEGIS-Data-*` 로 시작해야 한다.
  - S3 bucket, Cognito domain, CloudFront alias 보조 이름처럼 lowercase/문자 제약이 있는 리소스는 `kjw-aegis-data-*` 형식으로 변환한다.
  - S3 `aegis-bucket-data` 는 `data` source 또는 변수로 참조만 한다. `aws_s3_bucket` 으로 재생성하거나 bucket-level policy/lifecycle/KMS/versioning 을 관리하지 않는다.
  - 기존 IoT Rule `AEGIS_IoTRule_factory_a_raw_s3` 는 수정하지 않는다. Lambda processor 트리거는 Step 4 ADR 합의 후 `infra/data-dashboard/iot_rule.tf` 의 신규 Rule로만 다룬다.
  - 신규 ECR repository가 필요하면 `aegis/dashboard-backend` 처럼 Dashboard 전용 이름을 사용하고, `aegis/edge-agent`, `aegis/factory-a-log-adapter`, `aegis/edge-iot-publisher` 는 수정하지 않는다.
- 검증:
  - `terraform -chdir=infra/data-dashboard fmt -check`
  - `terraform -chdir=infra/data-dashboard validate`
  - `terraform -chdir=infra/data-dashboard plan -detailed-exitcode` (변경 없을 때 exit 0)
  - `terraform -chdir=infra/hub plan -detailed-exitcode` → **변경 없음** (워크스트림 A 영향 0)
  - `terraform -chdir=infra/foundation plan -detailed-exitcode` → **변경 없음**
- 롤백: `terraform -chdir=infra/data-dashboard destroy` (RDS 미배포 단계라 안전)

#### Phase 1 Step 3 — Terraform 데이터 저장소

- 목표: DynamoDB `AEGIS-DynamoDB-FactoryStatus`(기존 실데이터 LATEST+HISTORY, `pk`/`sk`, Streams 활성화 필요, ADR 0022) + `aegis-daily-report`, S3 `processed/`·`reports/` prefix IAM, RDS PostgreSQL `db.t4g.micro` Single-AZ gp3 20GiB, Secrets Manager, ElastiCache Redis 단일 노드 + AUTH + transit_encryption
- DoD: RDS 가 Private Data Subnet 에 배포, Redis 가 Private App Subnet 에 배포, Secrets 가 AWS Secrets Manager 에 저장 (값은 평문 로그 금지), Alembic baseline migration 적용 가능 상태
- 데이터 계약 (DynamoDB): § 8 참조
- 허용 파일: `infra/data-dashboard/**`, `apps/dashboard-backend/migrations/**` (Alembic baseline)
- 금지: bucket-level 정책 변경 (워크스트림 A 소유). RDS 초기 비밀번호를 평문 commit
- 검증:
  - `aws dynamodb describe-table --table-name AEGIS-DynamoDB-FactoryStatus` 의 StreamSpecification 활성
  - `aws rds describe-db-instances` → MultiAZ=false, StorageType=gp3
  - `aws elasticache describe-replication-groups` → TransitEncryptionEnabled=true
- 롤백: `terraform destroy -target` 로 단일 리소스 제거 가능. 운영 데이터가 들어가기 전에만 안전

#### Phase 1 Step 4 — Lambda data processor IoT Rule 트리거 협의 (합류 지점)

- 목표: 워크스트림 A 가 소유한 `AEGIS_IoTRule_factory_a_raw_s3` 와 본 환경 신규 Lambda 의 트리거 관계를 결정
- 결정 옵션:
  - 옵션 A: 기존 Rule action 확장 (워크스트림 A Terraform 수정 필요 → 본 환경 PR 금지)
  - 옵션 B: 신규 IoT Rule 추가 (본 환경 Terraform 으로 신규 Rule 생성, 같은 topic 구독)
- DoD: 결정을 **ADR 0018 이상** (`docs/changes/0018-lambda-data-processor-iot-rule-trigger.md`) 으로 기록. 본 PR 안에 ADR 포함
- 허용 파일: `docs/changes/0018*.md`, (옵션 B 선택 시) `infra/data-dashboard/iot_rule.tf`
- 금지: 옵션 A 를 본 환경에서 직접 PR. 워크스트림 A 와 합의 없이 IoT Rule SQL 변경
- 검증: ADR Accept 후 한 번의 IoT 메시지가 Lambda 까지 도달함을 dummy payload 로 확인 (`aws lambda invoke` 또는 IoT Core Test client)

#### Phase 1 Step 5 — Lambda notifier (DDB Streams → Redis Pub/Sub)

- 목표: DynamoDB Streams trigger → VPC-attach Lambda → ElastiCache Redis `PUBLISH factory:update:<factory_id>`
- DoD: 5초 이내 stream record 가 Redis subscriber 에 도달, DLQ + CloudWatch Logs 활성, 재시도 정책 명시
- 허용 파일: `apps/lambda-notifier/**`, `infra/data-dashboard/lambda_notifier.tf`
- 검증:
  - `aws lambda get-event-source-mapping` 활성
  - DDB PutItem → Redis subscriber 수신 < 5s
  - DLQ message count = 0 (정상 경로)

#### Phase 1 Step 6 — Dashboard Backend (FastAPI on ECS Fargate)

- 목표: REST + WebSocket 단일 FastAPI 서비스. Cognito JWT 앱 레벨 검증, RDS(PostgreSQL via SQLAlchemy async + asyncpg), DDB, S3, Redis Pub/Sub 통합
- DoD: 로컬 FastAPI 테스트와 컨테이너 빌드로 `/healthz` 200 가능 상태 확인, 단위 테스트(moto + fakeredis/JWKS mock) 통과, GitHub Actions가 `sha-<7chars>` 태그로 신규 ECR repo `aegis/dashboard-backend`에 push할 수 있는 workflow 골격 준비. 실제 ECR repo/IAM/OIDC Secret과 이미지 push는 Step 7에서 완료
- API 계약: § 8.2 참조
- 허용 파일: `apps/dashboard-backend/**`, `.github/workflows/dashboard-backend.yml` (신설)
- 금지: 환경변수 외 비밀 정보 하드코드, Cognito JWKS 검증 생략, RDS 직접 root user 사용
- 환경변수 계약: `DATABASE_URL`, `REDIS_URL`, `REDIS_AUTH_TOKEN_SECRET_ARN`, `DDB_TABLE_STATUS`, `DDB_TABLE_REPORT`, `S3_BUCKET_DATA`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `AWS_REGION`
- 검증:
  - `pytest -q`
  - `docker build` 후 `docker run` → `/healthz` 200
  - `curl -H "Authorization: Bearer <expired>" /factories` → 401
  - p95 응답시간 < 500ms (k6 또는 artillery 로 측정)

#### Phase 1 Step 7 — ECS Service / ALB 배포

- 목표: ECS Fargate Cluster + Task Definition + Service + ALB listener rule + Route53 alias `api.<domain>`
- DoD: ALB `api.<도메인>` HTTPS 200, `/ws/factories/<id>` WebSocket handshake 성공, ECS circuit breaker 활성, Task Role 권한 최소화 (§ 8.3 IAM 표 참조)
- 허용 파일: `infra/data-dashboard/ecs.tf`, `infra/data-dashboard/alb.tf`, `infra/data-dashboard/route53_dashboard.tf`
- 검증:
  - `aws ecs describe-services` → desiredCount==runningCount
  - `curl -I https://api.<도메인>/healthz` → 200
  - `wscat -c wss://api.<도메인>/ws/factories/factory-a` → handshake OK

#### Phase 1 Step 7.5 — Route53 Hosted Zone 영구 분리 ✅ 완료 (2026-05-26)

- 목표: `infra/data-dashboard destroy/apply` 반복 시 Gabia NS 위임이 깨지지 않도록 Route53 hosted zone을 별도 영구 Terraform root로 분리한다.
- DoD:
  - `infra/data-dashboard-dns/` 신규 Terraform root 생성 (S3 backend key `data-dashboard-dns/terraform.tfstate`)
  - `aws_route53_zone.dashboard` 에 `lifecycle { prevent_destroy = true }` 적용
  - `infra/data-dashboard/route53.tf` 에서 `resource "aws_route53_zone"` 제거 → `data "aws_route53_zone"` 대체
  - `infra/data-dashboard/acm.tf`, `outputs.tf` zone_id 참조 → data source
  - `terraform validate`, `fmt -check` 양쪽 통과
  - state 이전 완료 (import → state rm → 양쪽 plan No changes)
- 완료 내용:
  - `infra/data-dashboard-dns/` 5개 파일 생성 (main.tf, providers.tf, versions.tf, variables.tf, outputs.tf)
  - `infra/data-dashboard/route53.tf`, `acm.tf`, `outputs.tf` 수정
  - `infra/data-dashboard-dns` state가 hosted zone을 소유
  - `infra/data-dashboard` state에는 hosted zone resource가 없고 DNS records만 남음
- 실행된 state 이전 절차:
  ```bash
  terraform -chdir=infra/data-dashboard-dns init
  terraform -chdir=infra/data-dashboard-dns import aws_route53_zone.dashboard <ZONE_ID>
  terraform -chdir=infra/data-dashboard state rm aws_route53_zone.dashboard
  terraform -chdir=infra/data-dashboard plan -var="dashboard_domain_name=aegis-pi.cloud"
  terraform -chdir=infra/data-dashboard-dns plan
  ```
- 허용 파일: `infra/data-dashboard-dns/**`, `infra/data-dashboard/route53.tf`, `infra/data-dashboard/acm.tf`, `infra/data-dashboard/outputs.tf`
- 금지: infra/foundation으로 hosted zone 이전 금지 (워크스트림 A 영역). destroy 실행 금지

#### Phase 1 Step 8 — 운영용 Frontend Vite + React 마이그레이션 ✅ 완료 (2026-05-26)

- 목표: `frontend/` prototype reference의 화면 설계를 공식 소스 경로 `apps/dashboard-web/` 의 Vite + React 정적 SPA로 이전하고 S3 + CloudFront 배포 가능한 `dist/` 산출물을 만든다.
- DoD: `apps/dashboard-web/`에서 `npm run build` 성공, `dist/` 산출물 생성, Cognito Hosted UI / API base URL / WebSocket base URL이 환경변수로 분리됨, `frontend/` prototype과 주요 화면 흐름이 일치함
- **완료된 결과**: `npm run build` → `dist/` 675 kB, `npm run lint` → 0 errors, `npm run test` → 6 passed. 7개 환경변수 VITE_* 모두 분리됨.
- 허용 파일: `apps/dashboard-web/**`, `docs/specs/monitoring_dashboard/04_risk_twin_web_screen_design.md`, 필요한 문서
- 환경변수 계약 (Frontend): `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_REDIRECT_URI`, `VITE_COGNITO_LOGOUT_URI`

> LLM 일간 보고서(ADR 0016, Bedrock + Lambda report-generator)는 팀원/후속 작업으로 분리한다. 본 환경 Step 8에서는 구현하지 않는다.

#### Phase 1 Step 9 — S3+CloudFront 배포 CI/CD + End-to-end 통합 검증

- **Part 1 — S3+CloudFront 배포 CI/CD (2026-05-26 구현 및 배포 완료)**:
  - GitHub Actions `.github/workflows/dashboard-web.yml` 신설 (push main + workflow_dispatch 트리거)
  - Workflow Node runtime: `node-version: "24"` + `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
  - IAM role `KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy` 신설 (ADR 0023, 별도 role, 최소권한)
  - Terraform apply: 2 added, 0 changed, 0 destroyed
  - 등록 완료: repo-level Secret `AWS_OIDC_DASHBOARD_WEB_ROLE_ARN`, repo-level Variables 9종 (`DASHBOARD_WEB_BUCKET`, `DASHBOARD_CLOUDFRONT_DISTRIBUTION_ID`, `VITE_*` 7종)
  - 배포 확인: dashboard-web workflow 성공(Node 24 기준), S3 sync + CloudFront invalidation 완료, dashboard/API health HTTP 200 확인
- **Part 2 — End-to-end 통합 검증** (SPA 배포 후 진행):
  - 목표: factory-a → IoT Core → Lambda data processor → DDB LATEST → Streams → notifier → Redis → WebSocket push 의 전체 경로 측정
  - DoD (수치 목표, `16_data_dashboard_vpc_workplan.md` § Step 9):
    - IoT → DDB LATEST 반영: 일반 10~35초
    - DDB Streams → WebSocket push: 1~2초
    - Backend p95: < 500ms (cache hit < 100ms)
    - WebSocket 100 concurrent connection 부하 테스트 통과
    - WAF 차단 케이스 (간단한 SQLi/XSS 패턴) 차단 확인
- 허용 파일: `.github/workflows/dashboard-web.yml`, `infra/data-dashboard/ecr.tf`, `infra/data-dashboard/outputs.tf`, `docs/ops/22_data_dashboard_vpc_runbook.md`, `docs/changes/0NNN-*`
- 검증: 측정값을 `docs/ops/22_data_dashboard_vpc_runbook.md`의 `Step 9 검증 결과` 섹션에 시간·조건·해석과 함께 기록

#### Phase 1 Step 9.5 — Permanent Resource Split (infra/data-dashboard-permanent/ 분리)

- **설계 및 migration 완료** (2026-05-26, ADR 0024).
- 목표: destroy/apply 반복 시 재설정 비용이 큰 자원을 `infra/data-dashboard-permanent/` 영구 root로 분리. Step 7.5의 Route53 분리 패턴 동일 적용 (import → state rm, No changes 확인).
- 완료 결과:
  - `infra/data-dashboard-permanent/` 신규 root 생성 (providers: ap-south-1 + us-east-1) ✅
  - `terraform import`: 25 resources import 완료 ✅
  - `terraform state rm`: `infra/data-dashboard` root에서 영구 리소스 20개 제거 완료 ✅
  - `infra/data-dashboard` → `infra/data-dashboard-permanent` remote state 참조 교체 완료 ✅
  - permanent plan: 2026-05-27 post-migration diff apply 후 No changes ✅
  - data-dashboard state empty. 재생성 전까지 plan은 apply 후보로만 확인하고 destroy 대상 아님 ✅
  - dashboard/API 엔드포인트 HTTP 200 확인 ✅
- 설계 세션 DoD:
  - ADR 0024 작성 완료 ✅
  - 영구화 리소스 분류 (그룹 A/B/C) 완료 ✅
  - cross-root dependency 분석 완료 (ecs.tf 5개 참조 위치) ✅
  - migration 순서 및 runbook checklist 문서화 완료 ✅
  - git diff --check 통과 ✅
- 허용 파일:
  - `docs/changes/0024-data-dashboard-permanent-resource-split.md` (신규)
  - `docs/planning/16_data_dashboard_vpc_workplan.md`
  - `docs/issues/SESSION_STATE.md`
  - `docs/AI_AGENT_HARNESS.md`
  - `docs/ops/22_data_dashboard_vpc_runbook.md`
  - `docs/ops/15_aws_cost_baseline.md`
  - `infra/data-dashboard-permanent/**` (신설)
  - `infra/data-dashboard/*.tf` (remote_state 참조 교체)
- 금지:
  - `terraform destroy`
  - 사용자 승인 없는 `terraform apply`
  - `scripts/destroy/*` 실행 금지 (사용자 승인 없이)
  - `infra/foundation/**`, `infra/hub/**` 수정 금지 (워크스트림 A)
- 후속 확인:
  - permanent plan의 3개 in-place change 적용 여부 결정
  - data-dashboard plan의 ECS task definition diff 원인 정리
- 참조: `docs/changes/0024-data-dashboard-permanent-resource-split.md`, `docs/ops/22_data_dashboard_vpc_runbook.md § Permanent resource split migration checklist`

#### Phase 1 Step 10 — 운영 문서 + 자동화 스크립트

- 목표: `scripts/build/build-data-dashboard.sh`, `scripts/destroy/destroy-data-dashboard.sh`, runbook, drawio 갱신, 비용 baseline 실측 재갱신
- DoD: 1회 완전 build → destroy 사이클이 동일 머신에서 재현됨, destroy 후 잔존 자원이 Route53 hosted zone + S3 + RDS snapshot 만 남음을 AWS API 로 확인
- 허용 파일: `scripts/build/build-data-dashboard.sh`, `scripts/destroy/destroy-data-dashboard.sh`, `docs/architecture/drawio/*.drawio`, `docs/architecture/01_target_architecture.md`, `docs/ops/15_aws_cost_baseline.md`, `docs/ops/2N_*runbook.md`
- 금지: `destroy-data-dashboard.sh` 가 사용자 확인 없이 RDS 를 `skip-final-snapshot` 으로 삭제하는 동작
- 검증: 두 번째 build 후 모든 endpoint 가 idempotent 하게 동일 결과를 내는지

### 5.5 Phase 2~4 — 트리거 기반 후속 확장

- 본 환경에서 **선제 구현 금지**. 진입 조건은 `docs/planning/17_expansion_roadmap.md` § Phase 2/3/4 트리거 표를 따른다
- 트리거가 측정값으로 입증되기 전에는 ADR 작성·구현 모두 하지 않는다

### 5.6 마일스톤 ↔ Phase 1 Step 합산 매핑

| 마일스톤 / 이슈 | 본 환경 매핑 |
| --- | --- |
| M4 Issue 1~5 (스키마/Edge Agent/Container/IoT 적재) | **워크스트림 A** — 본 환경 미진행. 송신 측 인터페이스만 소비 |
| M4 Issue 6 (Lambda data processor) | **Phase 1 Step 4 + 5** |
| M4 Issue 7 (pipeline status) | Lambda data processor 내부 단계 (Phase 1 Step 4) |
| M4 Issue 8 (end-to-end 검증) | **Phase 1 Step 9** |
| M6 Issue 1~4 (Risk 계산 / runtime-config / 임계값 / Twin 구조) | Lambda data processor 내부 (Phase 1 Step 4) |
| M6 Issue 5~7 (Dashboard 화면) | **Phase 1 Step 1 + 6 + 8** |
| M6 Issue 8 (시나리오 검증) | **Phase 1 Step 9** |
| M6 추가 (RDS 메타·LLM 보고서) | RDS 메타는 **Phase 1 Step 3**, LLM 보고서는 팀원/후속 작업 |

---

## 6. 비-협상 엔지니어링 규칙 (Non-Negotiable Rules)

> 위반 시 작업을 중단하고 사용자에게 알린다.

1. **민감 정보 금지**: 비밀번호 · token · private key · 인증서 · MFA OTP · 전체 ARN 이상의 계정 세부 정보는 어떠한 문서 / 코드 / 커밋 메시지 / PR 본문 / 로그에도 기록하지 않는다. `secret/**` 와 `*.tfvars` 는 git 추적 금지. 이미 추적된 경우 즉시 사용자에게 알리고 중단한다.
2. **워크스트림 경계**: § 3 의 Denylist 자산은 사용자가 본 환경에서 명시 지시한 경우에만 만진다. 모호하면 묻는다.
3. **GitOps drift 금지**: `kubectl apply` 직결로 클러스터 상태를 변경하지 않는다. 변경은 GitOps repo 의 PR 로만 한다 (워크스트림 A 경계 참고).
4. **destroy 자율 실행 금지**: `scripts/destroy/*` 는 사용자 명시 승인 없이 실행하지 않는다. `terraform destroy` 도 동일.
5. **`--no-verify`, `--force` 금지**: pre-commit hook 우회, force-push, 서명 우회는 사용자 명시 요청 시에만.
6. **미완료의 "완료" 금지**: `MASTER_CHECKLIST.md` 의 `[x]` 는 해당 이슈의 Acceptance Criteria 가 모두 통과했을 때만 체크.
7. **새 AWS 리소스 = 비용 영향 분석 우선**: `docs/ops/15_aws_cost_baseline.md` 에 시간당 / 데모 / 상시 단가를 함께 갱신한 PR 만 머지.
8. **운영 source of truth = `docs/ops/`**: 운영 절차 변경이 코드 PR 보다 늦지 않게 함께 들어가야 한다.
9. **계획 ≠ 구현 결정**: 사후 발견되는 차이는 `docs/changes/0NNN-*.md` 로 ADR 기록. 기존 ADR 본문을 통째로 덮어쓰지 않는다 (`superseded by` 표기).
10. **루트 원인 분석 우선**: 검증 실패 시 lint 우회·체크 비활성화로 우회하지 않는다.

---

## 7. 검증 명령 (Verification Commands)

> 본 표는 "에이전트가 작업 종료 전에 어떤 명령으로 통과를 입증해야 하는가" 의 표준 목록이다. 모든 Phase 1 Step 의 검증은 본 표를 기준으로 한다.

| 카테고리 | 명령 | 기대 결과 |
| --- | --- | --- |
| 변경 범위 확인 | `git status` / `git diff --stat` | 본 환경 허용 경로만 변경 |
| Terraform 형식 | `terraform -chdir=infra/data-dashboard fmt -check` | exit 0 |
| Terraform 검증 | `terraform -chdir=infra/data-dashboard validate` | "Success!" |
| Terraform 계획 | `terraform -chdir=infra/data-dashboard plan -detailed-exitcode` | exit 0 (변경 없음) 또는 exit 2 (예상 변경) |
| 워크스트림 A 영향 0 | `terraform -chdir=infra/hub plan -detailed-exitcode` / `terraform -chdir=infra/foundation plan -detailed-exitcode` | exit 0 |
| Frontend 빌드 | `cd apps/dashboard-web && npm ci && npm run build` | `dist/` 산출물 생성 |
| Frontend 린트/테스트 | `npm run lint && npm run test` | exit 0 |
| Backend 단위 테스트 | `cd apps/dashboard-backend && pytest -q` | 0 failed |
| Backend 컨테이너 헬스 | `docker run ... && curl -sf localhost:8000/healthz` | HTTP 200 |
| 인증 차단 케이스 | `curl -sI -H "Authorization: Bearer invalid" https://api.<도메인>/factories` | HTTP 401 |
| WebSocket 핸드셰이크 | `wscat -c wss://api.<도메인>/ws/factories/factory-a -H "Authorization: Bearer <valid>"` | `Connected` |
| DynamoDB | `aws dynamodb describe-table --table-name AEGIS-DynamoDB-FactoryStatus` | StreamSpecification.StreamEnabled=true |
| RDS | `aws rds describe-db-instances --db-instance-identifier <id>` | DBInstanceStatus=available, MultiAZ=false, StorageType=gp3 |
| Redis | `aws elasticache describe-replication-groups --replication-group-id <id>` | TransitEncryptionEnabled=true, AuthTokenEnabled=true |
| Bedrock 호출 | 팀원/후속 LLM 보고서 작업에서 별도 검증 | 본 환경 Step 8 대상 아님 |
| 비용 baseline | `docs/ops/15_aws_cost_baseline.md` diff 가 PR 에 포함 | yes |
| Markdown 린트 | **현재 저장소에 `markdownlint` / `vale` 설정 없음** | "린트 도구 미설정" 으로 명시 기록 후 § 9 의 수기 체크리스트로 대체 |
| 문서 테스트 | **현재 저장소에 doc test 없음** | "문서 테스트 미설정" 으로 명시 기록 |

### 7.1 린트/테스트가 없을 때의 수기 검증 체크리스트

- [ ] 한국어 개조식 톤 유지 (`-` bullet, 종결어미 일관)
- [ ] 코드/명령은 fenced code block (`` ``` ``)
- [ ] 표 정렬과 헤더 구분선 유지
- [ ] 상태 라벨(`source of truth` / `draft` / `candidate`)이 문서 상단에 있음
- [ ] 기준일이 ISO 날짜(YYYY-MM-DD) 형식
- [ ] 절대경로 인용 시 repo 상대경로로
- [ ] 비밀 정보 / 전체 ARN / 계정 식별자 미포함
- [ ] 새 AWS 자원 추가 PR 에 `docs/ops/15_aws_cost_baseline.md` 변경 포함

---

## 8. 데이터 / API / 런타임 계약 (Contracts)

### 8.1 IoT → S3 raw / DynamoDB LATEST / HISTORY

- IoT 메시지 스키마 source of truth: `docs/specs/iot_data_format.md`
- 표준 처리 파이프라인: `docs/specs/data_storage_pipeline.md`
- DynamoDB 키 (요약 — 상세는 `data_storage_pipeline.md` 우선):
  - `AEGIS-DynamoDB-FactoryStatus` (LATEST + HISTORY 통합): PK `pk` (e.g., `FACTORY#<factory_id>`), SK `sk` (e.g., `LATEST` 또는 `HISTORY#STATE#<ISO timestamp>`), Streams `NEW_AND_OLD_IMAGES` 필요. `aegis-factory-status` 신규 사용 금지(ADR 0022)
  - `aegis-daily-report`: PK `report_date` (YYYY-MM-DD), SK `factory_id`
- S3 prefix: `raw/`, `processed/`, `reports/` (ADR 0009)
- IoT Rule 트리거: § 5 Phase 1 Step 4 결정 ADR 에 따른다

### 8.2 Dashboard Backend HTTP / WebSocket API

> 본 절은 **Step 6 구현 기준 계약**이다. OpenAPI / AsyncAPI 문서 산출물은 Step 7 배포 전후 실제 ALB/WebSocket endpoint 검증과 함께 보강한다.

| Endpoint | Method | 인증 | 설명 | 응답 |
| --- | --- | --- | --- | --- |
| `/healthz` | GET | none | liveness | `{"status":"ok"}` |
| `/factories` | GET | Cognito JWT | 사용자 권한 기반 공장 목록 | `[{factory_id, name, risk_level, last_seen}]` |
| `/factories/{factory_id}` | GET | Cognito JWT | 공장 상세 (LATEST + 메타) | 단일 객체 |
| `/factories/{factory_id}/history` | GET | Cognito JWT | 시계열 (DDB HISTORY) | `[{timestamp, payload}]` |
| `/reports` | GET | Cognito JWT | 일간 보고서 메타 목록 | `[{report_date, factory_id, s3_key}]` |
| `/reports/{report_date}/{factory_id}` | GET | Cognito JWT | 단일 보고서 Markdown | text/markdown |
| `/ws/factories/{factory_id}` | WS | Cognito JWT | 실시간 상태 push | server-sent JSON frames |

- 인증: Cognito User Pool JWT 를 ALB Authenticator 가 아니라 **앱 레벨**(`deps/auth.py`) 에서 검증 (ADR 0008 + 0012)
- 캐시: Redis 5분 TTL (LATEST 응답), `Cache-Control` 헤더로 클라이언트에도 명시
- 에러 정책: 5xx 는 JSON `{"error":"...","request_id":"..."}` 형식 일관

### 8.3 IAM / Task Role 최소권한 (Phase 1 Step 7)

| 주체 | 권한 |
| --- | --- |
| ECS Task Role (Backend) | `dynamodb:Get/Query/PutItem` (테이블 2개), `s3:GetObject` (`processed/*`, `reports/*`), `secretsmanager:GetSecretValue` (RDS·Redis AUTH), `kms:Decrypt` (필요 시) |
| Lambda data processor | `dynamodb:PutItem/UpdateItem` (테이블 1), `s3:PutObject` (`processed/*`), `logs:*` |
| Lambda notifier | DDB Streams read, ElastiCache (보안그룹), `secretsmanager:GetSecretValue` (Redis AUTH), `logs:*` |
| Lambda report-generator (팀원/후속) | `dynamodb:Query` (`AEGIS-DynamoDB-FactoryStatus` HISTORY), `s3:Get/PutObject` (`processed/*`, `reports/*`), `bedrock:InvokeModel`, `dynamodb:PutItem` (`aegis-daily-report`) |

### 8.4 환경변수 / 시크릿 정책

- 코드는 환경변수와 Secrets Manager ARN 만 읽는다. 원본 시크릿 값을 환경변수 default 에 두지 않는다
- `.env.example` 는 commit, `.env*` (예외: `.env.example`) 는 `.gitignore` 에 포함
- 모든 시크릿은 AWS Secrets Manager 우선. Parameter Store 는 비밀 아닌 설정 한정
- 로컬 개발 환경의 시크릿은 `~/.aegis/secrets/**` 또는 macOS Keychain / 1Password 등 외부 보관소 사용

---

## 9. 문서 작성 표준 (Editing Conventions)

- 언어: 한국어 (개조식 우선), 코드·식별자는 원문
- 상단에 `상태:` (`source of truth` / `draft` / `candidate`) 와 `기준일:` (ISO 날짜) 명시
- 큰 변경은 상단에 `수정 이력:` 추가 (`| YYYY-MM-DD | rev-YYYYMMDD-XX | 요약 |`)
- 새 결정은 `docs/changes/0NNN-...md` ADR 로 분리. 기존 ADR 본문 통째 덮어쓰기 금지 (`superseded by` 표기)
- `factory-a` 완료 내용과 후속 Hub 확장 내용을 한 문서에 섞지 않는다
- UI 절차는 UI 절차로 명시 (ArgoCD Web Settings → Repositories 등)
- 테스트 결과는 **시간 · 측정 기준 · 해석** 셋을 함께 남긴다 (단순 OK 금지)
- 비용 영향 동반 갱신: `docs/ops/15_aws_cost_baseline.md`

### 9.1 GitHub Issue Comment Draft 양식

```text
- 상태: 완료 / 부분 완료 / 보류 / 진행 중
- 진행 요약: 1~2문장
- 변경/확인: 주요 파일, 스크립트, Terraform/Ansible root, 운영 문서
- 검증: 실행 명령, 확인 상태, 테스트 결과
- 후속: 없음 / 다음 issue / 보류 사유
```

---

## 10. 알려진 결함 / TODO / Needs Decision

> 본 절은 **숨겨진 미완료를 명시화**한다. 작업 중 새 결함을 발견하면 본 절에 추가하고 PR 에 함께 commit.

### 10.1 알려진 미완료 (Known Gaps)

- M0 Issue 6 — Host PC NFS Cold Storage: 보류
- M0 Issue 12 — `start_test` 자동화 부분 완료. Hot/Cold 티어링 자동화 미완
- M1 Issue 11 — Admin UI 운영 보안 강화 (WAF / Cognito / OIDC): 보류
- EKS API endpoint public CIDR 축소: 보류
- `apps/dashboard-backend/` — **완료** (Phase 1 Step 6~7, 2026-05-26). pytest 18 passed, docker build 통과, ECS Fargate 배포 및 `/healthz` 200 확인
- `apps/dashboard-web/` — **완료** (Phase 1 Step 8, 2026-05-26). Vite+React SPA, npm build/lint/test 통과.
- `.github/workflows/dashboard-web.yml` — **구현/배포 완료** (Phase 1 Step 9, 2026-05-26). test + build-and-deploy jobs 성공. Terraform apply 2 add 0 change. repo-level Secret/Variable 등록 완료
- `infra/data-dashboard/ecr.tf` — Step 9: `github_oidc_web_deploy` IAM role 추가 완료 (ADR 0023)
- `apps/lambda-report-generator/` 디렉터리 미존재 — LLM 일간 보고서는 팀원/후속 작업으로 분리
- `infra/data-dashboard-permanent/` — **신설 완료** (Phase 1 Step 9.5, 2026-05-26). 25 resources import 완료. 2026-05-27 post-migration 3개 in-place change 적용 후 permanent plan No changes
- `scripts/build/build-data-dashboard.sh`, `scripts/destroy/destroy-data-dashboard.sh` 미존재 — Phase 1 Step 10 신설
- `frontend/` = 화면 설계 prototype/reference. `apps/dashboard-web/` = 운영 배포용 공식 SPA (**Step 8 완료**)
- GitHub Secret `AWS_OIDC_DASHBOARD_ROLE_ARN` — `aegis-pi` organization 수준 등록 완료(사용자 확인 기준)
- Markdown 린트 / 문서 테스트 도구 미설정 — § 7.1 수기 체크리스트로 대체

### 10.2 Needs Decision (열린 결정)

| 항목 | 위치 | 메모 |
| --- | --- | --- |
| Bedrock 호출 region 확정 (`ap-south-1` vs `us-east-1` cross-region) | 팀원/후속 LLM 보고서 작업 | Bedrock 가용 모델 목록 확인 후 ADR 0016 부록 추가 |
| 신규 Dashboard 도메인명 | Phase 1 Step 0 | Gabia 구매 후 ADR 0010 부록에 도메인명 + NS 4개 기록 (전체 NS 풀세트는 별도 보관) |
| RDS PostgreSQL 운영 백업 / PITR 정책 (데모 운영 vs 상시 운영) | Phase 1 Step 3 / Phase 2 | 상시 운영 결정 시점에 ADR 작성 |
| `aegis-pi-gitops` repo 와 본 repo 분리/통합 최종 정책 | M7 Issue 0 | 통합 검증 시 결정 |
| CloudFront WAF allow-list (관리자 IP) | Phase 1 Step 2 | 데모/상시 운영 분리 시 ADR |

### 10.3 알려진 문서 모순 / 보강 필요

- 본 harness 작성 시점(2026-05-19) 의 `CLAUDE.md` / `AGENTS.md` / `README.md` 의 "현재 단계 = M3 Issue 2 진행 중" 표기는 **본 환경 한정으로는 부정확** — 본 환경은 Phase 1 Step 0~3 진입 단계다. § 2 가 우선
- `docs/architecture/00_current_architecture.md` 기준일 2026-05-08 ↔ Hub 재생성(2026-05-15) 사이의 격차는 Phase 1 Step 10 단계에서 한 번에 갱신 권고
- `docs/planning/02_implementation_plan.md` 의 Phase 표는 마일스톤 기반이라 워크스트림 분리 이후 본 환경 작업 매핑을 보강할 필요 (본 harness § 4 / § 5.6 가 임시 매핑)

---

## 11. 미래 작업 요청 가이드 (How to Prompt Future Claude Code / Codex)

### 11.1 좋은 프롬프트 형식

```text
[목표] Phase 1 Step <N>: <Step 이름>
[참고] docs/AI_AGENT_HARNESS.md § 5.4 Step <N>
       docs/planning/16_data_dashboard_vpc_workplan.md § Step <N>
       docs/changes/<관련 ADR>
[변경 범위] <Allowlist 경로>
[금지] <Denylist 경로 — 본 환경 워크스트림 A 자산>
[검증] <§ 7 의 명령 목록>
[종료 조건] <§ 5.4 의 DoD 체크리스트>
[질문 정책] 모호하면 진행 전에 묻기
```

### 11.2 단순 명령 예

- "Phase 1 Step 0 도메인 ADR 부록 작성. NS 4개 placeholder 유지."
- "Phase 1 Step 2 Terraform skeleton. `infra/data-dashboard/` 신설. 신규 리소스 prefix는 `KJW-AEGIS-Data-*`. 워크스트림 A plan 변경 0 검증."
- "Phase 1 Step 3 DynamoDB + RDS + Redis Terraform 추가. RDS 초기 비밀번호 Secrets Manager 로 분리."
- "Phase 1 Step 6 Backend FastAPI 골격. `/healthz` + `/factories` + `/ws/factories/{id}` 만 우선."

### 11.3 위험한 요청을 받았을 때

다음 요청은 본 환경에서 즉시 거절하거나 사용자에게 확인 후 진행:

- "워크스트림 A 자산을 수정해줘" → § 3 Denylist 인지 확인 + 사용자 명시 승인 요구
- "destroy 스크립트 실행해줘" → 사용자 명시 승인 + 비용 / 잔존 자원 검토 후
- "MFA OTP / 비밀번호 적어둬" → 거절
- "린트를 끄고 빨리 머지해줘" → 거절. 루트 원인 분석 우선

---

## 12. 핵심 참조 (Authoritative Cross-References)

- 운영: `docs/ops/00_quick_start.md`, `docs/ops/15_aws_cost_baseline.md`
- 진행 추적: `docs/issues/SESSION_STATE.md`, `docs/issues/MASTER_CHECKLIST.md`
- 책임 경계: `docs/planning/11_delivery_ownership_flow.md`
- 클라우드 구조 확정: `docs/planning/15_cloud_architecture_final.md`
- 워크스트림 B 작업 계획: `docs/planning/16_data_dashboard_vpc_workplan.md`
- 확장 로드맵: `docs/planning/17_expansion_roadmap.md`
- 현재 / 목표 아키텍처: `docs/architecture/00_current_architecture.md`, `01_target_architecture.md`
- 데이터 / IoT 계약: `docs/specs/iot_data_format.md`, `docs/specs/data_storage_pipeline.md`
- Dashboard 화면 / API: `docs/specs/monitoring_dashboard/00_requirements.md` ~ `05_screen_data_mapping.md`
- 변경 기록(ADR): `docs/changes/0001` ~ `0017`

---

## 13. 변경 이력 (Change Log of This File)

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-05-19 | v1.0 | 초안. 워크스트림 B Phase 1 통합 결정 (ADR 0012~0017) 반영, 마일스톤↔Phase 매핑 표 + 검증 명령 + 데이터/계약/Needs Decision 정리 |
| 2026-05-26 | v1.1 | Step 6 완료 반영. TL;DR·§ 2·§ 10.1 갱신. Step 1 frontend/ vs apps/dashboard-web/ 경로 구분 추가. Known Gaps에서 apps/dashboard-backend/ 완료 처리. |
| 2026-05-26 | v1.2 | Step 8을 운영용 Frontend Vite + React 마이그레이션으로 재정의. LLM 일간 보고서는 팀원/후속 작업으로 분리. Backend Bedrock 권한/환경변수 제거. |
| 2026-05-26 | v1.3 | Step 8 완료 반영. apps/dashboard-web/ Vite+React SPA 구현 완료. TL;DR·§ 2·§ 5.4·§ 10.1·§ 13 갱신. 다음 단계 Step 9 S3+CloudFront 배포 CI/CD. |
| 2026-05-26 | v1.4 | Step 9 S3+CloudFront 배포 CI/CD 구현/적용/SPA 배포 반영. dashboard-web.yml, IAM web deploy role(ADR 0023), Terraform apply, GitHub Actions 배포 성공, Node 24 workflow runtime 확인. TL;DR·§ 2·§ 5.4·§ 10.1·§ 13 갱신. |
| 2026-05-26 | v1.5 | Step 9.5 설계 완료 반영. ADR 0024. § 5.4 Step 9.5 DoD/허용/금지 추가. TL;DR·§ 2·§ 10.1·§ 13 갱신. |
| 2026-05-26 | v1.6 | Step 9.5 migration 완료 반영. infra/data-dashboard-permanent/ 신설, 25 resources import, data-dashboard state rm 20개, post-migration plan diff 후속 확인사항 기록. |
| 2026-05-27 | v1.7 | post-migration permanent diff 정리 완료. permanent/dns plan No changes, state count 0/25/1 확인. |
