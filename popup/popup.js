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
const styleUrl = document.getElementById('styleUrl');
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
const captureStyleBtn = document.getElementById('captureStyleBtn');
const characterWarning = document.getElementById('characterWarning');
const warningText = document.getElementById('warningText');

// 프로젝트별 캐릭터 정보
// CHARACTER_BASE64는 characters_base64.js에서 로드됨
function buildDefaultProjects() {
  const base64 = (typeof CHARACTER_BASE64 !== 'undefined') ? CHARACTER_BASE64 : {};

  // Base64 데이터에서 캐릭터 객체 생성
  function charFromBase64(name) {
    const data = base64[name];
    if (!data) return null;
    return { image: data.image, aliases: data.aliases || [name] };
  }

  // 용아 프로젝트 캐릭터 빌드
  const yongaChars = {};
  const yongaScenes = {};
  for (const [name, data] of Object.entries(base64)) {
    if (data.type === 'scene') {
      yongaScenes[name] = { image: data.image, aliases: data.aliases || [name] };
    } else {
      yongaChars[name] = { image: data.image, aliases: data.aliases || [name] };
    }
  }

  return {
    "common": {
      name: "공통",
      characters: {},
      scenes: {},
      inheritCommon: false,
      styleImage: "",
      stylePrefix: "",
      styleSuffix: ""
    },
    "yonga": {
      name: "용아",
      characters: yongaChars,
      scenes: yongaScenes,
      inheritCommon: true,
      styleImage: (typeof STYLE_REFERENCE_BASE64 !== 'undefined' && STYLE_REFERENCE_BASE64) || "", // 당소화 전신 스타일 레퍼런스
      stylePrefix: "Korean Wuxia Manhwa style, cel-shaded coloring, ink wash accents. ",
      styleSuffix: ". No text, no speech bubbles, no watermark, no logos."
    },
    "church": {
      name: "교회묵상",
      characters: {},
      scenes: {},
      inheritCommon: false,
      styleImage: "",
      stylePrefix: "Warm gentle watercolor illustration style, soft diffused lighting, muted purple and warm beige tones, ",
      styleSuffix: ", peaceful contemplative atmosphere. CRITICAL: Generate ONLY the visual scene with NO text whatsoever. Absolutely NO letters, NO Korean characters, NO English words, NO speech bubbles, NO sound effects text, NO captions, NO watermarks. 16:9 aspect ratio."
    }
  };
}

const DEFAULT_PROJECTS = buildDefaultProjects();

let PROJECTS = { ...DEFAULT_PROJECTS };
let currentProject = "yonga";

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

// Check connection to Whisk page
async function checkConnection() {
  try {
    // 사이드 패널에서는 lastFocusedWindow 사용
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    const url = tab?.url || '';

    console.log('[Whisk Automator] Current tab URL:', url);

    // Whisk 페이지 패턴 확인 (다양한 URL 형식 지원)
    const isWhiskPage = url.includes('labs.google') && url.includes('whisk') ||
                        url.includes('whisk.google') ||
                        url.includes('/fx/tools/whisk');

    if (isWhiskPage) {
      connectionStatus.textContent = '연결됨';
      connectionStatus.className = 'status connected';
      startBtn.disabled = prompts.length === 0;
    } else {
      connectionStatus.textContent = 'Whisk 페이지 아님';
      connectionStatus.className = 'status disconnected';
      startBtn.disabled = true;
    }
  } catch (error) {
    console.error('[Whisk Automator] Connection check error:', error);
    connectionStatus.textContent = '연결 실패';
    connectionStatus.className = 'status disconnected';
    startBtn.disabled = true;
  }
}

// IndexedDB for FileSystemDirectoryHandle persistence
function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('WhiskAutomatorHandles', 1);
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

// 폴더에서 캐릭터 스캔
// 구조: rootFolder/ → 프로젝트폴더/ → 캐릭터이미지.jpg
// 폴더 구조: whisk / 피사체|장면|스타일 / 프로젝트명 / 이미지.jpg
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
    if (proj.styleFromFolder) {
      proj.styleImage = '';
      proj.styleFromFolder = false;
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
      console.log(`[Whisk] 알 수 없는 폴더 무시: ${slotEntry.name} (NFC: ${slotName})`);
      continue;
    }
    console.log(`[Whisk] 슬롯 발견: ${slotName} → ${slotType}`);

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
          styleImage: '',
          stylePrefix: '',
          styleSuffix: ''
        };
      }

      for await (const fileEntry of projEntry.values()) {
        if (fileEntry.kind !== 'file') continue;
        const ext = fileEntry.name.substring(fileEntry.name.lastIndexOf('.')).toLowerCase();
        if (!imageExts.includes(ext)) continue;

        const name = fileEntry.name.substring(0, fileEntry.name.lastIndexOf('.'));

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
            PROJECTS[projectKey].styleImage = dataUrl;
            PROJECTS[projectKey].styleFromFolder = true;
            totalCount++;
          }
        } catch (e) {
          console.error(`[Whisk] 파일 읽기 실패: ${slotEntry.name}/${projName}/${fileEntry.name}`, e);
        }
      }
    }
  }

  console.log(`[Whisk] 폴더 스캔 결과: ${foundFolders.join(', ')}`);
  console.log(`[Whisk] 폴더에서 ${totalCount}개 로드 완료`);

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
    const result = await chrome.storage.local.get(['prompts', 'autoDownload', 'delay', 'projects', 'currentProject', 'saveLocation', 'useCustomDir']);
    if (result.prompts) {
      prompts = result.prompts;
    }
    if (result.autoDownload !== undefined) {
      autoDownload.checked = result.autoDownload;
    }
    if (result.delay) {
      delayInput.value = result.delay;
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
            styleImage: savedProj.styleImage !== undefined ? savedProj.styleImage : (defaultProj.styleImage || ''),
            stylePrefix: savedProj.stylePrefix !== undefined ? savedProj.stylePrefix : (defaultProj.stylePrefix || ''),
            styleSuffix: savedProj.styleSuffix !== undefined ? savedProj.styleSuffix : (defaultProj.styleSuffix || '')
          };
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
          const perm = await savedHandle.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted') {
            customDirHandle = savedHandle;
            saveLocation.value = '\uD83D\uDCC1 ' + savedHandle.name;
            saveLocation.readOnly = true;
          } else {
            // Permission lost, clear
            await clearDirHandle();
            saveLocation.value = 'whisk-images';
            saveLocation.readOnly = false;
          }
        }
      } catch (e) {
        console.log('[Whisk] Failed to restore directory handle:', e);
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
      projects: PROJECTS,
      currentProject: currentProject,
      saveLocation: saveLocation.value.trim() || 'whisk-images',
      useCustomDir: !!customDirHandle
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
      const activeClass = allTags.has(name) ? ' active' : '';
      return `<span class="character-tag${localClass}${activeClass}" data-char="${name}">${name}</span>`;
    }).join('');
  }
}

// Render style settings for current project
function renderStyleSettings() {
  const project = PROJECTS[currentProject];
  if (!project) return;

  styleUrl.value = project.styleImage || '';
  stylePrefix.value = project.stylePrefix || '';
  styleSuffix.value = project.styleSuffix || '';
}

// Save style settings for current project
function saveStyleSettings() {
  const project = PROJECTS[currentProject];
  if (!project) return;

  project.styleImage = styleUrl.value.trim();
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
        if (!characterMap[charName]) {
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
function buildCharacterMap() {
  const map = {};

  // 공통 캐릭터 먼저
  if (PROJECTS.common) {
    for (const [name, data] of Object.entries(PROJECTS.common.characters)) {
      map[name] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => { map[alias] = data.image; });
      }
    }
  }

  // 현재 프로젝트 캐릭터 (덮어쓰기)
  const project = PROJECTS[currentProject];
  if (project) {
    for (const [name, data] of Object.entries(project.characters)) {
      map[name] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => { map[alias] = data.image; });
      }
    }
  }

  return map;
}

// Build flat scene map for automation (name/alias -> image)
function buildSceneMap() {
  const map = {};

  // 공통 장면 먼저
  if (PROJECTS.common && PROJECTS.common.scenes) {
    for (const [name, data] of Object.entries(PROJECTS.common.scenes)) {
      map[name] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => { map[alias] = data.image; });
      }
    }
  }

  // 현재 프로젝트 장면 (덮어쓰기)
  const project = PROJECTS[currentProject];
  if (project && project.scenes) {
    for (const [name, data] of Object.entries(project.scenes)) {
      map[name] = data.image;
      if (data.aliases) {
        data.aliases.forEach(alias => { map[alias] = data.image; });
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

// Whisk에서 생성된 이미지 캡처
async function captureCharacterFromWhisk() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    // Whisk 페이지에서 이미지 캡처
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
    console.log(`[Whisk Automator] 캐릭터 저장 완료: ${name}`);
  }
}

// 스타일 이미지 캡처
async function captureStyleFromWhisk() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
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
          return { error: '이미지를 찾을 수 없습니다' };
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetImage.naturalWidth || targetImage.width;
        canvas.height = targetImage.naturalHeight || targetImage.height;
        const ctx = canvas.getContext('2d');

        try {
          ctx.drawImage(targetImage, 0, 0);
          return { dataUrl: canvas.toDataURL('image/png') };
        } catch (e) {
          return { imageUrl: targetImage.src };
        }
      }
    });

    const result = results[0]?.result;

    if (result?.error) {
      alert(result.error);
      return;
    }

    let imageData = null;
    if (result?.dataUrl) {
      imageData = result.dataUrl;
    } else if (result?.imageUrl) {
      try {
        const response = await fetch(result.imageUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        imageData = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        alert('스타일 이미지를 캡처할 수 없습니다.');
        return;
      }
    }

    if (imageData) {
      const project = PROJECTS[currentProject];
      if (project) {
        project.styleImage = imageData;
        styleUrl.value = imageData.substring(0, 50) + '... (캡처됨)';
        saveState();
        alert('스타일 이미지가 저장되었습니다!');
      }
    }
  } catch (error) {
    console.error('스타일 캡처 실패:', error);
    alert('스타일 캡처 실패: ' + error.message);
  }
}

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

