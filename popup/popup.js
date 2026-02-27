// State
let prompts = [];
let isRunning = false;
let currentIndex = 0;
let customDirHandle = null; // File System Access API handle
let sortedPromptsCache = [];  // 리로드 후 재개용
let automationParams = {};     // 재주입에 필요한 파라미터
let completedOffset = 0;       // 리로드 전 완료 수 (진행바 보정)
let promptIndexMap = [];        // 필터링된 인덱스 → 원본 prompts 인덱스 매핑

// DOM Elements
const connectionStatus = document.getElementById('connectionStatus');
const promptInput = document.getElementById('promptInput');
const fileInput = document.getElementById('fileInput');
const addPromptsBtn = document.getElementById('addPromptsBtn');
const promptQueue = document.getElementById('promptQueue');
const queueCount = document.getElementById('queueCount');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const autoDownload = document.getElementById('autoDownload');
const delayInput = document.getElementById('delayInput');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const currentIndexEl = document.getElementById('currentIndex');
const totalCountEl = document.getElementById('totalCount');
const currentPromptEl = document.getElementById('currentPrompt');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const modelSelect = document.getElementById('modelSelect');
const outputType = document.getElementById('outputType');
const characterList = document.getElementById('characterList');
const projectTabs = document.getElementById('projectTabs');
const addCharacterBtn = document.getElementById('addCharacterBtn');
const addProjectBtn = document.getElementById('addProjectBtn');
const saveLocation = document.getElementById('saveLocation');
const resetLocationBtn = document.getElementById('resetLocationBtn');
const captureCharacterBtn = document.getElementById('captureCharacterBtn');
const captureModal = document.getElementById('captureModal');
const capturedImage = document.getElementById('capturedImage');
const charNameInput = document.getElementById('charNameInput');
const charAliasInput = document.getElementById('charAliasInput');
const cancelCaptureBtn = document.getElementById('cancelCaptureBtn');
const saveCaptureBtn = document.getElementById('saveCaptureBtn');
const stylePrefix = document.getElementById('stylePrefix');
const styleSuffix = document.getElementById('styleSuffix');
const characterWarning = document.getElementById('characterWarning');
const warningText = document.getElementById('warningText');

// 프로젝트별 캐릭터 정보
// 폴더 스캔으로 프로젝트를 생성합니다
const DEFAULT_PROJECTS = {
  "common": {
    name: "공통",
    characters: {},
    scenes: {},
    inheritCommon: false,
    stylePrefix: "",
    styleSuffix: "",
    characterStyleMap: {}
  }
};

let PROJECTS = { ...DEFAULT_PROJECTS };
let currentProject = "common";

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();

  // License check
  const licenseResult = await checkLicense();
  if (licenseResult.valid) {
    showMainUI(licenseResult);
  } else {
    showLicenseScreen();
    return; // Don't initialize main UI
  }

  await checkConnection();
  updateUI();
  // 커스텀 폴더 UI 상태 반영
  if (typeof updateCustomDirUI === 'function') updateCustomDirUI();
  if (typeof updateCharFolderHint === 'function') updateCharFolderHint();
});

// License UI functions
function showMainUI(licenseResult) {
  window.licenseValid = true;
  document.getElementById('licenseScreen').hidden = true;
  document.getElementById('mainContainer').hidden = false;
  const statusEl = document.getElementById('licenseStatus');
  if (licenseResult.expires) {
    statusEl.textContent = `만료: ${formatExpiry(licenseResult.expires)}`;
  }
  if (licenseResult.offline) {
    statusEl.textContent += ' (오프라인)';
  }
}

function showLicenseScreen() {
  window.licenseValid = false;
  document.getElementById('licenseScreen').hidden = false;
  document.getElementById('mainContainer').hidden = true;

  const keyInput = document.getElementById('licenseKeyInput');
  const submitBtn = document.getElementById('licenseSubmitBtn');
  const errorEl = document.getElementById('licenseError');

  // Auto-format input
  keyInput.addEventListener('input', () => {
    let val = keyInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    // Auto-insert dashes
    const raw = val.replace(/-/g, '');
    if (raw.length > 5) {
      val = raw.slice(0, 5) + '-' + raw.slice(5);
    }
    if (raw.length > 9) {
      val = raw.slice(0, 5) + '-' + raw.slice(5, 9) + '-' + raw.slice(9, 13);
    }
    keyInput.value = val.slice(0, 15);
    errorEl.hidden = true;
  });

  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = '확인 중...';
    errorEl.hidden = true;

    const result = await submitLicenseKey(keyInput.value);

    if (result.valid) {
      showMainUI(result);
      await checkConnection();
      updateUI();
      if (typeof updateCustomDirUI === 'function') updateCustomDirUI();
      if (typeof updateCharFolderHint === 'function') updateCharFolderHint();
    } else {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = '확인';
    }
  });

  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });
}

// License change button
document.getElementById('licenseChangeBtn')?.addEventListener('click', async () => {
  await clearLicenseCache();
  showLicenseScreen();
});

// Check connection to Flow page
async function checkConnection() {
  try {
    // 사이드 패널에서는 lastFocusedWindow 사용
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    const url = tab?.url || '';

    console.log('[Flow Automator] Current tab URL:', url);

    // Flow 페이지 패턴 확인 (다양한 URL 형식 지원)
    const isFlowPage = url.includes('labs.google') && url.includes('flow') ||
                       url.includes('/fx/flow') ||
                       url.includes('/fx/tools/flow');

    if (isFlowPage) {
      connectionStatus.textContent = '연결됨';
      connectionStatus.className = 'status connected';
      startBtn.disabled = prompts.length === 0;
    } else {
      connectionStatus.textContent = 'Flow 페이지 아님';
      connectionStatus.className = 'status disconnected';
      startBtn.disabled = true;
    }
  } catch (error) {
    console.error('[Flow Automator] Connection check error:', error);
    connectionStatus.textContent = '연결 실패';
    connectionStatus.className = 'status disconnected';
    startBtn.disabled = true;
  }
}

