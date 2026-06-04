# 0031. Dashboard RBAC 사용자 관리

상태: accepted
결정일: 2026-06-04
관련 범위: M6 Dashboard, RDS PostgreSQL, Cognito, 공장별 접근 제어

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
| `super_admin` | 모든 공장과 사용자 관리 기능 접근 |
| `org_admin` | 조직 관리자. Phase 1에서는 `super_admin`과 동일하게 모든 공장 접근 |
| `factory_admin` | `user_factory_access`에 부여된 공장만 조회/관리 |
| `viewer` | `user_factory_access`에 부여된 공장 조회 전용 |

공장별 권한은 `user_factory_access.role = admin | viewer`로 둔다.

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
- `/admin/users`: `super_admin` 또는 `org_admin`만 사용자 조회/생성/수정/비활성화 가능

## 검증 기준

- 일반 공장 관리자는 자기 공장 외 API 직접 호출 시 `403`
- 본사 관리자는 전체 공장과 사용자 관리 화면 접근 가능
- 사용자 생성/삭제/권한 수정은 Cognito와 RDS 상태가 일관됨
- 프론트엔드 sidebar, 보고서 selector, 사용자 관리 화면은 허용된 데이터만 표시
