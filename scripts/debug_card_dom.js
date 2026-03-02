// Flow 이미지 카드 DOM 구조 진단 스크립트
// 콘솔에 붙여넣기 해서 실행

(function() {
  var imgs = document.querySelectorAll('img');
  var genImages = [];

  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].src && imgs[i].src.includes('getMediaUrlRedirect')) {
      genImages.push(imgs[i]);
    }
  }

  console.log('=== 생성 이미지 ' + genImages.length + '개 발견 ===');

  // 첫 3개만 분석
  for (var gi = 0; gi < Math.min(3, genImages.length); gi++) {
    var img = genImages[gi];
    console.log('\n--- 이미지 #' + (gi + 1) + ' ---');
    console.log('src:', img.src.substring(0, 80) + '...');
    console.log('size:', img.width + 'x' + img.height);

    // 부모 체인 탐색
    var el = img;
    for (var d = 0; d < 15; d++) {
      el = el.parentElement;
      if (!el || el === document.body) break;

      var text = (el.textContent || '').trim();
      var tag = el.tagName.toLowerCase();
      var cls = el.className ? (typeof el.className === 'string' ? el.className : '') : '';
      var rect = el.getBoundingClientRect();

      console.log(
        'depth=' + d + ' <' + tag + '> class="' + cls.substring(0, 60) + '"' +
        ' size=' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
        ' textLen=' + text.length +
        (text.length > 0 && text.length < 500 ? ' text="' + text.substring(0, 150) + '"' : '')
      );

      // 프롬프트 텍스트가 보이는 카드를 찾았으면 상세 출력
      if (text.length > 50 && text.length < 5000) {
        console.log('  → 전체 텍스트 (최대 300자):', text.substring(0, 300));

        // 이 컨테이너의 직계 자식들 확인
        var children = el.children;
        console.log('  → 직계 자식 ' + children.length + '개:');
        for (var ci = 0; ci < children.length; ci++) {
          var child = children[ci];
          var childText = (child.textContent || '').trim();
          console.log('    [' + ci + '] <' + child.tagName.toLowerCase() + '>' +
            ' class="' + (child.className || '').toString().substring(0, 40) + '"' +
            ' text="' + childText.substring(0, 100) + '"');
        }
      }
    }
  }

  console.log('\n=== 진단 완료 ===');
})();
