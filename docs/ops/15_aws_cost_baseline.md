# AWS Cost Baseline

상태: source of truth
기준일: 2026-05-15
리전: `ap-south-1` / Asia Pacific (Mumbai), 글로벌(CloudFront/ACM us-east-1) 일부
수정 이력:
  - 2026-05-15 v0.3  ADR 0011 반영. 1번 VPC NAT GW 제거 후 고정 비용 ~$0.50/월로 갱신, S3 dashboard-web bucket 항목 추가.
  - 2026-05-15 v0.2  ADR 0006~0010 반영. 1번 Data/Dashboard VPC 예상 비용 섹션 추가 (실제 apply 전 추정).
  - 2026-05-08  Hub destroy 후 baseline

## 목적

이 문서는 Aegis-Pi AWS Hub를 켜 두었을 때와 `destroy-all` 이후의 시간당 비용 기준을 기록한다.

새 AWS 리소스, 관리형 서비스, 상시 실행 컴포넌트, 저장소, 네트워크 경로가 추가되면 이 문서를 함께 갱신한다. 특히 `infra/hub`, `infra/foundation`, Dashboard VPC, AMP, ECR, Load Balancer, NAT Gateway, Public IPv4, EBS, S3 lifecycle, CloudWatch Logs, IoT Core 사용량 기준이 바뀌면 비용 영향을 다시 계산한다.

## 현재 Aegis 리소스 상태

2026-05-08 `scripts/destroy/destroy-all.sh` 실행 후 확인 결과다. Hub active 비용 산정은 아래 "Hub active 시 비용" 섹션에 별도로 유지한다.

| 영역 | 리소스 | 수량/크기 | 상태 |
| --- | --- | ---: | --- |
| EKS | `AEGIS-EKS` control plane | 0 | deleted |
| EC2 | `AEGIS-EKS-node` | 0 | previous instances terminated |
| EBS | EKS node root volume | 0 | deleted/not found |
| VPC/Subnet | `AEGIS-VPC` and subnets | 0 | deleted |
| NAT Gateway | `AEGIS-NAT-public-Azone`, `AEGIS-NAT-public-Czone` | 0 | deleted |
| Public IPv4 | NAT Gateway Elastic IP / ALB public IPv4 | 0 | released with deleted resources |
| S3 | `aegis-bucket-data` | 0 | bucket deleted |
| IoT Core | `AEGIS_IoTRule_factory_a_raw_s3` | 0 | deleted with foundation |
| IoT Core | `AEGIS-IoTThing-factory-a` / `AEGIS-IoTPolicy-factory-a` / certificate | 0 | deleted |
| AMP | `AEGIS-AMP-hub` | 0 | workspace deleted |
| EKS workload | `observability/grafana` | 0 | deleted with EKS |
| EKS workload | `kube-system/aws-load-balancer-controller` | 0 | deleted with EKS |
| Route53 | public hosted zone `minsoo-tech.cloud` | 0 | deleted |
| ACM | public certificate for `minsoo-tech.cloud`, `argocd.minsoo-tech.cloud`, `grafana.minsoo-tech.cloud` | 0 | deleted |
| ALB | `aegis-admin-ui` | 0 | deleted |
| KMS | AEGIS EKS customer managed keys | 0 active | current and historical keys are `PendingDeletion` |
| CloudWatch Logs | `/aws/eks/AEGIS-EKS/cluster` | 0 active EKS cluster | log group cost should be rechecked if retained outside Terraform |

현재 확인된 비활성 또는 미생성 항목:

- NLB 없음
- ECR repository 없음
- Dashboard VPC 없음
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

## 1번 Data/Dashboard VPC 예상 비용 (ADR 0006~0011, apply 전 추정)

ADR 0006~0011로 확정된 1번 VPC MVP 토폴로지의 예상 시간/월 비용이다. 실제 apply 후 측정값으로 재갱신한다.

ADR 0011로 NAT Gateway를 만들지 않는다 → 1번 VPC 고정 비용은 Route53 hosted zone만 남는다.

### 고정 시간 비용 (apply 후 켜져 있을 때)

| 비용 항목 | 수량 | 단가 | 시간당 | 월 환산 (730h) |
| --- | ---: | ---: | ---: | ---: |
| Route53 public hosted zone (신규 도메인) | 1 | `$0.50 / month` | `$0.0007` | `$0.50` |
| API Gateway custom domain | 1 | 고정 비용 없음 | `$0.0000` | `$0.00` |
| ACM public certificate | 2 | 무료 (DNS 검증) | `$0.0000` | `$0.00` |
| Cognito User Pool (관리자 1~5명) | 1 | 50,000 MAU 무료 티어 | `$0.0000` | `$0.00` |
| **고정 합계** | | | `~$0.0007 / hour` | **`~$0.50 / month`** |

> 1번 VPC는 NAT GW 없이 시작 (ADR 0011). Lambda가 VPC 밖이라 외부 egress가 필요한 내부 워크로드가 없음.
> 후속에 1번 VPC 안에 컨테이너 워크로드가 추가되면 NAT GW 또는 Interface Endpoint 도입을 ADR로 다시 결정.

