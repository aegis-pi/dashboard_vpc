# 로컬 프론트엔드 개발 환경 런북

상태: source of truth
기준일: 2026-06-09
적용 범위: 워크스트림 B (1번 Data/Dashboard VPC) — `apps/dashboard-web` + `apps/dashboard-backend` 로컬 구동
수정 이력:
  - 2026-06-09 v1.0  로컬 개발 환경 최초 정리. Cognito 콜백 URL 추가, frontend `.env.local`, backend `.env`, `aiosqlite` 설치, RBAC sub 부트스트랩, 실행/트러블슈팅 절차 반영.

---

## 0. 개요

로컬 `http://localhost:5173`(프론트) + `http://localhost:8000`(백엔드)에서 대시보드를 띄우는 절차다.

- 인증: 실제 Cognito User Pool(`ap-south-1_cLYNU0iGV`)에 PKCE로 로그인 → 백엔드가 JWKS로 JWT 검증
- 데이터: 실제 AWS DynamoDB(`AEGIS-DynamoDB-FactoryStatus`)/S3에서 **읽기**
- 메타DB(RBAC 사용자): 로컬은 메모리 sqlite (재시작 시 비워짐) → 권한은 부트스트랩 sub로 우회
- Redis: 운영 ElastiCache는 VPC 내부라 접속 불가. 로컬 Redis는 선택(WS/실시간 PUBSUB용)

> 주의: 로컬 백엔드도 실제 AWS 리소스에 붙는다. DynamoDB/S3는 읽기지만, `/admin/users` 화면의 사용자 생성/비활성/삭제는 **실제 Cognito User Pool에 반영**되므로 테스트 시 주의한다.

---

## 1. (1회) Cognito 콜백/로그아웃 URL에 localhost 등록

App Client는 영구 자원(`infra/data-dashboard-permanent/cognito.tf`)에 있다. 콜백/로그아웃 허용 목록에 localhost가 들어 있어야 로그인 리다이렉트가 막히지 않는다.

```hcl
# infra/data-dashboard-permanent/cognito.tf — aws_cognito_user_pool_client.this
callback_urls = [
  "https://${local.dashboard_web_fqdn}/callback",
  "http://localhost:5173/callback", # 로컬 프론트엔드 개발용
]
logout_urls = [
  "https://${local.dashboard_web_fqdn}/",
  "http://localhost:5173/", # 로컬 프론트엔드 개발용
]
```

적용 (App Client in-place 변경만 발생, 운영 URL은 유지):

```bash
terraform -chdir=infra/data-dashboard-permanent apply -var="dashboard_domain_name=aegis-pi.cloud"
```

> 이미 반영돼 있으면 `No changes`. 운영 콜백 URL은 그대로 두고 localhost만 추가하는 변경이라 운영 영향 없음.

---

## 2. (1회) 프론트엔드 환경변수 — `apps/dashboard-web/.env.local`

`.env.local`은 gitignore 대상. 코드(`src/auth/auth.ts`, API 클라이언트)가 참조하는 정확한 변수명을 써야 한다.

```dotenv
# 백엔드 API / WebSocket — 로컬 서버
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000

# Cognito OIDC (User Pool issuer, trailing slash 없음)
VITE_COGNITO_AUTHORITY=https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_cLYNU0iGV
VITE_COGNITO_DOMAIN=https://kjw-aegis-data-auth.auth.ap-south-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=5tgi86cftt5hu82prq6df87e7c

# 로그인/로그아웃 후 로컬 화면 복귀
VITE_COGNITO_REDIRECT_URI=http://localhost:5173/callback
VITE_COGNITO_LOGOUT_URI=http://localhost:5173/
```

> 흔한 실수: `VITE_API_URL`(X) → 코드는 `VITE_API_BASE_URL`(O)를 읽는다. `AUTHORITY`/`CLIENT_ID`/`REDIRECT_URI`가 비면 앱이 `Missing env var`로 죽고, 로그아웃에는 `DOMAIN`도 필요하다.

---

## 3. (1회) 백엔드 환경변수 — `apps/dashboard-backend/.env`

`.env`는 gitignore 대상. 비밀값(AWS 키 등)은 여기 적지 말고 쉘/AWS 프로파일로 주입한다.

