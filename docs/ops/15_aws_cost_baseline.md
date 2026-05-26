# AWS Cost Baseline

상태: source of truth
기준일: 2026-05-26
리전: `ap-south-1` / Asia Pacific (Mumbai), 글로벌(CloudFront/ACM us-east-1) 일부
수정 이력:
  - 2026-05-26 v2.1  Step 9 CI/CD 구현/적용/SPA 배포 반영. IAM role 1개 추가(상시 비용 없음). S3 PUT/GET/DELETE + CloudFront invalidation: usage-based 소량. 고정 비용 변화 없음.
  - 2026-05-26 v2.0  Step 8 Frontend SPA 로컬 구현 완료 반영. 신규 AWS 리소스 없음, 기존 S3/CloudFront 배포는 Step 9에서 진행.
  - 2026-05-26 v1.9  Step 7 Backend 활성화 반영. ECR `sha-9d2c200`, ECS desired/running 1, `/healthz` 200 확인. 리소스 상태 표를 active로 갱신.
  - 2026-05-26 v1.8  Step 7 apply 완료 + Step 7.5 Route53 영구 분리 반영. Route53 hosted zone을 영구 자원으로 재분류. destroy 후 잔여 비용 설명 갱신. $0.50/월 영구 비용 명시.
  - 2026-05-26 v1.7  Step 8을 운영용 Frontend Vite + React 마이그레이션으로 재정의. LLM report-generator/Bedrock 비용은 팀원/후속 작업 예상치로 분리. Backend ECS Task Role의 Bedrock 권한 제거 반영.
  - 2026-05-26 v1.6  Step 7 Terraform 구현 완료 반영. ECR `aegis/dashboard-backend` 신설, ECS Fargate Cluster/TaskDef/Service/CloudWatch Logs/IAM 추가. Secrets Manager 2개 추가(database_url/redis_url, 합계 4개). 리소스 상태 표 갱신. 비용 표 갱신(Secrets 4개로 수정).
  - 2026-05-26 v1.5  Step 6 완료(로컬 구현) 반영. apps/dashboard-backend/ 신설, ECS/ECR/ALB는 Step 7 배포 전으로 AWS 비용 미발생. 리소스 상태 표 Step 6 항목 갱신.
  - 2026-05-22 v1.4  `infra/data-dashboard` destroy 완료(73 destroyed). Data/Dashboard VPC active 리소스 삭제, backend state bucket + RDS final snapshot만 잔존. build/destroy wrapper와 snapshot/secret 재생성 기준 반영.
  - 2026-05-21 v1.3  Step 5.5 apply 완료 (ADR 0022). AEGIS-DynamoDB-FactoryStatus Streams 활성화. Lambda data processor env / IAM / notifier ESM을 공식 table로 재정렬. 중복 aegis-factory-status 삭제 완료.
  - 2026-05-21 v1.2  Step 5 apply 완료. Lambda notifier/SQS DLQ 추가 (7 resources 추가, 누적 73). 리소스 상태 표 갱신.
  - 2026-05-21 v1.1  Step 3 apply 완료. DynamoDB 2개/RDS PostgreSQL/ElastiCache Redis/Secrets Manager 2개 생성(12 resources 추가, 누적 59). 리소스 상태 표 갱신.
  - 2026-05-21 v1.0  Step 2 전체 apply 완료. 47 resources 생성 (3회 apply 누적). ACM ISSUED(ALB ap-south-1 / CloudFront us-east-1). CloudFront 배포/HTTPS listener/S3 bucket policy/Route53 web_cloudfront 레코드 활성. terraform plan No changes 확인. 리소스 상태 표 갱신.
  - 2026-05-21 v0.9  Step 2 부분 apply 완료. 41 resources 생성(VPC/NAT GW/ALB/SGs/Cognito/S3-web/CloudFront-OAC/Route53-zone/ACM 요청). ACM PENDING_VALIDATION(Gabia NS 위임 필요). 잔여 6개(CloudFront 배포/HTTPS listener 등)는 NS 위임 후 전체 apply. 현재 리소스 상태 반영. 비용은 추정치 유지(NAT GW 1개 포함 상시 가동 ~$125/월, 데모 ~$8~10/월).
  - 2026-05-21 v0.8  backend-bootstrap apply 완료(`kjw-aegis-terraform-state` S3 backend bucket + S3 native lockfile). DynamoDB lock table은 미사용으로 정정. plan 47 resources 검증 완료. 비용 항목은 apply 전 추정치 그대로 유지(실측은 infra/data-dashboard apply 후 v0.9에서 갱신 예정).
  - 2026-05-21 v0.7  Phase 1 Step 2 `infra/data-dashboard/` Terraform skeleton 완성. 리소스 상태 표에 1번 VPC skeleton 반영. 비용 항목은 v0.5/v0.6 추정치 그대로 유지(실측은 apply 후 v0.8에서 갱신 예정).
  - 2026-05-20 v0.6  2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성 상태와 1번 VPC 미배포 상태를 현재 리소스 상태에 반영.
  - 2026-05-19 v0.5  ADR 0017 반영. 1번 VPC 메타 저장소를 Aurora Serverless v2에서 RDS PostgreSQL(db.t4g.micro, gp3 20GiB)로 변경하고 비용 기준 재계산.
  - 2026-05-18 v0.4  ADR 0012~0016 반영. Phase 1 통합으로 NAT GW × 1 + ALB + ECS Fargate + Aurora Serverless v2 + ElastiCache Redis + Bedrock 항목 신설. 데모 운영 패턴(build/destroy 사이클) 비용 분리.
  - 2026-05-15 v0.3  ADR 0011 반영. 1번 VPC NAT GW 제거 후 고정 비용 ~$0.50/월로 갱신, S3 dashboard-web bucket 항목 추가.
  - 2026-05-15 v0.2  ADR 0006~0010 반영. 1번 Data/Dashboard VPC 예상 비용 섹션 추가 (실제 apply 전 추정).
  - 2026-05-08  Hub destroy 후 baseline

