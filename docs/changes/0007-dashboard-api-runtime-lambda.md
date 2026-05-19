# 0007. Dashboard API Runtime: Lambda + API Gateway, Lambda는 VPC 밖

상태: **Dashboard API 부분 superseded by ADR 0012** / Lambda data processor 부분은 accepted 유지
결정일: 2026-05-15
관련 범위: M6 Risk Twin/Dashboard, 1번 Data/Dashboard VPC, Lambda data processor 배치

> 2026-05-18 갱신: Phase 1.5(포트폴리오 확장 단계)를 Phase 1으로 통합하면서, Dashboard API 런타임은 ECS Fargate 컨테이너로 변경됨 (ADR 0012). Lambda data processor (IoT Rule trigger) 부분은 본 ADR 결정을 그대로 유지하고 팀 합의 영역으로 변경하지 않는다.

## 기존 계획

`docs/planning/15_cloud_architecture_final.md`와 `docs/planning/12_two_vpc_mvp_architecture_decision.md`는 Dashboard Backend/API와 Lambda data processor를 1번 VPC의 Private App Subnet에 둔다고 표기했다. 런타임 형태(Lambda vs ECS Fargate vs EKS Pod)는 명시되지 않았고, Lambda를 VPC-attach할지 여부도 결정하지 않았다.

`docs/specs/data_storage_pipeline.md` 14일 수정에서 `risk-normalizer`, `risk-score-engine`, `pipeline-status-aggregator`가 별도 컨테이너 서비스가 아니라 **Lambda data processor 내부 처리 단계**로 통합된다는 점은 이미 정리되어 있다.

## 변경된 실제 기준

### 런타임 = Lambda + API Gateway

Dashboard Backend/API는 **AWS Lambda + Amazon API Gateway (REST 또는 HTTP API)** 조합으로 구현한다. ECS Fargate, EKS Pod, EC2 같은 항상 켜진 컨테이너 형태는 사용하지 않는다.

Lambda data processor (IoT Core 후속 처리)도 동일 런타임이다.

### Lambda는 VPC 밖 (VPC-attach 안 함)

Lambda data processor와 Dashboard API Lambda 모두 **VPC에 attach하지 않는다**. AWS public endpoint를 통해 DynamoDB / S3 / IoT 등 managed service에 접근한다.

### 호출 흐름

```text
SPA (브라우저)
  -> https://api.<도메인>/...
  -> API Gateway (Cognito Authorizer로 JWT 검증)
  -> Dashboard API Lambda
      -> DynamoDB LATEST/HISTORY (read-only IAM)
      -> S3 processed (read-only IAM)
```

```text
IoT Core
  -> IoT Rule (Lambda action)
  -> Lambda data processor
      -> DynamoDB LATEST/HISTORY (write)
      -> S3 processed (write)
```

cold start는 허용한다. 응답 지연이 민감한 사용자 경험은 본 시스템 범위가 아니다 (관제 화면이라 1~2초 첫 응답 지연 수용 가능).

## 변경 이유

### 런타임 선택

- Dashboard API는 read-only + 트래픽 적음(관제 화면) + 비즈니스 로직 얇음 → 항상 켜진 컨테이너는 과잉
- 워크스트림 A의 Hub EKS와 ArgoCD에서 이미 Kubernetes/컨테이너 운영 능력이 충분히 시연됨 → 같은 신호를 반복할 필요 없음
- 적정 사이징(right-sizing) 판단 자체가 포트폴리오 신호로 더 강함
- Lambda data processor는 IoT Core 메시지를 이벤트 기반으로 처리 → Lambda가 자연스러운 형태
- 비용: ECS Fargate (~$10-15/월) → Lambda+API GW (사용량 무료 티어 내 ~$0/월)

### Lambda를 VPC 밖에 두는 이유

- Lambda가 사용하는 자원은 DynamoDB, S3, IoT Core 모두 AWS managed service public endpoint → VPC-attach 불필요
- VPC-attach 시 발생하는 단점:
  - Lambda ENI 생성/관리 → cold start 추가 지연
  - VPC 내부에서 DDB/S3 접근하려면 VPC Endpoint 별도 구성 또는 NAT GW 통과
  - NAT GW data processing 비용 ($0.056/GB) 발생 가능
- 후속에 RDS/ElastiCache 같은 VPC 내 사설 자원이 추가되면 그때 VPC-attach를 ADR로 재결정한다

## 영향

### 런타임 깊이 보강

단순 "Lambda 함수 만들고 끝"이 아니라 다음 항목을 IaC/코드 레벨에서 갖춘다.

- Lambda Powertools (Python 또는 TypeScript) 적용 — 구조화 로그, 메트릭, 트레이싱
- AWS X-Ray 분산 추적 (API GW → Lambda → DDB/S3)
- API Gateway request validation (JSON Schema)
- API Gateway throttling + usage plan
- Lambda alias/version 활용한 무중단 배포 (GitHub Actions)
- 단위 테스트 + moto로 DDB/S3 mock
- CloudWatch 커스텀 대시보드 + alarm

### 1번 VPC 토폴로지 간소화

- Private App Subnet에서 Dashboard API/Web 컨테이너가 빠짐 → MVP에서 1번 VPC 내부 워크로드는 사실상 0
- VPC는 ALB(필요 시)/Cognito 도메인/WAF/Route53 등 네트워크 가장자리 자원 위주로 구성
- Lambda data processor는 1번 VPC 다이어그램에서 "VPC 외부 managed service" 영역에 표기

### 합류 지점

- IoT Rule 변경 (Lambda action 추가)은 워크스트림 A와 합류 지점 → 신규 IoT Rule을 추가하는 형태로 격리 (ADR로 별도 분리 권장)

## 업데이트 필요한 문서

- `docs/planning/15_cloud_architecture_final.md` (Private App Subnet 항목 정리, Lambda 위치 명시)
- `docs/planning/12_two_vpc_mvp_architecture_decision.md` (런타임 형태 보강)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (진입 순서에 Lambda + API GW 반영)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (API Gateway path와 JWT 헤더 경계)
- `docs/architecture/01_target_architecture.md` (Lambda 외부 표기)
- `docs/ops/15_aws_cost_baseline.md` (Lambda, API Gateway, X-Ray 비용 항목)

## 검증

- Lambda 함수 구성 확인: `VpcConfig`가 비어 있어 Lambda가 VPC-attach되지 않음
- Lambda IAM role: DynamoDB/S3 prefix-scoped read 또는 write 권한만 보유
- API Gateway authorizer 설정: Cognito JWT 검증이 활성화되고 미인증 요청이 401 반환
- X-Ray trace map에서 API GW → Lambda → DDB/S3 segment가 보임
- moto 기반 단위 테스트가 CI에서 통과
