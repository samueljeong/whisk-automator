# 위스크 자동화 버그 리서치

## [핵심] selectAssetByName 에셋 클릭 버그 — 디버깅 기록

### 증상
에셋 패널에서 검색 결과를 클릭하면 에셋이 프롬프트에 삽입되지 않음.
- 초기: 클릭 시 Flow 메인 화면으로 네비게이션 발생
- 현재: 네비게이션은 막았으나 에셋 선택(ref 삽입)이 안 됨

### DOM 구조 확인 (2026-02-27 디버그 로그)

에셋 검색 결과의 실제 DOM 체인 (styled-components, `<a>` 태그 **없음**):

```
DIV.sc-5bf79b14-15.ekgK 95x24           ← 텍스트 "#soyeon.png"
→ DIV.sc-5bf79b14-10.gmxKpa 607x56      ← 이름 행
→ DIV 607x56                             ← 래퍼
→ DIV.sc-5bf79b14-9.PjOFM 607x112       ← 에셋 카드 (★ 선택 핸들러 위치?)
→ DIV 607x367                            ← 리스트 컨테이너
→ DIV.sc-5bf79b14-8.vnemi 607x367
→ DIV.sc-5bf79b14-7.AgfuU 607x367
→ DIV.sc-5bf79b14-3.kSdphD 607x367
→ DIV.sc-5bf79b14-2.eGqQMF 607x387
→ DIV.sc-5bf79b14-0.burOnI 639x459       ← 패널 전체
→ DIV#radix-:rj:.sc-2c8df0f0-0.bLOspl 639x459  ← Radix UI 모달
→ DIV 639x459
```

**핵심 발견**: `<a>` 태그가 **전혀 없음**. href 제거 접근법은 무의미.

### 시도한 수정과 결과

| # | 시도 | 클릭 대상 | 결과 | 실패 원인 |
|---|------|----------|------|----------|
| 1 | `<a>` 건너뛰고 자식 DIV 클릭 + URL 감지/history.back() | DIV 95x24 | 네비게이션 발생, ref 0→0 | 클릭 이벤트가 부모로 버블링 |
| 2 | 조상 `<a>` href 일시 제거 + preventDefault | DIV 95x24 | 네비게이션 막힘, ref 0→0 | 클릭 대상 너무 작음 (텍스트 라벨) |
| 3 | `<a>` 클릭 대상으로 + href 제거 | DIV 95x24 | 변화 없음 | `<a>` 태그 자체가 없었음 |
| 4 | stopPropagation 추가 | DIV 95x24 | ref 0→0, 업로드 폴백 | stopPropagation이 Flow 핸들러도 차단 |
| 5 | stopPropagation 제거, preventDefault만 | DIV 95x24 | ref 0→0 | 클릭 대상이 여전히 텍스트(95x24) |
| 6 | width 제한 제거, height>60 기준으로 카드(607x112) 클릭 | DIV 607x112 (예상) | ? (미확인) | 사용자 "실패" 보고, 상세 불명 |

### 시도 #7, #8 추가 (2026-02-27 심야)

| # | 시도 | 결과 | 실패 원인 |
|---|------|------|----------|
| 7 | preventDefault 완전 제거 | 메인화면으로 네비게이션, ref 0→0 | 네비게이션 차단 없이 페이지 이동 |
| 8 | history.pushState/replaceState 오버라이드 + .click() 폴백 | 검색 결과 없음 → uploadNewAsset 폴백 | 에셋이 라이브러리에 없어서 검색 자체 실패 |

### 영상 분석 핵심 발견 (2026-02-27 녹화 분석)

**Frame 4-5**: `#soyeon` 검색 → "일치하는 결과 없음" 표시 → `selectAssetByName`이 클릭 로직까지 도달 못함
**Frame 7**: `uploadNewAsset` 폴백 실행 → 파일 인터셉터가 `#soyeon.png` 전달 성공
**Frame 11**: 에셋 패널에 `#soyeon.png` 카드가 썸네일과 함께 표시됨 (업로드 성공!)
**Frame 16-34**: `분석 대기 중... (5초/20초/35초/50초), void: 0/0` — ref 카운트가 영원히 0
**Frame 36**: `분석 타임아웃 (60초)` → `업로드 후 레퍼런스 증가 없음 (ref: 0 → 0)` → `에셋 업로드 실패, 스킵`
**Frame 38**: 레퍼런스 없이 프롬프트 텍스트만 입력 후 생성 진행

