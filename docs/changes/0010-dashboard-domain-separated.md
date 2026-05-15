# 0010. Dashboard 도메인: Gabia 신규 구매 + Route53 위임 + Admin UI 도메인과 분리

상태: accepted
결정일: 2026-05-15
관련 범위: M6 Risk Twin/Dashboard, 1번 Data/Dashboard VPC, 도메인/DNS/인증서

## 기존 계획

`docs/planning/16_data_dashboard_vpc_workplan.md`는 "기존 `minsoo-tech.cloud`와 분리할지 신규 도메인을 둘지 결정"을 placeholder로 두었고, "Admin UI(`argocd.minsoo-tech.cloud`, `grafana.minsoo-tech.cloud`)와 도메인/ACM을 공유하지 않는 것을 기본으로 둔다"는 권장만 적혀 있다.

워크스트림 A의 `argocd.minsoo-tech.cloud`, `grafana.minsoo-tech.cloud`는 이미 `infra/hub/admin_ui_dns.tf`에서 관리된다.

## 변경된 실제 기준

Dashboard 공용 도메인은 **Gabia에서 신규 도메인 1개를 구매**해 사용한다. 워크스트림 A의 `minsoo-tech.cloud`(Admin UI)와 도메인/Route53 hosted zone/ACM 인증서를 모두 분리한다.

```text
워크스트림 A (운영자/관리자용)
  도메인:        minsoo-tech.cloud
  Hosted Zone:   기존 (infra/hub)
  ACM:           ap-south-1
  서브도메인:
    argocd.minsoo-tech.cloud
    grafana.minsoo-tech.cloud

워크스트림 B (제품 화면, 본 ADR 결정)
  도메인:        Gabia 신규 (예: aegis-pi.com 또는 .kr 계열)
  Hosted Zone:   신규 (infra/data-dashboard) — Route53
  ACM:
    us-east-1    CloudFront용 (필수, 글로벌)
    ap-south-1   API Gateway용
  서브도메인:
    dashboard.<도메인>     CloudFront → S3 SPA
    api.<도메인>           API Gateway custom domain
    auth.<도메인>          Cognito Hosted UI custom domain (선택)
```

도메인 등록 방식: **Gabia에서 구매 후 Name Server를 Route53 hosted zone NS 4개로 변경**.

## 변경 이유

### 도메인 분리

- 워크스트림 A 자산(`infra/hub`)을 본 환경에서 변경하지 않는다는 ADR 0005 원칙 유지 → 같은 도메인을 공유하면 hosted zone record 추가 시 워크스트림 A의 IaC를 건드릴 위험
- Admin UI와 사용자용 Dashboard는 청중·접근 권한·운영 절차가 다름 → 도메인 분리가 자연스러움
- ACM 인증서 발급/갱신 책임 경계도 함께 분리됨
- 후속에 Dashboard 도메인을 별도 마케팅/공개 자산으로 사용해도 충돌 없음

### Gabia 구매 선택

- 한국 내 결제·관리가 편함
- `.com` ~₩15,000/년, `.kr` ~₩20,000/년 수준으로 저렴
- AWS Route53에서 직접 도메인을 사거나(약 $13/년) Gabia를 쓰는 것 둘 다 가능. 본 ADR은 Gabia를 채택하지만 비용/관리 차이는 미미
- 시연 시 `dashboard.aegis-pi.com`처럼 정식 도메인이 `xxx.cloudfront.net`보다 인상이 좋음

### Route53 위임 (Gabia DNS 직접 사용 안 함)

- Route53을 권한 있는 DNS로 두면 ACM DNS 검증/Alias 레코드 자동화 가능
- Terraform `aws_route53_record`로 IaC 관리
- Gabia DNS도 가능하지만 CloudFront/ALB Alias를 못 만들고 CNAME으로 우회해야 함 → AWS 통합성 약화

## 영향

### Terraform IaC

- `infra/data-dashboard/`에 신규 root 추가
  - `aws_route53_zone` (신규 hosted zone, 워크스트림 A 것과 분리)
  - `aws_acm_certificate` 두 개 (us-east-1: CloudFront, ap-south-1: API GW)
  - `aws_route53_record` (CloudFront/API GW Alias)
- 워크스트린 A의 `infra/hub/admin_ui_dns.tf`는 변경하지 않는다

### 운영 절차

- 도메인 구매 후 Gabia 관리 콘솔에서 Name Server를 Route53 NS 4개로 변경 (UI 절차)
- DNS 전파 1~24시간 소요 → Terraform 시작 전 미리 진행
- WHOIS privacy 옵션을 켜 개인정보 노출 방지

### 비용

- 도메인 등록: Gabia 연 ₩15,000~20,000 (Year 1 할인 가격은 별도)
- Route53 hosted zone: $0.50/월 = $6/년
- ACM public certificate: 무료 (DNS 검증)
- DNS query: 사용량 기반, 관제 트래픽 규모에서 무시 가능

### 보안

- HTTPS 강제 (CloudFront default behavior + API Gateway TLS only)
- Route53 hosted zone에 DNSSEC 적용은 후속 검토 (ACM/CloudFront 호환 확인 필요)

## 업데이트 필요한 문서

- `docs/planning/16_data_dashboard_vpc_workplan.md` (도메인 결정 확정)
- `docs/planning/15_cloud_architecture_final.md` (1번 VPC 도메인 표기)
- `docs/architecture/01_target_architecture.md` (도메인 흐름)
- `docs/ops/15_aws_cost_baseline.md` (Route53 hosted zone, 도메인 등록비, ACM 항목 추가)
- 후속: `docs/ops/2N_dashboard_domain_runbook.md` 신규 작성 (도메인 구매/위임/ACM 발급 UI 절차)

## 검증

- `dig NS <도메인>`이 Route53 NS 4개를 반환
- `dashboard.<도메인>` 접속 시 CloudFront 응답 + 유효 ACM 인증서
- `api.<도메인>` 접속 시 API Gateway custom domain 응답 + 유효 ACM 인증서
- Cognito Hosted UI(`auth.<도메인>` 또는 기본 도메인)에서 OIDC redirect URI가 `dashboard.<도메인>`으로 정상 동작
- 워크스트림 A의 `argocd.minsoo-tech.cloud` / `grafana.minsoo-tech.cloud`가 본 변경 후에도 영향 없이 동작
