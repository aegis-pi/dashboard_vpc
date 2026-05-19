# Architecture Docs

이 디렉터리는 현재 구조와 목표 구조를 설명하는 아키텍처 문서를 둔다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `00_current_architecture.md` | 현재 구축된 `factory-a` Safe-Edge 로컬 기준선 |
| `01_target_architecture.md` | AWS Hub, Dashboard VPC, 멀티 Spoke 목표 구조 (Phase 1 통합 반영) |
| `02_cloud_expansion_drawio_guide.md` | 클라우드 확장 구조를 draw.io 다이어그램으로 작성하기 위한 가이드 |
| `drawio/03_re6_workstream_b_enhanced.drawio` | **현재 source of truth** — Phase 1 통합 시각화 (ADR 0012~0017) |
| `drawio/04_re7_data_dashboard_vpc_image_overview.drawio` / `images/04_re7_data_dashboard_vpc_image_overview.jpg` | 발표·보고용 이미지 기반 overview |
| `drawio/04_re7_line_legend*.drawio` / `images/04_re7_line_legend*.jpg` | 04_re7 선 의미표 |
| `drawio/02_re5_two_vpc_target.drawio` | pre-Phase 1 historical reference |
| `drawio/01_re4.drawio` | pre-2VPC 단일 VPC historical reference |

## 기준

- 현재 동작 중인 구조와 후속 목표 구조를 섞지 않는다.
- 실제 구현 상태가 바뀌면 `00_current_architecture.md`를 먼저 갱신한다.
