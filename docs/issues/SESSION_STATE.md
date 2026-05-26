# Session State

상태: working tracker
기준일: 2026-05-26
수정 이력:
  - 2026-05-26  Step 9 S3+CloudFront 배포 CI/CD 구현 완료 반영. GitHub Actions dashboard-web.yml, IAM OIDC web deploy role(ADR 0023), Terraform plan 2 add 0 change 확인.
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
| M3 | Issue 2 - 배포/ECR 저장소 구성 및 이미지 태그 전략 | 진행 중 | `docs/issues/M3_deploy-pipeline.md` |
| M3 | Issue 4 - 배포/ArgoCD ApplicationSet 구성 | 완료 | `docs/issues/M3_deploy-pipeline.md` |

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
- `docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio`
- `docs/ops/15_aws_cost_baseline.md` (Phase 1 비용)
- `docs/report/03_요구사항정의서.md` (SRS v1.7)
- `docs/product/02_requirements_definition.md` (요구사항 추적 기준)

과거 Step 0~3 스냅샷 (보존용, 현재 다음 작업은 Step 9 end-to-end 검증):

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
현재 단계: Phase 1 Step 9 S3+CloudFront 배포 CI/CD 구현/IAM apply/SPA 배포 완료. GitHub Actions secret/variables는 repo 수준 등록 완료. 다음: Step 9 end-to-end 통합 검증
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
Data/Dashboard VPC 핵심 리소스: 2026-05-22 destroy 완료(73 destroyed). Terraform state empty. VPC/subnets/NAT GW/ALB/CloudFront/Cognito/S3-web/ACM/Route53/RDS/Redis/Lambda/SQS/aegis-daily-report 삭제 완료
공식 DynamoDB hot store: AEGIS-DynamoDB-FactoryStatus (Streams NEW_AND_OLD_IMAGES 활성, Lambda data processor write, notifier ESM 연결 완료)
중복 DynamoDB table: aegis-factory-status 삭제 완료 (2026-05-21, ADR 0022 cleanup)
Data/Dashboard 잔여 리소스: kjw-aegis-terraform-state S3 backend bucket, RDS final snapshot kjw-aegis-data-pg-final
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
  2. GitHub Actions Node 24 전환 경고/호환성 추적
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
7176b6a refactor(frontend): consolidate prototype under frontend
97dab97 docs(architecture): add dashboard diagram assets
01a7609 docs(changes): align websocket ADR with factory status table
14e853a feat(dashboard-backend): add FastAPI service skeleton
63cbc9b docs(data-dashboard): document lifecycle workflow
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
