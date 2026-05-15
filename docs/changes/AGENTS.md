# docs/changes/ AGENTS.md

> 초기 계획과 실제 구현/운영 기준이 달라진 결정을 추적 (mini-ADR). 도구 중립.
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 운영 문서는 "현재 기준"을 설명하고, 본 디렉터리는 "왜 계획이 바뀌었는지"와 "남긴 영향"을 설명한다
- 단순 오탈자/표현 보정은 기록 대상이 아니다

## 기록 대상

- 장애 테스트·운영 안정성·보안·비용·데이터 보존 정책에 영향을 주는 변경
- 아키텍처/배포 흐름의 방향 전환
- 도구 또는 책임 경계 변경

## 현재 파일 (예시)

- `0001-ai-snapshot-pvc-to-hostpath.md`
- `0002-failback-cron-instead-of-k8s-cronjob.md`
- `0003-nfs-cold-storage-deferred.md`
- `0004-safe-edge-config-github-gitops.md`

## 파일 형식

```
ID:        0NNN
제목:      kebab-case 요약
상태:      proposed / accepted / superseded
결정일:    YYYY-MM-DD
영향 범위: M번호, 컴포넌트, 운영 항목

기존 계획
변경된 실제 기준
변경 이유
영향
업데이트 필요한 문서
검증
```

## 작성 규칙

- ID는 `0001`부터 0-padded 4자리. 신규 추가 시 직전 ID + 1
- 한 결정 = 한 파일. 여러 결정을 묶지 않는다
- SSH 비밀번호 / token / certificate private key 같은 민감 정보 금지
- 변경이 확정되면 운영/계획/아키텍처 문서를 함께 갱신 후 본 문서에 `업데이트 필요한 문서`로 명시
- supersede되면 새 파일을 추가하고 이전 파일은 `상태: superseded` 갱신

## 인덱스

- `README.md`의 `목록` 표를 함께 갱신 (ID·제목·상태·결정일·영향 범위)
