# 다운로드 안정성 개선 — 리서치

## 문제

100개 이상 이미지를 배치 생성하면, **화면에 보이는 이미지만 다운로드**되고 스크롤 밖 이미지는 누락됨.
CSS zoom 25%로 축소해봤지만 효과 없음.

## 현재 동작 방식 (Phase 3)

### 전체 흐름
```
Phase 2: 프롬프트 100개 순차 제출 (fillPrompt → clickGenerate → 대기)
  ↓
Phase 3: CSS zoom 0.25 설정 → 2초 간격 폴링 → 이미지 감지 → 다운로드
```

### Phase 3 폴링 루프 (popup.js:3442-3558)
```
while (대기시간 < 최대대기 && 다운로드수 < 목표수) {
  1. document.querySelectorAll('img') 전체 탐색
  2. src에 'getMediaUrlRedirect' 포함된 것만 필터
  3. 200KB 이상인 것만 생성 이미지로 인정
  4. findPromptForImage()로 텍스트 매칭 → 파일명 결정
  5. fetch → blob → dataURL → background로 전송 → 다운로드
  6. 120초간 새 이미지 없으면 종료
}
```

### 핵심 감지 조건 (popup.js:3455-3461)
```js
document.querySelectorAll('img').forEach(function(img) {
  if (img.src && img.src.includes('getMediaUrlRedirect') &&
      !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src) &&
      !assetSrcs.has(img.src)) {
    newImages.push(img);
  }
});
```

## 원인 분석

### 1. Flow의 가상 스크롤 (Lazy Rendering)
- Flow는 대량 이미지를 효율적으로 보여주기 위해 **뷰포트 + 버퍼 영역**만 렌더링
- 화면 밖 이미지는 두 가지 중 하나:
  - `<img>` DOM 노드 자체가 없거나 (가상 스크롤)
  - DOM 노드는 있지만 `src`가 아직 `getMediaUrlRedirect` URL로 설정 안 됨 (lazy loading)
- 어느 쪽이든 `querySelectorAll('img')` + `getMediaUrlRedirect` 필터에 잡히지 않음

### 2. CSS zoom이 안 되는 이유
- `document.documentElement.style.zoom = '0.25'`는 **시각적 축소만** 수행
- Flow 내부의 lazy loading 시스템은 **실제 스크롤 위치와 뷰포트 크기**를 기준으로 동작
- CSS zoom은 논리적 뷰포트 크기를 변경하지 않음 → lazy loader가 반응하지 않음
- 결과: 화면에 작게 보이지만 DOM 상태는 동일

### 3. 스크롤 메커니즘 부재
- Phase 3에 **스크롤하는 코드가 전혀 없음**
- 폴링 루프는 현재 뷰포트 기준으로만 탐색
- 생성된 100개 이미지 중 화면에 보이는 ~10개만 감지 가능

## 영향 범위

- `popup.js` — Phase 3 폴링 루프 (3426-3558)
- 기존 downloadBatch(), downloadImage(), findPromptForImage()는 그대로 사용 가능
- background.js — 변경 불필요

## 해결 방향

### 방안 A: 폴링 루프에 자동 스크롤 추가
- 매 폴링 사이클마다 스크롤 컨테이너를 아래로 이동
- 이미지가 뷰포트에 들어오면 Flow가 lazy load → `getMediaUrlRedirect` src 설정
- 감지 → 다운로드 → 다음 스크롤 위치로 이동
- **장점**: 기존 감지/다운로드 로직 재사용, 최소 변경
- **단점**: 스크롤 컨테이너 식별 필요, 스크롤 속도 조절 필요

### 방안 B: 생성 직후 1개씩 다운로드 (Phase 2에서 바로)
- 프롬프트 제출 → 생성 대기 → 즉시 다운로드 → 다음 프롬프트
- 화면에 항상 최신 이미지가 있으므로 감지 실패 없음
- **장점**: 가장 확실, 가상 스크롤 문제 자체가 발생 안 함
- **단점**: 배치 최적화(동시 생성) 불가, 전체 시간 증가 가능

### 방안 C: 스크롤 + 점진적 다운로드 하이브리드
- Phase 2에서 제출만 빠르게 완료
- Phase 3에서 맨 아래(가장 오래된 이미지)부터 위로 스크롤하며 다운로드
- 스크롤 → 이미지 로딩 대기 → 감지 → 다운로드 → 스크롤 반복
- **장점**: 제출 속도 유지 + 안정적 다운로드
- **고려사항**: 스크롤 컨테이너, 스크롤 단위, 로딩 대기 시간 결정 필요

## 추가 확인 필요 사항

1. Flow의 스크롤 컨테이너가 `window`인지 특정 `div`인지
2. 스크롤 시 이미지 로딩에 걸리는 시간 (lazy load 딜레이)
3. Flow가 이미 생성 완료된 이미지를 스크롤 없이도 접근 가능한 API/경로가 있는지
4. 100개 이미지 제출 시 Flow UI의 실제 DOM 구조 (가상 스크롤 vs 전체 렌더링)
