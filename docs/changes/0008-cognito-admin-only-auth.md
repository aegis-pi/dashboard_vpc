# 0008. Dashboard 인증: Cognito User Pool (관리자 전용) + API Gateway Cognito Authorizer

상태: accepted
결정일: 2026-05-15
관련 범위: M6 Risk Twin/Dashboard, 1번 Data/Dashboard VPC, 인증/인가

## 기존 계획

`docs/planning/07_dashboard_vpc_extension_plan.md`는 인증을 "Cognito or IdP auth"로 두 가지 방향을 열어 두었다.

`docs/planning/16_data_dashboard_vpc_workplan.md`는 "MVP 단계에서는 Cognito 또는 외부 IdP 후속으로 두고, 사내 임시 인증(예: ALB 인증 헤더)로 시작 가능"으로 명시되어 있다.

`docs/changes/0006-frontend-static-spa-with-vite.md`로 정적 SPA가 확정되면서, ALB 기반 built-in 인증(`authenticate-cognito` action)은 인증 경로에서 빠진다.

## 변경된 실제 기준

### 인증 = Cognito User Pool, 가입은 관리자만

대시보드는 본사 관리자(현재 1인) 전용 폐쇄형 시스템이다.

```text
Cognito User Pool 설정:
  Self-service sign-up:  Disabled
  User creation:         Admin only (Console / CLI / Terraform)
  MFA:                   Required (TOTP)
```

- 외부인이 URL을 알아도 로그인 페이지에 진입만 가능. 가입 버튼 자체가 없다.
- 사용자 추가는 본인이 `aws cognito-idp admin-create-user` 또는 Terraform `aws_cognito_user`로만 수행한다.
- 시연 시 멘토용 임시 사용자 추가 → 시연 후 disable.

### 인가 = API Gateway Cognito Authorizer

```text
SPA
  -> Cognito Hosted UI 로그인 (OIDC PKCE)
  -> JWT (Access Token) 획득
  -> Authorization: Bearer <JWT>로 API Gateway 호출
  -> API Gateway Cognito Authorizer가 JWT 서명/만료/audience 검증
  -> 통과 시 Lambda 실행
```

- API Gateway가 JWT 검증을 자동 수행 → Lambda 코드에 인증 로직 0줄
- Lambda는 검증된 claim(`sub`, `email`, `cognito:groups`)을 event context로 받음

### Hosted UI 사용

자체 로그인 페이지를 만들지 않고 Cognito Hosted UI를 그대로 사용한다.

- 코드 0줄로 로그인/비밀번호 재설정/MFA 등록 화면 제공
- Cognito 도메인은 별 호스트(예: `auth.<도메인>`) 또는 기본 `*.auth.<region>.amazoncognito.com` 사용

## 변경 이유

- 관제 시스템이라 사용자가 1~5명 규모. Self sign-up이 필요하지 않음
- AWS 생태계 통합 기준 Cognito가 가장 자연스러움 (외부 IdP 도입 부담 큼)
- API Gateway Cognito Authorizer = SPA + JWT bearer 패턴의 업계 표준
- ALB built-in 인증은 ALB가 인증 경로에 있을 때만 의미 있음 → 정적 SPA + CloudFront 구성에서는 부자연스러움
- Hosted UI는 OAuth2/OIDC PKCE flow를 자동 처리 → 보안 구현 실수 회피
- MFA TOTP를 도입해 "관리자 콘솔이라 MFA를 강제했다"는 보안 마인드 시연
- 비용: Cognito 무료 티어 50,000 MAU, 본 시스템은 사실상 0원

## 영향

### Cognito 구성

- User Pool 1개 (`aegis-pi-admin`) — 관리자 전용
- App Client 1개 — SPA용 (Authorization Code Grant + PKCE, client secret 없음)
- Hosted UI 도메인 활성화
- 초기 사용자: 본인 1명. CLI로 직접 등록
- MFA: Required, TOTP (Authenticator app)

### SPA 구현

- `oidc-client-ts` 또는 `aws-amplify/auth` 라이브러리로 OIDC 흐름 처리
- 로그인 후 받은 JWT를 메모리 또는 SessionStorage에 보관 (XSS 위험 최소화)
- 모든 API 호출 시 `Authorization: Bearer <JWT>` 헤더 자동 첨부

### 후속 확장 여지

- 사용자 수가 늘면 Cognito Groups로 역할 분리 (`Admin`, `Operator`, `Viewer`)
- 회사 IdP가 생기면 Cognito Federation으로 SAML/OIDC 연동
- Pre-Sign-up Lambda Trigger로 이메일 도메인 제한 가능

### 명시적 비채택

- Self sign-up 활성화 → 채택 안 함 (관제 시스템 정체성과 충돌)
- WAF IP 화이트리스트로 인증 대체 → 시연 시 IP 추가 운영 부담 큼, 보안 신호도 약함
- Auth0/Firebase 외부 IdP → AWS 일관성 깨짐, 비용 추가
- API Gateway Lambda Authorizer로 자체 토큰 검증 → 불필요한 코드, Cognito Authorizer로 충분

## 업데이트 필요한 문서

- `docs/planning/15_cloud_architecture_final.md` (인증 흐름 표기)
- `docs/planning/16_data_dashboard_vpc_workplan.md` (인증 결정 확정 반영)
- `docs/planning/07_dashboard_vpc_extension_plan.md` (Cognito or IdP 양립 표현 → Cognito 확정)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (Authorization 헤더와 JWT claim)
- `docs/ops/15_aws_cost_baseline.md` (Cognito 비용 항목 — 무료 티어 명시)

## 검증

- Cognito User Pool 설정 확인: `AdminCreateUserConfig.AllowAdminCreateUserOnly = true`
- Hosted UI 접속 시 "Sign up" 링크가 표시되지 않는지 확인
- 미인증 상태로 API Gateway 호출 시 401 반환 확인
- 유효 JWT로 호출 시 200 + Lambda event에 claim이 전달되는지 확인
- 본인 계정에 MFA가 설정되고 로그인 시 TOTP 입력이 강제되는지 확인
