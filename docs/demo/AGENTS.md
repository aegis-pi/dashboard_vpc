# docs/demo/ AGENTS.md

> 시연 준비와 시연 흐름 (도구 중립).
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 현재 가능한 데모와 후속 목표 데모를 분리해 작성한다
- 시연에서 쓰는 주소·상태·장애 결과는 `../ops/` 운영 문서를 기준으로 확인

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_demo_ops_notes.md` | 시연 중 확인할 운영 메모와 주의사항 |
| `01_demo_scenario.md` | Safe-Edge 기준선 + 후속 Hub 확장 시연 시나리오 |

## 현재 가능한 데모 범위

- factory-a 단독 Safe-Edge 운영 상태 확인
- Grafana 센서/AI 대시보드
- ArgoCD GitOps sync
- Longhorn storage
- worker2 장애 → worker1 failover → worker2 failback

## 후속 데모 (rebuild 필요)

- AWS Hub EKS / Hub ArgoCD / Hub Prometheus Agent / Grafana / AMP
- Foundation S3 / AMP Workspace / IoT Rule
- factory-a IoT Thing / K3s Secret
- Admin UI HTTPS Ingress
- factory-b / factory-c / Risk Twin 통합 화면

## 작성 규칙

- "현재 가능" 섹션과 "후속" 섹션을 항상 분리
- AWS 시연은 Hub rebuild 상태에서만 기술. 삭제 상태에서 시연하지 않는다
- 시연용 주소·credential은 본 디렉터리에 직접 적지 않는다. `../ops/`를 참조
- 데모 흐름 변경 시 `../ops/00_quick_start.md`의 진입 순서와 어긋나지 않게 점검

## 참조

- 운영 상태: `../ops/05_factory_a_status.md`
- 빠른 확인: `../ops/00_quick_start.md`
- Failover 결과: `../ops/09_failover_failback_test_results.md`
