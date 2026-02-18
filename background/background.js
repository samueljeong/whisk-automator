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

    // === Grok 메시지 핸들러 ===
    case 'GROK_DOWNLOAD_VIDEO':
      grokDownloadVideo(message.url, message.dataUrl, message.filename);
      sendResponse({ success: true });
      break;

    case 'GROK_INJECT_INTERCEPTOR':
      grokInjectInterceptor(message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;

    case 'GROK_PROGRESS_UPDATE':
    case 'GROK_AUTOMATION_COMPLETE':
    case 'GROK_AUTOMATION_ERROR':
      chrome.runtime.sendMessage(message).catch(() => {});
      break;
  }

  return true;
});

// MAIN world에 파일 업로드 인터셉터 주입
async function injectFileInterceptor(tabId) {
  if (!tabId) throw new Error('tabId 없음');
  console.log('[Background] MAIN world interceptor 주입 시도, tabId:', tabId);

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: () => {
      if (window.__whiskAutoInterceptorInstalled) {
        console.log('[Whisk Interceptor] 이미 설치됨');
        document.documentElement.setAttribute('data-whisk-interceptor-ready', 'true');
        return;
      }

      function dataUrlToFile(dataUrl) {
        var parts = dataUrl.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var u8 = new Uint8Array(bstr.length);
        for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        var blob = new Blob([u8], { type: mime });
        return new File([blob], 'upload.png', { type: 'image/png' });
      }

      // 방법 1: showOpenFilePicker 가로채기
      var origPicker = window.showOpenFilePicker;
      var interceptedPicker = async function() {
        var dataUrl = document.documentElement.getAttribute('data-whisk-upload');
        if (dataUrl) {
          document.documentElement.removeAttribute('data-whisk-upload');
          console.log('[Whisk Interceptor] showOpenFilePicker 가로채기!');
          try {
            var file = dataUrlToFile(dataUrl);
            var handle = {
              kind: 'file', name: file.name,
              getFile: function() { return Promise.resolve(file); },
              createWritable: function() { return Promise.reject(new Error('read-only')); },
              queryPermission: function() { return Promise.resolve('granted'); },
              requestPermission: function() { return Promise.resolve('granted'); }
            };
            document.documentElement.setAttribute('data-whisk-upload-done', 'true');
            return [handle];
          } catch (e) {
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
          set: function() {},
          configurable: true
        });
      } catch(e) {}

      // 방법 2: input[type=file] click 가로채기
      var origInputClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function() {
        if (this.type === 'file') {
          var dataUrl = document.documentElement.getAttribute('data-whisk-upload');
          if (dataUrl) {
            document.documentElement.removeAttribute('data-whisk-upload');
            console.log('[Whisk Interceptor] input[type=file].click() 가로채기!');
            try {
              var file = dataUrlToFile(dataUrl);
              var dt = new DataTransfer();
              dt.items.add(file);
              this.files = dt.files;
              this.dispatchEvent(new Event('change', { bubbles: true }));
              this.dispatchEvent(new Event('input', { bubbles: true }));
              document.documentElement.setAttribute('data-whisk-upload-done', 'true');
              return;
            } catch (e) {
              document.documentElement.setAttribute('data-whisk-upload-done', 'error');
            }
          }
        }
        return origInputClick.call(this);
      };

      // 방법 3: click 이벤트 캡처
      document.addEventListener('click', function(e) {
        var el = e.target;
        if (el && el.tagName === 'INPUT' && el.type === 'file') {
          var dataUrl = document.documentElement.getAttribute('data-whisk-upload');
          if (dataUrl) {
            e.preventDefault();
            e.stopPropagation();
            document.documentElement.removeAttribute('data-whisk-upload');
            try {
              var file = dataUrlToFile(dataUrl);
              var dt = new DataTransfer();
              dt.items.add(file);
              el.files = dt.files;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              document.documentElement.setAttribute('data-whisk-upload-done', 'true');
            } catch (e2) {
              document.documentElement.setAttribute('data-whisk-upload-done', 'error');
            }
          }
        }
      }, true);

      window.__whiskAutoInterceptorInstalled = true;
      document.documentElement.setAttribute('data-whisk-interceptor-ready', 'true');
      console.log('[Whisk Interceptor] background 주입 완료: showOpenFilePicker + input[type=file] + click 캡처');
    }
  });
  console.log('[Background] MAIN world interceptor 주입 완료');
}

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
