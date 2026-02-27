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

- [ ] **5. `dismissPopups()` (line 1410-1462)**: `.click()` 4곳 → `simulateRealClick()` 교체
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

## 주의사항
- grok.js의 각 executeScript 블록은 독립 실행되므로, simulateClick 헬퍼를 사용하는 **각 블록 내부에 별도 정의** 필요 (클로저 공유 불가)
- 이미 simulateClick이 정의된 블록 (clickUpscaleInMenu)은 변경하지 않음