// IndexedDB for FileSystemDirectoryHandle persistence
function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('FlowAutomatorHandles', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveDirHandle(handle) {
  const db = await openHandleDB();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(handle, 'saveDir');
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function loadDirHandle() {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('saveDir');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function clearDirHandle() {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('saveDir');
  } catch (e) { /* ignore */ }
}

// Character folder handle persistence (reuses same IndexedDB)
async function saveCharFolderHandle(handle) {
  const db = await openHandleDB();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(handle, 'charDir');
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function loadCharFolderHandle() {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('charDir');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

// File → data URL 변환
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 프로젝트 이름으로 키 찾기
function findProjectKeyByName(name) {
  const normalized = name.normalize('NFC');
  for (const [key, proj] of Object.entries(PROJECTS)) {
    if (proj.name === normalized || key === normalized) return key;
  }
  return null;
}

// style.txt 파싱: [접두어] / [접미어] 섹션으로 구분
function parseStyleTxt(text) {
  const result = { prefix: '', suffix: '' };
  let currentSection = null;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '[접두어]' || trimmed === '[prefix]') {
      currentSection = 'prefix';
      continue;
    }
    if (trimmed === '[접미어]' || trimmed === '[suffix]') {
      currentSection = 'suffix';
      continue;
    }
    // #으로 시작하는 줄은 주석
    if (trimmed.startsWith('#')) continue;
    if (currentSection && trimmed) {
      result[currentSection] += (result[currentSection] ? ' ' : '') + trimmed;
    }
  }
  return result;
}

// 폴더에서 캐릭터 스캔
// 구조: rootFolder/ → 프로젝트폴더/ → 캐릭터이미지.jpg
// 폴더 구조: flow / 피사체|장면|스타일 / 프로젝트명 / 이미지.jpg
async function scanCharacterFolder(rootHandle) {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  let totalCount = 0;

  // 기존 폴더 기반 데이터 제거 (재스캔 대비)
  for (const proj of Object.values(PROJECTS)) {
    for (const [name, char] of Object.entries(proj.characters || {})) {
      if (char.fromFolder) delete proj.characters[name];
    }
    for (const [name, scene] of Object.entries(proj.scenes || {})) {
      if (scene.fromFolder) delete proj.scenes[name];
    }
    // styleImage 제거됨 (Flow에는 스타일 이미지 슬롯 없음)
    if (proj.stylePrefixFromFolder) {
      proj.stylePrefix = '';
      proj.stylePrefixFromFolder = false;
    }
    if (proj.styleSuffixFromFolder) {
      proj.styleSuffix = '';
      proj.styleSuffixFromFolder = false;
    }
  }

  // 슬롯 폴더명 → 타입 매핑
  const slotMap = {
    '\uD53C\uC0AC\uCCB4': 'characters',   // 피사체
    'subject': 'characters',
    '\uC7A5\uBA74': 'scenes',              // 장면
    'scene': 'scenes',
    'scenes': 'scenes',
    '\uC2A4\uD0C0\uC77C': 'style',        // 스타일
    'style': 'style'
  };

  const foundFolders = [];
  for await (const slotEntry of rootHandle.values()) {
    if (slotEntry.kind !== 'directory') continue;

    const slotName = slotEntry.name.normalize('NFC');
    const slotType = slotMap[slotName] || slotMap[slotName.toLowerCase()];
    foundFolders.push(`${slotEntry.name}→${slotType || '무시'}`);
    if (!slotType) {
      console.log(`[Flow] 알 수 없는 폴더 무시: ${slotEntry.name} (NFC: ${slotName})`);
      continue;
    }
    console.log(`[Flow] 슬롯 발견: ${slotName} → ${slotType}`);

    // 슬롯 폴더 안의 프로젝트 폴더 스캔
    for await (const projEntry of slotEntry.values()) {
      if (projEntry.kind !== 'directory') continue;

      const projName = projEntry.name.normalize('NFC');
      let projectKey = findProjectKeyByName(projName);

      if (!projectKey) {
        // 새 프로젝트 자동 생성
        projectKey = projName.toLowerCase().replace(/\s+/g, '_');
        PROJECTS[projectKey] = {
          name: projName,
          characters: {},
          scenes: {},
          inheritCommon: true,
          stylePrefix: '',
          styleSuffix: ''
        };
      }

      for await (const fileEntry of projEntry.values()) {
        if (fileEntry.kind !== 'file') continue;
        const ext = fileEntry.name.substring(fileEntry.name.lastIndexOf('.')).toLowerCase();

        // style.txt 파일 처리 (스타일 슬롯에서만)
        if (slotType === 'style' && fileEntry.name.toLowerCase() === 'style.txt') {
          try {
            const file = await fileEntry.getFile();
            const text = await file.text();
            const parsed = parseStyleTxt(text);
            if (parsed.prefix) {
              PROJECTS[projectKey].stylePrefix = parsed.prefix;
              PROJECTS[projectKey].stylePrefixFromFolder = true;
            }
            if (parsed.suffix) {
              PROJECTS[projectKey].styleSuffix = parsed.suffix;
              PROJECTS[projectKey].styleSuffixFromFolder = true;
            }
            console.log(`[Flow] style.txt 로드: ${projName}`, parsed);
          } catch (e) {
            console.error(`[Flow] style.txt 읽기 실패: ${projName}`, e);
          }
          continue;
        }

        if (!imageExts.includes(ext)) continue;

        const name = fileEntry.name.substring(0, fileEntry.name.lastIndexOf('.')).normalize('NFC');

        try {
          const file = await fileEntry.getFile();
          const dataUrl = await readFileAsDataUrl(file);

          if (slotType === 'characters') {
            PROJECTS[projectKey].characters[name] = {
              image: dataUrl,
              aliases: [name],
              isLocal: true,
              fromFolder: true
            };
            totalCount++;
          } else if (slotType === 'scenes') {
            if (!PROJECTS[projectKey].scenes) PROJECTS[projectKey].scenes = {};
            PROJECTS[projectKey].scenes[name] = {
              image: dataUrl,
              aliases: [name],
              isLocal: true,
              fromFolder: true
            };
            totalCount++;
          } else if (slotType === 'style') {
            // Flow에서는 스타일 이미지 슬롯 없음, style.txt만 유효
            // 이미지 파일은 무시
          }
        } catch (e) {
          console.error(`[Flow] 파일 읽기 실패: ${slotEntry.name}/${projName}/${fileEntry.name}`, e);
        }
      }
    }
  }

  console.log(`[Flow] 폴더 스캔 결과: ${foundFolders.join(', ')}`);
  console.log(`[Flow] 폴더에서 ${totalCount}개 로드 완료`);

  if (totalCount === 0 && foundFolders.length > 0) {
    const matched = foundFolders.filter(f => !f.endsWith('→무시'));
    if (matched.length === 0) {
      alert('이 폴더에 피사체/장면/스타일 하위 폴더가 없습니다.\n\n올바른 폴더 구조:\n📁 선택할 폴더/\n  ├── 피사체/프로젝트명/이미지.png\n  ├── 장면/프로젝트명/이미지.png\n  └── 스타일/프로젝트명/이미지.png');
    }
  }

  return totalCount;
}

// Load saved state from storage
async function loadState() {
  try {
    const result = await chrome.storage.local.get(['prompts', 'autoDownload', 'delay', 'projects', 'currentProject', 'saveLocation', 'useCustomDir', 'selectedModel', 'outputType', 'storageVersion']);

    // v3 → v4 마이그레이션
    if (!result.storageVersion || result.storageVersion < 4) {
      console.log('[Flow] 스토리지 마이그레이션: v' + (result.storageVersion || 3) + ' → v4');
      // styleImage 필드 제거 (Flow에는 스타일 이미지 슬롯 없음)
      if (result.projects) {
        for (const proj of Object.values(result.projects)) {
          delete proj.styleImage;
          delete proj.styleFromFolder;
        }
      }
      // saveLocation 기본값 변경
      if (result.saveLocation === 'whisk-images') {
        result.saveLocation = 'flow-images';
      }
      await chrome.storage.local.set({ storageVersion: 4 });
    }

    if (result.prompts) {
      prompts = result.prompts;
    }
    if (result.autoDownload !== undefined) {
      autoDownload.checked = result.autoDownload;
    }
    if (result.delay) {
      delayInput.value = result.delay;
    }
    if (result.selectedModel && modelSelect) {
      modelSelect.value = result.selectedModel;
    }
    if (result.outputType && outputType) {
      document.getElementById('outputType').value = result.outputType;
    }
    if (result.projects) {
      // 저장소 데이터와 DEFAULT_PROJECTS를 깊은 병합
      // DEFAULT_PROJECTS의 Base64 캐릭터 이미지를 우선 사용 (저장소에 로컬 경로가 남아있을 수 있음)
      PROJECTS = {};
      const allKeys = new Set([...Object.keys(DEFAULT_PROJECTS), ...Object.keys(result.projects)]);
      for (const key of allKeys) {
        const defaultProj = DEFAULT_PROJECTS[key];
        const savedProj = result.projects[key];

        if (!savedProj) {
          PROJECTS[key] = defaultProj;
        } else if (!defaultProj) {
          PROJECTS[key] = savedProj;
        } else {
          // 병합: 저장소의 설정을 유지하되 DEFAULT의 Base64 캐릭터 이미지 우선
          const mergedChars = { ...savedProj.characters };
          for (const [charName, charData] of Object.entries(defaultProj.characters || {})) {
            if (charData.image && charData.image.startsWith('data:')) {
              // Base64 이미지는 항상 최신 DEFAULT 사용
              mergedChars[charName] = { ...mergedChars[charName], ...charData };
            } else if (!mergedChars[charName]) {
              mergedChars[charName] = charData;
            }
          }
          // 장면 병합 (캐릭터와 동일 로직)
          const mergedScenes = { ...(savedProj.scenes || {}) };
          for (const [sceneName, sceneData] of Object.entries(defaultProj.scenes || {})) {
            if (sceneData.image && sceneData.image.startsWith('data:')) {
              mergedScenes[sceneName] = { ...mergedScenes[sceneName], ...sceneData };
            } else if (!mergedScenes[sceneName]) {
              mergedScenes[sceneName] = sceneData;
            }
          }
          PROJECTS[key] = {
            ...defaultProj,
            ...savedProj,
            characters: mergedChars,
            scenes: mergedScenes,
            // 저장소에 명시적으로 저장된 값 우선, undefined일 때만 DEFAULT 사용
            stylePrefix: savedProj.stylePrefix !== undefined ? savedProj.stylePrefix : (defaultProj.stylePrefix || ''),
            styleSuffix: savedProj.styleSuffix !== undefined ? savedProj.styleSuffix : (defaultProj.styleSuffix || '')
          };
          // 마이그레이션: 옛날 스타일 텍스트가 저장되어 있으면 기본값으로 강제 교체
          if (PROJECTS[key].stylePrefix && PROJECTS[key].stylePrefix.toLowerCase().includes('wuxia')) {
            console.log('[Flow] 마이그레이션: stylePrefix wuxia → murim (' + key + ')');
            PROJECTS[key].stylePrefix = defaultProj.stylePrefix || '';
          }
          if (PROJECTS[key].styleSuffix && PROJECTS[key].styleSuffix.toLowerCase().includes('ink wash')) {
            console.log('[Flow] 마이그레이션: styleSuffix 옛날 스타일 교체 (' + key + ')');
            PROJECTS[key].styleSuffix = defaultProj.styleSuffix || '';
          }
        }
      }
    }
    if (result.currentProject && PROJECTS[result.currentProject]) {
      currentProject = result.currentProject;
    }
    if (result.saveLocation) {
      saveLocation.value = result.saveLocation;
    }

    // Restore custom directory handle
    if (result.useCustomDir) {
      try {
        const savedHandle = await loadDirHandle();
        if (savedHandle) {
          let perm = await savedHandle.queryPermission({ mode: 'readwrite' });
          if (perm === 'prompt') {
            // 사이드 패널 로드 시 권한 재요청 시도
            perm = await savedHandle.requestPermission({ mode: 'readwrite' });
          }
          if (perm === 'granted') {
            customDirHandle = savedHandle;
            saveLocation.value = '\uD83D\uDCC1 ' + savedHandle.name;
            saveLocation.readOnly = true;
          } else {
            // Permission lost — 폴더 이름을 다운로드 하위 경로로 폴백
            await clearDirHandle();
            var fallbackName = result.customDirName || 'flow-images';
            saveLocation.value = fallbackName;
            saveLocation.readOnly = false;
            console.log('[Flow] 커스텀 폴더 권한 만료 → 다운로드/' + fallbackName + ' 으로 폴백');
          }
        }
      } catch (e) {
        console.log('[Flow] Failed to restore directory handle:', e);
      }
    }

    // Character folder: 저장된 데이터가 이미 PROJECTS에 복원됨 (saveState로 저장했으므로)
    // 폴더 핸들은 "새로고침" 시에만 사용 — 매번 다시 스캔하지 않음
  } catch (error) {
    console.error('Failed to load state:', error);
  }
}

// Save state to storage
async function saveState() {
  try {
    await chrome.storage.local.set({
      prompts: prompts,
      autoDownload: autoDownload.checked,
      delay: parseInt(delayInput.value),
      selectedModel: modelSelect ? modelSelect.value : 'nano-banana-2',
      outputType: outputType ? document.getElementById('outputType').value : 'image',
      projects: PROJECTS,
      currentProject: currentProject,
      saveLocation: saveLocation.value.trim() || 'flow-images',
      useCustomDir: !!customDirHandle,
      customDirName: customDirHandle ? customDirHandle.name : null,
      storageVersion: 4
    });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

// Update UI
function updateUI() {
  // Update queue count
  queueCount.textContent = `(${prompts.length}개)`;

  // Update queue list
  if (prompts.length === 0) {
    promptQueue.innerHTML = '<li class="empty-message">프롬프트를 추가해주세요</li>';
  } else {
    promptQueue.innerHTML = prompts.map((prompt, index) => `
      <li class="${prompt.status || ''}" data-index="${index}">
        <span class="prompt-text" title="${escapeHtml(prompt.text)}">${index + 1}. ${escapeHtml(prompt.text)}</span>
        ${!isRunning ? `<button class="delete-btn" data-index="${index}">×</button>` : ''}
      </li>
    `).join('');
  }

  // Update buttons
  startBtn.disabled = prompts.length === 0 || isRunning || !connectionStatus.classList.contains('connected');
  startBtn.hidden = isRunning;
  stopBtn.hidden = !isRunning;

  // Update progress
  if (isRunning) {
    progressSection.hidden = false;
    totalCountEl.textContent = prompts.length;
    currentIndexEl.textContent = currentIndex;
    const progress = prompts.length > 0 ? (currentIndex / prompts.length) * 100 : 0;
    progressFill.style.width = `${progress}%`;

    const currentPrompt = prompts[currentIndex];
    if (currentPrompt) {
      currentPromptEl.textContent = `현재: ${currentPrompt.text}`;
    }
  } else {
    progressSection.hidden = true;
  }

  // Update project tabs and character list
  renderProjectTabs();
  renderCharacterList();
  renderStyleSettings();
  checkUnregisteredCharacters();
}

// Render project tabs
function renderProjectTabs() {
  const projectKeys = Object.keys(PROJECTS);
  projectTabs.innerHTML = projectKeys.map(key => {
    const project = PROJECTS[key];
    const isActive = key === currentProject;
    return `<button class="project-tab${isActive ? ' active' : ''}" data-project="${key}">${project.name}</button>`;
  }).join('');
}

// Render character list for current project
function renderCharacterList() {
  const project = PROJECTS[currentProject];
  if (!project) return;

  let characters = { ...project.characters };

  // 공통 캐릭터 상속
  if (project.inheritCommon && PROJECTS.common) {
    characters = { ...PROJECTS.common.characters, ...characters };
  }

  const charKeys = Object.keys(characters);
  if (charKeys.length === 0) {
    characterList.innerHTML = '<span class="character-empty">캐릭터가 없습니다</span>';
  } else {
    const { allTags } = extractCharacterTags();
    characterList.innerHTML = charKeys.map(name => {
      const char = characters[name];
      const localClass = char.isLocal ? ' local' : '';
      const activeClass = (allTags.has(name) || allTags.has(name.normalize('NFC'))) ? ' active' : '';
      return `<span class="character-tag${localClass}${activeClass}" data-char="${name}">${name}</span>`;
    }).join('');
  }
}

// Render style settings for current project
function renderStyleSettings() {
  const project = PROJECTS[currentProject];
  if (!project) return;

  stylePrefix.value = project.stylePrefix || '';
  styleSuffix.value = project.styleSuffix || '';
}

// Save style settings for current project
function saveStyleSettings() {
  const project = PROJECTS[currentProject];
  if (!project) return;

  project.stylePrefix = stylePrefix.value;
  project.styleSuffix = styleSuffix.value;
  saveState();
}

// Extract all [캐릭터] tags from prompts (excluding [filename:...])
function extractCharacterTags() {
  const allTags = new Set();
  const characterMap = buildCharacterMap();
  const unregistered = new Set();

  prompts.forEach(p => {
    let text = p.text;
    text = text.replace(/^\[filename:.+?\]\s*/, '');
    const matches = text.match(/\[(.+?)\]/g);
    if (matches) {
      matches.forEach(m => {
        const charName = m.slice(1, -1);
        allTags.add(charName);
        if (!characterMap[charName] && !characterMap[charName.normalize('NFC')]) {
          unregistered.add(charName);
        }
      });
    }
  });

  return { allTags, unregistered };
}

// Check for unregistered characters in prompts
function checkUnregisteredCharacters() {
  const { unregistered } = extractCharacterTags();

  if (unregistered.size > 0) {
    characterWarning.hidden = false;
    warningText.textContent = `미등록 캐릭터: ${Array.from(unregistered).join(', ')}`;
  } else {
    characterWarning.hidden = true;
  }
}

// Get character image by name or alias
function getCharacterImageByName(name) {
  // 현재 프로젝트에서 검색
  const project = PROJECTS[currentProject];
  if (project) {
    // 직접 매칭
    if (project.characters[name]) {
      return project.characters[name].image;
    }
    // 별명 검색
    for (const [charName, charData] of Object.entries(project.characters)) {
      if (charData.aliases && charData.aliases.includes(name)) {
        return charData.image;
      }
    }
  }

  // 공통 프로젝트에서 검색
  if (PROJECTS.common) {
    if (PROJECTS.common.characters[name]) {
      return PROJECTS.common.characters[name].image;
    }
    for (const [charName, charData] of Object.entries(PROJECTS.common.characters)) {
      if (charData.aliases && charData.aliases.includes(name)) {
        return charData.image;
      }
    }
  }

  return null;
}

// Build flat character map for automation (name/alias -> image)
// 원본 키 + NFC 정규화 키 모두 등록 (macOS NFD/NFC 호환)
function buildCharacterMap() {
  const map = {};

  // 공통 캐릭터 먼저
  if (PROJECTS.common) {
    for (const [name, data] of Object.entries(PROJECTS.common.characters)) {
      map[name] = data.image;
      map[name.normalize('NFC')] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => {
          map[alias] = data.image;
          map[alias.normalize('NFC')] = data.image;
        });
      }
    }
  }

  // 현재 프로젝트 캐릭터 (덮어쓰기)
  const project = PROJECTS[currentProject];
  if (project) {
    for (const [name, data] of Object.entries(project.characters)) {
      map[name] = data.image;
      map[name.normalize('NFC')] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => {
          map[alias] = data.image;
          map[alias.normalize('NFC')] = data.image;
        });
      }
    }
  }

  return map;
}

// Build flat scene map for automation (name/alias -> image)
// 원본 키 + NFC 정규화 키 모두 등록 (macOS NFD/NFC 호환)
function buildSceneMap() {
  const map = {};

  // 공통 장면 먼저
  if (PROJECTS.common && PROJECTS.common.scenes) {
    for (const [name, data] of Object.entries(PROJECTS.common.scenes)) {
      map[name] = data.image;
      map[name.normalize('NFC')] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => {
          map[alias] = data.image;
          map[alias.normalize('NFC')] = data.image;
        });
      }
    }
  }

  // 현재 프로젝트 장면 (덮어쓰기)
  const project = PROJECTS[currentProject];
  if (project && project.scenes) {
    for (const [name, data] of Object.entries(project.scenes)) {
      map[name] = data.image;
      map[name.normalize('NFC')] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => {
          map[alias] = data.image;
          map[alias.normalize('NFC')] = data.image;
        });
      }
    }
  }

  return map;
}


// Switch project
function switchProject(projectKey) {
  if (PROJECTS[projectKey]) {
    currentProject = projectKey;
    saveState();
    updateUI();
  }
}

// Add new project
function addNewProject() {
  const name = prompt('새 프로젝트 이름을 입력하세요:');
  if (!name || !name.trim()) return;

  const key = name.trim().toLowerCase().replace(/\s+/g, '_');
  if (PROJECTS[key]) {
    alert('이미 존재하는 프로젝트입니다.');
    return;
  }

  PROJECTS[key] = {
    name: name.trim(),
    characters: {},
    inheritCommon: true
  };

  currentProject = key;
  saveState();
  updateUI();
}

