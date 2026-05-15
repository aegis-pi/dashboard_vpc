# docs/product/ CLAUDE.md

> MVP 범위와 사용자 관점 흐름을 정리하는 제품 문서.
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 구현 세부보다 "사용자가 확인해야 할 상태와 흐름"을 중심으로 작성한다
- 구현 절차는 `../ops/`, 데이터·API 명세는 `../specs/`로 분리

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_mvp_scope.md` | MVP 포함 / 미포함 기능 (LLM 일일 리포트 포함 검토 반영) |
| `01_user_flow.md` | 관리자·운영자가 관제 화면에서 보는 흐름 |
| `02_requirements_definition.md` | 프로젝트 선택을 요구사항으로 역추적 |

## 작성 규칙

- Risk 상태 표현: `안전 / 주의 / 위험` 3단계 고정
- 실시간성 표현은 "준실시간 (1~5초 또는 수십 초)"로 통일. "실시간 제어"라는 표현은 쓰지 않는다
- Dashboard 최신 상태는 S3 raw 직접 조회가 아니라 DynamoDB LATEST/HISTORY 기준으로 기술
- MVP 범위 추가 시 `00_mvp_scope.md`의 "현재 완료 범위" / "MVP 포함" / "MVP 미포함" 셋을 함께 갱신
- 멘토링 반영은 "기존 초안" / "변경 이유" / "보강 방향" 구조 유지

## 참조

- 데이터 흐름: `../specs/data_storage_pipeline.md`
- IoT 포맷: `../specs/iot_data_format.md`
- 클라우드 구조: `../planning/15_cloud_architecture_final.md`
- 관제 화면 명세: `../specs/monitoring_dashboard/`