### 사용량 기반 비용 (관제 트래픽 규모 가정)

| 비용 항목 | 단가 | 가정 | 예상 월 |
| --- | ---: | --- | ---: |
| CloudFront data out | `$0.085 / GB` (1TB 무료 후) | < 5GB/월 (관제 SPA) | `~$0.00` (무료 티어 내) |
| CloudFront requests | `$0.0075 / 10k HTTPS` | < 100k/월 | `~$0.08` |
| API Gateway HTTP API requests | `$1.00 / 1M requests` (첫 300M) | ~50k/월 (10초 polling × 5명 × 8h) | `~$0.05` |
| Lambda invocations | `$0.20 / 1M` (1M 무료) | < 200k/월 | `~$0.00` (무료 티어 내) |
| Lambda compute (GB-sec) | `$0.0000166667 / GB-sec` (400k GB-sec 무료) | < 100k GB-sec | `~$0.00` |
| DynamoDB on-demand write | `$1.25 / 1M WCU` | factory-a 3초/20초 주기 = ~120k write/월 | `~$0.15` |
| DynamoDB on-demand read | `$0.25 / 1M RCU` | dashboard polling 기반 ~200k read/월 | `~$0.05` |
| DynamoDB storage | `$0.25 / GB-month` | < 1GB (TTL 24h) | `~$0.25` |
| S3 `aegis-bucket-data` storage (raw + processed) | `$0.025 / GB-month` (Standard) | factory-a 1개월 누적 ~3GB | `~$0.08` |
| S3 dashboard-web bucket storage (정적 SPA) | `$0.025 / GB-month` (Standard) | < 50MB | `~$0.00` |
| S3 PUT requests | `$0.005 / 1k` | ~120k/월 | `~$0.60` |
| S3 GET requests | `$0.0004 / 1k` | < 100k/월 | `~$0.04` |
| Route53 DNS queries | `$0.40 / 1M` (첫 1B) | < 100k/월 | `~$0.04` |
| X-Ray traces | `$5.00 / 1M traces` (100k 무료) | < 100k/월 | `~$0.00` |
| **사용량 합계 (factory-a 단독, MVP 가정)** | | | **`~$1.34 / month`** |

> 외부 도메인 등록비: Gabia `.com` 연 ~₩15,000 / `.kr` 연 ~₩20,000 (별도, AWS 청구서에 포함되지 않음).

### 1번 VPC MVP 합계 (factory-a 단독, 추정)

```text
고정 ~$0.50/월 + 사용량 ~$1.34/월 = ~$1.84/월
```

factory-b/c 추가 시 IoT 메시지 수 비례 증가. 사용량 항목 중 S3 PUT/DDB write가 메시지 수에 가장 민감 (factory 1개당 +`~$0.75/월` 추정).

### 절감 옵션 (이미 적용된 것 + 추가 후보)

- ✅ **NAT GW 제거** (ADR 0011 적용). `~$45/월` 절감. 후속에 VPC 내 컨테이너가 필요해지면 재검토.
- ✅ **항상 켜진 컨테이너 사용 안 함** (ADR 0006/0007). ECS/EKS/EC2 비용 0.
- **DynamoDB HISTORY TTL 단축**: 24h → 6h로 줄이면 storage 비용 ↓ (이미 매우 작음, 효용 작음)
- **CloudFront 최소 TTL 상향**: SPA 빌드 산출물 immutable hash naming + 1년 캐시 → CloudFront 요청 ↓
- **API Gateway → Lambda Function URL**: 인증/throttling 직접 구현 부담 있음. MVP에선 권장 안 함

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
- `docs/issues/` 또는 `docs/planning/`에 새 상시 운영 AWS 컴포넌트가 추가됨
- NAT Gateway 수, node instance type, node desired size, EBS 크기, EKS Kubernetes support tier가 바뀜
- Dashboard VPC, ALB, WAF, Cognito, CloudFront, Route53 같은 외부 접근 경로가 추가됨
- API Gateway, Lambda(invocation/GB-sec), DynamoDB(read/write/storage), X-Ray 사용량이 baseline 추정과 크게 달라짐 (ADR 0007/0008/0009 영역)
- Prometheus/AMP/Grafana/CloudWatch Logs처럼 관측 계층의 수집량 또는 저장량 기준이 바뀜
- Prometheus Agent scrape job, scrape interval, annotated pod 수집 대상이 늘어남
- Grafana dashboard 수, refresh interval, Explore 사용량, datasource 수가 늘어남

비용 갱신 시 기록할 내용:

```text
1. 현재 실제 리소스 조회 결과
2. 단가 확인 날짜와 리전
3. 시간당 고정 비용
4. 사용량 기반 비용
5. 종료하거나 줄일 수 있는 비용원
```

## 가격 출처

2026-05-06 기준 AWS Pricing API와 공식 가격 문서를 함께 확인했고, 현재 리소스 상태는 2026-05-08 destroy 검증 결과로 갱신했다.

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
