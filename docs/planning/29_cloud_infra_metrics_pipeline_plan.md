# Cloud Infra Metrics Pipeline Plan

> 상태: draft
> 기준일: 2026-06-01 / 언어: 한국어 (개조식)
> 관련 결정: `docs/changes/0027-cloud-infra-metrics-collector.md` (proposed) · 비용 `docs/ops/15_aws_cost_baseline.md` (v3.1)

이 문서는 Aegis 프로젝트를 처음 진행하는 사람이 기존 데이터 파이프라인의 구조와 한계를 이해하고, Cloud infra metric을 어떤 방식으로 수집/저장/조회할지 판단할 수 있도록 정리한다.

핵심 방향은 **Dashboard에 필요한 metric만 주기적으로 추출해서 DynamoDB/S3에 read model로 저장하는 것**이다. CloudWatch Container Insights처럼 모든 EKS container metric을 상시 수집하지 않는다.

## 기존 데이터 파이프라인

기존 공장 데이터는 다음 흐름으로 구성되어 있다.

```text
factory-a/b/c 장비 또는 dummy sensor
  -> AWS IoT Core
  -> DataProcessor Lambda
  -> DynamoDB LATEST / HISTORY#STATE
  -> S3 processed
  -> GraphAggregator
  -> S3 processed_agg
  -> Backend / Front
```

각 저장소의 역할은 아래와 같다.

| 저장소 | 역할 |
| --- | --- |
| S3 `raw/` | IoT Core로 들어온 원본 메시지 보존 |
| DynamoDB `LATEST` | 공장별 현재 상태 1개 |
| DynamoDB `HISTORY#STATE` | 시간별 상태 스냅샷, TTL 적용 |
| S3 `processed/` | 정규화된 처리 결과와 상태 스냅샷 |
| S3 `processed_agg/` | 그래프용 시간 bucket 집계 결과 |

기존 파이프라인은 공장 데이터 중심이다. 즉 센서, AI score, edge infra 상태, risk score, pipeline freshness를 다룬다.

## 기존 수정 방향: 데이터 단절도 상태로 저장

초기 구조에서는 새 IoT 메시지가 들어올 때만 `risk`와 `pipeline_status`가 갱신됐다. 이 때문에 `factory-a`가 꺼져서 raw 데이터가 끊겨도 `DynamoDB LATEST.risk.score`가 마지막 정상 값으로 남을 수 있었다.

이를 해결하기 위해 `DataProcessor`에 `refresh_pipeline_status` 흐름을 추가했다.

```text
EventBridge Scheduler
  -> DataProcessor Lambda
  -> action=refresh_pipeline_status
  -> DynamoDB LATEST의 마지막 infra_state 시각 확인
  -> pipeline_status / risk 재계산
  -> LATEST 업데이트
  -> HISTORY#STATE + S3 state_snapshot 저장
```

이 수정 이후에는 새 센서 메시지가 없어도 데이터 단절이 상태로 표현된다.

예시:

```json
{
  "factory_id": "factory-a",
  "pipeline_status": {
    "status": "critical",
    "latest_infra_state_age_seconds": 360
  },
  "risk": {
    "score": 0,
    "level": "danger",
    "top_causes": [
      {
        "field": "data_freshness",
        "reason": "pipeline_status_outage",
        "severity": "danger",
        "source": "gate"
      }
    ]
  }
}
```

## 새 요구사항: Cloud infra 상태도 Dashboard에 보여주기

Dashboard VPC에서는 공장 상태뿐 아니라 Cloud infra 상태도 보여줘야 한다.

확인하고 싶은 영역은 다음과 같다.

```text
Backend/API 상태
Data pipeline Lambda 상태
DynamoDB/S3 저장 상태
Scheduler 상태
Factory freshness/risk
EKS management plane 상태
ArgoCD sync/health
S3 latest object freshness
```

처음에는 CloudWatch Container Insights를 켜서 EKS node/pod/container metric을 전부 수집하는 방법을 검토했다. 실제 적용 후 `metrics-server`와 `amazon-cloudwatch-observability`를 모두 켰고, `kubectl top`과 `ContainerInsights` metric이 동작하는 것까지 확인했다.

하지만 비용이 문제였다.

현재 2-node Hub 기준 CloudWatch Container Insights를 상시 켜면 월 추가 비용이 대략 다음 수준이다.

