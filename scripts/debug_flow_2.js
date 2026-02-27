// Flow DOM Debug - 2차 (모델 메뉴, 탭, ingredient, 프롬프트 입력 상세)
// 사용법: Flow 프로젝트 페이지에서 DevTools 콘솔에 붙여넣기
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };

  p('=== Flow DOM Debug 2차 ===');
  p('URL: ' + location.href);

  // 1. 프롬프트 입력 영역 상세
  p('\n=== 프롬프트 입력 상세 ===');
  const editables = document.querySelectorAll('[contenteditable]');
  editables.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width > 100) {
      p(`${i} | tag:${el.tagName} | ${r.width}x${r.height} at(${Math.round(r.x)},${Math.round(r.y)})`);
      p(`  class: ${el.className}`);
      p(`  parent: ${el.parentElement?.className}`);
      p(`  grandparent: ${el.parentElement?.parentElement?.className}`);
      p(`  placeholder attr: ${el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || 'none'}`);
      p(`  role: ${el.getAttribute('role') || 'none'}`);
      p(`  contenteditable: ${el.contentEditable}`);
      // 형제 요소들 (placeholder 텍스트가 형제일 수 있음)
      const siblings = el.parentElement?.children;
      if (siblings) {
        for (let s = 0; s < siblings.length; s++) {
          if (siblings[s] !== el) {
            p(`  sibling: ${siblings[s].tagName} "${siblings[s].textContent.slice(0,50)}" class:${siblings[s].className}`);
          }
        }
      }
    }
  });

  // 2. 모델 버튼 클릭 → 메뉴 관찰
  p('\n=== 모델 버튼 탐색 ===');
  const allBtns = document.querySelectorAll('button');
  let modelBtn = null;
  allBtns.forEach(btn => {
    if (btn.textContent.includes('Nano Banana') || btn.textContent.includes('Imagen')) {
      modelBtn = btn;
      const r = btn.getBoundingClientRect();
      p(`모델 버튼 발견: "${btn.textContent.trim().slice(0,60)}"`);
      p(`  class: ${btn.className}`);
      p(`  children:`);
      Array.from(btn.children).forEach(c => {
        p(`    ${c.tagName} "${c.textContent.trim().slice(0,30)}" class:${c.className}`);
      });
    }
  });

  // 모델 버튼 클릭하여 메뉴 열기
  if (modelBtn) {
    p('\n--- 모델 버튼 클릭 시도 ---');
    modelBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // 새로 나타난 메뉴/팝업 찾기
    const menus = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [class*="menu"], [class*="popup"], [class*="dropdown"], [class*="popover"], [class*="overlay"]');
    p(`메뉴/팝업 요소: ${menus.length}개`);
    menus.forEach((m, i) => {
      const r = m.getBoundingClientRect();
      if (r.width > 0) {
        p(`${i} | ${m.tagName} role:${m.getAttribute('role')} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
        p(`  class: ${m.className.slice(0,80)}`);
        // 메뉴 아이템들
        const items = m.querySelectorAll('[role="menuitem"], [role="option"], li, button');
        items.forEach((item, j) => {
          if (j < 20) {
            p(`  item ${j}: ${item.tagName} "${item.textContent.trim().slice(0,60)}" class:${item.className.slice(0,50)}`);
          }
        });
      }
    });

    // 일반적인 팝오버 패턴도 체크
    const allVisible = document.querySelectorAll('div, ul, section');
    let newPopup = [];
    allVisible.forEach(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width > 100 && r.height > 100 &&
          (style.position === 'fixed' || style.position === 'absolute') &&
          style.zIndex > 100 && style.display !== 'none') {
        newPopup.push(el);
      }
    });
    if (newPopup.length > 0) {
      p(`\n고정/절대 위치 팝업: ${newPopup.length}개`);
      newPopup.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        p(`${i} | ${el.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)}) z:${getComputedStyle(el).zIndex}`);
        p(`  class: ${el.className.slice(0,100)}`);
        // 내부 텍스트 (모델 이름들)
        const texts = [];
        el.querySelectorAll('span, div, p, button, li').forEach(c => {
          const t = c.textContent.trim();
          if (t.length > 2 && t.length < 60 && !texts.includes(t)) texts.push(t);
        });
        if (texts.length > 0 && texts.length < 30) {
          p(`  텍스트들: ${texts.join(' | ')}`);
        }
      });
    }

    // 닫기
    document.body.click();
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. 탭 요소 상세
  p('\n=== 탭/Radio 상세 ===');
  const tabs = document.querySelectorAll('[role="tab"], [role="tablist"], [role="tabpanel"]');
  tabs.forEach((t, i) => {
    const r = t.getBoundingClientRect();
    p(`${i} | ${t.tagName} role:${t.getAttribute('role')} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
    p(`  class: ${t.className}`);
    p(`  aria-selected: ${t.getAttribute('aria-selected')}`);
    p(`  aria-label: ${t.getAttribute('aria-label') || 'none'}`);
    p(`  text: "${t.textContent.trim().slice(0,50)}"`);
    // 자식 이미지/아이콘
    t.querySelectorAll('img, svg, span').forEach(c => {
      p(`  child: ${c.tagName} ${c.src ? 'src:'+c.src.slice(0,50) : ''} "${c.textContent?.trim().slice(0,30) || ''}" class:${c.className.slice(0,40)}`);
    });
  });

  // 4. "add_2만들기" 버튼 주변 탐색 (ingredient 추가)
  p('\n=== Ingredient 추가 버튼 상세 ===');
  let addBtn = null;
  allBtns.forEach(btn => {
    if (btn.textContent.includes('add_2') || btn.textContent.includes('만들기')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 800) { // 하단 영역
        addBtn = btn;
        p(`하단 추가 버튼: "${btn.textContent.trim().slice(0,40)}"`);
        p(`  ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
        p(`  class: ${btn.className}`);
        p(`  parent: ${btn.parentElement?.className}`);
        // 같은 부모의 형제 버튼들
        const siblings = btn.parentElement?.querySelectorAll('button');
        siblings?.forEach((s, j) => {
          const sr = s.getBoundingClientRect();
          p(`  형제버튼 ${j}: "${s.textContent.trim().slice(0,40)}" at(${Math.round(sr.x)},${Math.round(sr.y)})`);
        });
      }
    }
  });

  // 5. 미디어 추가 버튼 (상단)
  p('\n=== 미디어 추가 버튼 상세 ===');
  allBtns.forEach(btn => {
    if (btn.textContent.includes('미디어 추가') || btn.textContent.includes('add미디어')) {
      const r = btn.getBoundingClientRect();
      p(`미디어 추가: "${btn.textContent.trim().slice(0,40)}"`);
      p(`  ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
      p(`  class: ${btn.className}`);
    }
  });

  // 6. 현재 생성된 콘텐츠 영역 탐색
  p('\n=== 메인 콘텐츠 영역 ===');
  const mainImgs = document.querySelectorAll('img');
  mainImgs.forEach((img, i) => {
    const r = img.getBoundingClientRect();
    if (r.width > 50 && r.height > 50 && r.y > 60 && r.y < 850) {
      p(`이미지 ${i}: ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)}) src:${img.src?.slice(0,80)}`);
      p(`  parent: ${img.parentElement?.tagName} class:${img.parentElement?.className.slice(0,60)}`);
    }
  });

  const videos = document.querySelectorAll('video');
  videos.forEach((v, i) => {
    const r = v.getBoundingClientRect();
    p(`비디오 ${i}: ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)}) src:${v.src?.slice(0,80)}`);
  });

  // 7. 하단 컨트롤 바 전체 구조
  p('\n=== 하단 컨트롤 바 구조 ===');
  // 프롬프트 입력의 조상을 타고 올라가며 전체 바 구조 파악
  const promptEl = document.querySelector('[contenteditable]');
  if (promptEl) {
    let ancestor = promptEl;
    for (let i = 0; i < 5; i++) {
      ancestor = ancestor.parentElement;
      if (!ancestor) break;
      const r = ancestor.getBoundingClientRect();
      p(`조상 ${i}: ${ancestor.tagName} | ${Math.round(r.width)}x${Math.round(r.height)} at(${Math.round(r.x)},${Math.round(r.y)})`);
      p(`  class: ${ancestor.className.slice(0,100)}`);
    }
  }

  // 8. file input 상세
  p('\n=== File Input 상세 ===');
  document.querySelectorAll('input[type="file"]').forEach((inp, i) => {
    p(`${i} | accept:${inp.accept} | multiple:${inp.multiple}`);
    p(`  class: ${inp.className}`);
    p(`  parent: ${inp.parentElement?.tagName} class:${inp.parentElement?.className}`);
    p(`  display: ${getComputedStyle(inp).display}`);
    p(`  visibility: ${getComputedStyle(inp).visibility}`);
    p(`  위치: ${inp.parentElement?.parentElement?.className}`);
  });

  // 결과 복사
  const result = log.join('\n');
  try {
    await navigator.clipboard.writeText(result);
    console.log('\n✅ 결과가 클립보드에 복사되었습니다!');
  } catch(e) {
    console.log('\n❌ 클립보드 복사 실패 - 위 내용을 수동으로 복사해주세요');
  }
})();
