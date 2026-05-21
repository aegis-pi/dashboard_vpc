# Risk Twin Web Screen Design

상태: source of truth
기준일: 2026-05-20

## 목적

이 문서는 후속 Data / Dashboard VPC에서 제공할 Aegis-Pi Risk Twin Web Dashboard의 화면 설계를 정리한다.

기존 `01_screen_plan.md`는 `factory-a` 로컬 Grafana 화면 기준이다. 이 문서는 멀티 공장 Risk Twin Web 화면 기준이며, `docs/specs/data_storage_pipeline.md`의 저장 구조를 전제로 한다.

핵심 질문은 아래 다섯 가지다.

| 화면 | 답해야 하는 질문 |
| --- | --- |
| Fleet Overview | 지금 어느 공장이 가장 위험한가? |
| Factory Overview | 이 공장은 현재 왜 위험한가? |
| Environment | 센서/AI 값이 어떻게 변하고 있는가? |
| Infrastructure | 데이터와 노드는 믿을 수 있는가? |
| Timeline | 언제부터 어떤 일이 있었는가? |

## 전체 화면 구조

Risk Twin Web은 MVP 기준으로 두 단계 화면을 가진다.

```text
1. Fleet Overview
   - 전체 공장 상태
   - 공장별 Risk 카드
   - 최근 상태 변화

2. Factory Detail
   - Overview
   - Environment
   - Infrastructure
   - Timeline
```

기본 조회 저장소:

| 화면 영역 | 저장소 |
| --- | --- |
| 현재 상태 카드 | `DynamoDB LATEST` |
| Risk / 환경 그래프 | `DynamoDB HISTORY#RISK`, `DynamoDB HISTORY#FACTORY` |
| 노드/워크로드 그래프 | `DynamoDB HISTORY#INFRA` |
| 상세 이력/감사 | `S3 processed`, 필요 시 `S3 raw` |

## 1. Fleet Overview

사용자가 처음 진입하는 메인 관제 화면이다.

목적:

- 전체 공장 중 위험 공장을 빠르게 식별한다.
- 위험도 높은 공장을 우선 대응 대상으로 정한다.
- 데이터 지연 또는 노드 이상이 있는 공장을 함께 확인한다.

화면 wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ Aegis Risk Twin                         1h  2h  24h  Refresh │
├──────────────────────────────────────────────────────────────┤
│ 전체 3개 공장   위험 1   주의 1   안전 1   데이터 지연 0       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ factory-a    │ │ factory-b    │ │ factory-c    │          │
│ │ 위험         │ │ 주의         │ │ 안전         │          │
│ │ Risk 32.4    │ │ Risk 65.7    │ │ Risk 92.2    │          │
│ │ 원인: 넘어짐 │ │ 원인: 마이크 │ │ 원인: 없음   │          │
│ │ 노드 3/3     │ │ 노드 1/1     │ │ 노드 1/1     │          │
│ │ 갱신 6초 전  │ │ 갱신 12초 전 │ │ 갱신 8초 전  │          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ 최근 상태 변화                                                │
│ 12:00 factory-a 주의 -> 위험, 원인: fall_score                 │
│ 11:58 factory-b microphone unavailable                        │
└──────────────────────────────────────────────────────────────┘
```

표시 데이터:

| 요소 | 필드 | 저장소 |
| --- | --- | --- |
| 전체 공장 수 | factory count | `DynamoDB LATEST` |
| 위험/주의/안전 수 | `risk.level` | `DynamoDB LATEST` |
| 데이터 지연 수 | `pipeline_status.status` | `DynamoDB LATEST` |
| 공장 카드 | `factory_id`, `risk.score`, `risk.level` | `DynamoDB LATEST` |
| 주요 원인 | `risk.top_causes` | `DynamoDB LATEST` |
| 노드 상태 | `infra_state.node_summary.ready/total` | `DynamoDB LATEST` |
| 최종 갱신 | `updated_at`, `last_factory_state_at`, `last_infra_state_at` | `DynamoDB LATEST` |
| 최근 상태 변화 | risk/pipeline/node 변화 이벤트 | `DynamoDB HISTORY`, 필요 시 `S3 processed` |

정렬 기준:

```text
1. risk.level danger
2. risk.level warning
3. risk.score 낮은 순
4. pipeline_status abnormal
5. updated_at 최신 순
```

## 2. Factory Detail - Overview

공장 카드를 선택하면 진입하는 상세 첫 화면이다.

목적:

- 현재 공장이 왜 위험한지 요약한다.
- 환경 문제인지, AI 감지 문제인지, 인프라 문제인지 빠르게 분리한다.
- 상세 그래프를 보기 전 현재 판단 근거를 제공한다.

화면 wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a                                  위험   Risk 32.4  │
│ 마지막 갱신 6초 전 | Pipeline normal | 노드 3/3 Ready          │
├──────────────────────────────────────────────────────────────┤
│ 주요 원인                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ 넘어짐 score │ │ 온도 상승     │ │ 굽힘 score   │          │
│ │ 0.67         │ │ 38.2°C       │ │ 0.20         │          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
├──────────────────────────────────────────────────────────────┤
│ 현재 환경                                                     │
│ 온도 38.2°C   습도 64%   기압 1011.8hPa                      │
│ 화재 0.00     넘어짐 0.67   굽힘 0.20   소음 impact           │
├──────────────────────────────────────────────────────────────┤
│ 현재 인프라                                                   │
│ Node Ready 3/3   Workload Running 3/3                         │
│ BME280 정상   Camera 정상   Microphone 정상                   │
└──────────────────────────────────────────────────────────────┘
```

