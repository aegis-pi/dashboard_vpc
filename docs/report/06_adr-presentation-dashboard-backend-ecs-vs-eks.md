# ADR 발표용 - Dashboard Backend: ECS Fargate vs EKS

| 메타데이터 | 값 |
| --- | --- |
| 상태 | 발표용 정리 |
| 기준 ADR | [ADR 0012 Dashboard Backend 런타임: ECS Fargate](../changes/0012-introduce-container-backend-for-dashboard.md), [Data/Dashboard VPC Workplan](../planning/16_data_dashboard_vpc_workplan.md) |
| 결정 요약 | Dashboard Backend는 Hub EKS가 아니라 Data/Dashboard VPC의 ECS Fargate에서 실행한다. |
| 최종 선택 | **ECS Fargate + ALB + FastAPI** |

---

## 1. 문제 정의

Dashboard Backend는 사용자 요청을 받아 공장 상태, 이력, 보고서, 사용자 권한, WebSocket 연결을
처리하는 API 런타임이다.

이 Backend를 어디에서 실행할지에 대해 두 가지 선택지가 있었다.

1. 기존 Control/Management 영역의 Hub EKS에 Dashboard Backend를 배포한다.
2. Data/Dashboard VPC에 ECS Fargate 기반 Backend를 별도로 둔다.

이 결정은 단순한 컨테이너 실행 위치 선택이 아니라, **사용자 관제 API를 Control plane과 같은
Kubernetes 클러스터에 둘 것인지**, 아니면 **Data/Dashboard 전용 런타임으로 분리할 것인지**에 대한
결정이다.

---

## 2. 비교 대상

### 대안 A. Hub EKS에 Dashboard Backend 배포

```text
Browser
  -> Ingress / ALB
  -> Hub EKS
      -> Dashboard Backend Pod
      -> DynamoDB / S3 / RDS / Redis
```

Hub EKS는 이미 Control/Management VPC에서 ArgoCD, Tailscale Operator, Grafana, AWS Load Balancer
Controller를 운영한다. Dashboard Backend를 EKS에 올리면 Kubernetes 운영 모델을 재사용할 수 있다.

### 대안 B. Data/Dashboard VPC의 ECS Fargate에 배포

```text
Browser
  -> CloudFront + S3 Dashboard Web
  -> Cognito Login
  -> ALB HTTPS
  -> ECS Fargate FastAPI Backend
      -> DynamoDB FactoryStatus
      -> S3 reports / processed
      -> RDS PostgreSQL metadata
      -> Redis Pub/Sub
      -> Bedrock chatbot explain
```

Dashboard Backend는 Data/Dashboard VPC의 private app subnet에서 ECS Fargate task로 실행된다.
사용자 진입점은 ALB이고, Backend는 read model과 metadata 저장소를 조회한 뒤, 필요한 경우 Bedrock에
요약된 evidence만 전달해 설명을 생성한다.

---

## 3. 비교

| 기준 | Hub EKS 배포 | ECS Fargate 배포 |
| --- | --- | --- |
| 기존 런타임 재사용 | Hub EKS 운영 모델 재사용 가능 | ECS service/task 운영 필요 |
| Control plane 격리 | Dashboard API와 Control plane이 같은 EKS/VPC에 가까워짐 | Dashboard API가 Data/Dashboard VPC에 분리됨 |
| 운영 복잡도 | Ingress, namespace, RBAC, IRSA, cluster add-on 고려 필요 | ALB + ECS Service + TaskDef 중심으로 단순화 |
| 사용자 트래픽 영향 | 사용자 트래픽이 Hub EKS 운영면과 섞일 수 있음 | 사용자 트래픽은 Dashboard 전용 ALB/ECS로 제한 |
| WebSocket 처리 | Kubernetes service/ingress 설정 필요 | Fargate task가 Redis Pub/Sub를 구독하고 WebSocket 유지 |
| 저장소 연결 | EKS에서 RDS/Redis/DDB/S3 접근 경로 설계 필요 | 같은 Dashboard VPC 안의 RDS/Redis와 직접 연결 |
| 배포/복구 경계 | Hub rebuild가 Dashboard API에 영향 가능 | Hub rebuild와 Dashboard API 생명주기 분리 |
| 현재 요구 적합성 | Kubernetes가 필요할 만큼 복잡한 orchestration은 아님 | stateless API + connection pool + WebSocket에 적합 |

