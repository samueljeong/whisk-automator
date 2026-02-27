// Flow DOM 구조 디버그 스크립트
// 사용법: Flow 페이지(labs.google/fx/flow)에서 DevTools 콘솔에 붙여넣기
// 결과가 클립보드에 복사됩니다
(() => {
  const r = [];
  r.push('=== Flow DOM Debug ===');
  r.push('URL: ' + location.href);
  r.push('');

  // 1. 텍스트 입력 영역 (프롬프트 입력)
  r.push('=== Textareas ===');
  document.querySelectorAll('textarea').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | placeholder: "${(el.placeholder || '').substring(0, 60)}" | class: ${(el.className || '').substring(0, 60)}`);
  });

  r.push('');
  r.push('=== ContentEditable ===');
  document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${el.tagName} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | class: ${(typeof el.className === 'string' ? el.className : '').substring(0, 60)}`);
  });

  // 2. 버튼 (모든 크기)
  r.push('');
  r.push('=== All Buttons ===');
  document.querySelectorAll('button, [role="button"]').forEach((btn, i) => {
    const rect = btn.getBoundingClientRect();
    if (rect.width < 5) return;
    const text = (btn.textContent || '').trim().substring(0, 40);
    const aria = btn.getAttribute('aria-label') || '';
    const bg = getComputedStyle(btn).backgroundColor;
    r.push(`${i} | ${btn.tagName} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | text: "${text}" | aria: "${aria}" | bg: ${bg}`);
  });

  // 3. File Inputs
  r.push('');
  r.push('=== File Inputs ===');
  document.querySelectorAll('input[type="file"]').forEach((el, i) => {
    r.push(`${i} | accept: ${el.accept} | hidden: ${el.hidden} | parent: ${(el.parentElement?.className || '').substring(0, 60)}`);
  });

  // 4. Select / Dropdown 요소
  r.push('');
  r.push('=== Selects & Dropdowns ===');
  document.querySelectorAll('select, [role="listbox"], [role="combobox"], [role="menu"]').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${el.tagName} | role: ${el.getAttribute('role')} | ${Math.round(rect.width)}x${Math.round(rect.height)} | aria: "${el.getAttribute('aria-label') || ''}" | class: ${(typeof el.className === 'string' ? el.className : '').substring(0, 60)}`);
  });

  // 5. aria-label 요소
  r.push('');
  r.push('=== Aria Labels ===');
  document.querySelectorAll('[aria-label]').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 5) return;
    r.push(`${i} | ${el.tagName} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | label: "${el.getAttribute('aria-label').substring(0, 60)}"`);
  });

  // 6. 이미지 (생성 결과물)
  r.push('');
  r.push('=== Images (>100px) ===');
  document.querySelectorAll('img').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) return;
    r.push(`${i} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | src: ${(el.src || '').substring(0, 80)}`);
  });

  // 7. 비디오
  r.push('');
  r.push('=== Videos ===');
  document.querySelectorAll('video').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | src: ${(el.src || '').substring(0, 80)}`);
  });

  // 8. Ingredient / Drawer 관련 요소
  r.push('');
  r.push('=== Ingredient/Drawer/Asset Related ===');
  document.querySelectorAll('[class*="ingredient"], [class*="drawer"], [class*="asset"], [class*="upload"], [class*="drop"], [class*="model"], [class*="Ingredient"], [class*="Drawer"]').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${el.tagName} | ${Math.round(rect.width)}x${Math.round(rect.height)} | class: ${(typeof el.className === 'string' ? el.className : '').substring(0, 80)} | role: ${el.getAttribute('role') || ''}`);
  });

  // 9. Tab / Radio 관련 (이미지/비디오 전환)
  r.push('');
  r.push('=== Tabs & Radio Groups ===');
  document.querySelectorAll('[role="tab"], [role="tablist"], [role="radio"], [role="radiogroup"]').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${el.tagName} | role: ${el.getAttribute('role')} | ${Math.round(rect.width)}x${Math.round(rect.height)} | text: "${(el.textContent || '').trim().substring(0, 40)}" | aria: "${el.getAttribute('aria-label') || ''}" | checked: ${el.getAttribute('aria-checked')}`);
  });

  // 10. Headings (구조 파악)
  r.push('');
  r.push('=== Headings ===');
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    r.push(`${i} | ${el.tagName} | ${Math.round(rect.width)}x${Math.round(rect.height)} at(${Math.round(rect.left)},${Math.round(rect.top)}) | text: "${el.textContent.trim().substring(0, 60)}"`);
  });

  // 11. Shadow DOM 탐색
  r.push('');
  r.push('=== Shadow DOMs ===');
  let shadowCount = 0;
  document.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) {
      shadowCount++;
      r.push(`host: ${el.tagName.toLowerCase()} | class: ${(typeof el.className === 'string' ? el.className : '').substring(0, 60)}`);
    }
  });
  r.push(`Total shadow roots: ${shadowCount}`);

  // 결과 출력
  const output = r.join('\n');
  try { copy(output); console.log('Copied to clipboard!'); } catch(e) {}
  console.log(output);
})();
