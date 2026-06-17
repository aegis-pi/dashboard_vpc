# 0035. AI 채팅 Bedrock 모델 평가: Claude 2-tier에서 Amazon Nova profile로 전환

상태: accepted
결정일: 2026-06-11
영향 범위: M6, apps/dashboard-backend(/chat), infra/data-dashboard(ECS env/IAM), Bedrock usage cost, docs/ops 비용 기준. 데이터 경로(DDB/S3/RDS/IoT) 무변경.

## 수정 이력

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-06-11 | v0.1 | Nova Micro/Lite/Pro/Nova 2 Lite 후보 평가, 기본 조합을 `resolve=Nova Micro`, `fast/precise=Nova Pro`로 결정. |
| 2026-06-11 | v0.2 | Fast/Precise tier 선택 기준을 비용 최적화/균형형/품질 최우선으로 분리하고, 현재 구현 기본값을 `fast=Nova Pro`, `precise=Nova Pro` 균형형 운영 조합으로 정리. |

## 기존 계획

- ADR 0033은 챗봇 explain tier를 `fast=global.anthropic.claude-haiku-4-5-20251001-v1:0`, `precise=global.anthropic.claude-sonnet-4-6`로 정의했다.
- ADR 0034는 LLM Resolve 단계도 `global.anthropic.claude-haiku-4-5-20251001-v1:0`를 사용하도록 했다.
- 비용 기준은 월 720회 질의 기준 약 `$4.3/월`이었다.

## 변경된 실제 기준

AI 채팅 Bedrock profile은 질문 해석(resolve), 빠른 응답(fast), 정밀 분석(precise)의 3단계로 분리한다.

- Resolve 단계는 사용자 질문에서 공장, 시간 범위, 의도를 구조화하는 용도이므로 비용과 지연시간이 낮은 `Amazon Nova Micro`를 사용한다.
- Fast/Precise tier는 운영 목적에 따라 모델 조합을 선택한다.
- 본 데모는 발표 중 잘못된 단정, 원인 분석 누락, 증빙 해석 오류를 최소화하는 것이 비용 절감보다 중요하므로 품질 최우선 조합을 기준으로 한다.

| 단계 | 기존 | 현재 구현 기본값 | 이유 |
| --- | --- | --- | --- |
| Resolve | Claude Haiku 4.5 | `apac.amazon.nova-micro-v1:0` | 5개 라이브 resolve 샘플 모두 intent/factory/time 일치, 지연 낮음, 최저 비용 |
| Explain fast | Claude Haiku 4.5 | `apac.amazon.nova-pro-v1:0` | 일반 질의도 데모에서는 답변 안정성을 우선. Nova Lite는 일부 샘플에서 근거 없는 정상범위 단정이 있어 데모 기본값에서 제외 |
| Explain precise | Claude Sonnet 4.6 | `apac.amazon.nova-pro-v1:0` | 원인 분석, 보고서 요약, 증빙 해석에서도 확인/추정/한계 분리 품질이 유지되어 균형형 운영 기본값으로 채택 |

Fast/Precise tier 선택 정책:

| 목적 | Fast | Precise | 선정 이유 |
| --- | --- | --- | --- |
| 비용 최적화 | `apac.amazon.nova-lite-v1:0` | `apac.amazon.nova-pro-v1:0` | 일반 상태 조회와 단순 추이는 저비용 모델로 처리하고, 원인 분석·증빙 해석은 Nova Pro로 품질을 보강한다. |
| 균형형 운영 | `apac.amazon.nova-pro-v1:0` | `apac.amazon.nova-pro-v1:0` | 두 tier 모두 안정적인 답변 품질을 확보한다. 다만 fast/precise의 모델 차이는 없고, 라우팅·프롬프트·응답 정책 차이 중심으로 운용된다. |
| 품질 최우선(옵션) | `apac.amazon.nova-pro-v1:0` | `global.anthropic.claude-sonnet-4-6` | 일반 질의도 안정성을 우선하고, 원인 분석·보고서 요약·증빙 해석은 더 강한 추론 모델로 처리한다. 비용은 가장 높다. |

