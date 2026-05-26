# Data/Dashboard VPC Runbook

상태: source of truth
기준일: 2026-05-26
수정 이력:
  - 2026-05-26 v0.2  Step 7.5 Route53 Hosted Zone 영구 분리 반영. `infra/data-dashboard-dns/`와 state 이전 절차 추가.

## 목적

이 문서는 워크스트림 B 대상인 1번 Data/Dashboard VPC만 apply/destroy 하는 운영 절차를 고정한다.

대상 Terraform root:

```text
infra/data-dashboard/      # 재생성 자원
infra/data-dashboard-dns/  # Route53 Hosted Zone 영구 자원
```

손대지 않는 영역:

```text
infra/hub/
infra/foundation/
infra/mesh-vpn/
scripts/build/build-hub.sh
scripts/destroy/destroy-hub.sh
scripts/destroy/destroy-all.sh
```

## Destroy 후 잔여 기준

`scripts/destroy/destroy-data-dashboard.sh` 이후 남는 리소스:

- `kjw-aegis-terraform-state` S3 bucket: Terraform backend. 유지.
- Route53 hosted zone `aegis-pi.cloud`: Step 7.5 이후 `infra/data-dashboard-dns/`가 영구 관리. 유지.
- RDS final snapshot `kjw-aegis-data-pg-final-*`: 복구용 snapshot. 필요 시 수동 정리.
- Secrets Manager secret은 `recovery_window_in_days = 0` 기준으로 즉시 삭제.

삭제 대상:

- Data/Dashboard VPC, subnet, route table, NAT Gateway, ALB, security group
- CloudFront, S3 dashboard web bucket, ACM certificate
- Route53 records: ACM validation record, `api`, `dashboard` alias record
- Cognito User Pool
- RDS PostgreSQL instance, ElastiCache Redis
- Lambda data processor, Lambda notifier, SQS DLQ
- 신규 IoT Rule `KJW_AEGIS_Data_*`
- DynamoDB `aegis-daily-report`

삭제하지 않는 공유 리소스:

- DynamoDB `AEGIS-DynamoDB-FactoryStatus`
- S3 `aegis-bucket-data`
- 기존 IoT Rule `AEGIS_IoTRule_factory_a_raw_s3`
- Hub/Foundation/EKS/Admin UI 리소스

## Route53 Hosted Zone 영구 분리

목적:

```text
infra/data-dashboard destroy/apply 반복 시 Gabia NS 위임이 바뀌지 않게 한다.
```

구조:

```text
infra/data-dashboard-dns/
  - aws_route53_zone.dashboard
  - lifecycle prevent_destroy = true
  - backend key: data-dashboard-dns/terraform.tfstate

infra/data-dashboard/
  - data.aws_route53_zone.dashboard 로 기존 zone 조회
  - ACM validation record와 api/dashboard record만 관리
```

state 이전 절차:

```bash
terraform -chdir=infra/data-dashboard-dns init

ZONE_ID=$(terraform -chdir=infra/data-dashboard output -raw route53_zone_id)
terraform -chdir=infra/data-dashboard-dns import aws_route53_zone.dashboard "$ZONE_ID"

terraform -chdir=infra/data-dashboard state rm aws_route53_zone.dashboard

terraform -chdir=infra/data-dashboard plan -var="dashboard_domain_name=aegis-pi.cloud"
terraform -chdir=infra/data-dashboard-dns plan
```

주의:

```text
terraform state rm은 AWS 리소스를 삭제하지 않는다.
Terraform state에서만 추적을 해제한다.

이 절차 중 destroy 명령은 실행하지 않는다.
```

## Apply

기본 도메인 `aegis-pi.cloud`:

```bash
scripts/build/build-data-dashboard.sh
```

도메인을 명시하는 경우:

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud
```

MFA 세션 토큰이 없으면 OTP를 전달한다.

```bash
scripts/build/build-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

스크립트 수행 내용:

```text
terraform init
terraform fmt -check
terraform validate
terraform plan -var dashboard_domain_name=... -out=tfplan
terraform apply tfplan
tfplan 삭제
```

삭제 예약 중인 기존 Data/Dashboard secret이 있으면 apply 전에 강제 삭제해 이름 충돌을 막는다.

## Destroy

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud
```

MFA 세션 토큰이 없으면 OTP를 전달한다.

```bash
scripts/destroy/destroy-data-dashboard.sh --domain aegis-pi.cloud --otp <MFA_OTP>
```

스크립트 수행 내용:

```text
terraform init
terraform validate
terraform plan -destroy -var dashboard_domain_name=... -out=tfplan.destroy
terraform apply tfplan.destroy
tfplan.destroy 삭제
```

RDS는 final snapshot을 생성한다. snapshot 이름은 Terraform `random_id`를 포함해 매 apply/destroy 사이클마다 충돌하지 않는다.

## 수동 확인

Terraform state:

```bash
terraform -chdir=infra/data-dashboard state list
```

VPC 잔여 확인:

```bash
aws ec2 describe-vpcs \
  --region ap-south-1 \
  --filters Name=tag:Component,Values=data-dashboard \
  --query 'Vpcs[].{VpcId:VpcId,State:State,Name:Tags[?Key==`Name`]|[0].Value}' \
  --output table
```

RDS snapshot 확인:

```bash
aws rds describe-db-snapshots \
  --region ap-south-1 \
  --query 'DBSnapshots[?starts_with(DBSnapshotIdentifier, `kjw-aegis-data-pg-final`)].{Id:DBSnapshotIdentifier,Status:Status,Created:SnapshotCreateTime}' \
  --output table
```

Secrets 삭제 예약 확인:

```bash
aws secretsmanager list-secrets \
  --region ap-south-1 \
  --include-planned-deletion \
  --query 'SecretList[?starts_with(Name, `kjw-aegis-data`)].{Name:Name,DeletedDate:DeletedDate}' \
  --output table
```

## Snapshot 정리

오래된 RDS snapshot이 필요 없으면 수동 삭제한다.

```bash
aws rds delete-db-snapshot \
  --region ap-south-1 \
  --db-snapshot-identifier <snapshot-id>
```

삭제 전에는 복구 필요 여부를 확인한다. snapshot 삭제 후에는 해당 시점의 RDS 데이터를 복구할 수 없다.
