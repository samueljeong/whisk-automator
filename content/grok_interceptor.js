// grok_interceptor.js - MAIN world, document_start
// grok.com의 파일 업로드 메커니즘을 가로채서 프로그래밍적 이미지 업로드 가능하게 함
// data-grok-upload 속성에 base64 dataUrl 설정 → input[type=file] 인터셉트
(function() {
  'use strict';

  const DEBUG = false;

  if (window.__grokInterceptorInstalled) return;

  function dataUrlToFile(dataUrl, filename) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bstr = atob(parts[1]);
    var u8 = new Uint8Array(bstr.length);
    for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    var blob = new Blob([u8], { type: mime });
    var ext = mime.split('/')[1] || 'png';
    return new File([blob], filename || ('upload.' + ext), { type: mime });
  }

  // 방법 1: input[type=file] click 가로채기
  var origInputClick = HTMLInputElement.prototype.click;
  var prevClick = HTMLInputElement.prototype.click;

  HTMLInputElement.prototype.click = function() {
    if (this.type === 'file') {
      var dataUrl = document.documentElement.getAttribute('data-grok-upload');
      if (dataUrl) {
        document.documentElement.removeAttribute('data-grok-upload');
        DEBUG && console.log('[Grok Interceptor] input[type=file].click() 가로채기');
        try {
          var file = dataUrlToFile(dataUrl);
          var dt = new DataTransfer();
          dt.items.add(file);
          this.files = dt.files;
          this.dispatchEvent(new Event('change', { bubbles: true }));
          this.dispatchEvent(new Event('input', { bubbles: true }));
          document.documentElement.setAttribute('data-grok-upload-done', 'true');
          DEBUG && console.log('[Grok Interceptor] 파일 주입 완료 (' + file.size + ' bytes)');
          return;
        } catch (e) {
          console.error('[Grok Interceptor] 파일 주입 실패:', e);
          document.documentElement.setAttribute('data-grok-upload-done', 'error');
        }
      }
    }
    return prevClick.call(this);
  };

  // 방법 2: click 이벤트 캡처 (동적 생성 input 대응)
  document.addEventListener('click', function(e) {
    var el = e.target;
    if (el && el.tagName === 'INPUT' && el.type === 'file') {
      var dataUrl = document.documentElement.getAttribute('data-grok-upload');
      if (dataUrl) {
        e.preventDefault();
        e.stopPropagation();
        document.documentElement.removeAttribute('data-grok-upload');
        try {
          var file = dataUrlToFile(dataUrl);
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          document.documentElement.setAttribute('data-grok-upload-done', 'true');
        } catch (e2) {
          document.documentElement.setAttribute('data-grok-upload-done', 'error');
        }
      }
    }
  }, true);

  window.__grokInterceptorInstalled = true;
  document.documentElement.setAttribute('data-grok-interceptor-ready', 'true');
  DEBUG && console.log('[Grok Interceptor] document_start 설치 완료');
})();
