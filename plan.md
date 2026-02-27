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

## 미해결: selectAssetByName 에셋 클릭

### 시도 기록 (6회 실패)

1. `<a>` 태그 건너뛰기 + URL 감지 → 실패 (버블링으로 네비게이션)
2. 조상 `<a>` href 제거 + preventDefault → 실패 (클릭 대상 95x24 너무 작음)
3. `<a>` 자체를 클릭 대상으로 → 실패 (`<a>` 태그 자체가 없었음!)
4. stopPropagation 추가 → 실패 (Flow 핸들러까지 차단)
5. stopPropagation 제거 → 실패 (클릭 대상 여전히 95x24)
6. width 제한 제거, height>60 기준 → 실패 (상세 미확인)

### 확인된 사실
- DOM에 `<a>` 태그 **없음** — 전부 styled-components DIV
- 에셋 카드 크기: `DIV.sc-5bf79b14-9.PjOFM 607x112`
- 텍스트 라벨: `DIV.sc-5bf79b14-15.ekgK 95x24`
- Radix UI 기반 모달 (`#radix-:rj:`)
- `simulateRealClick`은 다른 Flow 요소(Ingredient 버튼 등)에서는 정상 작동

### 다음 시도 — preventDefault 제거 테스트
- [ ] **7. preventDefault 완전 제거**: React가 `event.defaultPrevented` 체크 시 핸들러 무시 가능
  - preventDefault 없이 607x112 카드에 simulateRealClick
  - 네비게이션 발생 시 history.back()으로 복구
  - ref가 증가했는지 확인 (네비게이션 전에 삽입됐을 수 있음)

### 대안 접근법 (클릭 계속 실패 시)
- [ ] **A. 네이티브 .click()**: simulateRealClick 대신 element.click() 사용
- [ ] **B. Slate.js 직접 삽입**: 에셋 패널 우회, 프롬프트 에디터에 직접 레퍼런스 주입
- [ ] **C. 업로드 폴백 강화**: selectAssetByName 포기, uploadNewAsset 안정화

## 수정하지 않는 것
| 위치 | 이유 |
|------|------|
| navigateToImagine (grok.js) | 미사용 함수 |
| popup.js submitBtn.click() | 확장 팝업 내부 DOM |
| popup.js fileInputs[fi].click() | input[type=file] 네이티브 |
| popup.js a.click() (다운로드) | createElement('a') 네이티브 |
| grok.js links[].click() | `<a download>` 네이티브 |
