# Cloud Infra View — Backend/Frontend 구현 계약

상태: draft
기준일: 2026-06-01 / 언어: 한국어 (개조식)
수정 이력:
  - 2026-06-01  초안. Cloud infra 상태를 관제 화면에 추가하기 위한 BE/FE 계약. 데이터 계약은 `docs/planning/29` / ADR 0027.

## 목적

- 관제 화면에 공장 상태와 **분리된** Cloud infra 상태 화면을 추가한다(sidebar 별도 항목).
- 데이터 수집/저장(collector → DynamoDB `CLOUD#infra` / S3)은 **팀원 담당**이고 본 환경(BE/FE)은 그것을 **읽어서 보여주는 쪽**이다.
- collector가 아직 DDB에 쓰기 전이라도 BE/FE 골격을 먼저 만들어, 데이터가 채워지면 **코드 변경 최소로 바로 표시**되게 한다.

데이터 스키마(필드 보장 / `errors[]` / `reasons[]` / staleness / HISTORY reduced)의 source of truth는 `docs/planning/29_cloud_infra_metrics_pipeline_plan.md`다. 본 문서는 그 위에서의 **BE/FE 인터페이스 계약**만 정의한다.

## 데이터 출처와 경계 (중요)

- Backend는 **EKS API / Kubernetes API / ArgoCD / CloudWatch에 직접 붙지 않는다.** 기존 결정(`docs/planning/07`, `03_data_model.md` 명시적 비채택) 그대로다.
- Backend는 **기존 DynamoDB 테이블 `AEGIS-DynamoDB-FactoryStatus`의 `pk=CLOUD#infra` item만 추가로 read**한다. 이 item은 collector(팀원)가 write한다.
- 즉 EKS/ArgoCD를 건드리는 건 collector(워크스트림 A 합류 지점, ADR 0027)이고, BE/FE는 read model만 소비하므로 경계가 유지된다.

```text
collector(팀원)  -> DynamoDB CLOUD#infra (LATEST / HISTORY#FAST / HISTORY#SLOW)
                 -> S3 processed/cloud_infra/ (full snapshot)
Backend(본 환경) -> DDB GetItem/Query (기존 ddb_table_status 재사용)
                 -> staleness 계산 후 응답
Frontend(본 환경)-> /cloud-infra 화면에 표시
```

## Backend 계약

### 신규 파일 (기존 패턴 재사용)

| 파일 | 역할 | 참고 |
| --- | --- | --- |
| `apps/dashboard-backend/services/cloud_infra.py` | DDB read (LATEST / HISTORY) + staleness 계산 | `services/ddb.py` 패턴 재사용, `get_settings().ddb_table_status` 동일 테이블 |
| `apps/dashboard-backend/routers/cloud_infra.py` | REST endpoint | `routers/factories.py` 패턴 재사용 |

- DDB 접근은 기존 `services/ddb.py`의 `_run_ddb` executor 패턴을 따른다. 테이블은 `ddb_table_status`(이미 `CLOUD#infra`와 동일 테이블).
- IAM은 기존 read-only(`Query`/`GetItem`)로 충분하다. 신규 권한 불필요.

### Endpoint

| Method | Path | 인증 | 동작 | DDB 조회 |
| --- | --- | --- | --- | --- |
| GET | `/cloud-infra` | Cognito JWT | 현재 Cloud infra 상태(LATEST) + staleness | GetItem `pk=CLOUD#infra, sk=LATEST` |
| GET | `/cloud-infra/history?window=1h\|6h\|24h&track=fast\|slow` | Cognito JWT | 추이(reduced) | Query `pk=CLOUD#infra, begins_with(sk, HISTORY#FAST#\|HISTORY#SLOW#)` |

- 추이 조회 계약(window/정렬/limit/다운샘플링)은 `docs/planning/29` § Backend 조회 방식 그대로.
- `track` 기본값: `fast`.

### `/cloud-infra` 응답 모델

LATEST를 거의 그대로 노출하되 **staleness는 backend가 read 시점에 계산해서 덧붙인다**(죽은 collector는 스스로 stale을 못 쓰므로). doc 29 Open Question 4의 "최소 변환" 방향.

```json
{
  "available": true,
  "schema_version": "cloud-infra-status-v1",
  "updated_at": "2026-06-01T15:30:00Z",
  "fast_updated_at": "2026-06-01T15:30:00Z",
  "slow_updated_at": "2026-06-01T15:25:00Z",
  "fast_stale": false,
  "slow_stale": false,
  "fast_age_seconds": 35,
  "slow_age_seconds": 320,
  "overall_status": "warning",
  "fast": { "...": "doc 29 LATEST.fast 그대로" },
  "slow": { "...": "doc 29 LATEST.slow 그대로" }
}
```

staleness 기준(doc 29): `fast` age > 180초, `slow` age > 900초 → 해당 쪽 section을 `unknown` 처리하고 `overall_status`에 반영.

### 데이터 없음 / 부분 상태 처리

