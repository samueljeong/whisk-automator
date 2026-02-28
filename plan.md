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

#### 시도 9 결과 (부분 성공 → 실패 확정)
- 키보드 ArrowDown+Enter: 네비게이션 차단은 성공 (history 오버라이드)
- BUT ArrowDown이 포커스를 리스트 아이템으로 이동시키지 않음
- `Enter 대상: INPUT (searchInput)` — 항상 searchInput에 머묾
- **근본 원인: `isTrusted: false`** — 브라우저 보안으로 JS 발행 이벤트는 isTrusted=false
  - Radix UI / React가 isTrusted를 체크해서 합성 이벤트 무시
  - 클릭 (simulateRealClick, .click()) 모두 실패한 이유와 동일
  - 키보드 (ArrowDown, Enter) 도 동일하게 실패

#### 시간 최적화 수정
- [x] **ref 카운트 재시도 5→0**: 어차피 isTrusted:false면 기다려도 무의미 (프롬프트당 5초 절약)
- [x] **배치 내 실패 캐시**: 한번 실패한 에셋은 같은 배치에서 재시도 안 함 (프롬프트당 12초 절약)
- [x] **uploadNewAsset 빠른 실패**: 검색바 못 찾으면 즉시 실패 (재귀 selectAssetByName 제거)

#### 다운로드 버그 수정 — 에셋 이미지 오다운로드 방지
- [x] **assetSrcs Set 도입**: 에셋 업로드 전후 이미지 스냅샷 비교 → 새로 나타난 이미지를 assetSrcs에 등록
- [x] **downloadBatch 크기 필터**: fetch blob size < 200KB → 에셋/썸네일로 판정, 스킵
- [x] **모든 이미지 감지 경로에 assetSrcs 필터 적용**: waitForGeneration, downloadBatch, downloadImage, Phase 3 완료 대기
- [x] **이중 방어**: assetSrcs (URL 기반) + blob 크기 필터 (200KB 미만 스킵)