## 목적

이 문서는 Aegis-Pi AWS Hub를 켜 두었을 때와 `destroy-all` 이후의 시간당 비용 기준을 기록한다.

새 AWS 리소스, 관리형 서비스, 상시 실행 컴포넌트, 저장소, 네트워크 경로가 추가되면 이 문서를 함께 갱신한다. 특히 `infra/hub`, `infra/foundation`, Dashboard VPC, AMP, ECR, Load Balancer, NAT Gateway, Public IPv4, EBS, S3 lifecycle, CloudWatch Logs, IoT Core 사용량 기준이 바뀌면 비용 영향을 다시 계산한다.

## 현재 Aegis 리소스 상태

2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성 상태와 2026-05-22 Data/Dashboard VPC destroy 결과 기준이다. Hub active 비용 산정은 아래 "Hub active 시 비용" 섹션에 별도로 유지한다. 1번 Data/Dashboard VPC는 `scripts/destroy/destroy-data-dashboard.sh`와 동일한 절차로 73개 리소스가 삭제됐다. 현재 Data/Dashboard 측 잔여 리소스는 Terraform backend S3 bucket과 RDS final snapshot이다.

| 영역 | 리소스 | 수량/크기 | 상태 |
| --- | --- | ---: | --- |
| EKS | `AEGIS-EKS` control plane | 1 | active |
| EC2 | `AEGIS-EKS-node` managed node group | 2 × `t3.medium` | active |
| EBS | EKS node root volume | 40 GiB 추정 | active with node group |
| VPC/Subnet | `AEGIS-VPC` and subnets | 1 VPC / 2 AZ | active |
| NAT Gateway | Hub NAT Gateway | 2 | active |
| Public IPv4 | NAT Gateway Elastic IP / Admin UI ALB public IPv4 | active 수량은 AWS 조회로 확인 | active |
| S3 | `aegis-bucket-data` | 1 bucket | active |
| IoT Core | `AEGIS_IoTRule_factory_a_raw_s3` | 1 rule | active |
| IoT Core | `AEGIS-IoTThing-factory-a` / `AEGIS-IoTPolicy-factory-a` / certificate | 1 set | active |
| AMP | `AEGIS-AMP-hub` | 1 workspace | active |
| ECR | `aegis/edge-agent` | 1 repo | active, push/pull 검증은 워크스트림 A 진행 중 |
| EKS workload | `observability/grafana` | 1 release | active |
| EKS workload | `observability/prometheus-agent` | 1 release | active |
| EKS workload | `kube-system/aws-load-balancer-controller` | 1 release | active |
| Route53 | public hosted zone `minsoo-tech.cloud` | 1 zone | active |
| ACM | public certificate for Admin UI hosts | 1 regional certificate set | active / ISSUED |
| ALB | `aegis-admin-ui` | 1 | active |
| Data/Dashboard VPC | `infra/data-dashboard/` Terraform | 112 state objects | active (Step 7~9 apply 완료). `terraform plan` No changes |
| Data/Dashboard VPC | backend-bootstrap: `kjw-aegis-terraform-state` S3 backend bucket + S3 native lockfile | 1 bucket (+ ownership/public-block/versioning/SSE) | active, 유지 |
| Data/Dashboard VPC | Route53 hosted zone `aegis-pi.cloud` | 1 zone | **active (영구 자원)**. Step 7.5 이후 `infra/data-dashboard-dns/` root가 관리. `infra/data-dashboard` destroy 대상에서 제외. `$0.50/월` 상시 발생 |
| Data/Dashboard VPC | 1번 VPC / NAT GW (Azone 단일) / ALB / SGs × 5 / Cognito / S3-web | 1 set | active (Step 7 apply 이후) |
| Data/Dashboard VPC | ACM alb (ap-south-1) / cloudfront (us-east-1) | 2 certificates | active / ISSUED |
| Data/Dashboard VPC | CloudFront 배포 / HTTPS listener / S3 bucket policy / Route53 web_cloudfront | 1 set | active |
| Data/Dashboard VPC | DynamoDB `AEGIS-DynamoDB-FactoryStatus` | 1 table | **active**. 공식 hot store(ADR 0022), Streams NEW_AND_OLD_IMAGES 활성(2026-05-21). Lambda data processor write 대상 |
| Data/Dashboard VPC | DynamoDB `aegis-factory-status` | 0 | deleted |
| Data/Dashboard VPC | DynamoDB `aegis-daily-report` | 1 table | active, on-demand |
| Data/Dashboard VPC | RDS PostgreSQL `kjw-aegis-data-pg` | 1 instance | active |
| Data/Dashboard VPC | ElastiCache Redis `kjw-aegis-data-redis` | 1 replication group | active |
| Data/Dashboard VPC | Secrets Manager (RDS + Redis AUTH) | 2 secrets | active |
| Data/Dashboard VPC | Lambda data processor `KJW-AEGIS-Data-Lambda-data-processor` | 1 function | active |
| Data/Dashboard VPC | IoT Rule `KJW_AEGIS_Data_IoTRule_factory_state_processor` | 1 rule | active |
| Data/Dashboard VPC | IoT Rule `KJW_AEGIS_Data_IoTRule_infra_state_processor` | 1 rule | active |
| Data/Dashboard VPC | Lambda notifier `KJW-AEGIS-Data-Lambda-notifier` | 1 function | active |
| Data/Dashboard VPC | SQS DLQ `kjw-aegis-data-notifier-dlq` | 1 queue | active |
| Data/Dashboard VPC | DDB Streams ESM (AEGIS-DynamoDB-FactoryStatus → Lambda notifier) | 1 mapping | active |
| Data/Dashboard VPC | Dashboard Backend 코드 (`apps/dashboard-backend/`) | 로컬 구현 완료 | Step 6 완료 (2026-05-26). pytest 18 passed, docker build 통과 |
| Data/Dashboard VPC | ECR `aegis/dashboard-backend` | 1 repo | active. Image tag `sha-9d2c200` push 확인. GitHub Actions OIDC role 신설, org secret 등록 완료(사용자 확인 기준) |
| Data/Dashboard VPC | ECS Fargate Cluster/TaskDef/Service | desired 1 / running 1 | active. `kjw-aegis-data-backend:2`, image `sha-9d2c200`, rollout completed, `/healthz` 200 |
| Data/Dashboard VPC | CloudWatch Logs `/ecs/kjw-aegis-data-backend` | 1 log group | active. 30일 보존. 비용 usage-based (소량) |
| Data/Dashboard VPC | Secrets Manager `kjw-aegis-data-database-url`, `kjw-aegis-data-redis-url` | 2 secrets | active. ECS 컨테이너 시크릿 주입용 |
| Data/Dashboard VPC | IAM role `KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy` | 1 role | active (Step 9 apply 후). IAM: 무료 |
| Data/Dashboard VPC | S3 web bucket deploy (PUT/DELETE/GET ops) | usage-based | Step 9 workflow 실행 완료. PUT ~$0.005/1000 req, GET ~$0.0004/1000 req |
| Data/Dashboard VPC | CloudFront invalidation `//*` | usage-based | 월 1,000 paths 무료, 초과 $0.005/path |
| Data/Dashboard VPC | Lambda report-generator | 0 | not deployed — LLM 일간 보고서 팀원/후속 작업 |

