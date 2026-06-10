# Session State

상태: working tracker
기준일: 2026-06-09
수정 이력:
  - 2026-06-10  Data/Dashboard 운영 문서 마무리 진행. README, docs/README, ops/00_quick_start, ops/22_data_dashboard_vpc_runbook, ops/README, planning/16에 빠른 build/destroy 방법, `infra/data-dashboard`/`infra/data-dashboard-dns`/`infra/data-dashboard-permanent` root 역할, Foundation 경계, destroy 후 잔여 자원 기준을 정리. `scripts/build/build-data-dashboard.sh`는 DNS/permanent root preflight 후 재생성 root apply로 보강했고, `scripts/destroy/destroy-data-dashboard.sh`는 `--yes` 없는 기본 실행에서 `destroy-data-dashboard` 입력 확인 후 재생성 root만 destroy하도록 보강. 검증: `bash -n` 2개 스크립트 통과, `git diff --check` 통과. 실제 build/destroy는 실행하지 않음.
  - 2026-06-09  챗봇 LLM 라우팅/스파이크/보고서 S3 연동 + 이미지 스냅샷 운영 배포 완료. commits: backend `50571bc`, frontend `032ad08`, infra `b73036c`, docs `b029977`. 변경: `/chat/query` 앞단 LLM Resolve(tool-use) + rule fallback, spike_check/interval 해석, report intent S3 Markdown 조회, GRAPH#5M 원인 분석 시 S3 processed risk_score drill-down, `/image-snapshots` S3 presigned image 조회 API, dashboard-web `이미지 스냅샷` 페이지와 `/chat` evidence UI 보강. Terraform: ECS task role S3 권한에 `processed/*`, `reports/daily/*`, `image_snapshot/*` read/list 범위 반영, Cognito 로컬 callback/logout 문서·코드 정렬. 검증: backend `pytest -q` 209 passed, dashboard-web lint 통과, `npm test -- --run` 82 passed, `npm run build` 통과(Vite chunk warning only), `terraform fmt -check`/`validate` 통과(data-dashboard, permanent), `git diff --check` 통과. GitHub Actions dashboard-backend/dashboard-web 성공, ECR image `sha-b029977` push 확인, `scripts/ops/deploy-dashboard-backend.sh b029977`로 Terraform apply 후 ECS task definition revision 45 등록 및 service rollout completed, desired/running 2, running task 2개 `sha-b029977` HEALTHY, `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, 비인증 `/chat/query` 401, dashboard web `/chat` HTTP 200, post-apply plan No changes. 후속: 인증 사용자로 실제 Bedrock tool-use 질의 및 `/image-snapshots` 실데이터 수기 확인.
  - 2026-06-09  ADR 0034 챗봇 LLM 라우팅 Phase 1+2 로컬 구현 완료(미배포). 결정형 파서 앞에 **LLM Resolve**(Bedrock Converse tool-use, Haiku 4.5) 단계를 추가해 자유도 높은 질문을 구조화 추출(intent/factory/time{mode,anchor_kst,window}). 검증 게이트(`map_resolution`): factory `^factory-[a-z0-9-]+$`만 허용, 미래 시각 clamp, window/enum 검증. resolve 실패/무효 시 규칙 파서로 graceful fallback(`chat_routing_enabled` 플래그, bedrock 활성 시에만 동작). RBAC는 도구 실행 前 재검증 유지. Phase 2: `Intent.SPIKE_CHECK` + `summarize_spikes`(결정론적 z-score `z≥2.5` 기본 / 명시 threshold above·below, metric risk_score·ai_detection·temperature) + router `_fetch_evidence` spike 분기(포인트 ±1h 확장) + render/synthesis 보강. 변경: `apps/dashboard-backend/{config.py, services/chat.py, services/bedrock.py, routers/chat.py}`, `tests/conftest.py`, `apps/dashboard-web/src/api/types.ts`(spike_check intent + router 필드). 신규: ADR `docs/changes/0034-llm-routing-for-chat.md`, `tests/test_chat_resolve.py`, `tests/test_chat_spike.py`. 응답에 `router`(llm|rule) 필드 추가. 검증: backend `pytest -q` 178 passed, dashboard-web lint/`npm test`(80) /`npm run build` 통과. Phase 3(멀티스텝 agentic)은 ADR에서 의도적 보류. 후속: 운영 배포 + Bedrock Converse tool-use 실연결 스모크.
  - 2026-06-09  AI 채팅 시간 해석 보정 로컬 구현 완료(미배포). 변경: 포인트 조회 범위를 ±10분에서 ±5분으로 축소, "3시"처럼 오전/오후가 없는 시각은 현재 기준 가장 가까운 과거 시각(예: 16:00 KST 기준 15:00, 10:00 KST 기준 03:00)으로 해석, "3시 20분" 단위까지 파싱, Bedrock payload/API time_scope에 KST start/end와 evidence `time_range_kst`를 추가해 최근 추이 답변이 UTC 02:10을 KST 2시10분으로 오해하지 않도록 보정. 검증: backend `pytest -q` 156 passed, dashboard-web lint 통과, `npm test -- --run` 80 passed, `npm run build` 통과(Vite chunk warning only), `git diff --check` 통과.
  - 2026-06-09  AI 채팅 Risk Score 해석 보정 및 Cloud Infra UI 정렬 로컬 구현 완료(미배포). 변경: `apps/dashboard-backend/services/chat.py`에서 Risk Score 정책을 100~85 안전 / 84~50 주의 / 49~0 위험으로 고정하고 evidence에 등급/정책/AI 탐지 최대 점수를 포함, `services/bedrock.py` 시스템 프롬프트와 payload에 "점수가 높을수록 안전" 규칙을 명시. `apps/dashboard-web/src/pages/CloudInfraPage.tsx`와 CSS에서 Cloud Infra 제목/상태 badge/section 간격을 전용 레이아웃으로 정리하고 표 라벨을 `안전 점수`로 보정. 검증: backend `pytest -q` 150 passed, chat tests 44 passed, dashboard-web lint 통과, `npm test -- --run` 80 passed, `npm run build` 통과(Vite chunk warning only), `git diff --check` 통과. 운영 배포/실제 Bedrock 인증 질의 검증은 후속.
  - 2026-06-09  챗봇 응답 모드 선택 backend/frontend 역할별 커밋·푸시 및 backend 업데이트 완료. commits: backend `dcb6e37`, frontend `acd6717`. 변경: `/chat/query` 요청에 `model_tier`(`fast`/`precise`, 기본 auto)을 허용하고, dashboard-web `/chat` composer에 응답 모드 selector와 Bedrock markdown/table 렌더링을 추가. 검증: backend `pytest -q` 147 passed, dashboard-web lint 통과, `npm test -- --run` 80 passed, `npm run build` 통과(Vite chunk warning only), `git diff --check` 통과. GitHub Actions dashboard-backend/dashboard-web 성공, ECR image `sha-acd6717` push 확인, Terraform apply로 ECS task definition revision 42 등록 후 service update/rollout completed, desired/running 2, running task 2개 `sha-acd6717` HEALTHY, `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, 비인증 `/chat/query` 401, dashboard web `/chat` HTTP 200, post-apply plan No changes.
  - 2026-06-09  ADR 0033 챗봇 데이터 QA backend/Bedrock 2-tier 및 dashboard-web `/chat` UI 운영 배포 완료. 변경: `apps/dashboard-backend`에 `/chat/query`, intent/time parser, Evidence builder, rule fallback, `services/bedrock.py` Converse 호출(fast=Haiku 4.5, precise=Sonnet 4.6), `BEDROCK_*` 설정 추가. `apps/dashboard-web`에 Workspace `AI 채팅` nav, `/chat` 독립 페이지(ChatGPT형 thread + 하단 composer + 공장 선택 + evidence 렌더), API client/types 추가. `infra/data-dashboard` ECS task role에 Bedrock `InvokeModel`/`GetInferenceProfile` 권한과 task definition Bedrock env 변수 추가. 운영 적용: ECS task role IAM targeted apply 완료, IAM simulation allowed 확인. dashboard-backend/web GitHub Actions success, backend image `sha-990ab6a` push, Terraform apply로 ECS task definition revision 41 등록, service rollout COMPLETED, target 2개 HEALTHY. 네트워크: private app subnet은 NAT Gateway default route 보유, Bedrock egress는 NAT 경유로 가능. 검증: backend `pytest -q` 146 passed, dashboard-web lint/test/build 통과(80 passed, Vite chunk warning only), Terraform fmt/validate/post-apply plan No changes, `git diff --check` 통과, 운영 `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, `/chat/query` OpenAPI 노출 및 비인증 401, `/chat` SPA route 200. 잔여: 인증 사용자로 실제 Bedrock 질의 수기 확인, 보고서/이미지 도구 연결.
  - 2026-06-08  아키텍처 overview 다이어그램 확정·문서화(ADR 0032). `re4~re7` 세대별 다이어그램을 단일 overview(`docs/architecture/drawio/agiespi_architecture_overview_final1.drawio` / `images/agiespi_architecture_overview_final3.drawio.png`)로 통합하고, Phase 1 Step 0~10 구현(Cloud Infra Collector EventBridge→Fast 1m/Slow 5m→`CLOUD#infra`, notifier→SQS DLQ, GitHub OIDC 웹배포 S3+CF invalidation, Cognito Admin API + RDS RBAC `app_user`/`user_factory_access`/`audit_log`, DynamoDB `GRAPH#5M`/`CLOUD#infra`, ECS x2 AutoScaling, Report Generator 그룹)을 반영. 갱신 문서: architecture/README·02_cloud_expansion_drawio_guide, changes/README(0027 accepted, 0032 추가), planning/16(Step 10 drawio 항목 완료). drawio XML 유효성 + PNG export(3945×3809) 확인.
  - 2026-06-08  Cloud Infra 일간 보고서 접근 제어/selector 역할별 커밋·푸시 및 운영 배포 완료. commits: backend `b8153dc`, frontend `71bbe1d`. 변경: S3 `reports/daily/.../cloud-infra/report.md`는 공장 권한이 아니라 system-view 권한으로 list/get 접근을 허용하고, 비 system 사용자는 목록/본문 접근에서 제외/403 처리. Reports UI는 `can_view_system` 사용자에게 클라우드 인프라 selector를 노출하고 보고서 제목/empty state 라벨을 `클라우드 인프라`로 표시. 검증: backend `pytest -q` 106 passed, dashboard-web lint 통과, `npm test -- --run` 80 passed, `npm run build` 통과(Vite chunk size warning only), `git diff --check` 통과. GitHub Actions dashboard-backend/dashboard-web 성공, ECR image `sha-71bbe1d` push 확인, Terraform apply로 ECS task definition revision 40 등록 후 service update/rollout completed, desired/running 2, 새 target 2개 HEALTHY(AZ 1a/1c), `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-08  history/report export 숫자 정규화 및 Word `.docx` 내보내기 역할별 커밋/푸시 및 운영 배포 완료. commits: backend `c96c764`, frontend `199cb52`. 변경: backend history 응답 추출에서 risk/sensor/AI/infra/GRAPH#5M numeric string을 finite number로 정규화하고 invalid 값은 null 처리. frontend도 API numeric string을 chart/rendering 전 number로 정규화하며, Reports Word export를 HTML 기반 `.doc`에서 실제 OOXML `.docx` 생성(`docx` lazy import)으로 교체하고 Markdown parser를 공용 util로 분리. 검증: backend `pytest -q` 102 passed, dashboard-web lint 통과, `npm test -- --run` 80 passed, `npm run build` 통과(Vite chunk size warning only), `git diff --check` 통과. GitHub Actions dashboard-backend/dashboard-web 성공, ECR image `sha-199cb52` push 확인, Terraform apply로 ECS task definition revision 39 등록 후 service update/rollout completed, desired/running 2, 새 target 2개 HEALTHY(AZ 1a/1c), `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-08  history 조회 delta refresh 최적화 역할별 커밋/푸시 및 운영 배포 완료. commits: backend `f968ebe`, frontend `d00f988`, docs `9c28603`. 변경: `/factories/{factory_id}/history`에 `since` query와 window별 기본 limit(10m=250, 1h=2000, 그 외 500)을 추가하고, frontend가 자동 refresh 시 신규분만 조회해 timestamp 기준 merge/dedupe하도록 보정. Factory header는 10m 전용 history를 사용하고 WebSocket LATEST를 chart point로 append. Fleet recent changes도 10m/250 delta 조회로 축소. 검증: backend `pytest -q` 100 passed, `tests/test_history.py` 35 passed, dashboard-web lint 통과, `npm test -- --run` 59 passed, `npm run build` 통과, `git diff --check` 통과. GitHub Actions dashboard-backend/dashboard-web 성공, ECR image `sha-9c28603` push 확인, Terraform apply로 ECS task definition revision 38 등록 후 service update/rollout completed, desired/running 2, task 2개 HEALTHY(AZ 1a/1c), `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-05  Cloud Infra page Datastores/최근 1시간 상태 흐름 가독성 보정 로컬 구현 완료(미배포). 변경: `apps/dashboard-web/src/pages/CloudInfraPage.tsx`에 Redis/RDS 전용 resource row와 capacity bar를 추가해 RDS는 사용량/할당량, Redis는 메모리 사용률/여유 메모리 중심으로 표시하고, `available` 등 AWS 원문 상태 배지가 미확인으로 보이지 않도록 adapter를 보정. 최근 1시간 상태 흐름은 최신 60개 샘플을 시간순으로 표시하고 좌측 `1시간 전`/우측 `최신` 라벨과 최신 segment marker를 추가. `apps/cloud-infra-collector/`는 RDS allocated/max storage와 Redis `DatabaseMemoryUsagePercentage` 수집 필드 확장. 타입/CSS 반영. 검증: collector `pytest -q` 16 passed, dashboard-web `npm run lint` 통과, `npm test -- --run` 57 passed, `npm run build` 통과.
  - 2026-06-04  Cloud Infra datastores 미확인 재발 확인/복구 완료. 원인: 운영 `AEGIS-Lambda-CloudInfraFastCollector`가 확장 collector 이전 코드 해시로 되돌아가 최신 `CLOUD#infra` snapshot에 `fast.datastores` 섹션을 쓰지 않았고, FastCollector 환경변수에서도 Redis/RDS/CloudFront/DLQ 대상 명시값이 빠져 있었다. 조치: 로컬 `apps/cloud-infra-collector/cloud-infra-collector` 현재 소스로 Fast/Slow Lambda 코드를 재업데이트하고 FastCollector env에 `REDIS_REPLICATION_GROUP_ID`, `RDS_DB_INSTANCE_ID`, `CLOUDFRONT_DISTRIBUTION_ID`, `DLQ_QUEUE_NAME` 재반영. 검증: Fast/Slow invoke 200/errors 0, DDB latest 및 최신 FAST/SLOW history에서 overall/backend/datastores/data_pipeline/factory_freshness/eks_management/storage_freshness 모두 `normal`, Redis/RDS `available`, DLQ 0, ECS backend desired/running 2 및 target 2개 healthy, `/healthz` 200, `/readyz` dynamodb/redis/rds_metadata ok, dashboard `/cloud-infra` 200, 비인증 API `/cloud-infra` 401, CloudInfra scheduler `rate(1 minute)`/`rate(5 minutes)` ENABLED 확인.
  - 2026-06-04  삭제 이전 구현으로 남은 stale disabled 사용자 재생성 409 보정 및 운영 배포 완료. 원인: 기존 삭제 API가 Cognito disable + RDS `app_user.status=disabled`만 수행해 목록에서는 숨겨져도 email unique row가 남았고, 같은 이메일 생성 시 `User already exists` 409가 발생. 변경: 생성 시 같은 email의 disabled row가 있으면 Cognito 잔여 username을 `AdminDeleteUser(ignore_not_found=true)`로 best-effort 정리하고 RDS `app_user/user_factory_access`를 제거한 뒤 신규 Cognito/RDS 사용자를 생성. commit `e96bf81`. 검증: admin users test 11 passed, backend pytest 98 passed, dashboard-backend workflow 성공, ECR image `sha-e96bf81` push 확인, Terraform apply로 ECS task definition revision 37 등록 후 service update/rollout completed, desired/running 2, task 2개 HEALTHY(AZ 1a/1c), `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, 비인증 `/admin/users` 401, post-apply plan No changes.
  - 2026-06-04  사용자 관리 삭제/정렬/수정 UX 보정 및 운영 배포 완료. commits: backend/infra `e704d91`, web `813f7ed`. 변경: `/admin/users` 목록은 active 사용자만 반환하고 역할 우선 정렬, 삭제는 Cognito `AdminDeleteUser` + RDS `app_user` row 삭제로 변경, ECS task role Cognito 권한을 AdminCreate/Get/Delete로 보정, 사용자 관리 화면에 명시적 수정 버튼과 역할 우선 정렬/삭제 후 즉시 제거 반영. 검증: backend pytest 97 passed, dashboard-web lint/test 57 passed/build 통과, Terraform fmt/validate 통과, dashboard-backend/dashboard-web workflow 성공, ECR image `sha-813f7ed` push 확인, Terraform apply로 ECS task definition revision 36 등록 후 service update/rollout completed, desired/running 2, task 2개 HEALTHY(AZ 1a/1c), `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, 비인증 `/admin/users` 401, post-apply plan No changes.
  - 2026-06-04  Dashboard RBAC 사용자 관리 시스템 구현 및 운영 배포 완료. RDS metadata 모델(`factory/app_user/user_factory_access/audit_log`), 공장별 API/WS 인가, `/admin/users` 관리자 CRUD API, 사용자 관리 UI, ECS task role Cognito AdminCreate/Get/Disable 권한, metadata auto-create/readiness를 반영. commits: `4fac2d9`, `f5464da`, `a068f4a`, `27760ab`, `abb81ed`. GitHub Actions dashboard-backend/web 성공. Terraform apply로 ECS task definition revision 33 등록(`sha-abb81ed`) 후 service rollout completed, desired/running 2, task 2개 HEALTHY(AZ 1a/1c), `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok, 비인증 `/admin/users` 401, web `/admin/users` 200, post-apply plan No changes.
  - 2026-06-04  Reports quick date 기본 범위 보정 완료. 오늘 보고서는 생성 전일 가능성이 높아 빠른 선택을 오늘 제외, 어제부터 최근 7일로 변경하고 페이지 기본 선택 날짜도 어제로 맞춤. 수동 date picker는 기존처럼 오늘까지 선택 가능. 변경: `recentDates(count, startOffsetDays)` 추가, ReportsPage `REPORT_DATES=recentDates(7, 1)`, 관련 unit test 추가. 검증: dashboard-web lint 통과, vitest 57 passed, production build 통과.
  - 2026-06-04  Cloud Infra page 상단 자동 refresh interval control 추가 완료. 기존 Fleet/Factory와 동일하게 TopBar selector(Off/5s/10s/30s/1m)를 노출하고, 수동/자동 refresh 시 `/cloud-infra` latest와 fast history를 함께 갱신하도록 `CloudInfraPage.tsx`에 interval state/effect 추가. 검증: dashboard-web lint 통과, vitest 56 passed, production build 통과.
  - 2026-06-04  ECS backend right-sizing + Application Auto Scaling 적용 완료(ADR 0030). 근거: 단일 0.5 vCPU task가 102 req/min 버스트에서 CPU 100%/응답 12~16s/Target 5xx, 메모리 max 40%(병목 아님). 원인: 이미지 `uvicorn --workers 2`인데 0.5 vCPU라 oversubscription + history 파싱이 GIL-bound. 변경: `infra/data-dashboard/ecs.tf` task cpu 512→1024·memory 1024→2048(변수화), 신규 `ecs_autoscaling.tf`(scalable target min 2/max 2 핀 + target tracking 2 policy: ALBRequestCountPerTarget 40, CPU 50%, 데모 프로파일이라 min==max로 inert). 적용: `terraform apply`로 task def revision 31 등록 + autoscaling 생성, `update-service --task-definition kjw-aegis-data-backend:31 --force-new-deployment`. 검증: `services-stable` STABLE, desired/running 2, rolloutState COMPLETED, task 2개 cpu 1024/memory 2048/HEALTHY, AZ 1a+1c 분산, scalable target min 2/max 2. 비용: 고정 ~$123.90→~$178.35/월(상시), 데모(16h) ~$6.55→~$7.73/월. 문서: ADR 0030, 비용 baseline v3.4. 후속: 데모 직전 pre-warm 권장, 프로덕션 전환 시 `ecs_backend_max_capacity` 3~4로 활성.
  - 2026-06-04  Cloud Infra page 가독성 개선 로컬 구현 완료(미배포). 변경: `apps/dashboard-web/src/pages/CloudInfraPage.tsx`에 상단 health strip, component health matrix, dependency rail, segment 기반 최근 상태 흐름 추가. 기존 세부 카드/테이블 데이터 계약은 유지. CSS는 `apps/dashboard-web/src/styles/app.css`에 cloud infra 전용 레이아웃/상태 행/반응형 규칙 추가. 검증: dashboard-web lint 통과, vitest 56 passed, production build 통과, local preview `/cloud-infra` 200. Playwright는 현재 의존성에 없어 자동 스크린샷 미실행.
  - 2026-06-04  Cloud Infra page 운영 데이터 검증 중 FastCollector IAM 불일치 발견/보정 완료. 증상: `CLOUD#infra` 최신 fast.datastores가 Redis/RDS `AccessDenied`로 `unknown` 표시. 조치: `AEGIS-IAMRole-Lambda-CloudInfraFastCollector` inline policy `AEGIS-IAMPolicy-Lambda-CloudInfraFastCollector`에 `elasticache:DescribeReplicationGroups`, `rds:DescribeDBInstances` read 권한 재반영. 검증: FastCollector invoke 200/errors 0, DDB `CLOUD#infra`/`LATEST` overall/backend/datastores/data_pipeline/factory_freshness/eks_management/storage_freshness 모두 `normal`, Redis/RDS `available`, fast/slow latest history 존재, `/healthz` 200, `/readyz` dynamodb:ok redis:ok, OpenAPI `/cloud-infra`/`/cloud-infra/history` 존재, dashboard web `/cloud-infra` SPA 200, web lint/test/build 통과, backend cloud_infra/health tests 10 passed.
  - 2026-06-04  Cloud Infra dashboard 404 복구 완료. 원인: 운영 ECS backend task definition revision 29가 ECR `aegis/dashboard-backend:latest`를 사용 중이었고, `latest` digest가 2026-05-29 이미지에 머물러 `/cloud-infra` 라우터가 없는 구버전 backend가 실행됨. 조치: revision 29 설정을 복사해 image만 `sha-1337e06`으로 바꾼 task definition revision 30 등록, `KJW-AEGIS-Data-Service-Backend`를 revision 30으로 업데이트, ECR `latest`를 `sha-1337e06` digest로 재태깅, `dashboard-backend.yml`이 `sha-*`와 `latest`를 함께 push하도록 수정. 검증: ECS rollout COMPLETED, running 1/desired 1, task image `sha-1337e06`, `/healthz` 200, `/readyz` dynamodb:ok redis:ok, OpenAPI에 `/cloud-infra`/`/cloud-infra/history` 존재, 비인증 `/cloud-infra`는 404가 아닌 401 반환. DDB `CLOUD#infra`/`LATEST`는 fast/slow collector 최신 갱신 확인. 남은 상태: SlowCollector Kubernetes API 401로 `slow.eks_management.status=unknown`, 전체 `overall_status=unknown`.
  - 2026-06-04  Cloud Infra collector 코드 반영 및 Lambda 업데이트 완료. commits: collector/backend/web/docs 분리 예정. 변경: `apps/cloud-infra-collector/` 소스 추가, FastCollector가 Redis/RDS/CloudFront/DLQ와 section `reasons[]`/`errors[]` 수집, shared DDB writer가 `fast.datastores.status`를 `overall_status`에 반영, backend stale 판정 section 전파, frontend Datastores/DLQ/section meta 표시 준비. AWS 조치: `AEGIS-IAMRole-Lambda-CloudInfraFastCollector`에 `elasticache:DescribeReplicationGroups`, `rds:DescribeDBInstances` read 권한 추가, `AEGIS-Lambda-CloudInfraFastCollector`/`AEGIS-Lambda-CloudInfraSlowCollector` 코드 업데이트(CodeSha256 `r3EAJ0x8IR0I2NjXVMsrriq0tRcWYiGRwOfWh0Uygcw=`), FastCollector env에 CloudFront/Redis/RDS/DLQ 대상 명시. 검증: collector pytest 16 passed, Fast/Slow Lambda invoke 200, DDB `CLOUD#infra`/`LATEST`에 `fast.datastores.redis`, `fast.datastores.rds`, `fast.backend_runtime.cloudfront`, `fast.data_pipeline.dlq` 존재 확인. 현재 `overall_status=unknown` 원인은 SlowCollector Kubernetes API 401이며 Redis/RDS/DLQ 수집 오류는 없음.
  - 2026-06-02  Cloud Infra dashboard read 화면 구현 및 역할별 커밋/푸시/backend 업데이트 완료. commits: backend `bf824ea`, frontend `8e7dcdd`, docs `26a0a27`. 변경: `/cloud-infra`, `/cloud-infra/history` DDB `CLOUD#infra` read API, sidebar `System / 클라우드 인프라`, overview/detail dashboard 화면 추가. 검증: backend pytest 76 passed, web lint/test 56 passed/build 통과, dashboard-backend/dashboard-web workflow 성공, ECR image `sha-26a0a27` push 확인, Terraform apply로 ECS task definition revision 28 생성 후 service를 revision 28로 업데이트, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-02  일간 보고서 selector 라벨 정렬 재보정 배포 완료. commit: frontend `94c3d23`. 변경: 공장/날짜/빠른 선택 라벨은 각 컨트롤 시작점 기준 좌측 정렬, selector row와 PDF/Word/새로고침 버튼은 세로 중앙 정렬. 검증: web lint/build 통과, dashboard-web workflow 성공, S3 sync + CloudFront invalidation 완료.
  - 2026-06-02  일간 보고서 selector 정렬 보정 배포 완료. commit: frontend `4e2bb32`. 변경: 공장/날짜/빠른 선택 컨트롤을 같은 레벨 컬럼으로 재배치하고 중앙 정렬해 날짜 컨트롤만 위로 떠 보이던 레이아웃 문제 수정. 검증: web lint/build 통과, dashboard-web workflow 성공, S3 sync + CloudFront invalidation 완료.
  - 2026-06-02  일간 보고서 빠른 날짜 선택 라벨 추가 배포 완료. commit: frontend `beadc19`. 변경: 날짜 입력 오른쪽 최근 7일 quick date control 위에 `빠른 선택` 라벨 추가. 검증: web lint/build 통과, dashboard-web workflow 성공, S3 sync + CloudFront invalidation 완료.
  - 2026-06-02  일간 보고서 페이지 단순화 배포 완료. commit: frontend `6562da5`. 변경: 저장된 보고서 목록 카드 제거, 일간 보고서 sidebar/상단 공장 selector 알파벳 오름차순 정렬, 공장·날짜 직접 선택 기반 조회 유지. 검증: web lint/test 52 passed/build 통과, dashboard-web workflow 성공, S3 sync + CloudFront invalidation 완료.
  - 2026-06-02  일간 보고서 목록 오류 문구 원인 수정 완료. 원인: `/reports` 목록 API는 S3 ListObjectsV2를 사용하지만 ECS task role은 reports object GetObject만 허용해 S3 list가 실패했고, 본문 직접 조회는 GetObject라 정상 표시됨. 조치: infra `e4c0331`에서 `reports/daily/*` prefix 한정 `s3:ListBucket` 권한 추가 및 Terraform apply 완료, frontend `eda6f2a`에서 보고서 공장 selector 알파벳 오름차순 정렬 반영. 검증: IAM simulation allowed, Terraform validate/post-apply plan No changes, web lint/build 통과, dashboard-web workflow 성공.
  - 2026-06-02  S3 reports prefix 기반 일간 보고서 UI/UX 구현 및 역할별 커밋/푸시/backend 업데이트 완료. commits: backend `f4942f9`, web `055fb75`. 로컬 검증: backend pytest 69 passed, web lint/test 52 passed/build 통과, git diff --check 통과. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-055fb75` push 확인, Terraform apply로 ECS task definition revision 27 생성 후 service를 revision 27로 업데이트, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-02  Claude Code 변경 검토 후 역할별 커밋/푸시 및 backend 업데이트 완료. 코드 리뷰 결과 blocking 이슈 없음. commits: backend `e372d45`, web `12387e0`. 로컬 검증: backend pytest 66 passed, web lint/test 36 passed/build 통과, backend docker build 통과, git diff --check 통과. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-12387e0` push 확인, Terraform apply로 ECS task definition revision 26 생성 후 service를 revision 26으로 업데이트, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-01  Factory Timeline `10m/1h/custom` 범위와 `top_causes` 기반 원인 표시 구현 및 배포 완료. commits: backend `b5f340e`, web `17c2dee`, docs `311adc6`. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-311adc6` push 확인, Terraform apply로 ECS task definition revision 23 생성 후 service를 revision 23으로 업데이트, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-06-01  역할별 커밋 후 push 및 backend 업데이트 완료. commits: backend `bcf7ce5`, web `fad303c`, docs `e2e99f4`. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-e2e99f4` push 확인, Terraform apply로 ECS task definition revision 22 생성 후 service를 revision 22로 업데이트, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes. 추가로 Cloud infra collector 계획 ADR 0027/계약 문서 작성 완료(구현은 팀원/후속).
  - 2026-05-29  역할별 커밋 후 push 및 backend 업데이트 완료. commits: backend `5d39c82`, web `e0d3fce`, frontend-reference `c555519`. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-c555519` push 확인, Terraform apply로 ECS task definition revision 17 반영, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-05-29  역할별 커밋 후 push 및 backend 업데이트 완료. commits: backend `aea41eb`, web `e0041cd`. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-e0041cd` push 확인, Terraform apply로 ECS task definition revision 16 반영, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, dashboard web HTTP 200, post-apply plan No changes.
  - 2026-05-29  역할별 커밋 후 push 및 backend 업데이트 완료. commits: backend `a8fb0de`, web `fde09fe`, docs `3c20ec3`. GitHub Actions dashboard-backend/dashboard-web 성공. ECR image `sha-3c20ec3` push 확인, Terraform apply로 ECS task definition revision 15 반영, desired/running 1, rollout COMPLETED. `/healthz` 200, `/readyz` dynamodb:ok redis:ok, post-apply plan No changes.
  - 2026-05-28  Multi-resolution history storage 아키텍처 문서화 완료. ADR 0025 신규 작성, troubleshooting #42 추가, data_storage_pipeline/api_spec/runbook 업데이트. 근본 해결(팀원 구현 예정) 까지 현행 임시방편(max_items=500 cap, window=1h) 유지.
  - 2026-05-28  history 쿼리 무한 페이징 cascade 504 수정 배포 완료. 원인: 테이블 116k 아이템, useFleetRecentChanges window=24h × 3공장 동시 무한 페이지 쿼리 → semaphore(10) 포화 → cascade 504. 수정: backend _get_history_sync ScanIndexForward=False + Limit=300/page + max_items=500 cap(최신 500건 역순 후 ascending 반환); routers ?limit 파라미터 추가; frontend 24h→1h. ECR sha-e17dbbf, CloudFront invalidation, ECS revision 12. /readyz dynamodb:ok redis:ok.
  - 2026-05-28  504 DynamoDB timeout 완전 수정 배포 완료. 원인 1: scan_latest 모드 전체 테이블 스캔(~100+ API 호출) timeout. 원인 2: 콜드 스타트 시 asyncio semaphore 포화 → 캐스케이드 504. 수정: scan_latest→batch_get(config.py+ecs.tf) + 기동 시 DDB warmup(@app.on_event startup) + IAM BatchGetItem 추가(ecs.tf). ECR image sha-dc17ea2, ECS task def revision 11, desired/running 1 stable. /healthz 200, /readyz dynamodb:ok redis:ok, /factories 401(정상). 기동 후 504 없음 확인.
  - 2026-05-28  사용자 요청으로 변경을 역할별 커밋 후 push 완료. commits: web `9a5ff29`, infra `d4a14d3`, backend `21056d5`. GitHub Actions dashboard-web/dashboard-backend 성공. ECR image `sha-21056d5` push 확인, Terraform apply로 ECS task definition revision 9 반영, desired/running 1, `/healthz` 200, `/readyz` 200, post-apply plan No changes.

  - 2026-05-27  사용자 요청으로 infra/data-dashboard destroy 완료. Terraform destroy: 73 destroyed. Lambda VPC ENI 해제 지연으로 private_app subnet/SG 삭제가 오래 걸렸으나 최종 완료. state count: data-dashboard=0, permanent=25, dns=1. permanent/dns plan No changes. dashboard 웹 HTTP 200, API DNS 미해결은 정상.
  - 2026-05-27  dashboard-backend CORS 운영 origin 명시 수정 및 ECS backend image `sha-f6422a7` 적용 완료. 원인: 인증 API 응답의 wildcard CORS + credentials 조합으로 브라우저가 `Failed to fetch` 표시 가능. 검증: backend pytest 28 passed, web lint/test/build 통과, API `/healthz` 200, preflight `/factories` allow-origin 정상, ECS rollout completed.
  - 2026-05-27  dashboard-web refresh interval controls 구현 완료. TopBar interval selector(Off/5s/10s/30s/1m), Fleet 단순 auto refresh, Factory WS 우선 + 미연결 시 polling 연결. useFleetRecentChanges refresh 추가. 검증: npm run lint 통과, npm test -- --run 32 passed, npm run build 통과, git diff --check 통과. code commit `51e82bb`.
  - 2026-05-27  dashboard-web refresh/subsampling hardening 완료. chart subsampling 유틸에 maxPoints <= 1 방어 추가, WS 인증 실패 close code 4001 재시도 차단, FactoryPage WS refresh 3초 throttle/lazy tab cache 반영. 검증: npm run lint 통과, npm test -- --run 31 passed, npm run build 통과, git diff --check 통과. code commit `6f53e6e` push 완료.
  - 2026-05-27  Aegis-frontend 화면설계 reference 추가 및 운영 Dashboard UI 포팅 진행 상태 커밋/푸시 완료. top_causes `field`/`name` 양식 모두 표시하도록 web 수정. dashboard-web workflow 성공, CloudFront invalidation 완료. backend image `sha-3b8439f` ECS 적용 완료, rollout completed, `/healthz` HTTP 200, post-apply plan No changes.
  - 2026-05-27  운영 Dashboard UI/실데이터 shape 정합성 수정 배포 완료. backend/web 테스트 통과, commit `439e27a` push 완료. GitHub Actions dashboard-web/dashboard-backend 성공. ECS backend image `sha-439e27a` 적용, API `/healthz` HTTP 200, post-apply plan No changes.
  - 2026-05-27  사용자 요청으로 infra/data-dashboard 일시 root 재기동 완료. apply 73 added, 0 changed, 0 destroyed. ECS desired/running 1, rollout completed, target healthy, https://api.aegis-pi.cloud/healthz HTTP 200. post-apply plan No changes.
  - 2026-05-27  세션 시작 상태 검증 및 post-migration permanent diff 정리 완료. state count: infra/data-dashboard=0, infra/data-dashboard-permanent=25, infra/data-dashboard-dns=1. permanent/dns plan No changes. dashboard 웹 HTTP 200, API DNS 미해결은 정상.
  - 2026-05-26  Step 9.5 이후 비용 절감을 위해 infra/data-dashboard destroy 완료 반영. 73 resources destroyed, state empty. permanent/dns root는 유지. dashboard 웹은 HTTP 200, API DNS 제거는 정상 상태.
  - 2026-05-26  Step 9.5 permanent resource split migration 완료 반영. infra/data-dashboard-permanent/ 신설(25 resources import). data-dashboard state rm 20개. 양쪽 plan No destroy. HTTP 200 엔드포인트 확인. 다음: post-migration plan diff 정리 후 Step 10 운영 자동화/데모 준비.
  - 2026-05-26  Step 9.5 permanent resource split 설계 완료 반영. ADR 0024 작성. 의존성 분석, migration 순서 문서화. 다음: Step 9.5 migration 실행 (다음 세션, infra/data-dashboard-permanent/ 신설 + import/state rm/apply).
  - 2026-05-26  Step 9 Part 2 end-to-end 통합 검증 완료 반영. Backend/Web/Auth/DDB/ECS/IoT/Cognito/CloudFront 검증 완료. IoT→DDB 실시간 경로는 factory-a Edge Agent 비활성으로 미검증. 다음: Step 10(LLM 보고서, 팀원) 또는 데모 준비.
  - 2026-05-26  Step 9 S3+CloudFront 배포 CI/CD 구현 완료 반영. GitHub Actions dashboard-web.yml, IAM OIDC web deploy role(ADR 0023), Terraform plan 2 add 0 change 확인. Workflow Node runtime은 Node 24 기준으로 확정.
  - 2026-05-26  Step 8 운영용 Frontend Vite + React 마이그레이션 완료 반영. apps/dashboard-web/ SPA 구현. npm run build/lint/test 통과.
  - 2026-05-26  Step 7 Backend 활성화 검증 반영. Organization secret 등록(사용자 확인), ECR `sha-9d2c200`, ECS desired/running 1, `/healthz` 200 확인.
  - 2026-05-26  Step 7 apply 완료 반영 (92 resources, ECS desired_count=0). Step 7.5 Route53 Hosted Zone 영구 분리 완료 반영 (infra/data-dashboard-dns/ 신설, state 이전 절차 문서화).
  - 2026-05-26  Step 8을 운영용 Frontend Vite + React 마이그레이션으로 재정의. LLM 일간 보고서는 팀원/후속 작업으로 분리.
  - 2026-05-26  Step 6 Dashboard Backend FastAPI 구현 완료 반영. Step 7 ECS Fargate/ALB/ECR 배포 진입 준비 갱신. frontend/ prototype/reference vs apps/dashboard-web/ 공식 경로 구분 명확화.

