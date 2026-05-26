# ADR 0023 — GitHub Actions OIDC Web Deploy Role (Step 9 S3+CloudFront CI/CD)

상태: accepted
기준일: 2026-05-26
관련: ADR 0006 (Frontend SPA), Phase 1 Step 8 (apps/dashboard-web/), Step 9 (S3+CloudFront CI/CD)

## 결정

GitHub Actions에서 S3 dashboard-web bucket sync와 CloudFront invalidation을 위한 **별도 OIDC role**을 신설한다.
기존 ECR push role(`KJW-AEGIS-Data-IAMRole-OIDC-ECRPush`)에 권한을 추가하는 방식(옵션 A) 대신,
새 role `KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy`를 분리한다(옵션 B).

## 배경

- Step 7에서 생성한 `KJW-AEGIS-Data-IAMRole-OIDC-ECRPush` role은 ECR push에만 사용한다.
  GitHub Secret `AWS_OIDC_DASHBOARD_ROLE_ARN`으로 등록 완료.
- Step 9에서 `apps/dashboard-web/dist/`를 S3 bucket에 sync하고
  CloudFront distribution invalidation을 수행하는 CI/CD workflow가 필요하다.
- 추가 권한을 어느 role에 붙일지 두 가지 옵션을 검토했다.

## 검토한 옵션

### 옵션 A — 기존 ECR push role에 S3 + CloudFront 권한 추가

장점:
- IAM role 수가 증가하지 않는다.
- 기존 GitHub Secret `AWS_OIDC_DASHBOARD_ROLE_ARN` 그대로 재사용한다.

단점:
- ECR push workflow(`.github/workflows/dashboard-backend.yml`)가 S3 sync / CloudFront invalidation
  권한을 갖게 된다. 목적이 다른 권한이 혼재해 침해 범위가 넓어진다.
- web deploy workflow가 ECR push 권한을 불필요하게 갖는다.
- 최소권한 원칙(Principle of Least Privilege) 위반.

### 옵션 B — 별도 web deploy role 신설 (채택)

장점:
- ECR push role은 ECR push만, web deploy role은 S3 sync + CloudFront invalidation만 허용.
  침해 범위가 workflow 단위로 분리된다.
- 각 role의 권한이 명확해 감사(audit)가 쉽다.
- 최소권한 원칙 준수.

단점:
- 새 GitHub Secret `AWS_OIDC_DASHBOARD_WEB_ROLE_ARN` 등록이 필요하다.
- Terraform resource 수가 3개 증가한다(role/policy document/role policy).

## 구현

- 추가 파일: `infra/data-dashboard/ecr.tf` 하단에 append
- 신규 리소스:
  - `aws_iam_role.github_oidc_web_deploy` → `KJW-AEGIS-Data-IAMRole-OIDC-WebDeploy`
  - `aws_iam_policy_document.github_oidc_web_deploy_inline`
  - `aws_iam_role_policy.github_oidc_web_deploy`
- 권한 (최소권한):
  - `s3:ListBucket` on `aws_s3_bucket.web` (bucket ARN)
  - `s3:PutObject`, `s3:DeleteObject`, `s3:GetObject` on `aws_s3_bucket.web/*`
  - `cloudfront:CreateInvalidation` on `aws_cloudfront_distribution.web` (distribution ARN)
- Trust policy: 기존 `data.aws_iam_policy_document.github_oidc_ecr_push_assume` 재사용
  (동일한 GitHub OIDC provider + `repo:aegis-pi/dashboard_vpc:*` 조건)
- Output: `github_oidc_web_deploy_role_arn` (outputs.tf에 추가)
- GitHub Secret 이름: `AWS_OIDC_DASHBOARD_WEB_ROLE_ARN`
- Workflow: `.github/workflows/dashboard-web.yml` (Step 9 CI/CD)

## GitHub Actions workflow 구조

```
jobs:
  test:        checkout → setup-node → npm ci → npm run lint → npm run test
  build-and-deploy (needs: test):
               checkout → setup-node → npm ci → npm run build (VITE_* env)
               → configure-aws-credentials (OIDC) → aws s3 sync → cloudfront invalidation
```

- OIDC 권한(`id-token: write`)은 `build-and-deploy` job에만 부여 (최소권한)
- `test` job은 항상 실행. `build-and-deploy`는 `test` 통과 후 실행
- VITE_* 환경변수: GitHub Actions Variables(`vars.*`)로 주입 (build-time 번들에 포함되므로 secret 불필요)

## 비용 영향

- IAM role/policy: 무료
- S3 PutObject/DeleteObject/GetObject: usage-based 소량 (PUT $0.005/1000 requests, GET $0.0004/1000)
- CloudFront invalidation: 월 1,000 paths 무료, 초과 시 $0.005/path
- 신규 상시 리소스 없음 → 고정 비용 변화 없음

## 기존 role 영향 없음

- `AWS_OIDC_DASHBOARD_ROLE_ARN` GitHub Secret: ECR push role ARN 그대로 유지
- `.github/workflows/dashboard-backend.yml`: 변경 없음