// Add new character to current project (URL 방식)
function addNewCharacter() {
  const name = prompt('캐릭터 이름을 입력하세요:');
  if (!name || !name.trim()) return;

  const imageUrl = prompt('캐릭터 이미지 URL을 입력하세요:');
  if (!imageUrl || !imageUrl.trim()) return;

  const aliasInput = prompt('별명을 입력하세요 (쉼표로 구분, 선택사항):');
  const aliases = aliasInput ? aliasInput.split(',').map(a => a.trim()).filter(a => a) : [];
  aliases.unshift(name.trim()); // 기본 이름 추가

  const project = PROJECTS[currentProject];
  if (project) {
    project.characters[name.trim()] = {
      image: imageUrl.trim(),
      aliases: aliases
    };
    saveState();
    updateUI();
  }
}

// 임시 저장용 캡처 데이터
let capturedImageData = null;

// Flow에서 생성된 이미지 캡처
async function captureCharacterFromFlow() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    // Flow 페이지에서 이미지 캡처
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // 가장 큰 이미지 찾기 (생성된 이미지)
        const images = document.querySelectorAll('img');
        let targetImage = null;
        let maxSize = 0;

        for (const img of images) {
          if (img.src && img.width > 100 && img.height > 100 && !img.src.includes('avatar')) {
            const size = img.width * img.height;
            if (size > maxSize) {
              maxSize = size;
              targetImage = img;
            }
          }
        }

        if (!targetImage) {
          return { error: '생성된 이미지를 찾을 수 없습니다' };
        }

        // Canvas로 이미지를 Base64로 변환
        const canvas = document.createElement('canvas');
        canvas.width = targetImage.naturalWidth || targetImage.width;
        canvas.height = targetImage.naturalHeight || targetImage.height;
        const ctx = canvas.getContext('2d');

        try {
          ctx.drawImage(targetImage, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          return { dataUrl, width: canvas.width, height: canvas.height };
        } catch (e) {
          // CORS 문제시 원본 URL 반환
          return { imageUrl: targetImage.src, width: targetImage.width, height: targetImage.height };
        }
      }
    });

    const result = results[0]?.result;

    if (result?.error) {
      alert(result.error);
      return;
    }

    if (result?.dataUrl) {
      capturedImageData = result.dataUrl;
      capturedImage.src = result.dataUrl;
    } else if (result?.imageUrl) {
      // CORS 문제로 직접 캡처 불가 시, fetch로 시도
      try {
        const response = await fetch(result.imageUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          capturedImageData = reader.result;
          capturedImage.src = reader.result;
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        alert('이미지를 캡처할 수 없습니다. CORS 제한이 있을 수 있습니다.');
        return;
      }
    }

    // 모달 열기
    charNameInput.value = '';
    charAliasInput.value = '';
    captureModal.hidden = false;

  } catch (error) {
    console.error('캡처 실패:', error);
    alert('캡처 실패: ' + error.message);
  }
}

// 모달 닫기
function closeCaptureModal() {
  captureModal.hidden = true;
  capturedImageData = null;
  capturedImage.src = '';
}

// 캡처된 캐릭터 저장
function saveCapuredCharacter() {
  const name = charNameInput.value.trim();
  if (!name) {
    alert('캐릭터 이름을 입력하세요');
    return;
  }

  if (!capturedImageData) {
    alert('캡처된 이미지가 없습니다');
    return;
  }

  const aliasInput = charAliasInput.value.trim();
  const aliases = aliasInput ? aliasInput.split(',').map(a => a.trim()).filter(a => a) : [];
  aliases.unshift(name); // 기본 이름 추가

  const project = PROJECTS[currentProject];
  if (project) {
    project.characters[name] = {
      image: capturedImageData,  // Base64 데이터
      aliases: aliases,
      isLocal: true  // 로컬 저장 표시
    };
    saveState();
    updateUI();
    closeCaptureModal();
    console.log(`[Flow Automator] 캐릭터 저장 완료: ${name}`);
  }
}

// 스타일 이미지 캡처
// captureStyleFromFlow - Flow에서는 스타일 이미지 슬롯이 없으므로 미사용
// prefix/suffix 텍스트만 지원

// Sanitize filename for cross-platform compatibility (Windows forbidden chars)
function sanitizeFilename(name) {
  return name.replace(/[<>:"|?*]/g, '_').replace(/_+/g, '_');
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 프롬프트에서 [filename:...] 추출
function extractFilename(text) {
  const m = text.match(/\[filename:(.+?)\]/);
  return m ? m[1] : null;
}

// Add prompts from textarea
function addPrompts() {
  const text = promptInput.value.trim();
  if (!text) return;

  // 기존 대기열의 filename 수집
  const existingFilenames = new Set(
    prompts.map(p => extractFilename(p.text)).filter(Boolean)
  );

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let skipped = 0;
  const newPrompts = [];
  for (const line of lines) {
    const fn = extractFilename(line);
    if (fn && existingFilenames.has(fn)) {
      skipped++;
      continue;
    }
    newPrompts.push({ text: line, status: '' });
    if (fn) existingFilenames.add(fn);
  }

  if (newPrompts.length > 0) {
    prompts.push(...newPrompts);
  }
  promptInput.value = '';
  if (skipped > 0) {
    charFolderHint.textContent = `${newPrompts.length}개 추가, ${skipped}개 중복 제외`;
  }
  saveState();
  updateUI();
  checkConnection();
}

// Load prompts from file
function loadFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const existingFilenames = new Set(
      prompts.map(p => extractFilename(p.text)).filter(Boolean)
    );
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let skipped = 0;
    const newPrompts = [];
    for (const line of lines) {
      const fn = extractFilename(line);
      if (fn && existingFilenames.has(fn)) {
        skipped++;
        continue;
      }
      newPrompts.push({ text: line, status: '' });
      if (fn) existingFilenames.add(fn);
    }

    if (newPrompts.length > 0) {
      prompts.push(...newPrompts);
    }
    if (skipped > 0) {
      alert(`${newPrompts.length}개 추가, ${skipped}개 중복 제외`);
    }
    saveState();
    updateUI();
    checkConnection();
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}

// Delete prompt
function deletePrompt(index) {
  prompts.splice(index, 1);
  saveState();
  updateUI();
  checkConnection();
}

// Clear all prompts
function clearQueue() {
  if (isRunning) return;
  prompts = [];
  currentIndex = 0;
  saveState();
  updateUI();
  checkConnection();
}

// Start automation
async function startAutomation() {
  console.log('[Popup] startAutomation called');

  if (prompts.length === 0 || isRunning) {
    return;
  }

  // 완료되지 않은 프롬프트만 필터링
  const pendingPrompts = prompts
    .map((p, i) => ({ ...p, originalIndex: i }))
    .filter(p => p.status !== 'completed');

  if (pendingPrompts.length === 0) {
    alert('모든 프롬프트가 이미 완료되었습니다.\n새 프롬프트를 추가하거나 "전체 삭제" 후 다시 시도하세요.');
    return;
  }

  isRunning = true;
  currentIndex = 0;
  // 미완료 프롬프트만 상태 초기화 (에러 상태도 재시도 가능)
  pendingPrompts.forEach(p => { prompts[p.originalIndex].status = ''; });
  progressSection.hidden = false;
  totalCountEl.textContent = pendingPrompts.length;
  currentIndexEl.textContent = '0';
  progressFill.style.width = '0%';
  currentPromptEl.textContent = '시작 준비 중...';
  updateUI();

  // 커스텀 폴더 권한 재확인 (확장 리로드 후 'prompt' 상태일 수 있음)
  if (!customDirHandle) {
    try {
      const savedHandle = await loadDirHandle();
      if (savedHandle) {
        const perm = await savedHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          customDirHandle = savedHandle;
          saveLocation.value = '\uD83D\uDCC1 ' + savedHandle.name;
          saveLocation.readOnly = true;
          updateCustomDirUI();
          console.log('[Popup] 커스텀 폴더 권한 재획득:', savedHandle.name);
        }
      }
    } catch (e) {
      console.log('[Popup] 커스텀 폴더 권한 재요청 실패:', e);
    }
  }

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  const promptTexts = pendingPrompts.map(p => p.text);
  // 원본 인덱스 매핑 (PROGRESS_UPDATE에서 올바른 프롬프트에 상태 반영)
  const indexMap = pendingPrompts.map(p => p.originalIndex);
  const delayMs = parseInt(delayInput.value) * 1000;
  const shouldDownload = autoDownload.checked;
  const savePath = saveLocation.value.trim() || 'flow-images';
  promptIndexMap = indexMap; // PROGRESS_UPDATE 핸들러에서 사용

  // 프로젝트 스타일 설정 가져오기
  const project = PROJECTS[currentProject] || {};
  const projectStylePrefix = project.stylePrefix || '';
  const projectStyleSuffix = project.styleSuffix || '';
  const selectedModel = modelSelect ? modelSelect.value : 'nano-banana-2';
  const selectedOutputType = outputType ? document.getElementById('outputType').value : 'image';

  console.log('[Popup] 프로젝트 스타일:', {
    prefix: projectStylePrefix || '없음',
    suffix: projectStyleSuffix || '없음',
    model: selectedModel,
    outputType: selectedOutputType
  });

  // 프롬프트에서 파일명, 캐릭터 정보 추출 + 스타일 적용
  const promptsWithCharacters = promptTexts.map((text, index) => {
    let filename = null;
    let character = null;
    let cleanPrompt = text;

    // 1. [filename:...] 추출
    const filenameMatch = cleanPrompt.match(/^\[filename:(.+?)\]\s*/);
    if (filenameMatch) {
      filename = filenameMatch[1];
      cleanPrompt = cleanPrompt.replace(/^\[filename:.+?\]\s*/, '');
    }

    // 2. [캐릭터], [장면:...], [style:...] 추출
    const charNames = [];
    let scene = null;
    let style = null;
    const charRegex = /^\[([^\]]+)\]\s*/;
    let charM;
    while ((charM = cleanPrompt.match(charRegex)) !== null) {
      // [filename:...] 이나 프롬프트 본문이면 중단
      if (charM[1].startsWith('filename:')) break;
      // [장면:무림맹] → 장면 태그 추출
      if (charM[1].startsWith('장면:')) {
        scene = charM[1].replace('장면:', '').trim();
        cleanPrompt = cleanPrompt.replace(charRegex, '');
        continue;
      }
      // [style:male] 또는 [스타일:male] → 스타일 태그 추출
      if (charM[1].startsWith('style:') || charM[1].startsWith('스타일:')) {
        style = charM[1].replace(/^(style:|스타일:)/, '').trim();
        cleanPrompt = cleanPrompt.replace(charRegex, '');
        continue;
      }
      charNames.push(charM[1]);
      cleanPrompt = cleanPrompt.replace(charRegex, '');
    }
    if (charNames.length > 0) {
      character = charNames.join(',');
    }

    // 2-1. 자동 스타일 결정: [style:] 태그 없고 캐릭터 있으면 프로젝트별 매핑에서 결정
    if (!style && charNames.length > 0) {
      const charStyleMap = (project && project.characterStyleMap) || {};
      const mixedPreset = (project && project.mixedStylePreset) || '';
      const styleTypes = new Set(
        charNames.map(n => charStyleMap[n]).filter(Boolean)
      );
      if (styleTypes.size === 1) {
        style = [...styleTypes][0];
        console.log(`[스타일 자동] ${charNames.join('+')} → ${style}`);
      } else if (styleTypes.size > 1 && mixedPreset) {
        style = mixedPreset;
        console.log(`[스타일 자동] ${charNames.join('+')} → 혼합 → ${style}`);
      }
    }

    // 3. 스타일 접두어/접미어 적용 (이미 포함되어 있지 않으면)
    let finalPrompt = cleanPrompt;
    if (projectStylePrefix && !cleanPrompt.toLowerCase().startsWith(projectStylePrefix.toLowerCase().trim())) {
      finalPrompt = projectStylePrefix + finalPrompt;
    }
    if (projectStyleSuffix && !cleanPrompt.toLowerCase().endsWith(projectStyleSuffix.toLowerCase().trim())) {
      finalPrompt = finalPrompt + projectStyleSuffix;
    }

    // 4. 안전 치환 (위험 표현 → 안전 표현)
    // 긴 패턴 먼저 매칭되도록 길이 역순 정렬 후 적용
    if (typeof PROMPT_REPLACEMENTS !== 'undefined') {
      const sorted = [...PROMPT_REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
      for (const [risky, safe] of sorted) {
        const escaped = risky.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        finalPrompt = finalPrompt.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), safe);
      }
    }

    // 캐릭터 그룹키: "용아,소연" → 정렬해서 "소연,용아" (그룹핑/비교용)
    let characterGroup = '';
    if (character) {
      characterGroup = character.split(',').map(c => c.trim()).sort().join(',');
    }

    return {
      filename: filename,
      character: character,           // 원본: "용아,소연"
      characterGroup: characterGroup, // 정렬: "소연,용아" (그룹핑용)
      scene: scene,                   // 장면 태그: "무림맹" (null=없음)
      style: style,                   // 스타일 태그: "male" (null=없음)
      prompt: finalPrompt,
      originalPrompt: cleanPrompt,
      index: index
    };
  });

  // 스타일별 → 캐릭터 조합별 그룹핑 (스타일 전환 > 캐릭터 전환 비용)
  // [style:male][용아] → [style:male][소소] → [style:female][소연] → [배경]
  promptsWithCharacters.sort((a, b) => {
    // 1. 스타일 태그로 먼저 그룹핑
    const styleA = a.style || '';
    const styleB = b.style || '';
    if (styleA !== styleB) {
      // 스타일 있는 것 먼저, 같은 스타일끼리 묶기
      if (styleA && !styleB) return -1;
      if (!styleA && styleB) return 1;
      return styleA.localeCompare(styleB);
    }
    // 2. 같은 스타일 내에서 캐릭터 조합별 그룹핑
    const grpA = a.characterGroup || '';
    const grpB = b.characterGroup || '';
    if (grpA && !grpB) return -1;
    if (!grpA && grpB) return 1;
    if (grpA !== grpB) return grpA.localeCompare(grpB);
    return a.index - b.index; // 같은 조합 내에서는 원래 순서 유지
  });

  console.log('[Popup] 스타일→캐릭터 그룹핑:',
    promptsWithCharacters.map(p => `[씬${p.index + 1}]${p.style ? `{${p.style}}` : ''}${p.character || '배경'}`).join(', '));

  // 캐릭터 맵 + 장면 맵 생성 (별명 포함)
  const characterMap = buildCharacterMap();
  const sceneMap = buildSceneMap();
  // 리로드 후 재개용 캐시 저장
  sortedPromptsCache = promptsWithCharacters;
  automationParams = { delayMs, shouldDownload, characterMap, savePath, sceneMap, useCustomDir: !!customDirHandle, selectedModel, selectedOutputType };

  completedOffset = 0;

  // 이전 실행 플래그 초기화 (확장 리로드 시 ISOLATED world에 잔존 방지)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.__flowAutoRunning = false;
        document.documentElement.removeAttribute('data-flow-stop');
      }
    });
  } catch (e) {
    console.log('[Popup] 플래그 초기화 실패 (무시):', e);
  }

  // showOpenFilePicker interceptor는 manifest.json content_scripts에서
  // world:"MAIN" + run_at:"document_start"로 자동 주입됨 (interceptor.js)
  // → Flow JS보다 먼저 설치되므로 원본 참조 저장 문제 해결
  console.log('[Popup] interceptor.js는 manifest에서 자동 주입됨');

  // 직접 스크립트 주입
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runFlowAutomation,
      args: [promptsWithCharacters, delayMs, shouldDownload, null, characterMap, savePath, sceneMap, null, !!customDirHandle, selectedModel, selectedOutputType]
    });
  } catch (error) {
    console.error('[Popup] Script injection failed:', error);
    alert('스크립트 주입 실패: ' + error.message);
    isRunning = false;
    updateUI();
  }
}

