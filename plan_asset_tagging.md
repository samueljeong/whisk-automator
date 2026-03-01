# Flow @에셋 태그 자동화 구현 계획

## 목표
현재 void node 방식(Ingredient 패널에서 에셋 선택) → **@mention 방식**으로 전환.
프롬프트 텍스트 안에 `@에셋이름`을 인라인으로 넣어서 다중 캐릭터 장면에서 정확한 매핑 달성.

## 프롬프트 형식 변경

```
현재: [filename:ep23_scene_001.png][뇌황][소소] A warrior and a girl standing
변경: [filename:ep23_scene_001.png] @yonga A warrior and @soso a girl standing
```

- `[filename:]`은 그대로 유지
- `[캐릭터명]` 브라켓 표기 → `@flowTag` 인라인 표기로 교체
- @태그를 프롬프트 텍스트 원하는 위치에 배치 가능

---

## Phase 0: DOM 조사 — ✅ 완료 (2026-03-01)

> debug v2~v9 스크립트로 확인. 상세: `research_asset_tagging.md`

- [x] **@ 입력 방법**: KeyboardEvent 풀 시퀀스 (keydown→keypress→beforeinput→execCommand→keyup)
- [x] **패널 셀렉터**: `[data-radix-popper-content-wrapper]` (740x580, `role="dialog"`)
- [x] **패널 = 기존 Ingredient 패널과 동일** (별도 드롭다운 아님)
- [x] **검색 input**: `panel.querySelector("input")` (placeholder="애셋 검색")
- [x] **필터링**: `nativeInputValueSetter` (React 제어 input 우회)
- [x] **에셋 선택**: `onclick=YES`인 DIV (class=`sc-dbfb6b4a-11`) `.click()` → void 삽입
- [x] **패널 닫기**: `img.click()` on 자식 img, 또는 Escape 폴백
- [x] **통합 테스트 (v9)**: 4/4 PASS — 에셋 삽입 + 텍스트 입력 정상

### v9에서 발견된 커서 문제 (Phase 2에서 해결)

1. **잔여 `@` 문자**: `typeAt()`이 삽입한 `@`가 void로 대체되지 않고 남음
   - 예: `#yonga.png @ Dark room...` (void 옆에 `@` 텍스트)
   - 해결: void 삽입 후 잔여 `@` 텍스트 노드 탐색 → 삭제

2. **에셋 사이 텍스트 손실**: 두번째 `insertAsset` 호출 시 이전 텍스트 사라짐
   - 예: `@yonga fights @soyeon` → " fights " 누락
   - 원인: `moveCursorToEnd()`가 Slate void 노드 뒤 정확한 위치를 못 잡음
   - 해결: Slate 노드 구조 기반 커서 배치 (Selection API 정밀 제어)

---

## Phase 1: 프롬프트 파서 수정 (`popup.js`)

- [x] **1-1. 새 프롬프트 형식 파싱 함수 작성 (`parsePromptSegments`)**
  - `@태그명` 패턴 인식: `/@(\w+)/g`
  - 프롬프트를 세그먼트로 분할:
    ```js
    "@yonga A warrior and @soso a girl standing"
    → [
      { type: 'asset', tag: 'yonga' },
      { type: 'text', content: ' A warrior and ' },
      { type: 'asset', tag: 'soso' },
      { type: 'text', content: ' a girl standing' }
    ]
    ```
  - `[filename:]` 태그는 별도 추출 (기존 로직 유지)
  - 기존 `[캐릭터명]` 형식 **제거** — @태그만 지원

- [x] **1-2. 세그먼트에서 필요한 에셋 목록 추출 (`extractAssetTags`)**
  - 세그먼트 배열에서 `type: 'asset'` 추출 → 고유 에셋명 Set
  - Phase 0 업로드에 전달할 이름 목록 반환

---

## Phase 2: 프롬프트 입력 방식 변경 (`popup.js`)

### 2-1. 에셋 삽입 함수 (`insertAssetByAtTag`)
- [x] v9 `insertAsset()` 기반으로 정식 함수 작성
  ```
  1. editor.focus()
  2. typeAt() — KeyboardEvent 풀 시퀀스
  3. sleep(800) — 패널 로딩 대기
  4. panel.querySelector("input").focus()
  5. nativeInputValueSetter(searchInput, name) — 필터링
  6. sleep(800) — 필터 반영 대기
  7. onclick DIV.click() — void 삽입
  8. img.click() — 패널 닫기 (폴백: Escape)
  9. sleep(500) — 안정화
  ```
- [x] 에러 처리: 패널 안 뜸 / 검색 결과 없음 / 타임아웃 → 재시도 1회 후 실패 보고
- [x] 셀렉터를 상수로 분리 (Flow 업데이트 대응)

### 2-2. 잔여 `@` 제거 로직
- [x] void 삽입 후 에디터 내 텍스트 노드 순회
- [ ] void 직전의 `@` 포함 텍스트 노드 찾기 → `@` 문자 삭제
- [ ] 방법 후보:
  - (A) `editor.querySelectorAll('[data-slate-node="text"]')` 순회해서 `@`만 포함된 텍스트 노드 삭제
  - (B) void 삽입 전에 `@` 타이핑을 하지 않는 방법 탐색 (패널을 다른 방식으로 여는 것)
  - (C) `@` 타이핑 → void 삽입 후 → Backspace로 `@` 삭제
  - → 구현 시 테스트해서 안정적인 방법 선택

