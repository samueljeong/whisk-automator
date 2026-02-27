# selectAssetByName 실패 시 페이지 복귀

selectAssetByName이 에셋 카드 클릭 → 상세 페이지 이동 → ref 증가 없음 → false 반환.
이후 uploadNewAsset이 엉뚱한 페이지에서 실행됨.

수정: uploadReferences에서 selected===false일 때 history.back() + sleep(1500) 추가.