## 목적

이 파일은 현재 작업 세션의 이어받기용 기록이다. `docs/issues/MASTER_CHECKLIST.md`와 각 M0~M7 이슈 문서가 공식 진행 기준이고, 이 파일은 지금까지 한 일과 다음에 할 일을 빠르게 복구하기 위한 보조 문서다.

이 파일은 누적 로그가 아니라 현재 상태 스냅샷으로 관리한다. 사용자가 "문서 최신화" 또는 "세션 저장"을 요청하면 아래 섹션을 덧붙이는 방식이 아니라 현재 기준으로 갱신한다.

## 마일스톤 기준 진행 현황

| 마일스톤 | 이슈 | 상태 | 기준 문서 |
| --- | --- | --- | --- |
| M0 | Issue 1 - Safe-Edge/OS | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 2 - Safe-Edge/네트워크 | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 3 - Safe-Edge/K3s | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 4 - Safe-Edge/MetalLB | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 5 - Safe-Edge/Longhorn | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 6 - Safe-Edge/NFS | 보류 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 7 - 배포/ArgoCD | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 8 - 관제/Grafana | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 9 - 데이터/BME280 | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 10 - Safe-Edge/AI | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 11 - Safe-Edge/Failover | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 12 - 자동화/Ansible | 부분 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M0 | Issue 13 - 검증/통합 | 완료 | `docs/issues/M0_factory-a_safe-edge-baseline.md` |
| M1 | Issue 0 - AWS/Auth | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 1 - Hub/EKS | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 2 - Hub/Kubernetes | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 3 - Hub/ArgoCD | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 4 - Hub/S3 | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 5 - Hub/IoT Core | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 6 - 관제/AMP | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 7 - 관제/Prometheus | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 8 - 관제/Grafana | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 9 - Hub/Ingress | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 10 - Hub/Admin UI | 완료 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 11 - Hub/Admin UI 보안 강화 | 보류 | `docs/issues/M1_hub-cloud.md` |
| M1 | Issue 12 - Risk/Config | 완료 | `docs/issues/M1_hub-cloud.md` |
| M2 | Issue 1 - Mesh/Tailscale 정책 | 완료 | `docs/issues/M2_mesh-vpn-hub-spoke.md` |
| M2 | Issue 2 - factory-a Master Tailscale 참여 | 완료 | `docs/issues/M2_mesh-vpn-hub-spoke.md` |
| M2 | Issue 3 - EKS Hub Tailscale 참여 | 완료 | `docs/issues/M2_mesh-vpn-hub-spoke.md` |
| M2 | Issue 4 - kubeconfig Tailscale IP 기반 구성 | 완료 | `docs/issues/M2_mesh-vpn-hub-spoke.md` |
| M2 | Issue 5 - ArgoCD factory-a cluster 등록 | 완료 | `docs/issues/M2_mesh-vpn-hub-spoke.md` |
| M2 | Issue 6 - Hub -> factory-a Sync 확인 | 완료 | `docs/issues/M2_mesh-vpn-hub-spoke.md` |
| M3 | Issue 1 - 배포/Helm GitOps 저장소 구조 | 완료 | `docs/issues/M3_deploy-pipeline.md` |
| M3 | Issue 2 - 배포/ECR 저장소 구성 및 이미지 태그 전략 | 진행 중 (워크스트림 A) | `docs/issues/M3_deploy-pipeline.md` |
| M3 | Issue 4 - 배포/ArgoCD ApplicationSet 구성 | 완료 | `docs/issues/M3_deploy-pipeline.md` |
| Phase 1 | Step 0~9.5 (도메인·Frontend·VPC·데이터저장소·협의·notifier·Backend·ECS·배포 CI/CD·e2e·permanent split) | 완료 | `docs/planning/16_data_dashboard_vpc_workplan.md` |
| Phase 1 | Step 10 운영 자동화/데모 | 진행 중 | `docs/planning/16_data_dashboard_vpc_workplan.md` |
| M4 | Issue 6/7 - Lambda data processor / pipeline_status | 완료 | `docs/issues/M4_data-plane.md` |
| M4 | Issue 8 - 데이터 플레인 e2e | 부분 완료 (cloud-side 검증, 실시간 edge 경로 후속) | `docs/issues/M4_data-plane.md` |
| M4 | Issue 1~5 - Edge Agent/IoT/S3 | 워크스트림 A · 팀 합의 | `docs/issues/M4_data-plane.md` |
| M6 | Issue 1/4 - Risk 계산 / Twin 출력 구조 | 완료 | `docs/issues/M6_risk-twin-dashboard.md` |
| M6 | Issue 5/6/7 - Dashboard 카드/센서/타임라인 | 완료 | `docs/issues/M6_risk-twin-dashboard.md` |
| M6 | Issue 8 - 시나리오별 Risk 변화 검증 | 부분 완료 (후속) | `docs/issues/M6_risk-twin-dashboard.md` |
| M6 | Phase 1 추가 - RBAC 사용자 관리 / Cloud Infra / 보고서 조회 | 완료 | `docs/issues/M6_risk-twin-dashboard.md` |
| M6 | Phase 1 추가 - 챗봇 데이터 QA (Bedrock) | 운영 배포 완료, 수기 질의 검증 후속 | ADR 0033 |
| M6 | Phase 1 추가 - LLM 보고서 생성기 (Bedrock) | 후속 (팀원) | ADR 0016 |