### 2-3. 커서 관리 함수 (`placeCursorAfterVoid`)
- [ ] Slate void 노드 뒤 정확한 위치에 커서 배치
- [ ] `moveCursorToEnd()` 대신 **마지막 void 노드의 다음 형제 노드**를 찾아서 커서 배치
- [ ] 방법:
  ```js
  // void 노드의 부모 p 안에서 void 다음 텍스트 노드를 찾거나 생성
  var voids = editor.querySelectorAll("[data-slate-void]");
  var lastVoid = voids[voids.length - 1];
  // lastVoid 다음 위치에 커서 → execCommand("insertText", ...)
  ```
- [ ] 에셋 삽입 → 잔여 @ 제거 → 커서 배치 → 텍스트 입력 순서 보장

### 2-4. 통합 입력 함수 (`fillPromptWithAssets`)
- [x] 기존 `fillPrompt()` + `uploadReferences()` 대체
- [ ] 세그먼트 배열을 순서대로 처리:
  ```
  for each segment:
    if text → execCommand("insertText", segment.content)
    if asset → insertAssetByAtTag(segment.tag)
               → removeStrayAt()
               → placeCursorAfterVoid()
  ```
- [ ] 각 에셋 삽입 후 에디터 상태 검증 (void 개수, 텍스트 존재 확인)

---

## Phase 3: Phase 0 (에셋 사전 업로드) 수정

- [ ] **3-1. 에셋 이름 추출 소스 변경**
  - 기존: `[캐릭터명]` 브라켓에서 추출 → buildCharacterMap
  - 변경: `@태그` 에서 추출 → flowTag로 에셋 검색/업로드
  - Phase 0의 검색/업로드 로직 자체는 동일 (이름만 바뀜)

- [ ] **3-2. 에셋 업로드 시 이름 규칙 통일**
  - 업로드 파일명 = flowTag (예: `yonga.png`)
  - Flow 에셋 라이브러리에서 `@yonga`로 검색 가능하도록

---

## Phase 4: 메인 루프 수정

- [x] **4-1. `runFlowAutomation` 메인 루프 수정**
  - 기존 흐름: `uploadReferences()` → `fillPrompt()` → 생성
  - 변경 흐름: `fillPromptWithAssets(segments)` → 생성
  - `uploadReferences()` 호출 제거 (에셋이 프롬프트 안에 인라인됨)

- [ ] **4-2. 에셋 정렬 로직 재검토**
  - 기존: 같은 캐릭터 그룹을 모아서 에셋 전환 최소화
  - @mention 방식에서는 매번 에셋을 재선택하므로 정렬 불필요할 수 있음
  - 테스트 후 결정

---

## Phase 5: UI 업데이트

- [ ] **5-1. 프롬프트 입력 가이드 수정**
  - placeholder 텍스트 변경: `@에셋이름`을 프롬프트 안에 넣으라는 안내
  - 예시 업데이트

- [ ] **5-2. 캐릭터 패널에 flowTag 표시**
  - 캐릭터 목록에서 각 캐릭터의 `@태그` 확인 가능하도록
  - flowTag 미설정 캐릭터에 경고 표시

---

## 하위호환

| 항목 | 방침 |
|------|------|
| 기존 `[캐릭터명]` 형식 | **제거 확정** — @태그 형식만 지원 |
| flowTag 없는 캐릭터 | 에러 메시지 + 기존 void node 방식 폴백 |
| 기존 프롬프트 파일 (.txt) | 마이그레이션 필요 시 변환 스크립트 작성 |

---

## 리스크 & 대안

| 리스크 | 대안 |
|--------|------|
| ~~@자동완성 패널이 JS 이벤트로 트리거 안 될 수 있음~~ | ✅ 해결됨 — KeyboardEvent 풀 시퀀스로 트리거 확인 |
| ~~에셋 선택 방법 불명~~ | ✅ 해결됨 — onclick DIV .click() + img.click() |
| 잔여 `@` 문자 / 커서 위치 문제 | Phase 2-2, 2-3에서 해결 (Slate DOM 기반 정밀 제어) |
| 자동완성 딜레이가 불안정할 수 있음 | polling + 재시도 로직 |
| Flow 업데이트로 DOM 구조 변경 | 셀렉터를 상수로 분리 |

---

## 예상 수정 파일

| 파일 | 변경 규모 | 내용 |
|------|----------|------|
| `popup/popup.js` | 대 | parsePromptSegments, insertAssetByAtTag, fillPromptWithAssets, 메인 루프 |
| `popup/popup.html` | 소 | placeholder/가이드 텍스트 |
| `docs/flow_selectors.md` | 소 | @자동완성 패널 셀렉터 추가 |

---

## 작업 순서

```
0단계(DOM 조사) ✅ → 1단계(파서) → 2단계(입력 함수) → 3단계(Phase 0) → 4단계(메인 루프) → 5단계(UI)
```

현재 위치: **1단계 대기** — Phase 0 완료, 승인 후 구현 시작.