// 주입될 자동화 함수
function runFlowAutomation(promptsWithCharacters, delayMs, autoDownload, _unused, characters, savePath, scenes, styles, useCustomDir, selectedModel, selectedOutputType) {
  // 중복 실행 방지
  if (window.__flowAutoRunning) {
    console.log('[Flow Auto] 이미 실행 중, 중복 실행 방지');
    return;
  }
  window.__flowAutoRunning = true;

  console.log('[Flow Auto] Starting with', promptsWithCharacters.length, 'prompts');
  console.log('[Flow Auto] Model:', selectedModel || 'nano-banana-2');
  console.log('[Flow Auto] Output type:', selectedOutputType || 'image');

  var downloadedSrcs = new Set();   // 이미 다운로드한 이미지 src 추적
  var consecutiveFailures = 0;      // 연속 실패 카운터 (2회 연속 시 페이지 리로드)

  function isStopRequested() {
    return document.documentElement.getAttribute('data-flow-stop') === 'true';
  }

  async function sleep(ms) {
    // 긴 대기 중 정지 신호를 빠르게 감지하기 위해 500ms 단위로 체크
    if (ms <= 500) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    var elapsed = 0;
    while (elapsed < ms) {
      if (isStopRequested()) throw new Error('__STOPPED__');
      var chunk = Math.min(500, ms - elapsed);
      await new Promise(resolve => setTimeout(resolve, chunk));
      elapsed += chunk;
    }
  }

  // Flow 팝업/모달 자동 닫기 (Discord 초대, 피드백 등)
  function dismissPopups() {
    // 전략 1: 오버레이/백드롭 클릭으로 닫기
    document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="modal"]').forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.5 && r.height > window.innerHeight * 0.5) {
        el.click();
        console.log('[Flow Auto] 팝업 오버레이 클릭 닫기');
      }
    });
    // 전략 2: 닫기 버튼 (X, close, 닫기) 찾아서 클릭
    document.querySelectorAll('button, [role="button"]').forEach(function(btn) {
      var text = (btn.textContent || '').trim().toLowerCase();
      var aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      var r = btn.getBoundingClientRect();
      // X 버튼 (작은 크기, 상단 우측)
      if ((text === '×' || text === 'x' || text === 'close' || text === '닫기' ||
           aria.includes('close') || aria.includes('dismiss')) &&
          r.width > 0 && r.width <= 60) {
        btn.click();
        console.log('[Flow Auto] 팝업 닫기 버튼 클릭: "' + (text || aria) + '"');
      }
    });
    // 전략 3: 팝업/모달 내부의 거절 버튼만 클릭 (일반 UI 버튼 오탐 방지)
    document.querySelectorAll('[class*="overlay"] button, [class*="modal"] button, [class*="dialog"] button, [role="dialog"] button').forEach(function(el) {
      var text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('no thanks') || text.includes('아니') || text.includes('skip') ||
          text.includes('later') || text.includes('나중에') || text.includes('dismiss')) {
        el.click();
        console.log('[Flow Auto] 팝업 거절 버튼 클릭: "' + text + '"');
      }
    });
    // 전략 4: "예상했던 내용이 아닌가요?" 피드백 팝업 닫기 (구체적 셀렉터로 범위 축소)
    document.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"], [class*="popup"], [class*="feedback"], [class*="snackbar"], [class*="toast"], dialog, section').forEach(function(el) {
      var text = el.textContent || '';
      if (text.includes('예상했던') || text.includes('not what you expected')) {
        // 이 요소 내부의 X/닫기 버튼 찾기
        var closeBtn = el.querySelector('button[aria-label*="close"], button[aria-label*="Close"], button[aria-label*="dismiss"]');
        if (!closeBtn) {
          // aria-label 없으면 SVG path가 있는 작은 버튼 (X 아이콘)
          el.querySelectorAll('button, [role="button"]').forEach(function(btn) {
            var r = btn.getBoundingClientRect();
            if (r.width > 0 && r.width <= 50 && r.height <= 50 && btn.querySelector('svg')) {
              closeBtn = btn;
            }
          });
        }
        if (closeBtn) {
          closeBtn.click();
          console.log('[Flow Auto] "예상했던 내용" 피드백 팝업 닫기');
        }
      }
    });
  }

  // 주기적으로 팝업 감시 (5초마다)
  var popupWatcher = setInterval(function() {
    if (!window.__flowAutoRunning) {
      clearInterval(popupWatcher);
      return;
    }
    dismissPopups();
  }, 5000);

  // 시작 시 즉시 한 번 실행
  dismissPopups();

  // 마우스/포인터 이벤트를 완전히 시뮬레이션 (React 호환)
  function simulateRealClick(el) {
    var rect = el.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, opts, { pointerId: 1 })));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, opts, { pointerId: 1 })));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  // === Flow 전용 헬퍼 함수 ===

  // 1. Slate.js 프롬프트 입력창 찾기
  function findPromptInput() {
    var el = document.querySelector('[role="textbox"][contenteditable]');
    if (!el) {
      throw new Error('프롬프트 입력창을 찾을 수 없습니다 ([role="textbox"][contenteditable])');
    }
    var rect = el.getBoundingClientRect();
    console.log('[Flow Auto] 프롬프트 입력창 발견: ' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
      ' at(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ')');
    return el;
  }

  // 2. InputEvent(beforeinput) 방식으로 Slate.js에 텍스트 입력
  async function fillPrompt(text) {
    var promptEl = findPromptInput();
    promptEl.focus();
    await sleep(200);

    // 레퍼런스 썸네일이 있을 수 있으므로 텍스트 노드만 선택해서 교체
    // Slate.js에서 텍스트는 <span data-slate-string="true"> 안에 있음
    var slateTexts = promptEl.querySelectorAll('[data-slate-string="true"]');

    var sel = window.getSelection();
    var range = document.createRange();

    if (slateTexts.length > 0) {
      // 텍스트 영역만 선택 (레퍼런스 썸네일 보존)
      var firstText = slateTexts[0];
      var lastText = slateTexts[slateTexts.length - 1];
      range.setStartBefore(firstText);
      range.setEndAfter(lastText);
      sel.removeAllRanges();
      sel.addRange(range);
      console.log('[Flow Auto] Slate 텍스트 노드 ' + slateTexts.length + '개 선택 (레퍼런스 보존)');
    } else {
      // 텍스트 없으면 전체 선택 (레퍼런스도 없는 상태이므로 안전)
      range.selectNodeContents(promptEl);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    await sleep(100);

    // 선택된 텍스트 삭제
    promptEl.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      bubbles: true, cancelable: true, composed: true
    }));
    await sleep(200);

    // 새 텍스트 삽입
    promptEl.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true, cancelable: true, composed: true
    }));
    await sleep(300);

    // 입력 확인
    var content = promptEl.textContent.trim();
    if (content.length === 0) {
      console.warn('[Flow Auto] 프롬프트 입력 후 textContent 비어있음, 재시도...');
      promptEl.focus();
      await sleep(100);
      promptEl.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: text,
        bubbles: true, cancelable: true, composed: true
      }));
      await sleep(300);
    }
    console.log('[Flow Auto] 프롬프트 입력 완료: "' + text.substring(0, 50) + (text.length > 50 ? '...' : '') + '"');
    return true;
  }

  // 3. 모델 메뉴 트리거 버튼 찾기 (하단 영역에서 "Banana"/"Imagen"/"Nano" 텍스트)
  function findModelButton() {
    var buttons = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || '').trim();
      var rect = buttons[i].getBoundingClientRect();
      if (rect.top > 500 && rect.width > 0 &&
          (txt.includes('Banana') || txt.includes('Imagen') || txt.includes('Nano'))) {
        console.log('[Flow Auto] 모델 버튼 발견: "' + txt.substring(0, 40) + '" at(' +
          Math.round(rect.left) + ',' + Math.round(rect.top) + ')');
        return buttons[i];
      }
    }
    console.log('[Flow Auto] 모델 버튼 미발견');
    return null;
  }

  // 4. 모델 메뉴 열기 → [role="menu"] 반환
  async function openModelMenu() {
    var btn = findModelButton();
    if (!btn) throw new Error('모델 메뉴 버튼을 찾을 수 없습니다');

    simulateRealClick(btn);
    await sleep(500);

    // [role="menu"] 대기 (최대 3초)
    var waited = 0;
    while (waited < 3000) {
      var menus = document.querySelectorAll('[role="menu"]');
      if (menus.length > 0) {
        console.log('[Flow Auto] 모델 메뉴 열림 (' + menus.length + '개 [role="menu"])');
        return menus[0];
      }
      await sleep(300);
      waited += 300;
    }
    throw new Error('모델 메뉴([role="menu"])가 열리지 않습니다');
  }

  // 5. Image/Video 전환
  async function selectOutputType(menu, type) {
    var targetText = type === 'video' ? 'Video' : 'Image';
    var items = menu.querySelectorAll('*');
    for (var i = 0; i < items.length; i++) {
      var txt = items[i].textContent.trim();
      if (txt === targetText && items[i].getBoundingClientRect().width > 0) {
        // 가장 안쪽 클릭 가능 요소 찾기
        var clickTarget = items[i].closest('button, [role="menuitem"], [role="menuitemradio"]') || items[i];
        console.log('[Flow Auto] 출력 유형 선택: "' + targetText + '"');
        simulateRealClick(clickTarget);
        await sleep(300);
        return true;
      }
    }
    console.log('[Flow Auto] 출력 유형 "' + targetText + '" 메뉴 아이템 미발견');
    return false;
  }

  // 5-1. 수량 선택 (x1~x4)
  async function selectQuantity(menu, count) {
    var targetText = 'x' + (count || 1);
    var items = menu.querySelectorAll('*');
    for (var i = 0; i < items.length; i++) {
      var txt = items[i].textContent.trim();
      if (txt === targetText && items[i].getBoundingClientRect().width > 0) {
        var clickTarget = items[i].closest('button, [role="menuitem"], [role="menuitemradio"]') || items[i];
        console.log('[Flow Auto] 수량 선택: "' + targetText + '"');
        simulateRealClick(clickTarget);
        await sleep(300);
        return true;
      }
    }
    console.log('[Flow Auto] 수량 "' + targetText + '" 메뉴 아이템 미발견');
    return false;
  }

  // 6. 모델 선택 (하위 메뉴 열어서 선택)
  async function selectModel(menu, modelName) {
    var MODEL_DISPLAY_NAMES = {
      'nano-banana-pro': 'Nano Banana Pro',
      'nano-banana-2': 'Nano Banana 2',
      'imagen-4': 'Imagen 4'
    };
    var displayName = MODEL_DISPLAY_NAMES[modelName] || modelName;

    // 메인 메뉴에서 현재 모델 버튼 찾기 (텍스트에 모델명 포함)
    var modelItems = menu.querySelectorAll('*');
    var modelBtn = null;
    for (var i = 0; i < modelItems.length; i++) {
      var txt = modelItems[i].textContent.trim();
      if ((txt.includes('Banana') || txt.includes('Imagen') || txt.includes('Nano')) &&
          modelItems[i].getBoundingClientRect().width > 0) {
        var clickable = modelItems[i].closest('button, [role="menuitem"], [role="menuitemradio"]') || modelItems[i];
        // 중복 방지: 이미 찾은 것과 같으면 건너뜀
        if (modelBtn && modelBtn === clickable) continue;
        modelBtn = clickable;
        break;
      }
    }

    if (!modelBtn) {
      console.log('[Flow Auto] 모델 버튼 미발견 in menu');
      return false;
    }

    console.log('[Flow Auto] 모델 하위 메뉴 열기: "' + modelBtn.textContent.trim().substring(0, 40) + '"');
    simulateRealClick(modelBtn);
    await sleep(500);

    // 하위 [role="menu"] 대기
    var subMenus = document.querySelectorAll('[role="menu"]');
    var subMenu = subMenus.length > 1 ? subMenus[subMenus.length - 1] : null;

    if (!subMenu) {
      // 잠시 더 대기
      await sleep(500);
      subMenus = document.querySelectorAll('[role="menu"]');
      subMenu = subMenus.length > 1 ? subMenus[subMenus.length - 1] : null;
    }

    if (!subMenu) {
      console.log('[Flow Auto] 모델 하위 메뉴 미출현');
      return false;
    }

    // 하위 메뉴에서 대상 모델 찾기
    // displayName에서 핵심 키워드 추출 (이모지, 특수문자 무시하고 매칭)
    var modelKeywords = displayName.split(/\s+/); // ["Nano", "Banana", "2"] 등
    var subItems = subMenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button, div, span');
    var bestMatch = null;
    var bestScore = 0;

    for (var j = 0; j < subItems.length; j++) {
      var subTxt = subItems[j].textContent.trim();
      if (subItems[j].getBoundingClientRect().width === 0) continue;

      // 각 키워드가 포함되어 있는지 점수 매기기
      var score = 0;
      for (var k = 0; k < modelKeywords.length; k++) {
        if (subTxt.includes(modelKeywords[k])) score++;
      }

      // 모든 키워드 매칭 + 가장 짧은 텍스트 (정확한 항목) 우선
      if (score === modelKeywords.length && score > bestScore) {
        bestScore = score;
        bestMatch = subItems[j];
      } else if (score === modelKeywords.length && score === bestScore) {
        // 같은 점수면 텍스트 길이가 짧은 쪽 (더 정확한 매칭)
        if (subTxt.length < (bestMatch.textContent || '').trim().length) {
          bestMatch = subItems[j];
        }
      }
    }

    if (bestMatch) {
      var subClickable = bestMatch.closest('button, [role="menuitem"], [role="menuitemradio"]') || bestMatch;
      console.log('[Flow Auto] 모델 선택: "' + displayName + '" → "' + bestMatch.textContent.trim().substring(0, 40) + '"');
      simulateRealClick(subClickable);
      await sleep(300);
      return true;
    }

    console.log('[Flow Auto] 모델 "' + displayName + '" 하위 메뉴에 미발견');
    return false;
  }

  // 7. Esc로 메뉴 닫기 (하위 메뉴 + 메인 메뉴)
  async function closeMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
    }));
    await sleep(200);
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
    }));
    await sleep(200);

    // 메뉴가 닫혔는지 확인
    var remaining = document.querySelectorAll('[role="menu"]');
    if (remaining.length > 0) {
      // 한번 더 시도
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
      }));
      await sleep(200);
    }
    console.log('[Flow Auto] 메뉴 닫기 완료');
  }

  // 8. 모델 + 출력 유형 한번에 설정 (첫 실행 시 1회)
  async function setupModelAndOutput(model, outputType) {
    model = model || 'nano-banana-2';
    outputType = outputType || 'image';
    console.log('[Flow Auto] 모델/출력 설정: model=' + model + ', output=' + outputType);

    try {
      var menu = await openModelMenu();

      // 출력 유형 (Image/Video) 선택
      await selectOutputType(menu, outputType);
      await sleep(300);

      // 메뉴가 닫혔을 수 있으므로 다시 확인
      var menus = document.querySelectorAll('[role="menu"]');
      if (menus.length === 0) {
        menu = await openModelMenu();
      } else {
        menu = menus[0];
      }

      // 수량 x1 강제 (자동화는 프롬프트당 1개씩 순차 생성)
      await selectQuantity(menu, 1);
      await sleep(300);

      // 메뉴 재확인
      menus = document.querySelectorAll('[role="menu"]');
      if (menus.length === 0) {
        menu = await openModelMenu();
      } else {
        menu = menus[0];
      }

      // 모델 선택
      await selectModel(menu, model);
      await sleep(300);

      // 메뉴 닫기
      await closeMenus();
      console.log('[Flow Auto] 모델/출력 설정 완료');
    } catch (e) {
      console.error('[Flow Auto] 모델/출력 설정 실패:', e.message);
      await closeMenus();
    }
  }

  // 9. Ingredient 버튼 찾기 ("add_2만들기" 텍스트, 하단 프롬프트 바 좌측)
  function findIngredientButton() {
    var buttons = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || '').trim();
      var rect = buttons[i].getBoundingClientRect();
      if (rect.top > 500 && rect.width > 0 && txt.includes('add_2') && txt.includes('만들기')) {
        console.log('[Flow Auto] Ingredient 버튼 발견: ' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
          ' at(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ')');
        return buttons[i];
      }
    }
    return null;
  }

  // 10. "+" → 에셋 패널에서 캐릭터 검색 → 선택
  async function selectAssetByName(charName) {
    var promptEl = findPromptInput();
    var beforeVoids = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]').length;

    // 1. "+" (ingredient) 버튼 클릭 → 에셋 패널 열기
    var ingredientBtn = findIngredientButton();
    if (!ingredientBtn) throw new Error('Ingredient(+) 버튼을 찾을 수 없습니다');
    simulateRealClick(ingredientBtn);
    await sleep(800);

    // 2. 에셋 검색바 찾기 (placeholder "에셋 검색" 또는 검색 input)
    var searchInput = null;
    var inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
    for (var si = 0; si < inputs.length; si++) {
      var ph = (inputs[si].placeholder || '').toLowerCase();
      var rect = inputs[si].getBoundingClientRect();
      if (rect.width > 0 && (ph.includes('에셋') || ph.includes('검색') || ph.includes('search') || ph.includes('asset'))) {
        searchInput = inputs[si];
        break;
      }
    }

    if (!searchInput) {
      console.warn('[Flow Auto] 에셋 검색바 미발견, 패널 내 첫 input 사용');
      // 패널 내 보이는 input 중 첫 번째
      for (var fi = 0; fi < inputs.length; fi++) {
        var fiRect = inputs[fi].getBoundingClientRect();
        if (fiRect.width > 100 && fiRect.top > 0 && fiRect.top < window.innerHeight) {
          searchInput = inputs[fi];
          break;
        }
      }
    }

    if (!searchInput) {
      throw new Error('에셋 검색바를 찾을 수 없습니다');
    }

    console.log('[Flow Auto] 에셋 검색바 발견, "' + charName + '" 검색');

    // 3. 검색바에 캐릭터 이름 입력
    searchInput.focus();
    await sleep(200);
    // 기존 텍스트 지우기
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    // 캐릭터 이름 입력
    searchInput.value = charName;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1000); // 검색 결과 대기

    // 4. 검색 결과에서 에셋 클릭
    //    에셋 목록은 검색바 아래에 썸네일+이름 리스트로 표시됨
    var assetFound = false;
    var assetItems = document.querySelectorAll('[class*="asset"], [class*="item"], [class*="result"], [role="option"], [role="listitem"]');

    // 패널 내 클릭 가능한 요소들 중 캐릭터 이름이 포함된 것
    if (assetItems.length === 0) {
      // 클래스 기반으로 못 찾으면, 검색바 근처의 모든 클릭 가능 요소 탐색
      var searchRect = searchInput.getBoundingClientRect();
      var allClickable = document.querySelectorAll('div, button, li, a, span');
      var candidates = [];
      for (var ci = 0; ci < allClickable.length; ci++) {
        var cRect = allClickable[ci].getBoundingClientRect();
        var cTxt = (allClickable[ci].textContent || '').trim();
        // 검색바 아래, 같은 패널 영역, 텍스트에 캐릭터 이름 포함
        if (cRect.top > searchRect.bottom && cRect.top < searchRect.bottom + 500 &&
            cRect.left >= searchRect.left - 50 && cRect.width > 30 && cRect.height > 20 &&
            cTxt.includes(charName)) {
          candidates.push({ el: allClickable[ci], text: cTxt, height: cRect.height });
        }
      }
      // 가장 적절한 크기의 요소 선택 (목록 항목 크기: 30~80px 높이)
      candidates.sort(function(a, b) {
        var idealH = 50;
        return Math.abs(a.height - idealH) - Math.abs(b.height - idealH);
      });
      if (candidates.length > 0) {
        assetItems = [candidates[0].el];
      }
    }

    for (var ai = 0; ai < assetItems.length; ai++) {
      var assetTxt = (assetItems[ai].textContent || '').trim();
      var assetRect = assetItems[ai].getBoundingClientRect();
      if (assetRect.width > 0 && assetTxt.includes(charName)) {
        console.log('[Flow Auto] 에셋 발견: "' + assetTxt.substring(0, 40) + '" → 클릭');
        simulateRealClick(assetItems[ai]);
        assetFound = true;
        await sleep(500);
        break;
      }
    }

    if (!assetFound) {
      console.warn('[Flow Auto] 에셋 "' + charName + '" 검색 결과 없음');
      // 패널 닫기 (Esc)
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
      }));
      await sleep(300);
      return false;
    }

    // 5. 프롬프트에 썸네일 삽입 확인 (이미 분석된 에셋은 즉시 삽입됨)
    await sleep(1000);
    var afterVoids = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]').length;
    if (afterVoids > beforeVoids) {
      console.log('[Flow Auto] 에셋 "' + charName + '" 삽입 완료 (즉시), 썸네일 ' + beforeVoids + ' → ' + afterVoids);
    } else {
      // 분석 대기 (새 에셋인 경우)
      console.log('[Flow Auto] 에셋 "' + charName + '" 분석 대기...');
      var analysisMaxWait = 60000;
      var analysisWaited = 0;
      while (analysisWaited < analysisMaxWait) {
        if (isStopRequested()) throw new Error('__STOPPED__');
        var currentVoids = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]').length;
        if (currentVoids > beforeVoids) {
          // 썸네일 추가됨 → 로딩 오버레이 확인
          var hasLoading = false;
          var voidEls = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]');
          for (var vi = 0; vi < voidEls.length; vi++) {
            var loadingInThumb = voidEls[vi].querySelectorAll(
              '[class*="loading"], [class*="spinner"], [class*="progress"], ' +
              '[role="progressbar"], svg circle[stroke-dasharray]'
            );
            if (loadingInThumb.length > 0) { hasLoading = true; break; }
            var thumbOpacity = parseFloat(getComputedStyle(voidEls[vi]).opacity);
            if (thumbOpacity < 0.9) { hasLoading = true; break; }
          }
          if (!hasLoading) {
            console.log('[Flow Auto] 에셋 "' + charName + '" 분석 완료 (' + (analysisWaited / 1000) + '초)');
            break;
          }
        }
        if (analysisWaited % 5000 === 0 && analysisWaited > 0) {
          console.log('[Flow Auto] 분석 대기 중... (' + (analysisWaited / 1000) + '초)');
        }
        await sleep(1000);
        analysisWaited += 1000;
      }
    }

    // 6. 에셋 패널 닫기 (ESC 또는 바깥 클릭)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
    }));
    await sleep(300);

    return true;
  }

  // 11. 캐릭터별 레퍼런스 일괄 선택
  async function uploadReferences(charNames, characterMap) {
    var names = charNames.split(',').map(function(n) { return n.trim(); });

    for (var i = 0; i < names.length; i++) {
      if (isStopRequested()) throw new Error('__STOPPED__');

      var name = names[i];
      console.log('[Flow Auto] 레퍼런스 선택 ' + (i + 1) + '/' + names.length + ': ' + name);

      // 에셋 패널에서 이름으로 검색 → 선택
      var selected = await selectAssetByName(name);

      if (!selected) {
        // 에셋 미발견 → dataUrl이 있으면 새 업로드 시도 (Drag & Drop fallback)
        var dataUrl = characterMap[name] || characterMap[name.normalize('NFC')];
        if (dataUrl) {
          console.log('[Flow Auto] 에셋 미발견, Drag&Drop으로 새 업로드: ' + name);
          var promptEl = findPromptInput();
          var beforeVoids = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]').length;

          document.documentElement.setAttribute('data-flow-upload', dataUrl);
          document.documentElement.removeAttribute('data-flow-upload-done');
          document.documentElement.setAttribute('data-flow-upload-dragdrop', '[role="textbox"][contenteditable]');

          // 파일 전달 대기
          var waited = 0;
          while (waited < 10000) {
            var done = document.documentElement.getAttribute('data-flow-upload-done');
            if (done === 'true') {
              document.documentElement.removeAttribute('data-flow-upload-done');
              break;
            }
            if (done === 'error') {
              document.documentElement.removeAttribute('data-flow-upload-done');
              console.error('[Flow Auto] Drag&Drop 실패: ' + name);
              break;
            }
            await sleep(300);
            waited += 300;
          }

          // 분석 완료 대기 (새 업로드이므로 시간 소요)
          console.log('[Flow Auto] 새 에셋 분석 대기: ' + name);
          var analysisWaited = 0;
          await sleep(3000);
          analysisWaited += 3000;
          while (analysisWaited < 60000) {
            if (isStopRequested()) throw new Error('__STOPPED__');
            var currentVoids = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]').length;
            if (currentVoids > beforeVoids) {
              var hasLoading = false;
              var voidEls = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]');
              for (var vi = 0; vi < voidEls.length; vi++) {
                var loadingInThumb = voidEls[vi].querySelectorAll(
                  '[class*="loading"], [class*="spinner"], [class*="progress"], ' +
                  '[role="progressbar"], svg circle[stroke-dasharray]'
                );
                if (loadingInThumb.length > 0) { hasLoading = true; break; }
                if (parseFloat(getComputedStyle(voidEls[vi]).opacity) < 0.9) { hasLoading = true; break; }
              }
              if (!hasLoading) {
                console.log('[Flow Auto] 새 에셋 분석 완료: ' + name + ' (' + (analysisWaited / 1000) + '초)');
                break;
              }
            }
            await sleep(1000);
            analysisWaited += 1000;
          }
        } else {
          console.warn('[Flow Auto] 캐릭터 "' + name + '" 이미지 없음, 스킵');
        }
      }

      await sleep(500);
    }

    console.log('[Flow Auto] 레퍼런스 선택 완료: ' + names.length + '명');
  }

  // 12. 기존 레퍼런스 제거 (프롬프트 영역 초기화)
  async function clearReferences() {
    // 프롬프트 입력 영역의 레퍼런스 썸네일 + 텍스트 모두 제거
    // 전체 선택 + 삭제 방식
    var promptEl = findPromptInput();
    promptEl.focus();
    await sleep(100);
    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(promptEl);
    sel.removeAllRanges();
    sel.addRange(range);
    await sleep(100);
    promptEl.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      bubbles: true, cancelable: true, composed: true
    }));
    await sleep(300);
    console.log('[Flow Auto] 레퍼런스 및 프롬프트 초기화');
  }

  // 13. 생성 버튼 찾기 ("arrow_forward" + "만들기" 텍스트, 하단)
  function findGenerateButton() {
    var buttons = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || '').trim();
      var rect = buttons[i].getBoundingClientRect();
      if (rect.top > 500 && rect.width > 0 &&
          txt.includes('만들기') && txt.includes('arrow_forward')) {
        console.log('[Flow Auto] 생성 버튼 발견: ' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
          ' at(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ')');
        return buttons[i];
      }
    }
    // Fallback: "만들기"만 포함 (arrow_forward 없는 경우)
    for (var j = 0; j < buttons.length; j++) {
      var txt2 = (buttons[j].textContent || '').trim();
      var rect2 = buttons[j].getBoundingClientRect();
      if (rect2.top > 500 && rect2.width > 0 && txt2.includes('만들기') &&
          !txt2.includes('add_2')) {  // "add_2만들기"(ingredient 버튼) 제외
        console.log('[Flow Auto] 생성 버튼(fallback) 발견: "' + txt2.substring(0, 30) + '"');
        return buttons[j];
      }
    }
    throw new Error('생성 버튼을 찾을 수 없습니다 ("만들기" + "arrow_forward")');
  }

  // 10. 생성 버튼 클릭
  async function clickGenerate() {
    var btn = findGenerateButton();
    simulateRealClick(btn);
    console.log('[Flow Auto] 생성 버튼 클릭');
    return true;
  }

  // 11. 생성 완료 대기 (새 이미지/비디오 출현 감시)
  async function waitForGeneration() {
    var maxWait = selectedOutputType === 'video' ? 120000 : 60000;
    var pollInterval = 2000;
    var waited = 0;

    console.log('[Flow Auto] 생성 완료 대기 (최대 ' + (maxWait / 1000) + '초)...');

    // 현재 이미지 src 스냅샷
    var knownSrcs = new Set();
    document.querySelectorAll('img').forEach(function(img) {
      if (img.src) knownSrcs.add(img.src);
    });

    while (waited < maxWait) {
      await sleep(pollInterval);
      waited += pollInterval;

      // 비디오 모드: video 태그 감지
      if (selectedOutputType === 'video') {
        var videos = document.querySelectorAll('video');
        for (var v = 0; v < videos.length; v++) {
          if (videos[v].src && !knownSrcs.has(videos[v].src)) {
            console.log('[Flow Auto] 비디오 생성 완료! (' + (waited / 1000) + '초)');
            return true;
          }
        }
      }

      // 이미지: getMediaUrlRedirect 패턴 새 img 감지
      var newCount = 0;
      document.querySelectorAll('img').forEach(function(img) {
        if (img.src && img.src.includes('getMediaUrlRedirect') &&
            !knownSrcs.has(img.src) && !downloadedSrcs.has(img.src)) {
          newCount++;
        }
      });

      if (newCount >= 1) {
        console.log('[Flow Auto] 생성 완료! 새 이미지 ' + newCount + '개 감지 (' + (waited / 1000) + '초)');
        return true;
      }

      // 10초마다 진행 로그
      if (waited % 10000 === 0) {
        console.log('[Flow Auto] 생성 대기 중... (' + (waited / 1000) + '초)');
      }
    }

    console.log('[Flow Auto] ' + (maxWait / 1000) + '초 타임아웃 — 새 이미지 미감지');
    return false;
  }

  async function downloadImage(promptText, index, customFilename, preGenSrcs) {
    console.log('[Flow Auto] 다운로드 시도...');

    // Flow는 이미지 2개를 생성 → 첫 번째만 다운로드, 나머지는 스킵
    // preGenSrcs: 생성 전 스냅샷 (레퍼런스/스타일 이미지 제외용)
    const images = document.querySelectorAll('img');
    const newImages = [];

    for (const img of images) {
      if (img.src && img.width > 100 && img.height > 100 &&
          !downloadedSrcs.has(img.src) &&
          (!preGenSrcs || !preGenSrcs.has(img.src))) {
        newImages.push(img);
      }
    }

    // 위치 기준 정렬 (위→아래, 왼쪽→오른쪽) → 첫 번째 = Flow 첫 번째 결과
    newImages.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      if (Math.abs(ar.top - br.top) < 20) return ar.left - br.left;
      return ar.top - br.top;
    });

    if (newImages.length > 1) {
      console.log('[Flow Auto] 생성된 이미지 ' + newImages.length + '개 중 첫 번째만 다운로드');
    }

    // 모든 새 이미지를 "처리 완료"로 마킹 (2번째 이미지가 다음 프롬프트로 밀리는 것 방지)
    for (const img of newImages) {
      downloadedSrcs.add(img.src);
    }

    let targetImage = newImages.length > 0 ? newImages[0] : null;

    // 새 이미지가 없으면 가장 큰 이미지 사용 (fallback)
    if (!targetImage) {
      console.log('[Flow Auto] 새 이미지 없음, 가장 큰 이미지 사용');
      let maxSize = 0;
      for (const img of images) {
        if (img.src && img.width > 100 && img.height > 100) {
          const size = img.width * img.height;
          if (size > maxSize) {
            maxSize = size;
            targetImage = img;
          }
        }
      }
    }

    if (targetImage && targetImage.src) {
      console.log('[Flow Auto] 이미지 발견:', targetImage.width, 'x', targetImage.height);

      // 파일명 결정: 지정된 파일명 또는 자동 생성
      let fullFilename;
      if (customFilename) {
        // Windows 금지 문자 제거 + 확장자 없으면 .png 추가
        var safeName = customFilename.replace(/[<>:"|?*]/g, '_').replace(/_+/g, '_');
        fullFilename = safeName.includes('.') ? safeName : `${safeName}.png`;
        console.log('[Flow Auto] 지정된 파일명 사용:', fullFilename);
      } else {
        // 기존 방식: 프롬프트에서 파일명 생성
        const autoFilename = promptText
          .substring(0, 30)
          .replace(/[^a-zA-Z0-9가-힣]/g, '_')
          .replace(/_+/g, '_');
        fullFilename = `flow_${index + 1}_${autoFilename}.png`;
      }

      const fullPath = `${savePath}/${fullFilename}`;

      // 다운로드한 이미지 src 기록 (중복 방지)
      const imageSrc = targetImage.src;
      downloadedSrcs.add(imageSrc);
      console.log('[Flow Auto] 이미지 src 기록됨, 총', downloadedSrcs.size, '개');

      try {
        // fetch로 이미지 가져오기
        const response = await fetch(imageSrc);
        const blob = await response.blob();

        if (useCustomDir) {
          // File System Access API: 이미지 데이터를 사이드패널로 전송
          var reader = new FileReader();
          var dataUrl = await new Promise(function(resolve, reject) {
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          chrome.runtime.sendMessage({
            action: 'SAVE_IMAGE_DATA',
            dataUrl: dataUrl,
            filename: fullFilename
          });
          console.log('[Flow Auto] 커스텀 폴더 저장 요청:', fullFilename);
        } else {
          // Blob URL → Background → chrome.downloads
          var blobUrl = URL.createObjectURL(blob);
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_IMAGE',
            url: blobUrl,
            filename: fullPath
          });
          console.log('[Flow Auto] 다운로드 요청:', fullPath);
        }
        return true;
      } catch (e) {
        console.log('[Flow Auto] fetch 다운로드 실패, 직접 요청 시도');
        if (!useCustomDir) {
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_IMAGE',
            url: imageSrc,
            filename: fullPath
          });
        }
        return true;
      }
    }

    console.log('[Flow Auto] 다운로드할 이미지를 찾지 못함');
    return false;
  }

  // TODO: Flow DOM 탐색 완료 후 비디오 다운로드 로직 구현
  async function downloadVideo(promptText, index, customFilename) {
    console.log('[Flow Auto] 비디오 다운로드 시도...');
    var videos = document.querySelectorAll('video');
    var targetVideo = null;

    for (var v = videos.length - 1; v >= 0; v--) {
      var video = videos[v];
      if (video.src && video.src.startsWith('blob:')) {
        targetVideo = video;
        break;
      }
    }

    if (!targetVideo || !targetVideo.src) {
      console.log('[Flow Auto] 다운로드할 비디오를 찾지 못함');
      return false;
    }

    var fullFilename;
    if (customFilename) {
      var safeName = customFilename.replace(/[<>:"|?*]/g, '_').replace(/_+/g, '_');
      fullFilename = safeName.includes('.') ? safeName : safeName + '.mp4';
    } else {
      var autoName = promptText
        .substring(0, 30)
        .replace(/[^a-zA-Z0-9가-힣]/g, '_')
        .replace(/_+/g, '_');
      fullFilename = 'flow_' + (index + 1) + '_' + autoName + '.mp4';
    }

    try {
      var response = await fetch(targetVideo.src);
      var blob = await response.blob();
      var reader = new FileReader();
      var dataUrl = await new Promise(function(resolve, reject) {
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_VIDEO',
        dataUrl: dataUrl,
        filename: savePath + '/' + fullFilename
      });
      console.log('[Flow Auto] 비디오 다운로드 요청:', fullFilename);
      return true;
    } catch (e) {
      console.error('[Flow Auto] 비디오 다운로드 실패:', e.message);
      return false;
    }
  }

  // 출력 유형에 따라 적절한 다운로드 함수 호출
  async function downloadOutput(promptText, index, customFilename, preGenSrcs) {
    if (selectedOutputType === 'video') {
      return await downloadVideo(promptText, index, customFilename);
    }
    return await downloadImage(promptText, index, customFilename, preGenSrcs);
  }

  // 배치 다운로드: 새 이미지를 수집하여 프롬프트 순서대로 다운로드
  async function downloadBatch(batchStart, batchEnd, preGenSrcs) {
    var newImages = [];
    document.querySelectorAll('img').forEach(function(img) {
      if (img.src && img.src.includes('getMediaUrlRedirect') &&
          !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src)) {
        newImages.push(img);
      }
    });

    // 위치순 정렬 (위→아래 = 생성 순서)
    newImages.sort(function(a, b) {
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      if (Math.abs(ar.top - br.top) < 20) return ar.left - br.left;
      return ar.top - br.top;
    });

    var batchCount = batchEnd - batchStart;
    var dlCount = Math.min(newImages.length, batchCount);
    console.log('[Flow Auto] 배치 다운로드: 새 이미지 ' + newImages.length + '개, 다운로드 ' + dlCount + '개');

    for (var di = 0; di < dlCount; di++) {
      var pIdx = batchStart + di;
      if (pIdx >= promptsWithCharacters.length) break;

      var pItem = promptsWithCharacters[pIdx];
      downloadedSrcs.add(newImages[di].src);

      // 파일명 결정
      var fullFilename;
      if (pItem.filename) {
        var safeName = pItem.filename.replace(/[<>:"|?*]/g, '_').replace(/_+/g, '_');
        fullFilename = safeName.includes('.') ? safeName : safeName + '.png';
      } else {
        var autoName = pItem.prompt.substring(0, 30)
          .replace(/[^a-zA-Z0-9가-힣]/g, '_').replace(/_+/g, '_');
        fullFilename = 'flow_' + (pItem.index + 1) + '_' + autoName + '.png';
      }

      try {
        var response = await fetch(newImages[di].src);
        var blob = await response.blob();

        if (useCustomDir) {
          var reader = new FileReader();
          var dataUrl = await new Promise(function(resolve, reject) {
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          chrome.runtime.sendMessage({
            action: 'SAVE_IMAGE_DATA',
            dataUrl: dataUrl,
            filename: fullFilename
          });
        } else {
          var blobUrl = URL.createObjectURL(blob);
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_IMAGE',
            url: blobUrl,
            filename: savePath + '/' + fullFilename
          });
        }
        console.log('[Flow Auto] DL ' + (di + 1) + '/' + dlCount + ': ' + fullFilename);
      } catch (e) {
        console.error('[Flow Auto] 다운로드 실패: ' + fullFilename, e.message);
      }
    }

    // 남은 이미지도 downloadedSrcs에 등록 (다음 배치 오염 방지)
    for (var ri = dlCount; ri < newImages.length; ri++) {
      downloadedSrcs.add(newImages[ri].src);
    }

    return dlCount;
  }

  async function run() {
    // 1. 정지 플래그 초기화
    document.documentElement.removeAttribute('data-flow-stop');

    // 2. 모델/출력 유형 설정 (첫 실행 시 1회)
    console.log('[Flow Auto] 모델: ' + (selectedModel || 'nano-banana-2') + ', 출력: ' + (selectedOutputType || 'image'));
    await setupModelAndOutput(selectedModel, selectedOutputType);
    await sleep(1000);

    // 비디오는 순차, 이미지는 배치 모드
    var BATCH_SIZE = (selectedOutputType === 'video') ? 1 : 4;
    var currentRefGroup = null; // 현재 업로드된 레퍼런스 캐릭터 조합
    var batchNum = 0;

    console.log('[Flow Auto] 배치 모드: ' + BATCH_SIZE + '개씩 (총 ' + promptsWithCharacters.length + '개)');

    // 3. characterGroup 기반 배치 루프
    var i = 0;
    while (i < promptsWithCharacters.length) {
      if (isStopRequested()) {
        console.log('[Flow Auto] 사용자 정지 요청 — 자동화 중단');
        try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
        return;
      }

      var item = promptsWithCharacters[i];
      var thisGroup = item.characterGroup || ''; // "" = 캐릭터 없음

      // === 레퍼런스 전환 체크 ===
      if (thisGroup !== currentRefGroup) {
        if (thisGroup && item.character) {
          // 새 캐릭터 조합 → 레퍼런스 교체
          console.log('[Flow Auto] 레퍼런스 전환: "' + (currentRefGroup || '없음') + '" → "' + thisGroup + '"');
          await clearReferences();
          await sleep(500);
          await uploadReferences(item.character, characters);
          await sleep(1000);
        } else if (currentRefGroup) {
          // 캐릭터 없는 프롬프트 → 레퍼런스 제거
          console.log('[Flow Auto] 레퍼런스 제거 (캐릭터 없음)');
          await clearReferences();
          await sleep(500);
        }
        currentRefGroup = thisGroup;
      }

      // === 같은 characterGroup 내 연속 프롬프트 수집 (배치 범위) ===
      var batchStart = i;
      var batchEnd = i;
      while (batchEnd < promptsWithCharacters.length &&
             batchEnd - batchStart < BATCH_SIZE &&
             (promptsWithCharacters[batchEnd].characterGroup || '') === thisGroup) {
        batchEnd++;
      }

      var batchCount = batchEnd - batchStart;
      batchNum++;

      console.log('[Flow Auto] === 배치 ' + batchNum +
        ' (' + (batchStart + 1) + '~' + batchEnd + '/' + promptsWithCharacters.length + ')' +
        (thisGroup ? ' [레퍼런스: ' + thisGroup + ']' : '') + ' ===');

      var MAX_BATCH_RETRIES = 2;
      var batchRetry = 0;
      var batchSuccess = false;

      while (batchRetry <= MAX_BATCH_RETRIES && !batchSuccess) {
        try {
          // Phase 1: 생성 전 이미지 스냅샷
          var preGenSrcs = new Set();
          document.querySelectorAll('img').forEach(function(img) {
            if (img.src) preGenSrcs.add(img.src);
          });

          // Phase 2: 프롬프트 연속 제출 (레퍼런스는 이미 올라가 있으므로 텍스트만 입력)
          for (var j = batchStart; j < batchEnd; j++) {
            if (isStopRequested()) {
              try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
              return;
            }

            var batchItem = promptsWithCharacters[j];
            var logPrefix = '[' + (batchItem.index + 1) + ']' + (batchItem.filename ? ' [' + batchItem.filename + ']' : '');

            console.log('[Flow Auto] 제출 ' + (j + 1) + '/' + promptsWithCharacters.length + ': ' + logPrefix);

            try {
              chrome.runtime.sendMessage({
                action: 'PROGRESS_UPDATE',
                currentIndex: j,
                totalCount: promptsWithCharacters.length,
                promptIndex: batchItem.index,
                status: 'processing',
                currentPrompt: logPrefix + ' (제출중)'
              });
            } catch(e) {}

            await fillPrompt(batchItem.prompt);
            await sleep(500);
            await clickGenerate();

            // 배치 내 마지막이 아니면 UI 안정화 대기
            if (j < batchEnd - 1) {
              await sleep(2000);
            }
          }

          // Phase 3: 배치 전체 완료 대기
          console.log('[Flow Auto] 배치 ' + batchNum + ': ' + batchCount + '개 생성 대기...');
          await sleep(2000);

          var maxWait = selectedOutputType === 'video' ? 180000 : 90000;
          var pollInterval = 2000;
          var waited = 0;
          var newImagesReady = 0;

          while (waited < maxWait && newImagesReady < batchCount) {
            if (isStopRequested()) {
              try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
              return;
            }

            await sleep(pollInterval);
            waited += pollInterval;

            newImagesReady = 0;
            document.querySelectorAll('img').forEach(function(img) {
              if (img.src && img.src.includes('getMediaUrlRedirect') &&
                  !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src)) {
                newImagesReady++;
              }
            });

            if (waited % 10000 === 0) {
              console.log('[Flow Auto] 대기 중... ' + newImagesReady + '/' + batchCount + ' (' + (waited / 1000) + '초)');
            }
          }

          console.log('[Flow Auto] 배치 ' + batchNum + ' 생성 완료: ' + newImagesReady + '/' + batchCount +
            ' (' + (waited / 1000) + '초)');

          if (newImagesReady === 0) {
            throw new Error('배치 생성 실패 — 새 이미지 0개');
          }

          // Phase 4: 배치 다운로드
          if (autoDownload) {
            await sleep(1000);
            await downloadBatch(batchStart, batchEnd, preGenSrcs);
          }

          batchSuccess = true;
          consecutiveFailures = 0;

          // 진행 상황 업데이트
          try {
            chrome.runtime.sendMessage({
              action: 'PROGRESS_UPDATE',
              currentIndex: batchEnd,
              totalCount: promptsWithCharacters.length,
              promptIndex: promptsWithCharacters[batchEnd - 1].index,
              status: 'completed',
              currentPrompt: '배치 ' + batchNum + ' 완료'
            });
          } catch(e) {}

          // 배치 간 딜레이
          if (batchEnd < promptsWithCharacters.length) {
            console.log('[Flow Auto] ' + delayMs + 'ms 대기...');
            await sleep(delayMs);
          }

        } catch (error) {
          if (error.message === '__STOPPED__' || isStopRequested()) {
            console.log('[Flow Auto] 사용자 정지 요청 — 자동화 중단');
            try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
            return;
          }
          batchRetry++;
          if (batchRetry <= MAX_BATCH_RETRIES) {
            console.log('[Flow Auto] 배치 ' + batchNum + ' 재시도 ' + batchRetry + '/' + MAX_BATCH_RETRIES + ': ' + error.message);
            await sleep(5000);
          } else {
            console.error('[Flow Auto] 배치 ' + batchNum + ' 실패:', error.message);
            consecutiveFailures++;
            if (consecutiveFailures >= 2) {
              console.log('[Flow Auto] === 연속 실패, 페이지 리로드 요청 ===');
              window.__flowAutoRunning = false;
              clearInterval(popupWatcher);
              try {
                chrome.runtime.sendMessage({
                  action: 'HARD_RESET_NEEDED',
                  completedCount: batchStart,
                });
              } catch(e) {}
              return;
            }
          }
        }
      }

      i = batchEnd;
    }

    console.log('[Flow Auto] 모든 프롬프트 완료!');
    window.__flowAutoRunning = false;
    clearInterval(popupWatcher);
    try {
      chrome.runtime.sendMessage({ action: 'AUTOMATION_COMPLETE' });
    } catch(e) {}
    alert('자동화 완료!');
  }

  run();
}

// Stop automation
async function stopAutomation() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'STOP_AUTOMATION' });
  } catch (error) {
    console.warn('sendMessage 실패, executeScript fallback:', error.message);
  }

  // Fallback: 직접 DOM 속성 설정 (content.js 미로드 시에도 동작)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.setAttribute('data-flow-stop', 'true'),
      world: 'MAIN'
    });
  } catch (e) {
    console.error('executeScript fallback도 실패:', e);
  }

  isRunning = false;
  updateUI();
}

