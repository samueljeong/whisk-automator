# 계획: editId 추적 기반 파이프라인 매칭

## 수정 파일
- `popup/popup.js` (단일 파일)

## 구현 단계

- [ ] **1단계: Phase 2 — editId 캡처 로직 추가**
  - 생성 클릭 전: `document.querySelectorAll('a')` → `/edit/` 포함 href 전부 Set에 저장
  - 생성 클릭 후: 최대 10초 폴링으로 새 `<a>` 태그 감지
  - 새 editId 발견 → `editIdMap[editId] = j` (j = 현재 프롬프트 인덱스)
  - 10초 내 미발견 → 경고 로그 남기고 계속 진행
  - 위치: Phase 2 루프 내, `clickGenerate()` 호출 후

- [ ] **2단계: Phase 3 — editId 기반 매칭으로 교체**
  - 새 이미지 감지 시: `img.closest('a')` → href에서 editId 추출
  - `editIdMap[editId]`로 promptIndex 조회
  - 매칭 성공 → 해당 프롬프트의 filename으로 다운로드
  - 매칭 실패 → 기존 위치 폴백 (남은 프롬프트 중 첫 번째) 유지
  - `findPromptForImage()` (텍스트 매칭) 호출 제거

- [ ] **3단계: 5번째 이미지 누락 문제 대응**
  - 조기 종료 조건 완화: `almostDone` 조건이 1개 모자란 상태에서 60초 대기 후 끝냄
  - maxWait를 충분히 설정 (이미지당 60초)
  - STALL_TIMEOUT을 downloadedCount < totalCount-1이면 120초로 늘림

- [ ] **4단계: 테스트**
  - 5개 프롬프트로 실행
  - 확인: 5개 모두 다운로드, 파일명 정확히 매칭

## 예상 코드 변경

### Phase 2 (제출 루프) — clickGenerate() 후:
```js
// editId 캡처: 생성 클릭 전 스냅샷
var preClickEditIds = new Set();
document.querySelectorAll('a').forEach(function(a) {
  if (a.href && a.href.includes('/edit/')) preClickEditIds.add(a.href);
});

await clickGenerate();

// 새 editId 감지 (최대 10초)
var editIdFound = false;
for (var ew = 0; ew < 20; ew++) {
  await sleep(500);
  document.querySelectorAll('a').forEach(function(a) {
    if (a.href && a.href.includes('/edit/') && !preClickEditIds.has(a.href)) {
      var eid = a.href.split('/edit/')[1];
      if (eid && !editIdMap[eid]) {
        editIdMap[eid] = j;
        editIdFound = true;
        console.log('[Flow Auto] editId 캡처: ' + eid + ' → 프롬프트 ' + (j+1));
      }
    }
  });
  if (editIdFound) break;
}
if (!editIdFound) {
  console.warn('[Flow Auto] editId 캡처 실패: 프롬프트 ' + (j+1));
}
```

### Phase 3 (다운로드) — 매칭 부분:
```js
// editId 매칭
var matchIdx = -1;
var imgLink = newImg.closest('a');
if (imgLink && imgLink.href && imgLink.href.includes('/edit/')) {
  var eid = imgLink.href.split('/edit/')[1];
  if (eid && editIdMap.hasOwnProperty(eid)) {
    matchIdx = editIdMap[eid];
    console.log('[Flow Auto] editId 매칭: ' + eid + ' → 프롬프트 ' + (matchIdx+1));
  }
}

// editId 매칭 실패 → 위치 폴백
if (matchIdx < 0) { ... 기존 폴백 ... }
```
