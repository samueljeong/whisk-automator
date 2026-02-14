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
    // DOM 속성으로 정지 신호 전달 (ISOLATED/MAIN 모든 월드에서 읽기 가능)
    document.documentElement.setAttribute('data-whisk-stop', 'true');
    sendResponse({ stopped: true });
    console.log('[Whisk Automator] 정지 신호 전달됨 (DOM attribute)');
  }
  return true;
});

console.log('[Whisk Automator] Ready on:', window.location.href);