// Add prompts from textarea
function addPrompts() {
  const text = promptInput.value.trim();
  if (!text) return;

  const newPrompts = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(text => ({ text, status: '' }));

  prompts.push(...newPrompts);
  promptInput.value = '';
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
    const newPrompts = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(text => ({ text, status: '' }));

    prompts.push(...newPrompts);
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

// Demo preset prompts
const DEMO_PRESETS = {
  "용아 데모 (10장)": [
    "[filename:demo_01_yonga_cliff] [용아] A young warrior sitting cross-legged on a cliff edge at sunrise, meditating with eyes closed. Wind blowing his hair and robes. Mountain peaks and sea of clouds below.",
    "[filename:demo_02_yonga_sword] [용아] A young warrior drawing a sword with his left hand in a dark bamboo forest at night. Moonlight cutting through the bamboo. Intense determined expression. Leaves falling around him.",
    "[filename:demo_03_soyeon_training] [소연] A young swordswoman mid-sword strike pose, sword creating a sharp wind arc. Fallen leaves scattering around her. Morning sunlight behind her. Fierce focused eyes.",
    "[filename:demo_04_soyeon_worried] [소연] A young swordswoman standing on a village rooftop at dusk, looking toward distant mountains with worried expression. Orange sunset behind her. Upper body portrait.",
    "[filename:demo_05_dokryeon_lotus] [독련] A dangerous beautiful woman holding a glowing violet lotus flower that emits faint mist. Seductive smile. Standing in a dark misty forest at night. Moonlight from above.",
    "[filename:demo_06_dokryeon_tree] [독련] A dangerous woman sitting elegantly on a high tree branch, looking down with a predatory smile, holding a folding fan. Dappled sunlight through leaves. Bird's eye composition.",
    "[filename:demo_07_yeomchang_battle] [염창] A muscular warrior thrusting a long spear forward with flame effects erupting from the tip. Bold battle cry expression. Dusty battlefield background with smoke.",
    "[filename:demo_08_yeomchang_defeat] [염창] A muscular warrior kneeling on broken ground, fierce but defeated eyes. His red armor is cracked and damaged, broken spear beside him. Rain falling heavily.",
    "[filename:demo_09_soso_stream] [소소] A small girl standing in a shallow stream catching fish with bare hands, big innocent happy smile. Sunny day, green forest background, sparkling water.",
    "[filename:demo_10_soso_worried] [소소] A small girl with big teary eyes, worried expression, holding someone's hand tightly. Dim candlelight interior at night. Close-up portrait."
  ]
};

// Load demo preset
function loadPreset(presetName) {
  if (isRunning) return;
  const presetPrompts = DEMO_PRESETS[presetName];
  if (!presetPrompts) return;

  const newPrompts = presetPrompts.map(text => ({ text, status: '' }));
  prompts.push(...newPrompts);
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

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  const promptTexts = pendingPrompts.map(p => p.text);
  // 원본 인덱스 매핑 (PROGRESS_UPDATE에서 올바른 프롬프트에 상태 반영)
  const indexMap = pendingPrompts.map(p => p.originalIndex);
  const delayMs = parseInt(delayInput.value) * 1000;
  const shouldDownload = autoDownload.checked;
  const savePath = saveLocation.value.trim() || 'whisk-images';
  promptIndexMap = indexMap; // PROGRESS_UPDATE 핸들러에서 사용

  // 프로젝트 스타일 설정 가져오기
  const project = PROJECTS[currentProject] || {};
  const projectStyleImage = project.styleImage || styleUrl.value.trim();
  const projectStylePrefix = project.stylePrefix || '';
  const projectStyleSuffix = project.styleSuffix || '';

  console.log('[Popup] 프로젝트 스타일:', {
    image: projectStyleImage ? '설정됨' : '없음',
    prefix: projectStylePrefix || '없음',
    suffix: projectStyleSuffix || '없음'
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

    // 2. [캐릭터] 및 [장면:...] 추출
    const charNames = [];
    let scene = null;
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
      charNames.push(charM[1]);
      cleanPrompt = cleanPrompt.replace(charRegex, '');
    }
    if (charNames.length > 0) {
      character = charNames.join(',');
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
    if (typeof PROMPT_REPLACEMENTS !== 'undefined') {
      for (const [risky, safe] of PROMPT_REPLACEMENTS) {
        finalPrompt = finalPrompt.replace(new RegExp(risky.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), safe);
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
      prompt: finalPrompt,
      originalPrompt: cleanPrompt,
      index: index
    };
  });

  // 캐릭터 조합별 그룹핑 (같은 조합끼리 모아서 분석 대기 최소화)
  // [용아] → [용아] → [소소] → [소소] → [용아,소연] → [용아,소연] → [배경]
  promptsWithCharacters.sort((a, b) => {
    const grpA = a.characterGroup || '';
    const grpB = b.characterGroup || '';
    // 캐릭터 있는 것 먼저, 같은 조합끼리 묶기, 배경은 맨 뒤
    if (grpA && !grpB) return -1;
    if (!grpA && grpB) return 1;
    if (grpA !== grpB) return grpA.localeCompare(grpB);
    return a.index - b.index; // 같은 조합 내에서는 원래 순서 유지
  });

  console.log('[Popup] 캐릭터 조합별 그룹핑:',
    promptsWithCharacters.map(p => `[씬${p.index + 1}]${p.character || '배경'}`).join(', '));

  // 캐릭터 맵 + 장면 맵 생성 (별명 포함)
  const characterMap = buildCharacterMap();
  const sceneMap = buildSceneMap();

  // 리로드 후 재개용 캐시 저장
  sortedPromptsCache = promptsWithCharacters;
  automationParams = { delayMs, shouldDownload, projectStyleImage, characterMap, savePath, sceneMap, useCustomDir: !!customDirHandle };
  completedOffset = 0;

  // 직접 스크립트 주입
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runWhiskAutomation,
      args: [promptsWithCharacters, delayMs, shouldDownload, projectStyleImage, characterMap, savePath, sceneMap, !!customDirHandle]
    });
  } catch (error) {
    console.error('[Popup] Script injection failed:', error);
    alert('스크립트 주입 실패: ' + error.message);
    isRunning = false;
    updateUI();
  }
}