현재 확인된 비활성 또는 미생성 항목:

- NLB 없음
- 1번 Data/Dashboard VPC Step 7 Backend는 active. ECS desired/running 1, ECR image `sha-9d2c200`, `/healthz` 200 확인
- Lambda report-generator / Bedrock 일간 보고서는 팀원/후속 작업으로 현재 Step 8 범위가 아님
- Resource Groups Tagging API는 삭제 직후 terminated/deleted 리소스나 `PendingDeletion` KMS key를 한동안 반환할 수 있다.
- EKS managed node group Auto Scaling Group은 직접 비용 리소스가 아니므로 EC2/EBS/NAT/EKS 기준으로 비용 계산

## 시간당 비용 계산

### Hub active 시 비용

| 비용 항목 | 수량 | 단가 | 계산 | 시간당 비용 |
| --- | ---: | ---: | --- | ---: |
| EKS standard cluster | 1 | `$0.1000 / hour` | `1 * 0.1000` | `$0.1000` |
| EC2 Linux `t3.medium` | 2 | `$0.0448 / hour` | `2 * 0.0448` | `$0.0896` |
| NAT Gateway hourly | 2 | `$0.0560 / hour` | `2 * 0.0560` | `$0.1120` |
| Public IPv4 in-use | 2 | `$0.0050 / hour` | `2 * 0.0050` | `$0.0100` |
| EBS gp3 storage | 40 GiB | `$0.0912 / GB-month` | `40 * 0.0912 / 730` | `$0.0050` |
| KMS customer managed key | 1 | `$1.00 / month` | `1 / 730` | `$0.0014` |
| Route53 public hosted zone | 1 | `$0.50 / month` | `0.50 / 730` | `$0.0007` |
| Application Load Balancer | 1 | `$0.0239 / hour` | `1 * 0.0239` | `$0.0239` |
| ALB LCU | 최소 사용량 기준 1 LCU 가정 | `$0.0080 / LCU-hour` | `1 * 0.0080` | `$0.0080` |
| Public IPv4 for internet-facing ALB | 2개 추정 | `$0.0050 / IP-hour` | `2 * 0.0050` | `$0.0100` |
| S3 Standard storage | 366 bytes | `$0.025 / GB-month` | negligible | `~$0.0000` |
| AMP workspace | 1 | usage-based | ingest/storage/query 사용량 기준. 고정 시간 비용에는 미포함 | `usage-based` |

