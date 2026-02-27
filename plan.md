# 위스크 자동화 버그 수정 계획

## 완료된 수정

### grok.js (4곳) — 모두 완료
- [x] **1. clickGenerateButton**: setTimeout simulateClick → PointerEvent 동기식
- [x] **2. uploadImageToGrok**: .click() → simulateClick (button만, input[type=file]은 유지)
- [x] **3. dismissPopups**: .click() → simulateClick
- [x] **4. clickPageDownloadButton**: .click() → simulateClick (button만, `<a download>` 유지)

### popup.js — 부분 완료
- [x] **5. dismissPopups**: .click() 4곳 → simulateRealClick()
- [x] **6. uploadNewAsset**: return true 고정 → ref 카운트 검증 추가

## 미해결: 에셋 레퍼런스 삽입

### 시도 기록 (8회 실패)

1. `<a>` 태그 건너뛰기 + URL 감지 → 실패 (버블링으로 네비게이션)
2. 조상 `<a>` href 제거 + preventDefault → 실패 (클릭 대상 95x24 너무 작음)
3. `<a>` 자체를 클릭 대상으로 → 실패 (`<a>` 태그 자체가 없었음!)
4. stopPropagation 추가 → 실패 (Flow 핸들러까지 차단)
5. stopPropagation 제거 → 실패 (클릭 대상 여전히 95x24)
6. width 제한 제거, height>60 기준 → 실패 (상세 미확인)
7. preventDefault 완전 제거 → 실패 (네비게이션 발생, ref 0→0)
8. history.pushState 오버라이드 + .click() 폴백 → 검색 결과 없음 → uploadNewAsset 폴백 → ref 0→0 (60초 타임아웃)

### 근본 원인 (영상 분석으로 확정)

**문제 1 — uploadNewAsset**: 파일 업로드 성공 후 에셋 카드가 패널에 나타나지만, **카드를 클릭하지 않아서** 프롬프트에 레퍼런스로 삽입 안 됨. `waitForAnalysisComplete()`이 ref 증가를 수동적으로 기다리지만, 클릭 없이는 ref가 절대 증가하지 않음.

**문제 2 — selectAssetByName**: 에셋이 라이브러리에 없으면 검색 결과 0 → 클릭 로직 미도달. 에셋이 있어도 simulateRealClick/click() 모두 ref 삽입 실패.

### 수정 계획 — 클릭 우회 접근 (simulateRealClick + .click() 모두 실패 확정)

#### 시도 9: 키보드 네비게이션 (사용자 수동 테스트로 동작 확인!)

**selectAssetByName 수정** (라인 1949-2158):

변경 범위: **라인 2002~2129** (검색 결과 클릭 로직)을 키보드 네비게이션으로 교체

- [x] **9a. 클릭 로직 제거**: 라인 2002-2129의 DOM 탐색/simulateRealClick/.click()/SPA차단 전부 삭제
- [x] **9b. 키보드 선택 로직 삽입**: 검색바(searchInput)에서 직접 키보드 이벤트 발행
  ```
  수정 흐름:
  1. 검색바에 charName 입력 (기존 유지, 라인 1989-2000)
  2. "일치하는 결과 없음" 텍스트 존재 확인 → 있으면 return false
  3. ArrowDown 키 이벤트 → 첫 번째 검색 결과 포커스
  4. Enter 키 이벤트 → 선택 확정
  5. sleep(500) 대기
  6. Esc로 패널 닫기 (기존 유지, 라인 2141-2146)
  7. ref 카운트 증가 확인 (기존 유지, 라인 2148-2157)
  ```
- [x] **9c. KeyboardEvent 발행 방식**: searchInput에 직접 dispatch
  ```js
  searchInput.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true
  }));
  await sleep(200);
  searchInput.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
  }));
  ```

**uploadNewAsset 수정** (라인 2162-2311):

- [x] **9d. 업로드 후 selectAssetByName 재호출**:
  - 파일 업로드 완료(라인 2277) 후 패널 닫기
  - `selectAssetByName(searchName)` 호출 (키보드 방식으로 수정된 버전)
  - 이미 라이브러리에 추가됐으므로 검색→키보드 선택 가능
  - 기존 `waitForAnalysisComplete` (라인 2295) 제거 또는 selectAssetByName 성공 시 스킵

#### 시도 9 결과 (부분 성공)
- 키보드 ArrowDown+Enter로 에셋 선택은 **성공** (영상에서 프롬프트에 레퍼런스 이미지 확인)
- Enter 키가 에셋 선택과 동시에 SPA 네비게이션을 트리거 → 페이지 이동
- 네비게이션으로 DOM 파괴 → ref 카운트 0→0으로 나옴

#### 시도 9-fix: Enter 키 네비게이션 차단
- [x] **9e. history.pushState/replaceState 임시 오버라이드**: Enter 발행 전 차단, 완료 후 복원
- [x] **9f. popstate/beforeunload 이벤트 차단**: 캡처 페이즈에서 차단
- [x] **9g. 'navigated' 반환값 제거**: false로 교체, uploadReferences의 history.back() 로직 정리
- [x] **9h. 패널 닫기 후 대기 시간 증가**: 1000ms → 1500ms (DOM 업데이트 시간 확보)

#### 시도 10 이후 (9-fix 실패 시 대안)
- [ ] **10. Drag & Drop 시뮬레이션**
- [ ] **11. Slate.js 직접 void 노드 삽입**

## 수정하지 않는 것
| 위치 | 이유 |
|------|------|
| navigateToImagine (grok.js) | 미사용 함수 |
| popup.js submitBtn.click() | 확장 팝업 내부 DOM |
| popup.js fileInputs[fi].click() | input[type=file] 네이티브 |
| popup.js a.click() (다운로드) | createElement('a') 네이티브 |
| grok.js links[].click() | `<a download>` 네이티브 |
