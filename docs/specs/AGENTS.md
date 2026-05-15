# docs/specs/ AGENTS.md

> 기능별 상세 요구사항과 인터페이스/데이터 설계 (도구 중립).
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 구현 전 합의가 필요한 화면·API·데이터 구조를 관리한다
- 운영 절차/장애 대응은 `../ops/`로 분리

## 파일·하위 폴더

| 경로 | 내용 |
| --- | --- |
| `iot_data_format.md` | **Edge Agent → IoT Core 전송 포맷, topic, S3 raw path, 전송 주기** |
| `data_storage_pipeline.md` | **IoT Core 이후 S3 raw/processed, DynamoDB LATEST/HISTORY 저장 경로/포맷** |
| `monitoring_dashboard/` | 관제 화면 요구사항·화면 구성·API·데이터 모델 |

## monitoring_dashboard/

```
00_requirements.md            요구사항
01_screen_plan.md             화면 구성
02_api_spec.md                API 명세
03_data_model.md              데이터 모델
04_risk_twin_web_screen_design.md
05_screen_data_mapping.md
```

## 데이터 흐름 고정

```
Edge Agent
  -> AWS IoT Core
      -> IoT Rule -> S3 raw
      -> Lambda data processor -> DynamoDB LATEST + DynamoDB HISTORY + S3 processed
      -> Dashboard API/Web
```

## 핵심 결정

- `source_type`은 **`factory_state` / `infra_state` 두 개**로 확정
- `factory_state` = 3초 주기 공장 상태 (Risk Score 입력)
- `infra_state` = 20초 주기 노드/워크로드/장치/heartbeat (운영 상태)
- AI 결과는 Edge에서 최종 판정하지 않고 최근 N개 또는 3초 window 평균 score로 전송
- `pipeline_status`는 Edge가 보내지 않고 cloud-side Lambda에서 계산
- `pipeline_heartbeat`는 별도 topic 아님. `infra_state.payload.heartbeat`에 포함

## 작성 규칙

- 토픽/스키마/필드 추가 시 `iot_data_format.md`와 `data_storage_pipeline.md`를 함께 갱신
- API spec 변경 시 `monitoring_dashboard/02_api_spec.md`와 `03_data_model.md` 동시 갱신
- 화면 spec 변경 시 `01_screen_plan.md` + `05_screen_data_mapping.md` 동시 갱신
- 명세 변경 사유는 `../changes/` 또는 `../planning/13_architecture_adr_backlog.md`에 ADR 후보로 남긴다

## 참조

- 제품 요구: `../product/02_requirements_definition.md`
- 클라우드 배치: `../planning/15_cloud_architecture_final.md`
- Edge Agent 배포: `../planning/06_edge_agent_deployment_plan.md`
