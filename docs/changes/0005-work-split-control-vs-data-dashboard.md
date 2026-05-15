# 0005. Workstream Split: Team -> 2번 Control/Management VPC, This Env -> 1번 Data/Dashboard VPC

상태: accepted
결정일: 2026-05-15
관련 범위: M3~M6, Control/Management VPC, Data/Dashboard VPC, 작업 환경 분리

## 기존 계획

- 단일 작업자가 한 환경에서 `docs/planning/15_cloud_architecture_final.md`의 두 VPC(1번 Data/Dashboard, 2번 Control/Management)를 모두 순차 진행한다는 암묵 전제로 진행해 왔다.
- M3 배포 파이프라인까지 진행한 환경(`/home/jongwon/personal_project/Aegis-pi`)이 그대로 M4~M6 데이터/대시보드 영역도 이어받는 흐름이었다.

## 변경된 실제 기준

작업 환경을 두 워크스트림으로 분리한다.

```text
워크스트림 A (팀)
  영역: 2번 Control / Management VPC
  주요 리소스: EKS Hub, ArgoCD, Tailscale, Prometheus Agent, Grafana,
              AWS Load Balancer Controller, Admin UI Ingress
  대응 마일스톤: M1, M2, M3, M5 (Hub/배포/Spoke 연결 측)
  source of truth: 기존 코드/문서 흐름 유지

워크스트림 B (이 작업 환경: /home/jongwon/personal_project/Aegis-pi)
  영역: 1번 Data / Dashboard VPC
  주요 리소스: IoT Core 이후 Lambda data processor 연동, DynamoDB LATEST/HISTORY,
              S3 processed, Dashboard Backend/API, Dashboard Web,
              ALB/WAF/ACM (Dashboard 도메인), Cognito or 외부 IdP (후속)
  대응 마일스톤: M4 데이터 플레인, M6 Risk Twin/Dashboard
  source of truth: 본 환경에서 갱신
```

두 워크스트림은 GitHub repository, Terraform state, AWS 리소스 네이밍을 공유하므로 합류 지점은 다음과 같다.

```text
공유 지점
  - GitHub (코드, GitOps, 문서)
  - ECR `aegis/edge-agent` 및 후속 Data/Dashboard 이미지 repo
  - AWS 계정 / 리전 ap-south-1
  - S3 raw / processed bucket
  - DynamoDB LATEST / HISTORY table
  - IoT Core (송신 측은 워크스트림 A의 Edge Agent, 처리/저장 측은 워크스트림 B의 Lambda)
```

두 VPC를 네트워크로 연결하지 않는다는 기존 결정(`docs/planning/07_dashboard_vpc_extension_plan.md`)은 그대로 유지한다. 합류는 AWS 관리형 저장소(S3, DynamoDB)와 IAM 권한 단위에서만 이루어진다.

## 변경 이유

- 팀 작업과 개인 작업 환경을 동시에 진행하면서 책임 영역이 섞이지 않도록 명시할 필요가 생겼다.
- 2번 Control/Management VPC는 기 구축이 진척돼 있어(M1, M2 완료, M3 진행 중) 이 환경에서 다시 그 위에 손을 대면 GitOps drift와 Terraform state 충돌을 만들 위험이 있다.
- 1번 Data/Dashboard VPC는 아직 Terraform/Lambda/Dashboard 어플리케이션 구현이 비어 있어, 별 환경에서 독립적으로 진행해도 충돌 영역이 작다.
- 마일스톤 매핑(M4/M6 = Data, M1/M2/M3/M5 = Control)이 자연스럽게 정렬된다.

## 영향

- 이 작업 환경에서는 **2번 VPC 측 Terraform/Ansible/ArgoCD/Admin UI 관련 리소스를 신규 생성하거나 변경하지 않는다.**
  - 예외: 1번 VPC 작업이 동일 코드/문서를 참조해 필연적으로 보강이 필요한 경우 변경 사항을 `docs/changes/` 또는 해당 issue draft에 기록한다.
- 새 작업의 1차 source of truth는 다음 문서다.
  - `docs/planning/16_data_dashboard_vpc_workplan.md` (신규)
  - `docs/planning/15_cloud_architecture_final.md`의 `워크스트림 분리` 섹션
  - `docs/issues/M4_data-plane.md`, `docs/issues/M6_risk-twin-dashboard.md`
- 진행 추적은 기존과 동일하게 `docs/issues/MASTER_CHECKLIST.md`와 `docs/issues/SESSION_STATE.md`를 사용한다. 다만 `SESSION_STATE.md`의 "다음 작업 우선순위"는 본 환경 기준(Data/Dashboard VPC 우선)으로 갱신한다.
- AWS 비용 영향이 발생하는 Data/Dashboard 신규 리소스 추가 시 `docs/ops/15_aws_cost_baseline.md`를 동시 갱신한다.

## 업데이트 필요한 문서

- `docs/changes/README.md` (인덱스에 0005 추가)
- `docs/planning/15_cloud_architecture_final.md` (워크스트림 분리 섹션 추가)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (신규)
- `docs/planning/README.md` (인덱스에 16 추가)
- `docs/issues/SESSION_STATE.md` (작업 초점 갱신)

## 검증

- 본 ADR과 신규 워크플랜(`16_data_dashboard_vpc_workplan.md`)이 두 워크스트림의 책임 영역을 모순 없이 기술하는지 `docs/planning/11_delivery_ownership_flow.md`(책임 경계)와 대조해 확인.
- `git status`로 본 환경 변경 범위가 docs/* 위주임을 확인 (인프라 신규 apply 없음).
- 후속: 1번 VPC Terraform skeleton(`infra/data-dashboard/`) 작성 전 본 ADR을 다시 인용해 합류 지점이 일관되는지 점검한다.
