# Flow 셀렉터 매핑 (Whisk → Flow)

## 상태: 조사 필요

Flow 페이지(`labs.google/fx/flow`)에서 `scripts/debug_flow.js`를 실행하여 아래 셀렉터를 채워야 합니다.

## 핵심 셀렉터 매핑

| 기능 | Whisk 셀렉터 | Flow 셀렉터 | 비고 |
|------|-------------|------------|------|
| 프롬프트 입력 | `textarea` (첫 번째) | ??? | textarea 또는 contenteditable |
| 생성 버튼 | 어두운 원형 버튼 (bg < 100) | ??? | 색상/aria-label 기반 |
| 모델 선택 | N/A | ??? | Nano Banana 2 / Imagen4 |
| 이미지/비디오 전환 | N/A | ??? | tab/radio/select |
| Ingredient 서랍 열기 | N/A | ??? | 버튼 또는 토글 |
| Ingredient 업로드 | N/A | ??? | showOpenFilePicker? drag&drop? paste? |
| Ingredient 선택/해제 | N/A | ??? | 클릭 토글? 체크박스? |
| 생성된 이미지 출력 | `img[width>100]` | ??? | 새 img 태그 감지 |
| 생성된 비디오 출력 | N/A | ??? | video 태그? |
| 진행 상태 표시 | 없음 (폴링) | ??? | 로딩 스피너? 프로그레스? |
| 다운로드 버튼 | N/A (fetch → blob) | ??? | 우클릭? 전용 버튼? |

## 업로드 방식 확인 사항

- [ ] `showOpenFilePicker` API 사용 여부
- [ ] `<input type="file">` 사용 여부
- [ ] Drag & Drop 사용 여부
- [ ] Clipboard paste 사용 여부

## Ingredient 재사용 확인

- [ ] 한 번 업로드한 ingredient를 여러 프롬프트에서 재사용 가능한지
- [ ] ingredient 선택/해제가 체크마크 토글 방식인지

## URL 패턴

- [ ] SPA 라우팅 여부
- [ ] 해시 기반 vs 경로 기반
- [ ] 쿼리 파라미터 사용 여부

## DOM 변화 신호

- [ ] 생성 완료 시: 새 img/video 태그 추가?
- [ ] 생성 완료 시: 속성 변경? (data-*, class 등)
- [ ] 에러 시: 에러 메시지 DOM 요소?

## 조사 방법

1. Flow 페이지 열기: `https://labs.google/fx/flow`
2. DevTools 콘솔에서 `scripts/debug_flow.js` 실행
3. 결과를 이 문서에 기록
4. 수동으로 각 기능 테스트하며 DOM 변화 관찰
