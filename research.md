# 위스크 자동화 버그 리서치

## [핵심] selectAssetByName 에셋 클릭 버그 — 디버깅 기록

### 증상
에셋 패널에서 검색 결과를 클릭하면 에셋이 프롬프트에 삽입되지 않음.
- 초기: 클릭 시 Flow 메인 화면으로 네비게이션 발생
- 현재: 네비게이션은 막았으나 에셋 선택(ref 삽입)이 안 됨

### DOM 구조 확인 (2026-02-27 디버그 로그)

에셋 검색 결과의 실제 DOM 체인 (styled-components, `<a>` 태그 **없음**):

```
DIV.sc-5bf79b14-15.ekgK 95x24           ← 텍스트 "#soyeon.png"
→ DIV.sc-5bf79b14-10.gmxKpa 607x56      ← 이름 행
→ DIV 607x56                             ← 래퍼
→ DIV.sc-5bf79b14-9.PjOFM 607x112       ← 에셋 카드 (★ 선택 핸들러 위치?)
→ DIV 607x367                            ← 리스트 컨테이너
→ DIV.sc-5bf79b14-8.vnemi 607x367
→ DIV.sc-5bf79b14-7.AgfuU 607x367
→ DIV.sc-5bf79b14-3.kSdphD 607x367
→ DIV.sc-5bf79b14-2.eGqQMF 607x387
→ DIV.sc-5bf79b14-0.burOnI 639x459       ← 패널 전체
→ DIV#radix-:rj:.sc-2c8df0f0-0.bLOspl 639x459  ← Radix UI 모달
→ DIV 639x459
```

**핵심 발견**: `<a>` 태그가 **전혀 없음**. href 제거 접근법은 무의미.

### 시도한 수정과 결과

| # | 시도 | 클릭 대상 | 결과 | 실패 원인 |
|---|------|----------|------|----------|
| 1 | `<a>` 건너뛰고 자식 DIV 클릭 + URL 감지/history.back() | DIV 95x24 | 네비게이션 발생, ref 0→0 | 클릭 이벤트가 부모로 버블링 |
| 2 | 조상 `<a>` href 일시 제거 + preventDefault | DIV 95x24 | 네비게이션 막힘, ref 0→0 | 클릭 대상 너무 작음 (텍스트 라벨) |
| 3 | `<a>` 클릭 대상으로 + href 제거 | DIV 95x24 | 변화 없음 | `<a>` 태그 자체가 없었음 |
| 4 | stopPropagation 추가 | DIV 95x24 | ref 0→0, 업로드 폴백 | stopPropagation이 Flow 핸들러도 차단 |
| 5 | stopPropagation 제거, preventDefault만 | DIV 95x24 | ref 0→0 | 클릭 대상이 여전히 텍스트(95x24) |
| 6 | width 제한 제거, height>60 기준으로 카드(607x112) 클릭 | DIV 607x112 (예상) | ? (미확인) | 사용자 "실패" 보고, 상세 불명 |

### 남은 가설

1. **preventDefault가 Flow 핸들러를 방해**: React의 합성 이벤트 시스템에서 `event.defaultPrevented`를 체크할 수 있음. `preventDefault` 제거 후 테스트 필요.
2. **simulateRealClick의 isTrusted=false**: 디스패치된 이벤트는 `isTrusted: false`. Flow가 이를 체크하면 무시될 수 있음. 해결 불가 (브라우저 보안).
3. **클릭 대상 여전히 잘못됨**: 시도 #6이 제대로 로드되지 않았을 가능성 (사용자가 확장 리로드 안 했을 수 있음).
4. **에셋 패널이 닫혀야 ref가 증가**: 클릭 후 패널이 열린 상태에서 ref 체크하면 0으로 나올 수 있음.
5. **다른 이벤트 타입 필요**: click이 아닌 mousedown/pointerdown에 핸들러가 붙어있을 수 있음.
6. **네이티브 .click() 사용**: Flow가 React가 아닌 Lit/Web Components면 네이티브 .click()이 오히려 동작할 수 있음.

### 다음 시도 계획

**A. preventDefault 제거 테스트**: preventDefault 없이 클릭 → 네비게이션 발생하더라도 ref가 증가하는지 확인
**B. 네이티브 .click() 테스트**: simulateRealClick 대신 element.click() 사용
**C. 에셋 패널 닫기 후 ref 확인**: 클릭→패널닫기(Esc)→ref 체크 순서로 변경
**D. 완전히 다른 접근**: Slate.js 에디터에 직접 레퍼런스 삽입 (클릭 우회)

---

## .click() vs simulateClick() 문제

Grok.com은 React 기반이라 네이티브 `.click()`이 React 이벤트 핸들러를 트리거하지 못함.
올바른 방식은 PointerEvent + MouseEvent 시퀀스를 수동으로 발행하는 것.

### simulateClick 구현 (PointerEvent 포함)

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

---

## grok.js 버그 (완료)

| 위치 | 현재 | 수정 | 상태 |
|------|------|------|------|
| clickGenerateButton (817-829) | setTimeout simulateClick | PointerEvent 동기식 | ✅ |
| uploadImageToGrok (698,708) | .click() | simulateClick (button만) | ✅ |
| dismissPopups (941) | .click() | simulateClick | ✅ |
| clickPageDownloadButton (1273) | .click() | simulateClick | ✅ |
| navigateToImagine | .click() | 수정 안함 (미사용) | — |
| clickPageDownloadButton (1280) | .click() | 유지 (`<a download>`) | — |

## popup.js 버그

| 위치 | 현재 | 수정 | 상태 |
|------|------|------|------|
| dismissPopups (1416,1429,1438,1458) | .click() | simulateRealClick | ✅ |
| selectAssetByName (에셋 클릭) | simulateRealClick | **미해결** | ❌ |
| uploadNewAsset (ref 검증) | return true 고정 | ref 카운트 체크 | ✅ |
