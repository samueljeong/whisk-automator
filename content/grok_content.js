// Grok Content Script - ISOLATED world
// 역할: 연결 확인 & 정지 신호 브릿지

const DEBUG = false;

DEBUG && DEBUG && console.log('[Grok Automator] Content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GROK_CHECK_CONNECTION') {
    sendResponse({ connected: true, url: window.location.href });
  } else if (message.action === 'GROK_STOP_AUTOMATION') {
    document.documentElement.setAttribute('data-grok-stop', 'true');
    sendResponse({ stopped: true });
    DEBUG && console.log('[Grok Automator] 정지 신호 전달됨');
  }
  return true;
});

DEBUG && console.log('[Grok Automator] Ready on:', window.location.href);
