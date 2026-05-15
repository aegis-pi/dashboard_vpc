# 0011. 1번 Data/Dashboard VPC NAT Gateway 제거 (MVP)

상태: accepted
결정일: 2026-05-15
관련 범위: M4/M6, 1번 Data/Dashboard VPC, 비용/네트워크

## 기존 계획

`docs/planning/15_cloud_architecture_final.md`, `docs/planning/16_data_dashboard_vpc_workplan.md`, `docs/architecture/01_target_architecture.md`는 1번 VPC Public Subnet에 "NAT Gateway (필요 시 1개, single-AZ로 시작)"를 둔다고 표기했다.

`docs/ops/15_aws_cost_baseline.md` 1번 VPC 예상 비용에서 NAT Gateway 단가 (`$0.0560 / hour` × 730h ≈ `$40.88/월`) + Public IPv4 (`$3.65/월`) = 약 `$45/월`로 1번 VPC 고정 비용의 97%를 차지하는 것으로 산정되었다.

## 변경된 실제 기준

1번 Data/Dashboard VPC MVP에서 **NAT Gateway를 만들지 않는다**.

```text
1번 VPC (MVP)
  - VPC + Public/Private subnet 골격만
  - Internet Gateway 없음 (Public subnet은 IGW 없이도 subnet 경계로 존재 가능,
    또는 후속에 IGW가 필요해질 때 함께 추가)
  - NAT Gateway 없음
  - VPC Gateway Endpoint: S3, DynamoDB (무료, 후속 워크로드 대비 권장)
```

본 결정은 1번 VPC에만 적용되며, 워크스트림 A의 2번 Control/Management VPC NAT Gateway(EKS node egress용)는 그대로 유지한다.

## 변경 이유

- ADR 0007로 Lambda data processor와 Dashboard API Lambda가 모두 **VPC 밖에서 동작**한다 → 1번 VPC 안에서 인터넷/외부 AWS endpoint로 나갈 워크로드가 없음
- ADR 0006으로 Dashboard Web은 **S3 + CloudFront 글로벌**로 제공 → 1번 VPC 외부망 의존 없음
- DynamoDB와 S3는 VPC Gateway Endpoint(무료)로 접근 가능 → MVP에서는 Endpoint도 사실상 불필요(Lambda가 VPC 밖에 있으므로) 하지만 후속 컨테이너 워크로드 대비 미리 둘 수 있음
- NAT Gateway 1개 = `~$45/월` 고정 비용 → 1번 VPC MVP 합계가 `~$46.34/월` → `~$1.34/월`로 감소 (97% 절감)
- 후속에 1번 VPC 안에 컨테이너 워크로드가 추가되면 그때 NAT GW 또는 Interface Endpoint를 ADR로 다시 결정한다

## 영향

### Terraform IaC

- `infra/data-dashboard/`에서 다음 리소스를 만들지 않는다:
  - `aws_nat_gateway`
  - NAT용 `aws_eip`
  - NAT 경로용 `aws_route` (`0.0.0.0/0` → `nat_gateway_id`)
- 다음은 그대로 둔다 (후속 워크로드 대비):
  - VPC + Public/Private subnet
  - `aws_vpc_endpoint` (S3, DynamoDB) — Gateway type, 무료
- Internet Gateway는 MVP에서 만들지 않는다. Public subnet은 IGW 없이도 subnet 정의로 존재. 후속에 ALB/EC2 같은 외부 진입이 1번 VPC 안에 필요해지면 IGW + NAT를 함께 추가

### 운영성

- 1번 VPC 안에서 외부 AWS API를 호출해야 하는 디버깅 워크로드(예: bastion EC2)가 임시로 필요할 경우, **세션 단위로** NAT GW를 만들고 끄는 절차 권장 (또는 SSM Session Manager로 우회)
- VPC Endpoint는 Gateway endpoint(S3/DDB) 무료. Interface endpoint(Lambda/Secrets/STS 등)는 시간당 비용 있음 — MVP는 둘 다 안 만들어도 됨

### 비용

- 1번 VPC 고정 시간 비용: `~$45/월` → `~$0.50/월` (Route53 hosted zone만 남음)
- 1번 VPC MVP 합계: `~$46.34/월` → `~$1.84/월`

### 명시적 비채택

- VPC Endpoint(Interface)로 NAT GW를 대체하는 안 → MVP에서는 해당 endpoint 자체도 비용이 들고, Lambda가 VPC 밖에 있어 필요 없음. 후속 컨테이너 워크로드 등장 시 재검토
- 워크스트림 A의 2번 VPC NAT GW 제거 → EKS node egress(이미지 pull, AWS API)에 필요하므로 본 ADR 범위 외

## 업데이트 필요한 문서

- `docs/planning/15_cloud_architecture_final.md` (1번 VPC Public Subnet/리소스 요약 갱신)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (Phase 2 자원 목록에서 NAT GW 제거)
- `docs/architecture/01_target_architecture.md` (1번 VPC 자체 섹션 갱신)
- `docs/ops/15_aws_cost_baseline.md` (NAT GW 항목 제거, 합계 재계산)
- `docs/changes/README.md` (인덱스에 0011 추가)

## 검증

- `terraform plan` 결과에 `aws_nat_gateway` 또는 NAT용 `aws_eip` 생성이 없는지 확인
- 1번 VPC route table에 `0.0.0.0/0` 경로가 없는지 확인 (또는 IGW 없으면 자연스럽게 없음)
- AWS Cost Explorer에서 `Project=AEGIS` 태그 기준 NAT Gateway 비용이 0인지 확인 (apply 후)
- 워크스트림 A의 2번 VPC NAT GW는 영향받지 않는지 확인
