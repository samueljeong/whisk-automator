# 계획: 파이프라인 모드 — 에셋 누적 + 파일명 매칭 수정

## 수정 파일
- `popup/popup.js` (단일 파일)

## 배경 (research_pipeline.md 요약)

### 현재 상태 (d5a8145)
- 5/5 다운로드 **성공** (기능은 작동)
- 파일명이 틀림 (텍스트 매칭이 동일 스타일 프리픽스 때문에 실패)
- 에셋이 프롬프트마다 누적됨 (clearReferences 미호출)

### 4가지 문제
1. **에셋 누적**: Phase 2에서 clearReferences() 안 함 + fillPrompt()이 void 보존
2. **에셋 검색 실패**: "Recently Used" 필터 문제
3. **파일명 매칭 실패**: 그리드 뷰에 텍스트 없음 + 동일 프리픽스
4. **에셋 보정 부작용**: 생성 이미지를 에셋으로 오등록

---

## 구현 단계

### 1단계: Phase 2 — clearReferences() 호출 추가
**위치**: line 3308 (`if (charForThisPrompt)` 전)

```js
// 매 프롬프트 전에 프롬프트 영역 완전 초기화
await clearReferences();
await sleep(500);
```

**그리고** `clearReferences()`를 보강 (line 2622):
- 현재: selectNodeContents → deleteContentBackward (Slate void가 안 지워질 수 있음)
- 변경: **Ctrl+A → Backspace** 키보드 이벤트 방식으로 교체
  - 브라우저 네이티브 Ctrl+A는 void 포함 전체 선택됨
  - Backspace 키 이벤트는 Slate가 직접 처리하므로 void도 삭제

```js
async function clearReferences() {
  var promptEl = findPromptInput();
  promptEl.focus();
  await sleep(100);

  // Ctrl+A (전체 선택) — 브라우저 네이티브
  document.execCommand('selectAll');
  await sleep(100);

  // Backspace 키 이벤트 — Slate가 처리
  promptEl.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Backspace', code: 'Backspace', keyCode: 8,
    bubbles: true, cancelable: true
  }));
  await sleep(200);

  // 확인: 아직 내용이 남아있으면 한 번 더
  if ((promptEl.textContent || '').trim().length > 0 || promptEl.querySelectorAll('img').length > 0) {
    document.execCommand('selectAll');
    await sleep(100);
    promptEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace', code: 'Backspace', keyCode: 8,
      bubbles: true, cancelable: true
    }));
    await sleep(200);
  }

  console.log('[Flow Auto] 레퍼런스 및 프롬프트 초기화');
}
```

**clearReferences 호출 후 fillPrompt()의 동작**:
- 초기화 후에는 `countRefImages()`가 0을 반환
- → `voidsBefore === 0`이므로 "전체 텍스트 선택" 경로 또는 "텍스트 없음" 경로로 진입
- → void 보존 로직이 발동하지 않음 → 문제없음

- [ ] 1-1. clearReferences() 함수 보강 (Ctrl+A + Backspace 방식)
- [ ] 1-2. Phase 2 루프에서 매 프롬프트 전 clearReferences() 호출 추가

### 2단계: Phase 2 — 에셋 보정 코드 간소화
**위치**: line 3313-3333

현재 문제: clickGenerate 직후 `document.querySelectorAll('img')` 전체 스캔이
이전 프롬프트의 완성 이미지를 에셋으로 잘못 등록.

**변경**: uploadReferences 직후의 에셋 등록(line 3313-3319)만 유지하되,
clickGenerate 직후의 에셋 보정(line 3326-3333)은 **제거**.

이유: Phase 3의 200KB 크기 필터가 에셋(~100KB)과 생성 이미지(~500KB+)를 충분히 구분함.
에셋 보정은 오히려 생성 이미지를 에셋으로 잘못 분류해서 다운로드를 못 하게 만듦.

- [ ] 2-1. clickGenerate 직후 에셋 보정 코드 제거 (line 3326-3333)

### 3단계: Phase 3 — 파일명 매칭 개선

**핵심 사실**:
- 스타일 프리픽스가 프롬프트 **뒤**에 있으므로, `originalPrompt` 앞 25자는 장면별 고유 텍스트
- 그러나 그리드 뷰에서는 이미지 DOM에 텍스트가 **없음** (textLen=0)
- 따라서 텍스트 매칭 자체가 그리드 뷰에서는 불가능

**해결**: 제출 순서 기반 매칭 (단순하고 확실)

이유:
- Whisk Flow는 프롬프트를 **제출 순서대로** 카드를 생성함
- 새 이미지가 DOM에 나타나는 순서 = 제출 순서 (빠른 것부터)
- editId 추적은 이전에 시도했으나 불안정 (10초 내 미출현 가능)
- 텍스트 매칭은 그리드 뷰에서 불가능

