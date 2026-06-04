# Dashboard UI Quality Reference

상태: candidate
기준일: 2026-06-04

## 목적

이 문서는 Aegis-Pi Dashboard Web을 실제 배포 전 다듬기 위한 UI/UX 기준과 참고 사례를 정리한다.

범위:

- 대상: `apps/dashboard-web/` 운영 React SPA
- 목적: 본사 관제 담당자가 위험 공장, 원인, 데이터 신뢰도, 관리자 작업을 빠르게 판단할 수 있는 화면
- 비목표: Nuxt/Vue로 기술 스택 이전, 마케팅형 랜딩 페이지, 워크스트림 A Admin UI 변경

## 사용 지침

이 문서는 전면 재설계 지시서가 아니다.

현재 `apps/dashboard-web/`는 Fleet pulse, Factory hero, Cloud Infra health strip, Admin Users table/editor 등 운영형 dashboard 구조가 이미 잡혀 있다. 따라서 배포 전 UI 작업은 현재 정보 구조와 시각 톤을 유지하면서, 사용성·반응형·접근성·일관성 리스크를 줄이는 polish pass로 제한한다.

작업 원칙:

- 기존 page 구조, 색상 token, 데이터 계약, 라우트는 유지한다.
- Nuxt Dashboard Template은 구조 참고용이다. Nuxt/Vue 전환이나 컴포넌트 대량 교체 근거로 쓰지 않는다.
- 한 번의 작업에서 P0 항목만 처리한다. P1/P2는 P0 검증 후 별도 작업으로 분리한다.
- 카드, chart, table을 전면 재배치하지 않는다. 단, overflow, focus, label, spacing 문제를 고치는 데 필요한 작은 구조 변경은 허용한다.
- `apps/dashboard-web/src/styles/app.css`의 기존 token과 class를 우선 재사용한다.
- inline style 전체 제거 같은 리팩터링은 금지한다. 반복 문제를 해결하는 데 필요한 최소 class 추출만 허용한다.
- 기능 추가보다 배포 안정성, scan 가능성, keyboard 조작성, mobile/desktop non-overlap을 우선한다.

현재 UI 평가 요약:

| 영역 | 평가 | 처리 방향 |
| --- | --- | --- |
| Fleet | Safety Pulse와 factory card 구조가 좋다. | 재설계 금지. card keyboard 접근성, 좁은 화면 overflow만 보정한다. |
| Factory Detail | Hero, tabs, overview/environment/infrastructure/timeline 분리가 명확하다. | tab/topbar/mobile overflow와 영어/한국어 label 혼재만 최소 보정한다. |
| Cloud Infra | Health strip, component matrix, dependency rail이 운영 관제에 적합하다. | 구조 유지. table/rail의 좁은 화면과 status label 일관성을 확인한다. |
| Reports | 보고서 본문 중심 구조는 적절하다. | export action과 selector row가 작은 화면에서 겹치지 않게 한다. |
| Admin Users | table + editor 2열 구조가 실제 관리 작업에 적합하다. | destructive action, table overflow, form target/focus만 보정한다. |

새 세션에 UI 개선을 요청할 때는 이 문서 전체를 "모두 구현"으로 해석시키지 말고, 아래 P0 범위만 명시한다.

## 참고 사례