```text
Container Insights enhanced observations: ~$58/month
CloudWatch Logs ingest/storage: ~$7+/month
합계: ~$65~75/month
```

MVP/개발 단계에서 이 비용은 과하다. 그래서 기본 전략을 바꿨다.

```text
metrics-server: 기본 ON
CloudWatch Observability / Container Insights: 기본 OFF
필요한 metric만 직접 수집
```

## 새 수집 전략

Cloud infra metric은 원본 metric 전체를 복제하지 않는다. Dashboard가 바로 읽을 수 있는 summary read model만 만든다.

전체 흐름:

```text
EventBridge Scheduler 1m
  -> CloudInfraFastCollector Lambda
  -> AWS API / CloudWatch / DynamoDB 조회
  -> DynamoDB CLOUD#infra / LATEST.fast 업데이트
  -> DynamoDB HISTORY#FAST#timestamp 저장
  -> S3 processed/cloud_infra/fast snapshot 저장

EventBridge Scheduler 5m
  -> CloudInfraSlowCollector Lambda
  -> EKS API / Kubernetes API / S3 조회
  -> DynamoDB CLOUD#infra / LATEST.slow 업데이트
  -> DynamoDB HISTORY#SLOW#timestamp 저장
  -> S3 processed/cloud_infra/slow snapshot 저장

Backend
  -> DynamoDB CLOUD#infra / LATEST 조회
  -> Front에 Cloud infra 상태 제공
```

## 왜 1분과 5분으로 나누는가

모든 metric을 같은 주기로 수집하면 비용과 latency가 맞지 않는다.

1분 metric은 사용자 서비스와 데이터 파이프라인 장애 감지에 필요하다.

```text
ECS desired/running
ECS CPU utilization
ECS memory utilization
ALB healthy host / 5xx / latency
Lambda errors / duration / throttles
DynamoDB throttles
Redis / RDS health (backend 의존성)
SQS DLQ depth (notifier 파이프라인)
CloudFront 5xx (frontend 배포)
Scheduler enabled
factory freshness/risk
```

5분 metric은 management plane과 상대적으로 느리게 변하는 상태다.

```text
EKS cluster/nodegroup
EKS node CPU utilization
EKS node memory utilization
EKS pod phase/restart
EKS top pods by CPU/memory
ArgoCD sync/health
S3 latest object time
```

## 수집 대상과 출처

### 1분 Fast Collector

| 영역 | 값 | 출처 |
| --- | --- | --- |
| ECS | desired/running/pending count | `ecs:DescribeServices` |
| ECS | CPU/Memory utilization | CloudWatch `AWS/ECS` |
| ALB | healthy/unhealthy host count | `elbv2:DescribeTargetHealth`, CloudWatch `AWS/ApplicationELB` |
| ALB | Target 5xx, latency | CloudWatch `AWS/ApplicationELB` |
| Lambda | invocations/errors/duration/throttles | CloudWatch `AWS/Lambda` |
| DynamoDB | read/write throttles, errors, latency | CloudWatch `AWS/DynamoDB` |
| Scheduler | enabled/disabled state | EventBridge Scheduler `GetSchedule` |
| Factory | pipeline_status, risk, top_causes | DynamoDB `FACTORY#{factory_id} / LATEST` |
| Redis | replication group/node status, CPU, freeable memory, connections, evictions | `elasticache:DescribeReplicationGroups`, CloudWatch `AWS/ElastiCache` |
| RDS | instance status, CPU, connections, freeable memory, free storage | `rds:DescribeDBInstances`, CloudWatch `AWS/RDS` |
| SQS DLQ | notifier DLQ message depth, oldest message age | CloudWatch `AWS/SQS` (`ApproximateNumberOfMessagesVisible`, `ApproximateAgeOfOldestMessage`) |
| CloudFront | 5xx error rate (frontend 정적 배포) | CloudWatch `AWS/CloudFront` |

### 5분 Slow Collector

| 영역 | 값 | 출처 |
| --- | --- | --- |
| EKS | cluster status/version | `eks:DescribeCluster` |
| EKS | nodegroup status/desired/health issues | `eks:DescribeNodegroup` |
| EKS | ASG healthy instances | `autoscaling:DescribeAutoScalingGroups` |
| Kubernetes | node ready count | Kubernetes API |
| Kubernetes | node CPU/memory | Kubernetes Metrics API, metrics-server |
| Kubernetes | pod phase/restart | Kubernetes API |
| Kubernetes | top pods by CPU/memory | Kubernetes Metrics API, metrics-server |
| ArgoCD | sync/health | `applications.argoproj.io` CRD |
| S3 | latest raw/processed/processed_agg object time | `s3:ListBucket` |