### 근본 원인 확정

**Flow의 에셋 삽입 메커니즘**: 에셋을 업로드하면 **라이브러리에만 추가**됨. 프롬프트에 레퍼런스로 삽입하려면 **에셋 카드를 클릭**해야 함.

현재 `uploadNewAsset`의 치명적 결함:
1. 파일 업로드 → 성공 (패널에 에셋 카드 표시됨)
2. `waitForAnalysisComplete()` 호출 → **ref 카운트 증가를 수동적으로 기다림**
3. 하지만 **에셋 카드를 클릭하지 않으므로** ref가 절대 증가하지 않음
4. 60초 후 타임아웃 → 실패

**두 함수의 관계**:
- `selectAssetByName`: 에셋이 이미 라이브러리에 있을 때 → 검색 → 카드 클릭 (클릭 자체도 미해결)
- `uploadNewAsset`: 에셋이 없을 때 → 업로드 → **클릭 없이 대기** → 실패

### 영상 2차 분석 (2026-02-27 23:06 녹화) — selectAssetByName 경로

이번엔 `#yonga`가 라이브러리에 **존재**해서 selectAssetByName의 클릭 로직까지 도달:

```
에셋 발견: "#yonga.png" → 클릭 대상: DIV.sc-3128f8f-0 bTtjRP 458x250 at(24,108)
에셋 카드 클릭 시작 (SPA 네비게이션 차단)
simulateRealClick 실패 (ref: 0), 네이티브 .click() 시도
에셋 클릭 완료, 패널 닫기
에셋 "#yonga" 삽입 결과, ref: 0 → 0
⚠ 에셋 "#yonga" 삽입 실패 — 레퍼런스 증가 없음
페이지 이동 감지, history.back() 복귀
```

**확정된 사실**:
1. 에셋 검색/발견은 정상 동작 (458x250 카드 정확히 찾음)
2. `simulateRealClick()` → ref 삽입 안 됨
3. 네이티브 `.click()` → ref 삽입 안 됨
4. 두 방법 모두 페이지 이동만 발생 (SPA 네비게이션 차단 실패 or location 변경)
5. history.pushState 오버라이드가 네비게이션을 막지 못함

### DOM 구조 비교

| 시기 | 클래스 패턴 | 카드 크기 | 텍스트 라벨 |
|------|-----------|----------|-----------|
| 이전 | sc-5bf79b14-* | 607x112 | 95x24 |
| 현재 | sc-6e2527b8-*, sc-3128f8f-* | 458x250 | 62x16 |

styled-components 해시가 다름 → Flow UI가 업데이트됐거나 다른 패널 상태

### 결론: 클릭 방식으로는 불가능

**8회 시도 + 2가지 클릭 방법 모두 실패**. 에셋 카드 클릭이 JavaScript로는 레퍼런스 삽입을 트리거하지 못함.

가능한 원인:
- `isTrusted: false` 체크 (브라우저 보안, 해결 불가)
- React/Lit 이벤트 시스템이 합성 이벤트 무시
- 클릭 핸들러가 특정 이벤트 속성(pointerId, pressure 등) 검증

### 남은 대안 (클릭 우회)

1. **키보드 네비게이션**: 검색 후 ArrowDown + Enter로 선택 (가장 간단)
2. **Drag & Drop**: 카드에서 프롬프트 영역으로 드래그 이벤트 시뮬레이션
3. **Slate.js 직접 삽입**: 프롬프트 에디터의 Slate 인스턴스에 접근, void 노드 프로그래매틱 삽입
4. **chrome.debugger API**: `Input.dispatchMouseEvent`로 trusted 이벤트 전송 (권한 필요)

---

## 다운로드 파일명 매핑 + 누락 버그 — 디버깅 기록 (2026-02-28)

### 증상 (3차 테스트 영상 분석)

1. **5개 프롬프트 제출 → 4개만 다운로드** (flow_4 누락)
2. **파일명이 프롬프트와 불일치**: 위치 기반 매핑이라 생성 순서 ≠ 제출 순서이면 뒤바뀜
3. **진행률 UI 오류**: "4 / 5 완료"로 표시, 개별 프롬프트 status가 'completed'로 안 바뀜

### 근본 원인 분석

#### 문제 1: 다운로드 누락 (4/5)

