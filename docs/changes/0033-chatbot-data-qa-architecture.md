ID:        0033
제목:      chatbot-data-qa-architecture
상태:      accepted
결정일:    2026-06-08
영향 범위: M6, apps/dashboard-backend(/chat), apps/dashboard-web, Bedrock(InvokeModel), ECS task role IAM, S3 reports/processed, DynamoDB LATEST/HISTORY#STATE/GRAPH#5M, RDS metadata, (후속) image snapshot 합류 지점

> 근거 평가: 본 환경 평가 + Codex 평가 종합(대화 2026-06-08). 핵심 원칙은 "LLM이 데이터를 찾게 하지 말고, Backend가 RBAC 검증 후 데이터를 찾아 LLM에게 설명시킨다".

## 기존 계획

- ADR 0016은 **일간 보고서**(EventBridge 09:00 KST → Lambda report-generator → Bedrock Claude 3 Haiku → S3 `reports/daily/`)와 선택적 이상상황 즉시 요약만 정의했다. 사용자의 **ad-hoc 자연어 질의**(대화형)는 범위에 없었다.
- `docs/planning/00_project_overview.md`는 관제 담당자가 Dashboard 화면을 직접 해석한다고 가정한다.
- 현재 Dashboard Backend(FastAPI, ECS Fargate)는 `factories`·`reports`·`ws`·`cloud_infra`·`admin_users`·`auth_me` 라우터를 보유하며, 데이터 조회는 `services/ddb.py`(LATEST/HISTORY#STATE/GRAPH#5M)·`services/s3.py`(reports/processed)·RDS metadata로 이미 구현돼 있다. 권한은 `deps/auth.py`(Cognito JWT) + `deps/rbac.py`(factory 스코프)로 강제된다.
- 이미지: `dummy-sensor`의 `device_status.camera`는 `available:false`이며, IoT/데이터 파이프라인에 이미지 캡처/저장 경로가 없다(코드의 "snapshot"은 전부 상태 JSON `state_snapshot`이다).

## 결정 기준 (제안)

### 1. 형태: Tool-based QA + 제한적 RAG (프롬프트-only ✗ / 일반 RAG ✗)

- 센서값·위험도·타임라인은 **정형 조회(structured query)** 대상이지 벡터 검색 대상이 아니다. 5분마다 바뀌는 수치를 임베딩하는 것은 비용·정합성 모두 손해다.
- LLM은 **데이터를 찾지 않는다.** Backend가 RBAC를 거쳐 도구로 데이터를 조회하고, 요약된 evidence만 LLM에 전달해 자연어로 설명시킨다.
- RAG는 텍스트성 지식(일간 보고서 Markdown, 운영 문서/ADR/런북)에 **한정**하며 도입 순서상 마지막이다.

| 지식 종류 | 저장처 | 접근 방식 |
| --- | --- | --- |
| 센서/위험도/타임라인 | DDB LATEST/HISTORY#STATE/GRAPH#5M, S3 processed | structured query (RAG 아님) |
| 공장/사용자 메타데이터 | RDS | structured query |
| 일간 보고서 Markdown | S3 `reports/daily/` | 단순 검색 또는 경량 RAG (후속) |
| 운영 문서/ADR/런북 | repo/문서 | RAG 적합 (후속) |
| 이미지 | (후속) S3 image_snapshot + metadata | metadata 검색 + presigned URL, 명시 요청 시 multimodal |
| "왜 위험했나" 추론 | 위 structured data | evidence 요약 + LLM reasoning |

### 2. 라우팅: 결정형(intent/time parser) 우선, LLM tool-calling은 후속 옵션

- 1차는 **Backend의 결정형 intent + time parser**가 도구를 선택한다. LLM은 evidence를 받아 설명만 한다.
- 이유: ① "Backend가 데이터를 찾는다" 원칙을 가장 강하게 강제, ② 결정형 라우팅은 단위 테스트 가능(LLM 비결정성 배제), ③ 아래 도입 순서 3단계(LLM 없는 rule/template)와 자연스럽게 맞물린다.
- intent 종류가 결정형으로 감당 안 될 만큼 늘면 그때 **Bedrock Converse tool-use(에이전트형)**로 진화한다. (현 단계 비채택)

### 3. 모델: Amazon Bedrock 2-tier (2026-06-08 가용성 실측 반영)

ADR 0016은 Claude 3 Haiku(`anthropic.claude-3-haiku-20240307-v1:0`)를 지정했으나, ap-south-1 실측 결과 해당 구형 모델은 간단한 지시도 틀릴 만큼 추론·지시이행이 약해 "왜 위험했나" 설명에 부적합했다. 대신 **intent별 2-tier**로 운영한다(파이프라인은 동일, 마지막 explain 단계만 모델 교체).

| tier | 사용 intent | 모델(inference profile id) | 비고 |
| --- | --- | --- | --- |
| **fast**(기본) | current_status / history_trend / report | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 현세대 Haiku, 저비용, 상태/추이 설명 |
| **precise** | cause_analysis ("왜 위험했나") | `global.anthropic.claude-sonnet-4-6` | 추론 품질 우선 |

- **실측(2026-06-08, account 611058323802, ap-south-1)**: 두 모델 모두 `bedrock-runtime:Converse` 호출 성공. 단 **on-demand 직접 호출 불가, inference profile 필수**(`inferenceTypesSupported = INFERENCE_PROFILE`). Haiku 4.5·Sonnet 4.6 모두 `apac.` 프로파일은 없고 `global.` 프로파일만 ACTIVE → cross-region 라우팅.
- ADR 0016의 Claude 3 Haiku는 on-demand 가능하나 품질 사유로 비채택.
- **모델 ID는 admin 설정(`BEDROCK_MODEL_FAST`/`BEDROCK_MODEL_PRECISE` env)에만 둔다.** API 응답은 tier 라벨(`fast`/`precise`)만 노출하고 raw model id는 노출하지 않는다.
- 비채택: OpenAI/외부 API(IAM 통합 불가), 자체 호스팅 LLM(GPU 상시 비용 과잉) — ADR 0016 근거 동일.
- **data residency**: `global.` 프로파일은 전 세계 리전으로 라우팅될 수 있다. 입력은 evidence 요약(원본 raw 아님)이라 영향이 제한적이나, residency를 엄격히 묶어야 하면 precise tier를 `apac.anthropic.claude-3-7-sonnet`/`apac.anthropic.claude-sonnet-4`(APAC 한정 프로파일)로 교체 가능.

### 4. 실행 위치: 기존 Dashboard Backend(ECS) 내부 `/chat/query`

- 챗봇은 로그인 세션·RBAC에 묶인 **동기 대화형**이므로 Lambda(보고서 생성, 비동기 배치)와 달리 기존 FastAPI 백엔드에 라우터로 추가한다. `services/ddb.py`·`s3.py`·RDS·`deps/rbac.py`를 그대로 재사용한다.
- ECS task role에 `bedrock-runtime:InvokeModel`(특정 model ARN 한정)을 추가한다.
- 토큰 스트리밍 UX는 기존 `routers/ws.py` WebSocket 경로에 얹는다(후속).

### 5. 처리 흐름

```text
Dashboard Web
  -> POST /chat/query  { question, (optional) factory_id }
      -> Cognito JWT 검증 (deps/auth.py)
      -> RBAC factory 스코프 강제 (deps/rbac.py) — 접근 불가 공장이면 도구 실행 자체 차단
      -> Intent + time parser
            - intent 분류 (현재 상태 / 이력 추세 / 원인 분석 / 보고서 / 이미지)
            - 상대시간 해석 (KST 기준): "어제 오후 3시" -> 2026-06-07 15:00 ±10분 window
            - window 길이에 따라 source 선택: <=1h -> HISTORY#STATE, 그 이상 -> GRAPH#5M
      -> Data tools (Backend가 실행, 결과를 evidence로 요약)
            list_factories() / get_latest(factory) / get_history(factory, window)
            get_report(factory, date) / get_factory_metadata(factory)
            (후속) get_image_snapshots(factory, window)
      -> evidence 요약  (원본 전체 아님)
            위험도 변화 / 직전 대비 온도·습도·AI·infra 변화 / top_causes / 데이터 누락 여부
      -> Bedrock InvokeModel (evidence만 입력, 한국어 설명 생성)
      -> 응답: answer + evidence(확인된 값/추정 분리) + (optional) image_ref
```

- 답변은 **"확인된 값"과 "추정"을 분리**해 표기한다(관제 도구 신뢰성 필수).
- 데이터 누락 시 evidence에 명시하고, LLM이 임의 보간하지 않도록 프롬프트로 통제한다.

### 6. 이미지: 소비(read) 계약만 본 환경에서 정의, 생산(capture)은 워크스트림 A 합의 후

- 현재 카메라가 `available:false`라 표시할 이미지 자체가 없다. **Phase 1 기본 답변에는 이미지를 포함하지 않는다.**
- 동작 규약(후속 활성화 시):
  - 특정 시점 이미지가 있으면 답변 하단에 "관련 이미지 있음"으로 **표시만** 한다.
  - 사용자가 클릭하면 Backend가 RBAC 확인 후 **presigned URL**을 발급한다. LLM에 이미지를 자동 전송하지 않는다.
  - 사용자가 "그 이미지도 분석해줘"라고 **명시**할 때만 multimodal 모델로 보낸다.
  - 원본은 S3, Dashboard에는 thumbnail/presigned URL, metadata는 DDB 또는 RDS.
- **이미지 데이터 계약(소비 측 기준, 박아둠)**:

```text
image_snapshot/{factory_id}/yyyy=YYYY/mm=MM/dd=DD/hh=HH/{message_id}.jpg
```

```json
{
  "factory_id": "factory-a",
  "source_timestamp": "...",
  "message_id": "...",
  "s3_key": "...",
  "sensor_id": "...",
  "related_state_message_id": "...",
  "labels": [],
  "thumbnail_key": "..."
}
```

- **워크스트림 가드**: 엣지 캡처 → S3 업로드 → payload에 `image_key` 기록은 워크스트림 A(엣지/IoT) 합류 지점이다. 본 환경(워크스트림 B)에서는 위 **소비 계약만** ADR로 고정하고, 생산 측 구현은 워크스트림 A와 합의해 별도 ADR로 남긴다(CLAUDE.md 워크스트림 가드 준수).

## 변경 이유

- 일간 보고서(ADR 0016)는 "하루 1회 pull"이라, "지금 factory-b 왜 DEGRADED?", "어제 03시 risk 스파이크 원인?" 같은 ad-hoc 질의를 메우지 못한다. 대화형 진입점이 운영 효율과 포트폴리오 데모("데이터를 해석해 주는 화면") 양쪽에 가치가 크다.
- 관제 도구에서 가장 큰 리스크는 **수치 hallucination**이다. "Backend가 데이터를 찾고 LLM은 설명만" 원칙 + evidence 요약 + 추정/확정 분리로 이를 구조적으로 차단한다.
- 기존 read 서비스·RBAC·Bedrock IAM(ADR 0016)을 재사용하므로 신규 인프라·상시 비용이 최소화된다.

## 영향

- **apps/dashboard-backend** (Step 3~4 구현 완료): `routers/chat.py`(`POST /chat/query`), `services/chat.py`(intent/time parser + Evidence + rule template), `services/bedrock.py`(Converse 호출, 2-tier, `BedrockUnavailableError` 시 rule fallback), `config.py` Bedrock 설정. RBAC를 도구 실행 레이어에 강제 — **챗봇이 RBAC 우회 통로가 되지 않도록** factory 스코프 필터 필수(데이터 조회·LLM 호출 모두 그 뒤).
- **apps/dashboard-web**: `/chat` 독립 페이지를 Workspace에 추가. ChatGPT형 thread + 하단 composer, 공장 선택, 추천 질문, answer/evidence 렌더, generator/tier 라벨 표시. (로컬 구현 완료, 운영 배포 대기)
- **IAM (배포 시 필수, Terraform 구현 + 운영 적용 완료)**: ECS task role에 `bedrock:InvokeModel`/`bedrock:GetInferenceProfile` 추가. inference profile 사용이므로 **profile ARN + 프로파일이 라우팅하는 foundation-model ARN**을 함께 허용한다(`global.` 프로파일은 cross-region 라우팅 가능). 구현: `infra/data-dashboard/ecs.tf` + `variables.tf`, profile/FM resource pattern은 변수로 조정 가능. 2026-06-09 targeted apply로 task role policy 적용, IAM simulation allowed 확인.
- **네트워크 egress (배포 시 필수, 현 구성 확인 완료)**: ECS는 private app subnet에서 `assign_public_ip=false`로 실행되고, private route table은 NAT Gateway 기본 경로를 보유한다. 따라서 Bedrock 호출은 현 Phase 1 NAT 경유로 가능하다. S3/DynamoDB는 gateway endpoint로 NAT 비용을 줄이고, Bedrock interface endpoint는 별도 비용이 있어 현 단계 비채택. NAT 제거 프로파일로 전환하면 `com.amazonaws.<region>.bedrock-runtime` VPC endpoint를 추가해야 한다.
- **비용**: 상시 자원 없음(요청 기반 Bedrock 과금, fast=Haiku 4.5 / precise=Sonnet 4.6 token 단가). `docs/ops/15_aws_cost_baseline.md`에 tier별 단가·예상 호출량 항목 반영.
- **이미지**: 소비 계약 고정. 생산 측 미구현 — `get_image_snapshots`/multimodal은 워크스트림 A 합의 후 활성화.

## 도입 순서

1. 본 ADR(`0033`)을 candidate→accepted로 승급(사용자 승인).
2. ✅ Backend `POST /chat/query` 라우터 + intent/time parser + data tool 래퍼 추가.
3. ✅ **LLM 없이 rule/template 기반 답변 먼저 구현** — 도구·RBAC·window 해석을 단위 테스트로 확보.
4. ✅ **Bedrock 호출 추가** — evidence → 자연어(한국어), 추정/확정 분리, intent별 2-tier(fast/precise), 실패 시 rule fallback. (2026-06-08, 라이브 invoke 검증)
5. ✅ **배포 인프라**: ECS task role IAM(InvokeModel + inference profile/FM ARN) + Bedrock egress(NAT 경유) Terraform 구현. IAM은 2026-06-09 운영 적용 완료. ECS task definition env 반영과 backend image rollout은 `/chat/query` image 배포 단계에서 수행.
6. ✅ **Dashboard 챗봇 UI**: `/chat` 페이지 + Workspace sidebar 항목 + API client 연결. (로컬 구현 완료, 운영 배포 대기)
7. 이미지 snapshot **metadata 조회 + presigned URL**(생산 측 캡처는 워크스트림 A 합의 후).
8. 문서/보고서 **RAG는 마지막**(S3 reports/운영 문서 한정).

## 업데이트 필요한 문서

- `docs/specs/monitoring_dashboard/02_api_spec.md` — `/chat/query` 요청/응답 스키마 추가
- `docs/specs/data_storage_pipeline.md` — image_snapshot 경로/metadata 계약 추가(소비 측 기준)
- `docs/ops/15_aws_cost_baseline.md` — Bedrock 챗봇 호출 단가/예상량 반영 완료
- `docs/planning/16_data_dashboard_vpc_workplan.md` — Phase 1 Step에 챗봇 항목 반영 여부 결정
- `docs/changes/README.md` — 목록 추가(본 문서)
- `docs/issues/SESSION_STATE.md` — 착수 시 상태 갱신

## 검증

- ✅ Backend (2026-06-08): `tests/test_chat.py`(31) + `tests/test_chat_bedrock.py`(9). intent/factory/KST time 파싱, Evidence 빌더, RBAC 차단(403, LLM 미호출), Bedrock tier 선택(cause→precise), 실패 시 rule fallback, DDB 504. 전체 백엔드 **146 passed**. 테스트는 `BEDROCK_ENABLED=false` + generate_answer stub으로 네트워크 미사용.
- ✅ 라이브 Bedrock invoke (ap-south-1, account 611058323802): fast(Haiku 4.5)·precise(Sonnet 4.6) 두 tier 실제 호출 성공. confirmed 값만 단정, inferred는 "추정:" 분리, missing은 데이터 한계 명시 — 시스템 프롬프트 규칙 준수 확인.
- ✅ Web (2026-06-09): `/chat` 페이지 렌더/API client/sidebar route 구현. `npm run lint`, `npm test -- --run`(80 passed), `npm run build` 통과(Vite chunk size warning only).
- ✅ 운영 IAM/egress (2026-06-09): ECS task role policy targeted apply 완료, `bedrock:InvokeModel`/`bedrock:GetInferenceProfile` simulation allowed. ECS private app subnet은 NAT Gateway default route 보유, `/healthz` 200, `/readyz` dynamodb/redis/rds_metadata ok.
- ⬜ 운영 rollout: `/chat/query` 포함 backend image push, ECS task definition env와 image tag 반영, dashboard-web 배포/CloudFront invalidation 후 화면에서 실제 질의 확인.
