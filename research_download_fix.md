# 다운로드 깨짐 리서치 (v2)

## 기준점
- **성공 시점**: 261765b (3/1 23:24) — 사무엘님 "11시쯤 성공"
- **현재**: 7e00388 (방금 revert 커밋)
- **차이**: 410줄 (20개 커밋 분량)

## 261765b → 현재(7e00388) 변경 목록

### A. 다운로드 폴더 관련 (UI/설정)
1. **loadState()** — File System Access API 복원 로직 제거, `customDirHandle = null` 강제
2. **startAutomation()** — 커스텀 폴더 권한 재확인 제거, `customDirHandle = null` 강제
3. **savePath** — `.trim()` → `.replace(/^📁\s*/, '').trim()` (이모지 prefix 제거)
4. **resetLocationBtn** — `showDirectoryPicker()` → `prompt()` (텍스트 입력)
5. **openFolderBtn** — customDirHandle 분기 제거, 직접 `OPEN_FOLDER` 메시지
6. **resetToDefaultBtn / updateCustomDirUI** — 전체 제거, hidden=true 고정

### B. downloadBatch 핵심 로직 변경
7. **위치 정렬 제거** — `candidateImages.sort()` (아래→위) 삭제
8. **매칭 로직 전면 교체** — 텍스트매칭+위치폴백 → FIFO 출현순서
9. **다운로드 경로 변경** — `useCustomDir` 분기(SAVE_IMAGE_DATA/blobUrl) → 무조건 dataUrl+DOWNLOAD_IMAGE
   - 이건 정상 동작 (방금 revert한 img.src 문제와 별개)

### C. Phase 3 폴링 변경
10. **출현 순서 추적** — `detectedNewImages = []` 리셋 → `seenNewSrcs` Set 누적
    - 이전: 매 사이클 전체 재스캔 (항상 최신 DOM)
    - 현재: 한번 push한 img 요소를 배열에 유지 (stale 참조 가능성)

### D. SAVE_IMAGE_DATA 핸들러
11. **savePath 이모지 제거** 추가 — `.replace(/^📁\s*/, '')`

## 다운로드가 깨진 핵심 원인

### 확정: 146d175 (이미 revert 완료)
- `blob → dataUrl` → `img.src` 변경이 다운로드를 완전히 깨뜨림

### 미확정: 다운로드 경로 변경 (B.9)
이전(성공):
```
useCustomDir=true → dataUrl → SAVE_IMAGE_DATA → customDirHandle.write()
```
현재:
```
useCustomDir 분기 없음 → dataUrl → DOWNLOAD_IMAGE → background → chrome.downloads
```
dataUrl → chrome.downloads는 동작해야 하지만, **테스트 미완료**.

### 미확정: 매칭 로직 변경 (B.7, B.8)
이전: 텍스트매칭 + 위치 정렬 + 위치 폴백
현재: FIFO 출현 순서만
→ 다운로드 자체는 되지만, **파일명이 안 맞을 수 있음** (이전에도 문제 있었음)

## 테스트 필요 사항
1. 현재 상태(7e00388)에서 다운로드가 되는지 먼저 확인
2. 되면 → 파일명이 맞는지 확인
3. 안 되면 → 261765b로 완전 복귀 후 하나씩 변경 적용
