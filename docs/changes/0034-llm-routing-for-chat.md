ID:        0034
제목:      llm-routing-for-chat
상태:      proposed
결정일:    2026-06-09
영향 범위: M6, apps/dashboard-backend(/chat: services/chat·bedrock, routers/chat, config), Bedrock(Converse tool-use 추가 1콜), 비용 baseline. 데이터 합류 지점(IoT/DDB/S3/RDS) 무변경.

> 근거: 대화 2026-06-09 + 외부 모범사례 조사(function calling / agentic RAG / 경량 라우터). ADR 0033의 "결정형 라우팅 우선, LLM tool-calling은 후속 옵션"에서 **후속 옵션을 채택**하는 후속 ADR이다.

## 수정 이력

| 날짜 | 버전 | 요약 |
| --- | --- | --- |
| 2026-06-09 | v0.1 | 최초 작성(proposed). Phase 1(LLM Resolve) + Phase 2(spike_check) 설계 확정. |
| 2026-06-09 | v0.2 | 절대 구간(interval) time.mode 추가 + 규칙 파서 spike/interval 보강(아래 §결정 4). "오전 9시~10시"가 trailing 1h로 오해석되던 버그 수정. |

## 기존 계획

- ADR 0033은 **결정형 intent/time parser**(`services/chat.parse_query`)가 도구를 선택하고, LLM은 evidence를 설명만 하도록 했다. intent 종류가 결정형으로 감당 안 되면 그때 Bedrock Converse tool-use(에이전트형)로 진화한다고 명시(현 단계 비채택)했다.
- 실사용에서 자유도 높은 질문이 깨지는 것이 확인됐다:
  - "오후 12시 즈음 factory-a ai score가 특정값으로 튄 값이 있는지 확인해줘" → ① 규칙 파서가 "오후 12시 즈음"·"튄 값"을 intent/시간으로 해석 못 함, ② 스파이크/이상값 탐지 도구가 백엔드에 없음.
- 즉 실패 원인은 **(A) 질의 이해(규칙 파서 한계) + (B) 도구 커버리지 부재** 두 가지다.

## 변경된 실제 기준

ADR 0033의 데이터 경로(RBAC → 결정론적 도구 → Evidence → LLM 설명)와 무환각 설계는 **그대로 유지**하고, 맨 앞에 **LLM Resolve(질의 이해/파라미터 추출) 단계**를 추가한다. 모범사례의 "경량 라우터로 추출하고 reasoning은 downstream에 아낀다" 패턴(function calling / agentic RAG)이다.

```
query
 ├─(1) LLM Resolve (Haiku 4.5, Converse tool-use, toolChoice 강제)   ← 신규
 │      → resolve_query(intent, factory_id, time{mode,anchor_kst,window,start_kst,end_kst}, metric, threshold, comparison)
 ├─(2) map_resolution + 검증(factory 패턴·시간 미래/범위 clamp·enum)  ← 신규(환각 게이트)
 ├─(3) RBAC factory-scope 체크                                        ← 기존 유지(도구 실행 前)
 ├─(4) 결정론적 데이터 도구(DDB get_latest/get_history + detect_spikes) ← Phase 2 도구 추가
 │      → Evidence(confirmed/inferred/missing)                        ← 기존 유지
 └─(5) LLM Synthesis(Haiku/Sonnet 사용자 선택)                        ← 기존 유지
```

### §10 결정 (확정)

1. **시간 해석**: LLM이 한국어 자유 시간표현을 `time{mode, anchor_kst(KST ISO), window}`로 정규화 → 백엔드가 검증·clamp(미래 거부, range 윈도 파싱 실패 시 fallback). "즈음"의 유연성은 LLM이, timestamp 환각 차단은 백엔드 검증이 담당.
2. **라우팅 플래그**: `chat_routing_enabled`(기본 on, 단 `bedrock_enabled`가 켜져 있을 때만 동작). resolve 실패/타임아웃/무효 → **규칙 파서로 graceful fallback**(이중 안전망: resolve 실패 → 규칙 파서 / synthesis 실패 → 템플릿).
3. **spike 알고리즘**: 구간 통계 기반 z-score(|v−rolling_mean| > k·std) 기본 + 명시 `threshold` 교차 옵션. 전부 결정론적 순수 계산(환각 0).
4. **절대 구간(interval) 지원 (v0.2 추가)**: `time.mode`에 `interval`(`start_kst`/`end_kst`) 추가. 기존 `range`는 끝이 현재(now)인 **trailing** 구간 전용이고, "오전 9시~10시"·"어제 2시부터 4시까지"처럼 **시작·끝이 모두 있는 절대 구간**은 interval로 표현한다.
   - 백엔드(`_timescope_from_resolution`/`_interval_timescope`) 검증: 역순 구간 swap, 끝이 미래면 now로 clamp, 전체가 미래면 6h trailing range fallback. 시작이 1h 이상 과거면 HISTORY#STATE(TTL 2h) 대신 GRAPH#5M(5분 집계, 48h)을 조회하도록 source window를 선택 → AI `*_max`/`ai_max_score` 필드가 있는 소스에서 스파이크 판정.
   - `_fetch_evidence`는 interval/range 모두 `[start, end]`로 fetch를 경계 짓는다(end 필터). 기존엔 range가 end 필터 없이 now까지 조회.
   - **규칙 파서 보강(fallback 동등성)**: `parse_intent`에 spike 키워드(`튄`/`스파이크`/`이상치`…) 추가(기존엔 SPIKE_CHECK를 전혀 못 만듦), `parse_time`에 "N시~M시" interval 정규식, `_parse_spike_params`로 metric/threshold/comparison 추출. LLM resolve 실패 시에도 같은 질의를 해석.

