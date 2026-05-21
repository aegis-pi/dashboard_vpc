### 팀

일터방패

### 일시

2026.05.20 09:00 ~ 10:30

### 참석자

김민수, 김종원

---

### 안건 및 논의 내용

**1. Factory C VM Cluster 연결 진행**

* **목표:** Factory C VM을 Cluster 환경에 연결하고 데이터 송신 구조 기반 마련.
* **논의 내용:**

  * Factory C VM Cluster 연결 작업 진행.
  * 데이터 송신 구조 및 전체 흐름 확인.
  * 최종적으로 안정적인 데이터 전송까지 완료하는 것을 목표로 설정.
  * Factory B, C 구성 이후 전체 pipeline 연계 예정.

**2. 화면 설계 및 Overview Architecture 수정**

* **목표:** 서비스 화면 설계 마무리 및 전체 아키텍처 구조 정리.
* **논의 내용:**

  * Frontend 화면 구성 초안 정리 및 세부 구조 보완.
  * Overview Architecture 문서 수정 진행.
  * Backend-Frontend 연결 전 Local 환경 기준 UI 검증 예정.
  * 최종적으로 Route53 → CloudFront + S3 기반 Frontend 배포 구조 적용 예정.

**3. Data Pipeline 및 Backend 구조 논의**

* **목표:** 데이터 처리 구조와 Backend 연계 방향 정의.
* **논의 내용:**

  * Data 처리 pipeline을 안정 상태 / 불안정 상태로 구분하는 방향 논의.
  * 불안정 데이터는 S3 적재 후 사후 보고서 생성 pipeline으로 처리하는 방향 검토.
  * Backend의 Data Source는 DynamoDB only 구조로 설계.
  * DynamoDB 적재 이후 Lambda Notifier를 통한 알림 구조 및 Redis 연계 검토.
  * Backend 구성 이전에 Data 처리 pipeline이 우선적으로 완료되어야 한다는 점 확인.

**4. 인증 및 권한 기반 접근 구조 논의**

* **목표:** Cognito 기반 인증 및 권한 분리 구조 정의.
* **논의 내용:**

  * Cognito 기반 로그인 및 사용자 인증 구조 설계 예정.
  * 사용자 권한에 따라 Factory 접근 범위를 제한하는 구조 논의.
  * 예시로 A/B 권한 사용자 로그인 시 C 관련 데이터는 조회되지 않도록 설계 방향 검토.
  * Backend와 Frontend Local 환경 기준으로 권한 검증 예정.

---

### 향후 진행 계획

* **2026.05.20 진행 예정 작업**

  * Factory C 데이터 송신 구조 최종 완성.
  * Factory B, C 구성 마무리.
  * 화면 설계 보완.
  * 보고서 작성 진행 (요구사항서).
  * 이후 VPC 구성 단계로 전환 예정.

---

### 역할 분담 및 이후 작업 계획

#### 다음 작업

* **김민수**

  * 안정 상태 기준 Data Pipeline 구성

* **김종원**

  * Terraform 기반 VPC 생성 작업
  * Frontend 화면 구성 진행

---

#### 이후 작업

* **김민수**

  * 불안정 Data 처리 Pipeline 확장
  * S3 기반 후처리 구조 구성

* **김종원**

  * Backend 및 VPC 내부 구성
  * DynamoDB 연계 및 Lambda Notifier 구조 구성

---

#### 이후 단계

* **김민수**

  * LLM 기반 보고서 작성 Pipeline 구성

* **김종원**

  * Cognito 로그인 및 인증 구조 구성
  * RDS 사용자 추가 및 Backend-Frontend Local 검증 진행

---

### 최종 목표

* Data 처리 → Backend → 인증 → Frontend → 배포까지 연결되는 전체 서비스 흐름 완성
* 최종적으로 Route53 → CloudFront + S3 기반 Frontend 배포 구조 적용
* 권한 기반 접근 제어 및 실시간 데이터 처리 구조 안정화
