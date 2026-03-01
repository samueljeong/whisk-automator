# 다운로드 깨짐 리서치

## 문제
"다운로드 폴더 논의 이후부터 다운로드가 안 된다"

## 원인: 커밋 146d175 (이번 세션에서 내가 만든 변경)

### 깨진 코드 (현재)
```js
// downloadBatch 함수 안 (줄 ~3028)
chrome.runtime.sendMessage({
  action: 'DOWNLOAD_IMAGE',
  url: verifiedImages[di].img.src,  // ← 원본 페이지의 img.src (blob: URL)
  filename: savePath + '/' + fullFilename
});
```

### 동작하던 코드 (146d175 직전 = cfcc9ac)
```js
var blob = verifiedImages[di].blob;
var reader = new FileReader();
var dataUrl = await new Promise(function(resolve, reject) {
  reader.onload = function() { resolve(reader.result); };
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});
chrome.runtime.sendMessage({
  action: 'DOWNLOAD_IMAGE',
  url: dataUrl,  // ← data:image/png;base64,... (어디서든 접근 가능)
  filename: savePath + '/' + fullFilename
});
```

### 왜 깨졌나
1. `verifiedImages[di].img.src`는 Flow 페이지 안의 이미지 URL
2. 이 URL은 `getMediaUrlRedirect` 패턴인데, **content script에서 fetch한 blob은 이미 있음**
3. 원본 URL을 background에 넘기면 `chrome.downloads.download()`이 받지만,
   이 URL이 인증 필요한 경우나 리다이렉트 문제로 실패할 수 있음
4. **data URL**은 이미지 데이터 자체가 base64로 인코딩되어 있어 어디서든 동작함

### 동시에 바뀐 것 (커밋 cfcc9ac)
Phase 3 폴링 방식도 변경됨:
- 이전: `seenNewSrcs` Set으로 중복 방지, 배열에 누적
- 변경: `detectedNewImages = []` 매 사이클 리셋, fresh DOM scan

이 변경은 심각한 문제는 아니지만, 이전 동작 상태로 함께 되돌리는 게 안전.

## 결론
**커밋 2개를 되돌리면 됨**: cfcc9ac, 146d175
이 2개가 이번 세션에서 내가 추가한 변경. 그 이전 상태(e856585)가 "다운로드 잘 되던" 상태.
