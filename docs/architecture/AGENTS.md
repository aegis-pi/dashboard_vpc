# docs/architecture/ AGENTS.md

> 현재 구조와 목표 구조 아키텍처 문서 (도구 중립).
> 기준일: 2026-05-15 / 언어: 한국어 (개조식)

## 역할

- 현재 구축된 `factory-a` Safe-Edge 로컬 구조와 후속 AWS Hub / 멀티 Spoke 목표 구조를 명확히 분리해 설명한다

## 파일

| 파일 | 내용 | 상태 |
| --- | --- | --- |
| `00_current_architecture.md` | 현재 동작 중인 factory-a 로컬 기준선 + rebuild 가능한 Hub 기준선 | source of truth |
| `01_target_architecture.md` | AWS Hub / Dashboard VPC / 멀티 Spoke 목표 구조 | draft (보조) |
| `02_cloud_expansion_drawio_guide.md` | 클라우드 확장 구조 draw.io 작성 가이드 | — |

## 작성 규칙

- 현재 동작 중인 구조와 후속 목표 구조를 한 단락에 섞지 않는다
- 실제 구현 상태가 바뀌면 `00_current_architecture.md`를 먼저 갱신
- 최신 클라우드 리소스 배치/VPC 명명은 `../planning/15_cloud_architecture_final.md`를 source of truth로 인용
- 다이어그램 변경 시 draw.io 원본과 이미지 export를 함께 커밋

## 진입 순서

1. `00_current_architecture.md` — 지금 실제로 무엇이 동작하는지
2. `../planning/15_cloud_architecture_final.md` — 확정된 클라우드 방향
3. `01_target_architecture.md` — 확장 보조 설명
4. `02_cloud_expansion_drawio_guide.md` — 다이어그램 작업 가이드

## 참조

- 최종 클라우드 결정: `../planning/15_cloud_architecture_final.md`
- 2 VPC MVP 결정: `../planning/12_two_vpc_mvp_architecture_decision.md`
- ADR 후보: `../planning/13_architecture_adr_backlog.md`
