# Flow 셀렉터 매핑

## 상태: 4차 조사 완료 (2026-02-27)

URL: `labs.google/fx/ko/tools/flow/project/{uuid}`

## 핵심 셀렉터 매핑 (확정)

| 기능 | 셀렉터 / 방법 | 상태 |
|------|--------------|------|
| 프롬프트 입력 | `[role="textbox"][contenteditable]` — **Slate.js** 에디터 | ✅ 확정 |
| 생성 버튼 | 텍스트 "만들기" + "arrow_forward" 포함 버튼 (하단) | ✅ 확정 |
| 모델 메뉴 열기 | 텍스트에 "Banana" or "Imagen" 포함 버튼 → React 클릭 | ✅ 확정 |
| 이미지/영상 전환 | 모델 메뉴 내 `[role="menu"]` → "Image"/"Video" 항목 | ✅ 확정 |
| 종횡비 선택 | 모델 메뉴 내 "가로 모드"/"세로 모드" 항목 | ✅ 확정 |
| 생성 수량 | 모델 메뉴 내 "x1"~"x4" 항목 | ✅ 확정 |
| 모델 변경 | 모델 메뉴 내 모델 버튼 → 하위 `[role="menu"]` (264x126) → 모델명 클릭 | ✅ 확정 |
| Ingredient 추가 | "add_2만들기" 버튼 (하단 좌측) → 인라인 드로어 | ⚠️ 드로어 구조 미확인 |
| 파일 업로드 | `input[type=file][accept="image/*"][multiple]` (display:none) | ✅ interceptor 호환 |
| 생성 완료 감지 | 새 `img[src*="getMediaUrlRedirect"]` 출현 감시 (~28초) | ✅ 확정 |
| 다운로드 | `fetch(img.src)` → blob → `chrome.downloads.download()` | ✅ 확정 |

## 1. 프롬프트 입력 (Slate.js)

**셀렉터**: `[role="textbox"][contenteditable]`
**플레이스홀더**: "무엇을 만들고 싶으신가요?"

```
innerHTML 구조:
<p data-slate-node="element">
  <span data-slate-node="text">
    <span data-slate-leaf="true">
      <span data-slate-...>텍스트</span>
    </span>
  </span>
</p>
```

**입력 방법** (5차 테스트 결과 — 확정):

✅ **InputEvent (beforeinput)** — Slate 내부 상태 + DOM 구조 모두 정상 유지
❌ paste, execCommand, 키보드 시뮬레이션 — 모두 실패 또는 불완전

```javascript
// ✅ 확정된 입력 방법
const promptEl = document.querySelector('[role="textbox"][contenteditable]');
promptEl.focus();
await sleep(200);

// 1. 전체 선택 (Selection API 사용)
const sel = window.getSelection();
const range = document.createRange();
range.selectNodeContents(promptEl);
sel.removeAllRanges();
sel.addRange(range);
await sleep(100);

// 2. 기존 텍스트 삭제 (beforeinput)
promptEl.dispatchEvent(new InputEvent('beforeinput', {
  inputType: 'deleteContentBackward',
  bubbles: true, cancelable: true, composed: true
}));
await sleep(200);

// 3. 새 텍스트 삽입 (beforeinput)
promptEl.dispatchEvent(new InputEvent('beforeinput', {
  inputType: 'insertText',
  data: '프롬프트 텍스트',
  bubbles: true, cancelable: true, composed: true
}));
await sleep(300);
// → placeholder 사라짐, data-slate-string="true" 정상 생성
```

⚠️ `execCommand`는 DOM에 텍스트를 넣지만 Slate 노드 구조를 파괴함
⚠️ `textContent = '...'`는 Slate 내부 상태에 반영 안 됨

## 2. 모델 메뉴 (통합 컨트롤)

**열기**: 모델 버튼 React 클릭 (simulateRealClick)
**메인 메뉴**: `[role="menu"]` (280x238)

```
메뉴 구조:
┌─────────────────────────────┐
│ image Image │ videocam Video │  ← 이미지/영상 전환
├─────────────────────────────┤
│ crop_16_9 가로 모드          │  ← 종횡비 16:9
│ crop_9_16 세로 모드          │  ← 종횡비 9:16
├─────────────────────────────┤
│ x1  x2  x3  x4             │  ← 생성 수량
├─────────────────────────────┤
│ 🍌 Nano Banana Pro ▼        │  ← 모델 선택 (클릭→하위 메뉴)
├─────────────────────────────┤
│ 생성 시 0크레딧이 사용됩니다.   │  ← 크레딧 정보
└─────────────────────────────┘
```

**하위 메뉴** (모델 선택): `[role="menu"]` 두 번째 (264x126)
```
┌────────────────────┐
│ 🍌 Nano Banana Pro  │
│ 🍌 Nano Banana 2    │
│ Imagen 4            │
└────────────────────┘
```

**메뉴 아이템 공통 클래스**: `flow_tab_slider_trigger`
**아이템 선택**: 메뉴 내부에서 텍스트로 찾아 React 클릭
**닫기**: Esc 키 (하위 메뉴 → 메인 메뉴 → 순서대로)

