# 위스크 자동화 .click() 버그 수정 계획

## 배경
Grok.com(React)과 Flow(Google)에서 네이티브 `.click()`이 이벤트 핸들러를 트리거하지 못하는 버그.
이미 정상 작동하는 `simulateClick()` (PointerEvent 포함)과 `simulateRealClick()`이 있으나 일부 함수에서 미사용.

## 수정 대상

### grok.js (4곳)

- [x] **1. `clickGenerateButton()` (line 817-829)**: 불안정한 simulateClick을 PointerEvent 동기식으로 교체
  - setTimeout + mouseover 방식 → pointerdown/mousedown/pointerup/mouseup/click 동기식
  - 이미 같은 파일의 clickUpscaleInMenu (line 1022)에서 올바른 버전 사용 중

- [x] **2. `uploadImageToGrok()` (line 696-711)**: button 요소에 대해서만 simulateClick 적용
  - `input[type="file"]`의 `.click()`은 네이티브 파일 다이얼로그 → 유지
  - React 버튼(`button[aria-label*="attach"]` 등)에만 simulateClick 적용
  - 함수 시작부에 simulateClick 헬퍼 추가 필요

- [x] **3. `dismissPopups()` (line 941)**: `.click()` → simulateClick
  - 함수 내부에 simulateClick 헬퍼 추가 필요

- [x] **4. `clickPageDownloadButton()` (line 1273)**: 버튼만 simulateClick, `<a>` 링크는 유지
  - 함수 내부에 simulateClick 헬퍼 추가 필요

### popup.js (1곳)

- [x] **5. `dismissPopups()` (line 1410-1462)**: `.click()` 4곳 → `simulateRealClick()` 교체
  - Line 1416: 오버레이 클릭 → `simulateRealClick(el)`
  - Line 1429: 닫기 버튼 → `simulateRealClick(btn)`
  - Line 1438: 거절 버튼 → `simulateRealClick(el)`
  - Line 1458: 피드백 닫기 → `simulateRealClick(closeBtn)`
  - `simulateRealClick`은 line 1478에 function 선언으로 정의 → 호이스팅되어 접근 가능

## 수정하지 않는 것 (이유)

| 위치 | 이유 |
|------|------|
| navigateToImagine (line 596-682) | 주석에 "(미사용)" 명시 — 죽은 코드 |
| popup.js line 146 `submitBtn.click()` | 확장 팝업 내부 DOM (React 아님) |
| popup.js line 2196 `fileInputs[fi].click()` | `input[type="file"]` 네이티브 다이얼로그 |
| popup.js line 3157 `a.click()` | `createElement('a')` + `.download` 네이티브 다운로드 |
| grok.js line 1280 `links[].click()` | `<a download>` 링크 네이티브 다운로드 |

### popup.js — selectAssetByName 에셋 클릭 시 페이지 이동 버그 (핵심)

- [x] **6. (실패) 에셋 카드 클릭 — `<a>` 태그 회피 + 1회 클릭 방식**
  - 부모 탐색에서 `<a>` 건너뛰기 → 자식 클릭해도 이벤트가 부모 `<a>`로 버블링되어 네비게이션 발생
  - URL 감지 + history.back() → 이미 이동 후 복구라 느리고 불안정

- [ ] **7. (재수정) 에셋 카드 클릭 — 조상 `<a>` 태그 href 일시 제거 방식**
  - **근본 원인**: 클릭 이벤트가 `bubbles: true`로 발생 → 조상 `<a href="...">` 태그까지 버블링 → 브라우저 기본 네비게이션 동작
  - **해결**: 클릭 전 조상 `<a>` 태그의 href를 일시적으로 제거, 클릭 후 복원
  - 구현:
    1. clickTarget의 조상 중 모든 `<a>` 태그를 탐색
    2. href가 있는 `<a>`의 href를 data-saved-href에 백업, href 제거
    3. simulateRealClick 실행
    4. 즉시 href 복원 (원래대로)
  - 추가로 click 이벤트에 캡처링 단계에서 preventDefault 리스너 설치 → 클릭 후 제거

## 주의사항
- grok.js의 각 executeScript 블록은 독립 실행되므로, simulateClick 헬퍼를 사용하는 **각 블록 내부에 별도 정의** 필요 (클로저 공유 불가)
- 이미 simulateClick이 정의된 블록 (clickUpscaleInMenu)은 변경하지 않음