## DynamoDB 저장 구조

기존 `AEGIS-DynamoDB-FactoryStatus` 테이블을 재사용한다.

현재 상태:

```text
pk = CLOUD#infra
sk = LATEST
```

최근 이력:

```text
pk = CLOUD#infra
sk = HISTORY#FAST#2026-06-01T15:30:00Z
ttl = now + 6h

pk = CLOUD#infra
sk = HISTORY#SLOW#2026-06-01T15:30:00Z
ttl = now + 24h
```

`LATEST`는 하나만 유지하고, fast/slow collector가 서로 다른 필드만 업데이트한다.

```text
FastCollector -> LATEST.fast 갱신
SlowCollector -> LATEST.slow 갱신
```

이 방식이면 1분 collector가 5분 데이터를 덮어쓰지 않고, 5분 collector도 1분 데이터를 덮어쓰지 않는다.

## LATEST 예시

```json
{
  "pk": "CLOUD#infra",
  "sk": "LATEST",
  "schema_version": "cloud-infra-status-v1",
  "updated_at": "2026-06-01T15:30:00Z",
  "fast_updated_at": "2026-06-01T15:30:00Z",
  "slow_updated_at": "2026-06-01T15:25:00Z",
  "overall_status": "warning",
  "fast": {
    "backend_runtime": {
      "status": "warning",
      "reasons": ["alb_target_5xx_5m>0", "ecs_cpu_utilization_max>90"],
      "ecs": {
        "cluster_name": "KJW-AEGIS-Data-ECSCluster",
        "service_name": "KJW-AEGIS-Data-Service-Backend",
        "desired_count": 1,
        "running_count": 1,
        "pending_count": 0,
        "cpu_utilization_avg": 18.2,
        "cpu_utilization_max": 94.4,
        "memory_utilization_avg": 34.1,
        "memory_utilization_max": 35.0
      },
      "alb": {
        "target_group_name": "kjw-aegis-data-tg-backend",
        "healthy_host_count": 1,
        "unhealthy_host_count": 0,
        "target_5xx_count_5m": 7,
        "target_response_time_avg_seconds": 0.8,
        "target_response_time_p95_seconds": 1.9
      },
      "cloudfront": {
        "distribution_id": "E1XXXXXXXX",
        "error_rate_5xx_5m": 0.0
      }
    },
    "datastores": {
      "status": "normal",
      "reasons": [],
      "redis": {
        "replication_group_id": "kjw-aegis-data-redis",
        "status": "available",
        "node_count": 1,
        "cpu_utilization_avg": 3.2,
        "freeable_memory_mib": 380,
        "current_connections": 4,
        "evictions_5m": 0
      },
      "rds": {
        "db_instance_id": "kjw-aegis-data-rds",
        "status": "available",
        "cpu_utilization_avg": 6.1,
        "database_connections": 3,
        "freeable_memory_mib": 920,
        "free_storage_mib": 18400
      }
    },
    "data_pipeline": {
      "status": "normal",
      "reasons": [],
      "lambdas": [
        {
          "name": "AEGIS-Lambda-DataProcessor",
          "invocations_5m": 10,
          "errors_5m": 0,
          "throttles_5m": 0,
          "duration_p95_ms": 320
        },
        {
          "name": "AEGIS-Lambda-GraphAggregator5m",
          "invocations_5m": 1,
          "errors_5m": 0,
          "throttles_5m": 0,
          "duration_p95_ms": 450
        }
      ],
      "dynamodb": {
        "table_name": "AEGIS-DynamoDB-FactoryStatus",
        "read_throttle_events_5m": 0,
        "write_throttle_events_5m": 0,
        "system_errors_5m": 0
      },
      "dlq": {
        "queue_name": "AEGIS-SQS-NotifierDLQ",
        "messages_visible": 0,
        "oldest_message_age_seconds": 0
      },
      "schedulers": [
        {
          "name": "AEGIS-Schedule-DataProcessorRefresh1m",
          "state": "ENABLED"
        },
        {
          "name": "AEGIS-Schedule-GraphAggregator5m",
          "state": "ENABLED"
        }
      ]
    },
    "factory_freshness": {
      "status": "normal",
      "factories": [
        {
          "factory_id": "factory-a",
          "pipeline_status": "normal",
          "latest_infra_state_age_seconds": 12,
          "risk_score": 100,
          "risk_level": "safe",
          "top_causes": []
        }
      ]
    }
  },
  "slow": {
    "eks_management": {
      "status": "normal",
      "cluster": {
        "name": "AEGIS-EKS",
        "status": "ACTIVE",
        "version": "1.34"
      },
      "nodegroup": {
        "name": "AEGIS-EKS-node",
        "status": "ACTIVE",
        "desired_size": 2,
        "min_size": 2,
        "max_size": 2,
        "health_issues": []
      },
      "nodes": {
        "ready": 2,
        "total": 2,
        "items": [
          {
            "name": "ip-10-0-10-16.ap-south-1.compute.internal",
            "cpu_utilization_percent": 2,
            "memory_utilization_percent": 29
          },
          {
            "name": "ip-10-0-11-232.ap-south-1.compute.internal",
            "cpu_utilization_percent": 2,
            "memory_utilization_percent": 43
          }
        ]
      },
      "pods": {
        "running": 27,
        "pending": 0,
        "failed": 0,
        "unknown": 0,
        "restart_count_total": 2,
        "top_by_cpu": [
          {
            "namespace": "argocd",
            "pod": "argocd-application-controller-0",
            "cpu_millicores": 19,
            "memory_mib": 202
          }
        ]
      },
      "argocd": {
        "applications_total": 3,
        "synced": 3,
        "out_of_sync": 0,
        "healthy": 3,
        "degraded": 0,
        "apps": [
          {
            "name": "aegis-spoke-factory-a",
            "sync_status": "Synced",
            "health_status": "Healthy"
          }
        ]
      }
    },
    "storage_freshness": {
      "factories": [
        {
          "factory_id": "factory-a",
          "latest_raw_at": "2026-06-01T15:29:50Z",
          "latest_processed_at": "2026-06-01T15:29:52Z",
          "latest_processed_agg_at": "2026-06-01T15:25:00Z"
        }
      ]
    }
  }
}
```

