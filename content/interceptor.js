// interceptor.js - MAIN world, document_start
// Flow JS보다 먼저 파일 업로드 메커니즘을 가로채서 프로그래밍적 업로드 가능하게 함
// 방법 1: showOpenFilePicker (File System Access API)
// 방법 2: <input type="file"> click (전통적 파일 입력)
// 방법 3: Drag & Drop (DragEvent 시뮬레이션)
(function() {
  'use strict';

  // === 공통 유틸: dataUrl → File 변환 ===
  function dataUrlToFile(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bstr = atob(parts[1]);
    var u8 = new Uint8Array(bstr.length);
    for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    var blob = new Blob([u8], { type: mime });
    // data-flow-upload-name 속성에서 파일명 읽기 (에셋 검색 시 이름 매칭용)
    var customName = document.documentElement.getAttribute('data-flow-upload-name');
    var fileName = customName ? (customName + '.png') : 'upload.png';
    if (customName) {
      document.documentElement.removeAttribute('data-flow-upload-name');
      console.log('[Flow Interceptor] 커스텀 파일명: ' + fileName);
    }
    return new File([blob], fileName, { type: 'image/png' });
  }

  // === 방법 1: showOpenFilePicker 가로채기 ===
  var origPicker = window.showOpenFilePicker;

  var interceptedPicker = async function() {
    var dataUrl = document.documentElement.getAttribute('data-flow-upload');
    if (dataUrl) {
      document.documentElement.removeAttribute('data-flow-upload');
      console.log('[Flow Interceptor] showOpenFilePicker 가로채기! dataUrl 길이:', dataUrl.length);

      try {
        var file = dataUrlToFile(dataUrl);
        var handle = {
          kind: 'file',
          name: file.name,
          getFile: function() { return Promise.resolve(file); },
          createWritable: function() { return Promise.reject(new Error('read-only')); },
          queryPermission: function() { return Promise.resolve('granted'); },
          requestPermission: function() { return Promise.resolve('granted'); }
        };

        document.documentElement.setAttribute('data-flow-upload-done', 'true');
        console.log('[Flow Interceptor] showOpenFilePicker 파일 핸들 생성 완료 (' + file.size + ' bytes)');
        return [handle];
      } catch (e) {
        console.error('[Flow Interceptor] showOpenFilePicker 파일 변환 실패:', e);
        document.documentElement.setAttribute('data-flow-upload-done', 'error');
        if (origPicker) return origPicker.apply(this, arguments);
        throw e;
      }
    }

    if (origPicker) return origPicker.apply(this, arguments);
    throw new Error('showOpenFilePicker not available');
  };

  window.showOpenFilePicker = interceptedPicker;

  try {
    Object.defineProperty(window, 'showOpenFilePicker', {
      get: function() { return interceptedPicker; },
      set: function() {
        console.log('[Flow Interceptor] showOpenFilePicker 재할당 시도 무시');
      },
      configurable: true
    });
  } catch(e) {}

  // === 방법 2: <input type="file"> click 가로채기 ===
  var origInputClick = HTMLInputElement.prototype.click;

  HTMLInputElement.prototype.click = function() {
    if (this.type === 'file') {
      var dataUrl = document.documentElement.getAttribute('data-flow-upload');
      if (dataUrl) {
        document.documentElement.removeAttribute('data-flow-upload');
        console.log('[Flow Interceptor] input[type=file].click() 가로채기! dataUrl 길이:', dataUrl.length);

        try {
          var file = dataUrlToFile(dataUrl);
          var dt = new DataTransfer();
          dt.items.add(file);
          this.files = dt.files;

          // change 이벤트 발생 (Flow가 파일 선택 완료로 인식)
          this.dispatchEvent(new Event('change', { bubbles: true }));
          this.dispatchEvent(new Event('input', { bubbles: true }));

          document.documentElement.setAttribute('data-flow-upload-done', 'true');
          console.log('[Flow Interceptor] input[type=file] 파일 주입 완료 (' + file.size + ' bytes)');
          return;
        } catch (e) {
          console.error('[Flow Interceptor] input[type=file] 파일 주입 실패:', e);
          document.documentElement.setAttribute('data-flow-upload-done', 'error');
        }
      }
    }
    return origInputClick.call(this);
  };

  // === 방법 3: 동적 생성 input[type=file]도 가로채기 (click 이벤트 캡처) ===
  document.addEventListener('click', function(e) {
    var el = e.target;
    if (el && el.tagName === 'INPUT' && el.type === 'file') {
      var dataUrl = document.documentElement.getAttribute('data-flow-upload');
      if (dataUrl) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Flow Interceptor] click 캡처로 input[type=file] 가로채기');

        document.documentElement.removeAttribute('data-flow-upload');
        try {
          var file = dataUrlToFile(dataUrl);
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          document.documentElement.setAttribute('data-flow-upload-done', 'true');
        } catch (e2) {
          document.documentElement.setAttribute('data-flow-upload-done', 'error');
        }
      }
    }
  }, true); // capture phase

  // === 방법 4: Drag & Drop 시뮬레이션 ===
  // Flow가 drag&drop 기반 업로드를 사용할 경우 대비
  // data-flow-upload-target 속성에 CSS 셀렉터가 있으면 해당 요소에 DragEvent 시뮬레이션
  function simulateDragDrop(targetEl, dataUrl) {
    try {
      var file = dataUrlToFile(dataUrl);
      var dt = new DataTransfer();
      dt.items.add(file);

      var rect = targetEl.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var commonOpts = { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt };

      targetEl.dispatchEvent(new DragEvent('dragenter', commonOpts));
      targetEl.dispatchEvent(new DragEvent('dragover', commonOpts));
      targetEl.dispatchEvent(new DragEvent('drop', commonOpts));

      document.documentElement.setAttribute('data-flow-upload-done', 'true');
      console.log('[Flow Interceptor] Drag&Drop 시뮬레이션 완료 (' + file.size + ' bytes)');
      return true;
    } catch (e) {
      console.error('[Flow Interceptor] Drag&Drop 시뮬레이션 실패:', e);
      document.documentElement.setAttribute('data-flow-upload-done', 'error');
      return false;
    }
  }

  // Drag&Drop 트리거 관찰 (MutationObserver)
  var ddObserver = new MutationObserver(function(mutations) {
    for (var m = 0; m < mutations.length; m++) {
      if (mutations[m].attributeName === 'data-flow-upload-dragdrop') {
        var targetSelector = document.documentElement.getAttribute('data-flow-upload-dragdrop');
        var dataUrl = document.documentElement.getAttribute('data-flow-upload');
        if (targetSelector && dataUrl) {
          document.documentElement.removeAttribute('data-flow-upload-dragdrop');
          document.documentElement.removeAttribute('data-flow-upload');
          var targetEl = document.querySelector(targetSelector);
          if (targetEl) {
            simulateDragDrop(targetEl, dataUrl);
          } else {
            console.warn('[Flow Interceptor] Drag&Drop 대상 미발견:', targetSelector);
            document.documentElement.setAttribute('data-flow-upload-done', 'error');
          }
        }
      }
    }
  });
  ddObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-flow-upload-dragdrop'] });

  // === Slate.js 에디터 디버그 + 직접 삽입 ===
  // MAIN world에서만 React fiber 접근 가능 (CSP 문제 없음)

  // Slate 에디터 인스턴스 찾기
  function findSlateEditor() {
    var el = document.querySelector('[role="textbox"][contenteditable]');
    if (!el) return null;

    var fiberKey = Object.keys(el).find(function(k) {
      return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
    });
    if (!fiberKey) return null;

    var current = el[fiberKey];
    var depth = 0;
    while (current && depth < 50) {
      // props.editor 체크
      if (current.memoizedProps && current.memoizedProps.editor &&
          typeof current.memoizedProps.editor.apply === 'function' &&
          Array.isArray(current.memoizedProps.editor.children)) {
        return current.memoizedProps.editor;
      }
      // hooks 체인 체크
      var hook = current.memoizedState;
      var hi = 0;
      while (hook && hi < 20) {
        var val = hook.memoizedState;
        if (val && typeof val === 'object' && !Array.isArray(val) &&
            typeof val.apply === 'function' && Array.isArray(val.children)) {
          return val;
        }
        hook = hook.next;
        hi++;
      }
      current = current.return;
      depth++;
    }
    return null;
  }

  // Slate 에디터 덤프 (data-slate-debug 속성으로 트리거)
  function handleSlateDebug() {
    try {
      var editor = findSlateEditor();
      if (!editor) {
        console.error('[Slate Debug] editor 인스턴스 미발견');
        // fiber 경로 덤프
        var el = document.querySelector('[role="textbox"][contenteditable]');
        if (el) {
          var fk = Object.keys(el).find(function(k) { return k.startsWith('__reactFiber$'); });
          if (fk) {
            var cur = el[fk];
            var d = 0;
            while (cur && d < 30) {
              var n = cur.type ? (cur.type.displayName || cur.type.name || String(cur.type).substring(0, 40)) : null;
              var pk = cur.memoizedProps ? Object.keys(cur.memoizedProps).join(',') : '';
              console.log('[Slate Debug] fiber[' + d + '] ' + n + ' props=[' + pk + ']');
              cur = cur.return;
              d++;
            }
          }
        }
        document.documentElement.setAttribute('data-slate-debug-result', 'not-found');
        return;
      }

      console.log('[Slate Debug] ===== EDITOR 발견! =====');
      console.log('[Slate Debug] 키:', Object.keys(editor).join(', '));
      console.log('[Slate Debug] children 수:', editor.children.length);
      console.log('[Slate Debug] selection:', JSON.stringify(editor.selection));
      console.log('[Slate Debug] children 전체:');
      console.log(JSON.stringify(editor.children, null, 2));

      // void/특수 노드 추출
      var voids = [];
      function findVoids(nodes, path) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.type && node.type !== 'paragraph') {
            voids.push({ path: path.concat([i]), type: node.type, node: node });
          }
          if (node.children) findVoids(node.children, path.concat([i]));
        }
      }
      findVoids(editor.children, []);
      if (voids.length > 0) {
        console.log('[Slate Debug] ===== VOID 노드 (' + voids.length + '개) =====');
        voids.forEach(function(v) {
          console.log('[Slate Debug] path=' + JSON.stringify(v.path) + ' type="' + v.type + '"');
          console.log(JSON.stringify(v.node, null, 2));
        });
      } else {
        console.log('[Slate Debug] void 노드 없음 (에셋 삽입 후 다시 실행해주세요)');
      }

      window.__slateEditor = editor;
      document.documentElement.setAttribute('data-slate-debug-result', JSON.stringify(editor.children));
    } catch(e) {
      console.error('[Slate Debug] 오류:', e);
      document.documentElement.setAttribute('data-slate-debug-result', 'error:' + e.message);
    }
  }

  // data-slate-debug 속성 변경 감지 → 덤프 실행
  var slateObserver = new MutationObserver(function(mutations) {
    for (var m = 0; m < mutations.length; m++) {
      if (mutations[m].attributeName === 'data-slate-debug') {
        var val = document.documentElement.getAttribute('data-slate-debug');
        if (val === 'dump') {
          document.documentElement.removeAttribute('data-slate-debug');
          handleSlateDebug();
        }
      }
    }
  });
  slateObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-slate-debug'] });

  window.__flowAutoInterceptorInstalled = true;
  // DOM 속성으로도 표시 (ISOLATED world에서 확인 가능)
  document.documentElement.setAttribute('data-flow-interceptor-ready', 'true');
  console.log('[Flow Interceptor] document_start 설치 완료: showOpenFilePicker + input[type=file] + click 캡처 + drag&drop + slate-debug');
})();
