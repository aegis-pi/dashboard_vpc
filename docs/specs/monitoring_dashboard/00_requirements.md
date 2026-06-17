# Monitoring Dashboard 요구사항

상태: source of truth
기준일: 2026-04-28

## 목적

현재 `factory-a`에서 실제 사용하는 Grafana dashboard 요구사항을 정리한다.

## 현재 상태

- 현재 dashboard는 별도 Web API가 아니라 Grafana UI에서 구성한다.
- Datasource는 InfluxDB와 Prometheus를 사용한다.
- InfluxDB는 센서/AI/소리 데이터를 표시한다.
- Prometheus는 Node Exporter Full `1860` dashboard로 노드 상태를 표시한다.

## Datasource

| Datasource | 역할 |
| --- | --- |
| InfluxDB | 온도, 습도, 기압, AI 감지, 소리 감지 |
| Prometheus | 노드 CPU, Memory, Disk, Network |

## 필수 Panel

| Panel | Datasource | Measurement / Field | 표시 |
| --- | --- | --- | --- |
| 현장 온도 | InfluxDB | `environment_data.temperature` | Time series |
| 현장 습도 | InfluxDB | `environment_data.humidity` | Time series |
| 현장 기압 | InfluxDB | `environment_data.pressure` | Time series |
| 화재 감지 | InfluxDB | `ai_detection.fire_detected` | Stat |
| 넘어짐 감지 | InfluxDB | `ai_detection.fallen_detected` | Stat |
| 굽힘 감지 | InfluxDB | `ai_detection.bending_detected` | Stat |
| 이상 소음 감지 | InfluxDB | `acoustic_detection.is_danger` | Stat |
| 노드 상태 | Prometheus | Node exporter metrics | Dashboard 1860 |

## AI 상태 해석

AI/Sound panel은 최근 N개 값을 평균낸 뒤 상태로 표시한다.

기본 N:

```text
10
```

N 변경 위치:

```text
Grafana panel query의 LIMIT 숫자
```

상태 매핑:

```text
0.0-0.2: 안전
0.3-0.7: 주의
0.8-1.0: 위험 레이블
```

위험 레이블:

```text
fire_detected -> 화재
fallen_detected -> 넘어짐
bending_detected -> 굽힘
is_danger -> 감지된 소리 레이블 또는 이상 소음
```

## 구현 제약

- Dashboard 등록과 panel 구성은 Grafana UI에서 진행한다.
- API 기반 dashboard는 후속 Hub/Risk Twin 단계에서 다룬다.
- 현재 `factory-a` dashboard는 단일 공장 운영 관제용이다.
- AWS Hub의 멀티 공장 Risk Twin dashboard와 혼동하지 않는다.
- 후속 사용자 대시보드는 Tailscale 접근이 아니라 1번 Data / Dashboard VPC의 CloudFront/ALB/Auth 뒤에서 제공한다. WAF/Shield는 후속 보안 강화 후보로 둔다.
- 후속 Dashboard Web/API는 Spoke K3s, ArgoCD, Control / Management VPC의 EKS API, Tailscale 관리망을 직접 조회하지 않고 DynamoDB LATEST/HISTORY와 S3 processed를 조회한다.

후속 계획:

```text
docs/planning/07_dashboard_vpc_extension_plan.md
```

## 완료 기준

```text
Grafana UI 접근 가능
InfluxDB datasource 연결 성공
Prometheus datasource 연결 성공
환경 센서 time series 갱신
AI/Sound stat panel 상태 표시
Node Exporter Full 1860 dashboard 표시
```
