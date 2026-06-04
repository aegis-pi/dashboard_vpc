# Aegis-Pi Master Checklist

상태: working tracker
기준일: 2026-06-04
기준 문서: `docs/issues/M0_factory-a_safe-edge-baseline.md` ~ `docs/issues/M7_integration-test.md`
세션 이어받기: `docs/issues/SESSION_STATE.md`
**AI 에이전트 진입점**: `docs/AI_AGENT_HARNESS.md` — phase별 DoD · 허용/금지 파일 · 검증 명령 · 프롬프트 가이드

## 사용 방식

- 이 파일은 진행 추적용 체크리스트다.
- 상세 완료 조건과 Acceptance Criteria는 각 원본 이슈 문서를 기준으로 본다.
- 실제로 끝난 항목만 체크한다.
- 마일스톤 완료 판단은 하위 Issue 전부 완료된 뒤 원본 문서의 완료 기준으로 다시 확인한다.
- 각 issue를 진행하거나 완료하면 원본 issue 섹션의 `GitHub Issue Comment Draft`를 최신 상태로 갱신한다.
- GitHub issue comment는 해당 draft를 기준으로 작성하되, 민감 정보는 포함하지 않는다.
- 본 환경(워크스트림 B)에서는 워크스트림 A 영역(M1/M2/M3/M5 의 본 환경 미진행 이슈) 체크 표기를 변경하지 않는다. 합류 지점은 `docs/AI_AGENT_HARNESS.md` § 3 참조.

---

## M0. `factory-a` Safe-Edge 기준선 복구

원본: `docs/issues/M0_factory-a_safe-edge-baseline.md`

- [x] Issue 1 - [Safe-Edge/OS] Raspberry Pi OS Lite 각 노드 기본 세팅
- [x] Issue 2 - [Safe-Edge/네트워크] 하드웨어/네트워크 기준선 구성
- [x] Issue 3 - [Safe-Edge/K3s] 3-Node 클러스터 구성 및 taint/label 적용
- [x] Issue 4 - [Safe-Edge/MetalLB] MetalLB + Traefik 네트워크 서비스 계층 구성
- [x] Issue 5 - [Safe-Edge/Longhorn] 3-Node 복제 구성
- [ ] Issue 6 - [Safe-Edge/NFS] Host PC NFS Cold Storage 구성 (보류)
- [x] Issue 7 - [배포/ArgoCD] GitHub + ArgoCD GitOps 구성
- [x] Issue 8 - [관제/Grafana] Prometheus + InfluxDB + Grafana 모니터링 구성
- [x] Issue 9 - [데이터/BME280] BME280 + 카메라 + 마이크 입력 계층 구성
- [x] Issue 10 - [Safe-Edge/AI] 통합 AI + Audio 파드 배포 및 Worker-2 배치
- [x] Issue 11 - [Safe-Edge/Failover] Failover / Failback 정책 검증
- [ ] Issue 12 - [자동화/Ansible] start_test 자동화 부분 완료, Hot/Cold 티어링 보류
- [x] Issue 13 - [검증/통합] Safe-Edge 기준선 통합 검증

## M1. Hub 클라우드 기반 구성

원본: `docs/issues/M1_hub-cloud.md`

- [x] Issue 0 - [AWS/Auth] AWS CLI MFA 및 Terraform 접근 설정
- [x] Issue 1 - [Hub/EKS] 클러스터 생성 및 기본 설정
- [x] Issue 2 - [Hub/Kubernetes] 네임스페이스 설계 및 생성
- [x] Issue 3 - [Hub/ArgoCD] ArgoCD 설치 (Spoke 등록 전 단계)
- [x] Issue 4 - [Hub/S3] 버킷 생성 및 경로 파티셔닝 설계
- [x] Issue 5 - [Hub/IoT Core] Thing / 인증서 / 규칙 구성
- [x] Issue 6 - [관제/AMP] AMP(Amazon Managed Prometheus) Workspace 생성 및 접근 권한 준비
- [x] Issue 7 - [관제/Prometheus] Hub Prometheus 설치 및 AMP remote_write 구성
- [x] Issue 8 - [관제/Grafana] 내부 관측용 Grafana/AMP 데이터 소스 기준 결정
- [x] Issue 9 - [Hub/Ingress] AWS Load Balancer Controller 준비
- [x] Issue 10 - [Hub/Admin UI] ArgoCD/Grafana HTTPS Admin Ingress 구성
- [ ] Issue 11 - [Hub/Admin UI] 운영 보안 강화 백로그
- [x] Issue 12 - [Risk/Config] `runtime-config.yaml` 파일 구조 초안 작성

