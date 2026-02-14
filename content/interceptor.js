// interceptor.js - MAIN world, document_start
// Whisk JS보다 먼저 파일 업로드 메커니즘을 가로채서 프로그래밍적 업로드 가능하게 함
// 방법 1: showOpenFilePicker (File System Access API)
// 방법 2: <input type="file"> click (전통적 파일 입력)
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
    return new File([blob], 'upload.png', { type: 'image/png' });
  }

  // === 방법 1: showOpenFilePicker 가로채기 ===
  var origPicker = window.showOpenFilePicker;

  var interceptedPicker = async function() {
    var dataUrl = document.documentElement.getAttribute('data-whisk-upload');
    if (dataUrl) {
      document.documentElement.removeAttribute('data-whisk-upload');
      console.log('[Whisk Interceptor] showOpenFilePicker 가로채기! dataUrl 길이:', dataUrl.length);

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

        document.documentElement.setAttribute('data-whisk-upload-done', 'true');
        console.log('[Whisk Interceptor] showOpenFilePicker 파일 핸들 생성 완료 (' + file.size + ' bytes)');
        return [handle];
      } catch (e) {
        console.error('[Whisk Interceptor] showOpenFilePicker 파일 변환 실패:', e);
        document.documentElement.setAttribute('data-whisk-upload-done', 'error');
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
        console.log('[Whisk Interceptor] showOpenFilePicker 재할당 시도 무시');
      },
      configurable: true
    });
  } catch(e) {}

  // === 방법 2: <input type="file"> click 가로채기 ===
  var origInputClick = HTMLInputElement.prototype.click;

  HTMLInputElement.prototype.click = function() {
    if (this.type === 'file') {
      var dataUrl = document.documentElement.getAttribute('data-whisk-upload');
      if (dataUrl) {
        document.documentElement.removeAttribute('data-whisk-upload');
        console.log('[Whisk Interceptor] input[type=file].click() 가로채기! dataUrl 길이:', dataUrl.length);

        try {
          var file = dataUrlToFile(dataUrl);
          var dt = new DataTransfer();
          dt.items.add(file);
          this.files = dt.files;

          // change 이벤트 발생 (Whisk가 파일 선택 완료로 인식)
          this.dispatchEvent(new Event('change', { bubbles: true }));
          this.dispatchEvent(new Event('input', { bubbles: true }));

          document.documentElement.setAttribute('data-whisk-upload-done', 'true');
          console.log('[Whisk Interceptor] input[type=file] 파일 주입 완료 (' + file.size + ' bytes)');
          return;
        } catch (e) {
          console.error('[Whisk Interceptor] input[type=file] 파일 주입 실패:', e);
          document.documentElement.setAttribute('data-whisk-upload-done', 'error');
        }
      }
    }
    return origInputClick.call(this);
  };

  // === 방법 3: 동적 생성 input[type=file]도 가로채기 (click 이벤트 캡처) ===
  document.addEventListener('click', function(e) {
    var el = e.target;
    if (el && el.tagName === 'INPUT' && el.type === 'file') {
      var dataUrl = document.documentElement.getAttribute('data-whisk-upload');
      if (dataUrl) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Whisk Interceptor] click 캡처로 input[type=file] 가로채기');

        document.documentElement.removeAttribute('data-whisk-upload');
        try {
          var file = dataUrlToFile(dataUrl);
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          document.documentElement.setAttribute('data-whisk-upload-done', 'true');
        } catch (e2) {
          document.documentElement.setAttribute('data-whisk-upload-done', 'error');
        }
      }
    }
  }, true); // capture phase

  window.__whiskAutoInterceptorInstalled = true;
  console.log('[Whisk Interceptor] document_start 설치 완료: showOpenFilePicker + input[type=file] + click 캡처');
})();