#### 시도 10: ref 카운트 폴링 (타이밍 문제 수정)
- [x] **핵심 발견**: 키보드 Enter가 실제로 에셋을 삽입했었음! (메모리 #11170 확인)
  - ref 카운트를 UI 렌더링 전에 체크해서 0→0 오탐지 → uploadNewAsset 폴백 → 중복 삽입
  - isTrusted:false가 근본 원인이 아니라 **타이밍 문제**였음
- [x] **selectAssetByName 수정**: 1회 즉시 체크 → 500ms 간격 최대 5초 폴링
- [x] **uploadNewAsset 수정**: 동일하게 폴링 방식으로 변경

#### 시도 10 결과 — countRefImages() 근본 결함 확정
- [x] **5초 폴링도 실패**: `countRefImages()`가 Flow의 에셋 레퍼런스를 **구조적으로** 감지 못함
  - `[contenteditable="false"] img`, `[data-slate-void] img` 셀렉터가 Flow 에셋 노드와 불일치
  - 타이밍 문제가 아니라 **셀렉터 자체가 틀림**

#### 시도 11: 검증 제거 + 매 프롬프트 에셋 재선택
- [x] **selectAssetByName**: ref 카운트 검증 완전 제거. 검색 결과 있으면 `return true`
- [x] **uploadedAssetNames Set**: 같은 에셋 2회 이상 업로드 방지 (업로드만 1회 제한)
- [x] ~~selectedAssetChars~~ **제거**: Flow는 생성 후 프롬프트 초기화 → 매 프롬프트마다 에셋 재선택 필요
  - 테스트에서 확인: 프롬프트 3에서 에셋 선택 → 프롬프트 4에서 스킵 → 에셋 미적용
- [x] **프롬프트 간 딜레이 감소**: 2000ms → 500ms (배치 내)
- [x] **preGenSrcs 전체 갱신 제거**: 배치 루프 내 catch-all 갱신이 이전 프롬프트 생성 이미지를 흡수 → Phase 3 감지 방해
  - assetSrcs가 에셋 이미지 필터링 전담, preGenSrcs는 배치 시작 시점 스냅샷만 유지

#### 속도 최적화: characterGroup 배치 제약 제거
- [x] **배치 형성에서 characterGroup 제약 제거**: 캐릭터가 달라도 같은 배치로 묶음
  - 이전: 용아→배치1, 소연→배치2, ... (1개씩 → 각각 생성 대기 30초)
  - 이후: 모든 프롬프트 → 배치1 (일괄 제출 → 한 번만 대기)
- [x] **BATCH_SIZE 4→8**: 더 많은 프롬프트를 한 배치에 수용
- [x] **에셋 선택은 프롬프트별 개별 처리**: 배치 단위가 아닌 프롬프트 단위로 에셋 선택

#### 다운로드 버그 수정 — 파일명 매핑 + 누락 + 진행률 (3차 테스트)

**3가지 버그**:
1. 5개 제출 → 4개만 다운로드 (flow_4 누락)
2. 파일명이 프롬프트와 불일치 (위치 기반 매핑 깨짐)
3. 진행률 UI: 마지막 프롬프트만 'completed', 나머지 'processing' 고정

**수정 계획**:

- [x] **12a. Phase 3에서 감지된 이미지 목록을 downloadBatch에 전달**
  - Phase 3 폴링에서 `newImagesReady` 카운트만 하지 말고, 실제 img 요소 배열을 수집
  - 이 배열을 `downloadBatch`에 직접 전달 → DOM 재탐색 안 함 → 누락 방지

- [x] **12b. 프롬프트별 이미지 추적 (제출-시점 스냅샷)** — 위치순=제출순 전제 유지, Phase 3 이미지 전달로 충분
  - 각 프롬프트 제출(clickGenerate) 직전에 현재 이미지 Set 스냅샷
  - 이 스냅샷을 배열에 저장: `promptSnapshots[j] = { preSubmitSrcs, promptItem }`
  - 다운로드 시: 각 이미지가 어떤 프롬프트 스냅샷 직후에 나타났는지로 매핑

  **하지만 이 방법은 복잡하고, 배치 제출에서 이미지가 프롬프트 완료 전에 다 제출되므로 스냅샷 차이로 구분 불가.**

  **더 단순한 접근**: Flow는 타임라인에 제출 순서대로 카드를 배치. Phase 3에서 감지한 이미지를 위치순으로 정렬하면 = 제출 순서. **핵심은 Phase 3의 이미지 목록을 downloadBatch까지 유지하는 것.**

- [x] **12c. 진행률: 배치 완료 시 모든 프롬프트에 'completed' 전송**
  - 현재: `batchEnd - 1` 프롬프트만 completed
  - 수정: batchStart ~ batchEnd-1 모든 프롬프트에 개별 PROGRESS_UPDATE 전송

**구현 상세**:

```js
// Phase 3: 이미지 수집 (카운트 → 배열)
var detectedNewImages = [];
// ... while 폴링 루프 내 ...
detectedNewImages = [];
document.querySelectorAll('img').forEach(function(img) {
  if (img.src && img.src.includes('getMediaUrlRedirect') &&
      !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src) &&
      !assetSrcs.has(img.src)) {
    detectedNewImages.push(img);
  }
});
// ... 루프 완료 후 ...
// downloadBatch에 전달
await downloadBatch(batchStart, batchEnd, preGenSrcs, detectedNewImages);
```

```js
// downloadBatch: DOM 재탐색 대신 전달받은 이미지 사용
async function downloadBatch(batchStart, batchEnd, preGenSrcs, detectedImages) {
  var candidateImages = detectedImages || [];
  // DOM 재탐색 코드 제거 (또는 detectedImages가 없을 때만 폴백)
  // ... 나머지는 동일 ...
}
```

#### 파일명 매핑 근본 문제 + 부분 실패 처리 (4차 테스트 결과)

**문제**: 5개 제출 → 4개만 생성 (90초 타임아웃). Phase 3에서 4/5로 끝남.
이건 Flow가 5번째 이미지를 생성 안 한 것 — 다운로드 코드 문제 아님.

**파일명 매핑 근본 문제**: 5개 제출 → 4개 생성 시, 어떤 프롬프트의 이미지가 안 생겼는지 모름.
위치순 1~4를 프롬프트 1~4에 매핑하면, 실제로는 프롬프트 3이 누락됐는데 4,5가 3,4 파일명을 받을 수 있음.

**해결 방향**: `[filename:]` 태그 사용 시에도 이 문제 존재. 근본적으로 "이미지-프롬프트 1:1 추적"이 필요.

- [x] **13a. 프롬프트별 개별 생성 추적**: 카드 텍스트 기반 매칭으로 구현
  - Flow는 제출 즉시 타임라인에 새 카드(div) 추가. 이 카드에 로딩 후 img가 나타남.
  - 제출 전/후 DOM diff로 새 카드 찾기 → `promptCards[j] = newCard`
  - 다운로드 시 `promptCards[j]` 내부의 img를 다운로드 → 정확한 프롬프트 매핑

- [x] **13b. 파일명 매핑 근본 수정 — 정렬 제거 + 위치 폴백 신뢰**

  **근본 원인 확정 (5차 테스트)**:
  1. `promptsWithCharacters`가 스타일→캐릭터 그룹 순으로 **정렬됨** (라인 1312-1329)
  2. 텍스트 매칭 0/5 전부 실패 (Flow 카드에 원본 프롬프트 텍스트 없음)
  3. 위치 폴백: DOM 순서(위→아래) ≠ 정렬된 제출 순서

  **수정 방향 — 정렬 제거**:
  - 정렬의 원래 목적: 같은 에셋을 연속 사용하는 프롬프트를 묶어 에셋 전환 비용 최소화
  - 하지만 시도 11에서 매 프롬프트마다 에셋 재선택으로 변경됨 → **정렬의 의미가 없어짐**
  - 정렬을 제거하면 제출 순서 = 원래 프롬프트 순서
  - Flow가 제출 순서대로 피드에 카드를 추가하면 → DOM 위치 = 제출 순서 = 파일명 순서
  - `findPromptForImage` 텍스트 매칭은 유지하되, 위치 폴백이 이제 정확해짐

  ```
  수정: 라인 1312-1329의 sort() 블록 → 제거 (또는 주석 처리)
  ```

  **추가 안전장치**: DOM 위치 방향 확인
  - 제출 순서대로 위→아래인지 아래→위인지 확인 필요
  - 5차 테스트 DL 순서(002,001,003,005,004) vs 정렬 제출 순서(002,003,001,005,004)
  - 불일치 → **Flow가 카드를 위→아래가 아닌 다른 순서로 배치할 수 있음**
  - 정렬 제거 후에도 불일치가 계속되면 → 제출 시점 카드 추적 방식으로 전환

- [ ] **13e. 에셋 사전 준비 — Phase 0에서 일괄 업로드**

  **현재 문제**: 새 프로젝트에서 에셋이 없으면 첫 프롬프트에서 업로드→분석 대기가 필요한데,
  분석 완료 전에 프롬프트 제출이 시작됨

  **사용자 제안 (채택)**:
  ```
  Phase 0: 프롬프트 전체 파싱 → 고유 캐릭터 추출
  Phase 0.5: 에셋 일괄 업로드 + 분석 완료 대기
  Phase 1~: 프롬프트 순차 실행 (에셋은 선택만)
  ```

  **구현 계획**:
  1. `runFlowAutomation` 시작 직후, `promptsWithCharacters`에서 고유 캐릭터 목록 추출
     ```js
     var uniqueChars = new Set();
     promptsWithCharacters.forEach(p => {
       if (p.character) p.character.split(',').forEach(c => uniqueChars.add(c.trim()));
     });
     ```
  2. 각 캐릭터에 대해 `selectAssetByName` 시도 → 실패 시 `uploadNewAsset` 호출
  3. 전부 업로드 완료 후 Phase 2 시작
  4. Phase 2에서는 에셋 선택만 수행 (업로드 불필요, `uploadedAssetNames`에 이미 등록)

  **장점**: 100장+ 이미지에서도 에셋 대기 시간 없음. 중간에 새 캐릭터가 나와도 이미 준비됨.

- [x] **13d. Phase 3 조기 종료 — 진전 없으면 빠르게 마감**
  - 현재: 90초 풀 대기. 4/5 감지 후 50초+ 낭비
  - 수정: "마지막으로 새 이미지가 감지된 시점" 추적 → 20초간 변화 없으면 조기 종료
  ```js
  var lastChangeTime = Date.now();
  var lastDetectedCount = 0;
  // 폴링 루프 내:
  if (detectedNewImages.length > lastDetectedCount) {
    lastDetectedCount = detectedNewImages.length;
    lastChangeTime = Date.now();
  }
  if (Date.now() - lastChangeTime > 20000 && detectedNewImages.length > 0) {
    console.log('[Flow Auto] 20초간 변화 없음 — 조기 종료');
    break;
  }
  ```

- [x] **13c. test_prompts.txt에 [filename:] 태그 추가** — 테스트용

#### 남은 대안 (에셋 삽입이 실패하면)
- [ ] **chrome.debugger API**: `Input.dispatchMouseEvent`로 trusted 이벤트 전송 (permissions 필요)
- [ ] **Slate.js 직접 void 노드 삽입**: 에디터 인스턴스에 접근, void 노드 프로그래매틱 삽입
- [ ] **execCommand/InputEvent paste 시뮬레이션**: 클립보드 경유 이미지 붙여넣기

## 수정하지 않는 것
| 위치 | 이유 |
|------|------|
| navigateToImagine (grok.js) | 미사용 함수 |
| popup.js submitBtn.click() | 확장 팝업 내부 DOM |
| popup.js fileInputs[fi].click() | input[type=file] 네이티브 |
| popup.js a.click() (다운로드) | createElement('a') 네이티브 |
| grok.js links[].click() | `<a download>` 네이티브 |
