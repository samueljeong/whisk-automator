// Flow @자동완성 DOM 조사 스크립트
// ⚠️ 크레딧 사용 없음 (생성 안 함)
// 사용법: Flow 페이지에서 에셋이 1개 이상 등록된 프로젝트 열고, 콘솔에 붙여넣기
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  p('=== Flow @자동완성 DOM 조사 시작 ===');
  p(`시각: ${new Date().toLocaleString()}`);

  // 1. Slate 에디터 찾기
  const editor = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!editor) {
    p('❌ Slate 에디터를 찾을 수 없음. Flow 프롬프트 입력 영역이 보이는지 확인하세요.');
    return;
  }
  p(`✅ 에디터 발견: ${editor.tagName}.${editor.className?.toString().slice(0, 80)}`);

  // 에디터 포커스
  editor.focus();
  await sleep(300);

  // 2. DOM 스냅샷 (@ 입력 전)
  const beforeSnapshot = document.body.innerHTML.length;
  const beforePopups = document.querySelectorAll('[role="listbox"], [role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]').length;
  p(`@ 입력 전: DOM 크기=${beforeSnapshot}, 팝업/리스트=${beforePopups}`);

  // 3. MutationObserver 설치 — @ 입력 후 나타나는 모든 DOM 변화 기록
  const domChanges = [];
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const tag = node.tagName;
            const cls = node.className?.toString().slice(0, 100) || '';
            const role = node.getAttribute?.('role') || '';
            const r = node.getBoundingClientRect?.();
            const size = r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '?';
            const text = node.textContent?.slice(0, 80) || '';
            const id = node.id || '';
            domChanges.push({
              time: Date.now(),
              tag, cls, role, id, size,
              text: text.replace(/\n/g, ' ').trim(),
              html: node.outerHTML?.slice(0, 200) || ''
            });
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  p('✅ MutationObserver 설치됨');

  // 4. "@" 문자 입력 — Slate.js 방식
  p('\n--- "@" 입력 시작 ---');

  // 방법 A: InputEvent (Slate가 주로 이 이벤트를 수신)
  const inputEvent = new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: '@',
    bubbles: true,
    cancelable: true,
    composed: true
  });
  editor.dispatchEvent(inputEvent);

  // Slate가 beforeinput을 무시하면 직접 텍스트 삽입 + input 이벤트
  await sleep(100);

  // 에디터에 @ 문자가 들어갔는지 확인
  const hasAt = editor.textContent?.includes('@');
  p(`에디터에 @ 포함: ${hasAt}`);

  if (!hasAt) {
    p('⚠️ beforeinput 방식 실패, Selection Range 방식 시도...');
    // 방법 B: Selection API로 직접 삽입
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const textNode = document.createTextNode('@');
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      // Slate에 변경 알림
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  await sleep(200);
  p(`@ 입력 후 에디터 내용: "${editor.textContent?.slice(0, 100)}"`);

  // 5. 자동완성 패널 출현 대기 (최대 3초, 300ms 간격 폴링)
  p('\n--- 자동완성 패널 대기 중 (최대 3초) ---');
  let panelFound = false;
  let panelEl = null;

  for (let i = 0; i < 10; i++) {
    await sleep(300);

    // 가능한 자동완성 패널 셀렉터들
    const candidates = [
      '[role="listbox"]',
      '[role="menu"]',
      '[role="option"]',
      '[data-radix-popper-content-wrapper]',
      '[data-radix-menu-content]',
      '[data-slate-void]',
    ];

    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      const newEls = Array.from(els).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (newEls.length > beforePopups || newEls.length > 0) {
        for (const el of newEls) {
          const r = el.getBoundingClientRect();
          p(`🔍 후보 발견: ${sel} → ${el.tagName}.${el.className?.toString().slice(0, 60)} (${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)})`);
          p(`   텍스트: "${el.textContent?.slice(0, 100).replace(/\n/g, ' ')}"`);
          p(`   자식: ${el.children.length}개`);
          if (!panelEl) panelEl = el;
        }
      }
    }

    // 추가: 새로 나타난 floating/absolute/fixed 요소 검색
    const floaters = document.querySelectorAll('[style*="position: absolute"], [style*="position: fixed"], [style*="z-index"]');
    for (const fl of floaters) {
      const r = fl.getBoundingClientRect();
      if (r.width > 50 && r.height > 30 && r.top > 0) {
        const isNew = !fl.dataset._debugSeen;
        if (isNew) {
          fl.dataset._debugSeen = '1';
          p(`🔍 플로팅 요소: ${fl.tagName}.${fl.className?.toString().slice(0, 60)} (${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)})`);
          p(`   텍스트: "${fl.textContent?.slice(0, 100).replace(/\n/g, ' ')}"`);
        }
      }
    }

    if (domChanges.length > 0 && i >= 2) {
      panelFound = true;
      break;
    }
  }

  // 6. DOM 변화 리포트
  p(`\n--- DOM 변화 기록 (${domChanges.length}개) ---`);
  for (const c of domChanges) {
    p(`  ${c.tag}${c.role ? '[role=' + c.role + ']' : ''} .${c.cls.slice(0, 50)} ${c.size} | "${c.text.slice(0, 60)}"`);
    if (c.html) p(`    HTML: ${c.html.slice(0, 150)}`);
  }

  // 7. 자동완성이 떴으면 항목 분석
  if (panelEl) {
    p('\n--- 자동완성 패널 상세 분석 ---');
    const items = panelEl.querySelectorAll('[role="option"], li, [data-radix-collection-item]');
    p(`항목 수: ${items.length}`);
    items.forEach((item, i) => {
      const r = item.getBoundingClientRect();
      p(`  [${i}] ${item.tagName}.${item.className?.toString().slice(0, 40)} (${Math.round(r.width)}x${Math.round(r.height)}) | "${item.textContent?.slice(0, 60)}"`);
    });

    // 키보드 선택 테스트
    p('\n--- 키보드 ArrowDown + Enter 테스트 ---');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await sleep(200);

    // 포커스된 항목 확인
    const focused = panelEl.querySelector('[data-highlighted], [aria-selected="true"], :focus, .highlighted');
    if (focused) {
      p(`✅ 포커스 항목: "${focused.textContent?.slice(0, 60)}"`);
    } else {
      p('⚠️ ArrowDown 후 포커스된 항목 없음');
    }

    // Enter는 누르지 않음 (실제 선택 방지)
    p('ℹ️ Enter는 누르지 않았음 (실제 에셋 삽입 방지)');
  } else if (domChanges.length === 0) {
    p('\n❌ 자동완성 패널이 나타나지 않음');
    p('가능한 원인:');
    p('  1. 에셋이 등록되지 않은 프로젝트');
    p('  2. @ 입력이 Slate 에디터에 전달되지 않음');
    p('  3. Flow가 @ 자동완성을 지원하지 않는 버전');
    p('  4. 다른 이벤트 시뮬레이션 방식 필요');
  }

  // 8. 정리: 에디터 내용 지우기
  p('\n--- 정리 ---');
  // Ctrl+A → Delete로 에디터 비우기
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
  await sleep(100);
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  await sleep(100);
  p(`에디터 정리 후 내용: "${editor.textContent?.slice(0, 50)}"`);

  observer.disconnect();

  // 9. 전체 로그 출력
  p('\n=== 조사 완료 ===');
  p('아래 로그를 복사해서 사무엘님에게 전달해주세요:');
  console.log('\n\n--- 복사용 전체 로그 ---');
  console.log(log.join('\n'));

  // 클립보드에 복사 시도
  try {
    await navigator.clipboard.writeText(log.join('\n'));
    p('✅ 로그가 클립보드에 복사됨!');
  } catch (e) {
    p('⚠️ 클립보드 복사 실패 — 위 로그를 수동 복사해주세요');
  }
})();
