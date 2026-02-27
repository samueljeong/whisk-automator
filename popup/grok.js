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
  const modeTabFlow = $('#modeTabFlow');
  const modeTabGrok = $('#modeTabGrok');
  const flowContainer = $('#flowContainer');
  const grokContainer = $('#grokContainer');

  const grokConnectionStatus = $('#grokConnectionStatus');
  const grokOpenTabBtn = $('#grokOpenTabBtn');
  const grokFileInput = $('#grokFileInput');
  const grokImportFlowBtn = $('#grokImportFlowBtn');
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
  const grokUpscaleEnabled = $('#grokUpscaleEnabled');

  // ============================================================
  // 모드 탭 전환
  // ============================================================
  function switchMode(mode) {
    if (mode === 'flow') {
      modeTabFlow.classList.add('active');
      modeTabGrok.classList.remove('active');
      flowContainer.hidden = false;
      grokContainer.hidden = true;
    } else {
      // 라이선스 인증 확인
      if (!window.licenseValid) {
        alert('Whisk 라이선스 인증 후 사용할 수 있습니다.');
        return;
      }
      modeTabFlow.classList.remove('active');
      modeTabGrok.classList.add('active');
      flowContainer.hidden = true;
      grokContainer.hidden = false;
      checkGrokConnection();
    }
    chrome.storage.local.set({ grok_activeMode: mode });
  }

  modeTabFlow.addEventListener('click', () => switchMode('flow'));
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
      grok_saveLocation: grokSaveLocation.value || 'grok-videos',
      grok_upscaleEnabled: grokUpscaleEnabled.checked
    });
  }

  async function loadState() {
    const result = await chrome.storage.local.get([
      'grok_queueMeta', 'grok_motionPrompt', 'grok_delay',
      'grok_saveLocation', 'grok_activeMode', 'grok_upscaleEnabled'
    ]);

    if (result.grok_motionPrompt) grokMotionPrompt.value = result.grok_motionPrompt;
    if (result.grok_delay) grokDelay.value = result.grok_delay;
    if (result.grok_saveLocation) grokSaveLocation.value = result.grok_saveLocation;
    if (result.grok_upscaleEnabled !== undefined) grokUpscaleEnabled.checked = result.grok_upscaleEnabled;

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
  grokUpscaleEnabled.addEventListener('change', saveSettings);

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
  grokImportFlowBtn.addEventListener('click', async () => {
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
        // Step 0: Imagine 모드 진입 (사이드바 클릭)
        updateProgress(completed, total, `${item.name}: Imagine 모드 진입...`);
        await clickImagineInSidebar();
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

        // Step 3: 생성 버튼 클릭 (최대 3회 재시도)
        updateProgress(completed, total, `${item.name}: 생성 요청 중...`);
        let clickResult = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          clickResult = await clickGenerateButton();
          if (clickResult?.found) break;
          console.log(`[Grok] 생성 버튼 클릭 ${attempt}차 실패, ${attempt < 3 ? '재시도...' : '중단'}`);
          updateProgress(completed, total, `${item.name}: 버튼 찾기 ${attempt}/3...`);
          await sleep(2000);
        }
        if (!clickResult?.found) {
          throw new Error('생성 버튼을 찾을 수 없습니다. 콘솔에서 버튼 목록을 확인하세요.');
        }
        await sleep(2000);

        // Step 4: A/B 테스트 팝업 자동 처리
        await dismissPopups();

        // Step 5: 영상 완성 대기
        updateProgress(completed, total, `${item.name}: 영상 생성 대기 중...`);
        let videoUrl = await waitForVideo();

        // Step 5.5: 업스케일 (옵션)
        if (videoUrl && grokUpscaleEnabled.checked) {
          updateProgress(completed, total, `${item.name}: 업스케일 중...`);
          const upscaleClicked = await clickUpscaleInMenu();
          if (upscaleClicked) {
            const upscaledUrl = await waitForUpscale();
            if (upscaledUrl) {
              videoUrl = upscaledUrl;
              console.log('[Grok] 업스케일 완료, 새 URL:', videoUrl.substring(0, 80));
            } else {
              console.log('[Grok] 업스케일 대기 실패, 원본 영상으로 진행');
            }
          } else {
            console.log('[Grok] 업스케일 메뉴 클릭 실패, 원본 영상으로 진행');
          }
        }

        if (videoUrl) {
          // Step 6a: URL 추출 성공 → 프로그래밍 방식 다운로드
          updateProgress(completed, total, `${item.name}: 다운로드 중...`);
          item.videoUrl = videoUrl;
          await downloadVideo(videoUrl, item.name);
          item.status = 'done';
        } else {
          // Step 6b: URL 추출 실패 → 페이지 다운로드 버튼 클릭
          console.log('[Grok] video URL 미발견, 페이지 다운로드 버튼 시도');
          updateProgress(completed, total, `${item.name}: 다운로드 버튼 클릭...`);
          const downloaded = await clickPageDownloadButton();
          if (downloaded) {
            await sleep(5000); // 다운로드 시작 대기
            item.status = 'done';
          } else {
            item.status = 'error';
          }
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

  // Imagine 페이지로 이동 (URL 직접 이동 - 사이드바 클릭 대신)
  async function clickImagineInSidebar() {
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        console.log('[Grok] Imagine 페이지로 URL 직접 이동');
        window.location.href = 'https://grok.com/imagine';
      }
    });
  }

  // (미사용) 이전 네비게이션 함수
  async function navigateToImagine() {
    // 1) 사이드바의 "Imagine" 링크 클릭으로 갤러리 이동
    const [navResult] = await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        // 사이드바에서 "Imagine" 링크 찾기
        const links = document.querySelectorAll('a[href*="/imagine"], nav a, aside a');
        for (const link of links) {
          const text = link.textContent?.trim() || '';
          if (text === 'Imagine' || text.includes('Imagine')) {
            link.click();
            return 'sidebar-imagine';
          }
        }
        // fallback: window.location 직접 변경
        window.location.href = '/imagine';
        return 'location-fallback';
      }
    });
    console.log('[Grok] 네비게이션:', navResult?.result);

    // 2) 갤러리 페이지 로드 대기
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const [urlCheck] = await chrome.scripting.executeScript({
          target: { tabId: grokTabId },
          func: () => ({ ready: document.readyState === 'complete', url: window.location.pathname })
        });
        // /imagine 갤러리에 도착했는지 확인 (/imagine/post가 아닌)
        if (urlCheck?.result?.ready && urlCheck.result.url === '/imagine') break;
      } catch (e) { /* 로딩 중 */ }
    }
    await sleep(2000);

    // 3) 페이지의 모든 버튼 스캔 + "만들기" 클릭
    const [scanResult] = await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        const elements = document.querySelectorAll('button, a, [role="button"]');
        const found = [];
        for (const el of elements) {
          const text = el.textContent?.trim() || '';
          const href = el.href || el.getAttribute('href') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          if (text.length > 0 && text.length < 30) {
            found.push(`${el.tagName}:"${text}" href=${href} aria=${ariaLabel}`);
          }
        }

        // "만들기" / "Create" / "새로 만들기" 등 클릭
        for (const el of elements) {
          const text = el.textContent?.trim() || '';
          const href = el.href || el.getAttribute('href') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          if (/^(만들기|Create|새로 만들기|\+ 만들기|New|새 이미지)$/i.test(text) ||
              /만들기|create/i.test(ariaLabel) ||
              /\/imagine\/(create|new)/.test(href)) {
            el.click();
            return { clicked: text || ariaLabel, found };
          }
        }

        // "만들기"를 포함하는 버튼 (부분 일치)
        for (const el of elements) {
          const text = el.textContent?.trim() || '';
          if (/만들기|create/i.test(text) && text.length < 20) {
            el.click();
            return { clicked: text, found };
          }
        }

        return { clicked: null, found };
      }
    });

    const result = scanResult?.result;
    if (result?.clicked) {
      console.log('[Grok] "만들기" 클릭 성공:', result.clicked);
    } else {
      console.log('[Grok] "만들기" 버튼 미발견. 페이지 버튼 목록:', result?.found);
    }
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

  // 생성 버튼(↑ 화살표) 클릭 - 화면 좌표 기반으로 프롬프트 입력란과 같은 행의 버튼 탐색
  async function clickGenerateButton() {
    const [result] = await chrome.scripting.executeScript({
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

        // ── 1단계: aria-label로 동영상 생성 버튼 직접 탐색 ──
        // grok.com/imagine은 채팅 UI가 아닌 이미지 편집 UI이므로
        // 입력란 근처가 아닌 aria-label로 직접 찾는 것이 가장 정확
        const ariaSelectors = [
          'button[aria-label="동영상 만들기"]',
          'button[aria-label*="make video" i]',
          'button[aria-label*="create video" i]',
          'button[aria-label*="generate video" i]',
          'button[aria-label*="generate image" i]',
        ];
        for (const sel of ariaSelectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled) {
            const r = btn.getBoundingClientRect();
            if (r.width > 0) {
              console.log('[Grok] ✓ aria 직접 매치:', sel,
                `pos=(${Math.round(r.left)},${Math.round(r.top)})`,
                `${Math.round(r.width)}x${Math.round(r.height)}`);
              simulateClick(btn);
              return { found: true, method: 'aria-direct', selector: sel };
            }
          }
        }

        // ── 2단계: 셀렉터 기반 탐색 ──
        const selectors = [
          'button[data-testid="send-button"]',
          'button[data-testid="generate-button"]',
          'button[aria-label*="send" i]',
          'button[aria-label*="generate" i]',
          'button[type="submit"]'
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled) {
            const r = btn.getBoundingClientRect();
            console.log('[Grok] ✓ 셀렉터 매치:', sel,
              `pos=(${Math.round(r.left)},${Math.round(r.top)})`);
            simulateClick(btn);
            return { found: true, method: 'selector', selector: sel };
          }
        }

        // ── 3단계: 텍스트/aria 패턴 기반 폴백 ──
        const allBtns = document.querySelectorAll('button:not([disabled])');
        for (const btn of allBtns) {
          const text = (btn.textContent || '').trim();
          const aria = (btn.getAttribute('aria-label') || '');
          // "동영상"이 포함된 aria (단, "옵션"은 제외)
          if (/동영상/i.test(aria) && !/옵션/i.test(aria)) {
            const r = btn.getBoundingClientRect();
            console.log('[Grok] ✓ 동영상 aria 매치:', aria,
              `pos=(${Math.round(r.left)},${Math.round(r.top)})`);
            simulateClick(btn);
            return { found: true, method: 'aria-video', aria };
          }
          if (/^(generate|create|send|생성|만들기|전송)$/i.test(text)) {
            console.log('[Grok] ✓ 텍스트 폴백:', text);
            simulateClick(btn);
            return { found: true, method: 'text-fallback', text };
          }
        }

        // ── 실패: 진단 로그 ──
        const diag = [];
        for (const btn of allBtns) {
          const r = btn.getBoundingClientRect();
          if (r.width === 0) continue;
          diag.push({
            text: (btn.textContent || '').trim().substring(0, 30),
            aria: btn.getAttribute('aria-label'),
            x: Math.round(r.left), y: Math.round(r.top),
            size: `${Math.round(r.width)}x${Math.round(r.height)}`,
            svg: !!btn.querySelector('svg')
          });
        }
        console.log('[Grok] 전송 버튼 미발견. 전체 버튼:',
          JSON.stringify(diag, null, 2));
        return { found: false, reason: 'all-failed', buttons: diag };
      }
    });

    const res = result?.result;
    if (res?.found) {
      console.log(`[Grok] 생성 버튼 클릭: ${res.method}`);
    } else {
      console.error('[Grok] 생성 버튼 미발견:', res?.reason);
    }
    return res;
  }

  // 팝업/다이얼로그 처리 (프로젝트 다이얼로그는 유지, 방해 팝업만 처리)
  async function dismissPopups() {
    await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        // 프로젝트 다이얼로그는 닫지 않음 (취소/Cancel 클릭 제거)
        // A/B 테스트, 쿠키, 알림 등 방해 팝업만 닫기
        const closeButtons = document.querySelectorAll(
          '[data-testid*="close"], [aria-label*="dismiss" i]'
        );
        for (const btn of closeButtons) {
          const text = btn.textContent?.trim().toLowerCase() || '';
          const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
          // 프로젝트 관련은 건드리지 않음
          if (label.includes('project') || label.includes('프로젝트')) continue;
          if (text === 'no thanks' || text === 'skip' || text === 'maybe later' ||
              label.includes('dismiss')) {
            console.log('[Grok] 방해 팝업 닫기:', text || label);
            btn.click();
            return;
          }
        }
        console.log('[Grok] 닫을 방해 팝업 없음');
      }
    });
  }

  // 영상 완성 대기 (최대 3분)
  async function waitForVideo() {
    const maxWait = 3 * 60 * 1000; // 3분
    const pollInterval = 3000; // 3초
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < maxWait) {
      if (!grokIsRunning) return null;
      pollCount++;

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: grokTabId },
        world: 'MAIN',
        func: (shouldLog) => {
          // 1. video 태그
          const videos = document.querySelectorAll('video');
          for (const v of videos) {
            const src = v.src || v.currentSrc || v.querySelector('source')?.src;
            if (src) {
              console.log('[Grok] 영상 URL 발견:', src.substring(0, 120));
              return { type: 'url', value: src };
            }
          }

          // 2. download 링크
          const dlinks = document.querySelectorAll('a[download], a[href*=".mp4"], a[href*="video"]');
          for (const a of dlinks) {
            if (a.href && !a.href.startsWith('javascript:')) {
              return { type: 'url', value: a.href };
            }
          }

          // 3. 로딩 상태
          const loadingEls = document.querySelectorAll(
            '[class*="loading"], [class*="spinner"], [class*="progress"], [role="progressbar"], [class*="generating"]'
          );

          // 4. 주기적 진단 로그 (매 3번째 = 9초마다)
          if (shouldLog) {
            console.log('[Grok] 대기 중...',
              'video:', videos.length,
              'loading:', loadingEls.length,
              'elapsed:', Math.round((Date.now() - performance.timeOrigin) / 1000) + 's');
          }

          if (videos.length > 0) return { type: 'video-no-src' };
          if (loadingEls.length > 0) return { type: 'loading' };
          return { type: 'none' };
        },
        args: [pollCount % 3 === 0]
      });

      const res = result?.result;
      if (res?.type === 'url') return res.value;

      await sleep(pollInterval);
    }

    console.log('[Grok] 영상 대기 타임아웃 (3분)');
    return null;
  }

  // 더보기(...) 메뉴 → "동영상 업스케일" 클릭
  // "추가 옵션" aria-label을 가진 버튼이 영상 오버레이의 ... 버튼
  // .click()이 아닌 마우스 이벤트 시뮬레이션 필요 (React 이벤트 시스템)
  async function clickUpscaleInMenu() {
    // ── 1단계: "추가 옵션" 버튼 찾기 & 마우스 이벤트로 클릭 ──
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        function simulateClick(element) {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
          element.dispatchEvent(new MouseEvent('pointerdown', { ...opts, pointerId: 1 }));
          element.dispatchEvent(new MouseEvent('mousedown', opts));
          element.dispatchEvent(new MouseEvent('pointerup', { ...opts, pointerId: 1 }));
          element.dispatchEvent(new MouseEvent('mouseup', opts));
          element.dispatchEvent(new MouseEvent('click', opts));
        }

        // "추가 옵션" 버튼 = 영상 오버레이의 ... 버튼
        const btn = document.querySelector('button[aria-label="추가 옵션"]');
        if (!btn) {
          console.error('[Grok Upscale] "추가 옵션" 버튼 미발견');
          return { success: false, reason: 'no-more-options-button' };
        }

        const r = btn.getBoundingClientRect();
        console.log('[Grok Upscale] "추가 옵션" 버튼 클릭 (simulateClick):',
          `(${Math.round(r.left)},${Math.round(r.top)}) ${Math.round(r.width)}x${Math.round(r.height)}`);

        // 클릭 전 DOM 스냅샷: 현재 존재하는 모든 텍스트 노드 수집
        const preClickTexts = new Set();
        document.querySelectorAll('*').forEach(el => {
          const t = (el.textContent || '').trim();
          if (t.length > 0 && t.length < 50) preClickTexts.add(t);
        });

        simulateClick(btn);

        return { success: true, step: 'menu-opened', preClickCount: preClickTexts.size };
      }
    });

    if (!result?.result?.success) {
      console.error('[Grok] 더보기 메뉴 열기 실패:', result?.result?.reason);
      return false;
    }

    // 메뉴 렌더링 대기 (React 상태 업데이트 + DOM 반영)
    await sleep(1500);

    // ── 2단계: 새로 나타난 팝업/메뉴에서 "업스케일" 항목 찾아 클릭 ──
    const [menuResult] = await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        function simulateClick(element) {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
          element.dispatchEvent(new MouseEvent('pointerdown', { ...opts, pointerId: 1 }));
          element.dispatchEvent(new MouseEvent('mousedown', opts));
          element.dispatchEvent(new MouseEvent('pointerup', { ...opts, pointerId: 1 }));
          element.dispatchEvent(new MouseEvent('mouseup', opts));
          element.dispatchEvent(new MouseEvent('click', opts));
        }

        // 전략 1: "추가 옵션" 버튼 주변에 새로 나타난 팝업/드롭다운 탐색
        // 팝업은 보통 fixed/absolute positioned이며 최근 렌더링됨
        const moreBtn = document.querySelector('button[aria-label="추가 옵션"]');
        const btnRect = moreBtn ? moreBtn.getBoundingClientRect() : null;

        // 모든 요소에서 "업스케일" / "upscale" 텍스트 포함 요소 전체 검색
        const allElements = document.querySelectorAll('*');
        const upscaleCandidates = [];

        for (const el of allElements) {
          // 직접 텍스트 노드만 확인 (자식의 텍스트 제외)
          let directText = '';
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              directText += node.textContent;
            }
          }
          directText = directText.trim();

          // 또는 짧은 textContent
          const fullText = (el.textContent || '').trim();

          if ((directText && /업스케일|upscale/i.test(directText)) ||
              (fullText.length < 30 && /업스케일|upscale/i.test(fullText))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            upscaleCandidates.push({
              el,
              text: fullText,
              directText,
              tag: el.tagName,
              x: Math.round(r.left), y: Math.round(r.top),
              w: Math.round(r.width), h: Math.round(r.height),
              role: el.getAttribute('role'),
              aria: el.getAttribute('aria-label') || ''
            });
          }
        }

        console.log('[Grok Upscale] "업스케일" 텍스트 포함 요소:', upscaleCandidates.length,
          upscaleCandidates.map(c => `${c.tag}:"${c.text}" (${c.x},${c.y}) ${c.w}x${c.h}`));

        if (upscaleCandidates.length > 0) {
          // 가장 적절한 클릭 대상: 가장 작은(구체적인) 요소, 또는 클릭 가능한 가장 가까운 요소
          for (const c of upscaleCandidates) {
            const clickTarget = c.el.closest('button, a, [role="menuitem"], [role="option"], [role="button"], li') || c.el;
            console.log('[Grok Upscale] 업스케일 항목 클릭:', c.text, clickTarget.tagName);
            simulateClick(clickTarget);
            return { success: true, text: c.text };
          }
        }

        // 폴백: 추가 옵션 버튼 근처(±300px)에 새로 나타난 모든 클릭 가능 요소 로깅
        const diag = [];
        if (btnRect) {
          for (const el of document.querySelectorAll('button, a, div, span, li')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            // 버튼 주변 300px 범위
            if (Math.abs(r.left - btnRect.left) < 300 && Math.abs(r.top - btnRect.top) < 300) {
              const text = (el.textContent || '').trim();
              if (text.length > 0 && text.length < 50 && el.children.length <= 2) {
                diag.push({
                  text, tag: el.tagName,
                  pos: `(${Math.round(r.left)},${Math.round(r.top)})`,
                  size: `${Math.round(r.width)}x${Math.round(r.height)}`
                });
              }
            }
          }
        }

        console.error('[Grok Upscale] 업스케일 항목 미발견. 버튼 주변 요소들:',
          JSON.stringify(diag, null, 2));
        return { success: false, reason: 'upscale-item-not-found', nearbyElements: diag };
      }
    });

    const menuRes = menuResult?.result;
    if (menuRes?.success) {
      console.log('[Grok] 업스케일 메뉴 클릭 성공:', menuRes.text);
      return true;
    } else {
      console.error('[Grok] 업스케일 메뉴 클릭 실패:', menuRes?.reason);
      return false;
    }
  }

  // 업스케일 완료 대기 (최대 5분)
  // 완료 시그널: "HD" 배지 출현, video src 변경, 로딩 인디케이터 소멸
  async function waitForUpscale() {
    const maxWait = 5 * 60 * 1000; // 5분
    const pollInterval = 3000; // 3초
    const startTime = Date.now();
    let pollCount = 0;

    // 업스케일 시작 전 현재 video src 기록
    const [initialResult] = await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        const video = document.querySelector('video');
        return video ? (video.src || video.currentSrc || '') : '';
      }
    });
    const initialSrc = initialResult?.result || '';
    console.log('[Grok Upscale] 초기 video src:', initialSrc.substring(0, 80));

    while (Date.now() - startTime < maxWait) {
      if (!grokIsRunning) return null;
      pollCount++;

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: grokTabId },
        world: 'MAIN',
        func: (origSrc, shouldLog) => {
          // 1. HD 배지 확인 (스크린샷: 업스케일 완료 후 "HD" 텍스트가 버튼에 표시됨)
          let hdFound = false;
          const allEls = document.querySelectorAll('button, span, div, p');
          for (const el of allEls) {
            const text = (el.textContent || '').trim();
            // "HD" 텍스트가 정확히 매치 (다른 긴 텍스트 속 HD 제외)
            if (text === 'HD' || text === 'hd') {
              hdFound = true;
              break;
            }
          }
          // aria-label에 HD 포함된 버튼
          if (!hdFound) {
            const hdBtns = document.querySelectorAll('button[aria-label*="HD"], button[aria-label*="hd"]');
            if (hdBtns.length > 0) hdFound = true;
          }

          // 2. video src 변경 확인
          const video = document.querySelector('video');
          const currentSrc = video ? (video.src || video.currentSrc || '') : '';
          const srcChanged = currentSrc && currentSrc !== origSrc;

          // 3. 로딩 인디케이터
          const loadingEls = document.querySelectorAll(
            '[class*="loading"], [class*="spinner"], [class*="progress"], [role="progressbar"], [class*="generating"]'
          );
          const isLoading = loadingEls.length > 0;

          if (shouldLog) {
            console.log('[Grok Upscale] 대기 중...',
              'HD:', hdFound, 'srcChanged:', srcChanged,
              'loading:', isLoading,
              'elapsed:', Math.round((Date.now() - startTime) / 1000) + 's');
          }

          // 완료 조건 1: HD 배지가 나타남
          if (hdFound) {
            return { done: true, videoUrl: currentSrc || null, method: 'hd-badge' };
          }

          // 완료 조건 2: src가 변경되고 로딩 없음
          if (srcChanged && !isLoading) {
            return { done: true, videoUrl: currentSrc, method: 'src-changed' };
          }

          return { done: false, isLoading };
        },
        args: [initialSrc, pollCount % 3 === 0]
      });

      const res = result?.result;
      if (res?.done) {
        console.log('[Grok Upscale] 업스케일 완료!', res.method, res.videoUrl?.substring(0, 80));
        return res.videoUrl;
      }

      await sleep(pollInterval);
    }

    console.log('[Grok Upscale] 업스케일 대기 타임아웃 (5분)');
    return null;
  }

  // 페이지의 다운로드 버튼 클릭 (video URL 추출 실패 시 폴백)
  async function clickPageDownloadButton() {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: grokTabId },
      world: 'MAIN',
      func: () => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          const aria = (btn.getAttribute('aria-label') || '');
          if (/다운로드|download/i.test(aria)) {
            console.log('[Grok] 페이지 다운로드 버튼 클릭:', aria);
            btn.click();
            return { clicked: true, aria };
          }
        }
        // a 태그 다운로드 링크
        const links = document.querySelectorAll('a[download]');
        if (links.length > 0) {
          links[links.length - 1].click();
          return { clicked: true, type: 'link' };
        }
        console.log('[Grok] 다운로드 버튼 미발견');
        return { clicked: false };
      }
    });
    const res = result?.result;
    if (res?.clicked) {
      console.log('[Grok] 페이지 다운로드 버튼 클릭 성공:', res.aria || res.type);
    }
    return res?.clicked;
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
    if (!window.licenseValid) {
      alert('Whisk 라이선스 인증 후 사용할 수 있습니다.');
      return;
    }
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
