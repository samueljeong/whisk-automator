# 다운로드 개선 — 스크롤 스윕 방식 (방안 C)

## 개요
Phase 3의 CSS zoom 폴링을 **스크롤 스윕 다운로드**로 교체.
Flow의 가상 스크롤 특성(뷰포트 근처 6~9개만 DOM 유지)에 맞춰,
스크롤하면서 보이는 이미지를 즉시 잡아서 다운로드한다.

## 변경 파일
- `popup/popup.js` — Phase 3 로직만 교체 (3426~3558 영역)

## 구현 단계

### Phase 2 (기존 유지)
프롬프트 순차 제출은 그대로. 변경 없음.

### Phase 3 (교체)

- [x] **3-1. 스크롤 컨테이너 찾기**
  - `DIV.sc-8cc14b4-1` (overflow: auto, scrollHeight > clientHeight)
  - 클래스명이 변경될 수 있으므로, 조건 기반으로 탐색:
    ```js
    // overflow:auto + 스크롤 가능 + 가장 큰 스크롤 범위
    document.querySelectorAll('div').forEach(div => {
      const style = getComputedStyle(div);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          div.scrollHeight > div.clientHeight + 200) {
        // 스크롤 범위가 가장 큰 div 선택
      }
    });
    ```

- [x] **3-2. 생성 완료 대기**
  - 제출 직후 바로 스크롤하면 이미지 생성이 안 끝났을 수 있음
  - 기존 방식 유지: 최소 1개 `getMediaUrlRedirect` 이미지 출현까지 대기
  - 타임아웃: 이미지 60초 / 비디오 120초

- [x] **3-3. 스크롤 스윕 다운로드 (순차 매칭)**
  - **핵심 원리**: Flow는 최신 생성물을 위에 표시
    → 위 = #100(마지막 제출), 아래 = #1(첫 제출)
    → 위에서 아래로 스윕하면 #100, #99, #98... #1 순서로 만남
    → **텍스트 매칭 불필요, 만나는 순서대로 역순 번호 매기면 됨**
  - **방향**: 위(최신 = 마지막 프롬프트)에서 아래로
    - 제출 끝나면 이미 위쪽에 있으므로 그 자리에서 바로 시작
    - 맨 아래로 점프할 필요 없음
  - **단위**: 300px씩 (여유 있게, 이미지 로딩+감지 안정성 확보)
  - **대기 시간**: 2초 (너무 빠르면 매칭 실패하므로 넉넉하게)
  - **각 위치에서**:
    1. 스크롤 이동 (300px 아래로)
    2. 2초 대기 (이미지 lazy load + DOM 안정화)
    3. `querySelectorAll('img[src*="getMediaUrlRedirect"]')` 탐색
    4. `downloadedSrcs`에 없는 새 이미지 → 크기 검증(200KB+)
    5. **역순 매칭**: #100부터 내려가며 번호 부여
    6. 다운로드 → src를 `downloadedSrcs`에 등록 → downloadedCount++
  - **종료 조건**: 다운로드 수 === 목표 수, 또는 스크롤 끝 도달

  ```
  nextPromptIdx = totalCount - 1  // #100부터 시작
  scrollTop = 0 (맨 위, 현재 위치)
  while (scrollTop < maxScroll && nextPromptIdx >= 0) {
    현재 위치에서 감지 → 2초 대기 → 감지
    새 이미지마다:
      파일명 = promptsWithCharacters[nextPromptIdx].filename
      다운로드
      nextPromptIdx--  // 100 → 99 → 98...
    scrollTop += 300
  }
  ```

  - **텍스트 매칭은 검증용으로만** (로그에 경고 표시):
    순차 매칭한 결과가 텍스트 매칭과 다르면 로그에 ⚠️ 표시
    하지만 순차 매칭을 우선 신뢰 (순서가 보장되므로)

- [x] **3-4. 누락 보완 (2차 스윕)**
  - 1차 스윕 후 다운로드 수 < 목표 수이면, 반대 방향(아래→위)으로 한번 더
  - 이미지 생성이 느려서 1차 때 아직 안 나온 경우를 잡음
  - 2차에서도 역순 매칭 유지 (nextPromptIdx 이어서)
  - 2차 스윕에서도 부족하면 경고 로그 + 현재 수로 완료 처리

- [x] **3-5. CSS zoom 제거**
  - 더 이상 `document.documentElement.style.zoom = '0.25'` 불필요
  - 스크롤 스윕이 모든 이미지를 순회하므로 zoom 트릭 제거

- [ ] **3-6. 진행 상황 업데이트**
  - 기존 PROGRESS_UPDATE 메시지 유지
  - `스윕 중 DL 15/100 (scroll=3500px)` 형태로 현재 위치 표시

## 기존 코드 재사용
- `findPromptForImage()` — 텍스트 매칭은 **검증용**으로만 (로그 경고)
- `downloadedSrcs`, `assetSrcs` — 중복 방지 Set 그대로
- `MIN_GENERATED_IMAGE_SIZE` (200KB) — 크기 필터 그대로
- `DOWNLOAD_IMAGE` 메시지 → background.js 그대로

## 리스크
- **스크롤 속도** — 300px/2초로 넉넉하게 설정, 2차 스윕으로 보완
- **프롬프트 매칭** — 순차 매칭이므로 기존 텍스트 매칭보다 훨씬 정확
- **스크롤 컨테이너 변경** — 클래스 의존 대신 조건 기반 탐색으로 대응

## 예상 소요 시간 (100개 기준)
- Phase 2 (제출): 기존과 동일
- Phase 3 (스윕): 13,000px ÷ 300px × 2초 ≈ **87초** (1차)
- 2차 스윕 필요 시: +87초
- 속도는 기존보다 약간 느리지만, 안정성 + 정확성이 크게 향상
