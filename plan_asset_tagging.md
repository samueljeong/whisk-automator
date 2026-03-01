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

## 사전 조건

- [ ] **0. Flow @자동완성 DOM 조사** — 구현 전 반드시 확인
  - Flow 페이지에서 `@` 입력 시 자동완성 패널의 DOM 구조 파악
  - 자동완성 패널 셀렉터 (기존 Ingredient 패널과 다를 수 있음)
  - `@` 입력 → 패널 뜨기까지 딜레이 측정
  - ArrowDown + Enter로 선택 가능한지 확인
  - 에셋 이름 한글 지원 여부
  - **방법**: debug 스크립트 or 사무엘님 수동 테스트 + 스크린샷

---

## 구현 단계

### Phase 1: 프롬프트 파서 수정 (`popup.js`)

- [ ] **1-1. 새 프롬프트 형식 파싱 함수 작성**
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
  - 기존 `[캐릭터명]` 파싱은 하위호환을 위해 유지할지 제거할지 → 사무엘님 결정

- [ ] **1-2. 세그먼트에서 필요한 에셋 목록 추출**
  - 기존: `extractCharacterTags()` → 브라켓에서 추출
  - 변경: `@태그`에서 고유 에셋명 추출 → Phase 0 업로드에 전달

### Phase 2: 프롬프트 입력 방식 변경 (`popup.js`)

- [ ] **2-1. `fillPromptWithAssets()` 새 함수 작성**
  - 기존 `fillPrompt()` + `uploadReferences()`를 통합 대체
  - 세그먼트 배열을 순서대로 입력:
    ```
    text 세그먼트 → Slate에 텍스트 삽입
    asset 세그먼트 → "@" 타이핑 → 자동완성 대기 → 이름 입력 → Enter 선택
    ```
  - 각 단계 사이 적절한 딜레이 (자동완성 패널 로딩 대기)

- [ ] **2-2. @자동완성 선택 함수 작성 (`selectAssetByAtMention`)**
  - Slate 에디터에 `@` 문자 입력 (InputEvent 시뮬레이션)
  - 자동완성 패널 출현 대기 (polling, 최대 3초)
  - 에셋 이름 타이핑 (필터링)
  - 검색 결과 확인 → ArrowDown + Enter
  - 선택 완료 확인 (@mention 노드 생성 여부)
  - 실패 시 폴백: 기존 Ingredient 방식으로 전환

- [ ] **2-3. Slate 에디터 텍스트 입력 함수 개선**
  - 현재 `fillPrompt()`: 전체 텍스트를 한번에 삽입
  - 변경: 세그먼트별 부분 삽입 가능하도록 수정
  - @mention 노드 뒤에 커서 위치 확인 후 이어서 텍스트 입력

### Phase 3: Phase 0 (에셋 사전 업로드) 수정

- [ ] **3-1. 에셋 이름 추출 소스 변경**
  - 기존: `[캐릭터명]` 브라켓에서 추출 → buildCharacterMap
  - 변경: `@태그` 에서 추출 → flowTag로 에셋 검색/업로드
  - Phase 0의 검색/업로드 로직 자체는 동일 (이름만 바뀜)

- [ ] **3-2. 에셋 업로드 시 이름 규칙 통일**
  - 업로드 파일명 = flowTag (예: `yonga.png`)
  - Flow 에셋 라이브러리에서 `@yonga`로 검색 가능하도록

### Phase 4: 메인 루프 수정

- [ ] **4-1. `runFlowAutomation` 메인 루프 수정**
  - 기존 흐름: `uploadReferences()` → `fillPrompt()` → 생성
  - 변경 흐름: `fillPromptWithAssets(segments)` → 생성
  - uploadReferences 호출 제거 (에셋이 프롬프트 안에 인라인됨)

- [ ] **4-2. 에셋 정렬 로직 재검토**
  - 기존: 같은 캐릭터 그룹을 모아서 에셋 전환 최소화
  - 변경: @mention 방식에서는 매번 에셋을 재선택하므로 정렬 불필요할 수 있음
  - 또는 유지하면 자동완성 캐시가 도움될 수도 → 테스트 후 결정

### Phase 5: UI 업데이트

- [ ] **5-1. 프롬프트 입력 가이드 수정**
  - placeholder 텍스트 변경: `@캐릭터명`을 프롬프트 안에 넣으라는 안내
  - 예시 업데이트

- [ ] **5-2. 캐릭터 패널에 flowTag 표시**
  - 캐릭터 목록에서 각 캐릭터의 `@태그` 확인 가능하도록
  - flowTag 미설정 캐릭터에 경고 표시

---

## 하위호환 고려

| 항목 | 방침 |
|------|------|
| 기존 `[캐릭터명]` 형식 | **제거 확정** — @태그 형식만 지원 |
| flowTag 없는 캐릭터 | 에러 메시지 + 기존 void node 방식 폴백 |
| 기존 프롬프트 파일 (.txt) | 마이그레이션 필요 시 변환 스크립트 작성 |

---

## 리스크 & 대안

| 리스크 | 대안 |
|--------|------|
| @자동완성 패널이 JS 이벤트로 트리거 안 될 수 있음 | Slate.js 내부 API로 직접 @mention 노드 삽입 |
| 자동완성 딜레이가 불안정할 수 있음 | polling + 재시도 로직 |
| Flow 업데이트로 DOM 구조 변경 | 셀렉터를 상수로 분리, 빠른 수정 가능하게 |

---

## 예상 수정 파일

| 파일 | 변경 규모 | 내용 |
|------|----------|------|
| `popup/popup.js` | 대 | 파서, fillPromptWithAssets, selectAssetByAtMention, 메인 루프 |
| `popup/popup.html` | 소 | placeholder/가이드 텍스트 |
| `docs/flow_selectors.md` | 소 | @자동완성 패널 셀렉터 추가 |

---

## 작업 순서

```
0단계(DOM 조사) → 1단계(파서) → 2단계(입력 함수) → 3단계(Phase 0) → 4단계(메인 루프) → 5단계(UI)
```

**0단계가 블로커** — @자동완성 DOM 구조를 모르면 2단계 구현 불가.
0단계 확인 후 나머지는 순차적으로 진행.
