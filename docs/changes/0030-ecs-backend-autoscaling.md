ID:        0030
제목:      ecs-backend-autoscaling
상태:      accepted
결정일:    2026-06-04
영향 범위: M6 Dashboard Backend, `infra/data-dashboard/` (ECS service / Application Auto Scaling), `docs/ops/15_aws_cost_baseline.md`

## 결정 요약 (왜 이 값인가)

| 값 | 결정 | 이유 (한 줄) |
| --- | --- | --- |
| **1 vCPU** (cpu 512→1024) | 사양 상향 ✅ | 이미지가 `uvicorn --workers 2` 인데 0.5 vCPU 라 worker 2개가 반 코어를 두고 경쟁(oversubscription). history 파싱은 GIL-bound Python CPU → vCPU 가 요청당 속도를 직접 좌우. 1 vCPU = worker 당 ~0.5 코어 + I/O overlap |
| **2 GB** (mem 1024→2048) | 동반 상향(필요해서 아님) | 관측 메모리 max ~40% → 병목 아님. 2 GB 는 1 vCPU 의 **Fargate 최소 동반 메모리**라 자동으로 따라온 값 (메모리 증설이 목적 아님) |
| **min 2** | 상시 2개 warm ✅ | 단일 1분 버스트는 반응형 autoscaling(메트릭 60s + 콜드스타트)으로 못 따라잡음 → 미리 2개 떠 있어야 함. AZ 분산(HA) + 버스트 분산(102 req/min → task 당 ~51) + 재배포 무중단 |
| **max 2 (=min, 핀)** | 데모는 scale 고정 ✅ | 데모 시간 척도(분~1h)에선 scale-out 이 의미 없고, 데모 중 scale-in(task kill)/out(콜드스타트 잭)이 화면을 끊을 수 있음 → 2개로 핀해 churn 제거. target-tracking 정책은 남기되 min==max 동안 inert |
| **메모리 증설** | ❌ 안 함 | max 40% 라 효과 없음 |

대상 프로파일 = **데모(build/destroy, 사용자 ≤3명, 짧은 버스트)**. 상시 프로덕션 전환 시에는 `ecs_backend_max_capacity` 만 3~4 로 올려 target-tracking 을 활성화하면 된다(코드 변경 불요). 비용은 데모 패턴(16h/월)에서 min 1 대비 세션당 ~$0.79 차이라 데모에서 min 을 줄일 이유가 없어 min 2 를 유지.

## 기존 계획

Dashboard Backend ECS Fargate service 는 `desired_count = 1` 고정, autoscaling 없음.

- task 사양: cpu=512 (0.5 vCPU) / memory=1024 (1 GB)
- `aws_ecs_service.backend` 에 `lifecycle.ignore_changes = [desired_count, task_definition]`

## 변경된 실제 기준

두 가지를 함께 적용한다 — (1) task 사양 right-sizing, (2) Application Auto Scaling.

**(1) task 사양: 0.5 vCPU / 1 GB → 1 vCPU / 2 GB** (cpu 512→1024, memory 1024→2048)

