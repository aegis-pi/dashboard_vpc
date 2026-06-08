# 통합 전 위험 경고

상태: draft
기준일: 2026-06-08
대상 비교:
- 로컬 기준: `main` (`dashboard_vpc`, HEAD `0a567cd`)
- 팀 기준: `https://github.com/aegis-pi/Aegis-pi` `main` (`team/main`, HEAD `a9fb5ab`)
- 공통 조상: `7c817e61eba1fbac49a5dd727412b8855c8e9b01`

## 요약

현재 두 저장소는 단순한 기능 추가 수준이 아니라 운영 경계와 디렉터리 구조가 갈라진 상태다. 자동 `git merge` 또는 한쪽 브랜치의 대량 `checkout`으로 통합하면 Dashboard 운영 코드, Terraform state 경계, 문서상 source of truth가 손상될 가능성이 높다.

비교 결과:
- 로컬 전용 커밋: 239개
- 팀 전용 커밋: 124개
- `main..team/main` 파일 변화: 668개 파일, 약 37,994 insertions / 45,140 deletions
- 양쪽 모두 수정한 파일: `apps/data-processor/**`, `docs/issues/**`, `docs/specs/**`, `docs/ops/15_aws_cost_baseline.md`, `scripts/build/README.md`, `scripts/destroy/README.md` 등

## 최상위 위험

| 위험 | 심각도 | 영향 | 권장 처리 |
| --- | --- | --- | --- |
| 팀 브랜치가 `apps/dashboard-backend/**`, `apps/dashboard-web/**`, `infra/data-dashboard*`를 삭제한 상태 | Critical | 운영 Dashboard Backend/Web/ECS/RDS/Redis/CloudFront/Cognito 관리 코드 소실 | 해당 경로는 로컬 기준 보존. 팀 변경을 이 경로에 자동 적용하지 않는다. |
| 팀 브랜치가 `infra/data-pipeline/**`, `infra/reporting/**`를 신규 source of truth로 추가 | High | 기존 로컬 `infra/data-dashboard/**`의 Lambda/DataProcessor/CloudInfra 역할과 중복 또는 생명주기 충돌 | Data/Dashboard VPC와 Data Pipeline root를 별도 Terraform root로 유지할지 ADR로 확정 후 수동 통합 |
| DynamoDB 소유권 충돌 | High | 로컬은 Dashboard permanent/data-dashboard 흐름에서 `AEGIS-DynamoDB-FactoryStatus`를 참조/운영했고, 팀은 `infra/foundation` 영구 리소스로 이관 | 실제 Terraform state 소유자를 먼저 확인하고, 한 root만 resource로 관리하게 정리 |
| IoT Rule 소유권 충돌 | High | 팀 `infra/data-pipeline`은 `AEGIS_IoTRule_factory_a_raw_s3` 등 factory-a/b/c rule을 관리. 기존 문서상 factory-a raw S3 rule은 워크스트림 A 합류 지점 | 기존 rule을 import할지 신규 rule로 분리할지 결정 전 apply 금지 |
| CloudInfra collector 경로 이동 | Medium | 로컬은 `apps/cloud-infra-collector/cloud-infra-collector/...`, 팀은 `apps/cloud-infra-collector/...`로 평탄화 | import path, Terraform archive 경로, pytest 경로를 동시에 조정해야 함 |
| ADR 번호 충돌 | High | 로컬 ADR 0020~0031과 팀 ADR 0020~0024가 서로 다른 의미로 존재 | 통합 전 ADR 번호 재배정 또는 namespace 규칙 필요 |
| CI workflow 충돌 | High | 로컬 `dashboard-backend.yml`, `dashboard-web.yml` 삭제 위험. 팀은 단일 `build-push.yaml` 추가 | Dashboard 배포 workflow는 보존하고 edge/data-pipeline workflow를 별도 파일로 병합 |
| build/destroy 스크립트 의미 변경 | High | 팀은 `build-data-pipe.sh`, `build-reporting.sh`를 추가하고 `build-all.sh`, destroy 순서를 변경. 로컬은 `build-data-dashboard.sh` 중심 | destroy 순서 오류 시 data source lookup 실패 또는 운영 리소스 삭제 위험 |
| 운영 문서 삭제/재작성 | Medium | 팀 브랜치가 `docs/AI_AGENT_HARNESS.md`, 다수 `AGENTS.md`, `CLAUDE.md`, `docs/ops/22_data_dashboard_vpc_runbook.md`를 삭제 | 에이전트 harness와 Dashboard runbook은 보존 또는 새 문서로 명시적 승격 필요 |

