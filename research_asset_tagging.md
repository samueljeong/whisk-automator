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

### 조사 필요 사항
1. Flow에서 `@` 입력 시 자동완성이 뜨는 조건 (Slate.js 이벤트?)
2. `@태그` 선택 후 생성되는 DOM 구조 (void node? inline node?)
3. 에셋 이름 규칙: 한글 OK인지, 영문만인지
4. 프롬프트에 `@태그`를 직접 텍스트로 넣으면 인식되는지 vs 반드시 자동완성 선택 필요한지
