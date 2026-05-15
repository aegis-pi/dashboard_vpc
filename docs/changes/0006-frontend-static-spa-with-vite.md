# 0006. Dashboard Frontend: Vite + React 정적 SPA + S3/CloudFront

상태: accepted
결정일: 2026-05-15
관련 범위: M6 Risk Twin/Dashboard, 1번 Data/Dashboard VPC, frontend

## 기존 계획

`docs/planning/12_two_vpc_mvp_architecture_decision.md`는 Dashboard Web 형태를 두 가지로 열어 두었다.

- 서버형 Web (Next.js SSR / Spring 등) → 1번 VPC private app subnet에 컨테이너 배포
- 정적 SPA (React/Vite + S3/CloudFront) → VPC 안에 Web 컨테이너 불필요

`docs/planning/15_cloud_architecture_final.md` Private App Subnet 항목에도 "Dashboard Web"이 컨테이너로 들어가는 구조가 그대로 남아 있다.

현재 작업 환경에는 `Aegis-pi/Aegis-pi/` 위치에 React 18 CDN + 브라우저 Babel 기반 prototype frontend가 이미 진행되어 있다. 컴포넌트 구조는 SPA식(`fleet.jsx`, `factory.jsx`, `alerts.jsx`, `charts.jsx`, `sidebar.jsx`, `topbar.jsx`, `app.jsx`)으로 분리되어 있고 `React.useState`와 `ReactDOM.createRoot`를 사용한다.

## 변경된 실제 기준

Dashboard Web은 **Vite + React 정적 SPA**로 빌드해 **S3 + CloudFront + WAF**로 배포한다.

```text
사용자
  -> Route53 (dashboard.<도메인>)
  -> CloudFront (+ WAF)
  -> S3 (정적 빌드 산출물)
  -> 브라우저에서 Dashboard API 호출 (Authorization: Bearer <Cognito JWT>)
```

1번 VPC 안에 Dashboard Web용 컨테이너/EKS/ECS는 두지 않는다.

## 변경 이유

- 관제 화면이라 SEO 불필요 → SSR 이점 없음
- 현재 prototype이 이미 SPA 코드 패턴 (route state 기반 라우팅, 클라이언트 훅) → SSR로 가면 데이터 fetch/hydration 패턴을 다시 짜야 함
- 정적 SPA는 1번 VPC 안에 Web 컨테이너가 필요 없어 EKS/ECS/항상 켜진 EC2 비용 0
- CloudFront 캐시로 응답 속도/지역 분산 자연스럽게 확보
- 빌드 산출물만 S3에 올리면 끝이라 CI/CD 파이프라인 단순
- 인증 흐름이 OIDC PKCE + JWT bearer 표준 패턴으로 정렬됨 (`docs/changes/0008-cognito-admin-only-auth.md`)

## 영향

- 현재 prototype의 `index.html`/`tweaks-panel.jsx`/`src/*.jsx`를 Vite 프로젝트 구조로 마이그레이션 필요
  - `<script type="text/babel" src=...>` 나열 → `import` 기반 모듈 구조로 변경
  - `ReactDOM.createRoot` 호출은 `main.jsx`로 분리
  - 기존 디자인/컴포넌트 자산은 그대로 재사용
- `docs/planning/15_cloud_architecture_final.md` Private App Subnet에서 "Dashboard Web" 항목은 제거 또는 "정적 SPA는 S3/CloudFront에서 제공"으로 수정
- 정적 SPA용 S3 bucket은 데이터용 `aegis-bucket-data`(raw/processed)와 **분리된 신규 bucket**으로 만든다 (예: `aegis-dashboard-web`). 이유:
  - 접근 패턴이 다름 (CloudFront OAC read vs IoT Rule write + Lambda read)
  - 라이프사이클 / 버저닝 / 암호화 정책이 다름
  - bucket policy / IAM 권한 격리 단순화
  - ADR 0009의 `aegis-bucket-data` 단일 bucket 결정은 데이터(raw/processed) 영역에만 적용
- CloudFront origin access는 OAC(Origin Access Control)로 제한해 S3 bucket을 public으로 노출하지 않는다
- WAF는 CloudFront 앞단(글로벌)에 둔다. Dashboard API 보호는 별도(API Gateway) 레이어 (`docs/changes/0007-dashboard-api-runtime-lambda.md`)
- 비용 영향: CloudFront 무료 티어 1TB/월, 그 이상 $0.085/GB. 관제용 트래픽 규모에서 사실상 $0~3/월

## 업데이트 필요한 문서

- `docs/planning/15_cloud_architecture_final.md` (Private App Subnet 표기 갱신)
- `docs/planning/12_two_vpc_mvp_architecture_decision.md` (서버형/SPA 양립 표현 → SPA 확정)
- `docs/architecture/01_target_architecture.md` (Data/Dashboard VPC 흐름)
- `docs/specs/monitoring_dashboard/02_api_spec.md` (호출 주체 = SPA, JWT 헤더)
- `docs/ops/15_aws_cost_baseline.md` (CloudFront, S3 정적 호스팅 비용 항목)

## 검증

- Vite 빌드 결과 `dist/`가 정적 파일만으로 구성되는지 확인
- S3 bucket policy에 직접 Public 권한이 없고 CloudFront OAC로만 접근 가능한지 확인
- 브라우저에서 로그인 후 Dashboard API 호출 시 JWT가 Authorization 헤더에 실리는지 네트워크 탭 확인
