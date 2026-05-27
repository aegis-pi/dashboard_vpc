# Aegis-π · Risk Twin (Vite + React SPA)

원본 인라인 Babel 프로토타입을 **Vite + React SPA**로 마이그레이션한 버전입니다.
화면 설계는 그대로이고, 모듈만 ESM `import / export`로 변환했습니다.

## 실행

```bash
cd vite-app
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 빌드
npm run preview  # 빌드 결과물 로컬 확인
```

## 구조

```
vite-app/
├─ index.html          # Vite 엔트리 (글꼴 link + #root)
├─ vite.config.js
├─ package.json
└─ src/
   ├─ main.jsx         # ReactDOM.createRoot
   ├─ App.jsx          # 라우팅 + Tweaks 패널
   ├─ index.css        # 전역 CSS (원본 <style> 내용)
   ├─ tweaks-panel.jsx # Tweaks 컴포넌트 + useTweaks 훅
   ├─ data.jsx         # FACTORIES, REPORTS, buildHistory, ...
   ├─ icons.jsx        # Icon (lucide-flavored SVGs)
   ├─ charts.jsx       # Sparkline, LineChart, MultiLine, ...
   ├─ shared.jsx       # LevelBadge, DeviceChip, SectionHeader, ...
   ├─ auth.jsx         # LoginGate, NoAccessGate, RoleBadge
   ├─ sidebar.jsx
   ├─ topbar.jsx
   ├─ fleet.jsx        # Fleet Overview
   ├─ factory.jsx      # Factory Detail (shell + Overview tab)
   ├─ factory-history.jsx
   ├─ factory-infra.jsx
   ├─ factory-timeline.jsx
   └─ reports.jsx      # 일간 보고서
```

## 변환 내용

| 원본 (inline Babel)              | Vite SPA                              |
| --------------------------------- | ------------------------------------- |
| `<script type="text/babel" src>` | ES Module `import` 그래프             |
| `window.X = X` 글로벌             | `export { X }`                        |
| `window.X` 참조                   | 명시적 `import { X } from "..."`      |
| `<style>` in index.html          | `src/index.css`                       |
| `unpkg` React/ReactDOM/Babel CDN | `npm` 패키지                          |
| `ReactDOM.createRoot` in app.jsx | `src/main.jsx`로 분리                 |

> `window.showToast`는 **의도적으로 유지**했습니다 — App.jsx가 마운트 시
> `window.showToast`를 정의해서 어느 모듈에서든 `window.showToast?.(...)`로
> 토스트를 띄울 수 있습니다 (소규모 SPA에서는 충분히 합리적인 패턴).
> Context API로 옮기고 싶다면 `App.jsx` + 호출처 몇 군데만 바꾸면 됩니다.

## 다음 단계 권장

- **라우팅**: 현재 `route` state로 단순 분기 — 페이지 수가 늘어나면
  `react-router-dom`을 도입 (`/fleet`, `/factory/:id`, `/reports`).
- **데이터**: mock `FACTORIES` / `buildHistory()`를 실제 API 호출
  (WebSocket + REST fallback)로 교체. `data.jsx`만 손대면 컴포넌트는 그대로.
- **인증**: `LoginGate` 가 mock — Cognito Hosted UI 또는 Amplify Auth로 교체.
- **Tweaks 패널**: 개발 중 디버그용. 프로덕션 빌드에서 빼려면
  `App.jsx`에서 `import.meta.env.DEV` 가드를 추가하세요.
