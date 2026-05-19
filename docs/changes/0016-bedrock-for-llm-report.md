# 0016. LLM 일간 보고서: Amazon Bedrock + EventBridge schedule

상태: accepted
결정일: 2026-05-18
관련 범위: M6 Dashboard, AI/LLM, 보고 자동화

> 2026-05-18 갱신: 초안에서는 Phase 1.5(포트폴리오 확장 단계)로 표기했으나, Phase 1 통합 결정에 따라 Phase 1 배포 목표의 일부다.

## 기존 계획

`docs/planning/00_project_overview.md`는 Risk Twin 결과를 사용자가 본사 관제 화면에서 직접 해석한다고 가정한다. "지난 24시간 무엇이 위험했고, 왜 그랬으며, 어떤 조치가 필요한가" 같은 자연어 요약은 명시적 계획에 포함되지 않았다.

`docs/changes/0007-dashboard-api-runtime-lambda.md`에서 Lambda 처리 단계로 normalize/risk/pipeline_status가 통합됐다. LLM 기반 자연어 보고는 별도 결정으로 보류돼 있었다.

## 변경된 실제 기준

### Bedrock 기반 일간 보고서 생성기 도입

다음 두 가지 LLM 기능을 추가한다.

```text
[일간 보고서]
  EventBridge schedule (매일 09:00 KST)
    → Lambda report-generator
        → 지난 24h DDB HISTORY + S3 processed 집계
        → Bedrock (Claude 3 Haiku) API 호출 (한국어 요약)
        → 결과를 S3 `reports/<YYYY-MM-DD>.md` 저장
        → DynamoDB `aegis-daily-report`에 메타 저장
    → 사용자: Dashboard에서 "일간 보고서" 탭으로 열람

[이상 상황 즉시 요약 (선택)]
  Lambda data processor가 risk_score > 80 감지
    → SNS 또는 직접 invoke
    → Lambda incident-summarizer
        → 최근 10분 상황 + 직전 1시간 추이를 Bedrock에 전달
        → 자연어 요약 (3~5문장)
        → DDB LATEST의 incident_summary 필드에 기록
        → WebSocket push (ADR 0015 흐름과 동일)
```

### 모델 선택

- 1차: **Claude 3 Haiku** (Bedrock) — `anthropic.claude-3-haiku-20240307-v1:0`
  - 한국어 자연스러움 양호
  - 입력 ~$0.00025/1k tokens, 출력 ~$0.00125/1k tokens (저렴)
  - 일간 보고서 1회 ≈ 입력 5k + 출력 1k tokens ≈ $0.0025
- 후속 후보: Claude 3.5 Sonnet (품질 우선 시)
- 비채택: GPT-4 (Bedrock 외부, IAM 통합 안 됨)

### Bedrock 접근 방식

- Lambda → Bedrock Runtime API (`bedrock-runtime:InvokeModel`)
- IAM Policy: 특정 model ARN만 허용
- 리전: ap-south-1에 Claude 3 Haiku 미지원 시 us-east-1 cross-region invoke 또는 `bedrock-runtime` regional endpoint 선택
  - 2026-05 기준 확인 후 결정. 미지원 시 us-east-1 사용 (data residency는 보고서 출력만이라 영향 적음)
- VPC-attach 불필요 (Lambda는 VPC 밖, Bedrock public endpoint)

### 입력 프롬프트 구조

```text
시스템:
  너는 스마트팩토리 안전 관제 보고서 작성자다.
  아래 데이터를 바탕으로 한국어로 일간 보고서를 작성해라.
  형식: Markdown
  섹션: 요약 / 주요 이벤트 / 위험도 추이 / 권장 조치

사용자:
  공장: {factory_id}
  기간: {date_kst} 00:00 ~ 23:59 KST
  risk_score 시계열: {array}
  pipeline_status 시계열: {array}
  발생 이벤트: {array}
```

## 변경 이유

### 일간 보고서가 필요한 이유

- 본사 관제 담당자가 매일 아침 1번 공장당 1분 안에 전날 상황 파악 가능 → 운영 효율
- 시각 차트만으로 놓치는 컨텍스트(시간대별 변화 이유, 권장 조치)를 자연어로 보완
- 포트폴리오에서 "LLM 통합" 키워드 시연 — 단순 Q&A가 아니라 데이터 → 자연어 보고서 파이프라인

### Bedrock 선택 (vs OpenAI / 자체 LLM)

| 옵션 | 장점 | 단점 |
| --- | --- | --- |
| **Bedrock + Claude 3 Haiku** ★ | AWS IAM 통합, VPC Endpoint 지원, 한국어 양호, 저렴 | 모델 선택 폭 제한 |
| OpenAI API | 모델 선택 폭 | 외부 API key 관리, IAM 통합 불가 |
| 자체 호스팅 LLM (EKS GPU) | 완전 통제 | GPU 노드 ~$300+/월, Phase 1 범위에서 과잉 |
| SageMaker JumpStart | AWS 통합 | 엔드포인트 상시 비용 ~$50+/월 |

