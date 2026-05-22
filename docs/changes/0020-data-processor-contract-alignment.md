# 0020. data-processor 계약 정렬: 팀원 코드 수용 + S3 경로 스펙 보정

상태: accepted
결정일: 2026-05-21
관련 범위: M4 데이터 플레인, apps/data-processor, DynamoDB aegis-factory-status, S3 processed prefix, 워크스트림 B

후속 보정: ADR 0022에서 공식 hot store를 기존 실데이터 table `AEGIS-DynamoDB-FactoryStatus`로 변경했다. 본 문서의 `aegis-factory-status` 내용은 Step 3~5 당시의 중간 결정으로만 남긴다.

## 기존 계획

- `apps/lambda-data-processor` 또는 별도 디렉터리로 Lambda 코드를 작성 예정
- DynamoDB `aegis-factory-status` KeySchema: PK `factory_id`, SK `sort_key` (Step 3에서 적용된 기존 값)
- S3 processed 경로 형식: `processed/{factory_id}/{dataset}/yyyy=YYYY/...` (팀원 코드 원본)
- Dataset 이름: `factory_state`, `risk_score`, `infra_state`, `state_snapshot` (언더스코어)

## 변경된 실제 기준

### 1. apps/data-processor 동기화

팀원 원격 구현(`https://github.com/aegis-pi/Aegis-pi/tree/main/apps/data-processor`, main branch 기준)을 로컬 `apps/data-processor`로 가져왔다.

동기화된 파일:

```
apps/data-processor/
  lambda_function.py
  requirements.txt
  processor/__init__.py
  processor/dynamo.py
  processor/envelope.py
  processor/normalizer.py
  processor/pipeline_status.py
  processor/risk.py
  processor/s3_writer.py
  tests/__init__.py
  tests/test_dynamo.py
  tests/test_envelope.py
  tests/test_pipeline_status.py
  tests/test_risk.py
  tests/test_s3_writer.py
```

### 2. DynamoDB KeySchema: pk/sk로 변경

`infra/data-dashboard/dynamodb.tf`의 `aegis-factory-status` 테이블 KeySchema를 팀원 코드 기준으로 변경했다.

```
기존: hash_key = "factory_id", range_key = "sort_key"
변경: hash_key = "pk",         range_key = "sk"
```

팀원 `dynamo.py`는 이미 `pk = "FACTORY#{factory_id}"`, `sk = "LATEST"` / `sk = "HISTORY#STATE#{ISO8601}"` 형태를 사용한다. HISTORY TTL 기본값은 48시간(`HISTORY_TTL_HOURS=48`).

`aegis-factory-status` 테이블 replacement(삭제 후 재생성)를 유발했다. 운영 데이터가 없는 전제에서 apply했다.

### 3. S3 processed 경로: 팀원 코드/실제 S3 구조를 공식 기준으로 채택

`processor/s3_writer.py`의 `_key` 함수와 `docs/specs/data_storage_pipeline.md` 경로 표기를 팀원 코드 원본 및 실제 운영 S3 구조 기준으로 맞췄다.

**공식 기준 (현재 적용)**

```
processed/{factory_id}/{dataset}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.json
```

dataset 이름은 underscore 형식:

| 함수 | dataset 값 |
| --- | --- |
| `write_factory_state` | `factory_state` |
| `write_risk_score` | `risk_score` |
| `write_infra_state` | `infra_state` |
| `write_state_snapshot` | `state_snapshot` |

**취소된 내용**: ADR 0020 최초 작성 당시에는 스펙(`processed/{dataset}/{factory_id}/`, 하이픈 dataset) 기준으로 코드를 보정한다고 기록했으나, 이는 잘못된 방향이었다. 실제 운영 데이터의 S3 경로(`processed/{factory_id}/{dataset}/`)와 팀원 원본 코드가 일치하므로, 코드를 그대로 두고 스펙을 코드에 맞춰 정정했다.

`state_snapshot`은 공식 스펙에 명시되지 않은 추가 경로다. Lambda가 HISTORY 항목의 상태 요약을 S3에 저장하는 용도로 유지한다.

## 변경 이유

- 팀원 코드와 로컬 DDB KeySchema 불일치로 Lambda 배포 시 즉시 에러 발생 예상
- 실제 운영 S3 데이터(`processed/{factory_id}/{dataset}/`)와 팀원 코드 원본이 일치. 스펙 표기만 반대 순서(`{dataset}/{factory_id}`)로 잘못 작성되어 있었으므로 스펙을 실제 기준으로 정정
- Dataset 이름: 팀원 코드 원본(`factory_state`, `risk_score`, `infra_state`, `state_snapshot`)이 실제 운영 구조와 일치. 스펙도 underscore 형식으로 정정
- HISTORY TTL: Step 3 구현 당시 기준이었던 24시간은 팀원 코드 기본값인 48시간으로 정렬

## 영향

### IAM/S3

Lambda IAM role이 `processed/*` prefix에 `s3:PutObject` 권한을 갖도록 Step 4~5에서 설정해야 한다.

S3 경로 예시:

```
processed/factory-a/factory_state/yyyy=2026/mm=05/dd=21/hh=12/{message_id}.json
processed/factory-a/risk_score/yyyy=2026/mm=05/dd=21/hh=12/{message_id}.json
processed/factory-a/infra_state/yyyy=2026/mm=05/dd=21/hh=12/{message_id}.json
processed/factory-a/state_snapshot/yyyy=2026/mm=05/dd=21/hh=10/{updated_at}.json
```

### DynamoDB

`aegis-factory-status` 테이블이 재생성되었다. Stream ARN이 변경되었으므로 DDB Streams 기반 notifier Lambda(Step 5)는 새 Stream ARN을 참조해야 한다.

후속 ADR 0022에 따라 이 table은 deprecated 되었고, 공식 LATEST/HISTORY hot store는 `AEGIS-DynamoDB-FactoryStatus`다.

### 테스트

`tests/test_s3_writer.py`의 경로 기대값을 새 형식으로 수정했다. 20개 테스트 모두 통과.

## 업데이트 필요한 문서

- `docs/issues/SESSION_STATE.md` — Step 4 사전 정렬 완료, DDB pk/sk, TTL 48h, apps/data-processor 위치 명시
- `docs/planning/16_data_dashboard_vpc_workplan.md` — data-processor 위치 및 DDB 계약 정정
- `docs/AI_AGENT_HARNESS.md` — data-processor 위치, DDB pk/sk, S3 경로 기준 정정
- `docs/changes/README.md` — 본 ADR 목록 추가

## 검증

```text
2026-05-21 기준
- terraform apply: 1 added, 0 changed, 1 destroyed
- terraform plan: No changes
- aws dynamodb describe-table: KeySchema pk(HASH)/sk(RANGE), StreamViewType NEW_AND_OLD_IMAGES
- aws dynamodb describe-time-to-live: TimeToLiveStatus=ENABLED, AttributeName=ttl
- python -m pytest: 20 passed in 0.03s
```
