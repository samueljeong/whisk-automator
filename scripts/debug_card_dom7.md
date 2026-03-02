# 제출 직후 새 타일 감지 테스트

프롬프트 제출 직후 새로운 `<a>` 태그(edit URL)가 나타나는지 확인합니다.
Flow 탭에서 **생성 버튼 클릭 직전에** 콘솔에 붙여넣고, 그 다음 수동으로 생성 버튼을 클릭하세요.

```js
(function(){
  // 1. 현재 모든 edit URL 스냅샷
  var before = new Set();
  document.querySelectorAll('a').forEach(function(a){
    if(a.href && a.href.includes('/edit/')) before.add(a.href);
  });
  console.log('=== 현재 edit URL 수:', before.size, '===');
  console.log('이제 생성 버튼을 클릭하세요. 5초마다 새 URL 체크합니다.');

  var checks = 0;
  var maxChecks = 30; // 150초
  var found = [];

  var timer = setInterval(function(){
    checks++;
    var newUrls = [];
    document.querySelectorAll('a').forEach(function(a){
      if(a.href && a.href.includes('/edit/') && !before.has(a.href)){
        newUrls.push(a.href);
      }
    });

    if(newUrls.length > 0 && found.length === 0){
      found = newUrls;
      console.log('\n=== 새 edit URL ' + newUrls.length + '개 감지! (' + (checks*5) + '초) ===');
      for(var i=0;i<newUrls.length;i++){
        var editId = newUrls[i].split('/edit/')[1];
        console.log('  [' + (i+1) + '] editId: ' + editId);
        console.log('      URL: ' + newUrls[i]);

        // 이 URL 주변의 img 태그 찾기
        var links = document.querySelectorAll('a[href*="' + editId + '"]');
        for(var li=0;li<links.length;li++){
          var imgs = links[li].querySelectorAll('img');
          console.log('      링크 안 img 수: ' + imgs.length);
          for(var ii=0;ii<imgs.length;ii++){
            console.log('        img src: ' + (imgs[ii].src||'').substring(0,100));
            console.log('        img size: ' + imgs[ii].width + 'x' + imgs[ii].height);
          }
        }
      }
    } else if(found.length > 0){
      // 이미 찾은 URL의 이미지 상태 변화 추적
      for(var fi=0;fi<found.length;fi++){
        var fEditId = found[fi].split('/edit/')[1];
        var fLinks = document.querySelectorAll('a[href*="' + fEditId + '"]');
        for(var fli=0;fli<fLinks.length;fli++){
          var fImgs = fLinks[fli].querySelectorAll('img');
          if(fImgs.length>0){
            for(var fii=0;fii<fImgs.length;fii++){
              if(fImgs[fii].src && fImgs[fii].src.includes('getMediaUrlRedirect')){
                console.log('=== 이미지 생성 완료! (' + (checks*5) + '초) ===');
                console.log('  editId: ' + fEditId);
                console.log('  img src: ' + fImgs[fii].src.substring(0,100));
                clearInterval(timer);
                return;
              }
            }
          }
        }
      }
      console.log('체크 ' + checks + '/' + maxChecks + ': 이미지 아직 생성 중...');
    } else {
      console.log('체크 ' + checks + '/' + maxChecks + ': 새 URL 없음');
    }

    if(checks >= maxChecks){
      console.log('=== 타임아웃 ===');
      clearInterval(timer);
    }
  }, 5000);
})();
```
