# AGENTS.md

> Aegis-Pi Risk Twin 작업 시 AI 코딩 에이전트가 따라야 할 표준 가이드.
> 기준일: 2026-05-19 / 문서 언어: 한국어 (개조식 우선)
> Claude 전용 규칙은 `CLAUDE.md`. 본 문서는 도구 중립 기준.
> **AI 에이전트 harness 단일 진입점**: `docs/AI_AGENT_HARNESS.md` (phase별 DoD · 허용/금지 파일 · 검증 명령 · 프롬프트 가이드)

## 정체성

- 프로젝트: Aegis-Pi Risk Twin
- 한 줄: Safe-Edge 단일 공장 엣지를 멀티 공장 중앙 관제로 확장하는 Risk Twin 플랫폼
- 1차 사용자: 본사 관제 담당자 / 2차: 현장 운영자·배포 담당·시스템 관리자

## 현재 상태

- 본 환경(워크스트림 B) 현재 단계: **Phase 1 Step 0~3 진입 준비** — 1번 Data / Dashboard VPC 통합 (`docs/planning/16_data_dashboard_vpc_workplan.md`)
- 워크스트림 A(팀, 다른 환경) 진행 중: M3 Issue 2 — ECR push/pull 검증. **본 환경에서는 수정/실행하지 않는다**
- 완료: M0 전체, M1 Issue 0~10/12, M2 Issue 1~6, M3 Issue 1/4
- 보류: M0 Issue 6 (NFS), M1 Issue 11 (운영 보안 강화), EKS API endpoint CIDR 축소
- AWS: 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성. 1번 VPC 미배포. 비용 기준은 `docs/ops/15_aws_cost_baseline.md`
- 시점별 정확한 스냅샷은 항상 `docs/issues/SESSION_STATE.md` 가 우선

## 디렉터리

```
docs/      설계/운영/검증/시연/보고 문서
apps/      edge-agent · dummy-sensor · risk-score-engine · risk-normalizer · pipeline-status-aggregator
infra/     Terraform (hub, foundation, safe-edge, mesh-vpn, deploy)
scripts/   build, destroy, ansible, ops, iot, hub, lib, config
charts/    Helm (aegis-hub, aegis-spoke)
configs/   runtime-config 등
envs/      환경별 설정
tests/     테스트
```

## 책임 경계 (절대 섞지 말 것)

- Terraform = AWS 인프라 (VPC/EKS/IAM/S3/ECR/AMP/IoT Core/Dashboard VPC)
- Ansible = bootstrap, 클러스터 설정, 소프트웨어 설치, 검증
- GitHub Actions = CI (lint/test/image build/ECR push/values 갱신)
- GitHub + ArgoCD = CD (GitOps source of truth, Application/ApplicationSet sync)
- 상세: `docs/planning/11_delivery_ownership_flow.md`

## 이미지/레지스트리

- ECR: `611058323802.dkr.ecr.ap-south-1.amazonaws.com`
- 현재 repo: `aegis/edge-agent`, 태그: `sha-<7-char-git-sha>`
- Docker Hub는 임시 실습용. GitOps values는 ECR reference만 기록
- Spoke(Raspberry Pi K3s)는 IAM node role 미상속 → `imagePullSecret`(`ecr-registry`, ns `aegis-spoke-system`)을 별도 갱신

## Factory-A 기준선

```
factory-a Raspberry Pi 3-node K3s (v1.34.6+k3s1)
  master  10.10.10.10
  worker1 10.10.10.11  failover standby
  worker2 10.10.10.12  sensor/AI/audio preferred

ArgoCD   10.10.10.200    Longhorn 10.10.10.201    Grafana 10.10.10.202
GitOps:  https://github.com/aegis-pi/safe-edge-config-main.git
NS:      argocd / longhorn-system / monitoring / ai-apps
```

## Hub 기준 (재생성 시)

```
Region    ap-south-1
VPC CIDR  10.0.0.0/16
AZ        ap-south-1a, ap-south-1c
EKS       AEGIS-EKS  (K8s 1.34, t3.medium x 2)
Naming    AEGIS-[resource]-[feature]-[zone]
Admin UI  argocd.minsoo-tech.cloud / grafana.minsoo-tech.cloud
```

## Tailscale 기준

- `factory-a-master` 100.117.40.125 (tag: `aegis-spoke-prod`, `factory-a`)
- EKS operator 100.92.186.18 · ArgoCD egress proxy 100.104.73.68
- Worker 노드는 Tailnet 비참여

## 데이터 플레인 (목표)

```
Edge Agent -> IoT Core
   IoT Rule -> S3 raw
   Lambda data processor -> DynamoDB LATEST/HISTORY + S3 processed
                          -> Dashboard API/Web (Data/Dashboard VPC)
```

- 실시간성 = 준실시간 (1~5초 또는 수십 초). 초저지연 제어 아님
- S3 raw = 원본 보존/재처리/리포트 입력. Dashboard는 DynamoDB hot store 우선

## 운영 entrypoint

```bash
scripts/build/build-all.sh                # 전체 재생성
scripts/build/build-all.sh --admin-ui     # Admin UI 포함
scripts/build/build-hub.sh                # Hub만 재생성
scripts/build/build-admin-ui-after-ns.sh  # ACM ISSUED 이후 Admin UI 활성
scripts/destroy/destroy-hub.sh            # Hub만 삭제
scripts/destroy/destroy-all.sh            # IoT/Hub/foundation 전체 삭제
scripts/ops/argocd-port-forward.sh        # 로컬 fallback UI
scripts/ops/grafana-port-forward.sh
```

