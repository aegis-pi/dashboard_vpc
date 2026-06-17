# ECS 장애 시나리오 촬영 절차

상태: draft
기준일: 2026-06-11

목표: Dashboard Backend ECS 일부 장애를 의도적으로 만들고, Cloud Infra 페이지에서 이상 상태와 Slack 알람을 확인한 뒤 ECS 복구와 Cloud Infra 정상화를 촬영한다.

## 발표 영상 자막 (8컷)

한 편의 연속 영상에 아래 8개 자막을 순서대로 얹는다. (장애 발생 1~4 → 자동 복구 5~8)

장애 발생:

1. 현재 올라와 있는 ECS 2개 중 1개를 강제 종료시킵니다.
2. AWS 웹 콘솔에서 ECS `2/2 → 1/2` 변화를 확인합니다.
3. Dashboard에 ECS 상태 `주의` 반영.
4. ALB 진입점(정상 target) 하락.

자동 복구:

5. ECS 자동 복구 확인.
6. Dashboard에 ECS 상태 `정상` 반영.
7. 옛 task가 아직 `DRAINING`이라 ALB는 잠깐 더 `주의`로 남습니다.
8. `DRAINING`이 빠지면 ALB도 정상 target 2개로 돌아옵니다.

> 포인트: 7~8번은 "ECS는 복구됐는데 ALB가 잠깐 주의로 남는" 현상을 설명한다 — 장애가 아니라 옛 task의 `DRAINING`(연결 정리) 때문임을 짚으면 시스템 이해도·신뢰도가 올라간다.

## 촬영 전 준비

- Dashboard: `https://dashboard.aegis-pi.cloud`
- 촬영 페이지: `Cloud Infra`
- 권한: `super_admin` 또는 `can_view_system=true`
- Terminal AWS profile/region 확인
- Slack 알림 채널 열어두기

```bash
aws sts get-caller-identity
aws configure get region
```

region이 비어 있거나 `ap-south-1`이 아니면 이 세션에서만 지정한다.

```bash
export AWS_REGION=ap-south-1
export AWS_DEFAULT_REGION=ap-south-1
```

공통 변수 설정:

```bash
export CLUSTER=KJW-AEGIS-Data-ECSCluster
export SERVICE=KJW-AEGIS-Data-Service-Backend
```

현재 상태 확인:

```bash
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --query 'services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,rollout:deployments[0].rolloutState,taskDefinition:taskDefinition}' \
  --output table
```

정상 기준:

```text
status = ACTIVE
desired = 2
running = 2
rollout = COMPLETED
```

API도 같이 확인한다.

```bash
curl -fsS https://api.aegis-pi.cloud/healthz
curl -fsS https://api.aegis-pi.cloud/readyz
```

## 권장 시나리오: ECS task 1개만 중지

이 방식이 발표 영상에 가장 적합하다. `desired=2`는 유지하고 `running=1` 상태를 잠깐 만들어 Cloud Infra 페이지가 계속 살아 있는 상태에서 ECS 이상을 보여준다.

촬영 순서:

1. Cloud Infra 페이지를 열고 자동 새로고침을 `5s` 또는 `10s`로 설정한다.
2. 아래 명령으로 실행 중 task 1개를 중지한다.
3. Cloud Infra 페이지에서 `ECS 1/2` 또는 warning 상태를 촬영한다.
4. Slack 알림이 오면 알림 화면을 촬영한다.
5. ECS가 자동으로 `2/2`로 복구되는 장면을 촬영한다.

중지할 task 1개 선택:

```bash
export TASK_TO_STOP=$(
  aws ecs list-tasks \
    --cluster "$CLUSTER" \
    --service-name "$SERVICE" \
    --desired-status RUNNING \
    --query 'taskArns[0]' \
    --output text
)

echo "$TASK_TO_STOP"
```

선택된 task 상세 확인:

```bash
aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_TO_STOP" \
  --query 'tasks[0].{lastStatus:lastStatus,healthStatus:healthStatus,az:availabilityZone,taskDefinitionArn:taskDefinitionArn}' \
  --output table
```

task 1개 중지:

```bash
aws ecs stop-task \
  --cluster "$CLUSTER" \
  --task "$TASK_TO_STOP" \
  --reason "demo: intentionally stop one dashboard backend task"
```