Hub active + Admin UI Ingress 기준 고정 시간 비용:

```text
0.1000 + 0.0896 + 0.1120 + 0.0100 + 0.0050 + 0.0014 + 0.0007 + 0.0239 + 0.0080 + 0.0100 = 0.3606 USD/hour
```

환산:

| 기간 | 예상 비용 |
| --- | ---: |
| 1시간 | `~$0.36` |
| 24시간 | `~$8.65` |
| 730시간 | `~$263.24` |

위 계산은 세금, 크레딧, Free Tier, Savings Plans, Reserved Instances, 환율을 반영하지 않은 온디맨드 기준이다. AMP ingest/storage/query 비용은 사용량 기반이라 위 고정 시간 비용 합계에는 포함하지 않는다. AWS Load Balancer Controller pod 자체는 EKS node 위에서 실행되므로 현재 고정 시간 비용을 별도로 늘리지 않는다.

### Admin UI Ingress 비활성화 시 절감 비용

`scripts/destroy/destroy-hub.sh`를 실행하거나 Admin UI Ingress를 삭제하면 Public ALB 1개가 제거된다. 2026-05-06 AWS Pricing API 기준 `ap-south-1` Application Load Balancer 단가는 `$0.0239 / hour`, LCU는 `$0.008 / LCU-hour`다.

| 비용 항목 | 수량 | 단가 | 계산 | 시간당 비용 |
| --- | ---: | ---: | --- | ---: |
| Application Load Balancer | 1 | `$0.0239 / hour` | `1 * 0.0239` | `$0.0239` |
| ALB LCU | 최소 사용량 기준 1 LCU 가정 | `$0.0080 / LCU-hour` | `1 * 0.0080` | `$0.0080` |
| Public IPv4 for internet-facing ALB | 2개 추정 | `$0.0050 / IP-hour` | `2 * 0.0050` | `$0.0100` |

Admin UI Ingress가 만드는 추가 고정성 비용 추정:

```text
0.0239 + 0.0080 + 0.0100 = 0.0419 USD/hour
```

Admin UI Ingress를 끄면 위 비용, 약 `0.0419 USD/hour`를 줄일 수 있다. 실제 LCU와 public IPv4 수는 트래픽, AZ, ALB 동작 상태에 따라 달라질 수 있으므로 `aws elbv2 describe-load-balancers`, Cost Explorer, Public IP Insights로 다시 확인한다.

## 1번 Data/Dashboard VPC 예상 비용 (ADR 0006~0017, Phase 1 통합, apply 전 추정)

ADR 0012~0017으로 Phase 1 통합 결정이 반영된 후의 예상 시간/월 비용이다. 실제 apply 후 측정값으로 재갱신한다.

ADR 0011(NAT GW 제거)는 ADR 0012로 supersede됨 → Phase 1에서 NAT Gateway × 1을 단일 AZ로 재도입. 데모 운영 패턴(`build-data-dashboard.sh` / `destroy-data-dashboard.sh` 사이클)으로 미가동 시에는 비용이 ~$2~3/월로 회복된다.