## M2. Mesh VPN + Hub-Spoke 연결

원본: `docs/issues/M2_mesh-vpn-hub-spoke.md`

- [x] Issue 1 - [Mesh/Tailscale] 계정 및 Spoke별 키 발급 정책 수립
- [x] Issue 2 - [Mesh/Tailscale] `factory-a` Master Tailscale 참여 및 확인
- [x] Issue 3 - [Mesh/Tailscale] EKS Hub Tailscale 참여 및 확인
- [x] Issue 4 - [Mesh/Tailscale] kubeconfig Tailscale IP 기반 구성
- [x] Issue 5 - [배포/ArgoCD] `factory-a` Spoke 클러스터 등록
- [x] Issue 6 - [검증/ArgoCD] Hub -> `factory-a` K3s API 접근 및 Sync 확인

## M3. 배포 파이프라인

원본: `docs/issues/M3_deploy-pipeline.md`

- [x] Issue 1 - [배포/Helm] GitHub 저장소 구조 설계 (베이스 + 공장별 values)
- [ ] Issue 2 - [배포/ECR] 저장소 구성 및 이미지 태그 전략
- [ ] Issue 3 - [배포/GitHub Actions] 빌드/푸시 워크플로우 구성
- [x] Issue 4 - [배포/ArgoCD] ApplicationSet 구성 (`factory-a` 기준)
- [ ] Issue 5 - [배포/ArgoCD] 운영형 동기화 정책 및 롤백 정책 적용
- [ ] Issue 6 - [배포/GitHub Actions] manifest 갱신 워크플로우 구성
- [ ] Issue 7 - [배포/GitHub Actions] 배포 검증 워크플로우 구성
- [ ] Issue 8 - [검증/ArgoCD] `factory-a` end-to-end 배포 검증

## Phase 1 통합 구현 Step (워크스트림 B, 본 환경)

> 2026-05-18 결정. M4/M6의 원본 Acceptance Criteria는 그대로 유지하되, 본 환경에서의 실제 구현은 Phase 1 Step 0~10을 따른다. 상세는 `docs/planning/16_data_dashboard_vpc_workplan.md`.

기준 문서:
- `docs/changes/0012~0017` (Phase 1 결정 ADR 6종)
- `docs/planning/17_expansion_roadmap.md` (Phase 1~4 트리거)
- `docs/architecture/01_target_architecture.md`
- `docs/architecture/drawio/03_re6_workstream_b_enhanced.drawio`

> Step 번호 정정: `docs/planning/16_data_dashboard_vpc_workplan.md`가 source of truth이며, 실제 진행 중 Step 8=운영 Frontend Vite 마이그레이션, Step 9=S3+CloudFront 배포 CI/CD + e2e 검증, Step 9.5=permanent resource split으로 재정의됐다. 아래 체크박스는 그 정정 기준으로 표기한다.