## 경로별 상세 위험

### 1. Dashboard Backend/Web 삭제 충돌

팀 브랜치 기준 다음 경로가 삭제되어 있다:
- `apps/dashboard-backend/**`
- `apps/dashboard-web/**`
- `.github/workflows/dashboard-backend.yml`
- `.github/workflows/dashboard-web.yml`

로컬 세션 상태 기준 이 경로들은 운영 배포 완료된 핵심 자산이다. 특히 RBAC, Cloud Infra read API, Reports S3 read, WebSocket, history delta refresh, docx export, system-view report 권한이 모두 이 경로에 있다.

권장:
- 병합 시 이 경로는 로컬 버전을 우선한다.
- 팀의 `daily-report-generator`, `data-pipeline`, `snapshot` 계열 기능은 Dashboard API/Web 삭제 없이 별도 추가한다.
- 통합 후 최소 검증:
  - `pytest -q` in `apps/dashboard-backend`
  - `npm run lint && npm test -- --run && npm run build` in `apps/dashboard-web`
  - `/healthz`, `/readyz`, `/cloud-infra`, `/reports`, `/admin/users` 운영 smoke test

### 2. Terraform root와 state 소유권 충돌

로컬 주요 root:
- `infra/data-dashboard/`
- `infra/data-dashboard-permanent/`
- `infra/data-dashboard-dns/`

팀 주요 root:
- `infra/foundation/`에 DynamoDB/ECR/IoT 관련 변경
- `infra/data-pipeline/`
- `infra/reporting/`
- `infra/hub/` moved/addon 변경

위험:
- 팀 브랜치에서는 로컬 `infra/data-dashboard*`가 삭제된다.
- 팀 ADR 0021은 DynamoDB를 `infra/foundation` resource로 이관하고 `infra/data-pipeline`에서는 data source로 참조한다.
- `infra/data-pipeline`은 Hub EKS access entry, CloudInfra collector, GraphAggregator5m, RiskAlertDispatcher, SnapshotPresigner, IoT Rule을 관리한다.
- 로컬 `infra/data-dashboard`도 ECS backend, notifier, Redis/RDS, Cognito, CloudFront, Dashboard ECR/IAM을 관리한다.

권장:
- 통합 전에 실제 AWS와 Terraform state에서 `AEGIS-DynamoDB-FactoryStatus`, IoT Rule, CloudInfra collector Lambda, Dashboard ECS task/service의 소유 root를 확인한다.
- `terraform state list` 기준으로 같은 AWS 리소스가 두 root에서 resource로 관리되지 않게 한다.
- `infra/data-dashboard*` 삭제를 받아들이지 않는다.
- `infra/data-pipeline`과 `infra/reporting`은 새 root로 추가하되, 기존 root와 중복되는 Lambda/IoT/DynamoDB 항목은 import/data source/resource 중 하나로 명확히 정한다.

### 3. Destroy 순서와 비용 위험

팀 `infra/data-pipeline` 문서 기준 destroy 순서:

```text
destroy-data-pipe.sh
destroy-hub.sh
destroy-foundation.sh
```

로컬 Dashboard 계층은 별도 permanent/dns root를 유지한다. 통합 후 `destroy-all.sh`가 양쪽 순서를 제대로 반영하지 않으면 다음 문제가 생긴다:
- `data "aws_dynamodb_table"` lookup 실패로 Terraform destroy 중단
- Hub 재생성 중 SlowCollector EKS access entry drift
- Dashboard permanent 리소스 또는 DNS가 의도치 않게 삭제
- S3 `processed/`, `reports/`, `image_snapshot/` 데이터 보존 정책 혼선

권장:
- destroy 스크립트는 통합 직후 실행하지 않는다.
- `scripts/destroy/README.md`와 `scripts/build/README.md`를 먼저 병합하고 순서표를 확정한다.
- `destroy-all.sh`는 Dashboard, data-pipeline, reporting, hub, foundation, permanent/dns의 보존/삭제 정책을 명시한 뒤에만 수정한다.

