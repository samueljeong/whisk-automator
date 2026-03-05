# Grok 영상 연장 기능 리서치

## 현재 구조 파악

### 기존 흐름 (grok.js 메인 루프, 468~567줄)
1. `clickImagineInSidebar()` — grok.com/imagine으로 이동
2. `uploadImageToGrok(dataUrl)` — 이미지 업로드
3. `inputMotionPrompt()` — 모션 프롬프트 입력
4. `clickGenerateButton()` — "동영상 만들기" 버튼 클릭
5. `dismissPopups()` — A/B 팝업 처리
6. `waitForVideo()` — 영상 완성 대기 (3분 타임아웃, 3초 폴링)
7. (옵션) `clickUpscaleInMenu()` + `waitForUpscale()` — 업스케일
8. `downloadVideo()` — 다운로드

### 더보기 메뉴 구조 (스크린샷 기반)
`button[aria-label="추가 옵션"]` (= `...` 버튼) 클릭 시:
- 비디오 삭제
- 좋아요
- 싫어요
- 동영상 업스케일
- **영상 연장** <-- 새로 자동화할 기능

### 업스케일 클릭 로직 (1042~1195줄) — 재사용 가능
- 1단계: `button[aria-label="추가 옵션"]` simulateClick으로 메뉴 열기
- 2단계: 1.5초 대기 후 "업스케일" 텍스트 포함 요소 찾아 simulateClick
- `simulateClick()` = pointerdown -> mousedown -> pointerup -> mouseup -> click
- 이 패턴을 그대로 복사해서 "연장" 텍스트 매칭으로 바꾸면 됨

### 업스케일 대기 로직 (1197~1285줄)
- HD 배지 출현 또는 video src 변경으로 완료 감지
- 5분 타임아웃, 3초 폴링

### 큐 아이템 구조 (9줄)
```js
{ id, name, dataUrl, motionPrompt, status, videoUrl }
```

### UI 구조 (popup.html, Grok 설정 섹션 246~267줄)
- 기본 모션 프롬프트 입력
- 생성 간격(초)
- 저장 위치
- "업스케일 후 저장" 체크박스 (`grokUpscaleEnabled`)

## 영상 연장 기능 분석

### 동작 원리 (스크린샷 기반 추정)
1. 6초 영상 생성 완료 상태에서
2. 더보기(`...`) > "영상 연장" 클릭
3. Grok이 마지막 프레임부터 이어서 새 6초 영상 생성
4. 왼쪽에 썸네일이 추가됨 (스크린샷에서 2개 보임)
5. 최종적으로 12초 영상 다운로드 가능 (또는 이어붙이기 필요?)

### 핵심 차이점: 업스케일 vs 연장
| | 업스케일 | 연장 |
|---|---|---|
| 결과 | 같은 영상 HD 교체 | 새 영상 추가 |
| 감지 | HD 배지 / src 변경 | 새 video 출현 / 썸네일 추가 |
| 다운로드 | 교체된 src 다운로드 | 연장된 영상의 src 다운로드 |

### 완료 감지 방법 (후보)
- 왼쪽 썸네일 개수 변화 감지 (N개 → N+1개)
- 새로운 video src 출현
- 로딩 인디케이터 소멸 + src 변경 조합
- 실제 DOM 확인 필요 (첫 구현 시 진단 로그로 파악)

### 불확실한 점
1. 연장된 영상이 별도 클립인지, 전체가 하나로 합쳐지는지
2. 연장 중 UI 변화가 업스케일과 비슷한지 다른지
3. 연장 완료 후 다운로드하면 12초 전체인지 추가 6초만인지

## 수정 필요 파일

1. **popup.html** — 체크박스 1개 추가 ("영상 연장" 옵션, 업스케일 아래)
2. **grok.js** — 3가지 추가:
   - `clickExtendInMenu()` — 더보기 메뉴에서 "연장" 클릭 (업스케일 로직 복사 + 텍스트 매칭 변경)
   - `waitForExtend()` — 연장 완료 대기 (새 video src 감지)
   - 메인 루프에 Step 5.6 연장 스텝 추가
3. popup.css — 변경 불필요 (기존 스타일 재사용)