- [x] Step 0 - [도메인] Gabia 신규 도메인 구매 + DNS 전파 (aegis-pi.cloud, Route53 위임)
- [x] Step 1 - [Frontend] prototype/reference 정리 + 운영 SPA(`apps/dashboard-web/`)로 마이그레이션 (Step 8에서 완성)
- [x] Step 2 - [Terraform] 1번 VPC 골격 (`infra/data-dashboard/`): Public/Private App/Private Data subnet × 2 AZ, IGW, NAT GW × 1, ALB, Route53, ACM, CloudFront, S3 SPA, Cognito (47 resources)
- [x] Step 3 - [Terraform] 데이터 저장소: 기존 DDB `AEGIS-DynamoDB-FactoryStatus`(Streams), `aegis-daily-report`, S3 prefix, RDS PostgreSQL, ElastiCache Redis, Secrets Manager
- [x] Step 4 - [협의] Lambda data processor IoT Rule trigger 방식 워크스트림 A와 합의 (ADR 0020/0021/0022) — **합류 지점**
- [x] Step 5 - [Lambda] notifier 구현 (DDB Streams → VPC-attach → Redis PUBLISH, ~0.45초 검증)
- [x] Step 6 - [Backend] FastAPI Dashboard Backend (REST + WebSocket + 4 데이터소스 조합)
- [x] Step 7 - [Terraform] ECS Service / ALB / Target Group / Task Role / Listener Rule (+ Step 7.5 Route53 영구 분리)
- [x] Step 8 - [Frontend] 운영용 Vite + React SPA 마이그레이션 (`apps/dashboard-web/`)
- [x] Step 9 - [배포/검증] S3+CloudFront 배포 CI/CD(ADR 0023) + End-to-end 통합 검증 (cloud-side 주입 기반; IoT → DDB 실시간 경로는 factory-a Edge Agent 비활성으로 미검증)
- [x] Step 9.5 - [Terraform] Permanent resource split (`infra/data-dashboard-permanent/` 25 resources, ADR 0024)
- [ ] Step 10 - [운영] build/destroy 스크립트, runbook, drawio·architecture 문서 최종 갱신, 비용 baseline 실측 재갱신 (진행 중: runbook `ops/22` 작성·비용 baseline v3.4 갱신 완료, build/destroy 스크립트 잔여)
- [ ] (별도) [LLM] Lambda report-generator + EventBridge schedule + Bedrock 일간 보고서 생성기 (ADR 0016, 팀원/후속 — Dashboard 측 S3 `reports/daily/` 조회 경로는 ADR 0029로 구현 완료)

> Phase 1 이후 운영 배포로 추가된 Dashboard 기능: Factory Timeline `10m/1h/custom` + `top_causes` 원인 표시, GRAPH#5M multi-resolution history(ADR 0025/0026), Cloud Infra 상태 화면 + Fast/Slow collector(ADR 0027, `apps/cloud-infra-collector/`), staleness 60/120초 통일(ADR 0028), S3 기반 일간 보고서 조회 UI(ADR 0029), ECS backend right-sizing + Auto Scaling(ADR 0030), RBAC 사용자 관리(ADR 0031).

Phase 1 데모 시연 시나리오:

1. factory-a 실제 센서 변화 → 1~2초 내 대시보드 WebSocket 갱신
2. 사용자 권한 변경 (RDS PostgreSQL) → Cognito 다음 로그인 시 반영
3. Bedrock 일간 보고서 자동 생성 (수동 invoke 데모 가능)
4. build/destroy 사이클로 비용 ~$8~10/월 입증

## M4. 데이터 플레인 - `factory-a` 단일 Spoke 기준

원본: `docs/issues/M4_data-plane.md`

> Phase 1 Step 매핑: Issue 1~5는 워크스트림 A 합의 영역(팀). Issue 6~8은 Phase 1 Step 4/9에 해당.

- [ ] Issue 1 - [데이터/Schema] 표준 입력 스키마 확정 (워크스트림 A · 팀 합의)
- [ ] Issue 2 - [데이터/Edge Agent] `factory-a` Edge Agent 수집/변환 로직 구현 (워크스트림 A · 팀 합의)
- [ ] Issue 3 - [데이터/Container] `factory-a` Edge Agent 컨테이너화 및 K3s 배포 준비 (워크스트림 A · 팀 합의)
- [ ] Issue 4 - [데이터/IoT Core] Edge Agent → IoT Core 연결 및 수신 확인 (워크스트림 A · 팀 합의)
- [ ] Issue 5 - [데이터/S3] IoT Core → S3 적재 확인 (워크스트림 A · 팀 합의)
- [x] Issue 6 - [데이터/Lambda] IoT Core Lambda data processor 구현 → Phase 1 Step 4 (ADR 0021/0022). `apps/data-processor/` 구현, IoT Rule 2개 active, DDB LATEST/HISTORY + S3 processed e2e 검증
- [x] Issue 7 - [데이터/Pipeline] `pipeline_status` Lambda 처리 검증 (`apps/data-processor/pipeline_status.py`, staleness 60/120초 ADR 0028)
- [ ] Issue 8 - [검증/데이터] `factory-a` 데이터 플레인 end-to-end 검증 → cloud-side(주입 → DDB → S3 → Dashboard) 검증 완료. factory-a Edge Agent → IoT Core 실시간 경로는 Edge Agent 비활성으로 미검증 (후속)