### 4. DataProcessor 계약 충돌

양쪽 모두 다음 파일을 수정했다:
- `apps/data-processor/lambda_function.py`
- `apps/data-processor/processor/dynamo.py`
- `apps/data-processor/processor/normalizer.py`
- `apps/data-processor/processor/risk.py`
- `apps/data-processor/processor/s3_writer.py`
- 관련 tests

팀 쪽은 factory-b/c, freshness refresh, processed S3, image snapshot metadata, graph 집계 전제와 더 가까운 변경을 포함한다. 로컬 쪽은 Dashboard history, numeric normalization, GRAPH#5M, staleness 기준과 맞물려 있다.

권장:
- `apps/data-processor`는 line-by-line 수동 병합한다.
- 병합 기준은 `docs/specs/iot_data_format.md`, `docs/specs/data_storage_pipeline.md`, `docs/specs/monitoring_dashboard/02_api_spec.md`의 통합본으로 먼저 확정한다.
- 통합 후 최소 검증:
  - `pytest -q apps/data-processor`
  - factory-a/b/c 샘플 payload 처리
  - DynamoDB `LATEST`, `HISTORY#STATE`, `GRAPH#5M`, `PIPELINE#STATUS` item shape 확인
  - S3 raw/processed/report/image_snapshot prefix 확인

### 5. 문서 source of truth 충돌

로컬 문서 체계:
- `docs/AI_AGENT_HARNESS.md`가 에이전트 단일 진입점
- `docs/planning/16_data_dashboard_vpc_workplan.md`가 Dashboard VPC workplan
- ADR 0005, 0012~0031이 Data/Dashboard 운영 결정을 보존

팀 문서 체계:
- `docs/planning/16_m4_edge_data_plane_implementation.md`
- `docs/planning/17_llm_daily_factory_report_plan.md`
- `docs/ops/23_data_pipeline.md`
- `docs/ops/24_daily_factory_report.md`
- `docs/ops/26_dynamodb_key_model.md`
- `docs/wiki/troubleshooting/**`

위험:
- 팀 브랜치가 로컬 harness와 Dashboard workplan을 삭제한다.
- ADR 번호가 겹쳐서 `0021`, `0022`, `0023`, `0024`가 서로 다른 결정을 가리킨다.
- `docs/issues/SESSION_STATE.md`는 양쪽 모두 현재 상태 스냅샷이라 자동 병합 의미가 없다.

권장:
- `SESSION_STATE.md`는 자동 병합하지 말고 통합 완료 후 새 스냅샷으로 재작성한다.
- ADR은 번호 충돌을 해소한 뒤 `docs/changes/README.md` 인덱스를 다시 만든다.
- `docs/AI_AGENT_HARNESS.md`는 삭제하지 말고 통합 경계 문서로 갱신한다.

### 6. GitOps/워크스트림 A 영역 변경

팀 브랜치에는 다음 워크스트림 A 영역 변경이 포함된다:
- `infra/hub/**`
- `infra/foundation/**`
- `scripts/ansible/**`
- `charts/aegis-spoke/**`
- Hub/Admin UI/Tailscale/Grafana/Prometheus 관련 문서

로컬 AGENTS 기준 이 영역은 본 환경에서 임의 수정 금지였던 범위다. 통합 자체는 필요하지만, Dashboard 변경과 같은 PR에서 무차별 병합하면 검증 범위가 과도하게 커진다.

권장:
- 워크스트림 A 변경은 별도 통합 단위로 분리한다.
- Data/Dashboard 보존 PR, DataPipeline/Reporting 추가 PR, Hub/Foundation/Spoke 변경 PR을 나눈다.
- 각 PR은 Terraform root별 `fmt/validate/plan`을 별도로 수행한다.

## 권장 통합 순서

1. 현재 로컬 변경 중 미커밋 파일을 먼저 정리한다.
   - 현재 working tree에는 아키텍처 drawio/png 삭제 및 신규 이미지 파일이 있다.
   - 이 변경이 통합 대상인지 별도 커밋/폐기/보존 결정을 먼저 해야 한다.