// 페이지 리로드 후 남은 프롬프트 재주입
async function handleHardReset(completedCount) {
  console.log(`[Popup] 하드 리셋: ${completedCount}장 완료, 페이지 리로드 시작`);

  completedOffset += completedCount;
  const remaining = sortedPromptsCache.slice(completedOffset);

  if (remaining.length === 0) {
    console.log('[Popup] 남은 프롬프트 없음, 완료');
    isRunning = false;
    updateUI();
    return;
  }

  console.log(`[Popup] 남은 프롬프트: ${remaining.length}개`);

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    // 리로드 전 현재 URL 저장
    const originalUrl = tab.url;
    console.log(`[Popup] 현재 URL 저장: ${originalUrl}`);

    // 페이지 리로드
    await chrome.tabs.reload(tab.id);

    // 로딩 완료 대기
    await new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // 리로드 후 URL 확인 — 다른 페이지로 갔으면 원래 URL로 이동
    const updatedTab = await chrome.tabs.get(tab.id);
    if (updatedTab.url !== originalUrl) {
      console.log(`[Popup] URL 변경 감지: ${updatedTab.url} → 원래 URL로 복귀`);
      await chrome.tabs.update(tab.id, { url: originalUrl });

      // 다시 로딩 완료 대기
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    // UI 요소 감지 폴링 (textarea 또는 contenteditable 찾기, 최대 20초)
    console.log('[Popup] Flow UI 요소 감지 대기 (최대 20초)...');
    const maxWaitMs = 20000;
    const pollMs = 2000;
    let waited = 0;
    let uiReady = false;

    while (waited < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollMs));
      waited += pollMs;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const textarea = document.querySelector('textarea');
            const editable = document.querySelector('[contenteditable="true"]');
            const buttons = document.querySelectorAll('button');
            const hasInput = !!(textarea || editable);
            const hasButtons = buttons.length > 3;
            return { hasInput, hasButtons, buttonCount: buttons.length };
          }
        });

        const check = results[0]?.result;
        if (check && check.hasInput && check.hasButtons) {
          console.log(`[Popup] Flow UI 준비 완료 (${waited / 1000}초, 버튼 ${check.buttonCount}개)`);
          uiReady = true;
          break;
        }
        console.log(`[Popup] UI 미준비 (${waited / 1000}초): input=${check?.hasInput}, buttons=${check?.buttonCount}`);
      } catch (e) {
        console.log(`[Popup] UI 확인 실패 (${waited / 1000}초): ${e.message}`);
      }
    }

    if (!uiReady) {
      console.warn('[Popup] 20초 내 Flow UI 미감지, 그래도 재주입 시도');
    }

    // 추가 안정화 대기 (UI 렌더링 완료)
    await new Promise(r => setTimeout(r, 2000));

    // 남은 프롬프트로 재주입
    const p = automationParams;
    console.log(`[Popup] 재주입: ${remaining.length}개 프롬프트`);

    // interceptor.js는 manifest content_scripts로 자동 주입됨
    // 페이지 리로드 시 document_start에서 다시 설치되므로 수동 재주입 불필요
    console.log('[Popup] 페이지 리로드 후 interceptor.js 자동 재주입됨');

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runFlowAutomation,
      args: [remaining, p.delayMs, p.shouldDownload, null, p.characterMap, p.savePath, p.sceneMap, null, p.useCustomDir, p.selectedModel, p.selectedOutputType]
    });
  } catch (error) {
    console.error('[Popup] 하드 리셋 실패:', error);
    isRunning = false;
    updateUI();
  }
}

