# 0032. 아키텍처 Overview 다이어그램 확정 (data/dashboard end-to-end)

상태: accepted
결정일: 2026-06-08
관련 범위: `docs/architecture/` overview 다이어그램, M4/M6 data·dashboard 시각화, ADR 0016/0017/0020/0021/0023/0025/0026/0027/0030/0031

수정 이력:
  - 2026-06-08  초안. 분산돼 있던 `re4~re7` 다이어그램을 단일 overview로 통합하고, Phase 1 Step 0~10 구현 결과(콜렉터·DLQ·OIDC 웹배포·RBAC·CLOUD#infra 등)를 반영해 source of truth로 확정.

## 기존 계획

아키텍처 다이어그램이 세대별 파일로 분산돼 있었다.

- `01_re4.drawio` (단일 VPC, ADR 0005 이전)
- `02_re5_two_vpc_target.drawio` (pre-Phase 1 2 VPC)
- `03_re6_workstream_b_enhanced.drawio` (Phase 1 통합, 직전 source of truth)
- `04_re7_data_dashboard_vpc_image_overview.drawio` (발표용 이미지 overview)

이 파일들은 Phase 1 Step 0~10에서 실제 구현된 신규 컴포넌트(Cloud Infra Collector, notifier DLQ, GitHub OIDC 웹배포, RBAC 테이블, DynamoDB `GRAPH#5M`/`CLOUD#infra` 키, ECS Auto Scaling)를 담고 있지 않았다.

## 변경된 실제 기준

세대별 파일을 제거하고, 단일 overview 다이어그램을 **source of truth**로 확정한다.

- 원본: `docs/architecture/drawio/agiespi_architecture_overview_final1.drawio`
- 이미지 export: `docs/architecture/images/agiespi_architecture_overview_final3.drawio.png`

다이어그램은 data/dashboard end-to-end 경로를 단일 페이지에 담고, AWS managed / 1번 VPC / 2번 VPC / Factory A·B·C 4개 영역과 Line Legend(흐름 색/실선·점선 의미)를 포함한다.

### 다이어그램이 표현하는 구성 (근거 ADR)

| 영역 | 구성 | 근거 |
| --- | --- | --- |
| Dashboard Access | Browser → Cognito(Hosted UI + Admin API) → CloudFront+WAF → S3 SPA(dashboard-web) | 0006, 0008, 0031 |
| CI/CD | GitHub Actions → ECR(image) / → S3 SPA `OIDC: S3 배포 + CF invalidation` | 0023 |
| Data Plane | IoT Core(MQTT/Rules) → Lambda data processor → DynamoDB(`LATEST`/`HISTORY 48h`/`GRAPH#5M`/`CLOUD#infra`/Streams) + S3 raw/processed/reports | 0020, 0021, 0025, 0026 |
| Report Generator | Lambda report generator(factory + cloud-infra 일간) → Bedrock Claude 3 Haiku | 0016 |
| CloudInfra Collectors | EventBridge(schedule) → Fast(1m: ECS·ALB·Lambda·DDB·Redis·RDS·SQS·CloudFront) / Slow(5m: EKS·NodeGroup·ASG·K8s(node/pod)·ArgoCD·S3) → DDB `CLOUD#infra` | 0027 |
| 1번 VPC Backend | ALB(api HTTPS/JWT) → ECS Fargate Backend(FastAPI · x2 AutoScaling) → ElastiCache Redis / RDS PostgreSQL(factory 메타 · RBAC user/access · audit_log) | 0012, 0013→0017, 0030, 0031 |
| Realtime | DynamoDB Streams → Lambda notifier → Redis PUBLISH → WebSocket Push. notifier 실패 → SQS DLQ(종착 싱크) | 0014, 0015, 0022 |
| 2번 VPC | EKS Hub(ArgoCD · Grafana · Tailscale Connector) — 워크스트림 A | — |
| Edge | Factory A(K3s 3-node) · Factory B(Mac VM) · Factory C(Windows VM). GitOps Sync(Tailscale VPN) · MQTT Telemetry(mTLS) | — |

### 직전 다이어그램(`03_re6`/`04_re7`) 대비 추가/변경 사항

- **CloudInfra Collectors** 그룹(EventBridge schedule + Fast/Slow Lambda, 수집원 Fast/Slow 분리 표기) 및 `CLOUD#infra` 적재 엣지 신규 (0027)
- **SQS DLQ**(notifier on_failure, 종착 싱크. 나가는 방향 없음) 신규 (0022 ESM)
- **GitHub OIDC 웹배포** 엣지(S3 sync + CloudFront invalidation) 신규 (0023)
- **Cognito Admin API** 라벨, **RDS RBAC** 테이블(`app_user`/`user_factory_access`/`audit_log`) 명시 (0031)
- **DynamoDB** 키 모델에 `GRAPH#5M`·`CLOUD#infra` 추가 (0025, 0026)
- **ECS Fargate Backend** `x2 AutoScaling` 표기 (0030)
- **Report Generator** 그룹 박스로 일간 보고서 경로 묶음 (0016)

## 변경 이유

- 구현이 완료/운영 배포된 컴포넌트(콜렉터·DLQ·OIDC 배포·RBAC·CLOUD#infra)가 다이어그램에 없어, 그림과 실제 운영이 어긋났다.
- 세대별 파일이 누적돼 어느 것이 현재 기준인지 모호했다. 단일 overview로 통합해 혼선을 제거한다.
- 시각화는 결정이 아니라 **구현 결과의 반영**이므로, 개별 결정은 각 근거 ADR이 유지하고 본 ADR은 "어느 그림이 현재 기준인가"만 확정한다.

## 영향

- `docs/architecture/README.md`, `docs/architecture/02_cloud_expansion_drawio_guide.md`의 파일 표를 신규 overview 기준으로 갱신.
- 발표·보고용 이미지는 `images/agiespi_architecture_overview_final3.drawio.png` 단일본 사용.
- 향후 AWS 리소스/경로 추가 시 본 overview drawio와 PNG export를 함께 갱신한다(아키텍처 CLAUDE.md 규칙).

## 업데이트 필요한 문서

- `docs/architecture/README.md` — 파일 표 (완료)
- `docs/architecture/02_cloud_expansion_drawio_guide.md` — 수정 이력 + 파일 표 (완료)
- `docs/changes/README.md` — 0032 행 추가 (완료)

## 검증

- drawio XML 유효성: `python3 -c "from lxml import etree; etree.parse('docs/architecture/drawio/agiespi_architecture_overview_final1.drawio')"` → valid
- PNG export 정상 렌더(3945×3809), 4개 영역·Line Legend·신규 컴포넌트 라벨 육안 확인.
- 표현된 각 컴포넌트가 근거 ADR 및 실제 구현(`apps/`, `infra/data-dashboard/`)과 일치함을 확인.