## 필드 계약 (Backend/Frontend가 의존하는 보장 규칙)

Backend/Frontend는 이 절을 계약으로 본다. collector 구현은 이 규칙을 깨면 안 된다.

항상 존재하는 top-level 필드 (frontend가 무조건 접근 가능):

```text
pk, sk, schema_version, updated_at,
fast_updated_at, slow_updated_at,
overall_status,
fast, slow                      <- 컨테이너 객체는 항상 존재
fast.backend_runtime.status     <- 각 section의 status 는 항상 존재
fast.datastores.status
fast.data_pipeline.status
fast.factory_freshness.status
slow.eks_management.status
slow.storage_freshness.status
```

section 내부 데이터 필드 (예: `ecs`, `alb`, `nodes`, `pods`)는 **선택적(nullable)** 이다.
- 수집 성공 → 데이터 필드 존재
- 수집 실패/부분 실패 → 데이터 필드는 없거나 `null`, 대신 `status=unknown` + `errors[]` 존재

frontend는 데이터 필드를 `optional`로 다뤄야 하며, 없으면 해당 카드/지표를 "데이터 없음"으로 표시한다.

## 부분 실패 / unknown 상태 스키마

설계 원칙(`metric 수집 실패도 status=unknown과 errors[]로 저장`)을 스키마로 고정한다.

`errors[]` item 형식:

```json
{
  "source": "ecs:DescribeServices",
  "code": "AccessDenied",
  "message": "User is not authorized to perform ecs:DescribeServices",
  "at": "2026-06-01T15:30:00Z"
}
```

`errors[]`는 **section 단위**로 붙는다. 한 section의 일부 호출만 실패하면 그 section은 `unknown`(또는 부분값 + `warning`이 아니라 `unknown` 우선)이고, 실패한 부분의 데이터 필드는 생략한다.

부분 실패 LATEST 예시 (ECS 조회는 성공, ALB 조회 실패):