### 고정 시간 비용 — Phase 1 가동 시 (상시 운영 가정)

| 비용 항목 | 수량 | 단가 | 시간당 | 월 환산 (730h) |
| --- | ---: | ---: | ---: | ---: |
| Route53 public hosted zone (신규 도메인) | 1 | `$0.50 / month` | `$0.0007` | `$0.50` |
| ACM public certificate | 2 | 무료 (DNS 검증) | `$0.0000` | `$0.00` |
| Cognito User Pool (관리자 1~5명) | 1 | 50,000 MAU 무료 티어 | `$0.0000` | `$0.00` |
| NAT Gateway × 1 (단일 AZ, ADR 0012) | 1 | `$0.0560 / hour` | `$0.0560` | `$40.88` |
| NAT Gateway Elastic IP × 1 | 1 | `$0.0050 / hour` | `$0.0050` | `$3.65` |
| ALB (HTTPS) | 1 | `$0.0225 / hour` | `$0.0225` | `$16.43` |
| ALB LCU (최소 1 LCU 가정) | 1 | `$0.0080 / LCU-hour` | `$0.0080` | `$5.84` |
| Public IPv4 for internet-facing ALB | 2 | `$0.0050 / IP-hour` | `$0.0100` | `$7.30` |
| ECS Fargate (0.5 vCPU / 1 GB, 1 task 상시) | 1 | `$0.04048/vCPU-h + $0.004445/GB-h` | `$0.0247` | `$18.05` |
| RDS PostgreSQL `db.t4g.micro` Single-AZ | 1 | `$0.021 / hour` | `$0.0210` | `$15.33` |
| RDS PostgreSQL gp3 storage (20GiB) | 20 GiB | `$0.131 / GB-month` | `$0.0036` | `$2.62` |
| ElastiCache Redis (cache.t4g.micro) | 1 | `$0.016 / hour` | `$0.0160` | `$11.68` |
| Secrets Manager (RDS + Redis AUTH + DATABASE_URL + REDIS_URL) | 4 | `$0.40 / secret-month` | `$0.0022` | `$1.60` |
| ECR `aegis/dashboard-backend` 이미지 스토리지 | ~0.5 GB 추정 | `$0.10 / GB-month` | `~$0.0001` | `~$0.05` |
| CloudWatch Logs ECS ingest (usage) | usage-based | `$0.76 / GB` | usage | usage |
| **고정 합계 (상시 가동)** | | | `~$0.1699 / hour` | **`~$123.90 / month`** |

> 상시 가동은 ~$125/월이지만, **데모 운영 패턴(build/destroy 사이클)** 으로 실비를 ~$8~10/월 수준으로 낮출 수 있다.

### 데모 운영 패턴 비용 (월 2회 × 8h = 16h/월 가동)

| 비용 항목 | 시간당 | 16h/월 비용 |
| --- | ---: | ---: |
| NAT Gateway + EIP | `$0.0610` | `$0.98` |
| ALB + LCU + Public IPv4 | `$0.0405` | `$0.65` |
| ECS Fargate (1 task) | `$0.0247` | `$0.40` |
| RDS PostgreSQL `db.t4g.micro` compute | `$0.0210` | `$0.34` |
| RDS PostgreSQL gp3 storage (20GiB) | (월정액) | `$2.62` |
| ElastiCache Redis | `$0.0160` | `$0.26` |
| Secrets Manager (월정액, destroy로 삭제) | (월정액) | `$0.80` (켜진 동안만 비례) |
| Route53 + Cognito + ACM | `$0.0007` | `$0.50` |
| **고정 합계 (데모 운영)** | | **`~$6.55 / month`** |

### 사용량 기반 비용 (관제 트래픽 규모 가정)

