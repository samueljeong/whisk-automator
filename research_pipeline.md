# 리서치: 파이프라인 모드 전체 분석

## 1. 현재 구조 (d5a8145)

### 흐름
```
Phase 0: 에셋 사전 준비 (고유 캐릭터별 1회)
  → selectAssetByName() 또는 uploadNewAsset()
  → Phase 0 끝에 clearReferences() 1회 호출
  → assetSrcs에 Phase 0 중 나타난 이미지 등록

Phase 2: 프롬프트 연속 제출 (j=0~4)
  → uploadReferences(charForThisPrompt)  ← clearReferences 없음!
  → 에셋 이미지 등록 (assetSrcs에 새 이미지 전부 추가)
  → fillPrompt(item.prompt)  ← void 노드(레퍼런스) 보존!
  → clickGenerate()
  → 에셋 보정 (clickGenerate 직후 새 이미지 전부 assetSrcs에)
  → sleep(3초+)

Phase 3: 폴링 + 텍스트 매칭 다운로드
  → 2초마다 새 img 탐색
  → findPromptForImage() → prompt/originalPrompt 앞 80/50/30자 매칭
  → 3회 실패 시 위치 폴백
```

## 2. 문제 1: 에셋(레퍼런스) 누적

### 원인
Phase 2 루프에서 `clearReferences()` 호출이 없다.

- 프롬프트 1: uploadReferences("소연") → 소연 1개 삽입
- 프롬프트 2: uploadReferences("소연,용아") → 기존 소연 + 새로 소연,용아 = 3개
- 프롬프트 3: uploadReferences("노황,소연") → 기존 3개 + 새로 2개 = 5개

**Whisk에서 에셋은 Slate 에디터 안의 ingredient로 삽입된다.**
`selectAssetByName()`이 "+" 버튼 → 검색 → Enter로 에셋을 **추가**한다.
기존 에셋을 제거하지 않으므로 누적된다.

### clearReferences()의 한계
```js
async function clearReferences() {
  var promptEl = findPromptInput();
  promptEl.focus();
  range.selectNodeContents(promptEl);
  promptEl.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward', ...
  }));
}
```

**핵심 주석 (line 2306)**:
> `countRefImages()는 Flow의 에셋 레퍼런스를 감지하지 못하므로 검증 생략`

이 말은: **Flow에서 에셋은 Slate void 노드와 다른 방식으로 관리될 수 있다.**
`countRefImages()`가 감지 못하는 에셋이라면, `clearReferences()`의 selectAll+delete도 못 지울 가능성.

### Whisk 에셋 시스템 추가 정보
- line 1580 주석: "Flow는 생성 후 프롬프트를 초기화하므로 매번 에셋 재선택 필요"
- 이게 사실이라면 clickGenerate() 후 Whisk이 프롬프트를 리셋한다
- **하지만 영상에서 에셋이 누적되므로**, 리셋이 안 되거나 타이밍이 맞지 않음
- 파이프라인 모드는 clickGenerate() 후 3초만 대기하고 바로 다음 프롬프트로 넘어감
  → 리셋 시간이 부족할 수 있음

### fillPrompt()의 레퍼런스 보존 (line 1750-1762)
```js
if (slateTexts.length > 0 && voidsBefore > 0) {
  // 레퍼런스가 있는 경우: 텍스트만 선택 (void 노드 제외)
  console.log('[Flow Auto] 텍스트만 선택 (void ' + voidsBefore + '개 보존)');
}
```
fillPrompt()은 **일부러** 기존 void 노드(레퍼런스)를 보존한다.
clearReferences() 없이 fillPrompt()만 호출하면 이전 에셋이 보존된 채 새 텍스트만 교체.

## 3. 문제 2: 에셋 검색 실패 ("일치하는 결과 없음")

### 영상 확인
- frame 15, 60: 에셋 패널이 열렸는데 "일치하는 결과 없음"
- 에셋 패널 상단에 **"Recently Used"** 드롭다운이 선택되어 있음

### 코드 (selectAssetByName, line 2164)
```
1. "+" 클릭 → 800ms 대기
2. 검색바에 이름 입력 → 1000ms 대기
3. "일치하는 결과 없음" 체크
4. 없으면 Escape → false 리턴
```