// Event Listeners
addPromptsBtn.addEventListener('click', addPrompts);
fileInput.addEventListener('change', loadFromFile);
clearQueueBtn.addEventListener('click', clearQueue);
startBtn.addEventListener('click', startAutomation);
stopBtn.addEventListener('click', stopAutomation);

autoDownload.addEventListener('change', saveState);
delayInput.addEventListener('change', saveState);
saveLocation.addEventListener('change', saveState);
saveLocation.addEventListener('input', saveState);
resetLocationBtn.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    // Fallback: 텍스트 입력
    const current = saveLocation.value.trim() || 'flow-images';
    const newPath = prompt('저장 위치 (다운로드 폴더 기준 하위 경로)', current);
    if (newPath !== null) {
      saveLocation.value = newPath.trim() || 'flow-images';
      saveState();
    }
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });
    customDirHandle = handle;
    saveLocation.value = '\uD83D\uDCC1 ' + handle.name;
    saveLocation.readOnly = true;
    await saveDirHandle(handle);
    updateCustomDirUI();
    saveState();
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[Flow] Folder selection error:', e);
    }
  }
});

const openFolderBtn = document.getElementById('openFolderBtn');
openFolderBtn.addEventListener('click', async () => {
  if (customDirHandle) {
    // 커스텀 폴더: 권한 확인 겸 폴더 다시 열기
    try {
      const perm = await customDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        alert('저장 폴더: ' + customDirHandle.name + '\n(파일 관리자에서 직접 열어주세요)');
      } else {
        alert('폴더 접근 권한이 만료되었습니다. "위치 변경"으로 다시 선택해주세요.');
        customDirHandle = null;
        await clearDirHandle();
        saveLocation.value = 'flow-images';
        saveLocation.readOnly = false;
        saveState();
      }
    } catch (e) {
      console.error('[Flow] Permission check error:', e);
    }
    return;
  }
  const savePath = saveLocation.value.trim() || 'flow-images';
  chrome.runtime.sendMessage({ action: 'OPEN_FOLDER', savePath });
});

