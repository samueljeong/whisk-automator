# Grok 영상 연장 기능 추가 — 계획

## 목표
Grok 영상 자동화에 "영상 연장" 옵션 추가. 6초 영상 생성 후 자동으로 연장하여 12초 영상으로 만든 뒤 다운로드.

## 수정 파일
- `popup/popup.html` — UI 체크박스 추가
- `popup/grok.js` — 연장 로직 추가

## 작업 단계

- [x] **1. popup.html — 체크박스 추가**
  - 기존 "업스케일 후 저장" 체크박스 아래에 "영상 연장" 체크박스 추가
  - id: `grokExtendEnabled`
  - 위치: Grok 설정 섹션 (266줄 부근)

- [x] **2. grok.js — DOM 참조 추가**
  - `const grokExtendEnabled = $('#grokExtendEnabled');`
  - 기존 DOM 요소 섹션에 추가

- [x] **3. grok.js — `clickExtendInMenu()` 함수 추가**
  - `clickUpscaleInMenu()` 로직 복사
  - 텍스트 매칭을 `업스케일|upscale` → `연장|extend` 로 변경
  - 콘솔 로그 접두어: `[Grok Extend]`
  - `simulateClick()` 헬퍼는 동일

- [ ] **4. grok.js — `waitForExtend()` 함수 추가**
  - 연장 완료 감지 (5분 타임아웃, 3초 폴링)
  - 감지 전략:
    - video src 변경 (기존 src와 다른 새 src 출현)
    - 로딩 인디케이터 소멸
  - `waitForUpscale()` 구조 기반, HD 배지 대신 src 변경에 집중

- [ ] **5. grok.js — 메인 루프에 연장 스텝 추가**
  - 위치: Step 5 (waitForVideo) 이후, Step 5.5 (업스케일) 이후
  - 순서: 생성 → (업스케일) → **(연장)** → 다운로드
  - 연장은 업스케일과 독립적 (둘 다 켜거나 하나만 켜거나)
  - 연장 시 최신 videoUrl 갱신 필요

- [ ] **6. 테스트**
  - 연장만 ON으로 1건 테스트
  - 업스케일 + 연장 둘 다 ON으로 1건 테스트
  - 콘솔 로그로 연장 완료 감지 동작 확인

## 기존 코드 영향
- 메인 루프 구조 유지, 연장 스텝만 삽입
- 업스케일 로직 변경 없음
- 더보기 메뉴 열기 로직 공유 (동일한 `button[aria-label="추가 옵션"]`)
  - 주의: 업스케일 후 연장 시 메뉴를 다시 열어야 함

## 불확실한 점 (테스트로 확인)
- 연장 완료 후 다운로드되는 영상이 12초 전체인지, 추가 6초만인지
- 업스케일 + 연장 조합 시 순서가 중요한지
- 연장 중 DOM 변화 패턴 (첫 테스트에서 진단 로그로 파악)
