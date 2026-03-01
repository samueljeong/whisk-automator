# Flow @에셋 태그 기능 리서치

## 현재 시스템 동작 방식

### 프롬프트 형식
```
[filename:scene_001.png][뇌황][소소] A warrior and a girl standing together
```
- `[filename:...]` → 저장 파일명
- `[캐릭터명]` → 캐릭터 이미지 참조 (복수 가능)
- 나머지 → Flow에 보내는 프롬프트 텍스트

### 캐릭터 데이터 구조
```json
{
  "뇌황": {
    "name": "뇌황",
    "aliases": ["뇌황", "noehwang"],
    "image": "data:image/png;base64,...",
    "flowTag": "#yonga"  // ← 이미 flowTag 필드 존재!
  }
}
```

### 현재 자동화 흐름

**Phase 0 — 에셋 사전 업로드** (`popup.js:3130-3238`)
- 모든 프롬프트에서 고유 캐릭터명 수집
- 각 캐릭터: Flow 에셋 라이브러리 검색 → 없으면 base64 이미지 업로드
- `uploadedAssetNames` Set으로 중복 업로드 방지

**Phase 2 — 프롬프트 제출** (`popup.js:3279-3339`)
- 각 프롬프트마다:
  1. `uploadReferences()` → Ingredient "+" 클릭 → 에셋 검색 → **void node로 삽입**
  2. `fillPrompt()` → 프롬프트 텍스트 입력
  3. 생성 버튼 클릭

### 에셋 선택 (`selectAssetByName`, popup.js:2122-2267)
1. Ingredient "+" 버튼 클릭
2. 에셋 검색창에 `flowTag` 또는 캐릭터명 입력
3. 검색 결과에서 **ArrowDown + Enter** 키보드 선택
4. Escape로 패널 닫기

### 현재 방식의 한계

1. **다중 캐릭터**: `[뇌황][소소]` → 둘 다 void node로 삽입되지만, **프롬프트 텍스트와 의미적 연결 없음** → Flow가 "누가 누구인지" 구분 못함
2. **매 생성마다 초기화**: Flow가 생성 후 프롬프트 영역 완전 삭제 → 에셋 재선택 필요
3. **순서 의존**: Ingredient 순서가 시각적일 뿐 의미적 매핑 없음

---

## 영상에서 배운 @에셋 태그 방식

> 출처: https://www.youtube.com/watch?v=uZ70UpsbKac

### 핵심 개념
- 에셋에 짧은 이름 지정 (예: "Man", "Beer", "Dress")
- 프롬프트 텍스트 안에서 `@이름`으로 참조 → **의미적으로 정확한 매핑**
- 예: `@Woman wears @Dress while drinking @Beer`

### 동작 원리
1. `@` 입력 → Flow가 에셋 자동완성 패널 띄움
2. 이름 입력/선택 → Slate.js가 @mention 노드 삽입
3. 생성 시 Flow 엔진이 @태그와 에셋을 정확히 매핑

### 장점
- 3인 이상 장면에서도 **누가 누구인지** 명확
- 키보드만으로 작업 가능
- 에셋이 프롬프트 텍스트와 **인라인**으로 결합

---

## 변경 필요 사항

### 핵심 변경: void node 삽입 → @mention 삽입

**현재**: `[뇌황]` 추출 → Ingredient 패널에서 검색 → 에셋 카드 선택 → void node
**변경**: `[뇌황]` 추출 → flowTag 조회 → 프롬프트 텍스트에 `@flowTag` 포함 → @자동완성으로 선택

### 구체적 변경 포인트

| 위치 | 현재 | 변경 |
|------|------|------|
| `uploadReferences()` | Ingredient 버튼 → 검색 → 선택 | `@` 입력 → 자동완성 → Enter |
| `fillPrompt()` | 캐릭터 정보 없는 순수 텍스트 | 캐릭터 위치에 `@태그` 포함 |
| 프롬프트 파싱 | `[뇌황]` 제거 후 텍스트만 전달 | `[뇌황]`을 `@flowTag`로 치환 |

### 변경 불필요한 부분
- Phase 0 (에셋 사전 업로드) → 그대로 유지
- 캐릭터 데이터 구조 → `flowTag` 필드 이미 있음
- 파일 인터셉터 → 업로드 시에만 사용

### 테스트 결과 (2026-03-01)

**테스트 1: 붙여넣기**
- `@yonga Dark room interior...` 그대로 붙여넣기 → 일반 텍스트로 인식, 에셋 연결 안 됨

**테스트 2: 4가지 입력 방식 비교 (debug v2)**

| 방식 | @ 삽입 | 패널 뜸 | 비고 |
|------|--------|---------|------|
| execCommand만 | O | X | 텍스트만 들어감 |
| **KeyboardEvent 풀 시퀀스** | O | **O** | keydown→keypress→beforeinput→execCommand→keyup |
| paste (DataTransfer) | X | X | 에디터에 안 들어감 |
| execCommand + char typing | O | X | 단독으로는 패널 안 뜸 |