2. `docs/warning.md`와 함께 통합 방침을 합의한다.
3. 첫 번째 통합 단위: 문서 인덱스와 ADR 번호 충돌만 해결한다.
4. 두 번째 통합 단위: `apps/data-processor`, `apps/cloud-infra-collector`, `infra/data-pipeline`을 수동 병합한다.
5. 세 번째 통합 단위: `apps/daily-report-generator`, `infra/reporting`을 추가하고 Dashboard Reports API/Web과 계약을 맞춘다.
6. 네 번째 통합 단위: edge/snapshot/spoke/chart 계열을 워크스트림 A 기준으로 병합한다.
7. 마지막 단위: `build-all.sh`, `destroy-all.sh`, README, `SESSION_STATE.md`, 비용 문서를 통합 상태로 재작성한다.

## 통합 전 금지 사항

- `git merge team/main` 후 충돌 파일을 한쪽 기준으로 일괄 선택하지 않는다.
- `git checkout team/main -- .` 또는 `git checkout main -- .` 방식의 대량 덮어쓰기를 하지 않는다.
- `infra/data-dashboard*` 삭제를 그대로 수용하지 않는다.
- `apps/dashboard-backend/**`, `apps/dashboard-web/**` 삭제를 그대로 수용하지 않는다.
- Terraform `apply` 또는 destroy 스크립트 실행 전 state 소유권 확인 없이 진행하지 않는다.
- secret, token, private key, MFA OTP, 전체 ARN을 문서에 기록하지 않는다.

## 병합 후 최소 검증 체크리스트

로컬 코드:
- `python -m pytest -q apps/data-processor`
- `python -m pytest -q apps/cloud-infra-collector`
- `python -m pytest -q apps/dashboard-backend`
- `npm run lint && npm test -- --run && npm run build` in `apps/dashboard-web`
- `python -m pytest -q apps/daily-report-generator`
- `python -m pytest -q apps/graph-metrics-aggregator`
- `python -m pytest -q apps/risk-alert-dispatcher`
- `python -m pytest -q apps/snapshot-presigner`

Terraform:
- `terraform -chdir=infra/data-dashboard fmt -check`
- `terraform -chdir=infra/data-dashboard validate`
- `terraform -chdir=infra/data-dashboard-permanent fmt -check`
- `terraform -chdir=infra/data-dashboard-permanent validate`
- `terraform -chdir=infra/data-pipeline fmt -check`
- `terraform -chdir=infra/data-pipeline validate`
- `terraform -chdir=infra/reporting fmt -check`
- `terraform -chdir=infra/reporting validate`
- `terraform -chdir=infra/foundation fmt -check`
- `terraform -chdir=infra/foundation validate`
- `terraform -chdir=infra/hub fmt -check`
- `terraform -chdir=infra/hub validate`

운영 smoke test:
- Dashboard web HTTP 200
- API `/healthz` 200
- API `/readyz`에서 DynamoDB/Redis/RDS metadata 정상
- `/factories`, `/factories/{factory_id}/history`, `/cloud-infra`, `/reports`, `/admin/users` 권한별 응답 확인
- IoT publish -> S3 raw -> DataProcessor -> DynamoDB LATEST/HISTORY -> Dashboard 표시
- `GRAPH#5M` 생성과 Factory chart 표시
- daily report 생성/조회/Word export
- CloudInfra Fast/Slow collector 최신 snapshot과 Slack alert dedupe 동작
- Snapshot presigner -> S3 image upload -> image snapshot metadata 처리

## 결론

이 통합은 자동 merge가 아니라 재설계에 가까운 수동 통합으로 진행해야 한다. 핵심 원칙은 다음이다.

1. 운영 중인 Dashboard Backend/Web/Data Dashboard Terraform은 삭제하지 않는다.
2. 팀의 DataPipeline/Reporting/Edge/Snapshot 기능은 별도 root와 별도 검증 단위로 수용한다.
3. DynamoDB, IoT Rule, S3 prefix, CloudInfra collector, build/destroy 순서는 ADR로 다시 고정한다.
4. 문서 source of truth와 ADR 번호 충돌을 코드 병합보다 먼저 정리한다.