### 무환각·안전 설계 (불변)

- 최종 answer는 **Evidence(confirmed)에만 근거**. confirmed/inferred/missing 구조 유지.
- LLM 추출 파라미터는 **도구·RBAC 실행 前 검증**: factory_id는 `^factory-[a-z0-9-]+$`만 허용(아니면 미식별 → 되물음), 시간 미래 clamp, intent/metric/comparison는 enum 화이트리스트.
- **RBAC는 LLM이 factory를 골라도 도구 실행 前 재검증**(기존 가드 유지) — 챗봇이 RBAC 우회 통로가 되지 않음.
- Resolve LLM은 질문 텍스트만 입력(공장 데이터 접근 아님)이라 RBAC 前 호출해도 무방.

### 모델·비용

| 단계 | 모델 | 근거 |
| --- | --- | --- |
| Resolve(추출/라우팅) | Haiku 4.5(`bedrock_resolve_model`, 기본=fast와 동일) | 분류·추출 작업, 추론 불필요, 빠름·저렴 |
| Synthesis(설명) | Haiku/Sonnet 4.6 사용자 선택(현행 유지) | 근거 위 nuance 설명 |

- 쿼리당 +1 Haiku Converse 호출(입력 ~1–2K/출력 ~150 토큰). 비용·지연 영향은 `docs/ops/15_aws_cost_baseline.md`에 반영.

## 단계 (Phase)

- **Phase 1 — LLM Resolve 도입**: Converse tool-use 추출 + `map_resolution` 검증 + 규칙 fallback + `chat_routing_enabled` 플래그. intent enum = current_status/history_trend/cause_analysis/report/unknown. 자유 시간표현 처리.
- **Phase 2 — 능력 확장(spike_check)**: `Intent.SPIKE_CHECK` + `detect_spikes`(결정론적, 기존 history 재사용) + `summarize_spikes` Evidence + synthesis 프롬프트 보강.
- **Phase 3(옵션, 미채택 보류)**: 멀티스텝 tool-runner(비교/다단계). 지연·비용·복잡도 증가로 실제 필요 확인 시에만.

## 영향

- 신규 파일: 본 ADR, `tests/test_chat_resolve.py`, `tests/test_chat_spike.py`.
- 변경: `apps/dashboard-backend/{config.py, services/chat.py, services/bedrock.py, routers/chat.py}`, `tests/conftest.py`(라우팅 기본 off env).
- AWS: Bedrock Converse 호출 1콜 추가(IAM 권한은 기존 `bedrock:InvokeModel`/Converse 동일 — 신규 권한 불필요). DDB/S3/RDS/IoT 무변경.
- 워크스트림 A 자산 무변경.

## 업데이트 필요한 문서

- `docs/issues/SESSION_STATE.md`, `docs/issues/MASTER_CHECKLIST.md`(Phase 1 Step 10 챗봇 항목)
- `docs/ops/15_aws_cost_baseline.md`(resolve 호출 비용)
- `docs/changes/README.md`(0034 행 추가)

## 검증

- 단위: `map_resolution`(range/point/future-clamp/bad-factory/unknown-intent), 규칙 fallback 경로, `detect_spikes`(합성 시계열 z-score/threshold).
- 골든셋: 대표 질문 → 기대 ParsedQuery(스파이크 예시 포함), mock tool_use 응답(실 Bedrock 無 — 기존 `test_chat_bedrock` 방식).
- 회귀: 기존 BE 테스트 전부 통과.
- 수동: Bedrock Converse tool-use 1회 연결 스모크(배포 시).