---

## 4. 선택

최종 선택은 **ECS Fargate + ALB + FastAPI**다.

Dashboard Backend는 Hub EKS가 아니라 Data/Dashboard VPC의 ECS Fargate service로 실행한다.
Control/Management VPC의 EKS, ArgoCD, Spoke K3s API, Tailscale 관리망은 Dashboard Backend가 직접
호출하지 않는다.

```text
Dashboard Backend
  - Runtime: FastAPI container
  - Compute: ECS Fargate
  - Entry: Internet-facing ALB HTTPS
  - Network: Data/Dashboard VPC private app subnet
  - Data access: DynamoDB, S3 reports/processed/image_snapshot, RDS, Redis, Cognito Admin API, Bedrock
```

---

## 5. 선택 근거

### 5.1 Dashboard는 Control plane이 아니라 사용자 관제 API다

Hub EKS는 ArgoCD, Tailscale, Grafana, Spoke K3s 접근 등 배포와 운영 제어에 가까운 기능을 담당한다.
반면 Dashboard Backend는 사용자가 보는 관제 API다.

Dashboard가 필요한 데이터는 EKS API나 K3s API의 live 호출이 아니라, DataProcessor와 collector가
미리 만든 DynamoDB/S3/RDS/Redis read model이다. 따라서 Dashboard Backend를 Hub EKS에 올릴 이유가
강하지 않았다.

### 5.2 사용자 트래픽과 운영 제어면을 분리한다

Dashboard Backend를 Hub EKS에 올리면 사용자 API 트래픽, WebSocket 연결, 인증/인가 처리가
Control/Management 영역과 같은 운영면에 가까워진다.

ECS Fargate를 선택하면 사용자 트래픽은 다음 경로로 제한된다.

```text
Browser
  -> CloudFront / Cognito / ALB
  -> ECS Fargate Backend
  -> read model
```

이 경로에는 Hub EKS, ArgoCD, Tailscale, Spoke K3s API가 포함되지 않는다.

### 5.3 Backend 요구사항은 ECS가 더 단순하게 충족한다

Dashboard Backend는 stateless FastAPI 애플리케이션이다. 필요한 것은 container 실행, HTTPS 진입점,
health check, rolling update, autoscaling, secret injection, CloudWatch logging이다.

이 요구에서는 Kubernetes cluster orchestration의 이점보다 ECS Service/Fargate의 작은 운영 경계가 더
맞았다. AWS Fargate는 서버나 EC2 cluster를 직접 provision/configure/scale하지 않고 container를
실행하는 런타임이므로, 이 Backend에 필요한 운영 표면을 ALB, ECS service, task definition, IAM role
중심으로 좁힐 수 있다.

반대로 EKS를 사용하면 namespace, Ingress, service account, IRSA, node/pod 운영, cluster add-on
상태까지 함께 고려해야 한다. 이 프로젝트에서 Dashboard Backend는 Kubernetes custom controller,
sidecar mesh, DaemonSet, multi-namespace policy 같은 Kubernetes 고유 기능을 필요로 하지 않았다.

### 5.4 RDS/Redis connection pool과 WebSocket 유지에 적합하다

Dashboard Backend는 DynamoDB/S3 조회뿐 아니라 RDS PostgreSQL metadata, Redis Pub/Sub, WebSocket
연결, Cognito 기반 사용자 관리, Bedrock 기반 데이터 QA까지 함께 다룬다.

Fargate task는 장시간 실행되는 컨테이너이므로 connection pool과 WebSocket connection을 유지하기
좋다. Lambda + API Gateway 초안보다 이 부분이 자연스럽고, EKS보다 운영 범위가 좁다.

### 5.5 Hub rebuild와 Dashboard API 생명주기를 분리한다

Hub EKS는 rebuild, ArgoCD 복구, Tailscale 연결, EKS access entry 같은 운영 이벤트가 있을 수 있다.
Dashboard Backend를 Hub EKS에 올리면 이런 이벤트가 사용자 API 가용성에 직접 영향을 줄 수 있다.

