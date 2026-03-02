# 상세 뷰(Detail View) DOM 구조 탐색

Whisk 갤러리를 **상세 뷰(리스트 뷰)**로 전환한 뒤, 콘솔에 붙여넣으세요.
각 카드(이미지) 주변에서 프롬프트 텍스트가 어디에 있는지 찾습니다.

```js
void function(){
  // 1) 갤러리 이미지(getMediaUrlRedirect) 전부 찾기
  var imgs = document.querySelectorAll('img');
  var genImgs = [];
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].src && imgs[i].src.includes('getMediaUrlRedirect')) {
      genImgs.push(imgs[i]);
    }
  }
  console.log('=== 생성 이미지 수:', genImgs.length, '===');

  // 2) 각 이미지에서 위로 올라가며 텍스트 탐색
  for (var g = 0; g < Math.min(genImgs.length, 3); g++) {
    console.log('\n--- 이미지 ' + (g+1) + ' ---');
    console.log('img src:', genImgs[g].src.substring(0, 80));

    // 부모 a 태그
    var link = genImgs[g].closest('a');
    if (link) {
      console.log('closest <a> href:', link.href);
    }

    // 위로 10단계까지 탐색
    var el = genImgs[g];
    for (var depth = 0; depth < 10; depth++) {
      el = el.parentElement;
      if (!el) break;

      var tag = el.tagName.toLowerCase();
      var cls = el.className ? (' class="' + (typeof el.className === 'string' ? el.className.substring(0, 80) : '') + '"') : '';

      // 이 요소의 직접 텍스트 노드들
      var directText = '';
      for (var c = 0; c < el.childNodes.length; c++) {
        if (el.childNodes[c].nodeType === 3) {
          directText += el.childNodes[c].textContent.trim();
        }
      }

      // 이 요소 전체 textContent 길이
      var totalText = (el.textContent || '').trim();
      var textLen = totalText.length;

      // 형제 요소 중 텍스트가 있는 것
      var siblings = el.parentElement ? el.parentElement.children : [];
      var sibTexts = [];
      for (var s = 0; s < siblings.length; s++) {
        if (siblings[s] !== el) {
          var st = (siblings[s].textContent || '').trim();
          if (st.length > 10) {
            sibTexts.push({
              tag: siblings[s].tagName.toLowerCase(),
              cls: (siblings[s].className || '').substring(0, 40),
              text: st.substring(0, 100),
              textLen: st.length
            });
          }
        }
      }

      console.log('depth ' + depth + ': <' + tag + cls + '> directText="' + directText.substring(0, 50) + '" totalTextLen=' + textLen);
      if (sibTexts.length > 0) {
        console.log('  형제 텍스트:', JSON.stringify(sibTexts));
      }

      // 텍스트가 30자 이상이면 처음 200자 출력
      if (textLen > 30) {
        console.log('  전체 텍스트 (처음 200자): "' + totalText.substring(0, 200) + '"');
      }
    }
  }

  // 3) 프롬프트 텍스트 직접 검색 (페이지 전체에서)
  console.log('\n=== 프롬프트 텍스트 검색 ===');
  var allElements = document.querySelectorAll('*');
  var textElements = [];
  for (var t = 0; t < allElements.length; t++) {
    var tc = (allElements[t].textContent || '').trim();
    // 50자 이상이고 '고급' 또는 '화풍'이 포함된 요소 (프롬프트 특성)
    if (tc.length > 50 && (tc.includes('고급') || tc.includes('화풍') || tc.includes('무협'))) {
      // 자식이 없거나 자식의 textContent와 같은 경우 = leaf
      var children = allElements[t].children;
      var isLeaf = true;
      for (var ch = 0; ch < children.length; ch++) {
        if ((children[ch].textContent || '').trim() === tc) {
          isLeaf = false;
          break;
        }
      }
      if (isLeaf) {
        textElements.push({
          tag: allElements[t].tagName.toLowerCase(),
          cls: (allElements[t].className || '').substring(0, 60),
          textLen: tc.length,
          text: tc.substring(0, 150),
          rect: allElements[t].getBoundingClientRect()
        });
      }
    }
  }
  console.log('프롬프트 텍스트 요소 수:', textElements.length);
  for (var te = 0; te < textElements.length; te++) {
    console.log('  [' + (te+1) + '] <' + textElements[te].tag + ' class="' + textElements[te].cls + '"> len=' + textElements[te].textLen);
    console.log('    rect: top=' + Math.round(textElements[te].rect.top) + ' left=' + Math.round(textElements[te].rect.left));
    console.log('    text: "' + textElements[te].text + '"');
  }
}();
```
