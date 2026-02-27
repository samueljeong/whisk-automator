# Flow 레퍼런스 업로드 — selectAssetByName 제거

## 수정 내용

### popup/popup.js `uploadReferences()` (~라인 2282-2300)

`selectAssetByName` 호출을 제거하고 항상 `uploadNewAsset`으로 직접 업로드.

이유: selectAssetByName이 에셋 클릭 → 상세 페이지 이동 → 이후 uploadNewAsset 고장.

selectAssetByName 함수 자체는 유지 (호출만 제거).
