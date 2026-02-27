// Flow DOM Debug - 3차 (React 호환 클릭으로 모델 메뉴 + ingredient 탐색)
// Flow는 React 사이트라 일반 .click()이 안 먹음 → pointerdown/mousedown 시퀀스 사용
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };

  function simulateRealClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  p('=== Flow DOM Debug 3차 (React 클릭) ===');

  // === 1. 모델 버튼 React 클릭 → 메뉴 캡처 ===
  p('\n=== [1] 모델 버튼 React 클릭 ===');
  const allBtns = document.querySelectorAll('button');
  let modelBtn = null;
  allBtns.forEach(btn => {
    if (btn.textContent.includes('Nano Banana') || btn.textContent.includes('Imagen') || btn.textContent.includes('Veo')) {
      modelBtn = btn;
    }
  });

  if (modelBtn) {
    p(`모델 버튼: "${modelBtn.textContent.trim().slice(0,60)}"`);

    // 클릭 전 DOM 스냅샷 (body 직접 자식 수)
    const beforeCount = document.body.children.length;
    const beforeDivs = document.querySelectorAll('div').length;

    simulateRealClick(modelBtn);
    await sleep(800);

    const afterCount = document.body.children.length;
    const afterDivs = document.querySelectorAll('div').length;
    p(`DOM 변화: body children ${beforeCount}→${afterCount}, divs ${beforeDivs}→${afterDivs}`);

    // 새로 나타난 요소들 찾기 (role 기반)
    const menuLike = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [role="presentation"], [role="tooltip"]');
    p(`role 기반 메뉴: ${menuLike.length}개`);
    menuLike.forEach((m, i) => {
      const r = m.getBoundingClientRect();
      if (r.width > 0) {
        p(`  ${i} | ${m.tagName} role:${m.getAttribute('role')} | ${Math.round(r.width)}x${Math.round(r.height)}`);
        p(`    text: "${m.textContent.trim().slice(0,200)}"`);
      }
    });

    // 높은 z-index 팝업
    const allEls = document.querySelectorAll('*');
    let highZ = [];
    allEls.forEach(el => {
      const z = parseInt(getComputedStyle(el).zIndex);
      const r = el.getBoundingClientRect();
      if (z > 50 && r.width > 80 && r.height > 80 && r.width < 800) {
        highZ.push({ el, z, r });
      }
    });
    highZ.sort((a, b) => b.z - a.z);
    p(`\n높은 z-index 요소: ${highZ.length}개`);
    highZ.slice(0, 5).forEach(({ el, z, r }, i) => {
      p(`  ${i} | z:${z} | ${el.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
      p(`    class: ${el.className.toString().slice(0,80)}`);
      // 내부 클릭 가능 아이템
      const clickable = el.querySelectorAll('button, [role="option"], [role="menuitem"], li, [class*="item"], [class*="option"]');
      clickable.forEach((c, j) => {
        if (j < 15) {
          p(`    item ${j}: ${c.tagName} "${c.textContent.trim().slice(0,60)}" class:${c.className.toString().slice(0,40)}`);
        }
      });
      // 텍스트 내용도
      const spans = el.querySelectorAll('span, p, div');
      const texts = new Set();
      spans.forEach(s => {
        const t = s.textContent.trim();
        if (t.length > 1 && t.length < 40 && s.children.length === 0) texts.add(t);
      });
      if (texts.size > 0 && texts.size < 30) {
        p(`    리프 텍스트: ${[...texts].join(' | ')}`);
      }
    });

    // Esc로 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(500);
    p('(Esc로 메뉴 닫기 시도)');
  } else {
    p('모델 버튼 못 찾음');
  }

  // === 2. "add_2만들기" 버튼 React 클릭 → ingredient 추가 UI 탐색 ===
  p('\n=== [2] Ingredient 추가 버튼 React 클릭 ===');
  let addBtn = null;
  allBtns.forEach(btn => {
    if (btn.textContent.includes('add_2') && btn.textContent.includes('만들기')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 700) addBtn = btn; // 하단 영역만
    }
  });

  if (addBtn) {
    const beforeDivs2 = document.querySelectorAll('div').length;
    simulateRealClick(addBtn);
    await sleep(800);
    const afterDivs2 = document.querySelectorAll('div').length;
    p(`DOM 변화: divs ${beforeDivs2}→${afterDivs2}`);

    // 새로운 팝업/드로어 찾기
    const highZ2 = [];
    document.querySelectorAll('*').forEach(el => {
      const z = parseInt(getComputedStyle(el).zIndex);
      const r = el.getBoundingClientRect();
      if (z > 50 && r.width > 80 && r.height > 80) {
        highZ2.push({ el, z, r });
      }
    });
    highZ2.sort((a, b) => b.z - a.z);
    p(`새 팝업/드로어: ${highZ2.length}개`);
    highZ2.slice(0, 3).forEach(({ el, z, r }, i) => {
      p(`  ${i} | z:${z} | ${el.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
      p(`    class: ${el.className.toString().slice(0,100)}`);
      const btns = el.querySelectorAll('button');
      btns.forEach((b, j) => {
        if (j < 10) p(`    btn ${j}: "${b.textContent.trim().slice(0,50)}"`);
      });
      const inputs = el.querySelectorAll('input');
      inputs.forEach((inp, j) => {
        p(`    input ${j}: type:${inp.type} accept:${inp.accept} placeholder:${inp.placeholder}`);
      });
    });

    // Esc로 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(500);
  }

  // === 3. 탭 클릭 테스트 ===
  p('\n=== [3] 탭 클릭 테스트 ===');
  const tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach((tab, i) => {
    const r = tab.getBoundingClientRect();
    p(`탭 ${i}: ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
    // 내부 아이콘/이미지
    tab.querySelectorAll('*').forEach(c => {
      if (c.children.length === 0) {
        p(`  child: ${c.tagName} "${c.textContent.trim().slice(0,30)}" class:${c.className.toString().slice(0,40)}`);
        if (c.tagName === 'IMG') p(`    src: ${c.src?.slice(0,60)}`);
      }
    });
  });

  // === 4. 프롬프트 입력 테스트 ===
  p('\n=== [4] 프롬프트 입력 방식 테스트 ===');
  const promptEl = document.querySelector('[role="textbox"][contenteditable]');
  if (promptEl) {
    p(`입력 전 텍스트: "${promptEl.textContent}"`);
    p(`입력 전 innerHTML: "${promptEl.innerHTML.slice(0,100)}"`);

    // textContent로 입력 시도
    promptEl.focus();
    promptEl.textContent = 'test prompt 123';
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);

    p(`입력 후 텍스트: "${promptEl.textContent}"`);

    // 생성 버튼 상태 확인 (활성화됐는지)
    let genBtn = null;
    allBtns.forEach(btn => {
      if (btn.textContent.includes('arrow_forward') && btn.textContent.includes('만들기')) {
        const r = btn.getBoundingClientRect();
        if (r.y > 700) genBtn = btn;
      }
    });
    if (genBtn) {
      p(`생성 버튼 disabled: ${genBtn.disabled}`);
      p(`생성 버튼 opacity: ${getComputedStyle(genBtn).opacity}`);
      p(`생성 버튼 bg: ${getComputedStyle(genBtn).backgroundColor}`);
    }

    // 비우기
    promptEl.textContent = '';
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // 결과 복사
  const result = log.join('\n');
  try {
    await navigator.clipboard.writeText(result);
    console.log('\n✅ 결과가 클립보드에 복사되었습니다!');
  } catch(e) {
    console.log('\n❌ 복사 실패 - 수동으로 복사해주세요');
  }
})();
