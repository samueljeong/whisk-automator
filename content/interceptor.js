// interceptor.js - MAIN world, document_start
// Whisk JS보다 먼저 showOpenFilePicker를 가로채서 프로그래밍적 파일 업로드 가능하게 함
(function() {
  'use strict';

  const origPicker = window.showOpenFilePicker;

  const interceptedPicker = async function(...args) {
    const dataUrl = document.documentElement.getAttribute('data-whisk-upload');
    if (dataUrl) {
      document.documentElement.removeAttribute('data-whisk-upload');
      console.log('[Whisk Interceptor] showOpenFilePicker 가로채기! dataUrl 길이:', dataUrl.length);

      try {
        var parts = dataUrl.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var u8 = new Uint8Array(bstr.length);
        for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        var blob = new Blob([u8], { type: mime });
        var file = new File([blob], 'upload.png', { type: 'image/png' });

        var handle = {
          kind: 'file',
          name: file.name,
          getFile: function() { return Promise.resolve(file); },
          createWritable: function() { return Promise.reject(new Error('read-only')); },
          queryPermission: function() { return Promise.resolve('granted'); },
          requestPermission: function() { return Promise.resolve('granted'); }
        };

        document.documentElement.setAttribute('data-whisk-upload-done', 'true');
        console.log('[Whisk Interceptor] 파일 핸들 생성 완료 (' + file.size + ' bytes)');
        return [handle];
      } catch (e) {
        console.error('[Whisk Interceptor] 파일 변환 실패:', e);
        document.documentElement.setAttribute('data-whisk-upload-done', 'error');
        if (origPicker) return origPicker.apply(this, args);
        throw e;
      }
    }

    // 인터셉트 데이터 없으면 원본 호출
    if (origPicker) return origPicker.apply(this, args);
    throw new Error('showOpenFilePicker not available');
  };

  window.showOpenFilePicker = interceptedPicker;

  // defineProperty로 보호 (Whisk가 재할당 시도해도 우리 함수 유지)
  try {
    Object.defineProperty(window, 'showOpenFilePicker', {
      get: function() { return interceptedPicker; },
      set: function(v) {
        console.log('[Whisk Interceptor] showOpenFilePicker 재할당 시도 감지, 무시');
      },
      configurable: true
    });
  } catch(e) {
    console.warn('[Whisk Interceptor] defineProperty 실패:', e.message);
  }

  window.__whiskAutoInterceptorInstalled = true;
  console.log('[Whisk Interceptor] document_start에서 interceptor 설치 완료 (Whisk JS보다 먼저)');
})();
