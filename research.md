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

### 시도 #7, #8 추가 (2026-02-27 심야)

| # | 시도 | 결과 | 실패 원인 |
|---|------|------|----------|
| 7 | preventDefault 완전 제거 | 메인화면으로 네비게이션, ref 0→0 | 네비게이션 차단 없이 페이지 이동 |
| 8 | history.pushState/replaceState 오버라이드 + .click() 폴백 | 검색 결과 없음 → uploadNewAsset 폴백 | 에셋이 라이브러리에 없어서 검색 자체 실패 |

### 영상 분석 핵심 발견 (2026-02-27 녹화 분석)

**Frame 4-5**: `#soyeon` 검색 → "일치하는 결과 없음" 표시 → `selectAssetByName`이 클릭 로직까지 도달 못함
**Frame 7**: `uploadNewAsset` 폴백 실행 → 파일 인터셉터가 `#soyeon.png` 전달 성공
**Frame 11**: 에셋 패널에 `#soyeon.png` 카드가 썸네일과 함께 표시됨 (업로드 성공!)
**Frame 16-34**: `분석 대기 중... (5초/20초/35초/50초), void: 0/0` — ref 카운트가 영원히 0
**Frame 36**: `분석 타임아웃 (60초)` → `업로드 후 레퍼런스 증가 없음 (ref: 0 → 0)` → `에셋 업로드 실패, 스킵`
**Frame 38**: 레퍼런스 없이 프롬프트 텍스트만 입력 후 생성 진행

### 근본 원인 확정

**Flow의 에셋 삽입 메커니즘**: 에셋을 업로드하면 **라이브러리에만 추가**됨. 프롬프트에 레퍼런스로 삽입하려면 **에셋 카드를 클릭**해야 함.

현재 `uploadNewAsset`의 치명적 결함:
1. 파일 업로드 → 성공 (패널에 에셋 카드 표시됨)
2. `waitForAnalysisComplete()` 호출 → **ref 카운트 증가를 수동적으로 기다림**
3. 하지만 **에셋 카드를 클릭하지 않으므로** ref가 절대 증가하지 않음
4. 60초 후 타임아웃 → 실패

**두 함수의 관계**:
- `selectAssetByName`: 에셋이 이미 라이브러리에 있을 때 → 검색 → 카드 클릭 (클릭 자체도 미해결)
- `uploadNewAsset`: 에셋이 없을 때 → 업로드 → **클릭 없이 대기** → 실패

### 영상 2차 분석 (2026-02-27 23:06 녹화) — selectAssetByName 경로

이번엔 `#yonga`가 라이브러리에 **존재**해서 selectAssetByName의 클릭 로직까지 도달:

```
에셋 발견: "#yonga.png" → 클릭 대상: DIV.sc-3128f8f-0 bTtjRP 458x250 at(24,108)
에셋 카드 클릭 시작 (SPA 네비게이션 차단)
simulateRealClick 실패 (ref: 0), 네이티브 .click() 시도
에셋 클릭 완료, 패널 닫기
에셋 "#yonga" 삽입 결과, ref: 0 → 0
⚠ 에셋 "#yonga" 삽입 실패 — 레퍼런스 증가 없음
페이지 이동 감지, history.back() 복귀
```

**확정된 사실**:
1. 에셋 검색/발견은 정상 동작 (458x250 카드 정확히 찾음)
2. `simulateRealClick()` → ref 삽입 안 됨
3. 네이티브 `.click()` → ref 삽입 안 됨
4. 두 방법 모두 페이지 이동만 발생 (SPA 네비게이션 차단 실패 or location 변경)
5. history.pushState 오버라이드가 네비게이션을 막지 못함

### DOM 구조 비교

| 시기 | 클래스 패턴 | 카드 크기 | 텍스트 라벨 |
|------|-----------|----------|-----------|
| 이전 | sc-5bf79b14-* | 607x112 | 95x24 |
| 현재 | sc-6e2527b8-*, sc-3128f8f-* | 458x250 | 62x16 |

styled-components 해시가 다름 → Flow UI가 업데이트됐거나 다른 패널 상태

### 결론: 클릭 방식으로는 불가능

**8회 시도 + 2가지 클릭 방법 모두 실패**. 에셋 카드 클릭이 JavaScript로는 레퍼런스 삽입을 트리거하지 못함.

가능한 원인:
- `isTrusted: false` 체크 (브라우저 보안, 해결 불가)
- React/Lit 이벤트 시스템이 합성 이벤트 무시
- 클릭 핸들러가 특정 이벤트 속성(pointerId, pressure 등) 검증

### 남은 대안 (클릭 우회)

1. **키보드 네비게이션**: 검색 후 ArrowDown + Enter로 선택 (가장 간단)
2. **Drag & Drop**: 카드에서 프롬프트 영역으로 드래그 이벤트 시뮬레이션
3. **Slate.js 직접 삽입**: 프롬프트 에디터의 Slate 인스턴스에 접근, void 노드 프로그래매틱 삽입
4. **chrome.debugger API**: `Input.dispatchMouseEvent`로 trusted 이벤트 전송 (권한 필요)

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
