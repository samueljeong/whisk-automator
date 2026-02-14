// Background Service Worker for Whisk Automator

console.log('[Whisk Automator] Background service worker started');

// 아이콘 클릭 시 사이드 패널 열기
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Whisk Automator Background] Received message:', message.action);

  switch (message.action) {
    case 'DOWNLOAD_IMAGE':
      downloadImage(message.url, message.filename);
      sendResponse({ success: true });
      break;

    case 'OPEN_FOLDER':
      openSaveFolder(message.savePath);
      sendResponse({ success: true });
      break;

    case 'INJECT_INTERCEPTOR':
      injectFileInterceptor(sender.tab?.id || message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true; // async response

    // Forward progress messages from content script to popup
    case 'PROGRESS_UPDATE':
    case 'AUTOMATION_COMPLETE':
    case 'AUTOMATION_ERROR':
    case 'AUTOMATION_STOPPED':
      // Forward to popup
      chrome.runtime.sendMessage(message).catch(() => {
        // Popup might be closed, ignore error
      });
      break;
  }

  return true;
});

// Download image
async function downloadImage(url, filename) {
  try {
    console.log('[Whisk Automator Background] Downloading to:', filename);
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
  } catch (error) {
    console.error('[Whisk Automator Background] Download error:', error);
  }
}

// Open save folder in system file manager
async function openSaveFolder(savePath) {
  try {
    // 해당 경로의 최근 다운로드 파일 검색
    const results = await chrome.downloads.search({
      query: [savePath],
      limit: 1,
      orderBy: ['-startTime'],
      exists: true
    });

    if (results.length > 0) {
      console.log('[Whisk Automator Background] Opening folder for:', results[0].filename);
      chrome.downloads.show(results[0].id);
    } else {
      console.log('[Whisk Automator Background] No files found, opening default folder');
      chrome.downloads.showDefaultFolder();
    }
  } catch (error) {
    console.error('[Whisk Automator Background] Open folder error:', error);
    chrome.downloads.showDefaultFolder();
  }
}

// Track download progress
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === 'complete') {
    console.log('[Whisk Automator Background] Download completed');
  } else if (delta.error) {
    console.error('[Whisk Automator Background] Download error:', delta.error.current);
  }
});

// Discord 초대 탭 자동 닫기 (Whisk가 자동으로 열어버리는 Google Labs Discord)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('discord.com/invite')) {
    console.log('[Whisk Automator] Discord 초대 탭 자동 닫기:', changeInfo.url);
    chrome.tabs.remove(tabId);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pendingUrl && tab.pendingUrl.includes('discord.com/invite')) {
    console.log('[Whisk Automator] Discord 초대 탭 생성 차단:', tab.pendingUrl);
    chrome.tabs.remove(tab.id);
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Whisk Automator Background] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Initialize default settings
    chrome.storage.local.set({
      prompts: [],
      autoDownload: true,
      delay: 3
    });
  }
});
