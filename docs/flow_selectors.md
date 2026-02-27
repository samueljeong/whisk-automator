# Flow 셀렉터 매핑 (Whisk → Flow)

## 상태: 1차 조사 완료 (2026-02-27)

URL: `labs.google/fx/ko/tools/flow/project/{uuid}`

## 핵심 셀렉터 매핑

| 기능 | Whisk 셀렉터 | Flow 셀렉터 | 비고 |
|------|-------------|------------|------|
| 프롬프트 입력 | `textarea` (첫 번째) | `div[contenteditable]` (클래스: `sc-f60f777e-0`, `sc-c70e41ad-5`) | contentEditable DIV, 565x20 하단 영역 |
| 생성 버튼 | 어두운 원형 버튼 | 텍스트 "arrow_forward만들기" 포함 버튼 (bg: `rgba(255,255,255,0.75)`) | 32x32, 하단 우측 |
| 모델 선택 | N/A | 텍스트에 "Nano Banana" 포함 버튼 (164x34) | 클릭→드롭다운 예상 |
| 이미지/비디오 전환 | N/A | ??? (tab role DIV 2개 존재, 30x30 / 60x60) | 2차 조사 필요 |
| Ingredient 추가 | N/A | 텍스트 "add_2만들기" 포함 버튼 (32x32, 하단 좌측) | 프롬프트 입력 옆 |
| Ingredient 업로드 | N/A | `input[type=file][accept="image/*"]` (부모: `sc-c7ee1759-1`) | 기존 interceptor 활용 가능 |
| Ingredient 선택/해제 | N/A | ??? | 2차 조사 필요 |
| 생성된 이미지 출력 | `img[width>100]` | ??? | 2차 조사 (생성 후 관찰) |
| 생성된 비디오 출력 | N/A | ??? | 2차 조사 (생성 후 관찰) |
| 진행 상태 표시 | 없음 (폴링) | ??? | 2차 조사 |
| 다운로드 버튼 | N/A | ??? | 2차 조사 |

## 1차 조사 결과 상세

### 레이아웃 구조 (Y좌표 기준)
```
Y=14~40   : 상단 툴바
            - arrow_back돌아가기 (뒤로가기)
            - 프로젝트 이름 (input, "수정 가능한 텍스트")
            - more_vert옵션 더보기
            - search검색
            - filter_list정렬 및 필터링
            - add미디어 추가
            - play_movies장면 빌더
            - settings_2타일 그리드 설정 보기
            - more_vert더 생성하기
            - [48x48 아이콘 버튼]

Y=60~850  : 메인 콘텐츠 영역 (생성된 이미지/영상)

Y=851     : 프롬프트 입력 (contentEditable DIV)

Y=882~883 : 하단 컨트롤 바
            - [131] add_2만들기 (ingredient 추가?)
            - [511] 🍌 Nano Banana Pro + crop_16_9 + x1 (모델/비율/수량)
            - [680] arrow_forward만들기 (생성 버튼, 흰색 배경)
```

### 모델 선택 버튼 분석
버튼 텍스트: `🍌 Nano Banana Procrop_16_9x1`
→ 세 요소 결합으로 추정:
- `🍌 Nano Banana Pro` (모델명)
- `crop_16_9` (종횡비 아이콘 - 16:9)
- `x1` (생성 수량)

### 파일 업로드
- `input[type=file][accept="image/*"]` 존재 → 기존 interceptor.js 파일 업로드 가로채기 활용 가능
- Flow도 `showOpenFilePicker` 또는 `input.click()` 사용 예상

### URL 패턴
- [x] 경로 기반 라우팅: `/fx/ko/tools/flow/project/{uuid}`
- 언어 코드 포함: `/ko/`

## 2차 조사 필요 항목

1. **모델 드롭다운 내용**: 모델 버튼 클릭 시 나타나는 메뉴 구조
2. **이미지/비디오 전환**: 두 tab 역할 DIV의 기능 확인
3. **ingredient 추가 플로우**: "add_2만들기" 클릭 후 동작
4. **생성 완료 감지**: 이미지 생성 후 DOM 변화
5. **다운로드 방법**: 생성된 이미지/영상의 다운로드 메커니즘

## 2차 디버그 스크립트

`scripts/debug_flow_2.js` 실행하여 모델 메뉴, 탭, ingredient 추가 등 세부 조사
