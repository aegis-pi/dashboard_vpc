# 0018. IoT Topic Rule 확장: `factory-a` 단일 구독 → `factory-c` 추가 구독

상태: accepted
결정일: 2026-05-19
관련 범위: M4 데이터 플레인, M5 멀티 공장 확장, 워크스트림 A↔B 합류 지점, factory-c testbed

## 기존 계획

`infra/foundation/iot_rule.tf` 는 단일 토픽 패턴 `aegis/${var.iot_factory_id}/+` 만 구독한다. `var.iot_factory_id` 기본값은 `factory-a` 이며 현재 운영 환경도 동일하다.

`docs/specs/iot_data_format.md` 는 `aegis/factory-c/factory_state`, `aegis/factory-c/infra_state` 를 후속 사용 토픽으로 명시하지만, 해당 토픽을 S3 raw 로 적재할 IoT Rule 은 아직 만들지 않은 상태다.

`docs/changes/0009-s3-bucket-shared-with-prefix.md` 가 `raw/{factory_id}/...` 단일 bucket + prefix 분리 패턴을 확정했고, 본 ADR 은 그 prefix 가 실제로 `factory-c` 메시지로 채워지도록 IoT 측 라우팅을 추가한다.

## 변경된 실제 기준

### 운영 기준

`factory-c` 메시지를 S3 raw 에 적재하기 위해 별도 IoT Topic Rule 한 개와 IAM Role 한 개를 추가한다.

```text
IoT Rule:   AEGIS_IoTRule_factory_c_raw_s3
SQL:        SELECT *, topic(3) AS source_type, timestamp() AS received_at FROM 'aegis/factory-c/+'
S3 key:     raw/factory-c/${topic(3)}/yyyy=${parse_time("yyyy", timestamp(), "UTC")}/mm=${parse_time("MM", timestamp(), "UTC")}/dd=${parse_time("dd", timestamp(), "UTC")}/${get_or_default(message_id, newuuid())}.json
IAM Role:   AEGIS-IAMRole-IoTRule-S3-factory-c
IAM Policy: s3:PutObject on arn:aws:s3:::aegis-bucket-data/raw/factory-c/*
```

SQL · S3 key 패턴 · IAM scope 는 기존 `AEGIS_IoTRule_factory_a_raw_s3` 와 1:1 대응한다.

### 적용 경로

- **단기 (testbed 검증)**: AWS CLI 로 `create-topic-rule` + `create-role`/`put-role-policy` 직접 적용. 절차는 `docs/ops/19_factory_c_windows_virtualbox_k3s.md` Step 10 에 명시.
- **중기 (운영 영구화)**: `infra/foundation/iot_rule.tf` 와 `variables.tf`/`locals.tf` 를 `for_each = toset(var.iot_factory_ids)` 패턴으로 리팩터링 후 동일 리소스를 Terraform-managed 로 흡수. import 절차도 ADR follow-up 으로 남긴다.

## 변경 이유

### `factory-c` testbed 가 데이터 평면을 끝까지 검증할 수 있어야 함

- factory-c 는 단순한 클러스터 확장이 아니라 멀티 공장 식별 · 배포 · **데이터 분리** · Dashboard 표시 검증이 목적이다 (`docs/ops/19_factory_c_windows_virtualbox_k3s.md` § Factory C 확정 구성).
- IoT Rule 이 `factory-a` 전용이면 factory-c 메시지는 IoT Core 까지만 도달하고 S3 부터 막혀 워크스트림 B (Lambda data processor, DynamoDB, Dashboard) 의 multi-factory 검증을 시작할 수 없다.

### 기존 `factory-a` Rule 을 손대지 않음

- 현재 factory-a 가 운영 데이터를 적재 중인 Rule (`AEGIS_IoTRule_factory_a_raw_s3`) 을 수정하면 회귀 위험이 크다.
- 별도 Rule 추가는 factory-a 측 SQL/IAM 에 영향이 없어 워크스트림 A 운영 안정성을 해치지 않는다.

### `aegis/+/+` wildcard 단일 Rule 을 쓰지 않은 이유

- 단일 wildcard Rule 은 향후 factory 가 늘어날 때 코드/IAM 한 곳에서 관리할 수 있는 장점이 있다.
- 그러나 (1) 현재 IAM Role 의 S3 PutObject scope 가 `raw/${var.iot_factory_id}/*` 로 좁혀져 있어 wildcard 로 바꾸면 권한도 같이 넓혀야 하고, (2) factory-a 운영 Rule 을 직접 수정해야 해 회귀 위험이 크다.
- 따라서 본 ADR 은 **factory 별 1:1 Rule** 패턴을 유지하고, 운영 영구화 시점에 `for_each` 로 리팩터링한다.

