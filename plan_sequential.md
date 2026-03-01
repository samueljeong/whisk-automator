# 순차 모드 복원 계획

## 목표
파이프라인 모드(전체 제출 → 전체 대기 → 전체 다운로드)를 **순차 모드**(1개 제출 → 대기 → 다운로드 → 다음)로 변경.
파일명 정확도 100% 보장 (1개씩 처리하므로 매칭 불필요).

## 현재 코드 구조 (줄 3282~3515)

```
Phase 1: preGenSrcs 스냅샷 (전체 기준)
Phase 2: for 루프 — 모든 프롬프트 연속 제출 (생성 대기 없이)
Phase 3: 폴링 + 즉시 다운로드 (FIFO — 실패)
```

## 이미 존재하는 순차용 함수들

- `waitForGeneration()` (줄 2677~2728): 새 이미지 1개 나타날 때까지 폴링 — 그대로 사용 가능
- `downloadImage()` (줄 2730~2849): 1개 이미지 다운로드 — **수정 필요** (blob URL → dataUrl)

## 수정 내용

- [x] **1. Phase 2+3를 순차 루프로 교체** (줄 3282~3466)
  - 현재 코드 전체를 삭제하고, 순차 루프로 대체:
  ```
  for (각 프롬프트) {
    // preGenSrcs 스냅샷 (매번 갱신)
    // 에셋 선택
    // fillPrompt + clickGenerate
    // waitForGeneration()  ← 이미 있는 함수
    // downloadImage()      ← 수정된 함수
  }
  ```
  - Phase 1의 preGenSrcs는 제거 (매 프롬프트마다 개별 스냅샷으로 대체)

- [ ] **2. downloadImage() 다운로드 경로 수정** (줄 2806~2834)
  - `useCustomDir` 분기 제거
  - 항상: blob → FileReader.readAsDataURL() → dataUrl → DOWNLOAD_IMAGE → background
  - blob URL 사용하지 않음 (cross-context 문제 방지)

## 수정하지 않는 것
- Phase 0 (에셋 준비) — 변경 없음
- `waitForGeneration()` — 그대로 사용
- background.js — 변경 없음
- downloadBatch, findPromptForImage — 삭제하지 않음 (미사용 상태로 유지)

## 순차 루프 의사코드

```javascript
var totalCount = promptsWithCharacters.length;

for (var j = 0; j < totalCount; j++) {
  if (isStopRequested()) break;

  var item = promptsWithCharacters[j];

  // 진행 상황 UI
  sendProgress('제출 ' + (j+1) + '/' + totalCount);

  // 생성 전 이미지 스냅샷 (이번 프롬프트 기준)
  var preGenSrcs = new Set();
  document.querySelectorAll('img').forEach(img => {
    if (img.src) preGenSrcs.add(img.src);
  });

  // 에셋 선택 + 에셋 이미지 등록
  if (item.character) {
    await uploadReferences(item.character, characters);
    await sleep(500);
    // 새로 나타난 에셋 이미지 등록
    document.querySelectorAll('img').forEach(img => {
      if (img.src && img.src.includes('getMediaUrlRedirect') && !preGenSrcs.has(img.src)) {
        assetSrcs.add(img.src);
        preGenSrcs.add(img.src);  // 에셋도 preGenSrcs에 포함
      }
    });
  }

  // 프롬프트 입력 + 생성
  await fillPrompt(item.prompt);
  await sleep(500);
  await clickGenerate();

  // 생성 완료 대기
  var generated = await waitForGeneration();  // 기존 함수 그대로
  if (!generated) {
    console.log('생성 실패, 다음으로 넘어감');
    continue;
  }

  // 다운로드 (dataUrl 경로)
  await downloadImage(item.prompt, item.index, item.filename, preGenSrcs);

  // 다음 프롬프트까지 딜레이
  if (j < totalCount - 1) {
    await sleep(Math.max(delayMs, 1000));
  }
}
```

## 리스크
- 느림: 100개 × ~35초 = ~58분 (파이프라인 대비 3~4배)
  - 사무엘님 인지 + "일단 이렇게 돌려놔" 결정
- waitForGeneration의 60초 타임아웃이 부족할 수 있음
  - 기존 함수에 이미 60초 → 충분 (Flow 평균 생성 ~10-30초)