## 2026-05-15 워크스트림 분리

이 작업 환경은 2026-05-15부터 1번 Data / Dashboard VPC 측 작업(M4, M6)에 집중한다.

```text
워크스트림 A (팀, 다른 환경)
  - 2번 Control / Management VPC (EKS Hub, ArgoCD, Tailscale, Prometheus, Grafana, Admin UI)
  - Lambda data processor (IoT Rule trigger, 팀 합의 영역)
  - DynamoDB / S3 raw/processed 스키마 (팀 합의 영역)
  - M1, M2, M3, M5
  - M3 Issue 2/3/5/6/7/8 마무리는 팀 측에서 진행

워크스트림 B (이 환경: /home/jongwon/personal_project/Aegis-pi)
  - 1번 Data / Dashboard VPC
  - M4 데이터 플레인 (소비 측), M6 Risk Twin / Dashboard
  - 본 환경에서는 워크스트림 A 리소스(infra/hub, infra/foundation, Admin UI, ArgoCD ApplicationSet 등)를 신규 변경하지 않는다
```

## 2026-05-18 Phase 1 통합 결정

워크스트림 B의 구현 목표를 Phase 1으로 통합 확정. 초안의 Phase 1 MVP(서버리스 최소 구성)와 Phase 1.5(컨테이너 확장)를 하나로 합쳤다.

```text
Phase 1 (확정 배포 목표)
  + ECS Fargate Dashboard Backend (FastAPI)      ADR 0012 — ADR 0007 Dashboard API 부분 supersede
  + RDS PostgreSQL                              ADR 0017
  + ElastiCache Redis (캐시 + Pub/Sub)            ADR 0014
  + WebSocket 실시간 (DDB Streams + notifier)     ADR 0015
  + Bedrock Claude 3 Haiku 일간 보고서            ADR 0016 — 팀원/후속 작업
  + 1번 VPC Public/Private App/Private Data 3-tier + NAT GW × 1 (ADR 0011 supersede)
  + CloudFront + S3 SPA + Cognito (변경 없음)

데모 운영 패턴 (build/destroy 사이클): 월 ~$8~10, destroy 후 잔여 비용은 Terraform backend S3 + RDS snapshot storage 중심
상시 가동 시: 월 ~$125
```

근거 문서:

- `docs/changes/0005-work-split-control-vs-data-dashboard.md`
- `docs/changes/0012-introduce-container-backend-for-dashboard.md`
- `docs/changes/0013-aurora-serverless-for-metadata.md` (superseded)
- `docs/changes/0017-rds-postgresql-for-metadata.md`
- `docs/changes/0014-redis-for-realtime-cache.md`
- `docs/changes/0015-websocket-for-dashboard-realtime.md`
- `docs/changes/0016-bedrock-for-llm-report.md`
- `docs/planning/16_data_dashboard_vpc_workplan.md` (Step 0~10 진입 순서)
- `docs/planning/17_expansion_roadmap.md` (Phase 1~4 트리거 표)
- `docs/architecture/01_target_architecture.md` (Phase 1 토폴로지)
- `docs/architecture/drawio/agiespi_architecture_overview_final1.drawio` / `images/agiespi_architecture_overview_final3.drawio.png` (overview source of truth, ADR 0032)
- `docs/ops/15_aws_cost_baseline.md` (Phase 1 비용)
- `docs/report/03_요구사항정의서.md` (SRS v1.7)
- `docs/product/02_requirements_definition.md` (요구사항 추적 기준)

과거 Step 0~5 스냅샷 (보존용. 현재는 Step 0~9.5 완료 후 Step 10 운영 자동화/데모 진행 단계 — 최신 상태는 본 문서 상단 수정 이력과 "현재 큰 상태" 참조):

```text
Step 0 - 외부 사전 작업 (병행 가능)
  + Gabia 도메인 구매 + DNS 전파 시간 확보

Step 1 - Frontend prototype/reference 정리 (병행 가능)
  + frontend/ 화면 설계 prototype/reference 정리 단계
  + frontend/ = 화면 설계 prototype/reference (기존 Aegis-pi/, Aegis-pi2/ 정리됨)
  + apps/dashboard-web/ = 운영 배포용 공식 Vite + React SPA (Step 8 완료)
  + Step 9에서 S3 + CloudFront 배포 CI/CD 구현 완료, 실제 배포 대기
  + frontend/ 를 배포/CI/S3 source path로 직접 사용하지 않음

Step 2 - Terraform 1번 VPC 골격 (infra/data-dashboard/) ✅ 완료 (2026-05-21)
  + 전체 apply 완료: 47 resources (Route53 zone 1 + 40 + 잔여 6)
  + backend-bootstrap: kjw-aegis-terraform-state S3 backend bucket apply 완료
  + S3 backend: use_lockfile = true (Terraform S3 native lockfile 사용, DynamoDB lock table 미사용)
  + 네이밍: KJW-AEGIS-Data-* / kjw-aegis-data-* 규칙 준수, 도메인: aegis-pi.cloud
  + Route53 hosted zone 생성 완료. NS 4개 → secret/dashboard-nameservers.txt (git 추적 제외)
  + ACM 상태: ISSUED (ALB ap-south-1 / CloudFront us-east-1) — DNS validation 통과
  + terraform plan → No changes 확인 완료
  + 확인된 output:
    - ALB DNS: kjw-aegis-data-alb-1136678448.ap-south-1.elb.amazonaws.com
    - CloudFront domain: d3kuj3rm94dooi.cloudfront.net
    - Cognito Hosted UI: https://kjw-aegis-data-auth.auth.ap-south-1.amazoncognito.com
    - dashboard_api_url: https://api.aegis-pi.cloud
    - dashboard_web_url: https://dashboard.aegis-pi.cloud

Step 3 - Terraform 데이터 저장소 ✅ 완료 (2026-05-21)
  + DynamoDB 공식 hot store: AEGIS-DynamoDB-FactoryStatus (Step 5.5 이후 기준)
  + 중복 DynamoDB aegis-factory-status: Step 5.5에서 삭제 완료
  + DynamoDB aegis-daily-report: ACTIVE, on-demand
  + RDS PostgreSQL kjw-aegis-data-pg: available, db.t4g.micro, Single-AZ, gp3 20GiB, maxStorage 100GiB
  + Secrets Manager: kjw-aegis-data-rds-master / kjw-aegis-data-redis-auth
  + ElastiCache Redis kjw-aegis-data-redis: available, transit_encryption=true, auth_token=true
  + terraform plan → No changes 확인 완료
  + 확인된 output:
    - RDS endpoint: kjw-aegis-data-pg.c7ou2qkgi4nf.ap-south-1.rds.amazonaws.com:5432
    - Redis primary endpoint: master.kjw-aegis-data-redis.wai0jm.aps1.cache.amazonaws.com
    - DDB factory_status stream ARN: 활성 (arn 기록 금지)
  + 신규 파일: dynamodb.tf / rds.tf / redis.tf / secrets.tf
  + versions.tf: random provider ~> 3.6 추가
  + outputs.tf: Step 3 output 블록 추가 (secret value 미노출)
  + 누적 리소스: 47(Step 2) + 12(Step 3) = 59 resources

Step 4 사전 정렬 ✅ 완료 (2026-05-21, ADR 0020 → ADR 0022로 table 기준 보정)
  + apps/data-processor: 팀원 원격 코드(aegis-pi/Aegis-pi main) 동기화 완료
    - lambda_function.py / processor/{dynamo,envelope,normalizer,pipeline_status,risk,s3_writer}.py
    - tests/{test_dynamo,test_envelope,test_pipeline_status,test_risk,test_s3_writer}.py
  + 중복 DynamoDB aegis-factory-status는 ADR 0022 기준으로 교체 대상 확정
    - TTL: ENABLED, AttributeName=ttl, HISTORY_TTL_HOURS=48h
    - Streams: NEW_AND_OLD_IMAGES (당시 상태)
    - Step 5.5에서 Terraform resource 제거 및 AWS table 삭제 완료
  + 2026-05-21 재확인: 실제 dummy/sensor 데이터는 기존 AEGIS-DynamoDB-FactoryStatus에 적재 중
    - AEGIS-DynamoDB-FactoryStatus: pk/sk schema, item count 10,380, factory-a LATEST/HISTORY 존재
    - aegis-factory-status: 삭제 전에는 Step 4/5 테스트 데이터만 존재, 현재는 ResourceNotFound 확인 완료
    - ADR 0022에 따라 공식 hot store를 AEGIS-DynamoDB-FactoryStatus로 재정렬 완료
  + S3 processed 경로: processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
    - dataset: factory_state / risk_score / infra_state / state_snapshot (underscore, 팀원 코드/실제 S3 기준)
  + pytest: 20 passed
  + 다음: Step 4 본 구현 (IoT Rule trigger + Lambda 배포) — Codex 검토 후 진행

Step 4 본 구현 ✅ 완료 (2026-05-21, ADR 0021)
  + Lambda KJW-AEGIS-Data-Lambda-data-processor: active (Python 3.12, 256MB, 30s)
  + IAM KJW-AEGIS-Data-IAMRole-Lambda-data-processor: DDB GetItem/PutItem/UpdateItem + S3 PutObject(processed/*)
  + IoT Rule KJW_AEGIS_Data_IoTRule_factory_state_processor: active, SELECT * FROM 'aegis/+/factory_state'
  + IoT Rule KJW_AEGIS_Data_IoTRule_infra_state_processor: active, SELECT * FROM 'aegis/+/infra_state'
  + terraform apply: 8 added, 0 changed, 0 destroyed
  + terraform plan (post-apply): No changes
  + pytest: 24 passed
  + Direct invoke factory_state: DDB LATEST pk=FACTORY#factory-a / sk=LATEST 생성, HISTORY 적재
  + Direct invoke infra_state: DDB LATEST infra_state 갱신, pipeline_status=normal
  + S3 processed 경로 확인: factory_state / risk_score / infra_state / state_snapshot 모두 생성
  + IoT Rule 경유: aws iot-data publish → DDB LATEST updated_at 갱신 확인
  + 기존 AEGIS_IoTRule_factory_a_raw_s3: 변경 없음 (워크스트림 A 소유 — 접근 거부로 독립 확인)
  + aegis-bucket-data bucket-level: 변경 없음
  + 신규 파일: infra/data-dashboard/iam_data_processor.tf, lambda_data_processor.tf, iot_rule.tf
  + versions.tf: archive provider ~> 2.4 추가
  + outputs.tf: lambda_data_processor_name / iot_rule_factory_state_processor / iot_rule_infra_state_processor
  + ADR: docs/changes/0021-data-processor-iot-rule-trigger.md

Step 5 본 구현 ✅ 완료 (2026-05-21, ADR 0022로 table 기준 보정)
  + Lambda notifier KJW-AEGIS-Data-Lambda-notifier: active (Python 3.12, 256MB, 30s, VPC-attach)
    - VPC: private_app subnet × 2 (Azone/Czone), SG: KJW-AEGIS-Data-SG-LambdaNotifier
    - env: REDIS_HOST=master.kjw-aegis-data-redis.wai0jm.aps1.cache.amazonaws.com REDIS_PORT=6379 REDIS_AUTH_SECRET_NAME=kjw-aegis-data-redis-auth
  + IAM KJW-AEGIS-Data-IAMRole-Lambda-notifier: AWSLambdaVPCAccessExecutionRole + DDB Streams read + SecretsManager + SQS DLQ
  + SQS DLQ kjw-aegis-data-notifier-dlq: active, 14일 보존
  + ESM: DDB factory-status stream → Lambda notifier (UUID: 233e8443-b8b4-4bd5-b639-ed5ea8ba9283)
    - batch=10, maxRetry=3, bisect=true, starting_position=LATEST, DLQ destination 설정
  + terraform apply: 7 added, 0 changed, 0 destroyed
  + terraform plan (post-apply): No changes
  + ESM 상태: Enabled / LastResult=OK
  + DLQ 메시지 수: 0
  + CloudWatch Logs 검증 (2026-05-21T08:44:04Z):
    "published factory_id=factory-a channel=factory:update:factory-a"
    "batch done published=1 skipped=0"
    Duration: 285.56 ms (DDB write → Redis PUBLISH: ~0.45초 — DoD 5초 이내 기준 통과)
  + 신규 파일: apps/lambda-notifier/lambda_function.py, requirements.txt
               infra/data-dashboard/lambda_notifier.tf
  + versions.tf: null provider ~> 3.2 추가
  + outputs.tf: lambda_notifier_name / lambda_notifier_dlq_url / lambda_notifier_event_source_mapping_uuid
  + .gitignore: apps/**/.build/ 추가
  + Step 5.5에서 ESM을 AEGIS-DynamoDB-FactoryStatus Stream 기준으로 재정렬 완료
```

다음 세션 최우선 실행 순서 (본 환경):

```text
Step 5.5 — DynamoDB 공식 hot store 재정렬 + aegis-factory-status 삭제 ✅ 완료 (2026-05-21, ADR 0022)
  + AEGIS-DynamoDB-FactoryStatus Streams NEW_AND_OLD_IMAGES 활성화 (aws dynamodb update-table 직접 적용)
  + dynamodb.tf: aws_dynamodb_table.factory_status(aegis-factory-status) resource 블록 완전 제거
  + dynamodb.tf: data "aws_dynamodb_table" "official_factory_status" → AEGIS-DynamoDB-FactoryStatus 참조
  + lambda_data_processor.tf: DYNAMODB_TABLE_NAME = AEGIS-DynamoDB-FactoryStatus
  + apps/data-processor/processor/dynamo.py: 폴백 기본값 aegis-factory-status → AEGIS-DynamoDB-FactoryStatus
  + iam_data_processor.tf: DynamoDB policy ARN → AEGIS-DynamoDB-FactoryStatus
  + lambda_notifier.tf: DDB Streams IAM + ESM → AEGIS-DynamoDB-FactoryStatus Stream
  + outputs.tf: dynamodb_factory_status_name / stream_arn → 공식 table 기준
  + terraform apply (5.5 정렬): 1 added, 4 changed, 1 destroyed (ESM replace)
  + terraform apply (5.5 cleanup): 0 added, 1 changed (Lambda code hash), 1 destroyed (aegis-factory-status)
  + terraform plan (post-cleanup): No changes
  + aegis-factory-status: ResourceNotFoundException 확인 (삭제 완료)
  + AEGIS-DynamoDB-FactoryStatus: ACTIVE, StreamSpec NEW_AND_OLD_IMAGES 확인
  + Lambda data processor env DYNAMODB_TABLE_NAME = AEGIS-DynamoDB-FactoryStatus 확인
  + notifier ESM UUID dd047019-5dd9-4a89-9995-b33da97a581f, source = AEGIS-DynamoDB-FactoryStatus stream, State=Enabled
  + AEGIS-DynamoDB-FactoryStatus factory-a LATEST 조회 확인 (updated_at 2026-05-21T07:59:05.956Z)
  + AEGIS-DynamoDB-FactoryStatus factory-a HISTORY count: 3,616

Step 6 — Dashboard Backend FastAPI 구현 ✅ 완료 (2026-05-26)
  + apps/dashboard-backend/ 신설 완료
    - main.py / routers/factories.py / routers/reports.py / routers/ws.py
    - deps/auth.py (Cognito JWT 앱 레벨 검증, JWKS)
    - services/ddb.py / services/redis_client.py / services/s3.py
    - Dockerfile (python:3.12-slim 단일 stage, non-root appuser)
    - .env.example (gitignore 예외로 commit)
  + REST endpoints:
    - GET /healthz (인증 불필요)
    - GET /factories (Cognito JWT 필수)
    - GET /factories/{factory_id} (Cognito JWT 필수)
    - GET /factories/{factory_id}/history?window=1h (HISTORY#STATE#* 조회, HISTORY#RISK/FACTORY/INFRA 미사용)
    - GET /reports (skeleton, LLM report-generator 팀원/후속 작업 이후 구현)
    - GET /reports/{report_date}/{factory_id} (skeleton, S3 reports/ prefix는 후속 작업 이후 생성)
  + WebSocket:
    - /ws/factories/{factory_id} (JWT는 ?token= 쿼리 파라미터로 전달 — 브라우저 WS 헤더 제약 대응)
    - Redis Pub/Sub factory:update:{factory_id} subscribe
  + DDB 공식 hot store: AEGIS-DynamoDB-FactoryStatus
    - pk = FACTORY#{factory_id} / sk = LATEST
    - sk = HISTORY#STATE#{timestamp}
    - HISTORY#RISK / HISTORY#FACTORY / HISTORY#INFRA 미사용 (ADR 0022 기준)
  + GitHub Actions: .github/workflows/dashboard-backend.yml (pytest CI + ECR sha-<7char> push 골격)
    - AWS_OIDC_DASHBOARD_ROLE_ARN GitHub Secret 필요 (Step 7 IAM 생성 후 등록)
  + 검증:
    - pytest -q: 18 passed
    - docker build -t aegis-dashboard-backend:local apps/dashboard-backend: 통과
    - git diff --check: 통과
  + ECS/ECR/ALB: Step 7 이후 배포 완료, Backend `/healthz` 200 확인
  + frontend 상태:
    - frontend/ = 화면 설계 prototype/reference (기존 Aegis-pi/, Aegis-pi2/ 정리됨)
    - apps/dashboard-web/ = 운영 배포용 Vite + React SPA 공식 경로 (Step 8 완료)
    - Step 9에서 GitHub Actions → S3 sync → CloudFront invalidation 배포 파이프라인 구현 완료

3. Step 8 운영용 Frontend 마이그레이션 완료
   - frontend/ = 화면 설계 prototype/reference (기존 Aegis-pi/, Aegis-pi2/ → frontend/ 정리됨)
   - apps/dashboard-web/ = 운영 배포용 공식 Vite + React SPA
   - frontend/를 배포/CI/S3 source path로 직접 사용하지 않음
   - Cognito Hosted UI / WebSocket client / 보고서 탭 skeleton 구현

4. Step 4 (Lambda data processor 협의) — 워크스트림 A와 합류 지점
   - IoT Rule trigger 방식 확정 (기존 Rule 확장 vs 신규 Rule)
   - 결정 즉시 ADR로 기록 (docs/changes/0018~)

5. Step 6 Backend (FastAPI) 구현 완료 — Step 7에서 ECS 배포 완료
   - routers/factories.py, routers/reports.py, routers/ws.py
   - Cognito JWT 앱 레벨 검증, RDS PostgreSQL SQLAlchemy async + asyncpg, Redis asyncio
```

