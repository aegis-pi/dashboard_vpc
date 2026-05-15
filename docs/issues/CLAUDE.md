# docs/issues/ CLAUDE.md

> 마일스톤·이슈 추적 디렉터리.
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- M0~M7 마일스톤과 그 하위 GitHub Issue 단위 작업을 추적한다
- 운영 source of truth는 `docs/ops/`. 여기는 진행 추적과 GitHub comment draft가 중심

## 파일

| 파일 | 역할 |
| --- | --- |
| `MASTER_CHECKLIST.md` | M0~M7 전체 진행 요약 체크리스트 (working tracker) |
| `SESSION_STATE.md` | 현재 세션 이어받기용 상태 스냅샷 (누적 로그 금지) |
| `M0_factory-a_safe-edge-baseline.md` | factory-a Safe-Edge 기준선 |
| `M1_hub-cloud.md` | AWS Hub / EKS / IoT Core / S3 / AMP |
| `M2_mesh-vpn-hub-spoke.md` | Tailscale Hub-Spoke |
| `M3_deploy-pipeline.md` | GitHub Actions / ECR / ArgoCD 배포 |
| `M4_data-plane.md` | Edge Agent / IoT Core / S3 데이터 플레인 |
| `M5_vm-spoke-expansion.md` | factory-b / factory-c VM Spoke |
| `M6_risk-twin-dashboard.md` | Lambda Risk + 관제 화면 |
| `M7_integration-test.md` | 통합 검증 |
| `edit.md` | 이슈 문서 보강/수정 메모 |

## 현재 진행 기준

- 완료: M0 전체, M1 Issue 0~10/12, M2 Issue 1~6, M3 Issue 1/4
- 진행 중: **M3 Issue 2** — ECR 저장소 + 이미지 태그 전략
- 보류: M0 Issue 6 (NFS), M1 Issue 11 (운영 보안 강화)
- 다음 세션 시작 시 `SESSION_STATE.md` 우선 확인

## 작성 규칙

- 실제 완료 항목만 `[x]`로 표시. 마일스톤 완료 판단은 원본 issue Acceptance Criteria 재확인
- 이슈 문서 수정 시 상단 `수정 이력` 추가
  ```
  | YYYY-MM-DD | rev-YYYYMMDD-XX | 수정 요약 |
  ```
- `SESSION_STATE.md`는 누적 로그가 아니라 스냅샷 — 현재 기준으로 갱신만 한다
- 보류/미완료 이슈도 판단이 바뀌면 `상태`/`진행 요약`/`후속`을 짧게 남긴다

## GitHub Issue Comment Draft 규칙

- 각 issue 섹션 아래에 최신 진행을 반영한 draft 유지
- 형식:
  ```
  - 상태: 완료 / 부분 완료 / 보류 / 진행 중
  - 진행 요약: 1~2문장
  - 변경/확인: 주요 파일, 스크립트, Terraform/Ansible root, 운영 문서
  - 검증: 실행 명령, 확인 상태, 테스트 결과
  - 후속: 없음 / 다음 issue / 보류 사유
  ```
- 작성 기준
  1. 작업 시작 전 issue 문서·관련 코드 확인
  2. 변경 후 `git diff --stat`과 검증 결과를 근거로 작성
  3. 같은 issue draft가 있으면 보강. 오래된 로그를 길게 누적하지 않는다
  4. GitHub에 실제 comment를 남긴 뒤에도 draft는 유지

## 금지

- 민감 정보 (비밀번호, token, certificate private key, MFA OTP, 세션 토큰, 전체 ARN 이상 계정 세부정보)
- 운영 절차·구현 세부 (이는 `docs/ops/`로 분리)
