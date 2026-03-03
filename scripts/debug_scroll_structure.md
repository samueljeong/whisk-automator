# Flow 스크롤 컨테이너 + 화면 밖 이미지 상태 진단

## 사용법
이미지 20~30개 이상 생성 후, 개발자 도구 콘솔(F12 → Console)에 아래 코드 붙여넣기.
결과는 자동으로 클립보드에 복사됨.

```js
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };

  p('=== Flow 스크롤/이미지 구조 진단 ===\n');

  // 1. 전체 이미지 현황
  const allImgs = document.querySelectorAll('img');
  const mediaImgs = [];
  const otherImgs = [];
  allImgs.forEach(img => {
    if (img.src && img.src.includes('getMediaUrlRedirect')) {
      mediaImgs.push(img);
    } else if (img.src && img.width > 50 && img.height > 50) {
      otherImgs.push(img);
    }
  });

  p(`📊 이미지 현황:`);
  p(`  전체 <img> 태그: ${allImgs.length}개`);
  p(`  getMediaUrlRedirect (생성 이미지): ${mediaImgs.length}개`);
  p(`  기타 큰 이미지 (50x50+): ${otherImgs.length}개`);

  // 2. 스크롤 컨테이너 찾기
  p(`\n🔍 스크롤 가능한 컨테이너 탐색:`);
  const scrollables = [];
  document.querySelectorAll('*').forEach(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) return;

    const isScrollable = (
      el.scrollHeight > el.clientHeight + 10 ||
      el.scrollWidth > el.clientWidth + 10
    );
    const hasOverflow = (
      style.overflow === 'auto' || style.overflow === 'scroll' ||
      style.overflowY === 'auto' || style.overflowY === 'scroll' ||
      style.overflowX === 'auto' || style.overflowX === 'scroll'
    );

    if (isScrollable || hasOverflow) {
      scrollables.push({
        el,
        tag: el.tagName,
        cls: (el.className?.toString() || '').slice(0, 60),
        rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        scrollTop: el.scrollTop,
        overflow: style.overflow + '/' + style.overflowY,
        hasOverflow,
        isScrollable
      });
    }
  });

  // window 자체도 체크
  scrollables.push({
    el: document.documentElement,
    tag: 'HTML',
    cls: 'document.documentElement',
    rect: `${window.innerWidth}x${window.innerHeight}`,
    scrollH: document.documentElement.scrollHeight,
    clientH: window.innerHeight,
    scrollTop: window.scrollY,
    overflow: 'window',
    hasOverflow: true,
    isScrollable: document.documentElement.scrollHeight > window.innerHeight + 10
  });

  scrollables.sort((a, b) => (b.scrollH - b.clientH) - (a.scrollH - a.clientH));

  scrollables.slice(0, 10).forEach((s, i) => {
    const scrollRange = s.scrollH - s.clientH;
    p(`  [${i}] ${s.tag}.${s.cls}`);
    p(`      크기: ${s.rect} | scrollHeight: ${s.scrollH} | clientHeight: ${s.clientH}`);
    p(`      스크롤 가능 범위: ${scrollRange}px | 현재 위치: ${Math.round(s.scrollTop)}px`);
    p(`      overflow: ${s.overflow} | 실제 스크롤 가능: ${s.isScrollable}`);
  });

  // 3. 결과 행 컨테이너 분석 (sc-8cc14b4-2 패턴)
  p(`\n📐 결과 행 (이미지 카드) 분석:`);
  const resultRows = [];
  document.querySelectorAll('div[class*="sc-"]').forEach(div => {
    const rect = div.getBoundingClientRect();
    // 결과 행은 보통 너비 > 500, 높이 200~400
    if (rect.width > 500 && rect.height > 150 && rect.height < 500) {
      const imgs = div.querySelectorAll('img');
      const hasMedia = Array.from(imgs).some(i => i.src?.includes('getMediaUrlRedirect'));
      if (imgs.length > 0 || hasMedia) {
        resultRows.push({
          el: div,
          cls: (div.className?.toString() || '').slice(0, 60),
          rect,
          imgCount: imgs.length,
          hasMedia,
          y: Math.round(rect.top)
        });
      }
    }
  });

  p(`  결과 행 수: ${resultRows.length}개`);
  if (resultRows.length > 0) {
    const minY = Math.min(...resultRows.map(r => r.y));
    const maxY = Math.max(...resultRows.map(r => r.y));
    p(`  Y 범위: ${minY}px ~ ${maxY}px`);
    p(`  뷰포트: 0 ~ ${window.innerHeight}px`);
    p(`  화면 밖 행: ${resultRows.filter(r => r.y < 0 || r.y > window.innerHeight).length}개`);

    // 처음 3개, 마지막 3개 보여주기
    const show = [...resultRows.slice(0, 3), ...resultRows.slice(-3)];
    show.forEach((r, i) => {
      const inView = r.y >= 0 && r.y < window.innerHeight;
      p(`  행 ${i < 3 ? i : resultRows.length - 3 + (i - 3)}: y=${r.y} img=${r.imgCount} media=${r.hasMedia} ${inView ? '✅뷰포트' : '❌화면밖'} cls=${r.cls}`);
    });
  }

  // 4. 화면 밖 이미지 상태 (핵심 진단)
  p(`\n🎯 핵심: 화면 밖 이미지 상태`);

  // 모든 이미지의 위치별 분류
  const imgsByPosition = { inView: [], above: [], below: [] };
  allImgs.forEach(img => {
    if (img.width < 50 && img.height < 50) return; // 아이콘 제외
    const rect = img.getBoundingClientRect();
    const info = {
      y: Math.round(rect.top),
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      hasSrc: !!img.src,
      isMedia: img.src?.includes('getMediaUrlRedirect') || false,
      srcPrefix: (img.src || 'EMPTY').slice(0, 80),
      naturalSize: `${img.naturalWidth}x${img.naturalHeight}`,
      loading: img.loading || 'default',
      complete: img.complete
    };

    if (rect.top >= 0 && rect.top < window.innerHeight) {
      imgsByPosition.inView.push(info);
    } else if (rect.top < 0) {
      imgsByPosition.above.push(info);
    } else {
      imgsByPosition.below.push(info);
    }
  });

  p(`  뷰포트 안: ${imgsByPosition.inView.length}개`);
  p(`  뷰포트 위 (스크롤 지나감): ${imgsByPosition.above.length}개`);
  p(`  뷰포트 아래 (아직 안 보임): ${imgsByPosition.below.length}개`);

  // 각 영역의 이미지 src 상태
  for (const [zone, imgs] of Object.entries(imgsByPosition)) {
    if (imgs.length === 0) continue;
    const mediaCount = imgs.filter(i => i.isMedia).length;
    const emptySrc = imgs.filter(i => !i.hasSrc || i.srcPrefix === 'EMPTY').length;
    const placeholderCount = imgs.filter(i => i.srcPrefix.includes('placeholder') || i.srcPrefix.includes('data:image/svg')).length;

    p(`\n  [${zone}] 상세:`);
    p(`    media URL: ${mediaCount}개 | 빈 src: ${emptySrc}개 | placeholder: ${placeholderCount}개`);

    // 샘플 (최대 5개)
    imgs.slice(0, 5).forEach((img, i) => {
      p(`    샘플${i}: y=${img.y} ${img.size} nat=${img.naturalSize} complete=${img.complete} src=${img.srcPrefix}`);
    });
  }

  // 5. 스크롤 테스트 (자동 스크롤 후 변화 관찰)
  p(`\n🔄 스크롤 테스트:`);

  // 가장 큰 스크롤 가능 컨테이너 찾기
  const mainScroll = scrollables.find(s => s.isScrollable && s.scrollH - s.clientH > 200);
  if (mainScroll) {
    const beforeMediaCount = document.querySelectorAll('img[src*="getMediaUrlRedirect"]').length;
    p(`  스크롤 전 media 이미지: ${beforeMediaCount}개`);
    p(`  스크롤 대상: ${mainScroll.tag}.${mainScroll.cls}`);

    // 맨 아래로 스크롤
    const scrollEl = mainScroll.tag === 'HTML' ? window : mainScroll.el;
    const scrollAmount = mainScroll.scrollH - mainScroll.clientH;
    p(`  맨 아래로 스크롤 (${scrollAmount}px)...`);

    if (mainScroll.tag === 'HTML') {
      window.scrollTo(0, scrollAmount);
    } else {
      mainScroll.el.scrollTop = scrollAmount;
    }

    // 이미지 로딩 대기
    await new Promise(r => setTimeout(r, 3000));

    const afterMediaCount = document.querySelectorAll('img[src*="getMediaUrlRedirect"]').length;
    p(`  스크롤 후 media 이미지: ${afterMediaCount}개 (${afterMediaCount - beforeMediaCount > 0 ? '+' : ''}${afterMediaCount - beforeMediaCount})`);

    // 다시 원래 위치로
    if (mainScroll.tag === 'HTML') {
      window.scrollTo(0, 0);
    } else {
      mainScroll.el.scrollTop = 0;
    }
    await new Promise(r => setTimeout(r, 1000));

    const resetMediaCount = document.querySelectorAll('img[src*="getMediaUrlRedirect"]').length;
    p(`  원위치 복귀 후 media 이미지: ${resetMediaCount}개`);

    if (afterMediaCount > beforeMediaCount) {
      p(`  ✅ 스크롤하면 새 이미지가 로드됨! (lazy loading 확인)`);
    } else if (afterMediaCount === beforeMediaCount && beforeMediaCount > 0) {
      p(`  🤔 스크롤해도 변화 없음 — 모든 이미지가 이미 DOM에 있거나 가상 스크롤 아님`);
    } else {
      p(`  ❓ 예상 밖 결과 — Flow 구조 추가 분석 필요`);
    }
  } else {
    p(`  ⚠️ 스크롤 가능한 큰 컨테이너 못 찾음`);
  }

  // 6. 점진적 스크롤 테스트
  if (mainScroll && mainScroll.scrollH - mainScroll.clientH > 500) {
    p(`\n📜 점진적 스크롤 (500px 단위):`);
    const scrollEl = mainScroll.tag === 'HTML' ? null : mainScroll.el;
    const maxScroll = mainScroll.scrollH - mainScroll.clientH;
    const step = 500;

    for (let pos = 0; pos <= maxScroll; pos += step) {
      if (scrollEl) {
        scrollEl.scrollTop = pos;
      } else {
        window.scrollTo(0, pos);
      }
      await new Promise(r => setTimeout(r, 1500));

      const mediaCount = document.querySelectorAll('img[src*="getMediaUrlRedirect"]').length;
      const totalImgs = document.querySelectorAll('img').length;
      p(`  scroll=${pos}px: media=${mediaCount} total_img=${totalImgs}`);

      if (pos > maxScroll - step) break; // 마지막
    }

    // 원위치
    if (scrollEl) {
      scrollEl.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
    }
  }

  // 결과 복사
  const result = log.join('\n');
  try {
    await navigator.clipboard.writeText(result);
    p('\n✅ 결과가 클립보드에 복사됨!');
  } catch (e) {
    console.log('\n❌ 복사 실패 — 위 로그를 수동 복사하세요');
  }

  console.log('\n=== 진단 완료 ===');
})();
```