**변경**: `findPromptForImage()` 호출을 제거하고, 순서 기반 할당으로 교체

```js
// Phase 3: 새 이미지 발견 시
// 순서 기반 매칭: 아직 매칭 안 된 가장 작은 인덱스에 할당
var matchIdx = -1;
for (var fi = 0; fi < totalCount; fi++) {
  if (!matchedPromptIndices.has(fi)) {
    matchIdx = fi;
    break;
  }
}
```

**주의**: "이미지 완성 순서 ≠ 제출 순서"가 문제라면?
- Whisk은 제출 순서대로 카드를 생성하고, 이미지가 완성되면 해당 카드에 삽입
- DOM에서 카드 순서 자체는 제출 순서를 따름
- **하지만** 다른 카드의 이미지가 먼저 완성될 수 있음
- 따라서 **이미지의 DOM 위치(카드 순서)**가 아닌 **출현 시간**으로 매칭하면 순서 뒤섞임 가능

**더 안전한 대안**: 카드 DOM 위치 순서로 매칭
- 이미지의 부모 카드 컨테이너의 DOM 순서 = 제출 순서
- 새 이미지를 발견하면, 해당 이미지가 속한 카드가 전체 카드 리스트에서 몇 번째인지 확인
- 그 순서가 곧 프롬프트 인덱스

```js
// 카드 위치 기반 매칭
var allCards = document.querySelectorAll('그리드 카드 셀렉터');  // 확인 필요
var cardIndex = -1;
var imgCard = newImg.closest('카드 셀렉터');
for (var ci = 0; ci < allCards.length; ci++) {
  if (allCards[ci] === imgCard || allCards[ci].contains(newImg)) {
    cardIndex = ci;
    break;
  }
}
```

→ 이 방법은 카드 셀렉터를 알아야 하는데, 현재 코드에서 확인 불가.
→ **1차로 순서 기반 매칭을 적용하고, 문제가 있으면 카드 위치 기반으로 개선**

- [ ] 3-1. findPromptForImage() 호출 제거, 순서 기반 매칭으로 교체

### 4단계: 5번째 이미지 누락 대응
**위치**: line 3465-3471 (조기 종료 조건)

현재: `downloadedCount >= totalCount - 1`이고 60초 stall이면 종료.
→ 마지막 1개 이미지가 아직 안 나왔는데 조기 종료할 수 있음.

**변경**:
- 모든 이미지가 완료되기 전까지 STALL_TIMEOUT을 120초로 늘림
- `almostDone` 조건 제거 (전체 완료 전에는 조기 종료하지 않음)
- 대신 maxWait가 전체 종료를 보장

```js
// 조기 종료 조건 완화
if (downloadedCount >= totalCount) break;  // 전부 완료되면 즉시 종료
if (Date.now() - lastChangeTime > 120000) {
  // 120초간 아무 변화 없으면 종료
  console.log('[Flow Auto] 120초간 새 이미지 없음 — 종료 (' + downloadedCount + '/' + totalCount + ')');
  break;
}
```

- [ ] 4-1. 조기 종료 조건 완화 (almostDone 제거, stall 120초)

### 5단계: 테스트
- 5개 프롬프트, 에셋 캐릭터 포함
- 확인: (1) 에셋 누적 없음 (2) 5/5 다운로드 (3) 파일명 올바름

- [ ] 5-1. 실행 테스트

---

## 수정하지 않는 것 (의도적 미수정)

- **에셋 검색 실패** ("Recently Used" 필터): 현재 코드에서 검색 실패 시 업로드 폴백이 있음.
  문제가 지속되면 다음 이터레이션에서 해결.
- **selectAssetByName 재시도**: 현재 코드로도 동작하므로 유지.
  1단계(clearReferences)가 핵심 수정이고, 에셋 선택은 기존 로직 유지.

## 위험 요소

1. **clearReferences의 Ctrl+A + Backspace가 Whisk Slate에서 void를 지우는지 미확인**
   - 실패 시: Phase 0 끝의 clearReferences()에서도 같은 문제 → 이미 d5a8145에서 동작 중이므로 어느 정도 작동은 함
   - 대안: `deleteContentBackward` 대신 `deleteSoftLineBackward` 또는 `deleteWordBackward` 시도

2. **순서 기반 매칭이 이미지 완성 순서와 제출 순서 차이로 틀릴 수 있음**
   - 다만 현재 텍스트 매칭도 사실상 순서 매칭 (동일 프리픽스 → 순서대로 배정)
   - 현재보다 나빠지지는 않음
