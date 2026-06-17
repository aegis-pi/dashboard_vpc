# 사용자 플로우

상태: source of truth
기준일: 2026-06-17

수정 이력:
- 2026-06-17 v0.2  운영 Dashboard Web 실제 route와 기능(Fleet, Factory, Cloud Infra, Reports, Image Snapshots, AI Chat, Admin Users)을 반영.

## 목적

운영자가 시스템에 들어와 어떤 정보를 어떤 순서로 보는지 정리한다.

## 현재 상태

- 현재 구현된 사용자 흐름은 두 층이다.
  - 현장/운영자: `factory-a` 현장 Grafana 확인 흐름
  - 본사 관제 담당자: Dashboard Web(`apps/dashboard-web`)에서 공장 위험 상태, Cloud Infra, 보고서, 이미지 증빙, AI Chat, 사용자 권한을 확인하는 흐름
- 2026-06-16 기준 Data/Dashboard 일시 root는 비용 절감을 위해 destroy 완료 상태이므로 실제 시연 전 `scripts/build/build-data-dashboard.sh`로 재생성해야 한다.

## 주요 사용자

- 현재 사용자: `factory-a` 현장 운영자 또는 구축 담당자
- MVP 사용자: 본사 관제 담당자, 본사 관리자

## 현재 `factory-a` 흐름

1. Grafana `http://10.10.10.202`에 접속한다.
2. InfluxDB 기반 센서 패널을 확인한다.
3. 온도, 습도, 기압의 최근 추세를 본다.
4. AI 결과 패널에서 최근 N개 평균 상태를 확인한다.
5. Prometheus dashboard `1860`에서 노드 CPU, memory, disk, network 상태를 확인한다.
6. 장애 테스트 후에는 InfluxDB bucket count로 데이터 공백과 중복 write 여부를 확인한다.

## 현재 대시보드 해석

| 항목 | 표현 |
| --- | --- |
| 화재 감지 | `안전 / 주의 / 화재` |
| 넘어짐 감지 | `안전 / 주의 / 넘어짐` |
| 굽힘 감지 | `안전 / 주의 / 굽힘` |
| 이상 소음 | `안전 / 주의 / 필터링된 소리 레이블` |

최근 N개 기본값은 `10`이다. Grafana Query의 `LIMIT 10`을 조정하면 평가 개수를 바꿀 수 있다.

## MVP 사용자 목표

본사 관제 담당자의 1차 목표는 아래와 같다.

1. 여러 공장 중 지금 가장 위험한 공장을 식별한다.
2. 그 공장이 왜 위험한지 빠르게 확인한다.
3. 현장 이상인지, 수집 이상인지, 시스템 이상인지 구분한다.
4. 필요 시 운영 대응 또는 상세 확인으로 이어진다.

## Dashboard 기본 흐름

1. Cognito Hosted UI로 로그인한다.
2. `/auth/me` 권한에 따라 접근 가능한 공장과 시스템 메뉴가 결정된다.
3. `/` Fleet 화면에서 공장별 현재 안전점수와 위험 상태를 확인한다.
4. `/factory/:factoryId`에서 센서/AI 추세, top_causes, Timeline, WebSocket 상태를 확인한다.
5. 시스템 권한 사용자는 `/cloud-infra`에서 backend/datastores/data_pipeline/factory_freshness 상태를 확인한다.
6. `/reports`에서 S3 `reports/daily/` Markdown 보고서를 날짜·공장 기준으로 조회하고 PDF/Word로 내보낸다.
7. `/image-snapshots`에서 S3 `image_snapshot/` 증빙 이미지를 시간 범위로 필터링한다.
8. `/chat`에서 자연어로 현재 상태, 원인, 추이, 스파이크, 보고서, 이미지 증빙을 질의한다.
9. 관리자 권한 사용자는 `/admin/users`에서 사용자 생성·수정·삭제와 공장 접근 권한을 관리한다.

## 메인 화면 기준 상세 흐름

### 1. 상태 스캔

사용자는 먼저 상단 위험 카드에서 전체 공장 상태를 훑는다.

확인 포인트:

- 어떤 공장이 `위험` 상태인지
- 어떤 공장이 `주의` 상태인지
- 최근 10분 동안 상태가 악화 중인지

### 2. 우선 대응 대상 식별

판단 기준:

- `위험` 상태 공장을 먼저 본다.
- 같은 위험도라면 `상승` 중인 공장을 우선 본다.
- 이상 시스템 개수가 많은 공장을 주의 깊게 본다.

### 3. 원인 축 분리

사용자는 원인을 아래 두 축으로 나눠 본다.

- 센서/AI 축
  - 온도/습도/기압
  - 화재/자세/소리 결과
  - 최근 추세
- 시스템 축
  - 엣지 에이전트
  - 노드
  - 카메라
  - 마이크
  - 데이터 수집 파이프라인

### 4. 시간 흐름 확인

사용자는 로그를 통해 아래를 확인한다.

- 상태가 언제 바뀌었는가
- 이상이 언제 시작되었는가
- 복구가 있었는가
- 최근 주요 운영 이벤트가 무엇인가

### 5. 증빙과 설명 확인

사용자는 보고서·이미지·AI Chat으로 판단 근거를 보강한다.

- S3 일간 보고서 Markdown으로 해당 날짜 주요 이벤트를 확인한다.
- 이미지 스냅샷으로 특정 시간대 AI 감지 증빙을 확인한다.
- AI Chat은 Backend가 RBAC를 검증한 뒤 DynamoDB/S3/RDS 근거를 조회하고, Bedrock이 확인된 evidence를 설명하는 구조다.

## 예외 흐름

- 데이터가 들어오지 않음
  - `pipeline_status` 또는 `sensor_status` 이상으로 표시
- 운영형 Spoke 배포 실패
  - 보수적 수동 확인
- 테스트베드형 Spoke 배포 실패
  - 자동 롤백 허용
- 센서값이 `null`
  - `미수신` 또는 `확인 필요` 상태로 처리
- Bedrock 응답 실패
  - Backend rule/template 답변으로 degrade
- WebSocket 연결 실패
  - 주기적 REST 조회로 보완

## 사용자 경험 목표

- 숫자보다 상태를 먼저 이해할 수 있어야 한다.
- 한 화면 안에서 `위험 -> 원인 -> 시간 흐름`을 따라갈 수 있어야 한다.
- 테스트베드형 Spoke도 운영형과 동일한 관제 구조 안에서 검증 가능해야 한다.
