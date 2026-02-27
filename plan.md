# uploadNewAsset 패널 로딩 재시도 추가

## 원인
selectAssetByName 제거 후 uploadNewAsset 단독 실행 시, 패널이 아직 로딩 중인데 업로드 버튼을 바로 찾아서 전부 실패.

## 수정
패널 요소 탐색 + 업로드 버튼 찾기(방법 A/B/C)를 최대 3회 재시도 루프로 감싸기.
재시도 간격 1.5초. 실패 로그에 시도 횟수 표시.
