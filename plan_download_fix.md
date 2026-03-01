# 다운로드 복구 계획

## 문제
이번 세션에서 제가 만든 커밋 2개(cfcc9ac, 146d175)가 다운로드를 깨뜨림.

## 수정 방법

- [ ] **popup.js를 e856585 상태로 되돌리기**
  - `git checkout e856585 -- popup/popup.js`
  - e856585 = "다운로드 폴더 논의 직전" 마지막 정상 커밋
  - 이렇게 하면 cfcc9ac(Phase 3 폴링 변경)과 146d175(img.src 변경) 모두 되돌아감

## 되돌려지는 것
1. `downloadBatch`의 다운로드 경로: `img.src` → `dataUrl` (blob→base64 변환 복원)
2. Phase 3 폴링: `detectedNewImages = []` 리셋 → `seenNewSrcs` Set 방식 복원

## 되돌려지지 않는 것
이전 세션에서 만든 변경(다운로드 폴더 관련, 매칭 로직 등)은 e856585에 이미 포함되어 있으므로 유지됨.
