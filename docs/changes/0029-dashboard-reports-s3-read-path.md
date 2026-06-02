ID:        0029
제목:      dashboard-reports-s3-read-path
상태:      accepted
결정일:    2026-06-02
영향 범위: M6, apps/dashboard-backend, apps/dashboard-web, S3 reports/daily prefix, ECS task role IAM

## 기존 계획

- ADR 0016은 일간 보고서를 Amazon Bedrock + EventBridge로 생성하고, 보고서 메타데이터/본문을 DynamoDB `aegis-daily-report` table과 S3에 저장하는 방향을 잡았다.
- Phase 1 Step 6 구현 시 `/reports`, `/reports/{report_date}/{factory_id}` endpoint는 skeleton으로 남겨두고, 조회는 DynamoDB `aegis-daily-report` Query/GetItem 기준으로 명세했다.
- Dashboard Web의 보고서 탭도 skeleton 상태였다.

## 변경된 실제 기준

- Dashboard Backend는 보고서를 **DynamoDB가 아니라 S3 `aegis-bucket-data`의 `reports/daily/` prefix에서 read-only로 조회**한다.
  - `GET /reports` → `ListObjectsV2(Prefix="reports/daily/")`로 객체를 나열하고 `report_date`/`factory_id`/`s3_key`/`last_modified`/`size_bytes`를 `report_date` 내림차순으로 반환.
  - `GET /reports/{report_date}/{factory_id}` → `GetObject`로 `reports/daily/yyyy={YYYY}/mm={MM}/dd={DD}/{factory_id}/report.md`를 읽어 `text/markdown` 본문 반환. 없으면 HTTP 404.
- ECS task role IAM은 `reports/daily/*` 한정 `s3:ListBucket`과 `reports/*` `s3:GetObject`를 허용한다(`infra/data-dashboard/ecs.tf`).
- Dashboard Web의 ReportsPage는 공장·날짜 직접 선택 기반으로 S3 Markdown을 받아 자체 Markdown 파서로 렌더링하고, PDF(브라우저 인쇄)/Word(.doc) 내보내기를 제공한다. 저장된 보고서 목록 카드는 페이지 단순화 과정에서 제거됐다.
- 보고서 **본문 생성기**(lambda-report-generator, ADR 0016 Bedrock)는 여전히 팀원/후속 작업이다. 현재 S3에 객체가 없을 수 있으며, 그 경우 `/reports`는 빈 배열, 본문 조회는 404다.

## 변경 이유

- 보고서 본문은 Markdown 텍스트라 S3 object가 자연스러운 저장소이고, Dashboard는 단순 read만 필요하다.
- DynamoDB `aegis-daily-report`에 본문을 적재하는 경로는 생성기 미구현 상태에서 추가 스키마 합의가 필요했고, S3 객체 read는 생성기 구현과 독립적으로 조회 UI를 완성할 수 있게 한다.
- IoT raw/processed가 이미 `aegis-bucket-data`에 있어 동일 bucket prefix 분리로 IAM/비용 관리가 단순하다.

## 영향

- `aegis-daily-report` DynamoDB table은 잔존하나 Dashboard 조회 경로에서 사용하지 않는다. ECS env `DDB_TABLE_REPORT`는 vestigial 값으로 남아 있다.
- 보고서 조회 UI/UX는 생성기 없이도 동작하며, 생성기가 S3에 `report.md`를 쓰기 시작하면 추가 배포 없이 즉시 표시된다.
- S3 list 권한 부재로 `/reports` 목록이 실패하던 이슈는 `reports/daily/*` 한정 `s3:ListBucket` 추가로 해소됐다(infra `e4c0331`).

## 업데이트 필요한 문서

- `docs/specs/monitoring_dashboard/02_api_spec.md` (reports endpoint 현행화 완료)
- `docs/specs/data_storage_pipeline.md` (S3 Reports Path 추가 완료)
- `docs/changes/README.md` (목록 추가 완료)

## 검증

- `apps/dashboard-backend`: `tests/test_reports.py` S3 list/get 경로 테스트 통과(전체 pytest 69 passed).
- `apps/dashboard-web`: `__tests__/reports.test.ts` 통과(전체 lint/test 52 passed/build 통과).
- 운영: IAM simulation allowed, Terraform validate/post-apply plan No changes, dashboard-backend/dashboard-web workflow 성공, ECS rollout COMPLETED, `/healthz` 200.