**패널 정보 (확정)**:
- 셀렉터: `[data-radix-popper-content-wrapper]` (740x580)
- 구조: "이미지 업로드" + "Recently Used" + 에셋 목록
- 에셋 아이템: DIV ~250x56 (`#yonga.png`, `#soyeon.png` 등)
- 기존 Ingredient 패널과 동일한 패널을 `@` 단축키로 여는 것

### 자동화 구현 방향 (확정)

프롬프트를 `@태그` 기준으로 분할하여 단계별 입력:

```
입력: "@yonga A warrior and @soso a girl standing"

단계:
1. KeyboardEvent 시퀀스로 "@" 입력 → 에셋 패널 뜸
2. 패널에서 "yonga" 검색/필터 → 선택
3. " A warrior and " 텍스트 입력 (execCommand)
4. KeyboardEvent 시퀀스로 "@" 입력 → 에셋 패널 뜸
5. 패널에서 "soso" 검색/필터 → 선택
6. " a girl standing" 텍스트 입력
7. 생성 버튼 클릭
```

### DOM 조사 완료 — debug v3~v8 결과 (2026-03-01)

**테스트 3 (v3): 패널 내부 구조**
- 검색 input 발견: `placeholder="애셋 검색"`
- 기본 Event로는 React input 필터링 안 됨

**테스트 4 (v4): React input 필터링**
- `nativeInputValueSetter` 성공 (22→3개 필터링)
- 에셋 아이템 직접 `.click()` 실패

**테스트 5 (v5): 키보드 선택**
- `searchInput`에서 ArrowDown+Enter → 패널 닫히지만 void 삽입 안 됨
- `document`에서 ArrowDown+Enter → void 삽입 성공 (그러나 불안정)

**테스트 7 (v7): 드롭다운 정밀 조사**
- `@` 드롭다운 = 기존 Ingredient 패널과 동일 (740x580, `role="dialog"`)
- 에디터에서 타이핑해도 드롭다운 필터링 안 됨 (패널 내 검색 input 사용해야 함)
- `onclick=YES`인 에셋 아이템 발견: class=`sc-dbfb6b4a-11` (250x56)
- ArrowDown 하이라이트 안 됨, Enter는 패널만 닫고 void 삽입 안 함

**테스트 8 (v8): 클릭 방법 비교 — 최종 확정**

| 방법 | void 삽입 | 패널 닫힘 |
|------|----------|----------|
| `.click()` on onclick item | **O** | X |
| mousedown+mouseup+click | O (같은 void) | X |
| pointer+mouse full | O (같은 void) | X |
| **img.click()** (자식 img) | O | **O** |
| child div.click() | O | O |
| focus+Enter | O | O |

**결론**: `.click()`이 void를 삽입하고, `img.click()`이 패널까지 닫음.

### 확정된 자동화 플로우 (v8 기반)

```
function insertAssetByAtTag(name):
  1. editor.focus()
  2. typeAt()  — KeyboardEvent 풀 시퀀스 (keydown→keypress→beforeinput→execCommand→keyup)
  3. await sleep(800) — 패널 로딩 대기
  4. panel = querySelector("[data-radix-popper-content-wrapper]")
  5. searchInput = panel.querySelector("input")  // placeholder="애셋 검색"
  6. searchInput.focus()
  7. nativeInputValueSetter(searchInput, name)  // React 제어 input 우회
  8. await sleep(800) — 필터링 대기
  9. targetItem = onclick=YES인 DIV 중 text가 "#name.png"인 것
  10. targetItem.click()  — void 삽입
  11. targetItem.querySelector("img").click()  — 패널 닫기
  12. await sleep(500) — 안정화
```

### 핵심 함수 레퍼런스

```js
// @ 입력 (패널 트리거)
function typeAt() {
  editor.focus();
  var o = { key: "@", code: "Digit2", keyCode: 50, which: 50,
            shiftKey: true, bubbles: true, cancelable: true };
  editor.dispatchEvent(new KeyboardEvent("keydown", o));
  editor.dispatchEvent(new KeyboardEvent("keypress", o));
  editor.dispatchEvent(new InputEvent("beforeinput", {
    inputType: "insertText", data: "@",
    bubbles: true, cancelable: true, composed: true }));
  document.execCommand("insertText", false, "@");
  editor.dispatchEvent(new KeyboardEvent("keyup", o));
}

// React input 값 설정 (검색 필터링)
function setReactInput(input, value) {
  var setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
```

### 수동 테스트 영상 확인 (Frame 5~29)

| 프레임 | 내용 |
|--------|------|
| 5 | `@` 입력 → 패널 열림, #yonga.png / #soyeon.png / Woman... 표시 |
| 9 | "yong" 타이핑 → #yonga.png 하나로 필터링 |
| 13 | 에셋 선택 → `#yonga.png` 칩이 에디터에 인라인 삽입 |
| 25 | 칩 뒤에 "칼을 쥐고" 텍스트 입력 |
| 29 | 최종: `#yonga.png 칼을 쥐고 있다.` |

→ 수동 플로우와 자동화(v8)가 동일한 결과를 만들어냄 확인
