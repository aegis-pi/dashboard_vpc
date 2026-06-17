# Report Docs

상태: source of truth
기준일: 2026-06-17

수정 이력:
- 2026-06-17 v0.2  Data/Dashboard Phase 1 구현 완료, 2026-06-16 일시 root destroy, LLM 보고서 자동 생성기 후속 상태 반영.

이 디렉터리는 프로젝트 결과 보고서와 요약 보고 문서를 둔다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_executive_summary.md` | 프로젝트 핵심 성과와 범위 요약 |
| `01_report_draft.md` | 상세 프로젝트 보고서 초안 |
| `03_요구사항정의서.md` | SRS / 요구사항 정의서 |

## 기준

- 보고서는 운영 결과와 검증 수치를 근거로 작성한다.
- 현재 완료/활성 범위와 후속 계획을 구분한다. 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI는 활성이고, 1번 Data/Dashboard VPC(워크스트림 B)는 Phase 1 Step 0~9.5 구현 및 운영 배포를 완료했다(Dashboard Backend/Web/Cloud Infra/RBAC/보고서 조회/Image Snapshots/AI Chat). 2026-06-16 비용 절감 목적으로 일시 root는 destroy 완료, permanent/dns root는 유지 상태다. LLM 일간 보고서 자동 생성기(Bedrock)는 팀원/후속.
