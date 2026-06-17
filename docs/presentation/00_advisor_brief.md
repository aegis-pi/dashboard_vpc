# 지도/검토용 브리프

상태: source of truth
기준일: 2026-06-17

수정 이력:
- 2026-06-17 v0.2  Hub/Foundation/IoT/Admin UI 활성 상태와 Data/Dashboard Phase 1 구현 상태를 최신화.

## 현재 진행 상태

`factory-a` Safe-Edge 기준선 구축과 장애 검증이 완료됐다.
1번 Data/Dashboard VPC의 Phase 1 Dashboard 코드와 운영 배포 기준선도 완료됐다.

완료된 핵심:

```text
3-node K3s
Longhorn
ArgoCD GitOps
Grafana / InfluxDB / Prometheus
BME280 / AI / Audio workload
Failover / Failback
Data retention
AI snapshot retention
Dashboard Backend/Web
Cloud Infra / Reports / Image Snapshots
RBAC 사용자 관리
AI Chat 데이터 QA
```

## 검증 결과

```text
LAN 제거: failover/failback 성공, AI/audio/BME worker1 Running
k3s-agent 중지: failover/failback 성공
AI snapshot PVC 제거 후 Multi-Attach 재발 없음
LAN 제거 InfluxDB 공백: 10초 bucket 기준 AI/audio 80초, BME 70초
```

## 현재 판단

- M0는 핵심 기준선 완료로 볼 수 있다.
- NFS Cold Storage와 Ansible tiering은 보류했다.
- AWS Hub EKS/VPC/namespace/ArgoCD bootstrap, Hub Prometheus Agent, Grafana/AMP datasource, AWS Load Balancer Controller, Admin UI HTTPS Ingress, foundation S3/AMP/IoT Rule, `factory-a` IoT Thing/Policy/K3s Secret, IRSA S3/AMP 권한은 2026-05-15 rebuild 후 활성 상태다.
- Data/Dashboard는 Phase 1 Step 0~9.5 구현과 운영 배포를 완료했다. 2026-06-16 비용 절감을 위해 일시 root는 destroy 완료, permanent/dns root는 유지 상태다.
- 후속 구현 책임 경계는 Terraform = 인프라, Ansible = bootstrap/설정/소프트웨어, GitHub Actions = CI, GitHub+ArgoCD = CD로 고정한다.

## 다음 검토 주제

1. failover 데이터 공백 허용 범위
2. failback 중복 write 처리 필요성
3. active writer guard 필요 여부
4. `runtime-config.yaml`과 Risk 가중치 기준
5. 데모 전 Data/Dashboard build/destroy 운영 절차
6. AI Chat/Image Snapshot 실데이터 수기 검증
7. LLM 일간 보고서 자동 생성기 후속 범위
