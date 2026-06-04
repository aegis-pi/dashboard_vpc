# 0031. Dashboard RBAC 사용자 관리

상태: accepted
결정일: 2026-06-04
관련 범위: M6 Dashboard, RDS PostgreSQL, Cognito, 공장별 접근 제어, System 권한

수정 이력:
  - 2026-06-04  사용자 생성 UI/API 역할을 `super_admin`/`factory_admin`으로 제한하고, 공장 관리자의 Cloud Infra 접근을 `can_view_system` 시스템 권한으로 분리.

## 결정

Dashboard 사용자의 로그인 주체는 Cognito User Pool로 유지하고, 역할과 공장 접근 범위는 RDS PostgreSQL 앱 테이블에서 관리한다.

```text
Cognito User Pool      로그인, MFA, 세션, 임시 비밀번호
RDS PostgreSQL         app_user / factory / user_factory_access / audit_log
FastAPI Backend        JWT sub -> app_user 조회 -> 공장별 인가 강제
Dashboard Web          백엔드가 허용한 사용자/공장만 표시
```

PostgreSQL 자체 DB role을 사람별로 만들지 않는다. DB 접속 계정은 ECS backend용 서비스 계정으로만 유지한다.

## 역할 모델

| 역할 | 의미 |
| --- | --- |
| `super_admin` | 모든 공장, 사용자 관리, System 화면 접근 |
| `factory_admin` | `user_factory_access`에 부여된 공장만 조회/관리. 사용자 관리 접근 불가 |
| `org_admin` | legacy role. 신규 생성 UI/API에서는 선택 불가 |
| `viewer` | legacy role. 신규 생성 UI/API에서는 선택 불가 |

신규/수정 UI에서 공장 관리자의 공장별 권한은 모두 `admin`으로 정규화한다. `user_factory_access.role = viewer` 값은 legacy 데이터 호환을 위해 읽기만 유지한다.

공장 관리자의 System 화면 접근은 `app_user.can_view_system` boolean으로 분리한다. `super_admin`은 항상 System 화면 접근 가능, `factory_admin`은 해당 값이 true일 때만 `/cloud-infra` 접근 가능하다.

초기 시드 사용자:

| 사용자 | 권한 |
| --- | --- |
| 본사 관리자 | 모든 공장 |
| FACTORY A 관리자 | `factory-a` |
| A-B 관리자 | `factory-a`, `factory-b` |
| A-C 관리자 | `factory-a`, `factory-c` |
| C 관리자 | `factory-c` |

## 적용 지점

- `/factories`: 로그인 사용자가 접근 가능한 공장만 반환
- `/factories/{factory_id}` / `/history`: 권한 없는 공장은 `403`
- `/reports`: 접근 가능한 공장 리포트만 반환
- `/reports/{date}/{factory_id}`: 권한 없는 공장은 `403`
- `/ws/factories/{factory_id}`: 구독 전 권한 검증
- `/cloud-infra` / `/cloud-infra/history`: `super_admin` 또는 `can_view_system=true` 사용자만 접근 가능
- `/admin/users`: `super_admin` 또는 legacy `org_admin`만 사용자 조회/생성/수정/비활성화 가능. 공장 관리자는 sidebar에서도 숨김

## 검증 기준

- 일반 공장 관리자는 자기 공장 외 API 직접 호출 시 `403`
- System 권한이 없는 공장 관리자는 Cloud Infra API 직접 호출 시 `403`
- 본사 관리자는 전체 공장과 사용자 관리 화면 접근 가능
- 사용자 생성/삭제/권한 수정은 Cognito와 RDS 상태가 일관됨
- 프론트엔드 sidebar, 보고서 selector, 사용자 관리 화면은 허용된 데이터만 표시