`downloadBatch()` (라인 2729-2827):
- Phase 3에서 `newImagesReady = 5/5` 감지 성공
- 하지만 `downloadBatch()`에서 `candidateImages` = 4개
- **원인**: `preGenSrcs` 스냅샷 이후 ~ 프롬프트 제출 사이에 에셋 선택 과정에서 일부 이미지가 `assetSrcs`에 잘못 등록되었거나, 5번째 이미지가 아직 DOM에 없었을 가능성

또는 더 가능성 높은 원인:
- Phase 3 (폴링)은 img 전체를 순회하며 `getMediaUrlRedirect` 포함 + preGenSrcs 미포함 + downloadedSrcs 미포함 + assetSrcs 미포함으로 5개 감지
- `downloadBatch()`는 **별도로 다시 DOM 순회** → 이 시점에 DOM이 바뀌었거나 (lazy unload, scroll 위치 변경 등)
- 또는 Phase 3과 downloadBatch 사이에 `await sleep(1000)` 동안 Flow가 UI 갱신해서 이미지 교체

#### 문제 2: 파일명 매핑 (위치 순서 ≠ 프롬프트 순서)

현재 `downloadBatch()` 매핑 방식 (라인 2773-2774):
```js
var pIdx = batchStart + di;  // di = 위치순 정렬된 이미지 인덱스
var pItem = promptsWithCharacters[pIdx];
```

이 방식의 전제: "Flow가 프롬프트를 제출한 순서대로 위→아래로 결과를 표시한다"
- 실제로 Flow는 비동기 생성 → **먼저 완성된 이미지가 먼저 표시됨**
- 프롬프트 1(복잡한 장면) → 30초, 프롬프트 2(단순 배경) → 15초이면, 결과 순서가 2→1
- 위치 정렬로 di=0 → 프롬프트 1 파일명 배정 → **실제로는 프롬프트 2 이미지**

#### 문제 3: 진행률 UI

- 제출 시: `PROGRESS_UPDATE` with `status: 'processing'` (라인 2893-2899)
- 배치 완료 시: `PROGRESS_UPDATE` with `status: 'completed'` (라인 2990-2997)
  - 하지만 `promptIndex: promptsWithCharacters[batchEnd - 1].index` → **마지막 프롬프트만** completed
  - 배치 내 나머지 프롬프트는 'processing'에서 멈춤

### 해결 방향

**파일명 매핑**: 위치 기반 매핑을 포기하고, 프롬프트 제출마다 고유 식별자를 부여. 각 생성 이미지에 해당 프롬프트를 추적.

**접근법**: 프롬프트를 제출할 때마다 현재 DOM 이미지 스냅샷을 기록하고, 다음 프롬프트 제출 전에 새로 나타난 이미지를 해당 프롬프트에 연결. 하지만 배치 제출은 이미지가 생성되기 **전에** 모든 프롬프트를 제출하므로 이 방식은 불가.

**대안**: 프롬프트별 개별 추적 대신 **전체를 한번에 다운로드하되, 파일명에 프롬프트 인덱스 대신 순서 번호만 사용**. 사용자가 `[filename:...]` 태그로 파일명을 지정하면 그것을 사용.

**최선의 접근법**: 프롬프트 제출 직전/직후 스냅샷 차이로 각 프롬프트의 "pending 카드"를 추적. Flow는 프롬프트 제출 즉시 타임라인에 카드를 추가하고 (로딩 중 표시), 완성되면 img src가 나타남. 이 카드의 위치로 프롬프트 매핑 가능.

→ **가장 실용적인 방법**: 프롬프트마다 제출 직전/직후 DOM 차이로 "이 프롬프트의 카드 위치" 기록 → 다운로드 시 위치로 매칭.

---

## 5차 테스트 분석 (2026-02-28 18:28) — 파일명 매칭 + 에셋 사전 준비

### 결과 요약
- **파일 5개 전부 저장됨** (Phase 3 조기 종료 성공!)
- **텍스트 매칭 0/5** — 모두 실패, 위치 폴백으로 다운로드
- **파일명 전부 틀림** — 위치 순서가 제출 순서와 불일치
- **에셋 미적용** — 1번 이미지에서 에셋 분석 전에 프롬프트 제출 시작

### 파일명 매칭 실패 근본 원인 (확정)

**원인 1: `promptsWithCharacters` 정렬** (라인 1312-1329)

프롬프트 배열이 **스타일→캐릭터 그룹** 순으로 정렬됨:
```
원래 순서: 001(용아) → 002(소연) → 003(소연,용아) → 004(없음) → 005(용아)
정렬 후:   002(소연) → 003(소연,용아) → 001(용아) → 005(용아) → 004(없음)
```