장애 상태 확인:

```bash
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount,rollout:deployments[0].rolloutState}' \
  --output table
```

Cloud Infra 수집을 기다리지 않고 한 번 당겨오고 싶으면 Fast Collector를 수동 실행한다. 평소에는 1분 주기 EventBridge가 자동 수집한다.

```bash
aws lambda invoke \
  --function-name AEGIS-Lambda-CloudInfraFastCollector \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  /tmp/aegis-cloud-infra-fast.json

cat /tmp/aegis-cloud-infra-fast.json
```

Cloud Infra 페이지에서 새로고침을 누르고 다음 포인트를 촬영한다.

```text
ECS 서비스 실행/목표: 1/2 또는 복구 중 상태
Backend Runtime status: warning
최근 1시간 상태 흐름: warning segment
Slack 알림: ECS running count < desired count 계열 메시지
```

## 복구 확인

ECS service가 새 task를 자동 기동할 때까지 기다린다.

```bash
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE"
```

복구 상태 확인:

```bash
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --query 'services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,rollout:deployments[0].rolloutState}' \
  --output table
```

ALB target health 확인:

```bash
export TARGET_GROUP_ARN=$(
  aws elbv2 describe-target-groups \
    --names kjw-aegis-data-tg-backend \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text
)

aws elbv2 describe-target-health \
  --target-group-arn "$TARGET_GROUP_ARN" \
  --query 'TargetHealthDescriptions[].{target:Target.Id,port:Target.Port,state:TargetHealth.State,reason:TargetHealth.Reason}' \
  --output table
```

API 정상 확인:

```bash
curl -fsS https://api.aegis-pi.cloud/healthz
curl -fsS https://api.aegis-pi.cloud/readyz
```

Cloud Infra 수집을 한 번 더 당겨온다.

```bash
aws lambda invoke \
  --function-name AEGIS-Lambda-CloudInfraFastCollector \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  /tmp/aegis-cloud-infra-fast-recovery.json

cat /tmp/aegis-cloud-infra-fast-recovery.json
```

Cloud Infra 페이지에서 새로고침 후 다음 포인트를 촬영한다.

```text
ECS 서비스 실행/목표: 2/2
ALB healthy target: 2
Backend Runtime status: normal
Overall status: normal 또는 다른 컴포넌트 이슈가 없으면 정상
```

## 예비 시나리오: ECS service 전체 중단

주의: 이 방식은 Dashboard API 자체가 중단될 수 있으므로 Cloud Infra 페이지가 오류를 보일 수 있다. 발표 영상에서는 권장하지 않는다. 강한 장애 컷이 꼭 필요할 때만 짧게 사용한다.

전체 중단:

```bash
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 0
```

상태 확인:

```bash
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}' \
  --output table
```

복구:

```bash
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 2

aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE"
```

최종 확인:

```bash
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount,rollout:deployments[0].rolloutState}' \
  --output table

curl -fsS https://api.aegis-pi.cloud/healthz
curl -fsS https://api.aegis-pi.cloud/readyz
```

## 촬영 체크리스트

- 시작 전 Cloud Infra 정상 상태 촬영
- Terminal에서 task 1개 중지 명령 촬영
- Cloud Infra warning 상태 촬영
- Slack 알림 촬영
- ECS `services-stable` 대기 또는 `running=2` 복구 확인 촬영
- Cloud Infra 정상 상태 촬영
- API `/healthz`, `/readyz` 정상 결과 촬영

## 문제가 생겼을 때

ECS가 2/2로 돌아오지 않으면 현재 이벤트를 확인한다.

```bash
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --query 'services[0].events[0:10].[createdAt,message]' \
  --output table
```

running task 목록을 확인한다.

```bash
aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --desired-status RUNNING \
  --output table
```

최근 중지된 task 이유를 확인한다.

```bash
aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --desired-status STOPPED \
  --query 'taskArns[0:5]' \
  --output text
```

위 명령에서 나온 task ARN을 넣어 확인한다.

```bash
aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks <stopped-task-arn> \
  --query 'tasks[0].{stoppedReason:stoppedReason,stopCode:stopCode,containers:containers[].reason}' \
  --output json
```