| 사례 | 관찰 | Aegis 적용 |
| --- | --- | --- |
| Nuxt Dashboard Template | 여러 페이지, 접이식 sidebar, keyboard shortcuts, light/dark mode, command palette를 제공하는 운영형 dashboard template. Customers 화면은 좌측 navigation, 상단 검색/명령, 주요 action, table 중심 구성이 명확하다. | 구조만 참고한다. `apps/dashboard-web`는 React/Vite 유지. Sidebar 접기/펴기, 아이콘+라벨 navigation, command/search 진입점, table toolbar 패턴을 차용한다. |
| Carbon Dashboard guidance | dashboard는 맥락별로 다르며, 중요한 KPI에 높은 대비와 큰 면적을 부여하고, 불필요한 요소를 제거하며, 색상·간격·legend 위치를 일관되게 유지할 것을 권장한다. | Fleet/Factory/Cloud Infra 첫 화면은 "가장 중요한 상태 → 원인 → 근거" 순서로 재배치한다. 그래프/카드/표 간 spacing과 legend 위치를 고정한다. |
| Carbon Status indicators | 통합 상태는 하위 상태 중 가장 높은 attention 색을 대표로 쓰고, indicator는 색상만이 아니라 label/icon/shape를 함께 사용한다. 5~6개 이상 indicator 남발은 인지 부하를 키운다. | `safe/warning/danger/unknown`은 색상+텍스트+아이콘/점 형태로 표현한다. 상단 status strip은 핵심 4~6개만 남긴다. |
| Material Navigation drawer | navigation drawer는 5개 이상 top-level destination, 여러 단계 hierarchy, 서로 다른 destination 간 빠른 이동에 적합하다. | 현 구조(Fleet, Factory, System, Workspace)는 sidebar가 타당하다. 접힘 상태에서도 현재 위치와 risk/status dot는 유지해야 한다. |
| Baymard dashboard card research | card dashboard는 일관성이 높을 때 scan이 쉽다. card 크기, header, button, image/graphic 사용이 제각각이면 사용자가 navigation pattern을 놓친다. | 카드 header, metric 위치, status badge 위치, action 위치를 페이지별로 통일한다. 장식 이미지나 과한 시각 요소는 쓰지 않는다. |
| WCAG 2.2 | 일반 텍스트 contrast 4.5:1, 큰 텍스트 3:1, 의미 있는 non-text cue 3:1, pointer target 최소 24x24 CSS px, keyboard focus visible이 필요하다. | 버튼/링크/상태칩/차트 선/테이블 border/focus ring을 배포 전 접근성 체크리스트에 포함한다. |

참고 링크:

- Nuxt Dashboard Template: https://github.com/nuxt-ui-templates/dashboard
- Nuxt demo Customers: https://dashboard-template.nuxt.dev/customers
- Carbon dashboards: https://carbondesignsystem.com/data-visualization/dashboards/
- Carbon status indicators: https://v10.carbondesignsystem.com/patterns/status-indicator-pattern/
- Material navigation drawer: https://m2.material.io/components/navigation-drawer
- Baymard card dashboard consistency: https://baymard.com/blog/cards-dashboard-layout
- Baymard icon-based dashboard: https://baymard.com/blog/use-icons-in-the-account-dashboard
- WCAG contrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- WCAG non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- WCAG target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG focus visible: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html

## 적용 원칙

### 1. 정보 위계

관제 화면의 첫 3초 판단 순서:

```text
1. 지금 위험한가?
2. 어느 공장/시스템이 문제인가?
3. 위험 원인은 현장 센서/AI인가, 인프라/데이터 지연인가?
4. 사용자가 지금 할 수 있는 action은 무엇인가?
```

화면별 우선순위:

| 화면 | 1순위 | 2순위 | 3순위 |
| --- | --- | --- | --- |
| Fleet | 위험 공장 순위 | 최근 상태 변화 | 데이터 지연/수집 신뢰도 |
| Factory | 현재 risk와 top causes | sensor/AI/infra 근거 | timeline drill-down |
| Cloud Infra | overall status | backend/datastore/pipeline/freshness matrix | raw detail |
| Reports | 선택한 공장/날짜 보고서 본문 | export action | report freshness |
| Admin Users | active 사용자와 role | factory access | create/edit/delete action |

### 2. Shell / Navigation

권장:

- Desktop: 좌측 sidebar 고정, 상단 topbar 고정.
- Sidebar expanded: 아이콘+라벨+필요한 count/status dot 표시.
- Sidebar collapsed: 아이콘, active 상태, status dot, tooltip 유지.
- Mobile: sidebar는 overlay drawer로 전환하고, main content를 가리지 않게 한다.
- 현재 위치는 sidebar active state와 topbar breadcrumb 둘 다에서 확인 가능해야 한다.
- 주요 navigation item은 5~8개 이하로 유지하고, 섹션명은 `Fleet`, `Factories`, `System`, `Workspace`처럼 기능 묶음 기준으로 유지한다.

반면 교사:

- 접힌 sidebar에서 active page를 알 수 없음.
- 아이콘만 있고 tooltip/accessible label이 없음.
- Fleet/Factory/System이 같은 레벨에 뒤섞여 있어 사용자가 "어디서 무엇을 하는지" 해석해야 함.
- sidebar 접힘 상태가 refresh/route 이동마다 사라짐.

### 3. Card / Panel

권장:

- 같은 역할의 card는 같은 header 위치, metric 위치, status badge 위치, action 위치를 유지한다.
- card는 개별 반복 항목이나 실제로 framing이 필요한 tool에만 사용한다.
- KPI card는 숫자, 단위, 상태, 마지막 갱신 시각을 항상 같은 순서로 둔다.
- card 내부 heading은 compact panel 크기에 맞게 작고 단단하게 둔다.
- 위험 상태 card만 강조하고, 정상 상태 card는 조용한 neutral surface를 쓴다.

반면 교사:

- 모든 section을 card 안에 넣고 또 card를 중첩해 page가 조각나 보임.
- 어떤 card는 버튼, 어떤 card는 텍스트 링크, 어떤 card는 이미지 중심으로 구성되어 scan pattern이 깨짐.
- 정상 metric까지 모두 큰 색상 badge로 표현해 실제 위험 신호가 묻힘.

### 4. Status / Color

권장 token 의미:

| 의미 | 현재 token | 사용처 |
| --- | --- | --- |
| 정상/안정 | `--safe` | safe, normal, healthy |
| 주의 | `--warn` | warning, stale 가능성, threshold 접근 |
| 위험 | `--crit` | danger, failed, unhealthy, 즉시 확인 필요 |
| 알 수 없음 | `--unk` | unknown, unavailable, 데이터 없음 |
| 정보/작업 | `--accent` | primary action, selected control |

규칙:

- 위험/주의/정상 색상은 semantic status에만 사용한다.
- 그래프 series 색상은 status 색상과 분리한다.
- 색상만으로 상태를 전달하지 않는다. 텍스트 label, icon/shape, aria-label을 함께 둔다.
- 통합 상태는 하위 상태 중 가장 높은 severity를 대표로 사용한다.
- 한 화면의 status indicator는 핵심 4~6개로 제한하고 나머지는 detail table로 내린다.

반면 교사:

- brand/accent color를 warning처럼 쓰거나, red를 일반 강조색으로 사용.
- safe/warning/danger가 페이지마다 다른 hue 또는 다른 label로 표현.
- `unknown`을 정상과 비슷한 회색 텍스트만으로 처리해 데이터 신뢰도 문제를 놓치게 함.

### 5. Tables / Lists

권장:

- 운영 table은 dense하지만 행 높이, padding, 정렬을 고정한다.
- 숫자는 우측 정렬 또는 tabular number로 맞춘다.
- status column은 좌측 icon/dot + label을 같은 순서로 둔다.
- column 수가 많은 table은 "핵심 column + row detail"로 분리한다.
- filter/search/sort가 필요한 table은 상단 toolbar에 배치하고, primary action은 우측 상단에 둔다.
- 긴 ID/email/path는 중간 ellipsis를 쓰되 full value tooltip 또는 copy action을 제공한다.

반면 교사:

- 모바일에서 8~10개 column table을 그대로 축소.
- badge와 action button이 행마다 여러 개 있어 row scan이 방해됨.
- table empty/loading/error 상태가 같은 텍스트 스타일이라 사용자가 상태를 구분하기 어려움.

### 6. Controls / Actions

권장:

- 새로고침, export, edit, delete, collapse처럼 의미가 명확한 command는 아이콘 버튼을 우선 사용하고 tooltip을 둔다.
- destructive action은 icon+label, 확인 dialog, 결과 feedback을 모두 둔다.
- refresh interval은 현재처럼 selector로 유지하되, Off/5s/10s/30s/1m label이 page마다 동일해야 한다.
- primary action은 화면당 1개를 원칙으로 한다.
- disabled state에는 이유를 tooltip 또는 helper text로 제공한다.

반면 교사:

- 같은 "새로고침"이 어떤 화면은 텍스트 버튼, 어떤 화면은 아이콘, 어떤 화면은 select 옆 링크로 표시.
- delete와 edit이 같은 색/무게로 보임.
- export action이 보고서 본문보다 시각적으로 더 강함.

### 7. Accessibility / Responsiveness

배포 전 최소 기준:

- 일반 텍스트 contrast 4.5:1 이상.
- 큰 텍스트와 meaningful non-text cue 3:1 이상.
- icon-only button은 `aria-label` 또는 visible tooltip을 가진다.
- keyboard focus ring은 모든 interactive element에서 보인다.
- pointer target은 최소 24x24 CSS px 이상. 주요 toolbar button은 32x32 이상 권장.
- 360px, 768px, 1280px, 1440px viewport에서 텍스트 overlap이 없어야 한다.
- `prefers-reduced-motion` 사용자는 자동 애니메이션/깜빡임을 최소화한다.

반면 교사:

- hover에만 full text/상태를 제공해 keyboard/touch 사용자가 정보를 못 봄.
- focus outline 제거.
- 차트 색상 legend가 색상만 있고 series label이 없음.
- 모바일에서 topbar action이 breadcrumb를 밀어내거나 겹침.

## Aegis-Pi UI 개선 후보

우선순위는 실제 배포 전 polish 기준이다. 기능 추가보다 scan, consistency, accessibility를 먼저 본다.

해석 기준:

- P0: 다음 배포 전 수행 권장. 현재 UI를 유지한 채 작은 범위로 고친다.
- P1: P0 완료 후 화면 캡처 QA에서 문제가 남을 때 수행한다.
- P2: 데모 편의 또는 장기 UX 개선. 배포 전 필수 아님.

| 우선순위 | 항목 | 의도 | 검증 |
| --- | --- | --- | --- |
| P0 | Sidebar collapse/expand | 사용자가 넓은 table/chart 화면을 볼 때 horizontal 공간 확보 | desktop expanded/collapsed, mobile drawer, route 유지 |
| P0 | 상태 표현 통일 | Fleet/Factory/Cloud Infra/Admin의 status badge, dot, label 일관화 | visual review + status token grep |
| P0 | Focus/target/accessibility pass | keyboard와 mobile 조작 가능성 보장 | keyboard tab pass + contrast check |
| P0 | Responsive overflow 보정 | 360/768/1280 viewport에서 sidebar/topbar/table/card 겹침 제거 | 주요 route viewport screenshot |
| P1 | Table toolbar 정리 | Customers demo처럼 search/filter/display/action 영역 고정 | Admin Users, Reports, Cloud Infra detail table 비교 |
| P1 | Card density 정리 | card header/metric/action 위치 통일, 과한 중첩 제거 | Fleet/Factory/Cloud Infra screenshot 비교 |
| P1 | Empty/loading/error state 통일 | 운영 중 API 지연/권한 문제를 혼동 없이 표시 | mocked unavailable/401/empty 상태 |
| P2 | Command/search palette | demo 전환 시 빠른 이동과 keyboard workflow 개선 | `/`, `⌘K` 또는 `Ctrl+K` 접근성 검증 |
| P2 | Dark mode polish | 현재 token 기반 dark theme의 chart/table contrast 보정 | light/dark screenshot 비교 |

## 배포 전 UI QA 체크리스트