→ `batchPrompts[0]`이 원래 프롬프트 002(소연), `batchPrompts[3]`이 005(용아) 등
→ 제출도 이 순서로 됨

**원인 2: 텍스트 매칭 실패**

콘솔 로그 확인:
```
[Flow Auto] 프롬프트 매칭: 0/5 텍스트 매칭, 5개 위치 폴백
```

`findPromptForImage`가 카드 텍스트에서 프롬프트를 찾지 못함.
가능한 원인:
- Flow 카드의 `textContent`에 입력 프롬프트가 포함되지 않음
- 카드가 접히거나 트렁케이션됨
- 한글 프롬프트가 다른 형태로 표시됨

**원인 3: 위치 폴백의 방향 문제**

현재 정렬: `ar.top - br.top` (위→아래)
Flow의 피드가 가장 최근 제출을 **아래**에 배치하면: 위→아래 = 제출 순서 (맞음)
Flow의 피드가 가장 최근 제출을 **위**에 배치하면: 위→아래 = 역순 (틀림)

실제 다운로드 순서: `DL 1: 002, DL 2: 001, DL 3: 003, DL 4: 005, DL 5: 004`
정렬된 제출 순서: `002, 003, 001, 005, 004`
→ **위치 순서와 제출 순서가 불일치** → 위치 폴백도 정확하지 않음

### 에셋 사전 준비 필요성

현재 흐름:
```
프롬프트 1 → 에셋 업로드 + 분석 대기 → 프롬프트 입력 → 생성
프롬프트 2 → 에셋 검색 + 선택 → 프롬프트 입력 → 생성
...
```
새 프로젝트에서 에셋이 없으면 첫 프롬프트에서 업로드→분석 완료를 기다려야 하는데,
분석이 끝나기 전에 프롬프트 제출이 시작됨.

사용자 제안:
```
Phase 0: 프롬프트 전체 파싱 → 필요한 캐릭터 태그 추출
Phase 0.5: 모든 에셋 일괄 업로드 + 분석 완료 대기
Phase 1+: 프롬프트 순차 실행 (에셋은 이미 준비됨, 선택만 하면 됨)
```
이 접근법의 장점: 100장 이상에서도 에셋 대기 시간이 없음

### 해결 방향 (2가지 독립 문제)

**문제 A: 파일명 매핑** → 가장 단순한 해결: 정렬 제거
- 정렬이 원래 에셋 전환 비용 최소화를 위한 것이었는데,
  에셋 선택이 이미 매 프롬프트마다 실행되므로 정렬의 의미가 퇴색
- 정렬 제거하면 제출 순서 = 원래 프롬프트 순서 = 위치 순서 (가정)
- 텍스트 매칭은 여전히 실패하겠지만, 위치 폴백이 올바른 순서가 됨

**문제 B: 에셋 사전 준비** → Phase 0에서 에셋 일괄 업로드

---

## .click() vs simulateClick() 문제

Grok.com은 React 기반이라 네이티브 `.click()`이 React 이벤트 핸들러를 트리거하지 못함.
올바른 방식은 PointerEvent + MouseEvent 시퀀스를 수동으로 발행하는 것.

### simulateClick 구현 (PointerEvent 포함)

```js
function simulateClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  element.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1 }));
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1 }));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));
}
```

---

## grok.js 버그 (완료)

| 위치 | 현재 | 수정 | 상태 |
|------|------|------|------|
| clickGenerateButton (817-829) | setTimeout simulateClick | PointerEvent 동기식 | ✅ |
| uploadImageToGrok (698,708) | .click() | simulateClick (button만) | ✅ |
| dismissPopups (941) | .click() | simulateClick | ✅ |
| clickPageDownloadButton (1273) | .click() | simulateClick | ✅ |
| navigateToImagine | .click() | 수정 안함 (미사용) | — |
| clickPageDownloadButton (1280) | .click() | 유지 (`<a download>`) | — |

## popup.js 버그

| 위치 | 현재 | 수정 | 상태 |
|------|------|------|------|
| dismissPopups (1416,1429,1438,1458) | .click() | simulateRealClick | ✅ |
| selectAssetByName (에셋 클릭) | simulateRealClick | **미해결** | ❌ |
| uploadNewAsset (ref 검증) | return true 고정 | ref 카운트 체크 | ✅ |