운영 전환 시 트래픽 규모와 비용 요구사항이 커지면 `Fast=Nova Lite, Precise=Nova Pro` 조합으로 낮출 수 있다. 이 경우 현재 상태 조회, 최근 추이, 단순 요약은 비용 효율적으로 처리하고, 위험 원인 분석이나 이미지·보고서 기반 설명은 계속 Nova Pro가 담당하므로 품질 저하 범위를 제한할 수 있다.

반대로 사고 분석, 보고서 자동화, 대외 발표용 응답처럼 답변 신뢰도가 가장 중요한 경우에는 `Fast=Nova Pro, Precise=Claude Sonnet` 조합을 별도 옵션으로 재평가한다.

구현 기준:

- `apps/dashboard-backend/config.py` 기본값은 선택한 tier 정책에 맞춰 변경한다.
- `infra/data-dashboard/variables.tf` 기본값은 선택한 tier 정책에 맞춰 변경한다.
- ECS env에 `CHAT_ROUTING_ENABLED`, `BEDROCK_RESOLVE_MODEL`, `BEDROCK_RESOLVE_MAX_TOKENS`, `BEDROCK_RESOLVE_OPERATION_TIMEOUT_SECONDS`를 명시 주입한다.
- ECS task role Bedrock IAM allowlist에 평가 대상 Nova inference profile과 Claude Sonnet inference profile/foundation model pattern을 추가한다.
- `/chat/query` API 응답은 계속 tier label만 노출하고 raw model id는 노출하지 않는다.

## 평가 결과

2026-06-11 `ap-south-1`에서 읽기 전용/라이브 호출로 확인:

```text
ACTIVE inference profiles:
- apac.amazon.nova-micro-v1:0
- apac.amazon.nova-lite-v1:0
- apac.amazon.nova-pro-v1:0
- global.amazon.nova-2-lite-v1:0
```

라이브 평가 명령:

```bash
apps/dashboard-backend/scripts/evaluate_bedrock_chat_models.py \
  --preset nova-quality \
  --mode all \
  --yes-live-bedrock \
  --output /tmp/aegis-nova-quality-eval.jsonl
```

샘플 결과:

| 후보 | Resolve | Explain current | Explain cause | 판정 |
| --- | --- | --- | --- | --- |
| baseline(Claude Haiku/Sonnet) | 5/5 | 근거 보존, 지연 2929.5ms | 품질 우수, 지연 8490.7ms | 기준선 |
| nova-low-cost(Micro/Lite/Pro) | 5/5 | Nova Lite가 `온도 정상 범위` 단정 | Pro 원인 분석 양호 | fast tier 불합격 |
| nova-aggressive(Micro/Micro/Lite) | 5/5 | 프롬프트 보정 후 current는 양호 | Lite cause가 원인 표현을 다소 강하게 단정 | 데모 후보, 운영 기본값 비채택 |
| nova-2-lite(global) | 5/5 | 정상범위/권고 생성 경향 | 이미지 스냅샷 확인 권고 생성 | 비채택 |
| nova-quality(Micro/Pro/Pro) | 5/5 | 온도 수치만 보고, 정상범위 단정 없음 | 확인/추정/데이터 한계 분리 | 균형형 운영 후보 |
| demo-quality(Micro/Pro/Sonnet) | 5/5 기준선 유지 | Nova Pro로 일반 질의 안정성 확보 | 기준선 Sonnet 품질 유지 | 품질 최우선 옵션 |

`nova-quality` 라이브 결과 요약:

```text
resolve: 5/5 exact match, latency 673.8~1088.8ms
fast explain(Nova Pro): 1663.3ms, risk_score/risk_grade/temperature/ai_detection 수치 보존
precise explain(Nova Pro): 1938.0ms, AI 탐지와 온도 상승은 추정으로 분리, 작업자 로그 missing 명시
baseline precise(Claude Sonnet): 품질 우수, 지연 8490.7ms. 품질 최우선 옵션으로 유지하되 현재 구현 기본값은 Nova Pro로 통일
```

Dashboard Web `/chat` quick start 추천 문항 4개도 별도 평가했다.

평가 명령:

```bash
apps/dashboard-backend/scripts/evaluate_bedrock_chat_models.py \
  --preset nova-quality \
  --mode resolve \
  --case-set quickstart \
  --yes-live-bedrock \
  --output /tmp/aegis-nova-quality-quickstart-eval.jsonl
```

| Quick start 문항 | 기대 | Nova Micro resolve 결과 | 지연 |
| --- | --- | --- | ---: |
| `2026-06-09 오전 9시 35분쯤 화재 위험 점수가 튄...증빙 사진...요약` | `spike_check`, `factory-a`, `point` | 일치. `metric=risk_score`, `anchor_kst=2026-06-09T09:35:00` | 1380.9ms |
| `2026-06-09 보고서에서 주요 이벤트와 확인 필요 항목 요약` | `report`, `factory-a`, `point` | 일치. `anchor_kst=2026-06-09T00:00` | 895.6ms |
| `2026-06-09 오후 3시 안전 점수 급락 원인` | `cause_analysis`, `factory-a`, `point` | 일치. `anchor_kst=2026-06-09T15:00:00` | 831.5ms |
| `2026-06-09 오후 2시~4시 안전 점수와 AI 탐지 추이 비교` | `history_trend`, `factory-a`, `interval` | 일치. `start_kst=2026-06-09T14:00`, `end_kst=2026-06-09T16:00` | 954.4ms |

기준선 Claude Haiku 4.5도 동일 4문항을 모두 맞췄으나 지연은 1552.2~2427.1ms로, 이번 샘플에서는 Nova Micro가 더 낮았다.

## 변경 이유

- 멘토 요청은 "Bedrock을 사용할 거면 Amazon Nova 모델도 테스트하고, 성능 저하가 크지 않으면 저렴한 모델을 선택"하는 것이다.
- Nova Micro는 Resolve tool-use 단계에서 충분히 정확했고, 기존 Haiku 4.5보다 지연도 낮았다.
- Nova Lite/Micro는 explain 단계에서 비용은 더 낮지만 evidence에 없는 센서 정상범위 판단을 생성하는 샘플이 있어 데모 기본값으로는 위험하다.
- Nova Pro는 Sonnet 대비 저렴하면서도 본 샘플에서 근거 기반 답변 품질이 유지되어 fast tier에 적합하다.
- Fast와 Precise가 같은 모델이면 사용자에게 노출되는 tier 차이는 약해진다. 현재 구현 기본값은 비용·지연·응답 품질의 균형을 우선해 둘 다 Nova Pro로 통일하고, tier 차이는 라우팅·프롬프트·응답 정책 중심으로 운용한다.

## 비용 영향

월 720회 질의 기준 기존 Claude 조합은 약 `$4.3/월`이다.

비용 최적화 운영안(`Fast=Nova Lite`, `Precise=Nova Pro`) 추정:

```text
resolve Nova Micro:
  720 * 1.2k input * $0.035/M  ≈ $0.03
  720 * 150 output * $0.14/M   ≈ $0.02
fast Nova Lite:
  600 * 1.2k input * $0.06/M   ≈ $0.04
  600 * 300 output * $0.24/M   ≈ $0.04
precise Nova Pro:
  120 * 1.5k input * $0.80/M   ≈ $0.14
  120 * 400 output * $3.20/M   ≈ $0.15
합계 ≈ $0.42/월
```

균형형 운영안(`Fast=Nova Pro`, `Precise=Nova Pro`) 추정:

```text
resolve Nova Micro:
  720 * 1.2k input * $0.035/M  ≈ $0.03
  720 * 150 output * $0.14/M   ≈ $0.02
fast Nova Pro:
  600 * 1.2k input * $0.80/M   ≈ $0.58
  600 * 300 output * $3.20/M   ≈ $0.58
precise Nova Pro:
  120 * 1.5k input * $0.80/M   ≈ $0.14
  120 * 400 output * $3.20/M   ≈ $0.15
합계 ≈ $1.5/월
```

품질 최우선 데모안(`Fast=Nova Pro`, `Precise=Claude Sonnet`) 추정:

```text
resolve Nova Micro:
  720 * 1.2k input * $0.035/M  ≈ $0.03
  720 * 150 output * $0.14/M   ≈ $0.02
fast Nova Pro:
  600 * 1.2k input * $0.80/M   ≈ $0.58
  600 * 300 output * $3.20/M   ≈ $0.58
precise Claude Sonnet:
  120 * 1.5k input * $3.00/M   ≈ $0.54
  120 * 400 output * $15.00/M  ≈ $0.72
합계 ≈ $2.5/월
```

- 비용 최적화 운영안 절감률: 기존 Claude 조합 대비 약 90%.
- 균형형 운영안 절감률: 기존 Claude 조합 대비 약 65%.
- 품질 최우선 데모안 절감률: 기존 Claude 조합 대비 약 42%.
- 상시 리소스 비용 변화 없음. Bedrock은 요청 기반 과금이다.
- 비용 최적화/균형형 운영안은 `apac.` profile 중심이라 기존 `global.` Claude/Sonnet 대비 data residency 측면도 개선된다.
- 품질 최우선 데모안은 precise tier에서 `global.` Claude Sonnet을 사용하므로 data residency보다 응답 안정성을 우선하는 선택이다.

## 영향

- Backend:
  - `config.py` Bedrock 기본 model id 변경.
  - `services/bedrock.py` 시스템 프롬프트에 센서 정상범위/조치 권고 무근거 생성 금지 규칙 추가.
  - `scripts/evaluate_bedrock_chat_models.py` 평가 스크립트 추가.
- Terraform:
  - `variables.tf` Bedrock defaults와 Nova/Claude IAM allowlist 추가.
  - `ecs.tf` resolve/chat routing env 주입.
- 운영:
  - 배포 전에는 코드 기준만 바뀐 상태다.
  - 운영 반영 시 backend image push 후 `scripts/ops/deploy-dashboard-backend.sh sha-<7>`와 Terraform apply가 필요하다.

## 업데이트 필요한 문서

- `docs/changes/README.md`
- `docs/ops/15_aws_cost_baseline.md`
- `docs/ops/22_data_dashboard_vpc_runbook.md`
- `docs/issues/SESSION_STATE.md`

## 검증

- 라이브 Bedrock 호출:
  - baseline, nova-low-cost, nova-aggressive, nova-2-lite, nova-quality preset 실행.
  - Dashboard Web quick start 4문항은 `--case-set quickstart`로 baseline/nova-quality resolve 비교 실행.
  - raw 결과는 `/tmp/aegis-*-eval*.jsonl`에만 저장하고 git 추적하지 않음.
- 필수 로컬 검증:
  - `cd apps/dashboard-backend && pytest -q`
  - `terraform -chdir=infra/data-dashboard fmt -check`
  - `terraform -chdir=infra/data-dashboard validate`
  - `git diff --check`

## 후속

- 운영 인증 사용자로 `/chat/query` 실제 데이터 20~30문항 golden set을 추가 실행한다.
- 비용을 더 낮춰야 하는 운영 환경이면 `Fast=Nova Lite, Precise=Nova Pro`를 우선 재검토한다.
- 비용이 최우선이고 원인 분석 품질 저하를 감수할 수 있는 환경이면 `nova-aggressive`를 후보로 재검토하되, 원인 분석 단정 표현을 수동 평가해야 한다.