### uploadReferences에서의 처리 (line 2596-2612)
```js
if (!selected) {
  if (uploadedAssetNames.has(searchName)) {
    console.log('이미 업로드됨 — 재업로드 스킵');
    // ← 에셋이 프롬프트에 삽입되지 않은 채 넘어감!
  }
}
```
Phase 0에서 이미 업로드한 에셋이 Phase 2 검색에서 안 찾아지면,
에셋 삽입 없이 넘어간다.

## 4. 문제 3: 파일명 매칭 실패

### findPromptForImage() (line 2898-2972)
```
이미지 → 부모를 20단계까지 올라감
→ textContent에서 prompt/originalPrompt 앞 80/50/30자 포함 여부 확인
→ bestMatch를 찾으면 리턴
→ textContent > 10,000자면 중단
```

### 핵심 사실 (research_editid.md에서 확인)
> **갤러리 그리드 뷰: 이미지 DOM에 텍스트 없음 (textLen=0 at all depths)**

그리드 뷰에서는 텍스트 매칭이 원천적으로 불가능.
**상세(리스트) 뷰에서는 텍스트가 보인다** (영상 확인).

### 스타일 프리픽스 위치
이전 세션에서 스타일을 프롬프트 **뒤**로 이동함.
→ `originalPrompt` 앞부분은 각 프롬프트마다 고유한 장면 설명.
→ 상세 뷰에서 텍스트가 보이면 앞 25자 매칭으로 구분 가능.

## 5. 문제 4: 에셋 보정 코드의 부작용

### Phase 2의 에셋 보정 (line 3326-3333)
```js
// 에셋 보정: clickGenerate 직후
document.querySelectorAll('img').forEach(function(img) {
  if (...!preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src) && !assetSrcs.has(img.src)) {
    assetSrcs.add(img.src);
  }
});
```

**문제**: clickGenerate 직후 **모든** 새 이미지를 에셋으로 등록.
이전 프롬프트의 완성 이미지가 이 시점에 DOM에 나타나면 에셋으로 오등록.
→ Phase 3에서 다운로드 대상에서 제외됨.

### Phase 2의 에셋 등록 (line 3313-3320)
```js
// uploadReferences 직후
document.querySelectorAll('img').forEach(function(img) {
  if (img.src.includes('getMediaUrlRedirect') && !preGenSrcs.has(img.src)) {
    assetSrcs.add(img.src);
    preGenSrcs.add(img.src);
  }
});
```
같은 문제. 빠르게 완성된 이전 프롬프트의 이미지를 에셋으로 잘못 잡을 수 있다.

## 6. 확인이 필요한 것들

1. **clickGenerate() 후 Whisk이 프롬프트를 리셋하는 타이밍/범위**
   - 즉시? 1초 후? 생성 완료 후?
   - 텍스트만? 에셋도?
   → 디버그 스크립트로 확인 필요

2. **clearReferences()가 에셋을 실제로 지우는가?**
   - void 노드로 감지되는지?
   - deleteContentBackward가 void를 포함해서 지우는지?
   → 디버그 스크립트로 확인 필요

3. **에셋 패널의 "Recently Used" 필터**
   - "All"로 전환 가능한지?
   → 디버그 스크립트 또는 직접 확인

4. **상세 뷰의 DOM 구조**
   - 프롬프트 텍스트의 정확한 위치
   → debug_detail_view.md 스크립트로 확인

## 7. 해결 방향 (아이디어, 구현 전)

### 에셋 누적 방지 (3가지 옵션)
A. Phase 2에서 매번 clearReferences() → 실패 가능성 있음
B. clickGenerate() 후 Whisk 자동 리셋을 기다림 → 타이밍 확인 필요
C. fillPrompt()에서 레퍼런스 보존 대신 전체 교체 → 순서가 문제 (에셋 먼저, 텍스트 나중)

### 에셋 검색 실패 방지
- selectAssetByName() 실패 시 재시도 (최대 2회)
- "Recently Used" 필터를 "All"로 전환

### 파일명 매칭
- 상세 뷰로 전환 후 텍스트 매칭
- 또는 edit 링크 기반 매칭 (안정성 확인 필요)

### 에셋 보정 제거
- Phase 2의 에셋 보정 코드 제거
- Phase 3의 크기 필터 (200KB)로 충분
