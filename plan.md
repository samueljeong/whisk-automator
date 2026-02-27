# history.back 조건부 실행

selectAssetByName이 false를 반환하는 2가지 경우:
1. 검색 결과 없음 (페이지 이동 없음) → back 하면 안 됨
2. 클릭했지만 ref 증가 없음 (페이지 이동됨) → back 해야 함

수정: selectAssetByName이 경우2일 때 'navigated' 반환하도록 변경.
uploadReferences에서 'navigated'일 때만 history.back() 실행.