```json
{
  "pk": "CLOUD#infra",
  "sk": "LATEST",
  "schema_version": "cloud-infra-status-v1",
  "updated_at": "2026-06-01T15:30:00Z",
  "fast_updated_at": "2026-06-01T15:30:00Z",
  "slow_updated_at": "2026-06-01T15:25:00Z",
  "overall_status": "unknown",
  "fast": {
    "backend_runtime": {
      "status": "unknown",
      "ecs": {
        "cluster_name": "KJW-AEGIS-Data-ECSCluster",
        "service_name": "KJW-AEGIS-Data-Service-Backend",
        "desired_count": 1,
        "running_count": 1,
        "pending_count": 0
      },
      "errors": [
        {
          "source": "elbv2:DescribeTargetHealth",
          "code": "Throttling",
          "message": "Rate exceeded",
          "at": "2026-06-01T15:30:00Z"
        }
      ]
    },
    "data_pipeline": { "status": "normal" },
    "factory_freshness": { "status": "normal" }
  },
  "slow": {
    "eks_management": { "status": "normal" },
    "storage_freshness": {}
  }
}
```

규칙 요약:

- `status=unknown`은 "값이 정상이 아니다"가 아니라 "측정에 실패했다"는 뜻이다. frontend는 빨강(critical)이 아니라 회색으로 표시한다.
- 한 section이 통째로 실패해도 다른 section과 top-level 필드는 그대로 유지된다(collector는 section별로 독립 try/except).
- `errors[]`가 없으면 그 section은 수집 성공으로 간주한다.

## 상태 근거 (reasons[])

각 section은 `status`와 함께 `reasons[]`를 가진다. factory 쪽 `top_causes`와 같은 역할로, "왜 이 색인가"를 frontend가 임계값을 재계산하지 않고 그대로 보여줄 수 있게 한다.

- `reasons[]`는 status를 `warning`/`critical`로 만든 판정 근거 문자열 목록이다.
- `status=normal`이면 빈 배열 `[]`.
- `status=unknown`(수집 실패)이면 `reasons[]`가 아니라 `errors[]`를 본다.
- 근거 계산은 collector가 status를 정할 때 함께 만든다. backend/frontend는 임계값 로직을 재구현하지 않는다.

형식: 사람이 읽을 수 있는 짧은 토큰.

```text
["alb_target_5xx_5m>0", "ecs_cpu_utilization_max>90"]
["redis_status!=available"]
["rds_free_storage_low"]
["dlq_messages_visible>0"]
["scheduler_disabled:AEGIS-Schedule-DataProcessorRefresh1m"]
```

## HISTORY 예시

HISTORY는 **LATEST 전체 복사가 아니라 추이 차트용 reduced 스냅샷**이다. frontend는 이 항목들을 시간순으로 묶어 line/area 차트를 그린다. full snapshot은 S3에만 저장한다(`## S3 저장 구조` 참고).

reduce 원칙:
- section status 는 모두 보존(상태 타임라인용)
- 차트로 그릴 핵심 숫자 metric만 보존
- 리스트성 큰 필드(`nodes.items`, `pods.top_by_cpu`, `argocd.apps`, `lambdas[].name` 외 상세, `top_causes`)는 HISTORY에서 제외 → S3 full snapshot에서만 확인

Fast collector가 실행되면 `LATEST`를 업데이트한 뒤 reduced snapshot을 TTL이 있는 history item으로 저장한다.

```json
{
  "pk": "CLOUD#infra",
  "sk": "HISTORY#FAST#2026-06-01T15:30:00Z",
  "schema_version": "cloud-infra-status-v1",
  "snapshot_type": "fast",
  "updated_at": "2026-06-01T15:30:00Z",
  "ttl": 1780327800,
  "overall_status": "warning",
  "fast": {
    "backend_runtime": {
      "status": "warning",
      "ecs": {
        "desired_count": 1,
        "running_count": 1,
        "cpu_utilization_avg": 18.2,
        "memory_utilization_avg": 34.1
      },
      "alb": {
        "healthy_host_count": 1,
        "unhealthy_host_count": 0,
        "target_5xx_count_5m": 7,
        "target_response_time_p95_seconds": 1.9
      }
    },
    "datastores": {
      "status": "normal",
      "redis_cpu_utilization_avg": 3.2,
      "redis_evictions_5m": 0,
      "rds_cpu_utilization_avg": 6.1,
      "rds_database_connections": 3
    },
    "data_pipeline": {
      "status": "normal",
      "lambda_errors_5m_total": 0,
      "lambda_throttles_5m_total": 0,
      "ddb_throttle_events_5m": 0,
      "dlq_messages_visible": 0,
      "schedulers_disabled_count": 0
    },
    "factory_freshness": {
      "status": "normal",
      "factories": [
        {
          "factory_id": "factory-a",
          "pipeline_status": "normal",
          "risk_score": 100,
          "latest_infra_state_age_seconds": 12
        }
      ]
    }
  }
}
```