## 3. 생성 버튼

**셀렉터**: 하단 영역(y>700)의 "만들기" + "arrow_forward" 텍스트 버튼
**배경색**: `rgba(255, 255, 255, 0.75)` (항상 활성, disabled=false)

## 4. Ingredient 추가

**버튼**: "add_2만들기" (하단 좌측, y>700)
**동작**: 인라인 드로어 열림 (div 14개 추가, 팝업 아님)
**파일 입력**: `input[type=file][accept="image/*"][multiple]` — display:none, 부모 `sc-c7ee1759-1`

## 5. 하단 바 구조

```
┌──────────────────────────────────────────────────────┐
│ [add_2 만들기]  [프롬프트 입력...]  [모델+비율+수량] [→만들기] │
│   ingredient     Slate.js editor    모델 메뉴     생성 버튼  │
│   sc-c70e41ad-2  sc-c70e41ad-3      sc-c70e41ad-6           │
└──────────────────────────────────────────────────────┘
하단 바 컨테이너: sc-5c30409d-3 (전체 너비, 89px 높이)
페이지 루트: sc-c7ee1759-1
```

## 6. 탭 (하단 좌측 모서리)

`[role="tab"]` 클래스 `ap-toolbar-tab-tab`
- 탭 0 (30x30): 아이콘 `ap-toolbar-expand-toggle` — 확장/축소 토글
- 탭 1 (60x60): 아이콘 `ap-icon-drop-up-list` — 리스트 보기

→ 이미지/영상 전환이 아님, 툴바 UI 토글

## 7. URL 패턴

- 경로 기반: `/fx/{lang}/tools/flow/project/{uuid}`
- 언어 코드: `/ko/`, `/en/` 등
- checkConnection 매칭: `url.includes('flow') && url.includes('project')`

## 확인 완료 항목

1. ✅ **모델 하위 드롭다운**: Nano Banana Pro, Nano Banana 2, Imagen 4
2. ⚠️ **Ingredient 드로어**: HTML +2908 but 눈에 보이는 패널 없음 — 추후 조사
3. ✅ **생성 완료 감지**: 새 `img[src*="getMediaUrlRedirect"]` 출현 (MutationObserver or 폴링)
4. ✅ **다운로드 메커니즘**: `fetch(img.src)` → blob → `chrome.downloads`
5. ✅ **Slate.js 입력**: InputEvent(beforeinput) 방식 확정, 실제 생성에 반영됨

## 6차 생성 테스트 결과 (2026-02-27)

- **생성 시간**: ~28초
- **이미지 URL 패턴**: `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name={uuid}`
- **이미지 부모 구조**:
  ```
  DIV.sc-8cc14b4-2 (결과 행, 1248x266)
    └── DIV (래퍼, 444x250)
        └── DIV.sc-11801678-0 (내부 래퍼)
            └── A.sc-3ab8616e-0 (링크)
                └── IMG.sc-f803b119-0.sc-5923b123-1 (이미지)
  ```
- **DOM 변화 시퀀스**:
  1. `ELEMENT_ADDED` 결과 행 컨테이너 (1248x266)
  2. `ELEMENT_ADDED` 이미지 래퍼 (444x250)
  3. `IMG_NESTED` 이미지 출현 (getMediaUrlRedirect URL)
  4. `IMG_SRC_CHANGED` src 속성 설정

## 자동화 구현 전략 (확정)

```
1. 모델/출력 설정 (첫 실행 시):
   → simulateRealClick(모델 버튼) — 텍스트에 "Banana"/"Imagen" 포함
   → [role="menu"] 내 "Image"/"Video" 버튼 React 클릭
   → "가로 모드"/"세로 모드" React 클릭
   → "x1"~"x4" React 클릭
   → 모델명 버튼 React 클릭 → 하위 [role="menu"]에서 모델 선택
   → Esc × 2로 닫기

2. 각 프롬프트 루프:
   → promptEl.focus()
   → Selection API로 전체 선택 + InputEvent(deleteContentBackward)
   → InputEvent(insertText, data: prompt)
   → simulateRealClick(생성 버튼) — "arrow_forward" + "만들기" 텍스트
   → 생성 완료 대기 (DOM 감시 — 미확인, 실제 생성 시 관찰 필요)
   → 다운로드
   → delay
```

### 핵심 함수 목록

| 함수명 | 역할 |
|--------|------|
| `findPromptInput()` | `[role="textbox"][contenteditable]` 반환 |
| `fillPrompt(text)` | InputEvent(beforeinput) 방식 텍스트 입력 |
| `openModelMenu()` | 모델 버튼 simulateRealClick → [role="menu"] 반환 |
| `selectOutputType(menu, type)` | "Image"/"Video" 메뉴 아이템 클릭 |
| `selectModel(menu, modelName)` | 하위 드롭다운에서 모델 선택 |
| `clickGenerate()` | 생성 버튼 simulateRealClick |
| `waitForOutput()` | MutationObserver로 이미지/영상 출현 대기 |
| `downloadOutput(el, name)` | 이미지 fetch→blob / 영상 blob→download |
