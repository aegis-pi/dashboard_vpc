# Monitoring Dashboard 화면 계획

상태: source of truth
기준일: 2026-05-29
수정 이력:
  - 2026-05-29  Risk Twin Web Environment History 그래프 기준 추가.

## 목적

현재 `factory-a` Grafana 화면 구성을 정리한다.

## 화면 구성

## Risk Twin Web - Factory Environment History

안전 점수 추이:

```text
6h:  5분 bucket, 72 points
12h: 10분 재집계 bucket, 72 points
24h: 20분 재집계 bucket, 72 points
```

렌더링:
- `risk_score_avg`: 굵은 실선
- `risk_score_max`: 얇은 점선
- `risk_score_avg` ~ `risk_score_max`: 연한 음영
- threshold 85/50: 수평 점선
- tooltip: 시간 구간, 평균값, 최대값, 샘플 수

### 1. 환경 센서 영역

Panel:

```text
현장 온도
현장 습도
현장 기압
```

표시 방식:

```text
Time series
```

목적:
- 센서 수집이 지속되는지 확인한다.
- 장애 전후 데이터 공백을 시각적으로 확인한다.

### 2. AI 결과 영역

Panel:

```text
화재 감지
넘어짐 감지
굽힘 감지
이상 소음 감지
```

표시 방식:

```text
Stat + Value mapping
```

목적:
- 최근 N개 평균값으로 안전/주의/위험 상태를 표시한다.
- 원본 0/1 값보다 운영자가 해석하기 쉬운 상태 레이블을 제공한다.

### 3. 노드 상태 영역

Dashboard:

```text
Node Exporter Full 1860
```

목적:
- master, worker1, worker2의 CPU/Memory/Disk/Network 상태를 본다.
- 장애 테스트 중 worker2 상태 변화를 확인한다.

## 화면 운영 원칙

- 현재 화면은 `factory-a` 단일 공장 운영용이다.
- Grafana dashboard 등록은 사용자가 UI에서 수행한다.
- 별도 Web dashboard는 Data / Dashboard VPC 확장 단계에서 다룬다.
- 멀티 공장 비교 화면은 AWS Hub/Risk Twin 단계에서 다룬다.

## 장애 테스트 시 확인할 화면

LAN 제거 또는 전원 제거 테스트 중:

```text
1. Node Exporter 1860에서 worker2 상태 변화 확인
2. 환경 센서 time series 공백 확인
3. AI/Sound stat 변화 확인
4. failback 후 데이터 재개 확인
```

## 빈 상태 / 오류 상태

Grafana에서 값이 비는 경우 우선 확인:

```text
InfluxDB datasource 연결
measurement / field 이름
time range
query LIMIT
Prometheus datasource 연결
Node exporter target 상태
```