**선택 이유**: 사용량 기반 과금 + IAM 통합 + 저렴 + ap-south-1 또는 인접 리전 사용 가능.

### Lambda + EventBridge 선택

- 일간 1회 실행이므로 컨테이너 상시 운영 불필요 → Lambda
- EventBridge schedule이 cron과 동등하며 IaC 친화
- Bedrock 호출 시간이 통상 5~15초 → Lambda 15분 한계 안에 충분

### 트리거 기록

- LLM 통합 발표 항목 추가
- "데이터를 보여주는" 대시보드를 넘어 "데이터를 해석해 주는" 화면 필요

## 영향

### Terraform IaC

- `aws_lambda_function` (`report-generator`)
  - Runtime: Python 3.12
  - Timeout: 5분
  - Memory: 512 MB
  - Layer: anthropic SDK 또는 직접 boto3 `bedrock-runtime`
  - IAM: DDB read, S3 read/write, Bedrock InvokeModel
- `aws_scheduler_schedule` (EventBridge Scheduler)
  - Cron: `cron(0 0 * * ? *)` UTC = 09:00 KST
  - Target: report-generator Lambda
- `aws_dynamodb_table` `aegis-daily-report`
  - PK: `report_date` (YYYY-MM-DD)
  - SK: `factory_id`
  - Attribute: `s3_key`, `summary`, `generated_at`, `model_id`, `tokens_in`, `tokens_out`
- S3 prefix 추가: `aegis-bucket-data/reports/YYYY-MM-DD/<factory_id>.md`
- (선택) `aws_lambda_function` (`incident-summarizer`) for 이상 상황 즉시 요약

### Backend / Frontend

- Backend: `GET /api/reports?date=YYYY-MM-DD&factory_id=...` → S3 markdown 반환
- Frontend: 보고서 탭, Markdown 렌더링 (`react-markdown`)

### 비용

- Bedrock Claude 3 Haiku 호출:
  - 일간 보고서 = 3 공장 × $0.0025 = $0.0075/일 = $0.225/월
  - 이상 상황 요약 (가정 10건/일) = 10 × $0.001 = $0.01/일 = $0.3/월
  - 합계 < $1/월
- Lambda 실행: 무료 티어 안
- EventBridge Scheduler: 무료 (월 14M invocation 무료)
- 추가 S3 저장: 매일 3 공장 × ~5KB = 15KB/일 → 무시 가능

### 명시적 비채택

- 실시간 LLM 챗봇 → Phase 1 범위 외, RAG·context 관리 복잡도 ↑
- Sonnet/Opus 등 상위 모델 → 보고서 품질 충분 시 비용 우위, 필요 시 ADR로 모델 교체
- AWS Comprehend (감성 분석) → 자연어 요약 목적과 부적합
- Step Functions으로 다단계 LLM 파이프라인 → Phase 1 범위에서 과잉, 단일 Lambda로 충분

### 합류 지점 영향

- 없음. 워크스트림 A 무영향
- DDB HISTORY와 S3 processed 읽기만 (write 없음)
- 새 DDB 테이블 `aegis-daily-report`은 워크스트림 B 전용

## 업데이트 필요한 문서

- `docs/changes/README.md` (인덱스에 0016 추가)
- `docs/architecture/01_target_architecture.md` (LLM 보고서 흐름)
- `docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio` (Bedrock 박스 + EventBridge)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (Phase 1 구현 순서에 report-generator)
- `docs/planning/17_expansion_roadmap.md` (Phase 1 트리거 표)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (`/api/reports` endpoint)
- `docs/ops/15_aws_cost_baseline.md` (Bedrock 호출 비용)

## 검증

- `terraform plan`에 Lambda report-generator + EventBridge Scheduler + DDB 테이블 포함
- 수동 invoke: `aws lambda invoke --function-name aegis-report-generator out.json` → S3에 보고서 파일 생성
- 스케줄 실행: 다음 09:00 KST에 자동 생성 (CloudWatch Logs로 확인)
- Backend `GET /api/reports?date=YYYY-MM-DD` → 200 + Markdown 반환
- Frontend 보고서 탭에 Markdown 정상 렌더링
- IAM 검증: report-generator Role이 Bedrock InvokeModel 외 권한 없음
- 비용 모니터링: 첫 7일 운영 후 실제 Bedrock 호출 비용이 예상치 ($1/월) 안에 있는지 Cost Explorer로 확인
- destroy 후 EventBridge Scheduler·Lambda 잔존 없음