| 비용 항목 | 단가 | 가정 | 예상 월 |
| --- | ---: | --- | ---: |
| CloudFront data out | `$0.085 / GB` (1TB 무료 후) | < 5GB/월 (관제 SPA) | `~$0.00` (무료 티어 내) |
| CloudFront requests | `$0.0075 / 10k HTTPS` | < 100k/월 | `~$0.08` |
| Lambda data processor invocations | `$0.20 / 1M` (1M 무료) | < 200k/월 | `~$0.00` (무료 티어 내) |
| Lambda notifier invocations (DDB Streams) | `$0.20 / 1M` | < 200k/월 | `~$0.00` |
| Lambda report-generator invocations | `$0.20 / 1M` | 팀원/후속 LLM 보고서 도입 시 3 호출/일 × 30 = 90/월 | `~$0.00` |
| Lambda compute (GB-sec) | `$0.0000166667 / GB-sec` (400k 무료) | < 100k GB-sec | `~$0.00` |
| Bedrock Claude 3 Haiku (input) | `$0.00025 / 1k tokens` | 팀원/후속 LLM 보고서 도입 시 일간 보고서 + 이상 요약 ≈ 60k tokens/월 | `~$0.015` |
| Bedrock Claude 3 Haiku (output) | `$0.00125 / 1k tokens` | 팀원/후속 LLM 보고서 도입 시 ≈ 15k tokens/월 | `~$0.019` |
| DynamoDB on-demand write | `$1.25 / 1M WCU` | factory-a 3s/20s 주기 = ~120k write/월 | `~$0.15` |
| DynamoDB on-demand read | `$0.25 / 1M RCU` | Backend 캐시 hit으로 read 감소 ~50k/월 | `~$0.013` |
| DynamoDB Streams read | `$0.02 / 100k stream read` | ~120k/월 | `~$0.024` |
| DynamoDB storage (LATEST + HISTORY + daily-report) | `$0.25 / GB-month` | < 2GB | `~$0.50` |
| S3 `aegis-bucket-data` storage (raw + processed + reports) | `$0.025 / GB-month` | factory-a 1개월 누적 ~3GB | `~$0.08` |
| S3 dashboard-web bucket storage | `$0.025 / GB-month` | < 50MB | `~$0.00` |
| S3 PUT requests | `$0.005 / 1k` | ~120k/월 | `~$0.60` |
| S3 GET requests | `$0.0004 / 1k` | < 100k/월 | `~$0.04` |
| Route53 DNS queries | `$0.40 / 1M` (첫 1B) | < 100k/월 | `~$0.04` |
| X-Ray traces | `$5.00 / 1M traces` (100k 무료) | < 100k/월 | `~$0.00` |
| NAT Gateway data processing (ECR pull + Bedrock + Secrets) | `$0.056 / GB` | < 5GB/월 | `~$0.28` |
| **사용량 합계 (factory-a 단독)** | | | **`~$1.85 / month`** |

> 외부 도메인 등록비: Gabia `.com` 연 ~₩15,000 / `.kr` 연 ~₩20,000 (별도, AWS 청구서에 포함되지 않음).

### Phase 1 합계 (factory-a 단독, 추정)

| 운영 패턴 | 고정 | 사용량 | 합계 |
| --- | ---: | ---: | ---: |
| 상시 가동 (24/7) | ~$123.08/월 | ~$1.85/월 | **`~$124.93 / month`** |
| 데모 운영 (월 2회 × 8h) | ~$6.55/월 | ~$1.85/월 | **`~$8.40 / month`** |
| destroy 후 (Terraform backend S3 + RDS PostgreSQL snapshot + Route53 hosted zone) | snapshot/storage 기준 + hosted zone $0.50/월 | ~$0.60/월 | **Route53 hosted zone은 영구 자원 (Step 7.5 분리). snapshot 크기에 따라 추가** |

factory-b/c 추가 시 IoT 메시지 수 비례 증가. 사용량 항목 중 S3 PUT/DDB write/Bedrock token이 메시지 수에 가장 민감.

> **참고**: ADR 0017 이후 17_expansion_roadmap.md의 Phase 1 비용 추정은 RDS PostgreSQL 기준으로 낮아졌다. 본 표가 실비 산정 기준이다.

### 절감 옵션 (이미 적용된 것 + 추가 후보)

- ✅ **데모 운영 패턴 (build/destroy 사이클)**: 상시 ~$125/월 → ~$8~10/월 (90%+ 절감). 핵심 절감 수단
- ✅ **NAT GW 1개로 제한 (단일 AZ)**: 2 AZ × $45 → 1 × $45 (50% 절감, 가용성은 데모용 한정)
- ✅ **RDS PostgreSQL Single-AZ**: Multi-AZ 대비 1개 instance만 사용 (Phase 2에서 활성화 검토)
- ✅ **Redis 단일 노드 (cluster mode 비활성화)**: 비용 ~30% 절감
- **Fargate Spot 사용**: stateless ECS task이면 ~70% 절감 가능 (Phase 2에서 검토)
- **VPC Endpoint (Interface) for Bedrock/Secrets/ECR**: NAT data processing 비용 우회. 단, Interface endpoint 자체 ~$7/월/endpoint → 손익분기 확인 후 도입
- **DynamoDB HISTORY TTL 단축**: 24h → 6h로 줄이면 storage 비용 ↓ (이미 작음, 효용 작음)
- **CloudFront 최소 TTL 상향**: SPA 빌드 산출물 immutable hash naming + 1년 캐시 → CloudFront 요청 ↓
- **Bedrock 모델 다운그레이드**: Haiku → Titan Lite (~50% 절감, 단 한국어 품질 검증 필요)

## 사용량 기반 추가 비용

