# docs/planning/ AGENTS.md

> 프로젝트 개요·범위·결정·확장 계획 문서 (도구 중립).
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- "왜 이렇게 결정했는가", "다음 단계는 무엇인가"의 출발점
- 운영 절차는 `../ops/`, 진행 추적은 `../issues/`로 분리

## 핵심 파일

| 파일 | 역할 | 상태 |
| --- | --- | --- |
| `00_project_overview.md` | 프로젝트 정의·사용자·핵심 기능·구현 상태 | source of truth |
| `02_implementation_plan.md` | 구현 단계 / 마일스톤 |
| `03_evaluation_plan.md` | 검증 계획 |
| `05_decision_rationale.md` | K3s/Edge Agent/IoT Core/S3/Lambda 주요 선택 이유 |
| `06_edge_agent_deployment_plan.md` | Edge Agent 배포 방향 |
| `07_dashboard_vpc_extension_plan.md` | Dashboard VPC 확장 / Tailscale 비의존 |
| `08_aws_cli_mfa_terraform_access.md` | AWS CLI MFA + Terraform 접근 |
| `09_m1_eks_vpc_decision_record.md` | Hub EKS/VPC MVP 기준 |
| `11_delivery_ownership_flow.md` | **Terraform/Ansible/GHA/ArgoCD 책임 경계** |
| `12_two_vpc_mvp_architecture_decision.md` | 1번 Data/Dashboard + 2번 Control/Management 결정 |
| `13_architecture_adr_backlog.md` | ADR 후보 |
| `14_argocd_hub_migration_plan.md` | factory local ArgoCD → Hub ArgoCD 이관 |
| `15_cloud_architecture_final.md` | **확정된 클라우드 아키텍처** |
| `04_document_creation_priority.md` | 문서 작성 우선순위 |
| `10_portfolio_idea_assessment.md` | 포트폴리오 관점 평가 |
| `01_safe_edge_transition.md` | Safe-Edge → Aegis-Pi 전환 |

## 작성 규칙

- 결정 문서는 `상태:` / `기준일:` / `결정 이유` / `대안` / `영향` 구조 유지
- 결정이 바뀌면 신규 문서를 만들고 기존 문서는 `superseded by` 표기. 본문을 통째로 덮어쓰지 않는다
- 큰 방향 변경은 `../changes/` 에도 mini-ADR로 동시 기록
- 멘토링/리뷰 반영 섹션은 "기존 초안" / "변경 이유" / "보강 방향" 셋으로 명확히 분리

## 진입 순서

1. `00_project_overview.md`
2. `11_delivery_ownership_flow.md` — 책임 경계
3. `15_cloud_architecture_final.md` — 최종 클라우드 구조
4. `12_two_vpc_mvp_architecture_decision.md`
5. `09_m1_eks_vpc_decision_record.md`
6. `13_architecture_adr_backlog.md` — 미결 결정 검토

## 인용 우선순위

- 클라우드 리소스 배치: `15_cloud_architecture_final.md` > `12_two_vpc_mvp_architecture_decision.md` > `01_target_architecture.md`(architecture/)
- 책임 경계: `11_delivery_ownership_flow.md` (전 디렉터리 기준)
- 비용 영향: `../ops/15_aws_cost_baseline.md` 동시 갱신