// 주입될 자동화 함수
function runWhiskAutomation(promptsWithCharacters, delayMs, autoDownload, styleImageUrl, characters, savePath, scenes, useCustomDir) {
  // 중복 실행 방지
  if (window.__whiskAutoRunning) {
    console.log('[Whisk Auto] 이미 실행 중, 중복 실행 방지');
    return;
  }
  window.__whiskAutoRunning = true;

  console.log('[Whisk Auto] Starting with', promptsWithCharacters.length, 'prompts');
  console.log('[Whisk Auto] Style URL:', styleImageUrl || '없음');
  console.log('[Whisk Auto] Characters:', Object.keys(characters || {}));
  console.log('[Whisk Auto] Scenes:', Object.keys(scenes || {}));

  let currentCharacterGroup = ''; // 현재 피사체에 로드된 캐릭터 조합 (정렬된 키, ''=없음)
  let currentScene = '';           // 현재 장면 슬롯에 로드된 장면 (''=없음)
  let downloadedSrcs = new Set();  // 이미 다운로드한 이미지 src 추적
  let consecutiveFailures = 0;     // 연속 실패 카운터 (2회 연속 시 페이지 리로드)

  async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Whisk 팝업/모달 자동 닫기 (Discord 초대, 피드백 등)
  function dismissPopups() {
    // 전략 1: 오버레이/백드롭 클릭으로 닫기
    document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="modal"]').forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.5 && r.height > window.innerHeight * 0.5) {
        el.click();
        console.log('[Whisk Auto] 팝업 오버레이 클릭 닫기');
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
        console.log('[Whisk Auto] 팝업 닫기 버튼 클릭: "' + (text || aria) + '"');
      }
    });
    // 전략 3: Discord/외부 링크 팝업의 "아니오/No thanks" 버튼
    document.querySelectorAll('button, a').forEach(function(el) {
      var text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('no thanks') || text.includes('아니') || text.includes('skip') ||
          text.includes('later') || text.includes('나중에') || text.includes('dismiss')) {
        el.click();
        console.log('[Whisk Auto] 팝업 거절 버튼 클릭: "' + text + '"');
      }
    });
  }

  // 주기적으로 팝업 감시 (10초마다)
  var popupWatcher = setInterval(function() {
    if (!window.__whiskAutoRunning) {
      clearInterval(popupWatcher);
      return;
    }
    dismissPopups();
  }, 10000);

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

  // === 사이드바 헬퍼 함수 ===

  // 사이드바 요소가 있는 DOM 루트 (document, shadowRoot, 또는 iframe contentDocument)
  var sidebarRoot = document;

  // Shadow DOM을 포함한 깊은 검색
  function deepQueryAll(selector, root) {
    root = root || document;
    var results = [];

    try {
      var found = root.querySelectorAll(selector);
      for (var i = 0; i < found.length; i++) results.push(found[i]);
    } catch(e) {}

    // Shadow root 내부도 검색
    try {
      var allEls = root.querySelectorAll('*');
      for (var i = 0; i < allEls.length; i++) {
        try {
          if (allEls[i].shadowRoot) {
            var shadowResults = deepQueryAll(selector, allEls[i].shadowRoot);
            for (var j = 0; j < shadowResults.length; j++) results.push(shadowResults[j]);
          }
        } catch(e) {}
      }
    } catch(e) {}

    return results;
  }

  // "피사체" 라벨 검색 (H4뿐 아니라 span, div 등 모든 요소)
  function findSubjectLabel() {
    // 1. Light DOM - 다양한 태그에서 검색
    var selectors = 'h1,h2,h3,h4,h5,h6,span,div,label,p';
    var candidates = document.querySelectorAll(selectors);
    for (var i = 0; i < candidates.length; i++) {
      var text = candidates[i].textContent.trim();
      if (text === '피사체') {
        var rect = candidates[i].getBoundingClientRect();
        if (rect.width > 0 && rect.left >= 0) {
          return { el: candidates[i], root: document, source: 'light DOM ' + candidates[i].tagName };
        }
      }
    }

    // 2. Shadow DOM
    var shadowCandidates = deepQueryAll('h4,span,div,label');
    for (var i = 0; i < shadowCandidates.length; i++) {
      if (shadowCandidates[i].textContent.trim() === '피사체') {
        var rootNode = shadowCandidates[i].getRootNode();
        return { el: shadowCandidates[i], root: rootNode, source: 'shadow DOM' };
      }
    }

    return null;
  }

  // 사이드바 열기 (닫혀있으면 "이미지 추가" 또는 토글 버튼 클릭)
  async function openSidebar() {
    // 이미 열려있는지 확인
    var label = findSubjectLabel();
    if (label) {
      console.log('[Whisk Auto] 사이드바 이미 열림 (' + label.source + ')');
      return true;
    }

    console.log('[Whisk Auto] 사이드바 닫힌 상태, 열기 시도...');

    var buttons = document.querySelectorAll('button');

    // 전략 1: "이미지 추가" 버튼 찾기
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || '').trim();
      if (txt.includes('이미지') && txt.includes('추가')) {
        console.log('[Whisk Auto] "이미지 추가" 버튼 클릭: "' + txt + '"');
        buttons[i].click();
        await sleep(1500);
        return true;
      }
    }

    // 전략 2: 좌측 상단 검정 토글 버튼 (작은 원형, ">" 화살표)
    for (var i = 0; i < buttons.length; i++) {
      var r = buttons[i].getBoundingClientRect();
      if (r.width >= 20 && r.width <= 60 && r.height >= 20 && r.height <= 60 && r.left < 120) {
        try {
          var bg = getComputedStyle(buttons[i]).backgroundColor;
          var m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (m && Number(m[1]) < 80 && Number(m[2]) < 80 && Number(m[3]) < 80) {
            console.log('[Whisk Auto] 토글 버튼(검정) 클릭: ' + Math.round(r.width) + 'x' + Math.round(r.height) +
              ' at(' + Math.round(r.left) + ',' + Math.round(r.top) + ')');
            buttons[i].click();
            await sleep(1500);
            return true;
          }
        } catch(e) {}
      }
    }

    // 전략 3: aria-label로 찾기
    var ariaEls = document.querySelectorAll('[aria-label]');
    for (var i = 0; i < ariaEls.length; i++) {
      var ariaLabel = (ariaEls[i].getAttribute('aria-label') || '').toLowerCase();
      if (ariaLabel.includes('이미지') || ariaLabel.includes('image') ||
          ariaLabel.includes('expand') || ariaLabel.includes('open') ||
          ariaLabel.includes('panel') || ariaLabel.includes('sidebar')) {
        var r = ariaEls[i].getBoundingClientRect();
        if (r.width > 10 && r.left < 200) {
          console.log('[Whisk Auto] aria-label 토글 클릭: "' + ariaLabel + '"');
          ariaEls[i].click();
          await sleep(1500);
          return true;
        }
      }
    }

    console.log('[Whisk Auto] 사이드바 열기 실패 - 열 수 있는 버튼 미발견');
    return false;
  }

  // 페이지 구조 진단 덤프
  function dumpPageDiagnostics() {
    console.log('[Whisk Auto] === 페이지 진단 ===');
    console.log('[Whisk Auto] URL:', window.location.href.substring(0, 100));

    // headings
    var allHeadings = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
    console.log('[Whisk Auto] heading 수 (light DOM):', allHeadings.length);
    for (var i = 0; i < Math.min(allHeadings.length, 10); i++) {
      console.log('[Whisk Auto]   ' + allHeadings[i].tagName + ': ' + allHeadings[i].textContent.trim().substring(0, 40));
    }

    // Shadow roots
    var shadowCount = 0;
    var shadowHostTags = [];
    try {
      document.querySelectorAll('*').forEach(function(el) {
        if (el.shadowRoot) {
          shadowCount++;
          shadowHostTags.push(el.tagName.toLowerCase());
        }
      });
    } catch(e) {}
    console.log('[Whisk Auto] Shadow root 수:', shadowCount, shadowHostTags.length > 0 ? '호스트: ' + shadowHostTags.join(', ') : '');

    // Shadow DOM 내 heading 검색
    if (shadowCount > 0) {
      var deepH4s = deepQueryAll('h4');
      console.log('[Whisk Auto] Shadow DOM 포함 H4 수:', deepH4s.length);
      for (var i = 0; i < Math.min(deepH4s.length, 10); i++) {
        var rootType = deepH4s[i].getRootNode() === document ? 'light' : 'shadow';
        console.log('[Whisk Auto]   [' + rootType + '] ' + deepH4s[i].textContent.trim().substring(0, 40));
      }
    }

    // iframes
    var iframes = document.querySelectorAll('iframe');
    console.log('[Whisk Auto] iframe 수:', iframes.length);
    for (var i = 0; i < iframes.length; i++) {
      var src = (iframes[i].src || '').substring(0, 80);
      try {
        var iDoc = iframes[i].contentDocument;
        if (iDoc) {
          var iH4Count = iDoc.querySelectorAll('h4').length;
          console.log('[Whisk Auto]   iframe[' + i + '] h4:' + iH4Count + ' src:' + src);
        } else {
          console.log('[Whisk Auto]   iframe[' + i + '] doc:null src:' + src);
        }
      } catch(e) {
        console.log('[Whisk Auto]   iframe[' + i + '] cross-origin src:' + src);
      }
    }

    // file inputs
    var fileInputs = document.querySelectorAll('input[type="file"]');
    console.log('[Whisk Auto] file input 수:', fileInputs.length);

    // 큰 버튼
    var bigBtns = [];
    document.querySelectorAll('button, div[role="button"]').forEach(function(b) {
      var r = b.getBoundingClientRect();
      if (r.width > 80 && r.height > 80) {
        bigBtns.push(Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top));
      }
    });
    console.log('[Whisk Auto] 큰 버튼(>80px):', bigBtns.length, bigBtns.slice(0, 5).join(' | '));

    // "피사체" / "Subject" 텍스트 존재 여부
    try {
      var bodyText = document.body.innerText;
      ['피사체', 'Subject', 'subject', '장면', 'Scene', '스타일', 'Style'].forEach(function(keyword) {
        if (bodyText.indexOf(keyword) >= 0) {
          console.log('[Whisk Auto] "' + keyword + '" 텍스트 body.innerText에 존재');
        }
      });
      if (bodyText.indexOf('피사체') < 0 && bodyText.indexOf('Subject') < 0) {
        console.log('[Whisk Auto] "피사체"/"Subject" 텍스트 body.innerText에 없음');
      }
    } catch(e) {}

    // textarea
    var ta = document.querySelector('textarea');
    console.log('[Whisk Auto] textarea:', ta ? 'found (' + ta.placeholder.substring(0, 50) + ')' : 'not found');

    // 모든 버튼 (크기 무관)
    var allBtns = document.querySelectorAll('button');
    console.log('[Whisk Auto] 전체 button 수:', allBtns.length);
    allBtns.forEach(function(b, i) {
      var r = b.getBoundingClientRect();
      var txt = (b.textContent || '').trim().substring(0, 30);
      var aria = b.getAttribute('aria-label') || '';
      console.log('[Whisk Auto]   btn[' + i + '] ' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' at(' + Math.round(r.left) + ',' + Math.round(r.top) + ')' +
        (txt ? ' text:"' + txt + '"' : '') +
        (aria ? ' aria:"' + aria + '"' : ''));
    });

    // aria-label이 있는 요소들
    var ariaEls = document.querySelectorAll('[aria-label]');
    console.log('[Whisk Auto] aria-label 요소 수:', ariaEls.length);
    ariaEls.forEach(function(el, i) {
      var r = el.getBoundingClientRect();
      if (r.width > 5) {
        console.log('[Whisk Auto]   aria[' + i + '] ' + el.tagName + ' ' +
          Math.round(r.width) + 'x' + Math.round(r.height) +
          ' label:"' + el.getAttribute('aria-label').substring(0, 50) + '"');
      }
    });

    // role이 있는 요소들
    var roleEls = document.querySelectorAll('[role]');
    var roleGroups = {};
    roleEls.forEach(function(el) {
      var role = el.getAttribute('role');
      roleGroups[role] = (roleGroups[role] || 0) + 1;
    });
    console.log('[Whisk Auto] role 요소:', JSON.stringify(roleGroups));

    // 커서 pointer인 작은 요소들 (사이드바 토글 버튼 후보)
    var pointerEls = [];
    document.querySelectorAll('div, span, i, svg, a').forEach(function(el) {
      try {
        var r = el.getBoundingClientRect();
        if (r.width > 10 && r.width < 80 && r.height > 10 && r.height < 80 && r.left >= 0) {
          if (getComputedStyle(el).cursor === 'pointer') {
            pointerEls.push(el.tagName + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
              ' at(' + Math.round(r.left) + ',' + Math.round(r.top) + ')' +
              ' class:' + (typeof el.className === 'string' ? el.className.substring(0, 25) : ''));
          }
        }
      } catch(e) {}
    });
    console.log('[Whisk Auto] pointer 요소(' + pointerEls.length + '개):');
    pointerEls.slice(0, 15).forEach(function(s, i) {
      console.log('[Whisk Auto]   ptr[' + i + '] ' + s);
    });

    console.log('[Whisk Auto] === 진단 끝 ===');
  }

  // 사이드바 열기 + 라벨 대기
  async function waitForSidebar(maxWaitMs) {
    var start = Date.now();

    // 먼저 사이드바 열기 시도
    await openSidebar();

    // 라벨 대기 (열린 후 렌더링 시간 필요할 수 있음)
    while (Date.now() - start < maxWaitMs) {
      var result = findSubjectLabel();
      if (result) {
        sidebarRoot = result.root;
        console.log('[Whisk Auto] 사이드바 라벨 발견 (' + result.source + ', ' + (Date.now() - start) + 'ms)');
        return true;
      }
      await sleep(500);
    }
    console.log('[Whisk Auto] 사이드바 라벨 ' + maxWaitMs + 'ms 내 미발견');
    dumpPageDiagnostics();
    return false;
  }

  // 사이드바의 off-screen 컨테이너 찾기
  function findSidebarContainer() {
    var result = findSubjectLabel();
    if (!result) return null;

    var el = result.el.parentElement;
    for (var up = 0; up < 15; up++) {
      if (!el) break;
      var rect = el.getBoundingClientRect();
      if (rect.left < -100 && rect.width > 200) {
        console.log('[Whisk Auto] 사이드바 컨테이너 발견: 레벨' + up +
          ' left:' + Math.round(rect.left) + ' width:' + Math.round(rect.width) +
          ' tag:' + el.tagName + ' class:' + (typeof el.className === 'string' ? el.className.substring(0, 40) : ''));
        return el;
      }
      el = el.parentElement;
    }
    console.log('[Whisk Auto] 사이드바 컨테이너 미발견 (on-screen이거나 구조 불일치)');
    return null;
  }

  // 사이드바를 CSS 오버라이드로 화면에 표시
  function showSidebar(container) {
    var original = container.getAttribute('style') || '';
    var rect = container.getBoundingClientRect();

    if (rect.left >= 0) {
      console.log('[Whisk Auto] 사이드바 이미 화면에 있음');
      return { style: original, wasOnScreen: true };
    }

    // off-screen 거리만큼 오른쪽으로 이동 (translateX 사용)
    var shift = Math.abs(rect.left) + 10;
    container.style.setProperty('transform', 'translateX(' + shift + 'px)', 'important');
    container.style.setProperty('z-index', '99999', 'important');
    container.style.setProperty('overflow', 'visible', 'important');

    // 부모들의 overflow:hidden도 임시 해제
    var parents = [];
    var p = container.parentElement;
    for (var pp = 0; pp < 5; pp++) {
      if (!p) break;
      var pStyle = getComputedStyle(p);
      if (pStyle.overflow === 'hidden' || pStyle.overflowX === 'hidden') {
        parents.push({ el: p, original: p.getAttribute('style') || '' });
        p.style.setProperty('overflow', 'visible', 'important');
      }
      p = p.parentElement;
    }

    var newRect = container.getBoundingClientRect();
    console.log('[Whisk Auto] 사이드바 CSS 오버라이드: left ' + Math.round(rect.left) + ' → ' + Math.round(newRect.left));

    return { style: original, wasOnScreen: false, parents: parents };
  }

  // 사이드바 원래 상태 복원
  function hideSidebar(container, saved) {
    if (saved.wasOnScreen) return;
    if (saved.style) {
      container.setAttribute('style', saved.style);
    } else {
      container.removeAttribute('style');
    }
    // 부모 overflow도 복원
    if (saved.parents) {
      for (var i = 0; i < saved.parents.length; i++) {
        var pi = saved.parents[i];
        if (pi.original) {
          pi.el.setAttribute('style', pi.original);
        } else {
          pi.el.removeAttribute('style');
        }
      }
    }
    console.log('[Whisk Auto] 사이드바 CSS 복원');
  }

  // 위치 기반으로 섹션별 슬롯 찾기 (부모 순회 대신 Y좌표로 매칭)
  function findWhiskSlots() {
    var sections = { 'subject': [], 'scene': [], 'style': [] };
    var labelToKey = { '피사체': 'subject', '장면': 'scene', '스타일': 'style' };

    // Step 1: 섹션 라벨 위치 수집 (H4뿐 아니라 다양한 태그)
    var labelCandidates = sidebarRoot.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,label,p');
    var sectionRanges = [];

    console.log('[Whisk Auto] 라벨 후보 요소 수:', labelCandidates.length);
    var h4s = []; // 호환성 위해 유지

    for (var i = 0; i < labelCandidates.length; i++) {
      var text = labelCandidates[i].textContent.trim();
      var key = labelToKey[text];
      if (!key) continue;
      var rect = labelCandidates[i].getBoundingClientRect();
      if (rect.width === 0 || rect.left < 0) continue; // 숨겨진 요소 스킵
      // 중복 방지: 같은 key가 이미 있으면 스킵
      var dup = false;
      for (var d = 0; d < sectionRanges.length; d++) {
        if (sectionRanges[d].key === key) { dup = true; break; }
      }
      if (dup) continue;
      console.log('[Whisk Auto] 라벨 "' + text + '" (' + labelCandidates[i].tagName + ') pos:' + Math.round(rect.left) + ',' + Math.round(rect.top));
      sectionRanges.push({ key: key, top: rect.top });
    }

    sectionRanges.sort(function(a, b) { return a.top - b.top; });

    // 각 섹션의 Y 범위 설정 (다음 H4까지)
    for (var s = 0; s < sectionRanges.length; s++) {
      sectionRanges[s].end = (s + 1 < sectionRanges.length)
        ? sectionRanges[s + 1].top
        : sectionRanges[s].top + 500;
    }

    if (sectionRanges.length === 0) {
      console.log('[Whisk Auto] H4 라벨 없음 → 슬롯 검색 불가');
      return sections;
    }

    // Step 2: 모든 큰 클릭 가능 요소를 찾아서 Y 위치로 섹션에 배정
    // button, div[role=button], 그리고 cursor:pointer인 큰 div도 포함
    var allClickables = sidebarRoot.querySelectorAll('button, div[role="button"]');
    // cursor:pointer인 큰 div도 추가로 검색 (점선 테두리 업로드 영역)
    var extraClickables = [];
    sidebarRoot.querySelectorAll('div').forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.width >= 80 && r.height >= 80 && r.left >= 0) {
        try {
          var cursor = getComputedStyle(el).cursor;
          var border = getComputedStyle(el).borderStyle;
          if (cursor === 'pointer' || border === 'dashed' || border.includes('dashed')) {
            extraClickables.push(el);
          }
        } catch(e) {}
      }
    });
    // 합치기
    var combinedClickables = Array.from(allClickables).concat(extraClickables);
    console.log('[Whisk Auto] 전체 clickable 요소:', allClickables.length, '+ cursor:pointer/dashed div:', extraClickables.length);

    var matched = 0;
    for (var b = 0; b < combinedClickables.length; b++) {
      var rect = combinedClickables[b].getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80 || rect.left < 0) continue;

      var midY = rect.top + rect.height / 2;

      for (var sr = sectionRanges.length - 1; sr >= 0; sr--) {
        if (midY >= sectionRanges[sr].top && midY < sectionRanges[sr].end) {
          sections[sectionRanges[sr].key].push(combinedClickables[b]);
          matched++;
          console.log('[Whisk Auto] 슬롯 매칭: ' + combinedClickables[b].tagName +
            ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height) +
            ' at(' + Math.round(rect.left) + ',' + Math.round(rect.top) + ')' +
            ' border:' + (getComputedStyle(combinedClickables[b]).borderStyle || '-') +
            ' → ' + sectionRanges[sr].key);
          break;
        }
      }
    }

    console.log('[Whisk Auto] 섹션별 슬롯: subject=' + sections.subject.length +
      ', scene=' + sections.scene.length + ', style=' + sections.style.length +
      ' (총 매칭: ' + matched + ')');
    return sections;
  }

  // 섹션의 Y 범위 구하기
  function getSectionYRange(labelText) {
    var labelCandidates = sidebarRoot.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,label,p');
    var labelToKey = { '피사체': 'subject', '장면': 'scene', '스타일': 'style' };
    var allLabels = [];

    for (var i = 0; i < labelCandidates.length; i++) {
      var text = labelCandidates[i].textContent.trim();
      if (!labelToKey[text]) continue;
      var rect = labelCandidates[i].getBoundingClientRect();
      if (rect.width === 0 || rect.left < 0) continue;
      var dup = false;
      for (var d = 0; d < allLabels.length; d++) {
        if (allLabels[d].text === text) { dup = true; break; }
      }
      if (dup) continue;
      allLabels.push({ text: text, top: rect.top });
    }
    allLabels.sort(function(a, b) { return a.top - b.top; });

    for (var i = 0; i < allLabels.length; i++) {
      if (allLabels[i].text === labelText) {
        return {
          top: allLabels[i].top,
          end: (i + 1 < allLabels.length) ? allLabels[i + 1].top : allLabels[i].top + 500
        };
      }
    }
    return null;
  }

  // 피사체 섹션 이미지를 Y위치 순으로 가져오기
  function getSubjectImages() {
    var range = getSectionYRange('피사체');
    if (!range) return [];

    var imgs = sidebarRoot.querySelectorAll('img');
    var result = [];
    for (var i = 0; i < imgs.length; i++) {
      var ir = imgs[i].getBoundingClientRect();
      if (ir.top >= range.top && ir.top < range.end && ir.width > 50 && ir.height > 50) {
        result.push(imgs[i]);
      }
    }
    result.sort(function(a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    return result;
  }

  // 이미지의 체크마크(✓) 요소 찾기 + 체크 여부 판단
  function findCheckmarkFor(img) {
    var imgRect = img.getBoundingClientRect();
    var allSmall = sidebarRoot.querySelectorAll('button, [role="button"], div, span, svg');

    for (var j = 0; j < allSmall.length; j++) {
      var sr = allSmall[j].getBoundingClientRect();
      // 이미지 우상단의 작은 원형 요소
      if (sr.width >= 12 && sr.width <= 40 && sr.height >= 12 && sr.height <= 40 &&
          sr.top >= imgRect.top - 5 && sr.top <= imgRect.top + imgRect.height * 0.5 &&
          sr.left >= imgRect.left + imgRect.width * 0.5 && sr.left <= imgRect.right + 5) {
        var el = allSmall[j];
        var bg = '';
        try { bg = getComputedStyle(el).backgroundColor; } catch(e) {}
        var hasVisibleBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
        var hasSvg = el.tagName === 'svg' || el.tagName === 'SVG' ||
                     (el.querySelector && el.querySelector('svg, path'));
        if (hasVisibleBg || hasSvg) {
          return { el: el, checked: true };
        }
      }
    }
    return { el: null, checked: false };
  }

  // 특정 캐릭터들만 활성화 (체크마크 토글)
  // characterUploadOrder에 저장된 순서와 이미지 Y위치를 매칭
  async function setActiveCharacters(targetNames) {
    var subjectImgs = getSubjectImages();
    if (subjectImgs.length === 0) {
      console.log('[Whisk Auto] setActive: 피사체 이미지 없음');
      return false;
    }

    console.log('[Whisk Auto] setActive: 이미지 ' + subjectImgs.length + '개, 활성화 대상: ' + targetNames.join(', '));

    var changed = 0;
    for (var i = 0; i < subjectImgs.length; i++) {
      var charName = characterUploadOrder[i] || '?';
      var shouldBeChecked = false;
      for (var t = 0; t < targetNames.length; t++) {
        if (targetNames[t].trim() === charName) { shouldBeChecked = true; break; }
      }

      var checkInfo = findCheckmarkFor(subjectImgs[i]);

      if (shouldBeChecked && !checkInfo.checked) {
        // 체크 안됨 → 활성화: 이미지/래퍼 클릭
        console.log('[Whisk Auto]   ✓ ON: ' + charName + ' (index ' + i + ')');
        var clickTarget = subjectImgs[i].closest('[role="button"]') ||
                          subjectImgs[i].closest('button') || subjectImgs[i].parentElement;
        if (clickTarget) {
          simulateRealClick(clickTarget);
          changed++;
          await sleep(500);
        }
      } else if (!shouldBeChecked && checkInfo.checked) {
        // 체크됨 → 해제: 체크마크 클릭
        console.log('[Whisk Auto]   ✓ OFF: ' + charName + ' (index ' + i + ')');
        simulateRealClick(checkInfo.el);
        changed++;
        await sleep(500);
      } else {
        console.log('[Whisk Auto]   유지: ' + charName + ' (' + (checkInfo.checked ? 'ON' : 'OFF') + ')');
      }
    }

    console.log('[Whisk Auto] setActive: ' + changed + '개 변경');
    return true;
  }

  // 섹션 내 기존 이미지 모두 선택 해제 (체크마크 ✓ 클릭)
  // 해제 후 검증 → 실패 시 재시도 (최대 5회)
  // 모두 해제 실패 시 에러 throw
  async function clearSlotImages(slotName) {
    var slotToLabel = { 'subject': '피사체', 'scene': '장면', 'style': '스타일' };
    var labelText = slotToLabel[slotName];

    var totalCleared = 0;
    var maxRetries = 5;

    for (var attempt = 0; attempt < maxRetries; attempt++) {
      var range = getSectionYRange(labelText);
      if (!range) {
        console.log('[Whisk Auto] clearSlot: 섹션 ' + labelText + ' 미발견');
        return totalCleared;
      }

      // 매 시도마다 이미지 목록 새로 수집 (DOM 변경 반영)
      var imgs = sidebarRoot.querySelectorAll('img');
      var checkedImgs = [];
      for (var i = 0; i < imgs.length; i++) {
        var ir = imgs[i].getBoundingClientRect();
        if (ir.top >= range.top && ir.top < range.end && ir.width > 50 && ir.height > 50) {
          var checkInfo = findCheckmarkFor(imgs[i]);
          if (checkInfo.checked) {
            checkedImgs.push({ img: imgs[i], checkEl: checkInfo.el });
          }
        }
      }

      if (checkedImgs.length === 0) {
        if (attempt === 0) {
          console.log('[Whisk Auto] clearSlot(' + labelText + '): 체크된 이미지 없음');
        } else {
          console.log('[Whisk Auto] clearSlot(' + labelText + '): 모두 해제 완료 (시도 ' + (attempt + 1) + '회)');
        }
        return totalCleared;
      }

      console.log('[Whisk Auto] clearSlot(' + labelText + '): 체크된 이미지 ' + checkedImgs.length + '개 해제' +
        (attempt > 0 ? ' (재시도 ' + (attempt + 1) + ')' : ''));

      for (var c = 0; c < checkedImgs.length; c++) {
        // 방법 1: 체크마크 직접 클릭
        if (checkedImgs[c].checkEl) {
          simulateRealClick(checkedImgs[c].checkEl);
          totalCleared++;
          await sleep(800);
        }

        // 해제 확인
        var recheck = findCheckmarkFor(checkedImgs[c].img);
        if (recheck.checked) {
          // 방법 2: 이미지 래퍼 클릭으로 토글 시도
          console.log('[Whisk Auto]   체크마크 클릭 실패, 이미지 래퍼 클릭 시도');
          var wrapper = checkedImgs[c].img.closest('[role="button"]') ||
                        checkedImgs[c].img.closest('button') ||
                        checkedImgs[c].img.parentElement;
          if (wrapper) {
            simulateRealClick(wrapper);
            await sleep(800);
          }
        }

        // 방법 2도 실패 시 → 방법 3: 이미지 자체 클릭
        recheck = findCheckmarkFor(checkedImgs[c].img);
        if (recheck.checked) {
          console.log('[Whisk Auto]   래퍼 클릭도 실패, 이미지 직접 클릭 시도');
          simulateRealClick(checkedImgs[c].img);
          await sleep(800);
        }
      }

      await sleep(1000);
    }

    // 최종 검증: 여전히 체크된 이미지가 있으면 에러
    var finalRange = getSectionYRange(labelText);
    if (finalRange) {
      var finalImgs = sidebarRoot.querySelectorAll('img');
      var stillChecked = 0;
      for (var fi = 0; fi < finalImgs.length; fi++) {
        var fir = finalImgs[fi].getBoundingClientRect();
        if (fir.top >= finalRange.top && fir.top < finalRange.end && fir.width > 50 && fir.height > 50) {
          var fc = findCheckmarkFor(finalImgs[fi]);
          if (fc.checked) stillChecked++;
        }
      }
      if (stillChecked > 0) {
        console.error('[Whisk Auto] clearSlot(' + labelText + '): ' + stillChecked + '개 해제 실패! 페이지 새로고침 시도');
        throw new Error('캐릭터 해제 실패 (' + stillChecked + '개 남음). 재시도합니다.');
      }
    }

    console.log('[Whisk Auto] clearSlot(' + labelText + '): 총 ' + totalCleared + '개 해제 완료');
    return totalCleared;
  }

  // 섹션 헤더의 ⊕(추가) 버튼 찾기
  function findSectionAddButton(labelText) {
    var candidates = sidebarRoot.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,label,p');
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].textContent.trim() !== labelText) continue;
      var rect = candidates[i].getBoundingClientRect();
      if (rect.width === 0 || rect.left < 0) continue;

      // 라벨과 같은 줄에 있는 작은 버튼 찾기
      var allBtns = sidebarRoot.querySelectorAll('button, [role="button"], svg');
      var rowButtons = [];
      for (var b = 0; b < allBtns.length; b++) {
        var br = allBtns[b].getBoundingClientRect();
        // 같은 줄 (Y 차이 < 25), 작은 크기, 라벨 오른쪽
        if (Math.abs(br.top + br.height / 2 - rect.top - rect.height / 2) < 25 &&
            br.width >= 15 && br.width <= 50 && br.height >= 15 && br.height <= 50 &&
            br.left > rect.left) {
          rowButtons.push({ el: allBtns[b], left: br.left });
        }
      }
      // 가장 오른쪽 버튼 = ⊕ (추가 버튼)
      rowButtons.sort(function(a, b) { return a.left - b.left; });
      if (rowButtons.length > 0) {
        var addBtn = rowButtons[rowButtons.length - 1];
        console.log('[Whisk Auto] ⊕ 버튼 발견 (' + labelText + '): ' + addBtn.el.tagName +
          ' at(' + Math.round(addBtn.left) + ',' + Math.round(addBtn.el.getBoundingClientRect().top) + ')');
        return addBtn.el;
      }
    }
    console.log('[Whisk Auto] ⊕ 버튼 미발견 (' + labelText + ')');
    return null;
  }

  async function uploadImageToSlot(imageUrl, slotName, skipClear) {
    if (!imageUrl) return false;

    var slotToLabel = { 'subject': '피사체', 'scene': '장면', 'style': '스타일' };
    var labelText = slotToLabel[slotName];
    var isBase64 = imageUrl.startsWith('data:');
    console.log('[Whisk Auto] ' + slotName + '(' + labelText + ') 업로드' + (skipClear ? ' (추가)' : '') + ':', isBase64 ? 'Base64' : imageUrl.substring(0, 80));

    try {
      // Step 1: 사이드바 열기/대기
      var sidebarReady = await waitForSidebar(5000);
      if (!sidebarReady) {
        console.log('[Whisk Auto] 사이드바 미발견, 업로드 건너뜀');
        return false;
      }

      // Step 2: 기존 이미지 선택 해제 (skipClear=true면 건너뜀 - 다중 캐릭터 추가 시)
      if (!skipClear) {
        var clearedCount = await clearSlotImages(slotName);
        if (clearedCount > 0) {
          console.log('[Whisk Auto] 기존 이미지 ' + clearedCount + '개 해제');
          await sleep(1000);
          // 해제 후 사이드바가 닫힐 수 있으므로 다시 열기
          var reopened = await waitForSidebar(5000);
          if (!reopened) {
            console.log('[Whisk Auto] 해제 후 사이드바 재열기 실패, 재시도...');
            await sleep(2000);
            await waitForSidebar(5000);
          }
        }
      }

      // Step 3: 이미지 → File 객체
      var res = await fetch(imageUrl);
      var blob = await res.blob();
      var file = new File([blob], 'character.png', { type: 'image/png' });

      // Step 3: file input 가로채기 준비
      var uploadSuccess = false;

      var originalClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function() {
        if (this.type === 'file') {
          console.log('[Whisk Auto] file input click 가로채기 성공!');
          uploadSuccess = true;
          var dt = new DataTransfer();
          dt.items.add(file);
          this.files = dt.files;
          this.dispatchEvent(new Event('change', { bubbles: true }));
          HTMLInputElement.prototype.click = originalClick;
          return;
        }
        return originalClick.call(this);
      };

      var observer = new MutationObserver(function(mutations) {
        if (uploadSuccess) return;
        for (var m = 0; m < mutations.length; m++) {
          for (var n = 0; n < mutations[m].addedNodes.length; n++) {
            var node = mutations[m].addedNodes[n];
            if (node.tagName === 'INPUT' && node.type === 'file') {
              console.log('[Whisk Auto] MutationObserver: file input 감지!');
              uploadSuccess = true;
              var dt = new DataTransfer();
              dt.items.add(file);
              node.files = dt.files;
              node.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (node.querySelector) {
              var fi = node.querySelector('input[type="file"]');
              if (fi) {
                console.log('[Whisk Auto] MutationObserver: 자식 file input 감지!');
                uploadSuccess = true;
                var dt2 = new DataTransfer();
                dt2.items.add(file);
                fi.files = dt2.files;
                fi.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Step 4: 전략 A - ⊕ 버튼 클릭 (이미지가 있어도 교체 가능)
      var addBtn = findSectionAddButton(labelText);
      if (addBtn) {
        console.log('[Whisk Auto] 전략A: ⊕ 버튼 클릭');
        simulateRealClick(addBtn);
        await sleep(2000);

        if (uploadSuccess) {
          HTMLInputElement.prototype.click = originalClick;
          observer.disconnect();
          console.log('[Whisk Auto] 전략A(⊕) 성공!');
          return true;
        }
        console.log('[Whisk Auto] 전략A(⊕) 실패, 전략B로...');
      }

      // Step 5: 전략 B - 빈 슬롯 클릭 (이미지가 없는 경우)
      var sections = findWhiskSlots();
      var slots = sections[slotName] || [];
      if (slots.length > 0) {
        var targetSlot = slots[0];
        var slotRect = targetSlot.getBoundingClientRect();
        // 슬롯에 이미 이미지가 있는지 확인
        var hasImg = targetSlot.querySelector('img');
        console.log('[Whisk Auto] 전략B: 슬롯 클릭 (' + (hasImg ? '이미지 있음' : '빈 슬롯') + ')');

        if (!hasImg) {
          // 빈 슬롯 → 직접 클릭
          if (slotRect.left >= 0 && slotRect.top >= 0) {
            simulateRealClick(targetSlot);
          } else {
            targetSlot.click();
          }
          await sleep(2000);

          if (uploadSuccess) {
            HTMLInputElement.prototype.click = originalClick;
            observer.disconnect();
            console.log('[Whisk Auto] 전략B(슬롯클릭) 성공!');
            return true;
          }
        }
      }

      // Step 6: 전략 C - 드래그앤드롭
      if (slots.length > 0 && !uploadSuccess) {
        var dropTarget = slots[0];
        console.log('[Whisk Auto] 전략C: 드래그앤드롭');
        var dtDrop = new DataTransfer();
        dtDrop.items.add(file);
        dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dtDrop }));
        await sleep(100);
        dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dtDrop }));
        await sleep(100);
        dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtDrop }));
        await sleep(1500);
      }

      // 정리
      HTMLInputElement.prototype.click = originalClick;
      observer.disconnect();
      console.log('[Whisk Auto] 업로드 완료 (success=' + uploadSuccess + ')');
      return uploadSuccess;
    } catch (e) {
      console.log('[Whisk Auto] ' + slotName + ' 업로드 실패:', e.message);
      return false;
    }
  }

  // 슬롯에 에러 메시지가 표시되는지 확인 (업로드 실패 감지)
  function checkSlotError(slotName) {
    var slotToLabel = { 'subject': '피사체', 'scene': '장면', 'style': '스타일' };
    var labelText = slotToLabel[slotName];
    if (!sidebarRoot) return false;

    // 에러 메시지 패턴: "미디어를 가져오는 중에 문제가 발생했습니다" 등
    var allText = sidebarRoot.querySelectorAll('span, p, div');
    var sections = findWhiskSlots();
    var slotElements = sections[slotName] || [];

    for (var el of allText) {
      var text = el.textContent.trim();
      if (text.includes('문제가 발생') || text.includes('error') || text.includes('실패') || text.includes('problem')) {
        // 해당 슬롯 영역 내에 있는지 확인
        if (slotElements.length > 0) {
          var slotRect = slotElements[0].getBoundingClientRect();
          var elRect = el.getBoundingClientRect();
          // 슬롯 근처(위아래 100px)에 있는 에러 메시지
          if (Math.abs(elRect.top - slotRect.top) < 150) {
            console.log(`[Whisk Auto] ${slotName} 슬롯에 에러 감지: "${text}"`);
            return true;
          }
        }
      }
    }
    return false;
  }

  // 슬롯에 실제 이미지가 로드되었는지 확인
  function verifySlotHasImage(slotName) {
    var sections = findWhiskSlots();
    var slotElements = sections[slotName] || [];
    if (slotElements.length === 0) return false;

    for (var slot of slotElements) {
      var img = slot.querySelector('img');
      if (img && img.src && img.naturalWidth > 0) return true;
    }
    return false;
  }

  async function findAndFillPrompt(text) {
    // textarea 찾기
    const textarea = document.querySelector('textarea');
    if (!textarea) {
      // contenteditable 찾기
      const editable = document.querySelector('[contenteditable="true"]');
      if (editable) {
        editable.innerHTML = '';
        editable.textContent = text;
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      throw new Error('입력란을 찾을 수 없습니다');
    }

    textarea.focus();
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function findAndClickGenerate() {
    const buttons = document.querySelectorAll('button');
    let generateBtn = null;

    // 검은색/어두운 색 원형 버튼 찾기 (우측 하단 화살표 버튼)
    for (const btn of buttons) {
      const style = getComputedStyle(btn);
      const bg = style.backgroundColor;
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        // 어두운 색: r < 100, g < 100, b < 100
        if (r < 100 && g < 100 && b < 100 && btn.offsetWidth > 30) {
          generateBtn = btn;
          console.log('[Whisk Auto] 검은색 버튼 발견:', bg);
          break;
        }
      }
    }

    if (!generateBtn) {
      // 대안: 마지막 버튼 (보통 우측 하단)
      const allBtns = Array.from(buttons).filter(b => b.offsetWidth > 30 && b.offsetHeight > 30);
      if (allBtns.length > 0) {
        generateBtn = allBtns[allBtns.length - 1];
        console.log('[Whisk Auto] 마지막 버튼 사용');
      }
    }

    if (!generateBtn) {
      throw new Error('생성 버튼을 찾을 수 없습니다');
    }

    console.log('[Whisk Auto] Generate 버튼 클릭...');
    generateBtn.click();

    return true;
  }

  async function waitForGeneration() {
    console.log('[Whisk Auto] 이미지 생성 대기 (최대 30초)...');

    // 현재 이미지 src 목록 스냅샷
    const knownSrcs = new Set();
    for (const img of document.querySelectorAll('img')) {
      if (img.src) knownSrcs.add(img.src);
    }

    const maxWait = 30000;
    const pollInterval = 2000;
    let waited = 0;
    let firstDetectedAt = 0;

    while (waited < maxWait) {
      await sleep(pollInterval);
      waited += pollInterval;

      // 새 이미지 개수 확인 (Whisk은 2개 생성)
      let newCount = 0;
      const images = document.querySelectorAll('img');
      for (const img of images) {
        if (img.width > 100 && img.height > 100 &&
            img.src && !knownSrcs.has(img.src) && !downloadedSrcs.has(img.src)) {
          newCount++;
        }
      }

      // 2개 모두 렌더링 완료
      if (newCount >= 2) {
        console.log(`[Whisk Auto] 새 이미지 ${newCount}개 모두 감지 (${waited / 1000}초)`);
        return true;
      }

      // 1개만 감지 → 두 번째 이미지 추가 대기 (최대 6초)
      if (newCount >= 1 && !firstDetectedAt) {
        firstDetectedAt = waited;
        console.log(`[Whisk Auto] 첫 이미지 감지, 두 번째 대기 중... (${waited / 1000}초)`);
      }
      if (firstDetectedAt && waited - firstDetectedAt >= 6000) {
        console.log(`[Whisk Auto] 두 번째 이미지 6초 내 미감지, ${newCount}개로 진행`);
        return true;
      }
    }

    console.log('[Whisk Auto] 30초 내 새 이미지 미감지');
    return false;
  }

  async function downloadImage(promptText, index, customFilename, preGenSrcs) {
    console.log('[Whisk Auto] 다운로드 시도...');

    // Whisk은 이미지 2개를 생성 → 첫 번째만 다운로드, 나머지는 스킵
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

    // 위치 기준 정렬 (위→아래, 왼쪽→오른쪽) → 첫 번째 = Whisk 첫 번째 결과
    newImages.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      if (Math.abs(ar.top - br.top) < 20) return ar.left - br.left;
      return ar.top - br.top;
    });

    if (newImages.length > 1) {
      console.log('[Whisk Auto] 생성된 이미지 ' + newImages.length + '개 중 첫 번째만 다운로드');
    }

    // 모든 새 이미지를 "처리 완료"로 마킹 (2번째 이미지가 다음 프롬프트로 밀리는 것 방지)
    for (const img of newImages) {
      downloadedSrcs.add(img.src);
    }

    let targetImage = newImages.length > 0 ? newImages[0] : null;

    // 새 이미지가 없으면 가장 큰 이미지 사용 (fallback)
    if (!targetImage) {
      console.log('[Whisk Auto] 새 이미지 없음, 가장 큰 이미지 사용');
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
      console.log('[Whisk Auto] 이미지 발견:', targetImage.width, 'x', targetImage.height);

      // 파일명 결정: 지정된 파일명 또는 자동 생성
      let fullFilename;
      if (customFilename) {
        // Windows 금지 문자 제거 + 확장자 없으면 .png 추가
        var safeName = customFilename.replace(/[<>:"|?*]/g, '_').replace(/_+/g, '_');
        fullFilename = safeName.includes('.') ? safeName : `${safeName}.png`;
        console.log('[Whisk Auto] 지정된 파일명 사용:', fullFilename);
      } else {
        // 기존 방식: 프롬프트에서 파일명 생성
        const autoFilename = promptText
          .substring(0, 30)
          .replace(/[^a-zA-Z0-9가-힣]/g, '_')
          .replace(/_+/g, '_');
        fullFilename = `whisk_${index + 1}_${autoFilename}.png`;
      }

      const fullPath = `${savePath}/${fullFilename}`;

      // 다운로드한 이미지 src 기록 (중복 방지)
      const imageSrc = targetImage.src;
      downloadedSrcs.add(imageSrc);
      console.log('[Whisk Auto] 이미지 src 기록됨, 총', downloadedSrcs.size, '개');

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
          console.log('[Whisk Auto] 커스텀 폴더 저장 요청:', fullFilename);
        } else {
          // Blob URL → Background → chrome.downloads
          var blobUrl = URL.createObjectURL(blob);
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_IMAGE',
            url: blobUrl,
            filename: fullPath
          });
          console.log('[Whisk Auto] 다운로드 요청:', fullPath);
        }
        return true;
      } catch (e) {
        console.log('[Whisk Auto] fetch 다운로드 실패, 직접 요청 시도');
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

    console.log('[Whisk Auto] 다운로드할 이미지를 찾지 못함');
    return false;
  }

  async function run() {
    // 스타일 이미지 설정 (한 번만, 분석 대기는 첫 캐릭터와 함께)
    var styleUploaded = false;
    if (styleImageUrl) {
      var styleResult = await uploadImageToSlot(styleImageUrl, 'style');
      if (!styleResult) {
        console.log('[Whisk Auto] 스타일 업로드 실패, 3초 후 재시도...');
        await sleep(3000);
        styleResult = await uploadImageToSlot(styleImageUrl, 'style');
      }
      if (!styleResult) {
        console.error('[Whisk Auto] 스타일 업로드 2회 실패, 자동화 중단');
        window.__whiskAutoRunning = false;
        clearInterval(popupWatcher);
        try {
          chrome.runtime.sendMessage({ action: 'AUTOMATION_ERROR', error: '스타일 이미지 업로드 실패 — 페이지 상태를 확인해주세요' });
        } catch(e) {}
        alert('스타일 이미지 업로드에 실패했습니다. 페이지를 확인 후 다시 시작해주세요.');
        return;
      }
      styleUploaded = true;
      console.log('[Whisk Auto] 스타일 이미지 업로드 완료 (분석은 캐릭터와 함께 대기)');
    }

    for (let i = 0; i < promptsWithCharacters.length; i++) {
      const item = promptsWithCharacters[i];
      const prompt = item.prompt;
      const character = item.character;
      const customFilename = item.filename;  // 지정된 파일명

      const origIndex = item.index; // 원래 씬 번호 (캐릭터별 그룹핑 전 순서)
      const logPrefix = [
        `[씬${origIndex + 1}]`,
        customFilename ? `[${customFilename}]` : '',
        character ? `[${character}]` : '[배경]'
      ].filter(Boolean).join(' ');

      console.log(`[Whisk Auto] ${i + 1}/${promptsWithCharacters.length}: ${logPrefix} ${prompt}`);

      // 진행 상황을 팝업으로 전달
      try {
        chrome.runtime.sendMessage({
          action: 'PROGRESS_UPDATE',
          currentIndex: i,
          totalCount: promptsWithCharacters.length,
          promptIndex: origIndex,
          status: 'processing',
          currentPrompt: logPrefix
        });
      } catch(e) {}

      const MAX_RETRIES = 3;
      let retryCount = 0;
      let success = false;

      while (retryCount <= MAX_RETRIES && !success) {
        try {
          const charGroup = item.characterGroup || ''; // 정렬된 캐릭터 조합 키

          // 캐릭터 조합이 바뀌었는지 확인 (재시도 시 이미 같은 캐릭터이므로 자연스럽게 건너뜀)
          if (charGroup !== currentCharacterGroup) {
            // 1. 기존 피사체 모두 해제
            if (currentCharacterGroup) {
              console.log(`[Whisk Auto] 피사체 전환: ${currentCharacterGroup} → ${charGroup || '배경'}`);
              await clearSlotImages('subject');
              await sleep(1500);
              // 해제 후 사이드바가 닫힐 수 있으므로 다시 확인
              await waitForSidebar(5000);
            }

            // 2. 새 캐릭터 조합 업로드 (배경이면 비우기만)
            if (charGroup && characters) {
              var charNames = charGroup.split(',');
              console.log(`[Whisk Auto] 캐릭터 ${charNames.length}명 빠른 업로드: ${charNames.join(', ')}`);

              // 모든 캐릭터 빠르게 업로드 (개별 분석 대기 없음)
              for (var ci = 0; ci < charNames.length; ci++) {
                var charName = charNames[ci].trim();
                var charImageUrl = characters[charName];
                if (!charImageUrl) {
                  console.log(`[Whisk Auto] 캐릭터 "${charName}" 이미지 미등록, 건너뜀`);
                  continue;
                }

                console.log(`[Whisk Auto] [${ci + 1}/${charNames.length}] ${charName} 업로드...`);
                // 첫 번째 캐릭터만 기존 이미지 해제, 나머지는 추가
                var charUploadOk = await uploadImageToSlot(charImageUrl, 'subject', ci > 0);
                await sleep(1500); // 업로드 UI 반응 대기만 (분석 대기 X)

                // 업로드 후 에러 확인
                if (!charUploadOk || checkSlotError('subject')) {
                  console.log(`[Whisk Auto] 피사체 업로드 실패 감지, 재시도...`);
                  await sleep(2000);
                  await uploadImageToSlot(charImageUrl, 'subject', ci > 0);
                  await sleep(1500);
                  if (checkSlotError('subject')) {
                    throw new Error(`캐릭터 "${charName}" 업로드 실패 — 슬롯 에러`);
                  }
                }
              }

              // 모든 업로드 완료 후 한번만 분석 대기
              var waitTime = styleUploaded ? 8000 : 7000; // 스타일도 처음이면 좀 더 대기
              console.log(`[Whisk Auto] 전체 분석 대기 (${waitTime / 1000}초)...`);
              await sleep(waitTime);
              styleUploaded = false; // 스타일은 한번만 추가 대기
              console.log('[Whisk Auto] 분석 완료, 생성 시작');
            }

            currentCharacterGroup = charGroup;
          }

          // --- 장면(Scene) 슬롯 전환 ---
          const sceneTag = item.scene || '';
          if (sceneTag !== currentScene) {
            const sceneImageUrl = scenes ? scenes[sceneTag] : null;

            if (sceneTag && sceneImageUrl) {
              console.log(`[Whisk Auto] 장면 전환: ${currentScene || '없음'} → ${sceneTag}`);
              var sceneUploadOk = await uploadImageToSlot(sceneImageUrl, 'scene');
              await sleep(2000); // 장면 분석 대기

              // 업로드 후 에러 확인
              if (!sceneUploadOk || checkSlotError('scene')) {
                console.log(`[Whisk Auto] 장면 업로드 실패 감지, 재시도...`);
                await sleep(2000);
                await uploadImageToSlot(sceneImageUrl, 'scene');
                await sleep(2000);
                if (checkSlotError('scene')) {
                  throw new Error(`장면 "${sceneTag}" 업로드 실패 — 슬롯 에러`);
                }
              }
            } else if (!sceneTag && currentScene) {
              // 장면 태그 없으면 장면 슬롯 비우기
              console.log(`[Whisk Auto] 장면 해제: ${currentScene} → 없음`);
              await clearSlotImages('scene');
              await sleep(500);
            } else if (sceneTag && !sceneImageUrl) {
              console.log(`[Whisk Auto] 장면 "${sceneTag}" 이미지 미등록, 건너뜀`);
            }

            currentScene = sceneTag;
          }

          await findAndFillPrompt(prompt);
          await sleep(500);

          // 생성 전 이미지 src 스냅샷 (레퍼런스 이미지 포함)
          var preGenSrcs = new Set();
          document.querySelectorAll('img').forEach(function(img) {
            if (img.src) preGenSrcs.add(img.src);
          });

          await findAndClickGenerate();
          await sleep(2000);

          await waitForGeneration();

          // 자동 다운로드 (원래 씬 번호로 저장)
          if (autoDownload) {
            await sleep(1000);
            const downloaded = await downloadImage(prompt, origIndex, customFilename, preGenSrcs);
            if (!downloaded && retryCount < MAX_RETRIES) {
              throw new Error('이미지 다운로드 실패');
            }
          }

          success = true;
          consecutiveFailures = 0;  // 성공 시 연속 실패 카운터 리셋
          console.log(`[Whisk Auto] ${i + 1} 완료 (씬${origIndex + 1})`);

          // 완료 진행 상황 전달
          try {
            chrome.runtime.sendMessage({
              action: 'PROGRESS_UPDATE',
              currentIndex: i + 1,
              totalCount: promptsWithCharacters.length,
              promptIndex: origIndex,
              status: 'completed',
              currentPrompt: logPrefix + ' ✅'
            });
          } catch(e) {}

          if (i < promptsWithCharacters.length - 1) {
            console.log(`[Whisk Auto] ${delayMs}ms 대기...`);
            await sleep(delayMs);
          }
        } catch (error) {
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            console.log(`[Whisk Auto] 재시도 ${retryCount}/${MAX_RETRIES} (씬${origIndex + 1})... ${error.message}`);
            // 캐릭터 해제 실패 시 캐릭터 그룹 리셋 → 다음 시도에서 다시 전환
            if (error.message.includes('캐릭터 해제 실패')) {
              currentCharacterGroup = '__reset__';
              console.log('[Whisk Auto] 캐릭터 그룹 리셋, 다음 시도에서 재전환');
            }
            await sleep(3000 * retryCount); // 3초, 6초, 9초 대기
          } else {
            console.error(`[Whisk Auto] ${MAX_RETRIES}회 재시도 실패 (씬${origIndex + 1}):`, error);
            currentCharacterGroup = '__reset__';
            consecutiveFailures++;

            // 연속 2회 실패 시 페이지 리로드로 복구 시도
            if (consecutiveFailures >= 2 && i < promptsWithCharacters.length - 1) {
              console.log(`[Whisk Auto] === 연속 ${consecutiveFailures}회 실패, 페이지 리로드 요청 ===`);
              window.__whiskAutoRunning = false;
              clearInterval(popupWatcher);
              try {
                chrome.runtime.sendMessage({
                  action: 'HARD_RESET_NEEDED',
                  completedCount: i + 1,
                });
              } catch(e) {}
              return;
            }
          }
        }
      }
    }

    console.log('[Whisk Auto] 모든 프롬프트 완료!');
    window.__whiskAutoRunning = false;
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
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];

    await chrome.tabs.sendMessage(tab.id, {
      action: 'STOP_AUTOMATION'
    });
  } catch (error) {
    console.error('Failed to stop automation:', error);
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
    console.log('[Popup] Whisk UI 요소 감지 대기 (최대 20초)...');
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
          console.log(`[Popup] Whisk UI 준비 완료 (${waited / 1000}초, 버튼 ${check.buttonCount}개)`);
          uiReady = true;
          break;
        }
        console.log(`[Popup] UI 미준비 (${waited / 1000}초): input=${check?.hasInput}, buttons=${check?.buttonCount}`);
      } catch (e) {
        console.log(`[Popup] UI 확인 실패 (${waited / 1000}초): ${e.message}`);
      }
    }

    if (!uiReady) {
      console.warn('[Popup] 20초 내 Whisk UI 미감지, 그래도 재주입 시도');
    }

    // 추가 안정화 대기 (UI 렌더링 완료)
    await new Promise(r => setTimeout(r, 2000));

    // 남은 프롬프트로 재주입
    const p = automationParams;
    console.log(`[Popup] 재주입: ${remaining.length}개 프롬프트`);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runWhiskAutomation,
      args: [remaining, p.delayMs, p.shouldDownload, p.projectStyleImage, p.characterMap, p.savePath, p.sceneMap, p.useCustomDir]
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
    const current = saveLocation.value.trim() || 'whisk-images';
    const newPath = prompt('저장 위치 (다운로드 폴더 기준 하위 경로)', current);
    if (newPath !== null) {
      saveLocation.value = newPath.trim() || 'whisk-images';
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
      console.error('[Whisk] Folder selection error:', e);
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
        saveLocation.value = 'whisk-images';
        saveLocation.readOnly = false;
        saveState();
      }
    } catch (e) {
      console.error('[Whisk] Permission check error:', e);
    }
    return;
  }
  const savePath = saveLocation.value.trim() || 'whisk-images';
  chrome.runtime.sendMessage({ action: 'OPEN_FOLDER', savePath });
});