Slow collector도 같은 방식으로 reduced snapshot을 저장한다.

```json
{
  "pk": "CLOUD#infra",
  "sk": "HISTORY#SLOW#2026-06-01T15:30:00Z",
  "schema_version": "cloud-infra-status-v1",
  "snapshot_type": "slow",
  "updated_at": "2026-06-01T15:30:00Z",
  "ttl": 1780392600,
  "overall_status": "normal",
  "slow": {
    "eks_management": {
      "status": "normal",
      "cluster_status": "ACTIVE",
      "nodes": { "ready": 2, "total": 2 },
      "node_cpu_utilization_max": 2,
      "node_memory_utilization_max": 43,
      "pods": { "running": 27, "pending": 0, "failed": 0, "restart_count_total": 2 },
      "argocd": { "synced": 3, "out_of_sync": 0, "healthy": 3, "degraded": 0 }
    },
    "storage_freshness": {
      "status": "normal",
      "max_processed_age_seconds": 8,
      "max_processed_agg_age_seconds": 300
    }
  }
}
```

규칙:
- `HISTORY#FAST` item은 `fast`만, `HISTORY#SLOW` item은 `slow`만 담는다(자기 주기 데이터만). 반대편 컨테이너는 넣지 않는다.
- frontend 추이 차트는 위 숫자 필드만 의존한다. 이외 상세가 필요하면 S3 full snapshot으로 간다.

권장 TTL:

| history type | 주기 | TTL |
| --- | ---: | ---: |
| `HISTORY#FAST` | 1분 | 6시간 |
| `HISTORY#SLOW` | 5분 | 24시간 |

## S3 저장 구조

S3는 장기 보관과 디버깅용이다.

```text
processed/cloud_infra/fast/yyyy=2026/mm=06/dd=01/hh=15/2026-06-01T15-30-00Z.json
processed/cloud_infra/slow/yyyy=2026/mm=06/dd=01/hh=15/2026-06-01T15-30-00Z.json
```

S3에는 DynamoDB보다 더 자세한 full snapshot을 저장해도 된다. DynamoDB는 Dashboard read model 중심으로 유지한다.

## Backend 조회 방식

Backend는 CloudWatch, EKS, Kubernetes API, S3를 직접 여러 번 조회하지 않는다.

기본 화면:

```text
GetItem
pk = CLOUD#infra
sk = LATEST
```

최근 추이:

```text
Query pk=CLOUD#infra begins_with(sk, HISTORY#FAST#)
Query pk=CLOUD#infra begins_with(sk, HISTORY#SLOW#)
```

추이 조회 계약 (frontend 차트 기준):

| 항목 | 규칙 |
| --- | --- |
| 시간 범위 | `window` query param (예: `1h` / `6h` / `24h`). 기본 `1h` |
| 정렬 | `ScanIndexForward=true` (오름차순, 차트 x축 = 시간순) |
| 최대 개수 | fast 6h=360, slow 24h=288. window별 limit 적용 |
| 다운샘플링 | `1h`는 raw, `6h` 이상은 backend에서 N분 bucket 평균으로 축약 |

단위 규칙 (필드 suffix 고정):
- 시간(초) = `_seconds`, 밀리초 = `_ms`, 메모리 = `_mib`, CPU = millicores 또는 `utilization`(%)
- suffix 없는 숫자는 count로 간주한다

상세 디버깅:

```text
S3 processed/cloud_infra/... snapshot 조회
```

## Status 계산

각 section은 자체 `status`를 가진다.

```text
normal
warning
critical
unknown
```

예시 기준:

| section | warning | critical |
| --- | --- | --- |
| Backend ECS | running < desired | running = 0 |
| ALB | target 5xx > 0 또는 latency 증가 | healthy host = 0 |
| Lambda | errors > 0 또는 throttles > 0 | 반복 errors 또는 throttles 지속 |
| DynamoDB | throttle > 0 | throttle 지속 또는 system error |
| Redis | CPU/메모리 높음 또는 eviction 발생 | `status != available` |
| RDS | 연결 수 급증 또는 free storage 낮음 | `status != available` |
| SQS DLQ | `messages_visible > 0` | DLQ 지속 증가 |
| CloudFront | 5xx rate 상승 | 5xx rate 지속 |
| Scheduler | 일부 disabled | refresh scheduler disabled |
| Factory freshness | warning factory 존재 | critical factory 존재 |
| EKS | node/pod warning | cluster/nodegroup degraded |
| ArgoCD | OutOfSync 존재 | Degraded 존재 |