// 초기화 버튼 (커스텀 폴더 → 다운로드 폴더로 복귀)
const resetToDefaultBtn = document.getElementById('resetToDefaultBtn');
const saveLocationHint = document.getElementById('saveLocationHint');
resetToDefaultBtn.addEventListener('click', async () => {
  customDirHandle = null;
  await clearDirHandle();
  saveLocation.value = 'flow-images';
  saveLocation.readOnly = false;
  resetToDefaultBtn.hidden = true;
  saveLocationHint.textContent = '다운로드 폴더 기준 하위 경로 (예: flow-images)';
  saveState();
});

// 커스텀 폴더 활성화 시 UI 업데이트
function updateCustomDirUI() {
  if (customDirHandle) {
    resetToDefaultBtn.hidden = false;
    saveLocationHint.textContent = '선택된 폴더에 직접 저장됩니다';
  } else {
    resetToDefaultBtn.hidden = true;
    saveLocationHint.textContent = '다운로드 폴더 기준 하위 경로 (예: flow-images)';
  }
}
updateCustomDirUI();

// 스타일 설정 변경 시 저장
stylePrefix.addEventListener('change', saveStyleSettings);
styleSuffix.addEventListener('change', saveStyleSettings);

// 모델/출력유형 변경 시 저장
if (modelSelect) modelSelect.addEventListener('change', saveState);
if (outputType) document.getElementById('outputType').addEventListener('change', saveState);

