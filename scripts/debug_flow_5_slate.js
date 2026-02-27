// Flow DOM Debug - 5차: Slate.js 입력 방법 비교 테스트
// 3가지 방법으로 텍스트를 입력하고 Slate 내부 상태 확인
// ⚠️ 생성 버튼은 클릭하지 않음 (크레딧 절약)
(async () => {
  const log = [];
  const p = (s) => { log.push(s); console.log(s); };
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  const promptEl = document.querySelector('[role="textbox"][contenteditable]');
  if (!promptEl) { p('❌ 프롬프트 입력 못 찾음'); return; }

  function checkState(label) {
    p(`\n[${label}]`);
    p(`  textContent: "${promptEl.textContent}"`);
    // placeholder가 있는지 확인
    const ph = promptEl.querySelector('[data-slate-placeholder]');
    p(`  placeholder 존재: ${!!ph} ${ph ? '(display:' + getComputedStyle(ph).display + ', opacity:' + getComputedStyle(ph).opacity + ')' : ''}`);
    // Slate 노드 구조
    const slateEls = promptEl.querySelectorAll('[data-slate-node="element"]');
    slateEls.forEach((el, i) => {
      // 실제 텍스트만 (placeholder 제외)
      const leaves = el.querySelectorAll('[data-slate-leaf]');
      leaves.forEach((leaf, j) => {
        const placeholders = leaf.querySelectorAll('[data-slate-placeholder]');
        let realText = '';
        leaf.childNodes.forEach(node => {
          if (node.nodeType === 3) realText += node.textContent; // 텍스트 노드만
          else if (!node.hasAttribute?.('data-slate-placeholder')) realText += node.textContent;
        });
        p(`  element${i}/leaf${j}: realText="${realText.trim()}" placeholder=${placeholders.length > 0}`);
      });
    });
    // innerHTML 일부
    p(`  innerHTML(200): ${promptEl.innerHTML.slice(0, 200)}`);
  }

  p('=== Slate.js 입력 방법 비교 테스트 ===');

  // === 초기 상태 ===
  checkState('초기 상태');

  // === 방법 1: InputEvent (beforeinput) ===
  p('\n\n========== 방법 1: InputEvent (beforeinput) ==========');
  promptEl.focus();
  await sleep(200);

  // 전체 선택
  const sel1 = window.getSelection();
  const range1 = document.createRange();
  range1.selectNodeContents(promptEl);
  sel1.removeAllRanges();
  sel1.addRange(range1);
  await sleep(100);

  // beforeinput으로 삭제
  promptEl.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward', bubbles: true, cancelable: true, composed: true
  }));
  await sleep(200);

  // beforeinput으로 삽입
  promptEl.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText', data: 'method1: InputEvent test', bubbles: true, cancelable: true, composed: true
  }));
  await sleep(500);
  checkState('방법1 결과 (InputEvent)');

  // 비우기
  promptEl.focus();
  document.execCommand('selectAll');
  document.execCommand('delete');
  await sleep(300);

  // === 방법 2: 클립보드 paste ===
  p('\n\n========== 방법 2: 클립보드 paste ==========');
  promptEl.focus();
  await sleep(200);

  // 전체 선택 후 삭제
  document.execCommand('selectAll');
  document.execCommand('delete');
  await sleep(200);

  // paste 이벤트
  const dt = new DataTransfer();
  dt.setData('text/plain', 'method2: clipboard paste test');
  const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true
  });
  promptEl.dispatchEvent(pasteEvent);
  await sleep(500);
  checkState('방법2 결과 (paste)');

  // 비우기
  promptEl.focus();
  document.execCommand('selectAll');
  document.execCommand('delete');
  await sleep(300);

  // === 방법 3: execCommand('insertText') ===
  p('\n\n========== 방법 3: execCommand ==========');
  promptEl.focus();
  await sleep(200);

  document.execCommand('selectAll');
  document.execCommand('delete');
  await sleep(200);
  document.execCommand('insertText', false, 'method3: execCommand test');
  await sleep(500);
  checkState('방법3 결과 (execCommand)');

  // 비우기
  promptEl.focus();
  document.execCommand('selectAll');
  document.execCommand('delete');
  await sleep(300);

  // === 방법 4: 키보드 이벤트 시뮬레이션 (짧은 텍스트) ===
  p('\n\n========== 방법 4: 키보드 이벤트 ==========');
  promptEl.focus();
  await sleep(200);

  const testText = 'cat';
  for (const char of testText) {
    promptEl.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    promptEl.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText', data: char, bubbles: true, cancelable: true
    }));
    promptEl.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText', data: char, bubbles: true
    }));
    promptEl.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    await sleep(50);
  }
  await sleep(500);
  checkState('방법4 결과 (키보드)');

  // 최종 비우기
  promptEl.focus();
  document.execCommand('selectAll');
  document.execCommand('delete');

  // 결과 요약
  p('\n\n=== 결과 요약 ===');
  p('각 방법의 "realText" 값을 확인하세요.');
  p('placeholder가 사라지고 realText에 입력한 텍스트가 있으면 성공입니다.');

  const result = log.join('\n');
  try {
    await navigator.clipboard.writeText(result);
    console.log('\n✅ 클립보드에 복사됨');
  } catch(e) {
    console.log('\n❌ 복사 실패 - 수동 복사');
  }
})();
