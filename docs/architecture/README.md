# Architecture Docs

이 디렉터리는 현재 구조와 목표 구조를 설명하는 아키텍처 문서를 둔다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_current_architecture.md` | 현재 구축된 `factory-a` Safe-Edge 로컬 기준선 |
| `01_target_architecture.md` | AWS Hub, Dashboard VPC, 멀티 Spoke 목표 구조 (Phase 1 통합 반영) |
| `02_cloud_expansion_drawio_guide.md` | 클라우드 확장 구조를 draw.io 다이어그램으로 작성하기 위한 가이드 |
| `drawio/agiespi_architecture_overview_final1.drawio` / `images/agiespi_architecture_overview_final3.drawio.png` | **현재 source of truth** — data/dashboard end-to-end 단일 overview (ADR 0032, Phase 1 Step 0~10 반영) |

> 세대별 다이어그램 `01_re4` / `02_re5` / `03_re6` / `04_re7`은 단일 overview로 통합되어 제거됨 (ADR 0032). 통합 내역·근거 ADR 매핑은 ADR 0032 참고.

## 기준

- 현재 동작 중인 구조와 후속 목표 구조를 섞지 않는다.
- 실제 구현 상태가 바뀌면 `00_current_architecture.md`를 먼저 갱신한다.
- 다이어그램 변경 시 overview drawio 원본과 PNG export를 함께 갱신·커밋한다 (아키텍처 CLAUDE.md / ADR 0032).