- `npm run lint`
- `npm test -- --run`
- `npm run build`
- 주요 route 수동 확인: `/`, `/factory/:id`, `/cloud-infra`, `/reports`, `/admin/users`
- viewport 확인: 360x800, 768x1024, 1280x800, 1440x900
- keyboard 확인: Tab 순서, focus visible, sidebar collapse/expand, modal close, destructive action confirm
- 상태 확인: safe/warning/danger/unknown, loading, empty, error, unauthorized
- text 확인: 한글 label, 긴 factory id/email/path, 날짜/시간, 숫자 단위
- chart 확인: legend, tooltip, axis label, 데이터 없음, 1개 point, 많은 point subsampling

## 결정 메모

- Nuxt Dashboard Template은 UI 구조 참고용이며 기술 스택 변경 근거가 아니다.
- Aegis-Pi는 SaaS landing이 아니라 운영 관제 도구이므로 조용하고 밀도 있는 dashboard UI를 유지한다.
- 현재 색상 token은 유지하되 semantic status와 data visualization 색상은 분리해서 관리한다.
- Sidebar collapse는 채택 후보로 두되, 구현 시 active location, tooltip, keyboard focus, responsive drawer를 함께 완성해야 한다.

## 새 세션 요청 프롬프트

아래 프롬프트는 UI polish 구현 세션에서 그대로 사용한다.

```text
AGENTS.md와 docs/AI_AGENT_HARNESS.md를 먼저 읽고 워크스트림 B 허용 범위만 지켜줘.

목표:
apps/dashboard-web/ 운영 React SPA를 배포 전 UI polish 기준으로 점검하고 P0만 수정해줘.

반드시 참고:
docs/specs/monitoring_dashboard/07_ui_quality_reference.md

중요 제약:
- 전면 재설계 금지.
- 현재 Fleet pulse, Factory hero, Cloud Infra health strip, Reports 본문 중심 구조, Admin Users table/editor 구조는 유지.
- Nuxt Dashboard Template은 구조 참고용일 뿐 Nuxt/Vue 전환이나 컴포넌트 대량 교체 금지.
- 기존 색상 token과 앱 톤 유지.
- inline style 전체 제거 같은 대규모 리팩터링 금지.
- 워크스트림 A 자산은 수정/실행하지 말 것.

수행할 P0:
1. Sidebar collapse/expand 구현
   - desktop expanded/collapsed 모두 active page, status dot, tooltip/aria-label 유지
   - route 이동/refresh 후 상태 유지(localStorage 가능)
   - mobile은 overlay drawer 또는 겹침 없는 대체 레이아웃으로 처리
2. Responsive overflow 보정
   - 360x800, 768x1024, 1280x800, 1440x900에서 주요 route 텍스트/버튼/table/sidebar/topbar 겹침 제거
   - 주요 route: /, /factory/:factoryId, /cloud-infra, /reports, /admin/users
3. Keyboard/accessibility 보정
   - clickable card는 keyboard로 진입/실행 가능하게 수정
   - icon-only button은 aria-label/title 보장
   - focus-visible이 모든 주요 control에서 보이게 유지
   - 주요 pointer target은 최소 24x24, toolbar button은 가능하면 32x32 이상
4. 상태 표현 최소 통일
   - safe/warning/danger/unknown status label, dot, badge가 페이지마다 의미가 다르지 않게 정리
   - 색상만으로 상태를 전달하지 않게 label/aria-label을 보강

검증:
- cd apps/dashboard-web && npm run lint
- cd apps/dashboard-web && npm test -- --run
- cd apps/dashboard-web && npm run build
- 가능하면 dev/preview 서버를 띄워 Playwright 또는 브라우저 screenshot으로 위 viewport와 route를 확인
- 스크린샷 자동화가 불가능하면 그 이유와 수동 확인 포인트를 남겨줘.

완료 보고:
- 변경 파일 요약
- P0 항목별 완료/미완료
- 실행한 검증 명령과 결과
- 남은 P1/P2 후보만 짧게 정리
```