## 영향

### IAM

- 신규 IAM Role `AEGIS-IAMRole-IoTRule-S3-factory-c` 가 추가된다.
- 신규 inline policy `AEGIS-IAMPolicy-IoTRule-S3-factory-c` 의 `Resource` 는 `arn:aws:s3:::aegis-bucket-data/raw/factory-c/*` 로 제한되어 factory-a prefix 와 격리된다.

### S3

- `aegis-bucket-data/raw/factory-c/factory_state/...` 및 `.../infra_state/...` prefix 에 객체가 생성되기 시작한다.
- 단일 bucket + prefix 패턴 (`docs/changes/0009`) 을 그대로 유지하므로 bucket-level 정책/lifecycle/Inventory 영향 없음.

### Workstream A 와의 합류 지점

- **bucket 자체**, **bucket policy**, **factory-a Rule** 은 워크스트림 A 자산. 본 ADR 은 별도 Rule/Role 추가만 한다.
- Terraform 영구 반영 시 `infra/foundation/` 디렉터리에 들어가므로 그 시점은 워크스트림 A 와 PR/타이밍 합의 필요.

### Workstream B 영향

- factory-c S3 적재가 켜지면 후속 Lambda data processor (워크스트림 B) 가 `factory-a` 외 `factory-c` partition 도 읽도록 코드/IAM 을 확장해야 한다.
- 본 ADR 은 IoT→S3 라우팅만 다루며, Lambda/DynamoDB/Dashboard 확장은 워크스트림 B 의 별도 작업으로 추적.

### 비용

- IoT Rule 당 비용은 메시지당 과금 (1M 메시지당 ~$0.15). factory-c 의 `factory_state` 3초 · `infra_state` 20초 주기를 24시간 가정 시 약 33,300 msg/day → 월간 ~1M msg → IoT Message + Rule 비용 합산 약 $0.30 수준. 비용 baseline 갱신 필요.
- S3 PUT 요청 + 저장 비용은 `docs/ops/15_aws_cost_baseline.md` 의 raw 항목 패턴을 따른다 (factory 1 개분 추가).

### 운영 회귀 위험

- 별도 Rule 이라 factory-a 측 SQL/IAM 변경 없음 → factory-a 데이터 평면 회귀 가능성 없음.
- AWS CLI 임시 적용은 Terraform state 외부에 자원이 생기므로, Terraform 영구화 시 `terraform import` 또는 manual recreate 필요. follow-up 추적 항목.

## 업데이트 필요한 문서

- `docs/ops/19_factory_c_windows_virtualbox_k3s.md` (Step 10 IoT Rule 확장 + S3 적재 검증 추가, 본 ADR 과 동시에 갱신)
- `docs/ops/15_aws_cost_baseline.md` (factory-c IoT 메시지 + S3 PUT 추가 항목)
- `docs/specs/data_storage_pipeline.md` (`raw/{factory_id}` 가 factory-a 외 factory-c 도 채워지기 시작함을 명시)
- `docs/issues/MASTER_CHECKLIST.md` (M5 factory-c 데이터 평면 항목 진행 반영)
- 후속: `infra/foundation/iot_rule.tf` Terraform `for_each` 리팩터링 follow-up ADR

## 검증

- AWS CLI 적용 직후 `aws iot get-topic-rule --rule-name AEGIS_IoTRule_factory_c_raw_s3` 가 SQL/actions 를 반환
- factory-c VM 에서 `mosquitto_pub` 또는 `aegis-dummy-publisher.service` publish 후 약 20초 내 `aws s3 ls s3://aegis-bucket-data/raw/factory-c/factory_state/` 결과 1개 이상
- 동일 시간대 factory-a 적재가 회귀 없이 계속 이루어지는지 `aws s3 ls s3://aegis-bucket-data/raw/factory-a/factory_state/ --recursive | wc -l` 로 비교
- 적재된 객체 1건 다운로드 후 envelope 의 `factory_id == "factory-c"`, `environment_type == "vm-windows"`, `input_module_type == "dummy"` 확인
- 1분 누적 시 factory_state 객체 수 ≈ 20, infra_state 객체 수 ≈ 3 비율 유지 (`factory_state` 3s · `infra_state` 20s 주기 기반)