## M5. VM Spoke 확장 - `factory-b`, `factory-c`

원본: `docs/issues/M5_vm-spoke-expansion.md`

- [ ] Issue 1 - [Spoke/K3s] Mac mini VM K3s 구성 (`factory-b`)
- [ ] Issue 2 - [Spoke/K3s] Windows VM K3s 구성 (`factory-c`)
- [ ] Issue 3 - [Spoke/Tailscale] `factory-b`, `factory-c` Tailscale 참여 및 Hub 연결
- [ ] Issue 4 - [배포/ArgoCD] ApplicationSet에 `factory-b`, `factory-c` 추가
- [ ] Issue 5 - [Spoke/Dummy Sensor] Dummy Sensor 모듈 구현 및 배포
- [ ] Issue 6 - [배포/ArgoCD] 테스트베드형 동기화 정책 및 자동 롤백 적용
- [ ] Issue 7 - [검증/데이터] `factory-b`, `factory-c` 데이터 플레인 연결 확인

## M6. Risk Twin + 관제 화면

원본: `docs/issues/M6_risk-twin-dashboard.md`

> Phase 1 Step 매핑: Issue 1~4는 Lambda data processor 내부 단계 (워크스트림 A 합의). Issue 5~8은 Phase 1 Step 1/6/8/9에 해당. 메타·권한·알림룰·LLM 보고서는 ADR 0017/0014/0015/0016으로 추가됨.

- [x] Issue 1 - [Risk/Lambda] Lambda Risk 계산 로직 구현 (가중치 초기안) — `apps/data-processor/risk.py` (안전점수 방식)
- [ ] Issue 2 - [Risk/Config] `runtime-config.yaml` 전역 설정 적용 및 필드 제어 구현 (후속)
- [ ] Issue 3 - [Risk/Config] 온도/습도 이상 기준값 초안 적용 (data-processor 내 임계값 일부 반영, 정식 튜닝 후속)
- [x] Issue 4 - [Risk/Twin] Risk Twin 출력 구조 구현 — DDB `FACTORY#` LATEST/HISTORY#STATE/GRAPH#5M 구조 (ADR 0026)
- [x] Issue 5 - [관제/Dashboard] 메인 대시보드 - 공장별 위험도 카드 (Fleet 화면)
- [x] Issue 6 - [관제/Dashboard] 메인 대시보드 - 센서 현황 + 이상 시스템 목록 (Factory 화면, WebSocket 실시간 갱신)
- [x] Issue 7 - [관제/Dashboard] 메인 대시보드 - 이벤트/상태 변화 로그 (Factory Timeline `10m/1h/custom` + `top_causes`)
- [ ] Issue 8 - [검증/Risk] 시나리오별 Risk Score 변화 확인 → cloud-side 표시 검증 완료, 실시간 시나리오 변화 검증은 Edge Agent 재활성 후 후속
- [x] (Phase 1 추가) RDS PostgreSQL 메타·권한 관리 화면 — 공장별 RBAC + `/admin/users` 사용자 관리 (ADR 0031). 알림룰 화면은 후속
- [ ] (Phase 1 추가) LLM 일간 보고서 탭 — 조회 경로(S3 `reports/daily/` Markdown 렌더링, ADR 0029)는 구현 완료, Bedrock 생성기는 팀원/후속 (ADR 0016)

## M7. 통합 검증

원본: `docs/issues/M7_integration-test.md`

- [ ] Issue 0 - [리팩토링/CI-CD] 최종 테스트 전 Repository 분리 및 OIDC 기반 파이프라인 정리
- [ ] Issue 1 - [검증/운영형] `factory-a` 운영형 시나리오 검증
- [ ] Issue 2 - [검증/테스트베드] `factory-b`, `factory-c` 테스트베드형 시나리오 검증
- [ ] Issue 3 - [검증/Failover] Failover 시나리오 (Worker-2 장애 -> Worker-1 승계 -> Hub 반영)
- [ ] Issue 4 - [검증/ArgoCD] 배포 파이프라인 롤백 시나리오
- [ ] Issue 5 - [검증/Test Checklist] `docs/ops/03_test_checklist.md` 전수 보정
- [ ] Issue 6 - [문서화/Docs] `docs/` 및 `configs/` 기준 문서 최종 갱신