`overall_status`는 가장 나쁜 section 상태를 따른다.

```text
critical > warning > unknown > normal
```

## Staleness (죽은 collector 감지)

핵심: **collector가 죽으면 자기 자신이 "나 stale" 이라고 쓸 수 없다.** LATEST의 `fast`/`slow` 데이터는 마지막 정상 값으로 남아 화면이 멀쩡해 보이는 위험이 있다. 그래서 staleness는 **Backend가 LATEST를 읽는 시점에 `fast_updated_at` / `slow_updated_at`로 계산**한다.

판정 기준 (수집 주기의 약 3배):

| 대상 | 기준 | 결과 |
| --- | --- | --- |
| fast | `now - fast_updated_at > 3분` | `fast.*` section을 `unknown`(stale)으로 취급 |
| slow | `now - slow_updated_at > 15분` | `slow.*` section을 `unknown`(stale)으로 취급 |

Backend 응답에 staleness 플래그를 명시해 frontend가 회색/경고 배지를 띄울 수 있게 한다.

```json
{
  "fast_stale": false,
  "slow_stale": true,
  "fast_age_seconds": 35,
  "slow_age_seconds": 1180,
  "overall_status": "unknown"
}
```

규칙:
- stale로 판정된 쪽 section은 저장된 값과 무관하게 `unknown`으로 내려, `overall_status` 계산에도 `unknown`으로 반영한다.
- frontend는 stale을 critical(빨강)이 아닌 회색/"오래됨"으로 표시하고, 마지막 갱신 시각(`*_updated_at`)을 함께 보여준다.
- 이 계산은 collector가 아니라 Backend 책임이다(죽은 collector는 갱신할 수 없으므로).

## 비용 추정

Container Insights 상시 수집보다 훨씬 싸지만, **공짜는 아니다.** 비용의 대부분은 CloudWatch `GetMetricData`이고, 이는 "받는 metric 개수 × 수집 주기"에 비례한다.

월 실행 횟수:

```text
FastCollector 1분 = 43,200회/month
SlowCollector 5분 = 8,640회/month
합계 = 51,840회/month
```

각 실행에서 최소 다음 작업을 수행한다.

```text
DynamoDB LATEST UpdateItem 1회
DynamoDB HISTORY PutItem 1회
S3 PutObject 1회
CloudWatch GetMetricData (사용률 metric 개수만큼)
AWS Describe* / GetQueueAttributes (상태/카운트, 무료)
```

### CloudWatch GetMetricData 가 핵심 동인

- 단가: `$0.01 / 1,000 metrics`. **CloudWatch 무료 티어 1M API 요청에서 GetMetricData 는 제외**되므로 첫 metric부터 과금된다.
- 핵심 기준: **metric 1개를 1분마다 = 43,200회/month ≈ $0.43/month**, 5분마다 = 8,640회/month ≈ $0.086/month.

따라서 "1분 주기로 CloudWatch metric을 몇 개 받느냐"가 비용을 결정한다. Fast collector가 받는 사용률 metric을 ~30개로 가정하면:

```text
30 metrics × $0.43/month ≈ ~$13/month (CloudWatch GetMetricData 만)
```

이 metric 수에 ECS/ALB/Lambda/DynamoDB + Redis/RDS/CloudFront 사용률이 포함된다.

### 비용 vs 정보를 가르는 수집 원칙

같은 데이터라도 출처를 고르면 과금 여부가 갈린다. 비용은 사용률 metric에서만 발생한다.

| 데이터 | 출처 | 과금 |
| --- | --- | --- |
| 상태(available / ACTIVE / Synced) | `Describe*`, ArgoCD CRD | 무료 |
| 카운트(ECS desired/running, ALB healthy host, **DLQ depth**) | `DescribeServices`, `DescribeTargetHealth`, **SQS `GetQueueAttributes`** | 무료 |
| node/pod CPU·메모리 | Kubernetes Metrics API (metrics-server) | 무료 |
| 사용률·rate(CPU%, 메모리%, 5xx, latency, throttles, errors, eviction) | CloudWatch `GetMetricData` | **유료** |

