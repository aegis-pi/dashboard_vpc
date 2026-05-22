# data-processor

상태: source of truth
기준일: 2026-05-21

## 목적

AWS IoT Core에서 수신한 canonical JSON 메시지를 처리해 DynamoDB LATEST/HISTORY 갱신, Risk 계산, `pipeline_status` 계산, S3 processed 저장을 수행하는 Lambda data processor다.

## 실행 환경

- AWS Lambda (Python 3.12)
- IoT Core Rule Action: Lambda invocation
- 배포: zip 파일(`lambda_data_processor.zip`) → Terraform `infra/data-pipeline/`

## 파일 구조

```text
lambda_function.py       # Lambda handler 진입점
processor/
  envelope.py            # canonical JSON envelope 파싱 및 필수 필드 검증
  normalizer.py          # factory_state / infra_state 필드 정규화 (타입 변환, null 처리)
  risk.py                # Safety Score 계산 (높을수록 안전, safe/warning/danger)
  pipeline_status.py     # pipeline_status 계산 (infra_state 수신 지연 → healthy/warning/critical)
  dynamo.py              # DynamoDB LATEST 부분 갱신, HISTORY#STATE TTL 아이템 저장
  s3_writer.py           # S3 processed source별 결과와 state_snapshot 저장
tests/
  test_envelope.py
  test_risk.py
  test_pipeline_status.py
  test_dynamo.py
  test_s3_writer.py
```

## 처리 흐름

```text
IoT Core Rule (aegis/factory-a/+, factory-b/+, factory-c/+)
  -> Lambda handler (lambda_function.handler)
      -> envelope.parse()             # 필수 필드 검증, EnvelopeError → skipped
      -> normalizer.normalize_*()     # 타입 변환, null 처리
      -> risk.calculate()             # factory_state → safety score/level
      -> pipeline_status.calculate()  # infra_state → healthy/warning/critical
      -> dynamo.write_*_snapshot()    # LATEST 부분 갱신 + HISTORY#STATE TTL item
      -> s3_writer.write_*()          # S3 processed/{factory_id}/{dataset}/...
      -> s3_writer.write_state_snapshot()
```

## DynamoDB 저장 계약

| 아이템 | PK | SK |
| --- | --- | --- |
| LATEST | `FACTORY#{factory_id}` | `LATEST` |
| HISTORY#STATE | `FACTORY#{factory_id}` | `HISTORY#STATE#{updated_at}` |

- 테이블: `AEGIS-DynamoDB-FactoryStatus` (`infra/foundation` 영구 리소스)
- `LATEST`는 factory별 최신 전체 상태 1건이다.
- `factory_state` 수신 시 `LATEST.factory_state`, `LATEST.risk`, `LATEST.pipeline_status`만 부분 갱신한다.
- `infra_state` 수신 시 `LATEST.infra_state`, `LATEST.pipeline_status`만 부분 갱신한다.
- `HISTORY#STATE`는 갱신된 `LATEST`와 같은 구조를 복사하고 `ttl`만 추가한다.
- TTL 필드: `ttl` (48h, DynamoDB history에만 존재)

## S3 processed 저장 계약

```text
s3://aegis-bucket-data/processed/{factory_id}/factory_state/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{message_id}.json
s3://aegis-bucket-data/processed/{factory_id}/risk_score/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{message_id}.json
s3://aegis-bucket-data/processed/{factory_id}/infra_state/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{message_id}.json
s3://aegis-bucket-data/processed/{factory_id}/state_snapshot/yyyy={YYYY}/mm={MM}/dd={DD}/hh={HH}/{updated_at}.json
```

`state_snapshot`은 DynamoDB `HISTORY#STATE`와 같은 전체 상태 snapshot이지만, S3에는 DynamoDB TTL 정책 필드인 `ttl`을 저장하지 않는다.

## pipeline_status 판단 기준

| 상태 | 조건 |
| --- | --- |
| `healthy` | 마지막 `infra_state` 수신 후 60초 미만 |
| `warning` | 60초 이상 120초 미만 |
| `critical` | 120초 이상 |

## S3 processed 저장 경로

```text
s3://aegis-bucket-data/processed/{factory_id}/{source_type}/yyyy={YYYY}/mm={MM}/dd={DD}/{message_id}.json
```

## 환경변수 (Lambda Terraform이 주입)

| 변수 | 설명 |
| --- | --- |
| `DYNAMODB_TABLE_NAME` | DynamoDB 테이블 이름. 기본/공식 값: `AEGIS-DynamoDB-FactoryStatus` |
| `S3_BUCKET_NAME` | S3 버킷 이름 |
| `HISTORY_TTL_HOURS` | HISTORY 아이템 TTL (기본값: `48`) |

## 테스트 실행

```bash
cd apps/data-processor
python3 -m pytest tests/ -v
```

## Lambda zip 빌드

Terraform `infra/data-pipeline/lambda.tf`의 `archive_file` data source가 `apps/data-processor/`를 직접 zip으로 묶는다. 수동 zip 생성은 필요 없다.

## 배포

```bash
scripts/build/build-data-pipe.sh [MFA_OTP]
```

Terraform(`infra/data-pipeline/`)이 zip 변경을 감지해 Lambda를 재배포한다.
