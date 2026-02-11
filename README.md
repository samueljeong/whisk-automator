# Whisk 자동화 도구

Google Whisk AI 이미지 대량 생성 자동화 크롬 확장프로그램

## 기능

- 프롬프트 대량 입력 (텍스트 직접 입력 또는 txt 파일 불러오기)
- 자동 생성 실행 (순차적으로 프롬프트 입력 → Generate 클릭 → 완료 대기)
- 자동 다운로드 (생성된 이미지 자동 저장)
- 진행 상황 실시간 표시

## 설치 방법

1. Chrome에서 `chrome://extensions` 열기
2. 우측 상단 "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `whisk-automator` 폴더 선택

## 사용 방법

1. [Google Whisk](https://labs.google/fx/tools/whisk) 페이지 접속
2. 확장프로그램 아이콘 클릭
3. 프롬프트 입력 (줄바꿈으로 구분) 또는 txt 파일 불러오기
4. "시작" 버튼 클릭

## 설정

- **자동 다운로드**: 생성된 이미지 자동 저장 (기본 ON)
- **생성 간격**: 다음 프롬프트 실행 전 대기 시간 (기본 3초)

## 파일 구조

```
whisk-automator/
├── manifest.json         # 확장프로그램 설정
├── popup/
│   ├── popup.html        # 팝업 UI
│   ├── popup.css         # 스타일
│   └── popup.js          # 팝업 로직
├── content/
│   └── content.js        # Whisk 페이지 조작
├── background/
│   └── background.js     # 다운로드 처리
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 주의사항

- Google 계정 로그인 필요
- Whisk DOM 구조가 변경되면 선택자 업데이트 필요할 수 있음
- 너무 빠른 자동화는 차단될 수 있으니 적절한 간격 유지

## 다운로드 위치

이미지는 Chrome 기본 다운로드 폴더의 `whisk-images/` 하위 폴더에 저장됩니다.