→ DLQ depth, Redis/RDS 상태는 무료로 받을 수 있다. CloudWatch 과금은 Redis/RDS/ECS/ALB/Lambda 등의 **사용률 metric**에서만 발생한다.

### 대략 비용 (Fast 1분 + Slow 5분 기준)

| 항목 | 월 추정 |
| --- | ---: |
| CloudWatch GetMetricData (사용률 metric ~25~35개, 대부분 fast 1분) | `~$10~15` |
| Lambda invocations + compute | `~$0.3~0.8` (대부분 무료 티어 내) |
| DynamoDB writes/reads | `~$0.3~0.6` |
| S3 PUT | `~$0.26` |
| S3 storage | `~$0.01~0.05` |
| EventBridge Scheduler | `~$0` (무료 티어 내) |
| **합계** | **`~$11~17/month`** |

### 비용 절감 레버

- **상태값은 Describe로, DLQ depth는 GetQueueAttributes로** → CloudWatch 과금 회피
- **자주 안 변하는 사용률(Redis/RDS)은 Slow(5분)로** → 해당 metric 비용 1/5
- **GetMetricData 배치** → 한 호출에 최대 500 metric. 호출 수는 줄지만 metric당 과금은 동일
- fast 사용률 metric 수를 줄이면 비용은 선형으로 감소

비교:

```text
CloudWatch Container Insights 전체 수집(상시 ON): ~$65~75/month
필요 metric만 collector로 수집(Container Insights OFF): ~$11~17/month
  - 사용률 metric을 줄이거나 Slow로 옮기면 더 낮출 수 있음
```

## 구현 순서

### Phase 1: Fast Collector

먼저 사용자 서비스와 데이터 파이프라인 장애를 감지한다.

수집:

```text
ECS desired/running
ECS CPU/memory
ALB healthy host / 5xx / latency
Lambda errors / duration / throttles
DynamoDB throttles
Redis / RDS health
SQS DLQ depth
CloudFront 5xx
Scheduler enabled
factory freshness/risk
```

저장:

```text
DynamoDB CLOUD#infra / LATEST.fast
DynamoDB HISTORY#FAST#timestamp
S3 processed/cloud_infra/fast
```

### Phase 2: Slow Collector 1차

EKS와 S3 freshness를 추가한다.

수집:

```text
EKS cluster/nodegroup
ASG healthy instances
S3 latest raw/processed/processed_agg object time
```

### Phase 3: Slow Collector 2차

Kubernetes 내부 상태를 추가한다.

수집:

```text
node ready count
node CPU/memory via metrics-server
pod phase/restart
top pods by CPU/memory
ArgoCD sync/health
```

### Phase 4: Backend 연결

Backend는 `CLOUD#infra / LATEST`를 읽어서 Cloud infra dashboard API를 만든다.

## 설계 원칙

- CloudWatch Container Insights는 기본 disabled로 유지한다.
- Dashboard가 필요한 metric만 read model로 저장한다.
- 원본 metric history는 CloudWatch 또는 각 서비스 API의 책임으로 둔다.
- DynamoDB는 최신 상태와 짧은 TTL history만 담당한다.
- S3는 장기 snapshot과 디버깅 근거를 담당한다.
- Backend는 CloudWatch/EKS/S3를 직접 반복 조회하지 않는다.
- Fast와 Slow collector는 서로 다른 필드만 업데이트한다.
- metric 수집 실패 자체도 `status=unknown`과 `errors[]`로 저장한다(section 단위 독립 try/except).
- HISTORY는 reduced 추이 스냅샷, full snapshot은 S3에만 둔다.
- collector 생존 여부(staleness)는 Backend가 읽기 시점에 `*_updated_at`으로 판정한다.
- 각 section은 `status`와 함께 `reasons[]`(근거)를 내보내, frontend가 임계값을 재계산하지 않는다.
- backend 의존성(Redis/RDS)과 notifier 파이프라인(SQS DLQ)도 수집 대상에 포함한다.

## Open Questions

구현 전에 아래를 확정해야 한다.

1. Kubernetes API 접근을 Lambda에서 할지, EKS 내부 CronJob collector로 분리할지
2. `HISTORY#FAST` TTL을 6시간으로 둘지 12시간으로 둘지
3. S3 `processed/cloud_infra` snapshot lifecycle을 30일 삭제로 둘지 Glacier 전환으로 둘지
4. Cloud infra dashboard API 응답 모델을 `LATEST` 그대로 노출할지, backend에서 한번 더 변환할지
