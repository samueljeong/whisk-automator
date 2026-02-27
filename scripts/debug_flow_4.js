// Flow DOM Debug - 4차 (모델 하위 메뉴 + ingredient 드로어 + Slate 입력)
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };
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
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  p('=== Flow DOM Debug 4차 ===');

  // === [1] 모델 하위 드롭다운 (Nano Banana Pro 옆 arrow_drop_down) ===
  p('\n=== [1] 모델 하위 드롭다운 ===');

  // 먼저 모델 메뉴 열기
  let modelBtn = null;
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.includes('Nano Banana') || btn.textContent.includes('Imagen')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 700) modelBtn = btn;
    }
  });

  if (modelBtn) {
    simulateRealClick(modelBtn);
    await sleep(800);

    // role="menu" 찾기
    const menu = document.querySelector('[role="menu"]');
    if (menu) {
      p(`메뉴 발견: ${Math.round(menu.getBoundingClientRect().width)}x${Math.round(menu.getBoundingClientRect().height)}`);

      // 메뉴 내 모든 클릭 가능 요소 분석
      const menuItems = menu.querySelectorAll('button, [role="menuitem"], [role="option"], div[class*="item"], div[class*="option"]');
      p(`메뉴 아이템: ${menuItems.length}개`);
      menuItems.forEach((item, i) => {
        const r = item.getBoundingClientRect();
        if (r.width > 10) {
          p(`  ${i} | ${item.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)}) | "${item.textContent.trim().slice(0,40)}" | class:${item.className.toString().slice(0,50)}`);
        }
      });

      // "Nano Banana" 텍스트가 있는 요소 찾아서 클릭 (하위 드롭다운 열기)
      let subMenuTrigger = null;
      menu.querySelectorAll('*').forEach(el => {
        if (el.textContent.includes('arrow_drop_down') && el.closest('[role="menu"]') === menu) {
          if (!subMenuTrigger || el.getBoundingClientRect().width > 0) {
            subMenuTrigger = el;
          }
        }
      });

      // 또는 Nano Banana Pro 텍스트가 있는 클릭 가능 요소
      if (!subMenuTrigger) {
        menu.querySelectorAll('button, div').forEach(el => {
          if (el.textContent.includes('Nano Banana') && el.textContent.includes('arrow_drop_down')) {
            subMenuTrigger = el;
          }
        });
      }

      if (subMenuTrigger) {
        p(`\n하위 메뉴 트리거: "${subMenuTrigger.textContent.trim().slice(0,40)}" tag:${subMenuTrigger.tagName}`);
        simulateRealClick(subMenuTrigger);
        await sleep(800);

        // 새로 나타난 메뉴/팝업 찾기
        const menus2 = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]');
        p(`메뉴/리스트: ${menus2.length}개`);
        menus2.forEach((m, i) => {
          const r = m.getBoundingClientRect();
          if (r.width > 0) {
            p(`  ${i} | ${m.tagName} role:${m.getAttribute('role')} | ${Math.round(r.width)}x${Math.round(r.height)}`);
            // 모든 리프 텍스트
            const texts = [];
            m.querySelectorAll('*').forEach(c => {
              if (c.children.length === 0 && c.textContent.trim().length > 0) {
                const t = c.textContent.trim();
                if (!texts.includes(t) && t.length < 60) texts.push(t);
              }
            });
            p(`    리프 텍스트: ${texts.join(' | ')}`);
          }
        });

        // 고정/절대 위치 새 팝업
        document.querySelectorAll('*').forEach(el => {
          const z = parseInt(getComputedStyle(el).zIndex);
          const r = el.getBoundingClientRect();
          const pos = getComputedStyle(el).position;
          if (z > 100 && r.width > 100 && r.height > 50 && (pos === 'fixed' || pos === 'absolute')) {
            p(`  팝업: z:${z} | ${el.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} class:${el.className.toString().slice(0,60)}`);
            const items = el.querySelectorAll('button, [role="menuitem"], [role="option"]');
            items.forEach((item, j) => {
              if (j < 15) p(`    아이템 ${j}: "${item.textContent.trim().slice(0,50)}"`);
            });
          }
        });
      } else {
        p('하위 메뉴 트리거 못 찾음');
      }
    }

    // 메뉴 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(500);
  }

  // === [2] Ingredient 드로어 탐색 ===
  p('\n=== [2] Ingredient 드로어 탐색 ===');

  // 드로어 열기 전 상태
  const beforeHTML = document.body.innerHTML.length;

  let addBtn = null;
  document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent.includes('add_2') && btn.textContent.includes('만들기')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 700 && !btn.textContent.includes('arrow_forward')) addBtn = btn;
    }
  });

  if (addBtn) {
    simulateRealClick(addBtn);
    await sleep(1000);

    const afterHTML = document.body.innerHTML.length;
    p(`HTML 변화: ${beforeHTML} → ${afterHTML} (${afterHTML - beforeHTML > 0 ? '+' : ''}${afterHTML - beforeHTML})`);

    // 하단 바 영역 변화 감지 - 프롬프트 입력 영역 위에 새로운 요소?
    const promptEl = document.querySelector('[role="textbox"][contenteditable]');
    if (promptEl) {
      const promptRect = promptEl.getBoundingClientRect();
      p(`프롬프트 위치: (${Math.round(promptRect.x)},${Math.round(promptRect.y)})`);

      // 프롬프트 위의 새로운 영역 탐색
      const allDivs = document.querySelectorAll('div');
      const newAreas = [];
      allDivs.forEach(div => {
        const r = div.getBoundingClientRect();
        // 프롬프트 바로 위 영역 (y가 프롬프트보다 위, 메인 콘텐츠 아래)
        if (r.y > 500 && r.y < promptRect.y - 5 && r.height > 30 && r.width > 200) {
          const style = getComputedStyle(div);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            newAreas.push({ el: div, r });
          }
        }
      });

      p(`프롬프트 위 새 영역: ${newAreas.length}개`);
      newAreas.slice(0, 10).forEach(({ el, r }, i) => {
        p(`  ${i} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)}) class:${el.className.toString().slice(0,70)}`);
        // 내부 버튼/이미지/입력
        const btns = el.querySelectorAll('button');
        if (btns.length > 0 && btns.length < 10) {
          btns.forEach((b, j) => p(`    btn: "${b.textContent.trim().slice(0,40)}"`));
        }
        const imgs = el.querySelectorAll('img');
        if (imgs.length > 0) p(`    이미지: ${imgs.length}개`);
      });
    }

    // 드롭 영역, 업로드 관련 요소
    const dropZones = document.querySelectorAll('[class*="drop"], [class*="upload"], [class*="drag"]');
    p(`\n드롭/업로드 영역: ${dropZones.length}개`);
    dropZones.forEach((dz, i) => {
      const r = dz.getBoundingClientRect();
      if (r.width > 0) {
        p(`  ${i} | ${dz.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)}) class:${dz.className.toString().slice(0,60)}`);
      }
    });

    // Esc로 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(500);
  }

  // === [3] Slate.js 입력 + 생성 버튼 동작 확인 ===
  p('\n=== [3] Slate.js 입력 테스트 ===');
  const prompt = document.querySelector('[role="textbox"][contenteditable]');
  if (prompt) {
    // 포커스
    prompt.focus();
    await sleep(200);

    // 전체 선택 + 삭제
    document.execCommand('selectAll');
    await sleep(100);
    document.execCommand('delete');
    await sleep(100);

    // insertText
    document.execCommand('insertText', false, 'a cute orange cat');
    await sleep(300);

    p(`Slate 내부 텍스트: "${prompt.textContent}"`);
    p(`Slate innerHTML: "${prompt.innerHTML.slice(0,200)}"`);

    // data-slate-node 확인
    const slateNodes = prompt.querySelectorAll('[data-slate-node]');
    p(`Slate 노드 수: ${slateNodes.length}`);
    slateNodes.forEach((n, i) => {
      if (i < 5) p(`  ${i}: ${n.tagName} type:${n.getAttribute('data-slate-node')} text:"${n.textContent.slice(0,40)}"`);
    });

    // 생성 버튼 찾기
    let genBtn = null;
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.includes('arrow_forward') && btn.textContent.includes('만들기')) {
        const r = btn.getBoundingClientRect();
        if (r.y > 700) genBtn = btn;
      }
    });

    if (genBtn) {
      p(`\n생성 버튼: disabled=${genBtn.disabled}, pointer-events=${getComputedStyle(genBtn).pointerEvents}`);
      p(`  bg: ${getComputedStyle(genBtn).backgroundColor}`);
      p(`  cursor: ${getComputedStyle(genBtn).cursor}`);
    }

    // 비우기
    document.execCommand('selectAll');
    document.execCommand('delete');
  }

  // === [4] 기존 생성 이미지 탐색 (이미 생성한 적 있다면) ===
  p('\n=== [4] 메인 콘텐츠 영역 이미지/영상 ===');
  const allImgs = document.querySelectorAll('img');
  let contentImgs = 0;
  allImgs.forEach((img, i) => {
    const r = img.getBoundingClientRect();
    if (r.width > 30 && r.height > 30 && r.y > 50 && r.y < 850) {
      contentImgs++;
      p(`이미지 ${contentImgs}: ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
      p(`  src: ${(img.src || '').slice(0,100)}`);
      p(`  parent: ${img.parentElement?.tagName} class:${img.parentElement?.className?.toString().slice(0,50)}`);
      // 형제 요소 (다운로드 버튼 등)
      const siblings = img.parentElement?.querySelectorAll('button, a');
      siblings?.forEach((s, j) => {
        p(`  sibling btn: "${s.textContent.trim().slice(0,40)}"`);
      });
    }
  });
  if (contentImgs === 0) p('콘텐츠 이미지 없음 (빈 프로젝트)');

  const allVideos = document.querySelectorAll('video');
  allVideos.forEach((v, i) => {
    const r = v.getBoundingClientRect();
    p(`비디오 ${i}: ${Math.round(r.width)}x${Math.round(r.height)} src:${(v.src || '').slice(0,80)}`);
  });

  // 결과 복사
  const result = log.join('\n');
  try {
    await navigator.clipboard.writeText(result);
    console.log('\n✅ 결과가 클립보드에 복사되었습니다!');
  } catch(e) {
    console.log('\n❌ 복사 실패 - 수동으로 복사해주세요');
  }
})();