- **collector가 아직 write 전이라 item이 없으면** → HTTP 200 + `{ "available": false }`. (404 아님 — FE가 "수집 대기" empty-state로 다룸)
- section `status=unknown` + `errors[]`는 doc 29 계약대로 그대로 통과시킨다(backend가 숨기지 않음).
- 필드 보장 규칙(top-level 항상 존재 / section 데이터 필드 nullable)도 doc 29 § 필드 계약 그대로.

## Frontend 계약

### Sidebar (분리된 항목)

- 새 nav 섹션 `System` 추가, 항목 **`클라우드 인프라`** (`/cloud-infra`). factory 목록과 분리.
- `components/Layout.tsx`의 `Sidebar`에 항목 추가, `lucide-react` 아이콘(예: `Server` / `Cpu`).
- overall_status에 따라 dot 색 표시(공장 카드 dot과 동일 컨벤션).

### 신규 파일

| 파일 | 역할 | 재사용 |
| --- | --- | --- |
| `pages/CloudInfraPage.tsx` | Cloud infra 대시보드 화면 | `Shell`/`TopBar` 레이아웃 |
| `hooks/useCloudInfra.ts` | `/cloud-infra` polling | `useFactory.ts` 패턴 |
| `hooks/useCloudInfraHistory.ts` | `/cloud-infra/history` 추이 | `useFactoryHistory.ts` 패턴 |
| `api/client.ts` (추가) | `fetchCloudInfra`, `fetchCloudInfraHistory` | 기존 `apiFetch` |
| `api/types.ts` (추가) | `CloudInfraStatus` 등 타입 | doc 29 스키마 기반 |
| `adapters/cloudInfra.ts` | 응답 → 화면 모델 정규화 | `adapters/factory.ts` 패턴 |

### 화면 구성 (section 카드)

| 카드 | 데이터 | 표시 |
| --- | --- | --- |
| 요약 헤더 | `overall_status`, `fast_stale`/`slow_stale`, `*_updated_at` | 전체 배지 + 마지막 갱신 시각 + stale 배지 |
| Backend runtime | `fast.backend_runtime` (ECS/ALB/CloudFront) | status 배지 + `reasons[]` + 지표 |
| Datastores | `fast.datastores` (Redis/RDS) | status 배지 + `reasons[]` + 지표 |
| Data pipeline | `fast.data_pipeline` (Lambda/DDB/DLQ/Scheduler) | status 배지 + `reasons[]` |
| Factory freshness | `fast.factory_freshness` | 공장별 freshness/risk |
| EKS management | `slow.eks_management` (cluster/node/pod/ArgoCD) | status 배지 + 카운트 |
| Storage freshness | `slow.storage_freshness` | S3 object age |
| 추이 | `/cloud-infra/history` reduced 숫자 필드 | `Chart`/`Sparkline` 재사용 |

### 상태 → 색 매핑 (재사용)

| status | 색 토큰 | 의미 |
| --- | --- | --- |
| `normal` | `--safe` | 정상 |
| `warning` | `--warn` | 주의 |
| `critical` | `--crit` | 위험 |
| `unknown` | `--chrome-ink-3` (회색) | **측정 실패/오래됨** (빨강 아님) |

- `reasons[]`는 그대로 칩/리스트로 보여준다(이유 재계산 금지). 비었으면 표시 안 함.
- `status=unknown`이면 `errors[]`를 펼침/툴팁으로 보여준다.

## Plug-in 전략 (지금 만들고 나중에 바로 연결)

1. **단계 1 — 지금 (collector write 전)**
   - Backend: endpoint 2개 구현. item 없으면 `{available:false}` 반환.
   - Frontend: sidebar 항목 + 페이지 + 카드 + empty-state("Cloud infra 수집 대기") 구현.
   - 검증/개발용 fixture는 **doc 29의 LATEST/HISTORY 예시 JSON을 그대로** 사용(`__tests__` mock).
2. **단계 2 — 팀원이 DDB에 `CLOUD#infra` write 후**
   - Backend read가 실제 값을 반환 → Frontend가 자동으로 표시. **코드 변경 거의 없음.**
   - 실제 응답으로 필드/단위/`reasons[]` 토큰을 doc 29와 대조해 미세 조정만.
3. 단계 1을 mock fixture로 만들어두면 단계 2 전환은 "backend가 빈 응답 대신 실제 item을 받는 것"뿐이다.

## 구현 순서

1. Backend `services/cloud_infra.py` + `routers/cloud_infra.py` + main router 등록. pytest(없을 때 `available:false`, 있을 때 staleness 계산).
2. Frontend 타입/adapter/client + 페이지 + sidebar 항목 + empty-state. vitest(정규화/배지 색/stale 표시).
3. doc 29 LATEST 예시로 end-to-end mock 확인.
4. (팀원 데이터 후) 실제 DDB 값으로 정합성 미세 조정.

## 명시적 비채택 / 경계

- Backend는 EKS/Kubernetes/ArgoCD/CloudWatch에 직접 붙지 않는다(collector만). read model 소비만.
- 쓰기 API 없음(읽기 전용 관제).
- Cloud infra용 신규 AWS 리소스는 BE/FE 쪽에서 만들지 않는다. collector/스케줄러는 팀원(ADR 0027).