- 컨테이너 이미지가 `uvicorn --workers 2` 로 기동되는데 task 가 0.5 vCPU 라, worker 2개가 반 코어를 두고 경쟁(oversubscription)했다. 무거운 작업은 GIL-bound Python(history HISTORY#STATE item 최대 2000개 → Decimal→float → JSON 직렬화)이라 코어를 실제로 점유한다. 1 vCPU 로 올려 worker 당 ~0.5 코어 + I/O overlap 확보.
- memory 2 GB 는 1 vCPU 의 Fargate 최소 동반치일 뿐(관측 사용량 ~40% of 1 GB). 메모리는 병목이 아니므로 "메모리 증설"은 하지 않는다.
- 변수화: `ecs_backend_task_cpu`(default 1024) / `ecs_backend_task_memory`(default 2048)

**(2) Application Auto Scaling: 상시 task 하한 2 + target tracking 2 policy (데모는 min=max=2 핀)**

- `aws_appautoscaling_target.ecs_backend`: **min 2 / max 2** (`ecs:service:DesiredCount`) — 데모 프로파일 기본값
  - 데모는 짧고 버스트성이라 반응형 autoscaling(메트릭 60s + Fargate 콜드스타트)이 시간 안에 못 따라온다. 데모 매끄러움을 결정하는 건 *탄력* 이 아니라 *미리 떠서 데워진* 용량이므로 2개를 warm 으로 고정한다. scale-in/out churn 도 차단.
  - 지속/프로덕션 부하 전환 시 `var.ecs_backend_max_capacity` 를 3~4 로 올리면 아래 정책이 그대로 작동(코드 변경 불요).
- 정책 2개 (둘 다 target tracking, min==max 동안은 inert):
  - **주(선행 지표)** `ALBRequestCountPerTarget` target=40 req/target/min
  - **안전망** `ECSServiceAverageCPUUtilization` target=50%
- cooldown 비대칭: scale-out 60s / scale-in 300s
- 신규 파일 `infra/data-dashboard/ecs_autoscaling.tf`, 변수 `ecs_backend_{desired_count(1→2 default),min_capacity(2),max_capacity(2),requests_per_target,cpu_target}`

**롤아웃 주의**: `aws_ecs_service.backend` 는 `lifecycle.ignore_changes = [task_definition]` 라 `terraform apply` 는 새 task def revision 을 만들기만 하고 실행 서비스를 거기로 전환하지 않는다(min 2 로 늘어난 task 도 전환 전엔 구 revision = 0.5 vCPU 로 뜬다). apply 후 `aws ecs update-service --cluster KJW-AEGIS-Data-ECSCluster --service KJW-AEGIS-Data-Service-Backend --task-definition <family>:<new-rev> --force-new-deployment` 로 새 사양을 롤아웃해야 한다.

`aws_ecs_service.backend` 의 `ignore_changes = [desired_count]` 는 유지한다. Terraform 이 autoscaling 과 desired_count 를 두고 충돌하지 않도록 하고, desired 1→2 상향은 scalable target 의 min_capacity=2 등록이 담당한다.

## 변경 이유

2026-06-04 ~10:09–10:24 KST incident 실측:

- 단일 0.5 vCPU task 가 약 100 req/min 에서 포화 (peak 102 req/min @ CPU 100%)
- 동시에 ALB `TargetResponseTime` max 12.38s → 16.37s, `HTTPCode_Target_5XX_Count` 33건(10:19) 등 발생
- `MemoryUtilization` max ~40% → 병목은 **메모리가 아니라 CPU/동시처리 용량**
- `desired_count=1` + autoscaling 없음 → 스파이크를 단일 task 가 단독 흡수, 재배포 중 0-task 구간 가용성 리스크

설계 판단:

- 사용자 ≤3명(개발 단계)인데도 포화가 난 것은 **사용자 수가 아니라 요청당 작업이 무겁고(GIL-bound 파싱) + 대시보드 fan-out 으로 버스트가 몰리기 때문**. 메모리는 40% → 증설 대상 아님.
- **1차 레버 = vertical right-sizing**: worker 2개 설정에 맞춰 vCPU 를 1.0 으로. 0.5 vCPU + 2 worker 는 사실상 설정 불일치(oversubscription)였다. 1 vCPU 로 요청당 처리 속도를 직접 끌어올려 12–16s 지연의 근본을 줄인다.
- **요청 주도 API 의 선행 지표는 CPU 가 아니라 요청량**이므로 autoscaling 주 정책은 `ALBRequestCountPerTarget`. target=40 은 0.5 vCPU 기준 포화점(~100 req/min)의 ~40%, 1 vCPU 상향 후엔 더 보수적(포화 ~200 req/min). CPU 는 50% 안전망(60–70% 가 아닌 이유: Target Tracking 후행 + 콜드스타트 동안 포화 도달 방지).
- **min 2** 는 단일 1분 버스트에 대한 반응형 autoscaling 의 한계(메트릭+콜드스타트 lag)를 보완: 버스트를 즉시 2 task 로 분산하고 재배포 무중단(HA)을 확보한다.
- **데모는 max=2 핀**: 데모 시간 척도(분~1h)에선 scale-out 이 의미가 없고, 오히려 데모 중 scale-in(task kill)/scale-out(콜드스타트 잭)이 화면을 끊을 수 있다. 미리 2개 warm + 데모 직전 pre-warm(대시보드 1회 클릭으로 JWKS·DDB pool·Redis·CloudFront 워밍)이 깔끔함의 핵심. 비용 차이도 데모 패턴(16h/월)에선 min 1 대비 세션당 ~$0.79 로 무시 가능 → 데모엔 min 줄일 이유 없음.

## 영향

- 고정 비용(상시 가동): ECS $18.05 → $72.08/월 (1 vCPU/2 GB × min 2 task, task당 $36.04) + target tracking alarm 4개(~$0.40/월, free-tier 10개 내 가능) = **~$123.90 → ~$178.35/월 (+$54.43)**. 데모 운영 패턴(16h/월) ~$6.55 → ~$7.73/월.
- max=2 핀이라 버스트 scale-out 일시 비용 없음. 상시 task 수(=min 2)가 고정 비용을 결정하므로 max 값은 비용에 영향 없음.
- 합류 지점(워크스트림 A) 영향 없음 — ECS/ALB/autoscaling 은 모두 Data/Dashboard VPC(워크스트림 B) 자산.
- `terraform plan` 결과: **4 add / 0 change / 1 destroy** (autoscaling target + policy 2 생성, task def cpu/memory 변경으로 신규 revision 생성·구 revision deregister). service `desired_count`/`task_definition` 은 `ignore_changes` 로 변경 미발생 → 사양 롤아웃은 위 `update-service` 로 별도 수행.

## 업데이트 필요한 문서

- `docs/ops/15_aws_cost_baseline.md` — v3.3 갱신 완료 (고정/데모 합계, 리소스 상태 표)
- `docs/changes/README.md` — 본 ADR 인덱스 추가
- (apply 후) `docs/issues/SESSION_STATE.md` — running/desired 2 반영

## 검증

- `terraform validate` Success / `terraform plan` 4 add·0 change·1 destroy
- **2026-06-04 apply + `update-service --force-new-deployment` 완료, 검증 통과**:
  - `terraform apply`: autoscaling target/policy 2 생성, task def revision **31**(cpu=1024/memory=2048) 등록. apply 직후 scalable target 이 desired 1→2 로 올림(단 ignore_changes 로 서비스는 구 :30 유지)
  - `update-service --task-definition kjw-aegis-data-backend:31 --force-new-deployment` → `aws ecs wait services-stable` STABLE
  - 최종: 서비스 desired 2 / running 2 / rolloutState **COMPLETED** / taskDef **:31**
  - running task 2개 모두 cpu **1024** / memory **2048** / healthStatus **HEALTHY**, **AZ ap-south-1a + 1c 분산**(HA 확인)
  - ALB target group: healthy 2 (구 :30 task 2개는 draining 후 종료)
  - scalable target: **min 2 / max 2**, policy 2개(Requests/CPU) 등록 — min==max 라 현재 inert
- 후속(데모 운영 시): 데모 직전 pre-warm(대시보드 1회 클릭으로 JWKS·DDB pool·Redis·CloudFront 워밍) 후 첫 로드/네비 지연·5xx 없음 확인
- (프로덕션 전환 시) `ecs_backend_max_capacity` 3~4 로 올린 뒤 부하 시 task 증가 + scale-in 으로 2 복귀 확인