## 에이전트 작업 흐름

1. 시작 전 `docs/issues/SESSION_STATE.md`로 다음 작업 확인
2. **`docs/AI_AGENT_HARNESS.md` § 5 의 해당 Phase Step DoD 와 § 3.1 의 허용/금지 파일 확인**
3. 관련 issue 문서 + `docs/planning/11_delivery_ownership_flow.md` 책임 경계 확인
4. 작업 후 `git diff --stat`과 검증 결과 기준으로 `GitHub Issue Comment Draft` 갱신
5. `MASTER_CHECKLIST.md`는 실제 완료 항목만 체크 (마일스톤 완료는 원본 issue Acceptance Criteria 재확인)
6. 계획 ≠ 실제 구현된 결정은 `docs/changes/`에 신규 `0NNN` 문서 추가
7. 모호하면 워크스트림(A/B) 확인 질문 우선 — 추정 금지

## 문서 작성 규칙

- 비밀번호 / token / private key / 인증서 / MFA OTP / 전체 ARN 이상의 계정 세부정보는 절대 기록 금지
- `factory-a` 완료 내용과 후속 Hub 확장 내용을 한 문서에 섞지 않는다
- UI 절차(ArgoCD repo 등록 등)는 UI 절차로 명시
- 테스트 결과는 시간·측정 기준·해석을 함께 남긴다
- AWS 리소스/상시 실행 컴포넌트 추가 → `docs/ops/15_aws_cost_baseline.md` 동시 갱신
- 문서 상단에 상태 명시: `source of truth` / `draft` / `candidate`
- 이슈 문서 수정 시 상단 `수정 이력` (날짜·버전·요약) 추가

## 워크스트림 가드 (2026-05-15~)

- 본 환경의 기본 작업 범위는 **1번 Data / Dashboard VPC (워크스트림 B, Phase 1 통합 결정)** 다
- 워크스트림 A 자산은 사용자가 명시 지시하지 않는 한 **수정/추가/삭제하지 않는다**
  - 코드/IaC: `infra/hub/`, `infra/foundation/`, `infra/mesh-vpn/`, `scripts/ansible/`(Hub bootstrap), `scripts/build/build-hub.sh`, `scripts/build/build-admin-ui-after-ns.sh`, `scripts/destroy/destroy-hub.sh`, `charts/aegis-hub/`, `charts/aegis-spoke/`
  - 문서: `docs/issues/M1_hub-cloud.md`, `M2_mesh-vpn-hub-spoke.md`, `M3_deploy-pipeline.md`, `M5_vm-spoke-expansion.md`, `docs/ops/` 중 Hub/Admin UI/Tailscale/ArgoCD/Grafana 운영 문서
  - AWS: EKS Hub, ArgoCD, Tailscale, Prometheus Agent, Grafana, Admin UI Ingress/ALB/ACM/Route53(`*.minsoo-tech.cloud`), `aegis/edge-agent` ECR repo
- 합류 지점(IoT Core Rule, S3 bucket, ECR, DynamoDB, GitHub) 변경은 즉시 `docs/changes/0NNN-…` ADR로 남긴다
- 요청이 모호하면 어느 워크스트림인지 먼저 확인한다
- 상세 Allowlist/Denylist 와 phase별 DoD: `docs/AI_AGENT_HARNESS.md` § 3 / § 5

## 코드 작업 주의

- 운영 source of truth는 `docs/ops/`. 운영 문서 갱신 없이 구현만 바꾸지 않는다
- `kubectl apply` 직접 실행으로 GitOps drift 만들지 않는다. 변경은 GitOps repo PR로
- destroy 스크립트는 사용자 승인 없이 실행 금지
- IoT/secret 파일은 `secret/`에 두고 git 추적 금지
- 미완료 마일스톤을 "complete"로 마킹하지 않는다
- 새 AWS 리소스 추가 시 비용 영향 분석을 우선 수행
- `--no-verify`, `--force` 같은 안전장치 우회는 사용자 명시 요청 시에만

## 핵심 참조 문서

- **`docs/AI_AGENT_HARNESS.md` — AI 에이전트용 단일 진입점 (phase별 DoD · 허용/금지 · 검증 · 프롬프트 가이드)**
- `docs/README.md` — 문서 인덱스
- `docs/issues/SESSION_STATE.md` — 현재 상태 스냅샷
- `docs/issues/MASTER_CHECKLIST.md` — M0~M7 진행 추적 + Phase 1 Step 0~10
- `docs/planning/00_project_overview.md` — 프로젝트 정의
- `docs/planning/11_delivery_ownership_flow.md` — 책임 경계
- `docs/planning/15_cloud_architecture_final.md` — 최종 클라우드 구조
- `docs/planning/16_data_dashboard_vpc_workplan.md` — 본 환경 Phase 1 Step 0~10 (source of truth)
- `docs/planning/17_expansion_roadmap.md` — Phase 1~4 확장 트리거
- `docs/ops/00_quick_start.md` — 빠른 확인
- `docs/ops/15_aws_cost_baseline.md` — 비용 기준
- `docs/architecture/00_current_architecture.md` · `01_target_architecture.md` — 현재 / 목표 구조
- `docs/specs/iot_data_format.md` · `docs/specs/data_storage_pipeline.md` — 데이터 포맷 / 파이프라인 계약
- `docs/changes/README.md` — 변경 기록(ADR 0001~0017)
