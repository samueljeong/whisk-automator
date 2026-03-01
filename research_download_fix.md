# 다운로드 문제 리서치 (v3 — 261765b 복귀 후)

## 현재 상태: 261765b (3/1 23:24)
사무엘님이 "11시쯤 성공했다"고 한 시점이지만, 테스트 결과 2가지 문제 확인:
1. **다운로드를 한번에 함** (이미지 하나 생성될 때마다 즉시 다운로드하지 않음)
2. **파일명이 안 맞음** (이미지와 프롬프트 매칭 실패)

---

## 문제 1: "다운로드를 한번에 한다"

### 코드 흐름 (줄 번호 기준)
```
Phase 2 (줄 3300~3350): 프롬프트 N개 연속 제출
  ↓
Phase 3 (줄 3360~3422): 모든 이미지 생성 완료까지 폴링 대기
  - detectedNewImages에 수집만 하고 다운로드는 안 함
  ↓
Phase 4 (줄 3431~3436): downloadBatch() 호출 — 한번에 전체 다운로드
```

**원인**: Phase 3에서 이미지 감지 시 다운로드를 안 하고, Phase 4에서 전체를 한꺼번에 다운로드.
**plan_pipeline.md의 의도**: Phase 3-1에서 "새 이미지 감지 → 즉시 다운로드"가 목표였음.

### 해결 방향
Phase 3 폴링 루프 안에서 새 이미지가 감지될 때마다 즉시 1개씩 다운로드.
별도 Phase 4 불필요.

---

## 문제 2: "파일명이 안 맞는다"

### 현재 매칭 로직 (downloadBatch, 줄 2989~3140)

**Step 1: 위치 정렬** (줄 3008~3015)
```js
candidateImages.sort(function(a, b) {
  return br.top - ar.top; // 아래→위
});
```
"Flow는 최신 생성물을 위에 표시"라는 가정으로 아래→위 정렬.
→ **이 가정이 맞는지 미확인. 틀리면 순서가 완전히 뒤집힘.**

**Step 2: 텍스트 매칭** (줄 3043~3062, findPromptForImage 호출)
- 이미지의 부모 DOM을 올라가면서 textContent에서 프롬프트 텍스트 검색
- Flow의 파이프라인 모드에서는 제출한 프롬프트 텍스트가 카드 안에 남아있지 않을 수 있음
- → 텍스트 매칭 실패 → -1 반환

**Step 3: 위치 폴백** (줄 3064~3076)
- 텍스트 매칭 실패한 이미지를 남은 프롬프트에 순서대로 배정
- Step 1의 위치 정렬이 틀리면 → 폴백도 틀린 순서로 배정

### 근본 원인
1. **위치 정렬 가정이 불확실** — Flow의 레이아웃이 실제로 아래=먼저인지 확인 필요
2. **텍스트 매칭이 파이프라인 모드에서 작동 안 함** — 여러 프롬프트를 연속 제출하면 Flow가 이전 카드의 텍스트를 덮어쓸 수 있음
3. **위치 폴백이 유일한 매칭 방법** — 정렬이 틀리면 전부 틀림

### 해결 방향
이미지가 1개 나타날 때마다 즉시 다운로드하면 매칭 문제 자체가 사라짐.
- 프롬프트를 FIFO로 제출
- 이미지가 나타나는 순서 = 제출 순서 (FIFO)
- N번째 나타난 이미지 = N번째 프롬프트의 결과
- 복잡한 매칭 불필요

---

## 문제 3: useCustomDir=false 시 다운로드 경로

### 현재 코드 (줄 3117~3136)
```js
if (useCustomDir) {
  // dataUrl → SAVE_IMAGE_DATA → popup → customDirHandle.write() ✅ 동작
} else {
  // blobUrl → DOWNLOAD_IMAGE → background → chrome.downloads ❌ 실패 가능
}
```

### useCustomDir 결정 흐름
1. `startAutomation()` (줄 1381~1398): `customDirHandle` 복원 시도
2. `requestPermission()` — 사이드패널에서 호출하면 user gesture 없이 실패 가능
3. 실패하면 `customDirHandle = null` → `useCustomDir = false`
4. `useCustomDir=false` 경로: `URL.createObjectURL(blob)` → blob URL
5. **blob URL은 content script(ISOLATED)에서 생성 → background에서 접근 불가**

### 해결 방향
`useCustomDir` 분기를 없애고, 항상 `dataUrl` → `DOWNLOAD_IMAGE` 경로 사용.
(이전 세션에서 이미 이 방향으로 변경했었는데 img.src로 잘못 바꿔서 깨진 것)

---

## 종합 해결 방향

**핵심 변경: Phase 3에서 이미지 감지 즉시 1개씩 다운로드**

이렇게 하면 3가지 문제가 모두 해결됨:
1. ✅ "한번에 다운로드" → 이미지 나타나는 대로 즉시 다운로드
2. ✅ "파일명 불일치" → FIFO 순서 매칭 (복잡한 텍스트/위치 매칭 불필요)
3. ✅ 다운로드 경로 → dataUrl + DOWNLOAD_IMAGE (blob URL 문제 해소)

Phase 4 (downloadBatch) → 제거하거나 미사용
findPromptForImage → 제거하거나 미사용
위치 정렬 → 불필요