표시 데이터:

| 영역 | 필드 | 저장소 |
| --- | --- | --- |
| 상태 헤더 | `risk.score`, `risk.level`, `updated_at` | `DynamoDB LATEST` |
| Pipeline | `pipeline_status.status` | `DynamoDB LATEST` |
| 노드 요약 | `infra_state.node_summary` | `DynamoDB LATEST` |
| 주요 원인 | `risk.top_causes` | `DynamoDB LATEST` |
| 현재 환경 | `factory_state.sensor`, `factory_state.ai_result` | `DynamoDB LATEST` |
| 현재 인프라 | `infra_state.workload_summary`, `infra_state.device_summary` | `DynamoDB LATEST` |

## 3. Factory Detail - Environment

환경 센서와 AI score 추세를 보는 화면이다.

목적:

- Risk Score 하락 시점과 환경/AI 값의 관계를 확인한다.
- 위험 원인이 순간값인지 지속 추세인지 판단한다.
- 온도, 습도, 기압, AI score 변화 방향을 확인한다.

화면 wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a > Environment                  1h  2h  24h          │
├──────────────────────────────────────────────────────────────┤
│ Risk Score                                                    │
│ 80 ┤                         ╭─────╮                         │
│ 60 ┤                ╭────────╯     ╰──                       │
│ 40 ┤        ╭───────╯                                        │
│ 20 ┤────────╯                                                │
│    └──────────────────────────────────────                    │
├──────────────────────────────────────────────────────────────┤
│ 온도 / 습도 / 기압                                             │
│ ┌──────────────────────────┐ ┌──────────────────────────┐     │
│ │ Temperature              │ │ Humidity                 │     │
│ │ 38.2°C                   │ │ 64%                      │     │
│ │ line chart               │ │ line chart               │     │
│ └──────────────────────────┘ └──────────────────────────┘     │
│ ┌──────────────────────────┐                                  │
│ │ Pressure                 │                                  │
│ │ 1011.8hPa                │                                  │
│ │ line chart               │                                  │
│ └──────────────────────────┘                                  │
├──────────────────────────────────────────────────────────────┤
│ AI Score                                                       │
│ Fire 0.00   Fall 0.67   Bend 0.20                              │
│ multi-line chart                                               │
└──────────────────────────────────────────────────────────────┘
```

그래프:

| 그래프 | 필드 | 저장소 | 해상도 |
| --- | --- | --- | --- |
| Risk Score | `risk_score` | `DynamoDB HISTORY#RISK` | 30초 |
| Temperature | `temperature_celsius_avg` | `DynamoDB HISTORY#FACTORY` | 30초 |
| Humidity | `humidity_percent_avg` | `DynamoDB HISTORY#FACTORY` | 30초 |
| Pressure | `pressure_hpa_avg` | `DynamoDB HISTORY#FACTORY` | 30초 |
| AI Score | `fire_score`, `fall_score`, `bend_score` | `DynamoDB HISTORY#FACTORY` | 30초 |

시간 범위:

```text
최근 1시간
최근 2시간
최근 24시간
```

MVP 기본값:

```text
최근 1시간
```

## 4. Factory Detail - Infrastructure

노드, 워크로드, 장치, 파이프라인 상태를 보는 화면이다.

목적:

- 현재 데이터가 신뢰 가능한지 판단한다.
- 노드 장애, workload 이상, 장치 미수신을 확인한다.
- Risk 상승이 실제 현장 이상인지 수집/시스템 이상인지 구분한다.

