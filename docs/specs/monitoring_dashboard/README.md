# Monitoring Dashboard Specs

이 디렉터리는 Aegis-Pi 관제 화면의 요구사항, 화면 구성, API, 데이터 모델을 정리한다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_requirements.md` | 관제 화면의 MVP 요구사항 |
| `01_screen_plan.md` | 화면 구성과 패널 배치 계획 |
| `02_api_spec.md` | Dashboard Web/API가 제공할 API 초안 |
| `03_data_model.md` | InfluxDB, Prometheus, Risk 상태 데이터 모델 |
| `04_risk_twin_web_screen_design.md` | Data / Dashboard VPC 기반 Risk Twin Web 화면 설계 |
| `05_screen_data_mapping.md` | Risk Twin Web 화면별 DynamoDB/S3 데이터 필드 매핑 |
| `06_cloud_infra_view.md` | Cloud infra 상태 화면 Backend/Frontend 구현 계약 (데이터 계약은 `../../planning/29`) |
| `07_ui_quality_reference.md` | 배포 전 Dashboard UI polish를 위한 모범 사례·반면 교사·QA 기준 |

## 기준

- 현재 로컬 Grafana 기준과 후속 Data / Dashboard VPC 기준을 구분해 작성한다.
- 실제 대시보드 구현이 진행되면 API와 데이터 모델을 먼저 갱신한다.
