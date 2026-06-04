# 프로젝트 보고서 초안

상태: draft
기준일: 2026-04-28

## 1. 배경

기존 Safe-Edge는 단일 공장 내 엣지 감시와 생존성을 목표로 한 구조였다. Aegis-Pi는 이를 바로 대체하지 않고, 먼저 실제 운영형 기준선인 `factory-a`로 복구한 뒤 중앙 Hub/Risk Twin 구조로 확장하는 접근을 선택했다.

## 2. 현재 구현 범위

현재 완료된 범위는 `factory-a` 로컬 Safe-Edge 기준선이다.

구성:

```text
Raspberry Pi 3-node K3s
Longhorn
ArgoCD
InfluxDB
Prometheus
Grafana
BME280
Integrated AI
Audio detection
Failover / Failback automation
```

## 3. 운영 구조

배포는 GitHub repo와 ArgoCD Application을 통해 관리한다.

```text
safe-edge-config-main
    -> ArgoCD
    -> safe-edge-monitoring
    -> safe-edge-ai-apps
```

모니터링은 Grafana에서 수행한다.

```text
InfluxDB: 센서 / AI / 소리 데이터
Prometheus: 노드 상태
```

## 4. 장애 복구 검증

worker2 장애를 LAN 제거와 전원 제거 방식으로 검증했다.

전원 제거 테스트 결과:

```text
Failover 성공
Failback 성공
worker1 전체 Running까지 약 74초
worker2 전체 Running 복귀까지 약 2분 11초
Longhorn degraded 후 healthy 복귀
```

데이터 공백:

```text
failover 1초 bucket 최대 공백: 65-75초
failback 1초 bucket 최대 공백: 2초
```

## 5. 데이터 보존

클라우드 마이그레이션 전 로컬 저장소 누적을 막기 위해 보존 정책을 적용했다.

```text
InfluxDB safe_edge_db: 1일 retention
AI snapshot: 24시간 초과 자동 삭제
```

## 6. 한계

- failover 시 전원 장애 기준 약 65-75초의 데이터 공백이 있었다.
- failback 전환 구간에서 중복 write 후보가 있다.
- AWS Hub EKS/VPC/namespace/ArgoCD bootstrap, Hub Prometheus Agent, Grafana/AMP datasource, AWS Load Balancer Controller, Admin UI HTTPS Ingress, foundation S3/AMP/IoT Rule, IRSA S3/AMP 권한은 `build-all --admin-ui`와 `build-hub`로 재생성/검증했고 2026-05-15 rebuild 후 활성 상태다.
- 1번 Data/Dashboard VPC(워크스트림 B)의 Risk Twin 구조는 Phase 1 Step 0~9.5 구현 완료 후 운영 배포 단계다(2026-06-04 기준). IoT Core → Lambda data processor → DynamoDB/S3, DDB Streams → notifier → Redis, ECS Fargate Dashboard Backend(FastAPI) + ALB, CloudFront/S3 SPA, Cognito + RDS 기반 공장별 RBAC, Cloud Infra 상태 화면(Fast/Slow collector), S3 기반 일간 보고서 조회까지 구현·배포했다. LLM 보고서 생성기(Bedrock)와 factory-a Edge Agent 실시간 송신 검증은 후속이다. 상세는 `docs/issues/SESSION_STATE.md`와 `docs/planning/16_data_dashboard_vpc_workplan.md`.
- NFS Cold Storage와 Ansible tiering은 보류했다.

## 7. 다음 단계

1. `runtime-config.yaml`과 Risk 가중치 기준
2. Hub-Spoke 연결
3. GitHub Actions CI와 GitHub+ArgoCD CD 코드화
4. IoT Core/S3 데이터 플레인 검증
5. Dashboard VPC 기반 관리자 관제 화면
6. Risk Twin dashboard 구현