아래 항목은 켜져 있다는 사실만으로 큰 비용이 발생하지 않거나, 트래픽/요청량에 따라 비용이 달라진다.

| 항목 | 기준 | 현재 판단 |
| --- | --- | --- |
| NAT Gateway data processing | `$0.056 / GB` | EKS node가 인터넷/AWS public endpoint로 나가는 트래픽이 늘면 증가 |
| EC2 data transfer | 방향/리전/AZ에 따라 다름 | 현재 별도 대량 전송 없음 |
| t3 unlimited CPU credit | surplus credit 사용 시 과금 | 2026-05-06 확인 결과 `CPUSurplusCreditsCharged = 0` |
| S3 request/transfer | request 수와 data transfer 기준 | 현재 객체 2개, 366 bytes라 무시 가능 |
| IoT Core messaging/rules | 메시지와 rule action 사용량 기준 | 현재 IoT 리소스는 삭제됨. rebuild 후 테스트 메시지 수준부터 재검증 |
| AMP ingest/storage/query | ingested samples, stored metrics, query samples 기준 | 현재 AMP workspace는 삭제됨. rebuild 후 Prometheus Agent remote_write가 시작되면 사용량 기반 비용 발생 가능 |
| Grafana AMP query | AMP query samples 기준 | 현재 Hub Grafana는 삭제됨. rebuild 후 dashboard/Explore 사용량에 따라 AMP query 비용 증가 가능 |
| Grafana image/chart pull | NAT Gateway data processing 기준 | build/upgrade 시 container image와 chart pull 트래픽이 발생할 수 있음 |
| ACM public certificate | public certificate 기준 | ALB에 연결하는 public ACM certificate 자체는 과금 없음 |
| Route53 DNS queries | query 수 기준 | Hosted Zone 고정 비용 외 DNS query가 늘면 사용량 기반 비용 발생 |
| ALB LCU | new connections, active connections, processed bytes, rule evaluations 기준 | Admin UI Ingress를 켠 뒤 관리자 접속량이 늘면 증가 |
| KMS API requests | request 수 기준, 월 20,000 request free tier 이후 과금 | active EKS key 없음. AEGIS keys는 scheduled deletion 상태 |
| CloudWatch Logs ingest/storage | ingest bytes와 저장량 기준 | active EKS cluster 없음. retained log group이 있으면 별도 확인 필요 |

### Destroy 이후 비용 기준

`scripts/destroy/destroy-all.sh` 실행 후 EKS, EC2, EBS, VPC, NAT Gateway, Public IPv4, Route53 Hosted Zone, ACM certificate, S3, IoT Core, AMP가 모두 삭제되면 active AEGIS fixed-cost resource는 0개가 된다. 이 상태의 고정 시간 비용은 `0.0000 USD/hour`이다. 삭제 예약된 historical KMS key는 대기 기간 동안 monthly key storage charge가 없다.

## 태그 기반 비용 조회 기준

공통 비용 태그:

```text
Project     = AEGIS
Environment = hub-mvp 또는 foundation-mvp
ManagedBy   = terraform
Component   = hub 또는 foundation
```

Hub의 Terraform provider `default_tags`는 직접 생성 리소스에 적용된다. EKS managed node group이 간접 생성하는 EC2 instance, EBS volume, network interface는 launch template `tag_specifications`를 통해 같은 공통 태그를 전파한다.

비용 검증 시에는 아래 리소스를 우선 확인한다.

```text
EC2 instances: tag:Project=AEGIS and Name=AEGIS-EKS-node
EBS volumes: tag:Project=AEGIS
NAT Gateway/EIP: tag:Project=AEGIS
EKS cluster/nodegroup: AEGIS-EKS / AEGIS-EKS-node
AMP workspace: AEGIS-AMP-hub
S3 bucket: aegis-bucket-data
IoT resources: AEGIS-IoTThing-factory-a, AEGIS-IoTPolicy-factory-a, AEGIS_IoTRule_factory_a_raw_s3
Route53 hosted zone: minsoo-tech.cloud
ALB: aegis-admin-ui
```

EKS가 관리하는 Auto Scaling Group은 직접 비용이 붙는 리소스가 아니다. ASG 태그가 비어 있어도 실제 비용은 EC2 instance, EBS volume, NAT Gateway, Public IPv4, EKS control plane에서 발생하므로 해당 리소스 태그를 기준으로 비용을 산정한다.

## 비용 절감 기준

작업을 멈추거나 장시간 사용하지 않을 때 가장 먼저 내릴 대상은 Hub다.

```bash
cd /home/vicbear/Aegis/git_clone/Aegis-pi
scripts/destroy/destroy-hub.sh
```

이 명령으로 줄어드는 주요 비용:

- EKS control plane
- EC2 EKS worker node
- NAT Gateway
- NAT Gateway Elastic IP
- EBS root volume
- EKS encryption용 customer managed KMS key
- Route53 Hosted Zone `minsoo-tech.cloud`
- Admin UI Ingress Public ALB, target group, listener, security group, public IPv4

`infra/foundation`은 S3, IoT Rule, AMP처럼 Hub EKS 생명주기와 분리되는 영속 리소스다. 전체 비용 제거가 필요하면 `scripts/destroy/destroy-all.sh`로 IoT, Hub, foundation을 모두 내린다.

2026-05-08 `destroy-all` 후 최신 EKS key `775cd837-1961-4660-893f-f220d9f250be`를 포함한 AEGIS EKS KMS key들이 `PendingDeletion` 상태임을 확인했다. 최신 key의 삭제 예정일은 2026-06-07이다. AWS KMS 공식 가격 기준으로 삭제 예약된 customer managed key는 대기 기간 동안 monthly key storage charge가 없다.

## 갱신 규칙

다음 변경이 생기면 이 문서를 다시 계산한다.

- `infra/hub`에 AWS 리소스가 추가, 삭제, 크기 변경됨
- `infra/foundation`에 AMP, ECR, S3 lifecycle, IoT Rule, DynamoDB, KMS 같은 리소스가 추가됨
- `infra/data-dashboard/`에 ECS, RDS PostgreSQL, Redis, NAT, ALB, Lambda 같은 리소스가 추가·변경됨
- `docs/issues/` 또는 `docs/planning/`에 새 상시 운영 AWS 컴포넌트가 추가됨
- NAT Gateway 수, node/task/DB instance type, RDS allocated storage, EKS Kubernetes support tier가 바뀜
- Dashboard VPC, ALB, WAF, Cognito, CloudFront, Route53 같은 외부 접근 경로가 추가됨
- ECS task desired_count, Fargate Spot 도입 여부, RDS PostgreSQL Multi-AZ 활성화 여부가 바뀜
- Bedrock 모델 변경 (Haiku → Sonnet 등) 또는 일간 보고서 빈도가 늘어남
- API Gateway, Lambda(invocation/GB-sec), DynamoDB(read/write/storage), DynamoDB Streams, X-Ray 사용량이 baseline 추정과 크게 달라짐 (ADR 0007/0008/0009/0012~0017 영역)
- Prometheus/AMP/Grafana/CloudWatch Logs처럼 관측 계층의 수집량 또는 저장량 기준이 바뀜
- Prometheus Agent scrape job, scrape interval, annotated pod 수집 대상이 늘어남
- Grafana dashboard 수, refresh interval, Explore 사용량, datasource 수가 늘어남
- Phase 2 진입 (Timestream, Kinesis, OpenSearch, Multi-AZ) — `docs/planning/17_expansion_roadmap.md` 트리거 충족

비용 갱신 시 기록할 내용:

```text
1. 현재 실제 리소스 조회 결과
2. 단가 확인 날짜와 리전
3. 시간당 고정 비용
4. 사용량 기반 비용
5. 종료하거나 줄일 수 있는 비용원
```

## 가격 출처

2026-05-19 기준 AWS Price List API와 공식 가격 문서를 함께 확인했고, 현재 리소스 상태는 2026-05-20 세션 스냅샷의 2026-05-15 rebuild 후 Hub/Foundation/IoT/Admin UI 활성 상태로 갱신했다.

- Amazon EKS pricing: https://aws.amazon.com/eks/pricing/
- Amazon EC2 On-Demand pricing: https://aws.amazon.com/ec2/pricing/on-demand/
- NAT Gateway pricing: https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
- Public IPv4 pricing announcement: https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/
- Amazon EBS pricing: https://aws.amazon.com/ebs/pricing/
- Amazon S3 pricing: https://aws.amazon.com/s3/pricing/
- AWS KMS pricing: https://aws.amazon.com/kms/pricing/
- Elastic Load Balancing pricing: https://aws.amazon.com/elasticloadbalancing/pricing/
- Amazon Route53 pricing: https://aws.amazon.com/route53/pricing/
- AWS Certificate Manager pricing: https://aws.amazon.com/certificate-manager/pricing/
- Amazon ECS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- Amazon RDS for PostgreSQL pricing: https://aws.amazon.com/rds/postgresql/pricing/
- Amazon RDS DB instance storage: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html
- Amazon ElastiCache pricing: https://aws.amazon.com/elasticache/pricing/
- Amazon Bedrock pricing: https://aws.amazon.com/bedrock/pricing/
- AWS Lambda pricing: https://aws.amazon.com/lambda/pricing/
- Amazon DynamoDB pricing: https://aws.amazon.com/dynamodb/pricing/