```dotenv
# 메타DB — 로컬은 메모리 sqlite (Postgres 불필요, 재시작 시 비워짐)
DATABASE_URL=sqlite+aiosqlite:///:memory:
DATABASE_AUTO_CREATE_METADATA=true

# Redis (선택: 로컬 컨테이너 띄울 때만 실시간 동작)
REDIS_URL=redis://localhost:6379

# DynamoDB / S3 (실제 AWS 리소스 읽기)
DDB_TABLE_STATUS=AEGIS-DynamoDB-FactoryStatus
DDB_TABLE_REPORT=aegis-daily-report
DASHBOARD_FACTORY_IDS=factory-a,factory-b,factory-c
DASHBOARD_FACTORY_DISCOVERY_MODE=scan_latest
S3_BUCKET_DATA=aegis-bucket-data

# Cognito (실제 User Pool — JWT 검증에 필수)
COGNITO_USER_POOL_ID=ap-south-1_cLYNU0iGV
COGNITO_APP_CLIENT_ID=5tgi86cftt5hu82prq6df87e7c

# RBAC 부트스트랩 — 본인 Cognito sub (4절 참고). 비면 로그인해도 403.
RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS=<본인-sub>

AWS_REGION=ap-south-1
```

---

## 4. (1회) RBAC 부트스트랩 sub 확인

로컬 sqlite는 사용자 테이블이 비어 있어, 로그인에 성공해도 데이터 API는 `403 User is not provisioned`가 난다. 본인 Cognito `sub`를 `RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS`에 넣으면 SUPER_ADMIN으로 전체 접근된다 (`deps/rbac.py`의 `_bootstrap_principal`).

1. 일단 프론트/백엔드를 띄우고 로그인까지 한다 (5절)
2. sub 확인:
   - 브라우저 F12 → Console에서 ID 토큰을 디코드하거나, ID 토큰 문자열을 https://jwt.io 에 붙여 `sub` 클레임 확인
3. `.env`의 `RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS=`에 sub를 채우고 **백엔드 재시작**

---

## 5. 매번 실행

### (선택) Redis — 실시간/WebSocket 쓸 때만
```bash
docker run -d --name aegis-redis -p 6379:6379 redis:7
```

### 백엔드 — 터미널 #1
```bash
cd apps/dashboard-backend
python3 -m venv .venv          # 최초 1회
source .venv/bin/activate
pip install -r requirements.txt # 최초 1회
pip install aiosqlite           # 최초 1회 — 로컬 sqlite 드라이버 (운영 requirements엔 없음)
uvicorn main:app --reload --port 8000
```
- AWS 자격증명은 기본 프로파일(`aws sts get-caller-identity`)로 자동 사용 → 별도 export 불필요
- 확인: http://localhost:8000/healthz → `{"status":"ok"}`

### 프론트엔드 — 터미널 #2
```bash
cd apps/dashboard-web
npm install                     # 최초 1회
npm run dev
```
- http://localhost:5173 접속 → 로그인

> `--reload`는 코드 변경만 자동 반영한다. `.env`/`.env.local`이나 의존성 설치 후에는 **반드시 끄고 다시 실행**해야 적용된다.

---

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `ModuleNotFoundError: No module named 'aiosqlite'` | 로컬 sqlite 드라이버 미설치 (운영은 asyncpg) | `pip install aiosqlite` 후 백엔드 재시작 |
| 로그인 후 데이터 화면 `403 User is not provisioned` | 로컬 메타DB에 사용자 없음 | `.env`의 `RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS`에 본인 sub 등록 + 재시작 (4절) |
| 모든 API `401` | `COGNITO_USER_POOL_ID`/`APP_CLIENT_ID` 비었거나 오타 → JWKS 검증 실패 | `.env` 값 확인 |
| 프론트 `Missing env var: VITE_...` | `.env.local` 변수 누락/오타 | 2절 변수명 확인 (특히 `VITE_API_BASE_URL`) |
| 로그인 시 Cognito가 redirect_uri 거부 | App Client 콜백 목록에 localhost 없음 | 1절 terraform apply |
| CORS 차단 | 백엔드 허용 origin에 localhost 없음 | 기본값에 `http://localhost:5173` 포함됨(`config.py`). `CORS_ALLOW_ORIGINS`를 덮어썼다면 거기에 추가 |
| Redis 연결 에러 로그 | 로컬 Redis 미기동 | 실시간 기능 안 쓰면 무시 가능. 쓰려면 5절 docker run |

---

## 7. 참조

- `infra/data-dashboard-permanent/cognito.tf` — App Client 콜백/로그아웃 URL
- `apps/dashboard-web/.env.example` — 프론트 환경변수 템플릿
- `apps/dashboard-backend/.env.example` — 백엔드 환경변수 템플릿
- `apps/dashboard-backend/deps/auth.py` — Cognito JWT 검증
- `apps/dashboard-backend/deps/rbac.py` — Principal 해석 / 부트스트랩
- `docs/ops/22_data_dashboard_vpc_runbook.md` — 운영 배포 런북
