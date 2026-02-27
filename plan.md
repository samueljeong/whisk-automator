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

### 수정 계획

#### Phase 1: uploadNewAsset에 클릭 로직 추가 (핵심)
- [ ] **9a. 업로드 후 에셋 카드 클릭**: 파일 전달 완료 후, 패널에 나타난 에셋 카드를 찾아서 클릭
  - 업로드 완료 대기 (기존 15초 루프)
  - 패널에서 에셋 이름(searchName)으로 텍스트 검색
  - 찾은 카드에 simulateRealClick → 실패 시 .click() 폴백
  - 클릭 후 waitForAnalysisComplete로 ref 삽입 확인
  - **기존 waitForAnalysisComplete 호출 전에 삽입해야 함**

#### Phase 2: 에셋 카드 클릭 자체가 안 될 경우 대안
- [ ] **9b. 업로드 후 검색 전환**: uploadNewAsset 완료 후 selectAssetByName 재호출
  - 업로드로 라이브러리에 추가 → 이제 검색 가능 → selectAssetByName으로 클릭
- [ ] **9c. 키보드 네비게이션**: Tab/Enter로 에셋 선택 (클릭 우회)
- [ ] **9d. Slate.js 직접 삽입**: 에셋 패널 완전 우회, 에디터에 void 노드 직접 주입

## 수정하지 않는 것
| 위치 | 이유 |
|------|------|
| navigateToImagine (grok.js) | 미사용 함수 |
| popup.js submitBtn.click() | 확장 팝업 내부 DOM |
| popup.js fileInputs[fi].click() | input[type=file] 네이티브 |
| popup.js a.click() (다운로드) | createElement('a') 네이티브 |
| grok.js links[].click() | `<a download>` 네이티브 |