워크스트림 A 측의 다음 작업 (참고용, 본 환경에서 실행하지 않음):

```text
M3 Issue 2 마무리
  - ECR `aegis/edge-agent` image push 검증
  - factory-a K3s imagePullSecret 갱신 방식 확정
  - factory-a K3s에서 ECR image pull 검증
M3 Issue 3 - GitHub Actions OIDC build/push workflow 구성
```

## 2026-05-21 Terraform handoff guard

사용자가 VPC 1 Terraform 구현을 Claude Code에 위임할 예정이므로, 본 작업환경에서 문제를 만들지 않기 위한 문서 기준을 보강했다.

```text
확인한 외부 참고 repo:
  https://github.com/aegis-pi/Aegis-pi/tree/main
  main SHA: d4437ea9b9e4ec18605bc92da16abba48c453db8

로컬 origin:
  https://github.com/aegis-pi/dashboard_vpc.git
  사용자가 준 참고 repo와 다를 수 있으므로, 팀원 Terraform 확인은 외부 repo main을 별도 조회한다.

원격 main의 Terraform 역할:
  infra/hub/        2번 Control / Management VPC + EKS
  infra/foundation/ 공유 S3/AMP/ECR/IoT Rule/GitHub Actions OIDC
  infra/mesh-vpn/   Tailscale Hub-Spoke
  infra/safe-edge/  factory-a 기준선 문서
  infra/deploy/     배포 파이프라인 보조 영역

Claude Code 작업 제한:
  - VPC 1 Terraform은 `infra/data-dashboard/` 신규 root에만 작성
  - 신규 Data/Dashboard 리소스 이름은 `KJW-AEGIS-Data-*` 사용
  - lowercase 제약 리소스(S3 bucket, Cognito domain 등)는 `kjw-aegis-data-*` 사용
  - `infra/hub/**`, `infra/foundation/**`, `infra/mesh-vpn/**`, `infra/safe-edge/**`, `infra/deploy/**` 수정 금지
  - Terraform state/backend는 Hub/Foundation과 분리
  - `aegis-bucket-data` bucket 자체와 bucket-level policy/lifecycle/KMS/versioning 변경 금지
  - 기존 IoT Rule `AEGIS_IoTRule_factory_a_raw_s3` 변경 금지
  - ECR `aegis/edge-agent`, `aegis/factory-a-log-adapter`, `aegis/edge-iot-publisher` 변경 금지
  - Dashboard Backend ECR은 필요 시 `aegis/dashboard-backend` 신규 repo로 분리
```

반영 문서:

- `docs/AI_AGENT_HARNESS.md` — Phase 1 Step 2 Claude Code handoff guard 추가
- `docs/planning/15_cloud_architecture_final.md` — 1번 VPC 신규 Terraform 리소스 `KJW-AEGIS-Data-*` 기준 추가
- `docs/planning/16_data_dashboard_vpc_workplan.md` — Step 2 원격 repo 참고 전용/공유 리소스 충돌 방지 기준 추가
- `docs/architecture/01_target_architecture.md` — Terraform 구현 기준과 `KJW-AEGIS-Data-*` 네이밍 예시 추가

## 현재 큰 상태

```text
현재 단계: Phase 1 Step 9.5 permanent split 이후 infra/data-dashboard 일시 root 재기동 상태에서 Dashboard 운영 기능을 반복 배포 중. 최근 배포: Dashboard history delta refresh 최적화(`since`, 10m=250/1h=2000 기본 limit, frontend merge/dedupe, WebSocket LATEST append), Dashboard RBAC 사용자 관리(Cognito 로그인 + RDS app_user/factory/user_factory_access 권한 + `/admin/users` UI, ADR 0031) 및 삭제/정렬/수정 UX·stale disabled 사용자 재생성 보정, Cloud Infra 상태 화면 + Fast/Slow collector 배포(ADR 0027, `apps/cloud-infra-collector/`), ECS backend right-sizing + Auto Scaling(ADR 0030), Factory Timeline `10m/1h/custom` + `top_causes` 원인 표시, GRAPH#5M multi-resolution history(ADR 0025/0026), dashboard staleness 60/120초 통일(ADR 0028), S3 `reports/daily/` 기반 일간 보고서 조회 UI(ADR 0029), ADR 0033 `/chat/query` 챗봇 데이터 QA backend + Bedrock 2-tier(fast Haiku 4.5 / precise Sonnet 4.6) + rule fallback 및 dashboard-web `/chat` Workspace 페이지(ChatGPT형 thread/composer/evidence 렌더). 운영 인프라: ECS task role Bedrock IAM 적용 완료, simulation allowed. ECS desired/running 2, service revision 41, target 2개 HEALTHY. https://dashboard.aegis-pi.cloud/chat HTTP 200. https://api.aegis-pi.cloud/healthz HTTP 200. https://api.aegis-pi.cloud/readyz dynamodb/redis/rds_metadata ok. 다음: 인증 사용자로 실제 `/chat` Bedrock 질의 수기 확인, 보고서/이미지 도구 연결, Cognito super_admin bootstrap 후 관리자 화면에서 실제 사용자 권한 생성/수정 수기 확인, 사용자의 수동 테스트/캡처 진행 후 Step 10 운영 자동화/데모 준비. LLM report-generator(ADR 0016, Bedrock 일간 보고서 생성기)는 팀원/후속.
워크스트림 B 집중: 1번 Data/Dashboard VPC (M4 소비측, M6 Dashboard)
완료: M3 Issue 1 GitOps 저장소 구조, 공장별 values, smoke chart, GitHub Actions manifest validation
완료: M3 Issue 4 ApplicationSet 구성, `aegis-spoke-factory-a` 자동 생성, 수동 Sync, factory-a K3s smoke Pod `Running`
진행 중(워크스트림 A): M3 Issue 2 ECR 범위는 edge-agent로 확정, ECR repository 생성/스캔 설정 검증 완료
Phase 1 Step 2: 2026-05-21 전체 apply 완료. 47 resources. terraform plan No changes 확인.
Phase 1 Step 3: 2026-05-21 apply 완료. 12 resources 추가. terraform plan No changes 확인.
Phase 1 Step 4 사전 정렬: 2026-05-21 완료 (ADR 0020). apps/data-processor 동기화, DDB pk/sk 교체, S3 경로 스펙 정렬. ADR 0022에 따라 공식 hot store는 기존 AEGIS-DynamoDB-FactoryStatus로 재정렬 완료.
Phase 1 Step 4 본 구현: 2026-05-21 완료 (ADR 0021). Lambda KJW-AEGIS-Data-Lambda-data-processor active. IoT Rule 2개 active. DDB/S3 end-to-end 검증 완료.
Phase 1 Step 5 본 구현: 2026-05-21 완료. Lambda notifier KJW-AEGIS-Data-Lambda-notifier active. DDB Streams ESM Enabled. DDB write → Redis PUBLISH 0.45초 검증. DLQ=0.
backend-bootstrap: kjw-aegis-terraform-state S3 backend bucket apply 완료
S3 backend: use_lockfile = true (Terraform S3 native lockfile 사용, DynamoDB lock table 미사용)
Data/Dashboard VPC 일시 root: 2026-05-27 재기동 완료(73 added). VPC/subnets/NAT GW/ALB/RDS/Redis/Lambda/SQS/API DNS/ALB ACM/런타임 Secrets active. CloudFront/Cognito/S3-web/CF ACM/aegis-daily-report/ECR/OIDC roles는 permanent root로 유지.
공식 DynamoDB hot store: AEGIS-DynamoDB-FactoryStatus (Streams NEW_AND_OLD_IMAGES 활성. data-dashboard 재생성 시 Lambda data processor write / notifier ESM 연결)
중복 DynamoDB table: aegis-factory-status 삭제 완료 (2026-05-21, ADR 0022 cleanup)
Data/Dashboard 잔여 리소스: kjw-aegis-terraform-state S3 backend bucket, infra/data-dashboard-dns hosted zone, infra/data-dashboard-permanent 리소스 25개, RDS final snapshot
Terraform 재생성 보강: RDS final snapshot 이름 random suffix 적용, Secrets Manager recovery_window_in_days=0 적용, build/destroy wrapper 신규 추가
apps/data-processor: 팀원 코드 동기화 완료. S3 경로 processed/{factory_id}/{dataset}/... 형식 (팀원 코드/실제 S3 기준)
Phase 1 Step 6: 2026-05-26 완료. apps/dashboard-backend/ 신설. pytest 18 passed. docker build 통과.
Phase 1 Step 7 apply: 2026-05-26 완료. 92 resources 생성 (ECR aegis/dashboard-backend, ECS Cluster/TaskDef/Service, CloudWatch Logs, IAM, ALB listener rule, Route53 A-record). ECS desired_count=0으로 시작 (ECR 이미지 push 전 task 기동 방지).
Phase 1 Step 7 Backend 활성화: 2026-05-26 완료.
  + GitHub Secret AWS_OIDC_DASHBOARD_ROLE_ARN: aegis-pi organization 수준 등록 완료(사용자 확인 기준)
  + ECR aegis/dashboard-backend image tag: sha-9d2c200 push 확인
  + ECS service: ACTIVE, desired=1, running=1, rolloutState=COMPLETED 확인
  + Task definition image: aegis/dashboard-backend:sha-9d2c200 확인
  + public health check: https://api.aegis-pi.cloud/healthz → HTTP 200, {"status":"ok"}
  + terraform plan with desired_count=1 and image sha-9d2c200: No changes
Dashboard RBAC 사용자 관리 배포: 2026-06-04 완료.
  + RDS metadata tables: factory / app_user / user_factory_access / audit_log auto-create
  + Backend RBAC: Cognito JWT sub -> RDS app_user 조회, factories/reports/ws 공장별 인가, `/admin/users` super_admin/org_admin 제한
  + Frontend: `/admin/users` 사용자 목록/생성/수정/삭제 및 공장 권한 편집 UI
  + ECS task role: Cognito AdminCreateUser/AdminGetUser/AdminDisableUser 권한 추가
  + ECR image tag: sha-abb81ed push 확인
  + ECS service: task definition revision 33, desired=2, running=2, rolloutState=COMPLETED, task 2개 HEALTHY(AZ 1a/1c)
  + public health: `/healthz` ok, `/readyz` dynamodb/redis/rds_metadata ok
  + access check: 비인증 `/admin/users` API 401, web `/admin/users` SPA 200
  + terraform plan with backend_container_image sha-abb81ed: No changes
Phase 1 Step 7.5 Route53 Hosted Zone 영구 분리: 2026-05-26 완료.
  + infra/data-dashboard-dns/ 신규 Terraform root 생성 (main.tf/providers.tf/versions.tf/variables.tf/outputs.tf)
  + aws_route53_zone.dashboard lifecycle prevent_destroy = true
  + backend: kjw-aegis-terraform-state / data-dashboard-dns/terraform.tfstate
  + infra/data-dashboard/route53.tf: resource 블록 → data "aws_route53_zone" "dashboard" 대체
  + infra/data-dashboard/acm.tf: zone_id 참조 → data source
  + infra/data-dashboard/outputs.tf: route53_zone_id/route53_name_servers → data source
  + terraform validate: infra/data-dashboard-dns 통과, infra/data-dashboard 통과
  + terraform fmt -check: 양쪽 통과
  + git diff --check: 통과
  + state 이전 완료 (infra/data-dashboard-dns init → import → state rm):
      a. terraform -chdir=infra/data-dashboard-dns init
      b. terraform -chdir=infra/data-dashboard-dns import aws_route53_zone.dashboard <ZONE_ID>
      c. terraform -chdir=infra/data-dashboard state rm aws_route53_zone.dashboard
      d. terraform -chdir=infra/data-dashboard plan (No changes, zone destroy/create 없음)
      e. terraform -chdir=infra/data-dashboard-dns plan (No changes)
      state rm은 AWS 리소스를 삭제하지 않는다 (Terraform state에서만 추적 해제)
  + Route53 hosted zone은 infra/data-dashboard destroy 대상에서 제외됨 ($0.50/월 영구 비용 유지)
현재 AWS 상태: Hub/Foundation/IoT/Admin UI 리소스 재생성 완료. ECR `aegis/edge-agent` repository 활성 상태
남음(워크스트림 A): GitHub Actions OIDC push role, Spoke K3s imagePullSecret 갱신, image push/pull 검증
완료: M0 factory-a Safe-Edge 기준선
완료: M1 Issue 0 AWS CLI MFA 및 Terraform 접근 설정
완료: M1 Issue 1 EKS/VPC Terraform apply 및 kubectl 접근 확인
완료: M1 Issue 2 Hub Kubernetes 네임스페이스 설계 및 생성
완료: M1 Issue 3 Hub ArgoCD 설치 및 CLI/UI 검증, Ansible bootstrap 전환
완료: M1 Issue 4 S3 bucket apply, 보안 설정, IoT Rule 적재 검증, risk-normalizer IRSA S3 read/write 검증 완료
완료: M1 Issue 5 IoT Thing, certificate, policy, IoT Rule, 테스트 메시지 S3 적재 검증 완료
완료: M1 Issue 6 AMP Workspace 생성, Prometheus remote_write IRSA 구성, EKS pod assume-role 검증 완료
완료: M1 Issue 7 Hub Prometheus Agent 설치, remote_write 오류 로그 부재, AMP Query API `up{cluster="AEGIS-EKS"}` 수신 검증 완료
완료: M1 Issue 8 내부 Grafana 설치, AMP datasource SigV4/IRSA query 검증 완료
완료: M1 Issue 9 AWS Load Balancer Controller 준비
완료: M1 Issue 10 ArgoCD/Grafana HTTPS Admin Ingress 구성. Route53/ACM/Ingress/ALB와 HTTPS 검증 완료
보류: M1 Issue 11 WAF/Cognito/OIDC 운영 보안 강화
완료: M1 Issue 12 runtime-config.yaml 구조 초안과 VM dummy data 추천값 작성
완료: M2 Issue 1 Tailscale Tailnet/tag/Auth Key 정책 수립 및 Tailnet 확인
완료: M2 Issue 2 `factory-a-master` Tailscale 설치, Tailnet 참여, Windows 운영자 PC에서 ping/SSH 검증
완료: M2 Issue 3 EKS Hub Tailscale Operator 설치, egress Service, ArgoCD/Grafana Tailscale IP UI 접근 검증
완료: M2 Issue 4 Tailscale IP/tls-server-name 기반 factory-a kubeconfig 검증
완료: M2 Issue 5 ArgoCD factory-a cluster 등록 및 Successful 확인
완료: M2 Issue 6 factory-a-podinfo-smoke Sync/Healthy, Tailscale egress 장애/복구 검증
보류: EKS API endpoint CIDR 축소는 전체 설계 마무리 후 재검토
완료: Safe-Edge start_test Ansible playbook
확정: Terraform = 인프라, Ansible = 설정/소프트웨어/bootstrap, GitHub Actions = CI, GitHub+ArgoCD = CD
AWS 실제 리소스 상태: 2026-05-15 기준 Hub/Foundation/IoT/Admin UI 재생성 완료. Hub EKS, foundation S3/AMP/ECR/IoT Rule, `factory-a` IoT Thing/Policy/certificate, K3s IoT Secret, Route53/ACM/Admin UI Ingress 활성 상태.
Terraform state: infra/hub apply 완료, infra/foundation apply 완료
다음 작업 우선순위: 본 환경은 Phase 1 Step 7 ECS Fargate/ALB/ECR/Route53 배포. M3 Issue 2 ECR image push/pull 검증과 Spoke K3s imagePullSecret 방식 확정은 워크스트림 A에서 진행.
```

## 지금까지 완료한 일

### M0 factory-a 기준선

- Raspberry Pi 3-node K3s `factory-a` 기준선 구축 및 검증 완료
- ArgoCD, Longhorn, MetalLB, monitoring, ai-apps 기준선 정리
- AI snapshot 저장 기준을 Longhorn PVC에서 node-local hostPath로 변경한 현재 운영 기준 반영
- AI 추론 결과는 InfluxDB PVC를 통해 Longhorn에 저장하는 기준 반영
- failover/failback 테스트 결과 및 트러블슈팅 문서 확장
- 변경된 계획 추적용 `docs/changes/` 문서 추가
- `start_test` 반복 점검용 Ansible playbook 추가
- 2026-05-08 기준 `eth0` 내부망, `wlan0` 인터넷 default route, `tailscale0` 원격 제어망 역할을 확정하고 `start_test.yml`에 master `wlan0` 인터넷 경로와 Tailscale 상태 검증을 추가했다.

### Data / Dashboard VPC 확장 방향

- 최신 확정 클라우드 아키텍처는 `docs/planning/15_cloud_architecture_final.md`를 기준으로 한다.
- 사용자 대시보드는 Tailscale에 직접 의존하지 않는 1번 Data / Dashboard VPC 방향으로 정리
- Dashboard Web/API는 ArgoCD, Tailscale, EKS API, Spoke K3s API에 직접 접근하지 않는 방향 확정
- Edge Agent가 센서/시스템/장치/워크로드/pipeline heartbeat 상태를 함께 보내야 한다는 기준 반영
- 관련 문서: `docs/planning/07_dashboard_vpc_extension_plan.md`

### Admin UI HTTPS Ingress 방향

- MVP에서는 관리자 외부 접근 검증을 위해 ArgoCD/Grafana를 Public ALB 1개와 HTTPS host 기반 Ingress로 노출하는 방향으로 재정렬했다.
- ArgoCD와 Grafana는 계속 EKS 내부 Pod/Service로 실행하고, Kubernetes Service는 `ClusterIP`를 유지한다.
- 최소 보호선은 HTTPS, MVP 임시 허용 CIDR, ArgoCD/Grafana 자체 로그인이다.
- WAF, Cognito, 외부 OIDC/SSO는 MVP 필수 범위에서 제외하고 운영 보안 강화 백로그인 M1 Issue 11로 분리했다.
- 도메인은 `minsoo-tech.cloud` 기준으로 확정했다. Route53 Hosted Zone NS는 `ns-1079.awsdns-06.org`, `ns-1913.awsdns-47.co.uk`, `ns-7.awsdns-00.com`, `ns-872.awsdns-45.net`이다.
- `scripts/build/build-hub.sh`는 Terraform apply 직후 `scripts/ops/admin-ui-nameservers.sh`를 실행해 `secret/admin-ui-nameservers.txt`를 갱신한다. Gabia에 입력할 NS는 재생성 후 이 파일을 다시 확인한다.
- 현재 기본값은 `ADMIN_UI_INGRESS_ENABLED=false`다. `scripts/build/build-all.sh`는 Admin UI용 Route53 Hosted Zone/ACM certificate와 NS 파일까지만 준비하고, Gabia NS 위임 뒤 `scripts/build/build-admin-ui-after-ns.sh`로 ACM `ISSUED` 대기와 Admin UI Ingress 활성화를 별도 실행한다. 이미 NS 위임과 ACM 발급이 끝난 상태에서 Hub만 다시 적용할 때는 `ADMIN_UI_INGRESS_ENABLED=true scripts/build/build-hub.sh`를 사용할 수 있다.
- 현재 기본값은 `BUILD_TAILSCALE=true`이므로 `scripts/build/build-hub.sh`와 `scripts/build/build-all.sh`는 Hub bootstrap 이후 Tailscale Operator, factory-a egress Service, ArgoCD/Grafana Tailscale UI Service, ArgoCD `factory-a` cluster Secret을 자동 복구/검증한다. `~/Aegis/.aegis/secrets/tailscale/operator.env`가 없으면 실패한다.

### AWS CLI MFA 및 Terraform 접근

- 로컬 WSL 환경에서 AWS CLI, Terraform, jq를 프로젝트 로컬 `.tools` 아래에 설치
- `.bashrc`에 Aegis AWS 환경 로더 등록
- `aws configure` 기본 프로필 구성 완료
- MFA ARN을 `mfa.cfg`에 구성 완료
- `mfa <OTP>` 실행 및 `aws sts get-caller-identity` 확인 완료
- 기본 AWS 리전은 `ap-south-1`
- 관련 문서: `docs/planning/08_aws_cli_mfa_terraform_access.md`

### M1 Issue 1 EKS/VPC 설계 및 적용

- EKS/VPC Decision Record 작성
- Terraform skeleton 작성
- VPC/subnet/NAT/route table은 직접 AWS 리소스로 관리하고, EKS는 공식 Terraform module 사용
- `terraform init -backend=false` 완료
- `terraform validate` 통과
- `terraform fmt` 통과
- `terraform plan -out=tfplan` 확인
- `terraform apply -auto-approve tfplan` 완료
- 기존 `aegis-pi-hub-mvp` 인프라를 `terraform destroy -auto-approve`로 제거
- 새 네이밍/버전 기준으로 `terraform apply -auto-approve tfplan` 완료
- `aws eks update-kubeconfig --region ap-south-1 --name AEGIS-EKS` 완료
- `kubectl v1.34.7`을 `/home/vicbear/Aegis/.tools/bin/kubectl`에 설치
- `kubectl get nodes`에서 worker node 2대 `Ready` 확인
- `kubectl cluster-info`에서 EKS control plane과 CoreDNS 응답 확인
- 리소스 네이밍 규칙을 `AEGIS-[resource]-[feature]-[zone]`로 고정
- Terraform EKS 이름은 `AEGIS-EKS`, Kubernetes 버전은 `1.34`
- Issue 2 namespace/LimitRange 적용 후 최소 분리 작업을 위해 테스트용 Hub 리소스를 `terraform destroy -auto-approve`로 제거
- 책임 범위를 `infra/hub`, `scripts/ansible`, `infra/foundation` 기준으로 분리

관련 문서:

- `docs/planning/09_m1_eks_vpc_decision_record.md`
- `docs/planning/11_delivery_ownership_flow.md`
- `infra/hub/README.md`
- `infra/hub/*.tf`

## 현재 로컬 Terraform 기준

```text
Terraform roots:
- infra/hub: VPC, subnet, NAT Gateway, EKS cluster, node group
- infra/foundation: S3, ECR, AMP, IoT Core처럼 EKS destroy와 분리할 영속 리소스
Ansible bootstrap:
- scripts/ansible: kubeconfig 갱신, namespace, LimitRange, ArgoCD Helm install, 검증
Region: ap-south-1
VPC: 신규 생성
VPC CIDR: 10.0.0.0/16
Resource naming: 워크스트림 A 기존 Hub/Foundation은 AEGIS-[resource]-[feature]-[zone]. 워크스트림 B 신규 Data/Dashboard Terraform은 KJW-AEGIS-Data-*.
Target cluster name: AEGIS-EKS
Target Kubernetes version: 1.34
AZ: ap-south-1a, ap-south-1c
Subnets: public 2개 + private 2개
NAT Gateway: public Azone/Czone에 각 1개
Private route table: Azone/Czone 별도 구성
EKS endpoint: public endpoint
EKS endpoint CIDR: 0.0.0.0/0 (MVP bootstrap 임시 기준)
Node subnet: private subnet
Node group: EKS Managed Node Group
Instance type: t3.medium 기본
Node count: min/desired/max 2
Capacity: On-Demand
```

`t3.micro`는 사용하지 않는 기준이다. EKS system pod, CNI, CoreDNS, ArgoCD/Grafana/관측 컴포넌트까지 고려하면 메모리 여유가 작아 Hub MVP 기준선으로 부적합하다고 판단했다.

### M1 Issue 3 Hub ArgoCD

- 2026-05-06에 `scripts/build/build-all.sh` 기준으로 Hub EKS, ArgoCD, foundation S3, IoT Rule, IRSA 구성을 재생성하고 검증했다.
- 2026-05-08에 `scripts/destroy/destroy-all.sh` 기준으로 Hub/Foundation/IoT/K3s Secret을 삭제했다.
- `aws eks update-kubeconfig --region ap-south-1 --name AEGIS-EKS` 완료.
- `kubectl get nodes -o wide`에서 EKS worker node 2대 `Ready` 확인.
- Hub namespace/LimitRange는 처음 Terraform으로 검증했고, 최종 기준은 Ansible bootstrap으로 전환했다.
- `argocd`, `observability`, `risk`, `ops-support` namespace `Active` 확인.
- 각 namespace에 `default-limits` LimitRange 생성 확인.
- ArgoCD Helm chart `argo/argo-cd` `9.5.11` 설치 완료.
- ArgoCD app version은 `v3.3.9`.
- Helm release는 `argocd`, namespace는 `argocd`.
- `/home/vicbear/Aegis/.tools/bin/argocd` CLI `v3.3.9` 설치 완료.
- `kubectl -n argocd port-forward service/argocd-server 8080:443`로 UI 접근을 검증했다.
- `https://127.0.0.1:8080` HTTP 200 확인.
- 초기 admin secret 생성 확인. 비밀번호 값은 문서에 기록하지 않는다.
- CLI admin login 성공.
- `argocd cluster list`에서 `https://kubernetes.default.svc` / `in-cluster` 확인.
- `argocd-server` service는 `ClusterIP` 유지. M1 Issue 3에서는 AWS LoadBalancer를 만들지 않았다.
- 기존 ArgoCD Helm release가 chart `argo-cd-9.5.11`로 이미 deployed 상태이면 bootstrap에서 Helm upgrade를 건너뛰도록 최적화했다.

## 현재 AWS 상태

```text
AWS 계정 연결: MFA 세션으로 확인 완료
AWS 리소스 상태: 2026-05-15 rebuild 후 active
Hub EKS: AEGIS-EKS active, node 2 Ready
Hub VPC: vpc-004036a95d486c2c3
Private subnets: subnet-06e29617d5f8fa880, subnet-0887213fcdb8222d2
Public subnets: subnet-0bd88736ba79c8bc1, subnet-0aeab1c105fff4ac9
ArgoCD: argo-cd-9.5.11 / app v3.3.9, all pods Running
Grafana: grafana-10.5.15 / app 12.3.1, pod Running
Prometheus Agent: pod Running, AMP remote_write 검증 완료
AWS Load Balancer Controller: 2 pods Running
Foundation S3 bucket: aegis-bucket-data active
AMP Workspace ID: ws-c46e6ad0-9259-4a06-9fa8-da92aa2891a8
ECR repository: 611058323802.dkr.ecr.ap-south-1.amazonaws.com/aegis/edge-agent active, scanOnPush=true, MUTABLE
IoT Thing: AEGIS-IoTThing-factory-a active
IoT Policy: AEGIS-IoTPolicy-factory-a active
IoT Rule: AEGIS_IoTRule_factory_a_raw_s3 active
K3s Secret: factory-a ai-apps/aws-iot-factory-a-cert DATA=4
Admin UI ACM: ISSUED
Admin UI ALB: aegis-admin-ui-1594900970.ap-south-1.elb.amazonaws.com
Admin UI HTTPS: https://argocd.minsoo-tech.cloud, https://grafana.minsoo-tech.cloud
Tailscale UI: https://100.78.107.75/ for ArgoCD, http://100.117.77.36/ for Grafana
ArgoCD cluster Secret: cluster-factory-a -> https://factory-a-master-tailnet.argocd.svc.cluster.local:6443
GitOps Application: aegis-spoke-factory-a Synced + Healthy
factory-a K3s: master/worker1/worker2 Ready
factory-a smoke workload: aegis-spoke-system/aegis-spoke-smoke Deployment 1/1, Pod Running
terraform state: infra/hub apply complete
terraform state: infra/foundation apply complete
```

주의:

- `terraform init`은 provider/module을 로컬에 내려받는 작업이라 AWS 리소스를 만들지 않는다.
- AWS 리소스가 실제로 만들어지는 시점은 `terraform apply` 실행 시점이다.
- 테스트가 끝나면 반드시 `scripts/destroy/destroy-hub.sh` 또는 `scripts/destroy/destroy-all.sh`로 EKS, NAT Gateway, node group을 제거한다.
- 2026-05-15에는 `scripts/build/build-all.sh --admin-ui` 이후 Gabia NS 위임, `scripts/build/build-admin-ui-after-ns.sh`, Tailscale/IoT/ApplicationSet 검증까지 완료했다.
- `build-all.sh --admin-ui`는 이제 Admin UI Ingress를 즉시 켜지 않고 Route53/ACM/NS 출력까지만 준비한다. NS 위임 후 `build-admin-ui-after-ns.sh`를 실행한다.

과거 2026-05-08 삭제 전 검증 기록:

```text
Cluster: AEGIS-EKS
Region: ap-south-1
Kubernetes version: 1.34
VPC: vpc-09c894826697d728f
Private subnets: subnet-002dae5b51fec10e3, subnet-0fbe009eec8a23f95
Public subnets: subnet-017c1e07df8bd8e1f, subnet-0ab9faef9ef8e6086
Node group: AEGIS-EKS-node
Node status before destroy: 2 Ready
Hub namespaces: argocd, observability, risk, ops-support
Terraform state: infra/hub destroyed, infra/foundation destroyed
Ansible bootstrap: namespace, LimitRange, ArgoCD Helm release 재생성 기준 추가
ArgoCD Helm release: argocd / argo-cd-9.5.11 / app v3.3.9
S3 bucket: aegis-bucket-data
AMP Workspace: AEGIS-AMP-hub / ws-762fb9c1-ad1f-433d-991b-20f768186759
AMP remote_write endpoint: https://aps-workspaces.ap-south-1.amazonaws.com/workspaces/ws-762fb9c1-ad1f-433d-991b-20f768186759/api/v1/remote_write
IoT Rule: AEGIS_IoTRule_factory_a_raw_s3
IRSA Role: AEGIS-IAMRole-IRSA-risk-normalizer
IRSA ServiceAccount: risk/risk-normalizer
IRSA Role: AEGIS-IAMRole-IRSA-prometheus-remote-write
IRSA ServiceAccount: observability/prometheus-agent
```

현재 Terraform 기준 이름:

```text
Cluster: AEGIS-EKS
Kubernetes version: 1.34
VPC name: AEGIS-VPC
Public subnets: AEGIS-Subnet-public-Azone, AEGIS-Subnet-public-Czone
Private subnets: AEGIS-Subnet-private-Azone, AEGIS-Subnet-private-Czone
NAT gateways: AEGIS-NAT-public-Azone, AEGIS-NAT-public-Czone
Private route tables: AEGIS-RouteTable-private-Azone, AEGIS-RouteTable-private-Czone
Node group: AEGIS-EKS-node
Cluster IAM role: AEGIS-IAMRole-EKS-cluster
Node IAM role: AEGIS-IAMRole-EKS-node
Cluster security group: AEGIS-SG-EKS
Node security group: AEGIS-SG-EKS-node
```

최신 확인:

```text
kubectl get nodes -o wide
2 Ready

kubectl get namespaces argocd observability risk ops-support
4 Active

kubectl -n argocd get pods
all Running / Ready

helm list -n argocd
argocd deployed argo-cd-9.5.11 app v3.3.9

terraform -chdir=infra/hub plan -detailed-exitcode
No changes

terraform -chdir=infra/foundation plan -detailed-exitcode
No changes

EKS internal IRSA test pod
assumed role: AEGIS-IAMRole-IRSA-risk-normalizer
raw/factory-a read: allowed
latest/factory-a write: allowed
raw/factory-a write: AccessDenied
```

과거 2026-05-04 destroy 전 확인 기록:

```text
kubectl get nodes
2 Ready

kubectl -n argocd get pods
all Running / Ready

ssh minsoo@10.10.10.10 'kubectl -n ai-apps get secret aws-iot-factory-a-cert'
secret exists, DATA=4
```

## 다음에 할 일

### 0. 완료: Phase 1 Step 9.5 — Permanent Resource Split migration (2026-05-26)

```text
완료 내용:
  + infra/data-dashboard-permanent/ 신규 Terraform root 생성
    - backend: kjw-aegis-terraform-state / data-dashboard-permanent/terraform.tfstate
    - providers: ap-south-1 (primary) + us-east-1 (ACM cloudfront)
    - 파일: versions.tf / providers.tf / variables.tf / locals.tf / cognito.tf / dynamodb.tf /
            ecr.tf / s3_web.tf / cloudfront.tf / acm.tf / route53.tf / outputs.tf
  + terraform import: 25 resources 모두 import 완료
    - Cognito 3 + DynamoDB 1 + ECR 2 + OIDC 4 + S3 4 + CloudFront 2 + ACM 1 + Route53 2 + data sources
  + permanent plan: No changes (2026-05-27 post-migration diff apply 완료)
    - 적용 완료: token_validity_units 추가, DDB deletion_protection+PITR, allow_overwrite=true
  + terraform state rm: data-dashboard root에서 영구 리소스 20개 제거 완료
  + infra/data-dashboard/*.tf 수정 완료:
    - remote_state_permanent.tf 신설 (data.terraform_remote_state.permanent)
    - cognito.tf / cloudfront.tf / s3_web.tf / ecr.tf: 영구 리소스 블록 제거
    - acm.tf: CloudFront cert 블록 제거 (ALB cert만 유지)
    - route53.tf: web_cloudfront 레코드 제거 (api_alb 유지)
    - dynamodb.tf: daily_report 리소스 제거 (data source 유지)
    - ecs.tf: ECR URL / DDB name/arn / Cognito ID 참조 → remote_state 교체
    - outputs.tf: 영구 리소스 output → remote_state 참조 교체
  + data-dashboard plan: Plan: 1 to add, 1 to change, 1 to destroy
    - ECS task def 교체(image :latest ↔ sha-9d2c200 diff) + service 업데이트만. 영구 리소스 없음.
  + 엔드포인트 검증:
    - https://dashboard.aegis-pi.cloud/ → HTTP 200
    - https://api.aegis-pi.cloud/healthz → HTTP 200
  + 주요 결정:
    - aws_acm_certificate_validation: import 불가 리소스 — permanent root에서 영구 제외
      CloudFront는 aws_acm_certificate.cloudfront.arn 직접 참조 (cert ISSUED 상태라 안전)
    - generate_secret = false: ForceNew 속성 — permanent root에서 제거
      (Cognito client는 항상 public client로 생성됨)
  + ADR 0024 작성 완료 (docs/changes/0024-data-dashboard-permanent-resource-split.md)
```

### 0.1 완료: Phase 1 Step 9.5 — 임시 root destroy (2026-05-26)

```text
완료 내용:
  + terraform -chdir=infra/data-dashboard plan -destroy:
    - Plan: 0 to add, 0 to change, 73 to destroy
    - 영구 root 리소스 삭제 계획 없음 확인
  + terraform -chdir=infra/data-dashboard apply:
    - Apply complete: 0 added, 0 changed, 73 destroyed
  + Lambda VPC ENI 2개가 available 상태로 남아 수동 삭제 후 destroy 완료
  + infra/data-dashboard state list: 0
  + infra/data-dashboard-permanent state list: 25
  + infra/data-dashboard-dns state list: 1
  + https://dashboard.aegis-pi.cloud/ → HTTP 200, CloudFront Hit
  + https://api.aegis-pi.cloud/healthz → DNS 미해결. API/ALB destroy 후 정상
  + RDS final snapshot: available 확인

남은 비용 기준:
  + Route53 hosted zone, ECR 이미지 스토리지, S3/CloudFront 소량 사용량, RDS final snapshot storage
  + NAT Gateway, ALB, ECS, RDS instance, Redis, Lambda, Secrets Manager 런타임 비용은 중지
```

### 1. 완료: Phase 1 Step 9 Part 2 end-to-end 통합 검증 (2026-05-26)

```text
검증 완료 항목:
  + https://api.aegis-pi.cloud/healthz → HTTP 200 {"status":"ok"}
  + https://dashboard.aegis-pi.cloud/ → HTTP 200, CloudFront Hit
  + /factories 무인증 → HTTP 401 "Missing Authorization header" (Bearer 인증 보호 정상)
  + AEGIS-DynamoDB-FactoryStatus: ACTIVE, Streams NEW_AND_OLD_IMAGES
  + DynamoDB LATEST factory-a/b/c: 각 1건 (updated_at 2026-05-21, HISTORY_TTL_HOURS=48h 만료)
  + Lambda data-processor: Active, DYNAMODB_TABLE_NAME=AEGIS-DynamoDB-FactoryStatus
  + IoT Rule factory_state/infra_state_processor: 모두 Disabled=false
  + Lambda notifier ESM: State=Enabled, EventSourceArn=AEGIS-DynamoDB-FactoryStatus stream
  + DLQ: ApproximateNumberOfMessages=0
  + ECS Backend: ACTIVE, desired=1, running=1, COMPLETED
  + CloudFront: Deployed, Enabled
  + Cognito: MFA=ON, Callback=https://dashboard.aegis-pi.cloud/callback, Logout=https://dashboard.aegis-pi.cloud/
  + GitHub Actions dashboard-web: 최근 2회 success
  + git status: clean / git diff --check: pass

미검증 항목:
  + IoT → Lambda → DDB LATEST 실시간 반영: factory-a Edge Agent 비활성(인프라 정상, 2026-05-21 이후 신규 write 없음)
  + DDB Streams → notifier → Redis PUBLISH: 신규 DDB write 없어서 미실행(LastResult="No records processed")
  + WebSocket 실시간 push: Cognito JWT 없이 연결 불가
  + Cognito 로그인/콜백/로그아웃 UI: 브라우저 수기 확인 필요

세부 검증 결과: docs/ops/22_data_dashboard_vpc_runbook.md § Step 9 End-to-End 통합 검증 결과

다음:
  1. factory-a Edge Agent 재활성화 시 IoT→DDB→Redis→WebSocket 경로 검증
  2. 브라우저에서 Cognito 로그인/콜백/로그아웃 수기 확인
  3. 사용자의 수동 테스트/캡처 이후 Step 10 운영 자동화/문서화 진행
  4. LLM 일간 보고서는 팀원/후속 작업으로 분리
```

### 1. 완료: Phase 1 Step 9 S3+CloudFront 배포 CI/CD (workflow + IAM apply)

Phase 1 Step 9 S3+CloudFront 배포 CI/CD 구현이 완료됐다.

```text
Step 9 CI/CD 구현 완료 내용 (2026-05-26):
  + GitHub Actions: .github/workflows/dashboard-web.yml 신설
      - 트리거: push main (apps/dashboard-web/**, .github/workflows/dashboard-web.yml), workflow_dispatch
      - test job: npm ci → npm run lint → npm run test
      - build-and-deploy job (needs: test): npm ci → npm run build (VITE_* env) → OIDC configure → S3 sync → CloudFront invalidation
      - OIDC permissions는 build-and-deploy job에만 부여 (최소권한)
  + IAM role (ADR 0023, 옵션 B — 별도 role):
      - 신규: KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy
      - 권한: s3:ListBucket(bucket) + s3:PutObject/DeleteObject/GetObject(bucket/*) + cloudfront:CreateInvalidation(distribution)
      - Trust policy: 기존 github_oidc_ecr_push_assume 재사용 (동일 OIDC provider/repo 조건)
  + Terraform:
      - infra/data-dashboard/ecr.tf: 새 role + policy 추가
      - infra/data-dashboard/outputs.tf: github_oidc_web_deploy_role_arn output 추가
      - terraform fmt -check: 통과
      - terraform validate: Success!
      - terraform plan: 2 to add, 0 to change, 0 to destroy
        → aws_iam_role.github_oidc_web_deploy / aws_iam_role_policy.github_oidc_web_deploy 신규
        → 기존 92 resources 변경 없음
      - terraform apply: 2 added, 0 changed, 0 destroyed
  + 로컬 검증:
      - npm run lint: 0 errors
      - npm run test: 6 passed
      - npm run build: dist/ 675 kB 생성
      - git diff --check: 통과
  + ADR 0023: docs/changes/0023-github-oidc-web-deploy-role.md
  + GitHub 설정:
      - org-level 등록 시도는 현재 gh token의 admin:org 권한 부족으로 실패
      - repo-level secret AWS_OIDC_DASHBOARD_WEB_ROLE_ARN 등록 완료
      - repo-level variables 9종 등록 완료
  + 실제 배포:
      - dashboard-web workflow push run 성공
      - workflow Node runtime: Node 24 기준 성공 (FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true)
      - Node 20 deprecation annotation은 사용 action 내부 target 경고로 남아 있으며, Node 20으로 rollback하지 않음
      - test job: 성공
      - build-and-deploy job: 성공
      - S3 sync + CloudFront invalidation 완료
      - https://dashboard.aegis-pi.cloud/ HTTP 200 확인
      - https://api.aegis-pi.cloud/healthz HTTP 200 확인

등록된 GitHub Secret/Variable:
  GitHub Secrets (aegis-pi/dashboard_vpc repo 수준):
    AWS_OIDC_DASHBOARD_WEB_ROLE_ARN
  GitHub Variables (aegis-pi/dashboard_vpc repo 수준):
    DASHBOARD_WEB_BUCKET             → terraform output s3_web_bucket_name (kjw-aegis-data-web)
    DASHBOARD_CLOUDFRONT_DISTRIBUTION_ID → terraform output cloudfront_distribution_id
    VITE_API_BASE_URL                → https://api.aegis-pi.cloud
    VITE_WS_BASE_URL                 → wss://api.aegis-pi.cloud
    VITE_COGNITO_AUTHORITY           → https://cognito-idp.ap-south-1.amazonaws.com/<user-pool-id>
    VITE_COGNITO_DOMAIN              → https://kjw-aegis-data-auth.auth.ap-south-1.amazoncognito.com
    VITE_COGNITO_CLIENT_ID           → terraform output cognito_app_client_id
    VITE_COGNITO_REDIRECT_URI        → https://dashboard.aegis-pi.cloud/callback
    VITE_COGNITO_LOGOUT_URI          → https://dashboard.aegis-pi.cloud/

다음 작업:
  1. Step 9 end-to-end 통합 검증 (IoT → DDB → WebSocket → Dashboard SPA 전체 경로)
  2. GitHub Actions action version의 Node 24 native 전환 추적
```

### 2. 완료: Phase 1 Step 8 운영용 Frontend Vite + React 마이그레이션

Phase 1 Step 7 Backend 활성화와 Step 7.5 Route53 Hosted Zone 영구 분리가 완료됐다.

```text
Step 7 완료 내용:
  + ECR aegis/dashboard-backend, image tag sha-9d2c200 push 완료
  + ECS Cluster/TaskDef/Service (desired_count=1, running=1)
  + ALB HTTPS 443 listener rule + /ws/* sticky session
  + Route53 A-record alias: api.<도메인> → ALB
  + Task Execution Role (ECR pull + CWLogs) / Task Role (DDB/S3/Secrets)
  + GitHub Actions OIDC role apply 완료, GitHub Secret은 aegis-pi organization 수준 등록 완료(사용자 확인 기준)
  + https://api.aegis-pi.cloud/healthz → HTTP 200

Step 7.5 완료 내용:
  + infra/data-dashboard-dns/ 신규 Terraform root (prevent_destroy=true)
  + infra/data-dashboard/route53.tf: data source로 전환 (aws_route53_zone.dashboard resource 제거)
  + ACM/outputs.tf route53 참조 → data source
  + Terraform validate/fmt-check: 양쪽 통과
  + state 이전 완료: import → state rm → 양쪽 plan No changes
```

Step 8 완료 내용:
  + apps/dashboard-web/ 신설 (Vite 6 + React 18 + TypeScript strict)
  + 인증: oidc-client-ts@3.1 (Cognito PKCE), JWT via ?token= WebSocket
  + 라우트: / (FleetPage), /factory/:id (FactoryPage), /callback, /reports, /login
  + 컴포넌트: Badge, Sparkline, ConnStatus, Chart (recharts), Layout (Shell/Sidebar/TopBar)
  + hooks: useFactories, useFactory, useFactoryHistory, useWebSocket (exponential backoff)
  + CSS: custom property 기반 design system (--bg, --crit, --warn, --safe 등)
  + npm run build: dist/ 생성, 3.00s 빌드
  + npm run lint: 0 errors
  + npm run test: 6 tests 통과 (Badge riskColor/relTime 단위 테스트)
  + VITE_COGNITO_AUTHORITY(User Pool issuer)와 VITE_COGNITO_DOMAIN(Hosted UI domain)을 분리해 OIDC discovery 404 방지
  + .env.example only committed (VITE_COGNITO_CLIENT_ID 등 hardcode 금지)

다음 작업:
- Phase 1 Step 9: S3 + CloudFront 배포 CI/CD (GitHub Actions → S3 sync → CloudFront invalidation)
- Phase 1 Step 10: LLM 일간 보고서 (Bedrock Claude 3 Haiku, 팀원/후속)

2026-05-15 기준 최근 검증 완료 전제:

- Foundation S3 bucket `aegis-bucket-data` active
- ECR repository `611058323802.dkr.ecr.ap-south-1.amazonaws.com/aegis/edge-agent` active
- Hub EKS `AEGIS-EKS` node 2 Ready
- ArgoCD Helm release `argocd` deployed, pods Running
- Grafana and Prometheus Agent pods Running
- AWS Load Balancer Controller pods Running
- Admin UI ACM `ISSUED`, HTTPS endpoint verify 통과
- IoT Thing `AEGIS-IoTThing-factory-a`, Policy, certificate, IoT Rule active
- K3s Secret `ai-apps/aws-iot-factory-a-cert` DATA=4
- Tailscale factory-a egress Service, ArgoCD/Grafana Tailscale UI, ArgoCD cluster Secret verify 통과
- GitOps ApplicationSet `aegis-spoke` active
- ArgoCD Application `aegis-spoke-factory-a` `Synced` + `Healthy`
- factory-a K3s `aegis-spoke-system/aegis-spoke-smoke` Pod `Running`
- Hub UI credential export: `secret/hub-ui-credentials.txt` 생성, 파일 권한 `0600`
- 과거 M1/M2 상세 검증 로그는 이 파일의 이전 섹션과 각 이슈 문서에 유지한다.

본 환경(워크스트림 B) 다음 구현 순서:

```text
M4 진입 준비:
1. docs/specs/data_storage_pipeline.md 재확인 후 DynamoDB LATEST/HISTORY 스키마 후보 정리
2. S3 processed bucket/prefix 결정 (aegis-bucket-data 재사용 vs 신규 bucket) ADR 작성
3. infra/data-dashboard/ Terraform root 도입 여부 결정 (state 분리 기준)
4. Lambda data processor 트리거 경로 결정 (기존 IoT Rule 확장 vs 신규 Rule)
5. Dashboard Backend/API의 read-only IAM scope 초안 작성
```

워크스트림 A 측 잔여 항목 (본 환경에서 실행하지 않음):

```text
M3 Issue 2:
- ECR 이미지 push/pull 검증, Spoke K3s pull secret 갱신, GitHub Actions OIDC 권한
M3 Issue 3/5/6/7/8, M5, M1 Issue 11(보류) 등은 팀 측에서 진행
```

로컬/재생성 후 확인할 명령:

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
kubectl get nodes
ssh minsoo@10.10.10.10 'tailscale status --self; tailscale ip -4'
scripts/build/build-all.sh
aws eks describe-cluster --region ap-south-1 --name AEGIS-EKS
```

주의:

- Secret 값, private key, SSH 비밀번호, MFA OTP는 문서에 기록하지 않는다.
- 현재 local `secret/iot/factory-a/registration-summary.txt` 기준 Thing 이름은 `AEGIS-IoTThing-factory-a`다.
- `scripts/config/defaults.sh`의 IoT Thing prefix도 실제 리소스 기준 `AEGIS-IoTThing`으로 맞춰 두었다.

### 2. Hub 재기동 순서

Hub EKS를 destroy한 뒤 다시 필요한 작업을 시작할 때는 아래 순서로 올린다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/build/build-hub.sh
```

전체 생성은 아래 진입점을 사용한다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/build/build-all.sh
```

Admin UI Ingress/ALB는 전체 생성과 분리해, Gabia NS 위임 뒤 아래 진입점을 사용한다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/build/build-admin-ui-after-ns.sh
```

ArgoCD UI 접근:

```text
https://argocd.minsoo-tech.cloud
```

Grafana UI 접근:

```text
https://grafana.minsoo-tech.cloud
```

로컬 fallback 포트포워딩:

```bash
/home/vicbear/Aegis/git_clone/Aegis-pi/scripts/ops/argocd-port-forward.sh
```

### 3. M1 Issue 4/5 S3 및 IoT Core 완료 상태

현재 공식 이슈 `M1 Issue 4 - [Hub/S3] 버킷 생성 및 경로 파티셔닝 설계`와 `M1 Issue 5 - [Hub/IoT Core] Thing / 인증서 / 규칙 구성`은 완료 상태다.

완료한 내용:

- `infra/foundation`을 독립 Terraform root로 구성
- S3 bucket 이름 결정: `aegis-bucket-data`
- public access block enabled 기준 적용
- versioning enabled 기준 적용
- SSE-S3 encryption 기준 적용
- raw/processed/latest prefix 기준 확정
- lifecycle 기준 확정
- `terraform apply`: `6 added, 0 changed, 0 destroyed`
- AWS API 검증:
  - versioning `Enabled`
  - public access block 4개 옵션 모두 `true`
  - SSE-S3 `AES256`
  - lifecycle rule 4개 적용 확인
- IoT Rule `AEGIS_IoTRule_factory_a_raw_s3` 생성 및 S3 raw prefix 적재 검증
- Test object `raw/factory-a/sensor/yyyy=2026/mm=05/dd=06/manual-20260506T014423Z-31668.json` 확인
- `risk/risk-normalizer` IRSA 구성 및 EKS 내부 pod 검증
- IRSA 권한 범위 확인:
  - `raw/factory-a/` read 허용
  - `latest/factory-a/` write 허용
  - `raw/factory-a/` write 거부

남은 내용: 없음. 이후 M1 Issue 6~10/12와 M2 Issue 1~6은 완료됐다. M2에서는 EKS Hub Tailscale Operator 설치, `factory-a-master` K3s API TCP reachability, `factory-a` kubeconfig/ArgoCD cluster 등록, `factory-a-podinfo-smoke` Sync/Healthy, Tailscale egress 장애/복구 검증까지 완료했다.

### 4. ArgoCD 접근 전략 유지

현재 ArgoCD 접근 기준:

- Hub rebuild 후에는 ArgoCD/Grafana를 Tailscale UI Service 또는 로컬 fallback port-forward로 접근한다.
- M2에서 ArgoCD/Grafana Tailscale IP 접근과 `factory-a` egress 경로를 검증했다.
- EKS API endpoint public CIDR 축소는 M2 완료 조건에서 제외하고, 운영 보안 강화/설계 마무리 후 재검토한다.
- ArgoCD 설정은 UI 클릭보다 Git/YAML/ApplicationSet으로 코드화한다.
- ArgoCD public `LoadBalancer`는 만들지 않는다.

### 5. ArgoCD 재생성 자동화

EKS를 destroy/recreate할 때 ArgoCD 재설치를 반복하지 않도록 현재 수동 Helm install 기준을 Ansible bootstrap으로 전환했다.

적용 내용:

- `scripts/ansible/inventory/hub_eks_dynamic.sh` 추가 완료
- `scripts/ansible/inventory/group_vars/hub_eks.yml` 추가 완료
- `scripts/ansible/files/hub-bootstrap.yaml` 추가 완료
- `scripts/ansible/files/argocd-values.yaml` 추가 완료
- `scripts/ansible/playbooks/hub_argocd_bootstrap.yml` 추가 완료
- `scripts/ansible/playbooks/hub_argocd_verify.yml` 추가 완료
- `helm upgrade --install`로 `argo/argo-cd` chart `9.5.11` 관리
- release name `argocd`, namespace `argocd`, service type `ClusterIP` 유지
- repo, AppProject, Application, ApplicationSet은 후속 코드화
- 포트포워딩은 Terraform에 넣지 않고 `scripts/ops/argocd-port-forward.sh`로 제공
- dynamic inventory는 `infra/hub`의 `terraform output -json`을 읽어 cluster name, region, kubeconfig 명령을 Ansible 변수로 제공한다.
- 다음 `hub_argocd_bootstrap.yml` 실행 때 ArgoCD Helm release가 새로 생성된다.

포트포워딩 스크립트는 아래 흐름을 따른다.

```text
aws eks update-kubeconfig
kubectl -n argocd wait
kubectl -n argocd port-forward service/argocd-server 8080:443
```

### 6. 리소스 종료 기준

작업을 멈추거나 장시간 사용하지 않을 때는 비용 방지를 위해 아래 순서로 제거한다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/destroy/destroy-hub.sh
```

전체 비용 제거가 필요하면 아래 진입점을 사용한다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/destroy/destroy-all.sh
```

장시간 사용하지 않을 리소스를 남기지 않는다. EKS control plane, NAT Gateway, managed node group은 켜져 있는 동안 비용이 발생한다. 2026-05-08에는 `destroy-all.sh`로 K3s IoT Secret, IoT, Hub, foundation을 삭제했고 active AEGIS AWS fixed-cost resource 0개 상태를 확인했다.

## 문서 갱신 상태

M1 Issue 4/5/6/7/8/9/10/12 완료, M2 Issue 1~6 완료, M3 Issue 1/4 완료, 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성 상태, 워크스트림 B Phase 1 통합 결정(ECS Fargate Backend, RDS PostgreSQL, Redis, WebSocket, Bedrock)을 문서에 반영했다.
AWS 비용 기준은 `docs/ops/15_aws_cost_baseline.md`에 반영했고, AWS 리소스나 상시 운영 경로가 추가될 때 함께 갱신하는 규칙을 `docs/README.md`, `docs/ops/README.md`, `docs/planning/11_delivery_ownership_flow.md`에 유지한다.
구현 책임 경계는 Terraform, Ansible, GitHub Actions, GitHub+ArgoCD 흐름으로 고정한다.

- `README.md`
- `docs/README.md`
- `docs/issues/M1_hub-cloud.md`
- `docs/issues/M3_deploy-pipeline.md`
- `docs/issues/MASTER_CHECKLIST.md`
- `docs/issues/SESSION_STATE.md`
- `docs/ops/README.md`
- `docs/ops/13_hub_namespace_baseline.md`
- `docs/ops/14_hub_run_commands.md`
- `docs/ops/15_aws_cost_baseline.md`
- `docs/ops/16_hub_prometheus_amp.md`
- `docs/ops/17_hub_grafana_amp.md`
- `docs/planning/09_m1_eks_vpc_decision_record.md`
- `docs/planning/00_project_overview.md`
- `docs/planning/02_implementation_plan.md`
- `docs/planning/11_delivery_ownership_flow.md`
- `infra/README.md`
- `infra/hub/README.md`
- `infra/foundation/README.md`
- `scripts/iot/README.md`
- `scripts/build/README.md`
- `scripts/hub/README.md`
- `scripts/README.md`
- `scripts/ansible/README.md`
- `scripts/ansible/playbooks/README.md`

## 주의사항

- Access Key, Secret Access Key, Session Token, MFA OTP, SSH 비밀번호는 문서에 기록하지 않는다.
- `terraform.tfvars`는 Git에 커밋하지 않는다.
- `infra/hub/.terraform/`은 Git에 커밋하지 않는다.
- `infra/hub/.terraform.lock.hcl`은 provider lock을 위해 커밋 대상이다.
- `terraform apply` 전에는 항상 `terraform plan`을 먼저 확인한다.
- `terraform destroy`는 실험 종료 절차로 함께 수행한다.

## 최근 커밋

```text
c555519 frontend-reference: compact factory hero
e0d3fce web: render infra workload summaries
5d39c82 backend: expose infra summary counts
7176b6a refactor(frontend): consolidate prototype under frontend
97dab97 docs(architecture): add dashboard diagram assets
01a7609 docs(changes): align websocket ADR with factory status table
```

현재 세션 정리 내용:

```text
2026-05-26 세션 저장 기준 (Phase 1 Step 8 Frontend 마이그레이션 완료)
Step 6 Dashboard Backend FastAPI 구현 완료:
  + apps/dashboard-backend/ 신설 (FastAPI 0.1.0)
  + REST: /healthz, /factories, /factories/{id}, /factories/{id}/history, /reports, /reports/{date}/{id}
  + WebSocket: /ws/factories/{factory_id} (JWT via ?token= 파라미터)
  + Cognito JWT 앱 레벨 검증 (deps/auth.py, JWKS)
  + DDB hot store: AEGIS-DynamoDB-FactoryStatus (pk/sk, HISTORY#STATE#*)
  + HISTORY#RISK / HISTORY#FACTORY / HISTORY#INFRA 미사용 (ADR 0022)
  + S3 processed path: processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
  + Dockerfile (python:3.12-slim 단일 stage, non-root appuser)
  + .github/workflows/dashboard-backend.yml (pytest CI + ECR sha-<7char> push 골격)
  + pytest -q: 18 passed / docker build: 통과 / git diff --check: 통과
  + ECS/ECR/ALB 배포 완료 — https://api.aegis-pi.cloud/healthz 200 확인

Step 7 ECS Fargate / ALB / ECR apply 완료 (2026-05-26):
  + 92 resources 생성: ECR aegis/dashboard-backend, ECS Cluster/TaskDef/Service, CloudWatch Logs, IAM, ALB listener rule, Route53 A-record
  + ECR image sha-9d2c200 push 완료
  + ECS desired_count=1 / running_count=1 / rolloutState=COMPLETED 확인
  + Task definition image = aegis/dashboard-backend:sha-9d2c200 확인
  + curl -i https://api.aegis-pi.cloud/healthz → HTTP/2 200, {"status":"ok"}
  + Backend ECS Task Role에서 Bedrock InvokeModel 권한 제외 (LLM 보고서는 팀원/후속)
  + GitHub Actions OIDC role: apply로 생성됨. AWS_OIDC_DASHBOARD_ROLE_ARN은 aegis-pi organization secret으로 등록 완료(사용자 확인 기준)

Step 7.5 Route53 Hosted Zone 영구 분리 완료 (2026-05-26):
  + infra/data-dashboard-dns/ 신규 Terraform root 생성 (5개 파일)
  + aws_route53_zone.dashboard lifecycle { prevent_destroy = true }
  + infra/data-dashboard route53.tf → data source 전환 (resource 블록 제거)
  + acm.tf, outputs.tf route53 참조 → data source
  + terraform fmt-check, validate: 양쪽 통과 / git diff --check: 통과
  + state 이전(import + state rm) 완료
  + infra/data-dashboard plan: No changes
  + infra/data-dashboard-dns plan: No changes

frontend 경로 정리:
  + frontend/ = 화면 설계 prototype/reference (기존 Aegis-pi/, Aegis-pi2/ 정리됨)
  + apps/dashboard-web/ = 운영 배포용 Vite + React SPA 공식 경로 (Step 8 완료)
  + frontend/ → S3/CloudFront 직접 배포 금지

다음 작업 (워크스트림 B):
  Phase 1 Step 9 S3+CloudFront 배포 CI/CD (GitHub Actions → S3 sync → CloudFront invalidation)
  LLM 일간 보고서(Bedrock Claude 3 Haiku)는 팀원/후속 작업으로 유지

워크스트림 A 잔여 (본 환경 실행 안 함):
  M3 Issue 2 - ECR image push/pull 검증, Spoke K3s imagePullSecret 방식 확정

[이전 컨텍스트 유지]
Hub/Foundation/IoT/Admin UI 재생성 완료 (2026-05-15)
Hub EKS AEGIS-EKS active, node 2 Ready (워크스트림 A 영역, 본 환경 변경 없음)
ECR aegis/edge-agent active, factory-a IoT Thing/Policy active
factory-a K3s master/worker1/worker2 Ready
ApplicationSet aegis-spoke active, Application aegis-spoke-factory-a Synced + Healthy
Data/Dashboard VPC: 2026-05-22 destroy 완료. AEGIS-DynamoDB-FactoryStatus Streams 활성. backend state S3 bucket + RDS final snapshot 잔존.
```

## 갱신 규칙

- 이 파일은 새 내용을 아래에 계속 추가하지 않는다.
- Phase/Step이 넘어가면 Claude Code는 새 세션으로 시작한다. 같은 Step 안의 검증·소규모 수정만 기존 Claude Code 터미널을 이어서 사용한다.
- 새 Claude Code 세션은 작업 전 `docs/issues/SESSION_STATE.md`, `docs/AI_AGENT_HARNESS.md`, 해당 Step 기준 문서(`docs/planning/16_data_dashboard_vpc_workplan.md`)를 다시 읽고 시작한다.
- 세션 저장 요청이 오면 `마일스톤 기준 진행 현황`, `현재 큰 상태`, `지금까지 완료한 일`, `현재 AWS 상태`, `다음에 할 일`, `현재 세션 정리 내용`을 현재 기준으로 갱신한다.
- 오래된 완료 기록이 현재 판단에 불필요하면 요약으로 줄인다.
- 공식 체크 여부는 항상 `docs/issues/MASTER_CHECKLIST.md`와 각 M0~M7 이슈 문서를 우선한다.
