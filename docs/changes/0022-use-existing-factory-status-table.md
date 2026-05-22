ID:        0022
제목:      use-existing-factory-status-table
상태:      accepted
결정일:    2026-05-21
영향 범위: Phase 1 Step 3~6, M4 데이터 플레인, DynamoDB, Lambda data processor, Lambda notifier, Dashboard Backend

## 기존 계획

Phase 1 Step 3에서 1번 Data/Dashboard VPC Terraform root가 신규 DynamoDB table `aegis-factory-status`를 생성했다.

Step 4/5 구현은 이 신규 table을 기준으로 진행됐다.

- Lambda data processor env: `DYNAMODB_TABLE_NAME=aegis-factory-status`
- Lambda notifier event source mapping: `aegis-factory-status` Streams
- 문서 기준: Dashboard Backend가 `aegis-factory-status` LATEST/HISTORY를 조회

## 변경된 실제 기준

Dashboard LATEST/HISTORY의 공식 hot store는 기존 실데이터 table `AEGIS-DynamoDB-FactoryStatus`로 정렬한다.

`aegis-factory-status`는 Step 3~5 중복 생성 table로 보고 신규 사용을 중단한다.

## 변경 이유

실제 dummy/sensor 데이터는 `AEGIS-DynamoDB-FactoryStatus`에 계속 적재되고 있다.

2026-05-21 read-only 확인 결과:

- `AEGIS-DynamoDB-FactoryStatus`: `pk`/`sk` schema, item count 10,380, `factory-a` LATEST 및 HISTORY 데이터 존재
- `aegis-factory-status`: `pk`/`sk` schema, item count 4, Step 4/5 테스트 데이터만 존재

이 상태에서 Step 6 Dashboard Backend를 `aegis-factory-status` 기준으로 구현하면 실제 공장 상태가 아닌 테스트 데이터만 조회하게 된다.

## 영향

- `infra/data-dashboard/dynamodb.tf`는 `aegis-factory-status` 신규 table 생성 대신 기존 `AEGIS-DynamoDB-FactoryStatus` 참조로 전환해야 한다.
- Lambda data processor는 `AEGIS-DynamoDB-FactoryStatus`에 write해야 한다.
- Lambda notifier는 `AEGIS-DynamoDB-FactoryStatus` Streams를 event source로 사용해야 한다.
- `AEGIS-DynamoDB-FactoryStatus`는 현재 Streams가 비활성이다. Step 5 WebSocket notifier를 유지하려면 `NEW_AND_OLD_IMAGES` Streams 활성화가 필요하다.
- `aegis-factory-status` 삭제는 Terraform 참조 제거와 검증 후 진행한다. 2026-05-21 사용자 삭제 승인을 받았으므로, cleanup plan이 해당 table 1개 destroy만 포함하는 경우에만 apply한다.
- `AEGIS-DynamoDB-FactoryStatus`는 워크스트림 합류 지점이므로 변경은 문서화하고 워크스트림 A 금지 영역을 수정하지 않는다.

## 업데이트 필요한 문서

- `docs/issues/SESSION_STATE.md`
- `docs/planning/16_data_dashboard_vpc_workplan.md`
- `docs/specs/data_storage_pipeline.md`
- `docs/ops/15_aws_cost_baseline.md`
- `docs/AI_AGENT_HARNESS.md`

## 검증

다음 read-only 확인을 기준으로 결정했다.

- `aws dynamodb describe-table --table-name AEGIS-DynamoDB-FactoryStatus`
- `aws dynamodb describe-table --table-name aegis-factory-status`
- `aws dynamodb scan --table-name AEGIS-DynamoDB-FactoryStatus --select COUNT`
- `aws dynamodb scan --table-name aegis-factory-status --select COUNT`
- `aws lambda get-function-configuration --function-name KJW-AEGIS-Data-Lambda-data-processor`

후속 Terraform 정렬 작업의 DoD:

- `terraform plan`에서 `aegis-factory-status` 사용 제거 확인
- `AEGIS-DynamoDB-FactoryStatus` Streams 활성화 확인
- Lambda data processor env가 `AEGIS-DynamoDB-FactoryStatus`를 가리키는지 확인
- notifier event source mapping이 `AEGIS-DynamoDB-FactoryStatus` Stream을 가리키는지 확인
- 기존 실데이터 LATEST/HISTORY 조회가 Dashboard Backend Step 6 입력으로 사용 가능한지 확인

## Cleanup 완료 (2026-05-21)

- `dynamodb.tf`에서 `aws_dynamodb_table.factory_status` resource 블록 제거 (prevent_destroy 포함)
- `apps/data-processor/processor/dynamo.py` 폴백 기본값 수정 (`aegis-factory-status` → `AEGIS-DynamoDB-FactoryStatus`)
- `terraform apply`: 0 added, 1 changed (Lambda code hash), 1 destroyed (`aegis-factory-status`)
- `terraform plan` (post-apply): No changes
- `aws dynamodb describe-table --table-name aegis-factory-status` → ResourceNotFoundException 확인
- `aws dynamodb describe-table --table-name AEGIS-DynamoDB-FactoryStatus` → ACTIVE, StreamViewType NEW_AND_OLD_IMAGES 확인
- Lambda data processor `DYNAMODB_TABLE_NAME = AEGIS-DynamoDB-FactoryStatus` 확인
- notifier ESM source = `AEGIS-DynamoDB-FactoryStatus` stream 확인
