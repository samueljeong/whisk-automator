// Content Script for Flow Automator
// Runs on https://labs.google/fx/flow*
//
// 역할: 연결 상태 확인 전용
// 자동화 로직은 popup.js에서 chrome.scripting.executeScript()로 직접 주입됨

const DEBUG = false;

DEBUG && DEBUG && console.log('[Flow Automator] Content script loaded');

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CHECK_CONNECTION') {
    sendResponse({ connected: true });
  } else if (message.action === 'STOP_AUTOMATION') {
    // DOM 속성으로 정지 신호 전달 (ISOLATED/MAIN 모든 월드에서 읽기 가능)
    document.documentElement.setAttribute('data-flow-stop', 'true');
    sendResponse({ stopped: true });
    DEBUG && console.log('[Flow Automator] 정지 신호 전달됨 (DOM attribute)');
  }
  return true;
});

DEBUG && console.log('[Flow Automator] Ready on:', window.location.href);
