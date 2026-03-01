# 다운로드 수정 계획

## 목표
이미지가 생성될 때마다 **즉시 1개씩** 올바른 파일명으로 다운로드.

## 수정 내용

- [x] **1. Phase 3 폴링 루프에 즉시 다운로드 추가**
  - 위치: `runFlowAutomation` 내 Phase 3 while 루프 (줄 3370~3422)
  - 변경: 새 이미지 감지 시 → 즉시 fetch → blob → dataUrl → `DOWNLOAD_IMAGE`
  - 프롬프트 매칭: `downloadedCount` 카운터로 FIFO 추적
    - N번째 다운로드 = `promptsWithCharacters[N]`의 파일명
  - 크기 필터 유지: 200KB 미만 = 에셋/썸네일 → 스킵 (downloadedCount 증가 안 함)

- [x] **2. Phase 4 제거**
  - 위치: 줄 3431~3436
  - `downloadBatch()` 호출 제거 (Phase 3에서 이미 다운로드 완료)
  - `downloadBatch` 함수 자체는 남겨둠 (폴백용)

- [x] **3. 다운로드 경로 통일**
  - `useCustomDir` 분기 제거
  - 항상: blob → FileReader → dataUrl → `DOWNLOAD_IMAGE` → background → `chrome.downloads`
  - blob URL (cross-context 문제) 사용하지 않음

- [ ] **4. 불필요한 코드 정리**
  - `findPromptForImage` — 사용하지 않지만 삭제는 보류 (나중에 필요할 수 있음)
  - 위치 정렬 코드 — downloadBatch 안에 남겨둠 (함수 자체를 폴백으로 유지)

## 수정하지 않는 것
- Phase 0 (에셋 준비), Phase 2 (프롬프트 제출) — 변경 없음
- loadState, startAutomation의 customDirHandle 로직 — 이번엔 안 건드림
- UI (resetLocationBtn, openFolderBtn 등) — 이번엔 안 건드림

## Phase 3 수정 후 코드 구조 (의사코드)
```
var downloadedCount = 0;  // FIFO 카운터

while (waited < maxWait && downloadedCount < totalCount) {
  await sleep(pollInterval);

  // DOM에서 새 이미지 탐색
  새 이미지들 = querySelectorAll('img') 중 preGenSrcs/downloadedSrcs/assetSrcs에 없는 것

  for (각 새 이미지) {
    // 크기 필터
    blob = await fetch(이미지.src).blob()
    if (blob.size < 200KB) { assetSrcs에 등록; continue; }

    // FIFO 매칭: downloadedCount번째 프롬프트
    pItem = promptsWithCharacters[downloadedCount]
    filename = pItem.filename || 자동생성

    // dataUrl 변환 → 다운로드
    dataUrl = await blob→dataUrl 변환
    chrome.runtime.sendMessage({ action: 'DOWNLOAD_IMAGE', url: dataUrl, filename })

    downloadedSrcs.add(이미지.src)
    downloadedCount++

    // 진행 상황 업데이트
  }

  // 조기 종료: N-1개 이상 완료 + 60초 정체
}
```

## 리스크
- FIFO 가정이 틀릴 경우 (Flow가 제출 순서와 다른 순서로 생성) → 파일명 불일치
  - 대안: 처음에 FIFO로 가고, 문제 생기면 텍스트 매칭 폴백 추가
- 크기 필터(200KB)가 일부 생성 이미지를 에셋으로 오분류할 수 있음
  - 대안: 임계값 조정
