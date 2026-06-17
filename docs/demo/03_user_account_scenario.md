# 사용자 계정 시나리오 촬영 절차

상태: draft
기준일: 2026-06-12

목표: Dashboard 사용자 관리 화면에서 계정 생성, 첫 로그인/비밀번호 변경, 공장 권한 수정, 계정 삭제까지 이어지는 RBAC 흐름을 발표 영상으로 촬영한다.

## 핵심 메시지

- Cognito는 로그인 주체, 임시 비밀번호, 세션 관리를 담당한다.
- RDS PostgreSQL은 Dashboard 내부 권한 메타데이터(`app_user`, `user_factory_access`, `audit_log`)를 담당한다.
- Dashboard Backend는 Cognito JWT의 사용자를 RDS 권한과 매칭해 접근 가능한 공장만 노출한다.
- 사용자 삭제는 Cognito 사용자 삭제와 RDS 권한 row 삭제를 함께 수행한다.

## 촬영 방식

한 컴퓨터에서 전체 화면을 녹화한다.

권장 구성:

```text
브라우저 프로필 1: 관리자 계정
브라우저 프로필 2: 신규 사용자 계정
메일 탭: 신규 사용자 초대 메일 확인
AWS Console 탭: Cognito User Pool 사용자 확인
```

터미널과 RDS Console은 본편에서 제외한다. Cognito Console은 생성/삭제 증거 컷으로만 짧게 보여준다.

## 촬영 전 준비

- Dashboard: `https://dashboard.aegis-pi.cloud`
- 관리자 권한: `super_admin` 또는 사용자 관리 접근 가능한 관리자
- AWS Console: Cognito User Pool Users 화면까지 열어두기
- 이메일 inbox: 발표용 신규 테스트 이메일 계정 준비
- 신규 사용자 이름/이메일은 발표용 값 사용
- 화면에 노출되는 이메일, 계정 ID, ARN, User Pool ID는 필요하면 블러 처리

촬영용 예시 계정:

```text
display_name: Demo Factory Manager
email: 발표용 테스트 이메일
initial role: factory_admin
initial factory access: factory-a
updated factory access: factory-a + factory-b
```

## 시나리오 1. 사용자 생성과 첫 로그인

촬영 순서:

1. 관리자 브라우저에서 Dashboard 로그인 상태를 보여준다.
2. 사이드바의 `사용자 관리`로 이동한다.
3. `신규`를 눌러 사용자 생성 폼을 연다.
4. 이메일, 이름, 역할 `공장 관리자`, 공장 권한 `factory-a`만 선택한다.
5. 저장 후 계정 목록에 신규 사용자가 표시되는 장면을 촬영한다.
6. 메일 탭으로 전환해 Cognito 초대 메일과 임시 비밀번호 수신을 확인한다.
7. 신규 사용자 브라우저에서 Dashboard 접속 후 Cognito Hosted UI로 로그인한다.
8. 임시 비밀번호로 로그인하고 새 비밀번호 변경 화면을 완료한다.
9. 신규 사용자로 로그인된 Dashboard에서 `factory-a`만 보이는 것을 촬영한다.
10. AWS Console Cognito Users 화면에서 해당 이메일이 생성된 것을 5초 정도 보여준다.

전달 메시지:

```text
관리자가 Dashboard 사용자 관리 화면에서 공장 관리자를 생성하면 Cognito 초대 메일이 발송된다.
신규 사용자는 첫 로그인 시 비밀번호를 변경하고, 부여된 공장만 Dashboard에서 볼 수 있다.
```

## 시나리오 2. 공장 권한 수정과 화면 변화

촬영 순서:

1. 관리자 브라우저로 돌아와 `사용자 관리` 화면을 연다.
2. 시나리오 1에서 만든 사용자를 선택한다.
3. 공장 권한을 `factory-a`에서 `factory-a + factory-b`로 변경한다.
4. 저장 후 계정 목록의 공장 권한 요약이 바뀐 것을 촬영한다.
5. 신규 사용자 브라우저에서 새로고침한다.
6. 사이드바, Fleet, Factory selector, Reports selector 중 접근 가능한 공장 목록이 바뀐 화면을 촬영한다.

전달 메시지:

```text
로그인 계정은 그대로지만 RDS의 공장 접근 권한이 변경되면 Dashboard가 보여주는 공장 범위가 즉시 달라진다.
이 구조로 본사 관리자는 공장별 접근 권한을 화면에서 운영할 수 있다.
```

## 시나리오 3. 사용자 삭제와 로그인 차단

촬영 순서:

1. 관리자 브라우저에서 같은 사용자를 선택한다.
2. 삭제 버튼을 누르고 확인 dialog를 승인한다.
3. 계정 목록에서 사용자가 사라지는 장면을 촬영한다.
4. 신규 사용자 브라우저에서 로그아웃 후 같은 계정으로 다시 로그인 시도한다.
5. 로그인 실패 또는 사용자 없음 상태를 촬영한다.
6. AWS Console Cognito Users 화면에서 해당 이메일이 사라진 것을 짧게 보여준다.

전달 메시지:

```text
삭제 동작은 Dashboard 목록에서만 숨기는 것이 아니라 Cognito 사용자와 RDS 권한 정보를 함께 제거한다.
삭제된 계정은 다시 로그인할 수 없고 Cognito User Pool에서도 조회되지 않는다.
```

## 편집 포인트

- Cognito Console은 생성 확인과 삭제 확인 장면만 짧게 사용한다.
- RDS는 본편에서 보여주지 않는다. 권한 저장소 설명은 아키텍처 다이어그램 또는 발표 멘트로 처리한다.
- 이메일 수신 대기 시간은 편집으로 줄인다.
- 비밀번호 입력과 이메일 주소는 블러 처리한다.
- 권한 수정 후 신규 사용자 화면이 바로 바뀌지 않으면 새로고침 또는 재로그인 장면을 자연스럽게 포함한다.

## 성공 기준

```text
사용자 생성 후 초대 메일 수신
첫 로그인 시 비밀번호 변경 완료
factory-a 단독 권한으로 factory-a만 노출
권한 수정 후 노출 공장 범위 변경
삭제 후 Dashboard 계정 목록에서 제거
삭제 후 신규 사용자 로그인 불가
Cognito User Pool에서 생성/삭제 상태 확인
```

## 백업 플랜

- Cognito 메일 수신이 늦으면 메일 수신 장면은 후반에 삽입하고, 먼저 관리자 화면의 생성 완료와 Cognito Console 생성 상태를 촬영한다.
- 신규 사용자 세션이 남아 있으면 로그아웃 후 다시 로그인 실패를 촬영한다.
- 권한 변경 직후 화면이 갱신되지 않으면 새로고침 또는 재로그인을 수행한다.
- AWS Console에 민감 정보가 많이 보이면 Cognito 증거 컷을 생략하고 Dashboard 생성/삭제 결과와 로그인 실패 장면만 사용한다.
