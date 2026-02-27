// Flow DOM Debug - 6차: 실제 이미지 생성 → 완료 감지 + 다운로드 방법 관찰
// ⚠️ 크레딧 1개 사용됨
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function simulateRealClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }

  p('=== Flow 생성 테스트 + 완료 감지 ===');

  // 1. 생성 전 이미지/비디오 수 기록
  const beforeImgs = document.querySelectorAll('img').length;
  const beforeVids = document.querySelectorAll('video').length;
  p(`생성 전: img=${beforeImgs}, video=${beforeVids}`);

  // 2. MutationObserver 설치 — DOM 변화 기록
  const changes = [];
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) { // ELEMENT_NODE
            const tag = node.tagName;
            const cls = node.className?.toString().slice(0, 60) || '';
            const r = node.getBoundingClientRect?.();
            const size = r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '?';

            // 이미지 추가
            if (tag === 'IMG') {
              changes.push({ type: 'IMG_ADDED', src: node.src?.slice(0, 100), size, cls });
            }
            // 비디오 추가
            if (tag === 'VIDEO') {
              changes.push({ type: 'VIDEO_ADDED', src: node.src?.slice(0, 100), size, cls });
            }
            // 큰 요소 추가 (로딩 스피너, 결과 컨테이너 등)
            if (r && r.width > 50 && r.height > 50) {
              changes.push({ type: 'ELEMENT_ADDED', tag, size, cls: cls.slice(0, 40) });
            }
            // 내부의 이미지/비디오도 체크
            node.querySelectorAll?.('img, video')?.forEach(child => {
              changes.push({
                type: child.tagName + '_NESTED',
                src: child.src?.slice(0, 100),
                size: `${child.width || '?'}x${child.height || '?'}`,
                cls: child.className?.toString().slice(0, 40) || ''
              });
            });
          }
        }
      }
      // 속성 변화 (src 변경 등)
      if (m.type === 'attributes' && m.target.tagName === 'IMG') {
        if (m.attributeName === 'src') {
          changes.push({
            type: 'IMG_SRC_CHANGED',
            src: m.target.src?.slice(0, 100),
            size: `${m.target.width}x${m.target.height}`
          });
        }
      }
    }
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class']
  });
  p('MutationObserver 설치됨');

  // 3. Slate 프롬프트 입력
  const promptEl = document.querySelector('[role="textbox"][contenteditable]');
  if (!promptEl) { p('❌ 프롬프트 못 찾음'); observer.disconnect(); return; }

  promptEl.focus();
  await sleep(200);
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(promptEl);
  sel.removeAllRanges();
  sel.addRange(range);
  await sleep(100);
  promptEl.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward', bubbles: true, cancelable: true, composed: true
  }));
  await sleep(200);
  promptEl.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText', data: 'a cute orange cat wearing a tiny top hat',
    bubbles: true, cancelable: true, composed: true
  }));
  await sleep(500);
  p(`프롬프트 입력됨: "${promptEl.textContent}"`);

  // 4. 생성 버튼 클릭
  let genBtn = null;
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.includes('arrow_forward') && btn.textContent.includes('만들기')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 700) genBtn = btn;
    }
  });

  if (!genBtn) { p('❌ 생성 버튼 못 찾음'); observer.disconnect(); return; }
  p('생성 버튼 클릭...');
  simulateRealClick(genBtn);

  // 5. 생성 완료 대기 (최대 60초, 2초마다 체크)
  const startTime = Date.now();
  let found = false;

  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // 현재 이미지/비디오 수
    const nowImgs = document.querySelectorAll('img').length;
    const nowVids = document.querySelectorAll('video').length;

    // 새로운 큰 이미지 (생성된 결과) 찾기
    const bigImgs = [];
    document.querySelectorAll('img').forEach(img => {
      const r = img.getBoundingClientRect();
      if (r.width > 100 && r.height > 100 && r.y > 50 && r.y < 850) {
        if (!img.src.includes('placeholder')) {
          bigImgs.push(img);
        }
      }
    });

    // 로딩 중 표시 찾기
    const spinners = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="progress"], [role="progressbar"]');
    const shimmer = document.querySelectorAll('[class*="shimmer"], [class*="skeleton"]');

    p(`${elapsed}s | img:${nowImgs} vid:${nowVids} | 큰이미지:${bigImgs.length} | 로딩:${spinners.length} 시머:${shimmer.length} | 변화:${changes.length}개`);

    if (bigImgs.length > 0) {
      p('\n🎉 생성 완료 감지!');
      bigImgs.forEach((img, j) => {
        const r = img.getBoundingClientRect();
        p(`결과 이미지 ${j}:`);
        p(`  크기: ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
        p(`  src: ${img.src?.slice(0, 150)}`);
        p(`  srcset: ${img.srcset?.slice(0, 150) || 'none'}`);
        p(`  naturalSize: ${img.naturalWidth}x${img.naturalHeight}`);
        p(`  parent: ${img.parentElement?.tagName} class:${img.parentElement?.className?.toString().slice(0, 60)}`);
        p(`  grandparent: ${img.parentElement?.parentElement?.tagName} class:${img.parentElement?.parentElement?.className?.toString().slice(0, 60)}`);

        // 형제 버튼 (다운로드, 삭제 등)
        const container = img.closest('div[class]');
        if (container) {
          const btns = container.querySelectorAll('button');
          btns.forEach((b, k) => {
            const br = b.getBoundingClientRect();
            if (br.width > 0) {
              p(`  버튼 ${k}: "${b.textContent.trim().slice(0, 40)}" ${Math.round(br.width)}x${Math.round(br.height)} at(${Math.round(br.x)},${Math.round(br.y)})`);
            }
          });
        }
      });
      found = true;
      break;
    }

    // 비디오도 체크
    const bigVids = [];
    document.querySelectorAll('video').forEach(v => {
      const r = v.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) bigVids.push(v);
    });
    if (bigVids.length > 0) {
      p('\n🎉 비디오 생성 완료!');
      bigVids.forEach((v, j) => {
        p(`결과 비디오 ${j}: src=${v.src?.slice(0, 150)}`);
        const sources = v.querySelectorAll('source');
        sources.forEach(s => p(`  source: ${s.src?.slice(0, 150)} type:${s.type}`));
      });
      found = true;
      break;
    }
  }

  observer.disconnect();

  if (!found) {
    p('\n⏰ 60초 타임아웃 — 생성이 아직 진행 중이거나 실패');
  }

  // 6. DOM 변화 로그
  p(`\n=== DOM 변화 로그 (총 ${changes.length}개) ===`);
  // 중요한 변화만 출력
  const important = changes.filter(c =>
    c.type.includes('IMG') || c.type.includes('VIDEO') ||
    (c.type === 'ELEMENT_ADDED' && parseInt(c.size) > 100)
  );
  important.forEach((c, i) => {
    if (i < 30) p(`  ${c.type}: ${c.src || ''} ${c.size} ${c.cls || ''}`);
  });

  // 7. 이미지 클릭 시 나타나는 다운로드 UI 탐색
  if (found) {
    p('\n=== 이미지 클릭 → 다운로드 UI 탐색 ===');
    const resultImg = document.querySelector('img[src*="blob:"], img[src*="lh3"], img[src*="data:"]');
    if (!resultImg) {
      // src 패턴 모르니 큰 이미지 찾기
      let bigImg = null;
      document.querySelectorAll('img').forEach(img => {
        const r = img.getBoundingClientRect();
        if (r.width > 100 && r.height > 100 && !img.src.includes('placeholder')) {
          bigImg = img;
        }
      });
      if (bigImg) {
        p(`큰 이미지 클릭 시도: src=${bigImg.src?.slice(0, 80)}`);
        simulateRealClick(bigImg);
        await sleep(1000);

        // 새로 나타난 팝업/오버레이
        document.querySelectorAll('*').forEach(el => {
          const z = parseInt(getComputedStyle(el).zIndex);
          const r = el.getBoundingClientRect();
          if (z > 100 && r.width > 200 && r.height > 200) {
            p(`오버레이: z:${z} ${el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
            el.querySelectorAll('button').forEach((b, i) => {
              if (i < 10) p(`  btn: "${b.textContent.trim().slice(0, 40)}"`);
            });
            el.querySelectorAll('a[download], a[href*="blob"]').forEach(a => {
              p(`  다운로드 링크: href=${a.href?.slice(0, 80)} download=${a.download}`);
            });
            el.querySelectorAll('img').forEach(img => {
              const ir = img.getBoundingClientRect();
              if (ir.width > 200) p(`  큰이미지: ${ir.width}x${ir.height} src:${img.src?.slice(0, 100)}`);
            });
          }
        });

        // Esc로 닫기
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    }
  }

  // 결과 복사
  const result = log.join('\n');
  try {
    await navigator.clipboard.writeText(result);
    console.log('\n✅ 클립보드에 복사됨');
  } catch(e) {
    console.log('\n❌ 복사 실패 - 수동 복사');
  }
})();
