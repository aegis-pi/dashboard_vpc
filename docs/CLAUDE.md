# docs/ CLAUDE.md

> Aegis-Pi 문서 디렉터리 전반 가이드.
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 프로젝트의 설계·운영·검증·시연·보고 문서를 한 곳에 둔다
- 운영 source of truth는 `ops/`. 마일스톤 진행 추적은 `issues/`. 계획 변경은 `changes/`

## 하위 구조

```
issues/        M0~M7 마일스톤 진행 추적
changes/       계획 ≠ 실제 구현 변경 기록 (0001~)
ops/           실제 운영/점검/장애 대응 절차
architecture/  현재/목표 구조도
planning/      프로젝트 개요·범위·결정·확장 계획
product/       MVP 범위, 사용자 흐름, 요구사항
specs/         IoT 포맷, 저장 파이프라인, 관제 화면 명세
demo/          시연 시나리오/메모
presentation/  발표·검토용 요약
report/        결과 보고서
```

## 진입점

1. `ops/05_factory_a_status.md` → `ops/00_quick_start.md`
2. `issues/SESSION_STATE.md` → `issues/MASTER_CHECKLIST.md`
3. `planning/00_project_overview.md` → `planning/11_delivery_ownership_flow.md` → `planning/15_cloud_architecture_final.md`
4. `architecture/00_current_architecture.md`

## 문서 상태 규칙

- `source of truth` — 현재 구현/운영 기준
- `draft` — 방향은 있으나 세부 미정
- `candidate` — 후속 확장/검토용
- 모든 문서 상단에 `상태:` + `기준일:` 명시

## 작성 규칙

- `factory-a` 완료 내용과 후속 Hub 확장 내용을 한 문서에 섞지 않는다
- 비밀번호 / token / private key / 인증서 / MFA OTP / 전체 ARN 이상은 기록 금지
- UI에서 수행하는 절차는 UI 절차로 명시
- 테스트 결과는 시간·측정 기준·해석을 함께 남긴다
- AWS 리소스/상시 실행 경로 추가 → `ops/15_aws_cost_baseline.md` 동시 갱신
- 새 변경 사유는 `changes/0NNN-...md`로 ADR 식으로 남긴다

## 갱신 우선순위 (현재)

1. `architecture/00_current_architecture.md`
2. `architecture/01_target_architecture.md`
3. `specs/monitoring_dashboard/00_requirements.md`
4. `demo/01_demo_scenario.md`
5. `report/00_executive_summary.md`

## 작업 흐름

- 새 작업 시작: `issues/SESSION_STATE.md`로 다음 작업 확인
- 진행/완료 시: 해당 issue 섹션 `GitHub Issue Comment Draft` 갱신
- 마일스톤 완료 판단: 원본 issue Acceptance Criteria 재확인 후 `MASTER_CHECKLIST.md` 체크
