// Content Script for Whisk Automator
// Runs on https://labs.google/fx/tools/whisk*
//
// 역할: 연결 상태 확인 전용
// 자동화 로직은 popup.js에서 chrome.scripting.executeScript()로 직접 주입됨

console.log('[Whisk Automator] Content script loaded');

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CHECK_CONNECTION') {
    sendResponse({ connected: true });
  } else if (message.action === 'STOP_AUTOMATION') {
    // 주입된 자동화 코드에 정지 신호 전달 (window 변수 경유)
    window.__whiskAutoStop = true;
    // 페이지 컨텍스트에도 설정 (executeScript로 주입된 코드용)
    const script = document.createElement('script');
    script.textContent = 'window.__whiskAutoStop = true;';
    document.documentElement.appendChild(script);
    script.remove();
    sendResponse({ stopped: true });
    console.log('[Whisk Automator] 정지 신호 전달됨');
  }
  return true;
});

console.log('[Whisk Automator] Ready on:', window.location.href);
