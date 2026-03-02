# 파이프라인 속도 개선 계획

## 목표
순차 모드(1개씩) → 파이프라인(전체 제출 → 텍스트 매칭 다운로드)로 전환.
40장 기준: 30~40분 → 15~20분 목표.

## 핵심 아이디어
1. 프롬프트를 **전부 연속 제출** (생성 완료를 기다리지 않음)
2. 이미지가 생성될 때마다 **텍스트 매칭으로 해당 프롬프트를 찾아** 올바른 파일명으로 다운로드
3. Flow 카드에 프롬프트 텍스트가 표시됨 → 스크린샷으로 확인 완료

## 기존 코드 활용
- `findPromptForImage()` (줄 2898~2965) — 이미 구현됨!
  - 이미지의 부모 DOM을 20단계까지 올라가며 textContent에서 프롬프트 검색
  - `originalPrompt` 첫 80자로 substring 매칭
  - 가장 긴 매칭 우선
- `downloadBatch()` (줄 2970~3129) — 텍스트 매칭 + 위치 폴백 로직 있음

## 수정 내용

- [ ] **1. 순차 루프를 파이프라인으로 교체** (줄 3263~3370)

  현재:
  ```
  for (각 프롬프트) {
    제출 → waitForGeneration() → downloadImage()  // 1개씩
  }
  ```

  변경:
  ```
  // Phase 2: 전체 프롬프트 연속 제출
  for (각 프롬프트) {
    에셋 선택 → fillPrompt → clickGenerate → sleep(딜레이)
  }

  // Phase 3: 폴링 + 텍스트 매칭 다운로드
  while (다운로드 < 총 개수) {
    새 이미지 감지 → findPromptForImage()로 매칭 → 다운로드
  }
  ```

- [ ] **2. Phase 3 즉시 다운로드에 텍스트 매칭 통합**
  - 새 이미지 감지 시 → `findPromptForImage()`로 어떤 프롬프트의 결과인지 확인
  - 매칭 성공 → 해당 프롬프트의 filename으로 다운로드
  - 매칭 실패 → 폴링 계속 (텍스트가 아직 렌더링 안 됐을 수 있음)
  - 3회 연속 매칭 실패 → 미매칭 프롬프트 중 위치 폴백

- [ ] **3. 다운로드 경로는 dataUrl 유지**
  - blob → dataUrl → DOWNLOAD_IMAGE (순차 모드에서 검증 완료)

- [ ] **4. 매칭 실패 폴백**
  - 텍스트 매칭 실패 시 → 위치 기반 폴백 (기존 downloadBatch 로직)
  - 최종 폴백: 남은 미매칭 이미지 + 미다운로드 프롬프트를 순서대로 배정

## 의사코드

```javascript
// Phase 2: 전체 프롬프트 연속 제출
var preGenSrcs = new Set();
document.querySelectorAll('img').forEach(img => { if (img.src) preGenSrcs.add(img.src); });

for (var j = 0; j < totalCount; j++) {
  if (isStopRequested()) return;

  var item = promptsWithCharacters[j];

  // 에셋 선택 (필요 시)
  if (item.character) {
    await uploadReferences(item.character, characters);
    await sleep(500);
    // 새 에셋 이미지 등록
    document.querySelectorAll('img').forEach(img => {
      if (img.src && img.src.includes('getMediaUrlRedirect') && !preGenSrcs.has(img.src)) {
        assetSrcs.add(img.src);
        preGenSrcs.add(img.src);
      }
    });
  }

  await fillPrompt(item.prompt);
  await sleep(500);
  await clickGenerate();

  // 에셋 보정
  document.querySelectorAll('img').forEach(img => {
    if (img.src && img.src.includes('getMediaUrlRedirect') &&
        !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src) && !assetSrcs.has(img.src)) {
      assetSrcs.add(img.src);
    }
  });

  if (j < totalCount - 1) await sleep(Math.max(delayMs, 3000));
}

// Phase 3: 폴링 + 텍스트 매칭 즉시 다운로드
var downloadedCount = 0;
var matchedPromptIndices = new Set();  // 이미 매칭된 프롬프트 인덱스
var unmatchedRetries = {};  // 이미지 src → 매칭 시도 횟수
var pollInterval = 2000;
var maxWait = Math.min(totalCount * 60000, 600000);
var waited = 0;
var lastChangeTime = Date.now();

while (waited < maxWait && downloadedCount < totalCount) {
  if (isStopRequested()) return;

  await sleep(pollInterval);
  waited += pollInterval;

  // 새 이미지 탐색
  var newImages = [];
  document.querySelectorAll('img').forEach(img => {
    if (img.src && img.src.includes('getMediaUrlRedirect') &&
        !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src) && !assetSrcs.has(img.src)) {
      newImages.push(img);
    }
  });

  for (var ni = 0; ni < newImages.length; ni++) {
    var newImg = newImages[ni];

    // 크기 필터
    var imgResp = await fetch(newImg.src);
    var imgBlob = await imgResp.blob();
    if (imgBlob.size < MIN_GENERATED_IMAGE_SIZE) {
      assetSrcs.add(newImg.src);
      continue;
    }

    // 텍스트 매칭
    var matchIdx = findPromptForImage(newImg, promptsWithCharacters, matchedPromptIndices);

    if (matchIdx < 0) {
      // 매칭 실패 — 나중에 재시도 (텍스트 아직 렌더링 안 됐을 수 있음)
      unmatchedRetries[newImg.src] = (unmatchedRetries[newImg.src] || 0) + 1;
      if (unmatchedRetries[newImg.src] >= 3) {
        // 3회 실패 → 위치 폴백 (남은 프롬프트 중 첫 번째)
        for (var fi = 0; fi < totalCount; fi++) {
          if (!matchedPromptIndices.has(fi)) { matchIdx = fi; break; }
        }
      }
      if (matchIdx < 0) continue;  // 다음 폴링에서 재시도
    }

    // 매칭 성공 → 다운로드
    var pItem = promptsWithCharacters[matchIdx];
    matchedPromptIndices.add(matchIdx);

    // 파일명 결정 + dataUrl 변환 + 다운로드
    // ... (순차 모드와 동일한 로직)

    downloadedSrcs.add(newImg.src);
    downloadedCount++;
    lastChangeTime = Date.now();
  }

  // 조기 종료
  if (downloadedCount >= Math.max(1, totalCount - 1) && Date.now() - lastChangeTime > 60000) break;
}
```

## 속도 예상
```
현재 (순차): 40 × 50초 = 33분
파이프라인:
  제출: 40 × 4초 = 160초 (2.7분)
  대기: 마지막 이미지 생성까지 ~60초 (1분)
  다운로드: 40 × 1초 = 40초 (겹침)
  총: ~5~8분 (이론적)
  현실적: 10~15분 (에셋 전환, 딜레이 감안)
```

## 리스크
| 리스크 | 대응 |
|--------|------|
| 텍스트 매칭 실패 (DOM에 프롬프트 안 보임) | 위치 폴백 + 재시도 |
| 프롬프트가 비슷해서 오매칭 | 80자까지 비교 (충분히 고유) |
| Flow가 동시 생성 제한 | 서버 측 제한이므로 딜레이 조정 |
| 에셋 전환 시 시간 추가 | 같은 에셋끼리 이미 그룹핑됨 |

## 수정하지 않는 것
- Phase 0 (에셋 준비) — 변경 없음
- background.js — 변경 없음
- findPromptForImage() — 기존 함수 그대로 사용
- 순차 모드 함수들 (waitForGeneration, downloadImage) — 삭제 안 함 (폴백용)
