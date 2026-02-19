// grok.js - Grok 이미지→영상 자동화 메인 로직
// popup.js(Whisk)와 완전 분리, GROK_ 접두어 메시지 사용
(function() {
  'use strict';

  // ============================================================
  // 상태
  // ============================================================
  let grokQueue = [];        // { id, name, dataUrl, motionPrompt, status, videoUrl }
  let grokIsRunning = false;
  let grokCurrentIndex = 0;
  let grokTabId = null;

  // ============================================================
  // DOM 요소
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const modeTabWhisk = $('#modeTabWhisk');
  const modeTabGrok = $('#modeTabGrok');
  const whiskContainer = $('#whiskContainer');
  const grokContainer = $('#grokContainer');

  const grokConnectionStatus = $('#grokConnectionStatus');
  const grokOpenTabBtn = $('#grokOpenTabBtn');
  const grokFileInput = $('#grokFileInput');
  const grokImportWhiskBtn = $('#grokImportWhiskBtn');
  const grokQueueEl = $('#grokQueue');
  const grokQueueCount = $('#grokQueueCount');
  const grokClearQueueBtn = $('#grokClearQueueBtn');

  const grokMotionPrompt = $('#grokMotionPrompt');
  const grokDelay = $('#grokDelay');
  const grokSaveLocation = $('#grokSaveLocation');

  const grokProgressSection = $('#grokProgressSection');
  const grokProgressFill = $('#grokProgressFill');
  const grokCurrentIndexEl = $('#grokCurrentIndex');
  const grokTotalCountEl = $('#grokTotalCount');
  const grokCurrentStatus = $('#grokCurrentStatus');

  const grokStartBtn = $('#grokStartBtn');
  const grokStopBtn = $('#grokStopBtn');

  // ============================================================
  // 모드 탭 전환
  // ============================================================
  function switchMode(mode) {
    if (mode === 'whisk') {
      modeTabWhisk.classList.add('active');
      modeTabGrok.classList.remove('active');
      whiskContainer.hidden = false;
      grokContainer.hidden = true;
    } else {
      modeTabWhisk.classList.remove('active');
      modeTabGrok.classList.add('active');
      whiskContainer.hidden = true;
      grokContainer.hidden = false;
      checkGrokConnection();
    }
    chrome.storage.local.set({ grok_activeMode: mode });
  }

  modeTabWhisk.addEventListener('click', () => switchMode('whisk'));
  modeTabGrok.addEventListener('click', () => switchMode('grok'));

  // ============================================================
  // 연결 확인
  // ============================================================
  async function checkGrokConnection() {
    grokTabId = null;
    grokConnectionStatus.textContent = '연결 확인 중...';
    grokConnectionStatus.className = 'status';

    try {
      const tabs = await chrome.tabs.query({ url: 'https://grok.com/*' });
      if (tabs.length > 0) {
        const tab = tabs[0];
        grokTabId = tab.id;
        // content script 연결 테스트
        const resp = await chrome.tabs.sendMessage(tab.id, { action: 'GROK_CHECK_CONNECTION' });
        if (resp && resp.connected) {
          grokConnectionStatus.textContent = 'grok.com 연결됨';
          grokConnectionStatus.className = 'status connected';
          updateGrokStartBtn();
          return;
        }
      }
    } catch (e) {
      console.log('[Grok] 연결 확인 실패:', e.message);
    }

    grokConnectionStatus.textContent = 'grok.com 미연결';
    grokConnectionStatus.className = 'status disconnected';
    updateGrokStartBtn();
  }

  grokOpenTabBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://grok.com' }, () => {
      setTimeout(checkGrokConnection, 2000);
    });
  });

  // ============================================================
  // 큐 관리
  // ============================================================
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function addToQueue(files) {
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e) => {
        grokQueue.push({
          id: generateId(),
          name: file.name,
          dataUrl: e.target.result,
          motionPrompt: grokMotionPrompt.value || '',
          status: 'pending',
          videoUrl: null
        });
        renderQueue();
        saveQueue();
      };
      reader.readAsDataURL(file);
    }
  }

  function removeFromQueue(id) {
    grokQueue = grokQueue.filter(item => item.id !== id);
    renderQueue();
    saveQueue();
  }

  function clearQueue() {
    grokQueue = [];
    renderQueue();
    saveQueue();
  }

  function renderQueue() {
    grokQueueCount.textContent = `(${grokQueue.length}개)`;
    updateGrokStartBtn();

    if (grokQueue.length === 0) {
      grokQueueEl.innerHTML = '<li class="empty-message">이미지를 추가해주세요</li>';
      return;
    }

    grokQueueEl.innerHTML = '';
    grokQueue.forEach((item, idx) => {
      const li = document.createElement('li');

      // 썸네일
      const thumb = document.createElement('img');
      thumb.className = 'grok-queue-item-thumb';
      thumb.src = item.dataUrl;
      thumb.alt = item.name;

      // 정보
      const info = document.createElement('div');
      info.className = 'grok-queue-item-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'grok-queue-item-name';
      nameEl.textContent = item.name;
      if (item.whiskPrompt) {
        nameEl.title = `원본: ${item.whiskPrompt}`;
      }

      const promptDiv = document.createElement('div');
      promptDiv.className = 'grok-queue-item-prompt';
      const promptInput = document.createElement('input');
      promptInput.type = 'text';
      promptInput.value = item.motionPrompt;
      promptInput.placeholder = '모션 프롬프트';
      promptInput.addEventListener('change', (e) => {
        item.motionPrompt = e.target.value;
        saveQueue();
      });
      promptDiv.appendChild(promptInput);

      const statusEl = document.createElement('div');
      statusEl.className = 'grok-queue-item-status ' + item.status;
      const statusLabels = {
        pending: '대기중',
        processing: '생성 중...',
        done: '완료',
        error: '오류'
      };
      statusEl.textContent = statusLabels[item.status] || item.status;

      info.appendChild(nameEl);
      // 원본 Whisk 프롬프트 표시 (있으면)
      if (item.whiskPrompt) {
        const origEl = document.createElement('div');
        origEl.className = 'grok-queue-item-origin';
        origEl.textContent = item.whiskPrompt;
        info.appendChild(origEl);
      }
      info.appendChild(promptDiv);
      info.appendChild(statusEl);

      // 삭제 버튼
      const actions = document.createElement('div');
      actions.className = 'grok-queue-item-actions';
      if (!grokIsRunning) {
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => removeFromQueue(item.id));
        actions.appendChild(delBtn);
      }

      li.appendChild(thumb);
      li.appendChild(info);
      li.appendChild(actions);
      grokQueueEl.appendChild(li);
    });
  }

  function updateGrokStartBtn() {
    const hasItems = grokQueue.some(i => i.status === 'pending');
    const connected = grokTabId !== null;
    grokStartBtn.disabled = !hasItems || !connected || grokIsRunning;
  }

  // ============================================================
  // 저장/로드
  // ============================================================
  function saveQueue() {
    // dataUrl은 용량이 크므로 별도 저장
    const meta = grokQueue.map(({ dataUrl, ...rest }) => rest);
    chrome.storage.local.set({ grok_queueMeta: meta });
    // dataUrl은 개별 저장
    const dataUrls = {};
    grokQueue.forEach(item => { dataUrls['grok_img_' + item.id] = item.dataUrl; });
    chrome.storage.local.set(dataUrls);
  }

  function saveSettings() {
    chrome.storage.local.set({
      grok_motionPrompt: grokMotionPrompt.value,
      grok_delay: parseInt(grokDelay.value) || 10,
      grok_saveLocation: grokSaveLocation.value || 'grok-videos'
    });
  }

  async function loadState() {
    const result = await chrome.storage.local.get([
      'grok_queueMeta', 'grok_motionPrompt', 'grok_delay',
      'grok_saveLocation', 'grok_activeMode'
    ]);

    if (result.grok_motionPrompt) grokMotionPrompt.value = result.grok_motionPrompt;
    if (result.grok_delay) grokDelay.value = result.grok_delay;
    if (result.grok_saveLocation) grokSaveLocation.value = result.grok_saveLocation;

    // 큐 복원
    if (result.grok_queueMeta && result.grok_queueMeta.length > 0) {
      const keys = result.grok_queueMeta.map(m => 'grok_img_' + m.id);
      const imgData = await chrome.storage.local.get(keys);
      grokQueue = result.grok_queueMeta.map(meta => ({
        ...meta,
        dataUrl: imgData['grok_img_' + meta.id] || ''
      })).filter(item => item.dataUrl);
      renderQueue();
    }

    // 모드 복원
    if (result.grok_activeMode === 'grok') {
      switchMode('grok');
    }
  }

  // 설정 변경 시 저장
  grokMotionPrompt.addEventListener('change', saveSettings);
  grokDelay.addEventListener('change', saveSettings);
  grokSaveLocation.addEventListener('change', saveSettings);

  // ============================================================
  // 파일 입력
  // ============================================================
  grokFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      addToQueue(Array.from(e.target.files));
      e.target.value = '';
    }
  });

  grokClearQueueBtn.addEventListener('click', () => {
    if (grokIsRunning) return;
    clearQueue();
  });

  // ============================================================
  // Whisk 프롬프트 → 모션 프롬프트 자동 변환
  // ============================================================
  function generateMotionPrompt(imagePrompt) {
    if (!imagePrompt) return grokMotionPrompt.value || 'slow zoom in, cinematic';

    const lp = imagePrompt.toLowerCase();
    const motions = [];

    // 카메라 움직임 (장면 유형별)
    if (/close[- ]?up|face|portrait|expression|eyes/.test(lp)) {
      motions.push('slow zoom in on face');
    } else if (/wide shot|landscape|panorama|aerial|vast|city[- ]?scape|skyline/.test(lp)) {
      motions.push('slow pan right');
    } else if (/battle|fight|action|explosion|clash|sword|combat/.test(lp)) {
      motions.push('dynamic camera movement');
    } else if (/crowd|group|army|soldiers|people/.test(lp)) {
      motions.push('slow dolly back');
    } else if (/walk|running|riding|horse|moving|chase/.test(lp)) {
      motions.push('tracking shot');
    } else {
      motions.push('slow zoom in');
    }

    // 피사체 움직임
    if (/wind|hair|cape|cloth|flag|robe|cloak/.test(lp)) motions.push('wind blowing');
    if (/rain|storm|thunder/.test(lp)) motions.push('rain falling');
    if (/fire|flame|torch|candle|burning/.test(lp)) motions.push('flickering firelight');
    if (/fog|mist|smoke|haze|steam/.test(lp)) motions.push('fog drifting');
    if (/water|ocean|river|lake|wave|sea/.test(lp)) motions.push('gentle water ripples');
    if (/snow|ice|frost|winter/.test(lp)) motions.push('snowflakes falling');
    if (/forest|tree|leaves|branch/.test(lp)) motions.push('leaves swaying');
    if (/dust|particle|debris|sand/.test(lp)) motions.push('particles floating');

    // 분위기 보정
    if (motions.length <= 1) {
      if (/dramatic|epic|intense|dark|shadow/.test(lp)) {
        motions.push('dramatic lighting shift');
      } else if (/serene|calm|peaceful|quiet|gentle/.test(lp)) {
        motions.push('soft ambient light');
      } else {
        motions.push('cinematic atmosphere');
      }
    }

    return motions.join(', ');
  }

  // 파일명에서 씬 번호 추출 (예: ep5_scene_003.png → 3)
  function extractSceneIndex(filename) {
    const match = filename.match(/(?:scene|씬|s)[_-]?(\d+)/i);
    if (match) return parseInt(match[1], 10) - 1; // 0-based
    // 숫자만 있는 경우 (001.png, 03.png)
    const numMatch = filename.match(/(\d+)\.\w+$/);
    if (numMatch) return parseInt(numMatch[1], 10) - 1;
    return -1;
  }

  // Whisk에서 가져오기 - 이미지 + Whisk 프롬프트 자동 매칭
  grokImportWhiskBtn.addEventListener('click', async () => {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: 'Images',
          accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }
        }]
      });

      // Whisk 프롬프트 데이터 읽기
      const storageData = await chrome.storage.local.get(['prompts']);
      const whiskPrompts = storageData.prompts || [];

      // 파일을 이름순으로 정렬
      const sortedHandles = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        sortedHandles.push({ handle, file });
      }
      sortedHandles.sort((a, b) => a.file.name.localeCompare(b.file.name));

      let matchCount = 0;

      for (const { file } of sortedHandles) {
        const reader = new FileReader();
        reader.onload = (e) => {
          // 씬 번호로 Whisk 프롬프트 매칭
          const sceneIdx = extractSceneIndex(file.name);
          let whiskText = '';
          if (sceneIdx >= 0 && sceneIdx < whiskPrompts.length) {
            whiskText = whiskPrompts[sceneIdx].text || '';
            matchCount++;
          }

          const motion = generateMotionPrompt(whiskText);

          grokQueue.push({
            id: generateId(),
            name: file.name,
            dataUrl: e.target.result,
            motionPrompt: motion,
            whiskPrompt: whiskText, // 원본 Whisk 프롬프트 보존
            status: 'pending',
            videoUrl: null
          });
          renderQueue();
          saveQueue();
        };
        reader.readAsDataURL(file);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[Grok] 파일 선택 오류:', e);
      }
    }
  });

  // ============================================================
  // 자동화 엔진
  // ============================================================
  async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function updateProgress(current, total, statusText) {
    grokProgressSection.hidden = false;
    grokCurrentIndexEl.textContent = current;
    grokTotalCountEl.textContent = total;
    grokProgressFill.style.width = total > 0 ? ((current / total) * 100) + '%' : '0%';
    grokCurrentStatus.textContent = statusText || '';
  }

  async function runGrokAutomation() {
    if (!grokTabId) {
      alert('grok.com 탭에 먼저 연결해주세요.');
      return;
    }

    grokIsRunning = true;
    grokStartBtn.hidden = true;
    grokStopBtn.hidden = false;

    const pendingItems = grokQueue.filter(i => i.status === 'pending');
    const total = pendingItems.length;
    let completed = 0;

    updateProgress(0, total, '시작 준비 중...');

    // grok.com 탭으로 전환
    await chrome.tabs.update(grokTabId, { active: true });
    await sleep(1000);

    // 인터셉터 주입 확인
    try {
      await chrome.runtime.sendMessage({
        action: 'GROK_INJECT_INTERCEPTOR',
        tabId: grokTabId
      });
    } catch (e) {
      console.log('[Grok] 인터셉터 주입:', e.message);
    }
    await sleep(500);

    for (const item of pendingItems) {
      // 정지 확인
      if (!grokIsRunning) break;

      item.status = 'processing';
      renderQueue();
      updateProgress(completed, total, `${item.name} 처리 중...`);

      try {
        // Step 0: Imagine 새 생성 페이지로 이동
        updateProgress(completed, total, `${item.name}: 새 생성 페이지 이동 중...`);
        await navigateToImagine();
        await sleep(2000);

        // Step 1: 이미지 업로드
        updateProgress(completed, total, `${item.name}: 이미지 업로드 중...`);
        await uploadImageToGrok(item.dataUrl);
        await sleep(1500);

        // Step 2: 모션 프롬프트 입력
        if (item.motionPrompt) {
          updateProgress(completed, total, `${item.name}: 프롬프트 입력 중...`);
          await inputMotionPrompt(item.motionPrompt);
          await sleep(500);
        }

        // Step 3: 생성 버튼 클릭
        updateProgress(completed, total, `${item.name}: 생성 요청 중...`);
        await clickGenerateButton();
        await sleep(2000);

        // Step 4: A/B 테스트 팝업 자동 처리
        await dismissPopups();

        // Step 5: 영상 완성 대기
        updateProgress(completed, total, `${item.name}: 영상 생성 대기 중...`);
        const videoUrl = await waitForVideo();

        if (videoUrl) {
          // Step 6: 다운로드
          updateProgress(completed, total, `${item.name}: 다운로드 중...`);
          item.videoUrl = videoUrl;
          await downloadVideo(videoUrl, item.name);
          item.status = 'done';
        } else {
          item.status = 'error';
        }
      } catch (e) {
        console.error('[Grok] 자동화 오류:', item.name, e);
        item.status = 'error';
      }

      completed++;
      renderQueue();
      updateProgress(completed, total,
        item.status === 'done' ? `${item.name}: 완료!` : `${item.name}: 오류 발생`);

      // 다음 항목 전 대기
      if (grokIsRunning && completed < total) {
        const delay = (parseInt(grokDelay.value) || 10) * 1000;
        updateProgress(completed, total, '다음 항목 대기 중...');
        await sleep(delay);
      }
    }

    // 완료
    grokIsRunning = false;
    grokStartBtn.hidden = false;
    grokStopBtn.hidden = true;
    updateGrokStartBtn();
    saveQueue();

    const doneCount = grokQueue.filter(i => i.status === 'done').length;
    updateProgress(completed, total, `완료! (${doneCount}/${total} 성공)`);
  }

  // ============================================================
  // 자동화 헬퍼 함수들
  // ============================================================

  // Imagine 새 생성 페이지로 이동 → "만들기" 버튼 클릭
  async function navigateToImagine() {
    // 1) Imagine 메인 페이지로 이동
    await chrome.tabs.update(grokTabId, { url: 'https://grok.com/imagine' });

    // 2) 페이지 로드 대기
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: grokTabId },
          func: () => document.readyState === 'complete'
        });
        if (result?.result) break;
      } catch (e) {
        // 페이지 로딩 중
      }
    }
    await sleep(1500);

    // 3) "만들기" 버튼 클릭
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        const buttons = document.querySelectorAll('button, a');
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || '';
          if (text === '만들기' || text === 'Create' || text === 'New' ||
              text.includes('만들기') || text.includes('Create')) {
            btn.click();
            return;
          }
        }
      }
    });
    await sleep(2000);
  }

  // 이미지 업로드: data-grok-upload 속성 설정 후 파일 입력 트리거
  async function uploadImageToGrok(dataUrl) {
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: (imgDataUrl) => {
        // data-grok-upload에 dataUrl 설정
        document.documentElement.setAttribute('data-grok-upload', imgDataUrl);
        document.documentElement.removeAttribute('data-grok-upload-done');

        // 이미지 업로드 버튼/영역 찾기
        // grok.com의 이미지 첨부 버튼 클릭
        const attachBtn = document.querySelector('button[aria-label*="attach"], button[aria-label*="Attach"], button[aria-label*="image"], button[aria-label*="Image"], [data-testid="attach-button"], input[type="file"]');
        if (attachBtn) {
          attachBtn.click();
        } else {
          // 대안: 모든 버튼에서 첨부 관련 버튼 찾기
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
            if (text.includes('attach') || text.includes('upload') || text.includes('image') ||
                label.includes('attach') || label.includes('upload') ||
                btn.querySelector('svg path[d*="M21.44"]')) { // 일반적인 첨부 아이콘 패스
              btn.click();
              break;
            }
          }
        }
      },
      args: [dataUrl]
    });

    // 업로드 완료 대기 (최대 10초)
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: grokTabId },
        func: () => document.documentElement.getAttribute('data-grok-upload-done')
      });
      if (result?.result === 'true') return;
      if (result?.result === 'error') throw new Error('이미지 업로드 실패');
    }

    // 인터셉터가 작동하지 않았을 수 있음 - 직접 주입 시도
    console.log('[Grok] 인터셉터 미반응, 직접 파일 주입 시도');
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: (imgDataUrl) => {
        // 직접 input[type=file] 찾아서 파일 주입
        const fileInputs = document.querySelectorAll('input[type="file"]');
        if (fileInputs.length > 0) {
          const parts = imgDataUrl.split(',');
          const mime = parts[0].match(/:(.*?);/)[1];
          const bstr = atob(parts[1]);
          const u8 = new Uint8Array(bstr.length);
          for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
          const blob = new Blob([u8], { type: mime });
          const file = new File([blob], 'upload.png', { type: 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInputs[0].files = dt.files;
          fileInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          fileInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          document.documentElement.setAttribute('data-grok-upload-done', 'true');
        }
      },
      args: [dataUrl]
    });
    await sleep(1000);
  }

  // React 호환 텍스트 입력
  async function inputMotionPrompt(prompt) {
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: (text) => {
        // contenteditable 영역 찾기 (grok.com의 프롬프트 입력)
        const editable = document.querySelector('[contenteditable="true"]');
        if (editable) {
          editable.focus();
          // 기존 내용 선택 후 교체
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
          return;
        }

        // textarea 또는 input 찾기
        const textarea = document.querySelector('textarea[placeholder], textarea');
        if (textarea) {
          textarea.focus();
          // React 호환 방식: native setter 사용
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(textarea, text);
          } else {
            textarea.value = text;
          }
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }

        // input 필드
        const input = document.querySelector('input[type="text"][placeholder*="prompt" i], input[type="text"][placeholder*="motion" i], input[type="text"][placeholder*="describe" i]');
        if (input) {
          input.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(input, text);
          } else {
            input.value = text;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      args: [prompt]
    });
  }

  // Anti-Bot 클릭 시뮬레이션으로 생성 버튼 클릭
  async function clickGenerateButton() {
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        function simulateClick(element) {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };

          element.dispatchEvent(new MouseEvent('mouseover', opts));
          element.dispatchEvent(new MouseEvent('mouseenter', opts));
          element.dispatchEvent(new MouseEvent('mousedown', { ...opts, button: 0 }));

          setTimeout(() => {
            element.dispatchEvent(new MouseEvent('mouseup', { ...opts, button: 0 }));
            element.dispatchEvent(new MouseEvent('click', { ...opts, button: 0 }));
          }, 50 + Math.random() * 100);
        }

        // 생성/전송 버튼 찾기
        const selectors = [
          'button[data-testid="send-button"]',
          'button[aria-label*="send" i]',
          'button[aria-label*="Send" i]',
          'button[aria-label*="submit" i]',
          'button[type="submit"]'
        ];

        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled) {
            simulateClick(btn);
            return;
          }
        }

        // 마지막 수단: 텍스트로 찾기
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.disabled) continue;
          const svg = btn.querySelector('svg');
          if (svg && !btn.textContent.trim()) {
            // 아이콘 전송 버튼일 가능성
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              simulateClick(btn);
              return;
            }
          }
        }
      }
    });
  }

  // 팝업/다이얼로그 자동 닫기 (프로젝트 생성, A/B 테스트 등)
  async function dismissPopups() {
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        // 1) "취소" 버튼 찾기 (프로젝트 이름 팝업 등)
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          const text = btn.textContent?.trim() || '';
          if (text === '취소' || text === 'Cancel' || text === 'cancel') {
            btn.click();
            return;
          }
        }

        // 2) 닫기(X) 버튼 찾기
        const closeButtons = document.querySelectorAll(
          '[role="dialog"] button, .modal button, [data-testid*="close"], [aria-label*="close" i], [aria-label*="dismiss" i]'
        );
        for (const btn of closeButtons) {
          const text = btn.textContent?.trim().toLowerCase() || '';
          if (text === 'x' || text === '×' || text === 'close' || text === 'dismiss' ||
              text === 'no thanks' || text === 'skip' || text === 'maybe later' ||
              btn.getAttribute('aria-label')?.toLowerCase().includes('close')) {
            btn.click();
            return;
          }
        }
      }
    });
  }

  // 영상 완성 대기 (최대 5분)
  async function waitForVideo() {
    const maxWait = 5 * 60 * 1000; // 5분
    const pollInterval = 5000; // 5초
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (!grokIsRunning) return null;

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: grokTabId },
        world: 'MAIN',
        func: () => {
          // 가장 최근 메시지의 video 태그 찾기
          const videos = document.querySelectorAll('video');
          if (videos.length === 0) return null;

          // 마지막 video 요소의 src
          const lastVideo = videos[videos.length - 1];
          const src = lastVideo.src || lastVideo.querySelector('source')?.src;
          if (src && (src.startsWith('blob:') || src.includes('video.twimg.com') || src.includes('.mp4'))) {
            return src;
          }

          // 다운로드 링크 찾기
          const links = document.querySelectorAll('a[download], a[href*=".mp4"]');
          if (links.length > 0) {
            return links[links.length - 1].href;
          }

          // 로딩 인디케이터 확인
          const loading = document.querySelector('[class*="loading"], [class*="spinner"], [class*="progress"], [role="progressbar"]');
          if (loading) return 'loading';

          return null;
        }
      });

      const videoUrl = result?.result;

      if (videoUrl && videoUrl !== 'loading') {
        return videoUrl;
      }

      await sleep(pollInterval);
    }

    console.error('[Grok] 영상 생성 타임아웃 (5분)');
    return null;
  }

  // 영상 다운로드
  async function downloadVideo(videoUrl, originalName) {
    const saveLoc = grokSaveLocation.value || 'grok-videos';
    const baseName = originalName.replace(/\.[^.]+$/, '');
    const filename = `${saveLoc}/${baseName}.mp4`;

    if (videoUrl.startsWith('blob:')) {
      // blob URL → background에서 fetch 후 다운로드
      try {
        // blob URL의 실제 데이터를 content script에서 가져오기
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: grokTabId },
          world: 'MAIN',
          func: async (blobUrl) => {
            try {
              const resp = await fetch(blobUrl);
              const blob = await resp.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              return null;
            }
          },
          args: [videoUrl]
        });

        if (result?.result) {
          // dataUrl을 blob으로 변환하여 다운로드
          await chrome.runtime.sendMessage({
            action: 'GROK_DOWNLOAD_VIDEO',
            dataUrl: result.result,
            filename: filename
          });
        }
      } catch (e) {
        console.error('[Grok] blob 다운로드 오류:', e);
        // 직접 URL로 시도
        await chrome.runtime.sendMessage({
          action: 'GROK_DOWNLOAD_VIDEO',
          url: videoUrl,
          filename: filename
        });
      }
    } else {
      // 일반 URL 다운로드
      await chrome.runtime.sendMessage({
        action: 'GROK_DOWNLOAD_VIDEO',
        url: videoUrl,
        filename: filename
      });
    }
  }

  // ============================================================
  // 이벤트 핸들러
  // ============================================================
  grokStartBtn.addEventListener('click', () => {
    if (!grokIsRunning) {
      runGrokAutomation();
    }
  });

  grokStopBtn.addEventListener('click', async () => {
    grokIsRunning = false;
    grokStartBtn.hidden = false;
    grokStopBtn.hidden = true;
    updateGrokStartBtn();
    updateProgress(
      parseInt(grokCurrentIndexEl.textContent),
      parseInt(grokTotalCountEl.textContent),
      '사용자에 의해 중지됨'
    );

    // grok.com에 정지 신호 전달
    if (grokTabId) {
      try {
        await chrome.tabs.sendMessage(grokTabId, { action: 'GROK_STOP_AUTOMATION' });
      } catch (e) {
        console.log('[Grok] 정지 신호 전달 실패:', e.message);
      }
    }
  });

  // background에서 오는 메시지 수신
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'GROK_PROGRESS_UPDATE') {
      updateProgress(message.current, message.total, message.status);
    } else if (message.action === 'GROK_AUTOMATION_ERROR') {
      console.error('[Grok] 자동화 오류:', message.error);
    }
  });

  // ============================================================
  // 초기화
  // ============================================================
  loadState();

  // 모션 프롬프트 파일 로드 이벤트 수신
  window.addEventListener('grokMotionPromptsLoaded', (e) => {
    const prompts = e.detail.prompts;
    const pendingItems = grokQueue.filter(i => i.status === 'pending');

    pendingItems.forEach((item, idx) => {
      if (idx < prompts.length) {
        item.motionPrompt = prompts[idx];
      }
    });

    renderQueue();
    saveQueue();
  });

  // 5초마다 연결 상태 확인 (Grok 모드일 때만)
  setInterval(() => {
    if (!grokContainer.hidden) {
      checkGrokConnection();
    }
  }, 5000);

  console.log('[Grok Automator] grok.js 로드 완료');
})();