---

# Supabase OTP 인증 + 라이선스 마이그레이션 리서치

## 현재 라이선스 시스템 분석

### 구조 (`popup/license.js`, 106줄)
- **서버**: Flask on Render.com (`https://drama-s2ns.onrender.com`)
- **엔드포인트**: `POST /api/whisk/validate` → `{ key: "WHISK-XXXX-XXXX" }` → `{ valid, expires }`
- **키 저장**: Render 환경변수 `ACTIVE_KEYS` = `"KEY1:EXPIRY1,KEY2:EXPIRY2,..."`
- **클라이언트 캐시**: `chrome.storage.local` → `whisk_license` 키
  - 24시간 캐시 + 7일 오프라인 유예
- **라이선스 서버 프로젝트**: `~/Projects/코딩/whisk-license-server/`

### UI 흐름
1. `popup.html` 로드 → `checkLicense()` 호출
2. 유효 → `showMainUI(result)` → 라이선스 바에 만료일 표시
3. 무효 → `showLicenseScreen()` → 키 입력 모달
4. "키 변경" → `clearLicenseCache()` → `showLicenseScreen()`

### popup.html 라이선스 관련 요소
- `#licenseScreen` — 잠금 화면 (키 입력 모달)
- `#licenseKeyInput` — `FLOW-XXXX-XXXX` 입력 필드
- `#licenseSubmitBtn` — 확인 버튼
- `#licenseError` — 에러 메시지
- `.license-bar` — 상단 바: 만료일 `#licenseStatus` + `#licenseChangeBtn`

### popup.js 라이선스 호출부
- `DOMContentLoaded` → `checkLicense()` → `showMainUI()` or `showLicenseScreen()`
- `#licenseSubmitBtn` 클릭 → `submitLicenseKey()` → 성공 시 `showMainUI()`
- `#licenseChangeBtn` 클릭 → `clearLicenseCache()` → `showLicenseScreen()`

### manifest.json 관련
```json
"host_permissions": [
  "https://labs.google/*",
  "https://drama-s2ns.onrender.com/*",  // ← 현재 라이선스 서버
  "https://grok.com/*"
]
```

## Supabase OTP 가이드 요약 (참조: supabase_otp_license_guide.md)

### 3-레이어 구조
1. **인증**: Supabase GoTrue — `POST /auth/v1/otp` → `POST /auth/v1/verify` → 토큰 발급
2. **라이선스**: Edge Function `check-license` — JWT → user_id → `licenses` 테이블 조회
3. **기능 제한**: 클라이언트 tier별 제어 (free/pro/enterprise)

### 토큰 관리
- access_token + refresh_token → `chrome.storage.local`
- 만료 1분 전 자동 갱신 (`/auth/v1/token?grant_type=refresh_token`)
- 갱신 실패 시 로그아웃

### 라이선스 캐시
- 5분 TTL (서버 부하 방지)
- 오프라인 시 24시간까지 캐시된 라이선스 허용

## 변경 영향 분석

### 수정 필요 파일 (5개)
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `popup/license.js` | 전면 재작성: OTP 인증 + 토큰 관리 + 라이선스 체크 | 대 |
| `popup/popup.html` | 라이선스 화면: 키 입력 → 이메일 OTP UI로 교체 | 중 |
| `popup/popup.js` | 라이선스 관련 함수 호출부 수정 (API 동일하게 유지 가능) | 소 |
| `popup/popup.css` | OTP 입력 UI 스타일 추가 | 소 |
| `manifest.json` | `host_permissions`에 Supabase URL 추가, Render URL 제거 | 소 |

### 변경 없는 파일
- `popup/grok.js`, `prompt_helper.js`, `prompt_safety.js` — 라이선스 무관
- `content/` 전체, `background/background.js` — 무관
- `characters.json` — 무관

### Supabase 인프라 설정 (1회, 수동)
1. Supabase 프로젝트 생성 → URL + anon key
2. Authentication → Email OTP 활성화
3. `licenses` 테이블 + RLS 생성
4. Edge Function `check-license` 배포

## 결정 필요 사항
1. **Freemium 티어**: 현재는 키 있으면 전체/없으면 잠금. free/pro 나눌 건지?
2. **기존 키 방식 병행**: OTP만? 키도 유지?
3. **오프라인 유예**: 현재 7일 → 유지? 24시간?
4. **디바이스 핑거프린트**: 중복 로그인 방지 필요?