화면 wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a > Infrastructure              1h  2h  24h           │
├──────────────────────────────────────────────────────────────┤
│ 현재 노드 상태                                                 │
│ ┌─────────┬───────┬─────┬────────┬──────┐                    │
│ │ Node    │ Ready │ CPU │ Memory │ Disk │                    │
│ ├─────────┼───────┼─────┼────────┼──────┤                    │
│ │ master  │ Yes   │ 31% │ 55%    │ 42%  │                    │
│ │ worker1 │ Yes   │ 22% │ 48%    │ 39%  │                    │
│ │ worker2 │ Yes   │ 44% │ 63%    │ 45%  │                    │
│ └─────────┴───────┴─────┴────────┴──────┘                    │
├──────────────────────────────────────────────────────────────┤
│ 리소스 추세                                                    │
│ CPU usage chart                                                │
│ Memory usage chart                                             │
│ Disk usage chart                                               │
├──────────────────────────────────────────────────────────────┤
│ Workloads                                                      │
│ safe-edge-integrated-ai   Running   worker2   restart 0        │
│ bme280-sensor             Running   worker2   restart 0        │
│ safe-edge-audio           Running   worker2   restart 0        │
├──────────────────────────────────────────────────────────────┤
│ Devices                                                        │
│ BME280 정상   Camera 정상   Microphone 정상                    │
└──────────────────────────────────────────────────────────────┘
```

표시 데이터:

| 영역 | 필드 | 저장소 |
| --- | --- | --- |
| 현재 노드 표 | `infra_state.nodes` | `DynamoDB LATEST` |
| Workloads | `infra_state.workloads` 또는 `workload_summary` | `DynamoDB LATEST` |
| Devices | `infra_state.devices` 또는 `device_summary` | `DynamoDB LATEST` |
| Pipeline | `pipeline_status` | `DynamoDB LATEST` |

그래프:

| 그래프 | 필드 | 저장소 | 해상도 |
| --- | --- | --- | --- |
| Node CPU | `nodes[].cpu_usage_percent` | `DynamoDB HISTORY#INFRA` | 20초 |
| Node Memory | `nodes[].memory_usage_percent` | `DynamoDB HISTORY#INFRA` | 20초 |
| Node Disk | `nodes[].disk_usage_percent` | `DynamoDB HISTORY#INFRA` | 20초 |
| Ready node count | `node_summary.ready` | `DynamoDB HISTORY#INFRA` | 20초 |
| Unhealthy workload count | `workload_summary.unhealthy` | `DynamoDB HISTORY#INFRA` | 20초 |

## 5. Factory Detail - Timeline

최근 상태 변화를 시간순으로 보는 화면이다.

목적:

- 위험이 언제 시작됐는지 확인한다.
- 환경/AI/인프라 변화 순서를 비교한다.
- 복구 흐름이나 반복 장애를 확인한다.

화면 wireframe:

```text
┌──────────────────────────────────────────────────────────────┐
│ factory-a > Timeline                                          │
├──────────────────────────────────────────────────────────────┤
│ 12:00:30  Risk 주의 -> 위험                                   │
│          원인: fall_score 0.67, temperature 38.2°C             │
│                                                              │
│ 11:58:20  Microphone unavailable                              │
│                                                              │
│ 11:56:00  worker2 CPU 80% 초과                                │
│                                                              │
│ 11:52:30  Pipeline normal                                     │
└──────────────────────────────────────────────────────────────┘
```

표시 이벤트 후보:

| 이벤트 | 판단 기준 |
| --- | --- |
| Risk level 변화 | `safe -> warning`, `warning -> danger` |
| 주요 원인 변화 | `risk.top_causes` 변경 |
| pipeline status 변화 | `normal`, `warning`, `critical` 변경 |
| node Ready 변화 | ready/not_ready count 변화 |
| workload 이상 | unhealthy count 증가 |
| device 이상 | available true/false 변경 |

기본 데이터 소스:

```text
DynamoDB HISTORY
```

장기 상세 조회:

```text
S3 processed
```

## 데이터 연결 요약

| 화면 | 조회 대상 | 저장소 |
| --- | --- | --- |
| Fleet Overview cards | current risk, top causes, node summary, pipeline | `DynamoDB LATEST` |
| Fleet Overview recent changes | status changes | `DynamoDB HISTORY`, `S3 processed` |
| Factory Overview | current risk, environment, infra | `DynamoDB LATEST` |
| Environment Risk chart | risk score trend | `DynamoDB HISTORY#RISK` |
| Environment sensor chart | temperature, humidity, pressure | `DynamoDB HISTORY#FACTORY` |
| Environment AI chart | fire, fall, bend score | `DynamoDB HISTORY#FACTORY` |
| Infrastructure current table | nodes, workloads, devices | `DynamoDB LATEST.infra_state` |
| Infrastructure charts | CPU, memory, disk, ready count | `DynamoDB HISTORY#INFRA` |
| Timeline | risk/pipeline/node/device changes | `DynamoDB HISTORY`, `S3 processed` |

## MVP 화면 원칙

- 첫 화면은 그래프보다 공장별 현재 위험 카드가 우선이다.
- 공장 상세는 현재 판단, 환경 추세, 인프라 신뢰성, 시간 흐름을 분리한다.
- `DynamoDB LATEST`는 현재 상태 화면에 사용한다.
- `DynamoDB HISTORY`는 최근 1시간/2시간 그래프에 사용한다.
- `S3 raw`와 `S3 processed`는 기본 화면 조회보다 상세/감사/리포트에서 사용한다.
- 환경 그래프는 30초 간격, 인프라 그래프는 20초 간격으로 표시한다.
- Risk 상태는 `안전 / 주의 / 위험`을 기본 표현으로 사용한다.
