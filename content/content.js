// Content Script for Whisk Automator
// Runs on https://labs.google/fx/tools/whisk*
//
// 역할: 연결 상태 확인 전용
// 자동화 로직은 popup.js에서 chrome.scripting.executeScript()로 직접 주입됨

console.log('[Whisk Automator] Content script loaded');

// Message listener - 연결 확인 전용
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CHECK_CONNECTION') {
    sendResponse({ connected: true });
  }
  return true;
});

console.log('[Whisk Automator] Ready on:', window.location.href);