ECS Fargate를 Data/Dashboard VPC에 두면 Hub EKS를 재구축하더라도 Dashboard API와 read model 조회
경로는 별도 생명주기를 가진다.

---

## 6. 선택으로 얻은 장점

### 6.1 경계가 명확해졌다

```text
Hub EKS              = Control / Management
ECS Dashboard Backend = User API / Monitoring
DataProcessor         = Telemetry processing
Read model            = Dashboard data source
```

Dashboard가 제어면을 직접 호출하지 않는 구조가 되면서, 보안 경계와 장애 영향 범위를 설명하기
쉬워졌다.

### 6.2 운영 복잡도를 줄였다

Dashboard Backend를 위해 EKS namespace, ingress, service account, cluster 권한, node resource를
추가로 관리하지 않아도 된다. ECS service, task definition, ALB target group, security group 중심으로
운영 범위가 좁아졌다.

### 6.3 WebSocket과 다중 저장소 조회를 컨테이너 안에서 일관되게 처리한다

Backend는 Redis Pub/Sub를 구독하고 WebSocket으로 브라우저에 변경을 전달한다. 동시에 DynamoDB,
S3, RDS, Bedrock을 조합해 API 응답을 만든다. 장시간 실행되는 Fargate task는 이 조합을 안정적으로
처리하기 좋다.

### 6.4 Hub 장애나 재구축의 영향을 줄였다

Hub EKS가 ArgoCD나 Tailscale 운영 때문에 재구축되더라도, Dashboard Backend는 별도 ECS service로
남을 수 있다. 사용자는 read model 기반으로 공장 상태를 계속 조회할 수 있고, Hub 제어면 장애가
곧바로 사용자 API 장애가 되지 않는다.

---

## 7. Trade-off

이 선택은 EKS 재사용의 장점을 일부 포기한 결정이다.

| 포기한 것 | 영향 |
| --- | --- |
| Kubernetes 운영 모델 단일화 | Edge/Hub는 K3s/EKS, Dashboard는 ECS로 compute runtime이 나뉜다. |
| EKS add-on 재사용 | AWS Load Balancer Controller, IRSA, namespace 정책을 Dashboard에 그대로 쓰지 않는다. |
| Pod-level 세밀한 제어 | Kubernetes scheduling, sidecar, custom controller 패턴은 사용하지 않는다. |
| 완전한 비용 최소화 | ALB, NAT, ECS task, RDS, Redis가 있는 Dashboard VPC 고정비가 존재한다. |
| EKS cluster 비용 공유 | Hub EKS에 합류하면 기존 cluster를 공유할 수 있지만, EKS는 cluster 시간 비용과 worker/node 리소스 비용을 별도로 갖는다. Dashboard 때문에 Hub cluster 운영 범위를 키우지 않는 쪽을 선택했다. |

대신 Dashboard Backend는 Control plane과 분리된 사용자 API 런타임으로 운영되고, 현재 요구사항에
필요한 만큼의 컨테이너 실행 환경만 사용한다.

---

## 8. 발표용 한줄 요약

> 이미 Hub EKS가 있었지만 Dashboard Backend는 제어면이 아니라 사용자 관제 API이므로, EKS에
> 합류시키지 않고 Data/Dashboard VPC의 ECS Fargate로 분리해 운영 복잡도와 장애 영향 범위를 줄였다.

---

## 관련 문서

* [ADR 0012 - Dashboard Backend 런타임: ECS Fargate](../changes/0012-introduce-container-backend-for-dashboard.md)
* [ADR 0030 - ECS Backend right-sizing / Auto Scaling](../changes/0030-ecs-backend-autoscaling.md)
* [ADR 0031 - Dashboard RBAC 사용자 관리](../changes/0031-dashboard-rbac-user-management.md)
* [ADR 0033 - 챗봇 데이터 QA 아키텍처](../changes/0033-chatbot-data-qa-architecture.md)
* [Data/Dashboard VPC Workplan](../planning/16_data_dashboard_vpc_workplan.md)
* [Monitoring Dashboard API Spec](../specs/monitoring_dashboard/02_api_spec.md)
* [AWS Fargate for Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
* [Amazon EKS Pricing](https://aws.amazon.com/eks/pricing/)