// 초기화 버튼 (커스텀 폴더 → 다운로드 폴더로 복귀)
const resetToDefaultBtn = document.getElementById('resetToDefaultBtn');
const saveLocationHint = document.getElementById('saveLocationHint');
resetToDefaultBtn.addEventListener('click', async () => {
  customDirHandle = null;
  await clearDirHandle();
  saveLocation.value = 'whisk-images';
  saveLocation.readOnly = false;
  resetToDefaultBtn.hidden = true;
  saveLocationHint.textContent = '다운로드 폴더 기준 하위 경로 (예: whisk-images)';
  saveState();
});

// 커스텀 폴더 활성화 시 UI 업데이트
function updateCustomDirUI() {
  if (customDirHandle) {
    resetToDefaultBtn.hidden = false;
    saveLocationHint.textContent = '선택된 폴더에 직접 저장됩니다';
  } else {
    resetToDefaultBtn.hidden = true;
    saveLocationHint.textContent = '다운로드 폴더 기준 하위 경로 (예: whisk-images)';
  }
}
updateCustomDirUI();

// 스타일 설정 변경 시 저장
styleUrl.addEventListener('change', saveStyleSettings);
stylePrefix.addEventListener('change', saveStyleSettings);
styleSuffix.addEventListener('change', saveStyleSettings);

// 스타일 이미지 캡처
captureStyleBtn.addEventListener('click', captureStyleFromWhisk);

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
      console.error('[Whisk] Character folder error:', e);
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
      if (customDirHandle) {
        (async () => {
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
            console.log('[Whisk] 파일 저장 완료:', message.filename);
          } catch (e) {
            console.error('[Whisk] 파일 저장 실패:', e);
          }
        })();
      }
      break;
  }
});