// 템플릿 다운로드 헬퍼
function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 스타일 템플릿 다운로드
const downloadStyleTemplateBtn = document.getElementById('downloadStyleTemplateBtn');
if (downloadStyleTemplateBtn) {
  downloadStyleTemplateBtn.addEventListener('click', () => {
    const template = `# ============================================
# 프로젝트 스타일 설정 파일
# ============================================
# 이 파일을 스타일/프로젝트명/ 폴더에 style.txt로 저장하면
# 폴더 불러오기 시 자동으로 접두어/접미어가 적용됩니다.
#
# 사용법:
#   [접두어] 아래에 모든 프롬프트 앞에 붙을 스타일 텍스트 작성
#   [접미어] 아래에 모든 프롬프트 뒤에 붙을 스타일 텍스트 작성
#   # 으로 시작하는 줄은 무시됩니다
#
# 예시 (프롬프트: "a warrior on a cliff"):
#   최종 결과 = 접두어 + 프롬프트 + 접미어
#   → "Korean manhwa style, a warrior on a cliff, no text, high quality"
# ============================================

[접두어]


[접미어]

`;
    downloadTextFile('style.txt', template);
  });
}

// 캐릭터시트 프롬프트 다운로드
const downloadCharSheetBtn = document.getElementById('downloadCharSheetBtn');
if (downloadCharSheetBtn) {
  downloadCharSheetBtn.addEventListener('click', () => {
    const content = `========================================
[범용] 캐릭터 시트 - 기본 (7패널)
========================================

Professional character turnaround reference sheet, clean light gray background. High-quality Korean manhwa webtoon style digital illustration with clean outlines and vibrant coloring. Top row: 4 full-body standing views (front, left profile, right profile, back) in relaxed A-pose. Bottom row: 3 detailed portrait close-ups (front, left profile, right profile). Consistent character design, uniform lighting, clean spacing between panels. Sharp print-ready quality.


========================================
[범용] 캐릭터 시트 - 전신만 (4패널)
========================================

Professional character turnaround reference sheet, clean light gray background. High-quality Korean manhwa webtoon style digital illustration with clean outlines and vibrant coloring. 4 full-body standing views arranged side by side: front view, left side profile, right side profile, back view. Relaxed A-pose, consistent character design across all views, uniform lighting, clean spacing. Sharp print-ready quality.


========================================
[범용] 캐릭터 시트 - 얼굴만 (3패널)
========================================

Professional character portrait reference sheet, clean light gray background. High-quality Korean manhwa webtoon style digital illustration with clean outlines and vibrant coloring. 3 detailed head and shoulder portrait close-ups arranged side by side: front face, left side profile, right side profile. Consistent face design, uniform lighting, clean spacing. Sharp print-ready quality.


========================================
[범용] 캐릭터 시트 - 표정 시트
========================================

Character expression reference sheet, clean light gray background. High-quality Korean manhwa webtoon style digital illustration. 6 portrait headshots arranged in 2 rows of 3, showing different emotions: calm neutral, angry fierce, happy smiling, sad sorrowful, surprised shocked, cold determined. Same character in each panel, consistent design, uniform lighting, clean spacing.


========================================
[범용] 캐릭터 시트 - 액션 포즈
========================================

Character action pose reference sheet, clean light gray background. High-quality Korean manhwa webtoon style digital illustration with clean outlines and vibrant coloring. 4 dynamic full-body poses arranged side by side: standing ready stance, sword drawing motion, combat attack pose, defensive guard pose. Same character in each panel, consistent design, uniform lighting, clean spacing.
`;
    downloadTextFile('character_sheet_prompts.txt', content);
  });
}

// Delete button delegation
promptQueue.addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-btn')) {
    const index = parseInt(e.target.dataset.index);
    deletePrompt(index);
  }
});

// Enter key to add prompts
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    addPrompts();
  }
});

// 캐릭터 태그 클릭 시 프롬프트에 추가
characterList.addEventListener('click', (e) => {
  if (e.target.classList.contains('character-tag')) {
    const char = e.target.dataset.char;
    const cursorPos = promptInput.selectionStart;
    const text = promptInput.value;
    const tag = `[${char}] `;
    promptInput.value = text.slice(0, cursorPos) + tag + text.slice(cursorPos);
    promptInput.focus();
    promptInput.selectionStart = promptInput.selectionEnd = cursorPos + tag.length;
  }
});

// 프로젝트 탭 클릭 시 전환
projectTabs.addEventListener('click', (e) => {
  if (e.target.classList.contains('project-tab')) {
    const projectKey = e.target.dataset.project;
    switchProject(projectKey);
  }
});

// 📁 폴더에서 캐릭터 불러오기
const loadCharFolderBtn = document.getElementById('loadCharFolderBtn');
const charFolderHint = document.getElementById('charFolderHint');
const refreshCharFolderBtn = document.getElementById('refreshCharFolderBtn');

// 폴더 로드 상태 힌트 업데이트 (저장된 데이터 기반)
function updateCharFolderHint() {
  // fromFolder 캐릭터가 있으면 이미 로드된 상태
  let folderCharCount = 0;
  for (const proj of Object.values(PROJECTS)) {
    for (const char of Object.values(proj.characters || {})) {
      if (char.fromFolder) folderCharCount++;
    }
    for (const scene of Object.values(proj.scenes || {})) {
      if (scene.fromFolder) folderCharCount++;
    }
    if (proj.styleFromFolder) folderCharCount++;
  }

  if (folderCharCount > 0) {
    charFolderHint.textContent = `${folderCharCount}\uAC1C \uB85C\uB4DC\uB428 (폴더에서 가져옴)`;
  }
  refreshCharFolderBtn.hidden = false; // 항상 표시
}

loadCharFolderBtn.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    alert('\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 \uD3F4\uB354 \uC120\uD0DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.');
    return;
  }

  try {
    // 이전에 저장된 폴더가 있으면 그 위치에서 시작
    const savedHandle = await loadCharFolderHandle();
    const handle = await window.showDirectoryPicker({
      mode: 'read',
      startIn: savedHandle || 'downloads'
    });

    loadCharFolderBtn.textContent = '\uBD88\uB7EC\uC624\uB294 \uC911...';
    loadCharFolderBtn.disabled = true;

    const count = await scanCharacterFolder(handle);
    await saveCharFolderHandle(handle);
    saveState();
    renderProjectTabs();
    renderCharacterList();
    renderStyleSettings();

    loadCharFolderBtn.textContent = '\uD83D\uDCC1 \uD3F4\uB354\uC5D0\uC11C \uBD88\uB7EC\uC624\uAE30';
    loadCharFolderBtn.disabled = false;
    charFolderHint.textContent = `${count}\uAC1C \uB85C\uB4DC \uC644\uB8CC`;
    refreshCharFolderBtn.hidden = false;
  } catch (e) {
    loadCharFolderBtn.textContent = '\uD83D\uDCC1 \uD3F4\uB354\uC5D0\uC11C \uBD88\uB7EC\uC624\uAE30';
    loadCharFolderBtn.disabled = false;
    if (e.name !== 'AbortError') {
      console.error('[Flow] Character folder error:', e);
    }
  }
});

// 🔄 새로고침 버튼
refreshCharFolderBtn.addEventListener('click', async () => {
  const handle = await loadCharFolderHandle();
  if (!handle) {
    alert('\uD3F4\uB354\uB97C \uBA3C\uC800 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.');
    return;
  }

  let perm = await handle.queryPermission({ mode: 'read' });
  if (perm === 'prompt') {
    try { perm = await handle.requestPermission({ mode: 'read' }); } catch (e) { /* */ }
  }

  if (perm === 'granted') {
    refreshCharFolderBtn.textContent = '\uBD88\uB7EC\uC624\uB294 \uC911...';
    refreshCharFolderBtn.disabled = true;
    const count = await scanCharacterFolder(handle);
    saveState();
    renderProjectTabs();
    renderCharacterList();
    renderStyleSettings();
    charFolderHint.textContent = `${count}\uAC1C \uB85C\uB4DC \uC644\uB8CC`;
    refreshCharFolderBtn.textContent = '\uD83D\uDD04 \uC0C8\uB85C\uACE0\uCE68';
    refreshCharFolderBtn.disabled = false;
  } else {
    alert('\uD3F4\uB354 \uC811\uADFC \uAD8C\uD55C\uC774 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. "\uD3F4\uB354\uC5D0\uC11C \uBD88\uB7EC\uC624\uAE30"\uB85C \uB2E4\uC2DC \uC120\uD0DD\uD574\uC8FC\uC138\uC694.');
  }
});

// 프로젝트 초기화 버튼
const resetProjectsBtn = document.getElementById('resetProjectsBtn');
if (resetProjectsBtn) {
  resetProjectsBtn.addEventListener('click', async () => {
    if (!confirm('저장된 모든 프로젝트를 삭제하고 "공통"만 남깁니다.\n폴더에서 다시 불러올 수 있습니다.\n\n계속할까요?')) return;
    PROJECTS = { ...DEFAULT_PROJECTS };
    currentProject = 'common';
    await chrome.storage.local.set({ projects: PROJECTS, currentProject });
    renderProjectTabs();
    renderCharacterList();
    renderStyleSettings();
    charFolderHint.textContent = '초기화 완료. 폴더에서 불러오기로 프로젝트를 추가하세요.';
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'PROGRESS_UPDATE': {
      const adjustedIndex = completedOffset + message.currentIndex;
      const adjustedTotal = completedOffset + message.totalCount;
      currentIndex = adjustedIndex;
      if (adjustedTotal) {
        totalCountEl.textContent = adjustedTotal;
      }
      // 필터링된 인덱스를 원본 인덱스로 변환
      const origIdx = promptIndexMap.length > 0 ? promptIndexMap[message.promptIndex] : message.promptIndex;
      if (message.status && origIdx !== undefined && prompts[origIdx]) {
        prompts[origIdx].status = message.status;
      }
      // 진행 바 + 현재 프롬프트 즉시 업데이트 (offset 보정)
      if (adjustedTotal > 0) {
        const pct = (adjustedIndex / adjustedTotal) * 100;
        progressFill.style.width = `${pct}%`;
        currentIndexEl.textContent = adjustedIndex;
      }
      if (message.currentPrompt) {
        currentPromptEl.textContent = `현재: ${message.currentPrompt}`;
      }
      progressSection.hidden = false;
      saveState();
      updateUI();
      break;
    }

    case 'HARD_RESET_NEEDED':
      handleHardReset(message.completedCount);
      break;

    case 'AUTOMATION_COMPLETE':
      isRunning = false;
      updateUI();
      break;

    case 'AUTOMATION_ERROR':
      console.error('Automation error:', message.error);
      const errorOrigIdx = promptIndexMap.length > 0 ? promptIndexMap[message.promptIndex] : message.promptIndex;
      if (errorOrigIdx !== undefined && prompts[errorOrigIdx]) {
        prompts[errorOrigIdx].status = 'error';
      }
      saveState();
      updateUI();
      break;

    case 'AUTOMATION_STOPPED':
      isRunning = false;
      updateUI();
      break;

    case 'SAVE_IMAGE_DATA':
      // File System Access API로 커스텀 폴더에 저장
      (async () => {
        if (customDirHandle) {
          try {
            const dataUrl = message.dataUrl;
            const base64 = dataUrl.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const fileHandle = await customDirHandle.getFileHandle(message.filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(bytes);
            await writable.close();
            console.log('[Flow] 파일 저장 완료:', message.filename);
            return;
          } catch (e) {
            console.error('[Flow] 커스텀 폴더 저장 실패, 다운로드 폴백:', e);
          }
        }
        // 폴백: customDirHandle 없거나 저장 실패 시 chrome.downloads로 저장
        try {
          const savePath = saveLocation.value.trim() || 'flow-images';
          const fullPath = savePath.replace(/^[\uD83D\uDCC1]\s*/, '') + '/' + message.filename;
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_IMAGE',
            url: message.dataUrl,
            filename: fullPath
          });
          console.log('[Flow] 다운로드 폴백 사용:', fullPath);
        } catch (e2) {
          console.error('[Flow] 다운로드 폴백도 실패:', e2);
        }
      })();
      break;
  }
});
