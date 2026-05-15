# docs/report/ AGENTS.md

> 프로젝트 결과 보고서·요약 보고 (도구 중립).
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 검증 수치와 운영 결과를 근거로 작성한다
- 미구현 Hub / IoT Core / Dashboard VPC 범위는 "후속 계획"으로 명확히 구분

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_executive_summary.md` | 프로젝트 핵심 성과·범위 요약 |
| `01_report_draft.md` | 상세 프로젝트 보고서 초안 |

## 작성 규칙

- 모든 성과 주장에는 `../ops/`의 검증 수치를 근거로 인용
- "현재 완료" 와 "후속 계획"을 한 문장에 섞지 않는다
- 비밀번호·token·인증서 원문 포함 금지
- 검증 수치 표현은 시간·측정 기준·해석을 함께 남긴다
  - 예: "LAN 제거 InfluxDB 공백 (10초 bucket 기준 AI/audio 80초, BME 70초)"
- 멘토링/리뷰 반영은 "기존 초안" / "변경 이유" / "보강 방향" 구조 유지
- 보고서 갱신 시 `../planning/00_project_overview.md`의 "현재 완료/후속" 범위와 어긋나지 않게 점검

## 참조

- 검증 결과: `../ops/09_failover_failback_test_results.md`
- 운영 상태: `../ops/05_factory_a_status.md`
- 프로젝트 정의: `../planning/00_project_overview.md`
- 마일스톤 진행: `../issues/MASTER_CHECKLIST.md`
