ID:        0027
제목:      cloud-infra-metrics-collector
상태:      accepted
결정일:    2026-06-01
영향 범위: M4/M6 데이터 플레인, Dashboard Backend/Frontend, DynamoDB `AEGIS-DynamoDB-FactoryStatus`, SQS DLQ, RDS/Redis, EKS/ArgoCD(워크스트림 A 합류 지점)

## 기존 계획

Dashboard는 공장 상태(`FACTORY#{id}` LATEST/HISTORY)만 보여줬다.

Cloud infra(Backend/API, 데이터 파이프라인 Lambda, DynamoDB/S3, EKS, ArgoCD 등)의 상태를 보여주는 표준 경로는 없었다.

초기 검토안은 CloudWatch Container Insights를 상시 켜서 EKS node/pod/container metric을 전부 수집하는 방식이었다(`metrics-server` + `amazon-cloudwatch-observability` 적용·동작 확인까지 진행).

## 변경된 실제 기준

CloudWatch Container Insights 상시 수집을 채택하지 않는다.

대신 **Dashboard가 필요한 metric만 주기적으로 추출해 read model로 저장하는 collector 방식**을 채택한다.

- `CloudInfraFastCollector` (EventBridge 1분): ECS/ALB/Lambda/DynamoDB/Redis/RDS/SQS DLQ/CloudFront/Scheduler/factory freshness
- `CloudInfraSlowCollector` (EventBridge 5분): EKS cluster/nodegroup/ASG, Kubernetes node/pod/top, ArgoCD sync/health, S3 object freshness
- 저장: 기존 `AEGIS-DynamoDB-FactoryStatus`에 `pk=CLOUD#infra` / `sk=LATEST` + `sk=HISTORY#FAST#…` / `HISTORY#SLOW#…`(TTL) + S3 `processed/cloud_infra/` full snapshot
- `LATEST`는 fast/slow가 서로 다른 필드만 갱신(상호 덮어쓰기 방지)
- 계약(필드 보장 / `errors[]` / `reasons[]` / staleness / HISTORY reduced 스키마)은 `docs/planning/29_cloud_infra_metrics_pipeline_plan.md`가 source of truth

설계/스키마 상세는 `docs/planning/29`. 본 ADR은 결정과 합류 지점 영향만 기록한다.

2026-06-04 구현 상태:

- `apps/cloud-infra-collector/` 소스를 저장소에 반영했다.
- `AEGIS-Lambda-CloudInfraFastCollector`/`AEGIS-Lambda-CloudInfraSlowCollector`는 기존 Lambda를 삭제하지 않고 코드 업데이트로 배포했다.
- FastCollector는 Redis/RDS/CloudFront/DLQ와 section `reasons[]`/`errors[]`를 `CLOUD#infra`/`LATEST.fast`에 기록한다.
- FastCollector IAM role에는 ElastiCache/RDS read 권한을 추가했다.
- DDB `LATEST`에서 Redis/RDS/CloudFront/DLQ 필드가 저장되는 것을 확인했다.
- 남은 known issue: SlowCollector의 Kubernetes API 접근이 401로 실패해 `overall_status=unknown`이 될 수 있다. 이는 EKS/Kubernetes 권한 합류 지점이며 Redis/RDS 수집과 별도다.

## 변경 이유

- CloudWatch Container Insights 상시 수집은 2-node Hub 기준 월 ~$65~75. MVP/개발 단계에 과하다.
- collector 방식은 월 ~$1~3(배포 시 factory-a 단독 사용량 ~$0.3~1.0 추가, 고정 시간 비용 없음).
- Dashboard는 원본 metric 전체가 아니라 요약 read model만 필요하다. 원본 history는 CloudWatch/각 서비스 API 책임으로 둔다.
- Backend가 CloudWatch/EKS/S3를 직접 반복 조회하지 않고 DynamoDB GetItem/Query 한두 번으로 화면을 구성할 수 있다.

## 영향

- **DynamoDB `AEGIS-DynamoDB-FactoryStatus`는 워크스트림 합류 지점(0009/0022)**이다. 기존 factory item과 별도 `pk=CLOUD#infra`만 추가하므로 factory 데이터 스키마는 건드리지 않는다.
- **EKS/ArgoCD read 접근은 워크스트림 A 자산**(`AEGIS-EKS`, ArgoCD)이다. SlowCollector가 Hub EKS API / Kubernetes Metrics API / ArgoCD CRD를 read하므로, 접근 경로 결정(아래 Open) 시 워크스트림 A와 영향이 겹친다. 워크스트림 A 금지 영역(infra/hub, charts/aegis-hub 등)은 수정하지 않는다.
- Backend는 LATEST를 읽는 시점에 `fast_updated_at`/`slow_updated_at`로 staleness를 판정한다(죽은 collector는 스스로 stale을 기록할 수 없음). 이는 사실상 "LATEST 원본 그대로 노출"이 아니라 backend 최소 변환을 의미한다.
- Frontend는 sidebar에 Cloud infra 항목을 추가해 공장 화면과 분리 표시한다(Backend/Frontend = 본 환경 담당).
- 비용: `docs/ops/15_aws_cost_baseline.md`에 active 상태로 반영(v3.2). 고정 비용 변화는 없고 사용량 기반 비용만 발생한다.

## 미결정 / 후속

1. SlowCollector의 Kubernetes/ArgoCD 접근 권한. 현재 Lambda가 Kubernetes API 401을 받는다.
2. `HISTORY#FAST` TTL 6h vs 12h.
3. S3 `processed/cloud_infra` snapshot lifecycle 30일 삭제 vs Glacier 전환.
4. Cloud infra dashboard API 응답 모델 — staleness 판정은 backend 최소 변환으로 유지한다.

## 업데이트 필요한 문서

- `docs/planning/29_cloud_infra_metrics_pipeline_plan.md` (source of truth, 이미 반영)
- `docs/ops/15_aws_cost_baseline.md` (v3.2 반영 완료)
- `docs/changes/README.md` (목록 갱신 완료)
- `docs/issues/SESSION_STATE.md`

## 검증

본 ADR 작성 시점 read-only 확인(근거):

- `apps/dashboard-backend` 의존성: Redis(`services/redis_client.py`, `routers/ws.py`), RDS(`db/session.py`), DynamoDB(`services/ddb.py`), S3(`services/s3.py`) → Redis/RDS/DLQ를 수집 대상에 포함한 근거
- `infra/` 배포 리소스: `aws_db_instance`(RDS), `aws_elasticache_replication_group`(Redis), `aws_sqs_queue`(notifier DLQ), `aws_cloudfront_distribution`, `aws_dynamodb_table`, `aws_lambda_function` 존재 확인

구현 단계 DoD는 `docs/planning/29` § 구현 순서(Phase 1~4)를 따른다.
