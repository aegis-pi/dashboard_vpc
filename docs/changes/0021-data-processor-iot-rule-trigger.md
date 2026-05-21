# 0021. Lambda data processor IoT Rule 트리거: 신규 Rule 추가 방식 채택

상태: accepted
결정일: 2026-05-21
관련 범위: Phase 1 Step 4, apps/data-processor, infra/data-dashboard, M4 데이터 플레인 합류 지점

## 기존 계획

`docs/AI_AGENT_HARNESS.md` § 5.4 Step 4는 기존 Rule `AEGIS_IoTRule_factory_a_raw_s3` 확장(옵션 A) 또는 신규 IoT Rule 추가(옵션 B) 중 하나를 ADR로 결정하도록 명시했다.

## 결정: 옵션 B — 신규 IoT Rule 추가

기존 Rule `AEGIS_IoTRule_factory_a_raw_s3`는 그대로 두고, 워크스트림 B(`infra/data-dashboard/`) 내 신규 IoT Rule 2개를 추가한다.

```text
KJW_AEGIS_Data_IoTRule_factory_state_processor  <- aegis/+/factory_state
KJW_AEGIS_Data_IoTRule_infra_state_processor   <- aegis/+/infra_state
```

action: Lambda data processor (`KJW-AEGIS-Data-Lambda-data-processor`) invoke

## 결정 이유

- 기존 Rule `AEGIS_IoTRule_factory_a_raw_s3`는 워크스트림 A(`infra/foundation/`) 소유다. 본 환경에서 해당 파일을 수정하면 state drift가 발생한다.
- AWS IoT SQL의 `FROM` 절은 단일 topic pattern만 지원하므로 `factory_state`와 `infra_state` 두 topic을 한 Rule로 처리하려면 Rule 2개가 필요하다.
- 신규 Rule 방식은 기존 S3 raw 적재 경로를 전혀 건드리지 않아 워크스트림 A 회귀 위험이 없다.
- Lambda는 DynamoDB/S3 공개 엔드포인트를 사용하므로 VPC attach 불필요.

## 구현 요약

### Lambda

| 항목 | 값 |
| --- | --- |
| 함수 이름 | `KJW-AEGIS-Data-Lambda-data-processor` |
| Runtime | Python 3.12 |
| Handler | `lambda_function.handler` |
| Source | `apps/data-processor/` |
| Timeout | 30초 |
| Memory | 256 MB |
| DYNAMODB_TABLE_NAME | `aegis-factory-status` |
| S3_BUCKET_NAME | `aegis-bucket-data` |
| HISTORY_TTL_HOURS | `48` |

### Lambda IAM Role

- 이름: `KJW-AEGIS-Data-IAMRole-Lambda-data-processor`
- Managed: `AWSLambdaBasicExecutionRole`
- Inline:
  - `dynamodb:GetItem/PutItem/UpdateItem` on `aegis-factory-status`
  - `s3:PutObject` on `aegis-bucket-data/processed/*`

### IoT Rules

| Rule 이름 | SQL | Action |
| --- | --- | --- |
| `KJW_AEGIS_Data_IoTRule_factory_state_processor` | `SELECT * FROM 'aegis/+/factory_state'` | Lambda invoke |
| `KJW_AEGIS_Data_IoTRule_infra_state_processor` | `SELECT * FROM 'aegis/+/infra_state'` | Lambda invoke |

### DynamoDB/S3 계약

- DDB: `pk = FACTORY#{factory_id}`, `sk = LATEST` / `sk = HISTORY#STATE#{ISO8601}`
- S3: `processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json`
  - dataset: `factory_state`, `risk_score`, `infra_state`, `state_snapshot`

## 검증 결과 (2026-05-21)

```text
시각: 2026-05-21T08:25~08:27 UTC

terraform apply: 8 added, 0 changed, 0 destroyed
  - aws_iam_role / aws_iam_role_policy / aws_iam_role_policy_attachment × 3
  - aws_lambda_function × 1
  - aws_iot_topic_rule × 2
  - aws_lambda_permission × 2

Direct invoke — factory_state:
  응답: {"status": "ok", "message_id": "factory-a:factory_state:worker2:2026-05-21T10:00:00Z"}
  DDB LATEST: pk=FACTORY#factory-a, sk=LATEST, risk_score=90.48, risk_level=safe
  DDB HISTORY: sk=HISTORY#STATE#2026-05-21T08:25:57.430Z (1건)
  S3 processed/factory-a/factory_state/... 생성
  S3 processed/factory-a/risk_score/...   생성
  S3 processed/factory-a/state_snapshot/... 생성

Direct invoke — infra_state:
  응답: {"status": "ok", "message_id": "factory-a:infra_state:cluster:2026-05-21T10:00:20Z"}
  DDB LATEST: pipeline_status=normal, last_infra_state_at=2026-05-21T10:00:20Z
  S3 processed/factory-a/infra_state/... 생성
  S3 processed/factory-a/state_snapshot/... 갱신

IoT Rule 경유 — factory_state:
  aws iot-data publish → topic 'aegis/factory-a/factory_state'
  DDB LATEST updated_at: 2026-05-21T08:26:57.841Z (갱신 확인)
  Lambda CloudWatch Logs: INFO factory_state done (정상 처리)

기존 AEGIS_IoTRule_factory_a_raw_s3: 워크스트림 A 소유 IAM으로 read 접근 불가 — 변경 없음 확인
aegis-bucket-data bucket-level: 변경 없음 (prefix IAM only)
```

## 영향

- `infra/data-dashboard/versions.tf`: `hashicorp/archive ~> 2.4` provider 추가
- `infra/data-dashboard/iam_data_processor.tf` 신설
- `infra/data-dashboard/lambda_data_processor.tf` 신설
- `infra/data-dashboard/iot_rule.tf` 신설
- `infra/data-dashboard/outputs.tf`: Step 4 output 3건 추가
- Lambda 비용: 월 ~$0.5 (후속 통합 후 상시 가동 기준 ~ $1; 데모 운영 기준 무시 가능 수준)

## 업데이트 필요한 문서

- `docs/changes/README.md` — 본 ADR 목록 추가
- `docs/issues/SESSION_STATE.md` — Step 4 완료로 갱신
- `docs/ops/15_aws_cost_baseline.md` — Lambda 비용 반영
- `docs/planning/16_data_dashboard_vpc_workplan.md` — Step 4 완료 표기
- `docs/AI_AGENT_HARNESS.md` — Needs Decision 항목 닫기
