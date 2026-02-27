# 위스크 자동화 버그 리서치

## 핵심 문제: `.click()` vs `simulateClick()`

Grok.com은 React 기반이라 네이티브 `.click()`이 React 이벤트 핸들러를 트리거하지 못함.
올바른 방식은 PointerEvent + MouseEvent 시퀀스를 수동으로 발행하는 것.

### 올바른 simulateClick 구현 (Version 2 — PointerEvent 포함)

```js
function simulateClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  element.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1 }));
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1 }));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));
}
```

이 방식은 `clickUpscaleInMenu()` (line 1022, 1071)에서 이미 사용 중이고 정상 작동 확인됨.

---

## grok.js 버그 목록

### 버그 1: `navigateToImagine()` (미사용 함수이나, 혹시 호출될 경우 대비)

- **Line 596**: `// (미사용) 이전 네비게이션 함수` ← 주석에 미사용 표기됨
- Line 608: `link.click()` → React 사이드바 링크
- Line 657: `el.click()` → "만들기" 버튼
- Line 666: `el.click()` → "만들기" 부분일치 폴백
- **판단**: 미사용 함수 — 수정 불필요 (죽은 코드)

### 버그 2: `uploadImageToGrok()` — `.click()` (line 698, 708)

- Line 698: `attachBtn.click()` → 이미지 첨부 버튼
- Line 708: `btn.click()` → 폴백 첨부 버튼
- **하지만**: 이 함수는 직접적 UI 버튼 클릭이 아니라 `input[type="file"]` 트리거 목적
  - `data-grok-upload` 속성을 설정한 후, 파일 선택 다이얼로그를 열기 위해 클릭
  - `input[type="file"]`의 `.click()`은 네이티브 파일 다이얼로그를 여는 것이므로 React 이벤트와 무관
  - 하지만 `button[aria-label*="attach"]`가 React 버튼이면 `.click()`이 안 될 수 있음
- **판단**: 첨부 버튼(button)은 simulateClick으로, input[type="file"]은 .click()으로 유지

### 버그 3: `dismissPopups()` — `.click()` (line 941)

- Line 941: `btn.click()` → 방해 팝업 닫기 버튼
- React 렌더링된 팝업이면 `.click()`이 작동 안 할 수 있음
- **판단**: simulateClick으로 교체

### 버그 4: `clickGenerateButton()` — 불안정한 simulateClick (line 817-829)

- setTimeout으로 mouseup/click을 지연 발행하지만 비동기적으로 반환됨
- 함수가 반환된 시점에 아직 click이 안 발생했을 수 있음
- PointerEvent 미포함 (React가 pointerdown을 사용할 수 있음)
- **판단**: Version 2 (동기식 PointerEvent 포함)로 교체

### 버그 5: `clickPageDownloadButton()` — `.click()` (line 1273, 1280)

- Line 1273: `btn.click()` → 다운로드 버튼 (React UI)
- Line 1280: `links[links.length - 1].click()` → `<a download>` 링크
- **판단**:
  - button은 simulateClick으로 교체
  - `<a download>` 링크의 `.click()`은 파일 다운로드 트리거이므로 **유지** (네이티브 동작)

### 버그 6: `simulateClick()` 중복 정의

- Version 1 (line 817): clickGenerateButton 내부 — setTimeout 사용, 불안정
- Version 2 (line 1022, 1071): clickUpscaleInMenu 내부 — PointerEvent, 안정적
- **판단**: 모두 Version 2로 통일

---

## popup.js 버그 목록

### `dismissPopups()` (line 1410-1462) — `.click()` 사용

popup.js의 dismissPopups는 `executeScript`로 Flow 탭에 주입되는 함수.
Flow(labs.google.com)는 Google의 자체 웹 컴포넌트 기반이지만, 일부 React 사용 가능.

- Line 1416: `el.click()` — 오버레이/백드롭 클릭
- Line 1429: `btn.click()` — 닫기 버튼(X)
- Line 1438: `el.click()` — 거절 버튼
- Line 1458: `closeBtn.click()` — 피드백 팝업 닫기

**popup.js Line 1478-1489에 이미 `simulateRealClick()`이 정의되어 있음.**
`dismissPopups()`보다 뒤에 정의되어 있지만, 같은 executeScript 블록 내이므로 호이스팅으로 접근 가능 (function 선언이므로).

**판단**: `.click()` → `simulateRealClick()` 교체

### 수정 불필요 항목

- Line 146: `submitBtn.click()` — 팝업 UI의 라이선스 키 입력 (로컬 DOM, React 아님)
- Line 2196: `fileInputs[fi].click()` — Flow 탭의 input[type="file"] (네이티브 파일 다이얼로그)
- Line 3157: `a.click()` — 다운로드 링크 (`document.createElement('a')` + `a.download` — 네이티브 다운로드)

---

## 요약

| 파일 | 위치 | 현재 | 수정 | 이유 |
|------|------|------|------|------|
| grok.js | navigateToImagine (608,657,666) | .click() | 수정 안함 | 미사용 함수 |
| grok.js | uploadImageToGrok (698,708) | .click() | simulateClick | React 첨부 버튼 |
| grok.js | dismissPopups (941) | .click() | simulateClick | React 팝업 |
| grok.js | clickGenerateButton (817-829) | setTimeout simulateClick | PointerEvent 동기식 | 비동기 race condition |
| grok.js | clickPageDownloadButton (1273) | .click() | simulateClick | React 다운로드 버튼 |
| grok.js | clickPageDownloadButton (1280) | .click() | 유지 | `<a download>` 네이티브 |
| grok.js | simulateClick 중복 (817 vs 1022,1071) | 2개 버전 | Version 2 통일 | 일관성 |
| popup.js | dismissPopups (1416,1429,1438,1458) | .click() | simulateRealClick | React 호환 |
