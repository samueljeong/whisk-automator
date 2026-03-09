# Grok 이미지→영상 변환 누락 버그 수정

## 문제
Grok 실제 플로우: 이미지+프롬프트 제출 → **이미지 생성** → `/imagine/post/xxx` 이동 → **"동영상 만들기" 클릭** → 영상 생성
자동화 코드: 제출 후 바로 `waitForVideo()` → 영상이 안 만들어졌으니 타임아웃

## 수정 (grok.js 1개 파일)

- [x] **1. `waitForImagePost()` 함수 추가**
  - 이미지 제출 후 URL이 `/imagine/post/...`로 변경되거나 "동영상 만들기" 버튼 출현 대기
  - 타임아웃: 3분, 폴링: 3초

- [x] **2. `clickMakeVideoButton()` 함수 추가**
  - 포스트 페이지에서 `button[aria-label="동영상 만들기"]` 클릭 (simulateClick)
  - 최대 3회 재시도

- [x] **3. `runGrokAutomation()` 수정 (line ~724)**
  - dismissPopups() 후, waitForVideo() 전에:
  - → `waitForImagePost()` 추가
  - → `clickMakeVideoButton()` 추가

- [ ] **4. `runExtendAutomation()` 1차 생성 수정 (line ~1925)**
  - 같은 위치에 동일 로직 추가

- [ ] **5. 테스트**
