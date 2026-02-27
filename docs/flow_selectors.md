# Flow 셀렉터 매핑 (Whisk → Flow)

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
| 생성 완료 감지 | ??? | ❌ 미확인 |
| 다운로드 | ??? | ❌ 미확인 |

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

**입력 방법** (Slate.js 호환 — 4차 테스트 결과):

`execCommand('insertText')`는 DOM에 텍스트를 삽입하지만,
Slate 내부 상태가 동기화 안 될 수 있음 (placeholder가 남아있음).

시도할 입력 방법 (우선순위):
```javascript
// 방법 1: InputEvent (beforeinput) — Slate가 감시하는 이벤트
promptEl.focus();
const sel = window.getSelection();
const range = document.createRange();
range.selectNodeContents(promptEl);
sel.removeAllRanges();
sel.addRange(range);
promptEl.dispatchEvent(new InputEvent('beforeinput', {
  inputType: 'insertText', data: '텍스트', bubbles: true, cancelable: true
}));

// 방법 2: 클립보드 붙여넣기 — Slate가 paste 이벤트 처리
const dt = new DataTransfer();
dt.setData('text/plain', '텍스트');
promptEl.dispatchEvent(new ClipboardEvent('paste', {
  clipboardData: dt, bubbles: true, cancelable: true
}));

// 방법 3: execCommand — DOM은 변경되지만 Slate 동기화 미보장
document.execCommand('selectAll');
document.execCommand('delete');
document.execCommand('insertText', false, '텍스트');
```

⚠️ 단순 `textContent = '...'`는 Slate 내부 상태에 반영 안 됨

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

## 미확인 항목 (실제 생성 테스트 시 확인)

1. ~~**모델 하위 드롭다운**~~: ✅ 확인됨 — Nano Banana Pro, Nano Banana 2, Imagen 4
2. **Ingredient 드로어 구조**: 열린 드로어 내부의 업로드/선택 UI (HTML +2908 but 눈에 보이는 패널 없음)
3. **생성 완료 감지**: 이미지 생성 후 DOM 변화 (새 img/video 태그? 로딩 스피너?)
4. **다운로드 메커니즘**: 생성된 이미지/영상 다운로드 방법
5. **Slate.js 입력 검증**: 어떤 입력 방법이 실제 생성에 반영되는지 (InputEvent vs paste vs execCommand)

## 자동화 구현 전략

```
1. 모델/출력 설정 (첫 실행 시):
   → simulateRealClick(모델 버튼)
   → 메뉴에서 Image/Video 선택
   → 종횡비 선택
   → 모델 하위 드롭다운에서 모델 선택
   → Esc로 닫기

2. 각 프롬프트 루프:
   → promptEl.focus() + execCommand('selectAll') + execCommand('delete')
   → execCommand('insertText', false, prompt)
   → simulateRealClick(생성 버튼)
   → 생성 완료 대기 (DOM 변화 감시)
   → 다운로드
   → delay
```
