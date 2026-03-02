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
const charFlowTagInput = document.getElementById('charFlowTagInput');
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

// 현재 사용자 tier (전역)
let currentTier = 'free';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();

  // License check
  const licenseResult = await checkLicense();
  currentTier = licenseResult.tier || 'free';

  // 항상 메인 UI 진입 (Free든 Pro든)
  showMainUI(licenseResult);

  await checkConnection();
  updateUI();
  // 커스텀 폴더 UI 상태 반영
  if (typeof updateCustomDirUI === 'function') updateCustomDirUI();
  if (typeof updateCharFolderHint === 'function') updateCharFolderHint();

  // 테스트 모드 체크 상태 복원 + 변경 시 저장
  const testModeCheck = document.getElementById('testModeCheck');
  if (testModeCheck) {
    chrome.storage.local.get('testMode', (result) => {
      testModeCheck.checked = !!result.testMode;
    });
    testModeCheck.addEventListener('change', () => {
      chrome.storage.local.set({ testMode: testModeCheck.checked });
    });
  }
});

// License UI functions
function showMainUI(licenseResult) {
  window.licenseValid = true;
  currentTier = licenseResult.tier || 'free';

  document.getElementById('loginScreen').hidden = true;
  document.getElementById('mainContainer').hidden = false;

  updateLicenseBar(licenseResult);
  updateGrokAccess();
}

function updateLicenseBar(licenseResult) {
  const statusEl = document.getElementById('licenseStatus');
  const logoutBtn = document.getElementById('logoutBtn');
  const upgradeBtn = document.getElementById('upgradeBtn');
  const manageSubBtn = document.getElementById('manageSubBtn');
  const licenseBar = document.getElementById('licenseBar');

  if (licenseResult.device_conflict) {
    statusEl.textContent = '다른 기기에서 로그인되어 로그아웃됨';
    licenseBar.className = 'license-bar license-bar-warning';
    logoutBtn.hidden = true;
    upgradeBtn.hidden = true;
    manageSubBtn.hidden = true;
    return;
  }

  if (licenseResult.tier === 'pro' && licenseResult.cancel_at_period_end) {
    // Pro 사용자 (취소 예정)
    const expiry = licenseResult.expires ? formatExpiryShort(licenseResult.expires) : '';
    statusEl.textContent = `Pro · ${expiry ? expiry + '에 만료됩니다' : '취소 예정'}`;
    licenseBar.className = 'license-bar license-bar-cancel';
    logoutBtn.hidden = false;
    upgradeBtn.hidden = true;
    manageSubBtn.hidden = true;
  } else if (licenseResult.tier === 'pro') {
    // Pro 사용자 (활성)
    const email = licenseResult.email || '';
    const expiry = licenseResult.expires ? formatExpiryShort(licenseResult.expires) : '';
    statusEl.textContent = `Pro · ${email}${expiry ? ' · ' + expiry + '까지' : ''}`;
    licenseBar.className = 'license-bar license-bar-pro';
    logoutBtn.hidden = false;
    upgradeBtn.hidden = true;
    manageSubBtn.hidden = false;
  } else if (licenseResult.email) {
    // 로그인한 Free 사용자
    const remaining = licenseResult.daily_remaining != null
      ? licenseResult.daily_remaining
      : FREE_DAILY_LIMIT;
    const used = FREE_DAILY_LIMIT - remaining;
    statusEl.textContent = `무료 · ${licenseResult.email} · 오늘 ${used}/${FREE_DAILY_LIMIT}장`;
    licenseBar.className = 'license-bar license-bar-free';
    logoutBtn.hidden = false;
    upgradeBtn.hidden = false;
    manageSubBtn.hidden = true;
  } else {
    // 비로그인 Free 사용자
    const remaining = licenseResult.daily_remaining != null
      ? licenseResult.daily_remaining
      : FREE_DAILY_LIMIT;
    const used = FREE_DAILY_LIMIT - remaining;
    statusEl.textContent = `무료 · 오늘 ${used}/${FREE_DAILY_LIMIT}장 사용`;
    licenseBar.className = 'license-bar license-bar-free';
    logoutBtn.hidden = true;
    upgradeBtn.hidden = false;
    manageSubBtn.hidden = true;
  }
}

function updateGrokAccess() {
  const grokTab = document.getElementById('modeTabGrok');
  if (currentTier !== 'pro') {
    grokTab.classList.add('tab-locked');
    grokTab.title = 'Pro 전용 기능';
  } else {
    grokTab.classList.remove('tab-locked');
    grokTab.title = '';
  }
}

async function refreshLicenseBar() {
  const licenseResult = await checkLicense();
  currentTier = licenseResult.tier || 'free';
  updateLicenseBar(licenseResult);
  updateGrokAccess();
}

function showLoginScreen() {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('mainContainer').hidden = true;
  setupLoginHandlers();
}

// OTP 로그인 핸들러 (1회만 등록)
let loginHandlersSetup = false;
function setupLoginHandlers() {
  if (loginHandlersSetup) return;
  loginHandlersSetup = true;

  const emailInput = document.getElementById('otpEmailInput');
  const sendBtn = document.getElementById('sendOtpBtn');
  const codeInput = document.getElementById('otpCodeInput');
  const verifyBtn = document.getElementById('verifyOtpBtn');
  const backBtn = document.getElementById('otpBackBtn');
  const skipBtn = document.getElementById('skipLoginBtn');
  const errorEl = document.getElementById('otpError');
  const step1 = document.getElementById('otpStep1');
  const step2 = document.getElementById('otpStep2');
  const sentMsg = document.getElementById('otpSentMsg');

  // Step 1: 인증코드 발송
  sendBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      errorEl.textContent = '올바른 이메일 주소를 입력해주세요';
      errorEl.hidden = false;
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = '발송 중...';
    errorEl.hidden = true;

    try {
      await sendOtp(email);
      step1.hidden = true;
      step2.hidden = false;
      sentMsg.textContent = `${email}로 인증 코드를 보냈습니다`;
      codeInput.focus();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = '인증코드 발송';
    }
  });

  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn.click();
  });

  // Step 2: OTP 검증
  verifyBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const code = codeInput.value.trim();
    if (!code || code.length !== 6) {
      errorEl.textContent = '6자리 인증 코드를 입력해주세요';
      errorEl.hidden = false;
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = '확인 중...';
    errorEl.hidden = true;

    try {
      await verifyOtp(email, code);
      const licenseResult = await checkLicense();
      showMainUI(licenseResult);
      await checkConnection();
      updateUI();
      if (typeof updateCustomDirUI === 'function') updateCustomDirUI();
      if (typeof updateCharFolderHint === 'function') updateCharFolderHint();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = '확인';
    }
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyBtn.click();
  });

  // 숫자만 입력
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/[^0-9]/g, '').slice(0, 6);
    errorEl.hidden = true;
  });

  // 뒤로가기
  backBtn.addEventListener('click', () => {
    step1.hidden = false;
    step2.hidden = true;
    codeInput.value = '';
    errorEl.hidden = true;
  });

  // 무료 계속 사용
  skipBtn.addEventListener('click', async () => {
    const licenseResult = await checkLicense();
    showMainUI(licenseResult);
    await checkConnection();
    updateUI();
    if (typeof updateCustomDirUI === 'function') updateCustomDirUI();
    if (typeof updateCharFolderHint === 'function') updateCharFolderHint();
  });
}

// 로그아웃 버튼
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await signOut();
  currentTier = 'free';
  const licenseResult = await checkLicense();
  updateLicenseBar(licenseResult);
  updateGrokAccess();
});

// 결제 페이지 URL (Vercel 배포 후 실제 URL로 교체)
// TODO: 배포 후 실제 URL로 교체
const PAYMENT_PAGE_URL = 'https://whisk-payment.vercel.app';
const CANCEL_SUB_URL = `${SUPABASE_URL}/functions/v1/cancel-subscription`;

// Pro 업그레이드 버튼
document.getElementById('upgradeBtn')?.addEventListener('click', async () => {
  const email = await getAuthEmail();
  if (!email) {
    // 비로그인 → 먼저 로그인
    showLoginScreen();
    return;
  }
  // 로그인 Free → 결제 페이지로 이동
  const userId = await getAuthUserId();
  const token = await getAccessToken();
  const paymentUrl = `${PAYMENT_PAGE_URL}?userId=${userId}&email=${encodeURIComponent(email)}&token=${token}`;
  chrome.tabs.create({ url: paymentUrl });
});

// 구독 관리 버튼
document.getElementById('manageSubBtn')?.addEventListener('click', async () => {
  if (!confirm('구독을 취소하시겠습니까?\n\n취소 후에도 현재 구독 기간이 끝날 때까지 Pro를 이용할 수 있습니다.')) {
    return;
  }
  try {
    const token = await getAccessToken();
    const res = await fetch(CANCEL_SUB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (data.success) {
      alert('구독이 취소되었습니다.\n기간 만료까지 Pro를 이용할 수 있습니다.');
      // 캐시 무시하고 라이선스 새로 체크
      await chrome.storage.local.remove(LICENSE_CACHE_KEY);
      await refreshLicenseBar();
    } else {
      alert(data.error || '구독 취소에 실패했습니다.');
    }
  } catch (err) {
    alert('구독 취소 중 오류가 발생했습니다.');
    console.error('[Subscription] Cancel error:', err);
  }
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

        const rawName = fileEntry.name.substring(0, fileEntry.name.lastIndexOf('.')).normalize('NFC');
        // 파일명에 #태그 포함 시 분리: "용아#yonga.png" → name="용아", flowTag="#yonga"
        var name = rawName;
        var fileFlowTag = null;
        var hashIdx = rawName.indexOf('#');
        if (hashIdx > 0) {
          name = rawName.substring(0, hashIdx).trim();
          fileFlowTag = '#' + rawName.substring(hashIdx + 1).trim();
        }

        try {
          const file = await fileEntry.getFile();
          const dataUrl = await readFileAsDataUrl(file);

          if (slotType === 'characters') {
            PROJECTS[projectKey].characters[name] = {
              image: dataUrl,
              aliases: [name],
              flowTag: fileFlowTag,
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
      const tagSuffix = char.flowTag ? ` <small style="opacity:0.6">${char.flowTag}</small>` : '';
      return `<span class="character-tag${localClass}${activeClass}" data-char="${name}">${name}${tagSuffix}</span>`;
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
// flowTagMap: 캐릭터 이름 → Flow 태그 (에셋 검색용 영문명)
function buildCharacterMap() {
  const map = {};
  const flowTagMap = {};

  function addCharacter(name, data) {
    map[name] = data.image;
    map[name.normalize('NFC')] = data.image;
    if (data.flowTag) {
      flowTagMap[name] = data.flowTag;
      flowTagMap[name.normalize('NFC')] = data.flowTag;
    }
    if (data.aliases) {
      data.aliases.forEach(alias => {
        map[alias] = data.image;
        map[alias.normalize('NFC')] = data.image;
        if (data.flowTag) {
          flowTagMap[alias] = data.flowTag;
          flowTagMap[alias.normalize('NFC')] = data.flowTag;
        }
      });
    }
  }

  // 공통 캐릭터 먼저
  if (PROJECTS.common) {
    for (const [name, data] of Object.entries(PROJECTS.common.characters)) {
      addCharacter(name, data);
    }
  }

  // 현재 프로젝트 캐릭터 (덮어쓰기)
  const project = PROJECTS[currentProject];
  if (project) {
    for (const [name, data] of Object.entries(project.characters)) {
      addCharacter(name, data);
    }
  }

  map.__flowTagMap = flowTagMap;
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
    charFlowTagInput.value = '';
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

  // Flow 태그 (영문, # 접두어 자동 추가)
  let flowTag = (charFlowTagInput.value || '').trim();
  if (flowTag && !flowTag.startsWith('#')) flowTag = '#' + flowTag;

  const project = PROJECTS[currentProject];
  if (project) {
    project.characters[name] = {
      image: capturedImageData,  // Base64 데이터
      aliases: aliases,
      flowTag: flowTag || null,
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

  // Free 한도 체크
  const genCheck = await canGenerate(pendingPrompts.length);
  if (!genCheck.allowed) {
    alert(genCheck.message + '\n\n이메일 로그인으로 Pro 업그레이드하면 무제한 사용 가능합니다.');
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

    // 3. 스타일 접두어/접미어 적용 (원본 프롬프트를 앞에 배치하여 텍스트 매칭 정확도 향상)
    let finalPrompt = cleanPrompt;
    if (projectStylePrefix && !cleanPrompt.toLowerCase().includes(projectStylePrefix.toLowerCase().trim())) {
      finalPrompt = finalPrompt + ', ' + projectStylePrefix.trim();
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

  // 정렬 제거: 매 프롬프트마다 에셋을 재선택하므로 그룹핑 불필요
  // 원래 프롬프트 순서 유지 → 제출 순서 = 원래 순서 = 파일명 순서
  console.log('[Popup] 프롬프트 순서 (원본 유지):',
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
  var assetSrcs = new Set();        // 에셋 이미지 src 추적 (다운로드/완료 감지에서 제외)
  // selectedAssetChars 제거됨: Flow는 생성 후 프롬프트를 초기화하므로 매번 에셋 재선택 필요
  // uploadedAssetNames가 업로드 중복만 방지 (selectAssetByName은 매번 호출)
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
        simulateRealClick(el);
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
        simulateRealClick(btn);
        console.log('[Flow Auto] 팝업 닫기 버튼 클릭: "' + (text || aria) + '"');
      }
    });
    // 전략 3: 팝업/모달 내부의 거절 버튼만 클릭 (일반 UI 버튼 오탐 방지)
    document.querySelectorAll('[class*="overlay"] button, [class*="modal"] button, [class*="dialog"] button, [role="dialog"] button').forEach(function(el) {
      var text = (el.textContent || '').trim().toLowerCase();
      if (text.includes('no thanks') || text.includes('아니') || text.includes('skip') ||
          text.includes('later') || text.includes('나중에') || text.includes('dismiss')) {
        simulateRealClick(el);
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
          simulateRealClick(closeBtn);
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

  // 0. Slate.js 에디터 내부 구조 덤프 (디버그용)
  // MAIN world의 interceptor.js로 위임 (CSP 우회)
  function dumpSlateEditor() {
    console.log('[Flow Auto] Slate 디버그 트리거 (data-slate-debug=dump)');
    document.documentElement.setAttribute('data-slate-debug', 'dump');
    // 결과 대기 (MAIN world에서 비동기로 처리)
  }

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

  // 1-1. 프롬프트 내 실제 레퍼런스 이미지 수 카운트
  // Slate.js는 기본적으로 [contenteditable="false"] 요소가 1개 존재하므로
  // void 노드 수만으로는 레퍼런스 유무를 판별할 수 없음.
  // 반드시 void 내부의 img 태그 존재 + 크기 > 10px로 실제 레퍼런스만 카운트.
  function countRefImages(promptEl) {
    if (!promptEl) return 0;
    var imgs = promptEl.querySelectorAll('[contenteditable="false"] img, [data-slate-void] img');
    var count = 0;
    for (var i = 0; i < imgs.length; i++) {
      var rect = imgs[i].getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) count++;
    }
    // 넓은 범위 검색: promptEl 근처(부모 포함)의 모든 이미지도 체크
    var parent = promptEl.closest('[data-testid], form, [role="form"]') || promptEl.parentElement;
    if (parent && parent !== promptEl) {
      var parentImgs = parent.querySelectorAll('img');
      var parentCount = 0;
      for (var j = 0; j < parentImgs.length; j++) {
        var pRect = parentImgs[j].getBoundingClientRect();
        if (pRect.width > 20 && pRect.height > 20) parentCount++;
      }
      if (parentCount > count) {
        console.log('[Flow Auto] ref 카운트 보정: promptEl 내 ' + count + '개, 부모 영역 ' + parentCount + '개');
        count = parentCount;
      }
    }
    return count;
  }

  // 2. InputEvent(beforeinput) 방식으로 Slate.js에 텍스트 입력
  async function fillPrompt(text) {
    var promptEl = findPromptInput();
    promptEl.focus();
    await sleep(200);

    // 레퍼런스 썸네일 보존: 실제 이미지가 있는 void만 카운트
    var voidsBefore = countRefImages(promptEl);

    // 방법 1: Ctrl+A 대신 텍스트 끝으로 이동 후 Shift+Home으로 텍스트만 선택
    // 방법 2: Slate 텍스트 노드만 직접 선택
    var slateTexts = promptEl.querySelectorAll('[data-slate-string="true"]');

    var sel = window.getSelection();
    var range = document.createRange();

    if (slateTexts.length > 0 && voidsBefore > 0) {
      // 레퍼런스가 있는 경우: 텍스트 노드 내용만 선택 (void 노드 제외)
      // 마지막 텍스트 노드의 내용만 선택 (보통 프롬프트 텍스트는 void 뒤에 위치)
      var lastText = slateTexts[slateTexts.length - 1];
      var textNode = lastText.firstChild || lastText;
      if (textNode.nodeType === 3) {
        range.selectNodeContents(textNode);
      } else {
        range.selectNodeContents(lastText);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      console.log('[Flow Auto] 텍스트만 선택 (void ' + voidsBefore + '개 보존)');
    } else if (slateTexts.length > 0) {
      // 레퍼런스 없으면 전체 텍스트 선택
      var firstText = slateTexts[0];
      var lastText = slateTexts[slateTexts.length - 1];
      range.setStartBefore(firstText);
      range.setEndAfter(lastText);
      sel.removeAllRanges();
      sel.addRange(range);
      console.log('[Flow Auto] 전체 텍스트 선택 (레퍼런스 없음)');
    } else {
      // 텍스트 없으면 끝으로 커서 이동
      range.selectNodeContents(promptEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      console.log('[Flow Auto] 텍스트 없음, 커서를 끝으로');
    }
    await sleep(100);

    // 선택된 텍스트 삭제 (슬레이트 텍스트가 있을 때만)
    if (slateTexts.length > 0) {
      promptEl.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true, cancelable: true, composed: true
      }));
      await sleep(200);
    }

    // 새 텍스트 삽입
    promptEl.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true, cancelable: true, composed: true
    }));
    await sleep(300);

    // 레퍼런스 보존 확인
    var voidsAfter = countRefImages(promptEl);
    if (voidsBefore > 0 && voidsAfter < voidsBefore) {
      console.warn('[Flow Auto] fillPrompt 후 레퍼런스 유실! ref: ' + voidsBefore + ' → ' + voidsAfter);
    }

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

  // 8-1. 에셋 분석 완료 대기 (공통 헬퍼)
  // 방법: 프롬프트 내 void 요소(썸네일) 수 증가 + DOM 안정화로 판단
  // - 이미 분석된 에셋: 즉시 삽입됨 (1~2초)
  // - 새 에셋: 분석에 10~30초 소요
  // Flow styled-components는 랜덤 클래스명 → class*="loading" 같은 패턴 불가
  // 대신: 썸네일 img의 src가 blob:// → https:// 로 변경되면 분석 완료
  async function waitForAnalysisComplete(promptEl, beforeVoids, label) {
    await sleep(2000); // 초기 대기

    var maxWait = 60000;
    var waited = 2000;
    var lastVoidCount = beforeVoids;
    var stableCount = 0; // DOM 변화 없이 연속 체크된 횟수

    while (waited < maxWait) {
      if (isStopRequested()) throw new Error('__STOPPED__');

      var currentVoids = countRefImages(promptEl);

      if (currentVoids > beforeVoids) {
        // 썸네일이 추가됨 → 분석 상태 체크
        // img가 있는 void 노드만 검사 (Slate 기본 void 제외)
        var voidEls = promptEl.querySelectorAll('[contenteditable="false"], [data-slate-void]');
        var allReady = true;

        for (var vi = 0; vi < voidEls.length; vi++) {
          var imgs = voidEls[vi].querySelectorAll('img');
          // img가 없는 void는 Slate 기본 요소 → 스킵
          if (imgs.length === 0) continue;

          // 방법 1: img src 체크 (blob: = 로딩 중, https: = 완료)
          for (var ii = 0; ii < imgs.length; ii++) {
            var src = imgs[ii].src || '';
            if (src.startsWith('blob:') || !src) {
              allReady = false;
              break;
            }
          }
          if (!allReady) break;

          // 방법 2: SVG 원형 프로그레스 (stroke-dasharray) 체크
          var svgProgress = voidEls[vi].querySelectorAll('svg circle[stroke-dasharray], svg circle[stroke-dashoffset]');
          if (svgProgress.length > 0) {
            allReady = false;
            break;
          }

          // 방법 3: aria-busy 체크
          if (voidEls[vi].getAttribute('aria-busy') === 'true') {
            allReady = false;
            break;
          }

          // 방법 4: opacity 체크 (분석 중 반투명)
          var opacity = parseFloat(getComputedStyle(voidEls[vi]).opacity);
          if (opacity < 0.9) {
            allReady = false;
            break;
          }
        }

        if (allReady) {
          // DOM 안정화 확인 (2회 연속 동일하면 완료)
          if (currentVoids === lastVoidCount) {
            stableCount++;
          } else {
            stableCount = 0;
          }
          if (stableCount >= 2) {
            console.log('[Flow Auto] 에셋 "' + label + '" 분석 완료 (' + (waited / 1000) + '초), 썸네일 ' + beforeVoids + ' → ' + currentVoids);
            return true;
          }
        } else {
          stableCount = 0;
        }
      }

      lastVoidCount = currentVoids;

      if (waited % 5000 === 0) {
        console.log('[Flow Auto] 에셋 "' + label + '" 분석 대기 중... (' + (waited / 1000) + '초), void: ' + currentVoids + '/' + beforeVoids);
      }

      await sleep(1500);
      waited += 1500;
    }

    console.warn('[Flow Auto] 에셋 "' + label + '" 분석 타임아웃 (60초), 계속 진행');
    return false;
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
    // 디버그: Slate 에디터 구조 덤프 (현재 상태)
    dumpSlateEditor();

    var promptEl = findPromptInput();
    var beforeVoids = countRefImages(promptEl);

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

    // 4. 검색 결과 존재 확인 ("일치하는 결과 없음" 체크)
    var searchRect = searchInput.getBoundingClientRect();
    var noResults = false;
    var checkEls = document.querySelectorAll('div, span, p');
    for (var nr = 0; nr < checkEls.length; nr++) {
      var nrRect = checkEls[nr].getBoundingClientRect();
      if (nrRect.top > searchRect.bottom && nrRect.top < searchRect.bottom + 400 && nrRect.width > 50) {
        var nrText = (checkEls[nr].textContent || '').trim();
        if (nrText === '일치하는 결과 없음' || nrText === 'No matching results' || nrText === 'No results found') {
          noResults = true;
          break;
        }
      }
    }

    if (noResults) {
      console.warn('[Flow Auto] 에셋 "' + charName + '" 검색 결과 없음');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
      }));
      await sleep(300);
      return false;
    }

    // 5. 키보드로 첫 번째 검색 결과 선택 (ArrowDown → Enter)
    // Enter 키가 SPA 네비게이션을 트리거하므로 history API를 임시 차단
    console.log('[Flow Auto] 에셋 "' + charName + '" 키보드 선택 시도');

    // SPA 네비게이션 차단: history.pushState/replaceState 오버라이드
    var origPushState = history.pushState.bind(history);
    var origReplaceState = history.replaceState.bind(history);
    var navBlocked = false;
    history.pushState = function() {
      console.log('[Flow Auto] 네비게이션 차단됨 (pushState):', arguments[2]);
      navBlocked = true;
    };
    history.replaceState = function() {
      console.log('[Flow Auto] 네비게이션 차단됨 (replaceState):', arguments[2]);
      navBlocked = true;
    };
    var blockNav = function(e) { e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener('popstate', blockNav, true);
    window.addEventListener('beforeunload', blockNav, true);

    // ArrowDown → 첫 번째 결과 포커스
    searchInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true
    }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true
    }));
    await sleep(300);

    // ArrowDown 후 포커스된 요소 찾기 (Radix는 포커스를 리스트 아이템으로 이동시킴)
    var focusedEl = document.activeElement;
    var enterTarget = (focusedEl && focusedEl !== searchInput && focusedEl !== document.body) ? focusedEl : searchInput;
    console.log('[Flow Auto] Enter 대상: ' + enterTarget.tagName + ' class="' +
      (enterTarget.className || '').toString().substring(0, 60) + '"' +
      (enterTarget === searchInput ? ' (searchInput)' : ' (포커스된 요소)'));

    // Enter → 선택 확정
    enterTarget.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
    }));
    enterTarget.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
    }));
    await sleep(800);

    // SPA 네비게이션 차단 해제
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    window.removeEventListener('popstate', blockNav, true);
    window.removeEventListener('beforeunload', blockNav, true);
    if (navBlocked) {
      console.log('[Flow Auto] 네비게이션이 차단되어 페이지 유지됨');
    }

    // 6. 에셋 패널 닫기
    console.log('[Flow Auto] 에셋 키보드 선택 완료, 패널 닫기');
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
    }));
    await sleep(500);

    // 7. 검색 결과가 있었고 Enter를 보냈으면 → 성공으로 처리
    // countRefImages()는 Flow의 에셋 레퍼런스를 감지하지 못하므로 검증 생략
    console.log('[Flow Auto] 에셋 "' + charName + '" 선택 완료 (검색 결과 있음 + Enter 전송)');
    return true;
  }

  // 10-1. 새 에셋 업로드 (에셋 패널 내 업로드 버튼 → interceptor로 파일 주입)
  // Flow는 showOpenFilePicker (File System Access API)를 사용하며, interceptor가 가로챔
  async function uploadNewAsset(searchName, dataUrl) {
    var promptEl = findPromptInput();
    var beforeVoids = countRefImages(promptEl);

    // interceptor에 파일 데이터 + 이름 설정
    document.documentElement.setAttribute('data-flow-upload-name', searchName);
    document.documentElement.setAttribute('data-flow-upload', dataUrl);
    document.documentElement.removeAttribute('data-flow-upload-done');

    // 1. "+" 버튼 클릭 → 에셋 패널 열기
    var ingredientBtn = findIngredientButton();
    if (ingredientBtn) {
      simulateRealClick(ingredientBtn);
      await sleep(1000);
    }

    // 2. 에셋 패널 내 요소 탐색 (디버그 로깅)
    //    패널은 프롬프트 바 위쪽에 열림 (화면 하단 영역)
    var panelElements = [];
    var allEls = document.querySelectorAll('button, [role="button"], div[tabindex], a, label, span');
    for (var pe = 0; pe < allEls.length; pe++) {
      var peRect = allEls[pe].getBoundingClientRect();
      var peTxt = (allEls[pe].textContent || '').trim();
      // 하단 영역 (프롬프트 바 위) 에 있는 요소만
      if (peRect.width > 0 && peRect.height > 0 && peRect.top > 300 && peRect.top < 700 && peTxt.length > 0 && peTxt.length < 50) {
        panelElements.push({
          el: allEls[pe],
          tag: allEls[pe].tagName,
          text: peTxt,
          rect: peRect,
          ariaLabel: allEls[pe].getAttribute('aria-label') || ''
        });
      }
    }
    console.log('[Flow Auto] 패널 영역 요소들 (' + panelElements.length + '개):');
    panelElements.forEach(function(p) {
      console.log('  ' + p.tag + ' "' + p.text.substring(0, 40) + '" aria="' + p.ariaLabel + '" at(' +
        Math.round(p.rect.left) + ',' + Math.round(p.rect.top) + ') ' +
        Math.round(p.rect.width) + 'x' + Math.round(p.rect.height));
    });

    // 3. 업로드 버튼 찾기 (우선순위별)
    var uploadTriggered = false;

    // 방법 A: "업로드", "upload", "add_photo", "내 컴퓨터" 텍스트가 포함된 버튼
    var uploadKeywords = ['upload', '업로드', 'add_photo', '내 컴퓨터', 'computer', '파일에서', '이미지 추가'];
    for (var pk = 0; pk < panelElements.length && !uploadTriggered; pk++) {
      var elTxt = panelElements[pk].text.toLowerCase();
      var elAria = panelElements[pk].ariaLabel.toLowerCase();
      for (var uk = 0; uk < uploadKeywords.length; uk++) {
        if (elTxt.includes(uploadKeywords[uk]) || elAria.includes(uploadKeywords[uk])) {
          console.log('[Flow Auto] 업로드 버튼 발견 (텍스트): "' + panelElements[pk].text.substring(0, 40) + '" → 클릭');
          simulateRealClick(panelElements[pk].el);
          uploadTriggered = true;
          await sleep(1000);
          break;
        }
      }
    }

    // 방법 B: 패널 내 file input 찾기 (Flow 페이지의 것만, 확장 popup의 것 제외)
    if (!uploadTriggered) {
      var fileInputs = document.querySelectorAll('input[type="file"]');
      for (var fi = 0; fi < fileInputs.length; fi++) {
        // 확장 popup의 file input 제외 (id로 구분)
        if (fileInputs[fi].id === 'fileInput' || fileInputs[fi].id === 'grokFileInput' ||
            fileInputs[fi].id === 'grokPromptFileInput') continue;
        var fiParent = fileInputs[fi].closest('body');
        // Flow 페이지의 file input만
        console.log('[Flow Auto] Flow file input 발견: accept="' + (fileInputs[fi].accept || '') +
          '" id="' + (fileInputs[fi].id || '') + '" → 클릭');
        fileInputs[fi].click();
        uploadTriggered = true;
        await sleep(500);
        break;
      }
    }

    // 방법 C: 패널 내 아이콘 버튼 (작은 크기, 이미지 관련 아이콘)
    if (!uploadTriggered) {
      for (var ib = 0; ib < panelElements.length && !uploadTriggered; ib++) {
        var ibRect = panelElements[ib].rect;
        var ibTxt = panelElements[ib].text;
        // 작은 아이콘 버튼 (32~64px), 머티리얼 아이콘 텍스트
        if (ibRect.width >= 24 && ibRect.width <= 80 && ibRect.height >= 24 && ibRect.height <= 80 &&
            (ibTxt.includes('add_photo') || ibTxt.includes('upload_file') || ibTxt.includes('cloud_upload') ||
             ibTxt.includes('file_upload') || ibTxt.includes('image'))) {
          console.log('[Flow Auto] 아이콘 버튼 발견: "' + ibTxt + '" → 클릭');
          simulateRealClick(panelElements[ib].el);
          uploadTriggered = true;
          await sleep(1000);
          break;
        }
      }
    }

    if (!uploadTriggered) {
      console.warn('[Flow Auto] 업로드 메커니즘 미발견. 패널 내 요소 확인 필요');
      // 패널 닫기
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
      }));
      await sleep(300);
      document.documentElement.removeAttribute('data-flow-upload');
      document.documentElement.removeAttribute('data-flow-upload-name');
      return false;
    }

    // 4. 업로드 완료 대기 (interceptor의 data-flow-upload-done 감시)
    console.log('[Flow Auto] 에셋 업로드 대기: ' + searchName);
    var waited = 0;
    while (waited < 15000) {
      var done = document.documentElement.getAttribute('data-flow-upload-done');
      if (done === 'true') {
        document.documentElement.removeAttribute('data-flow-upload-done');
        console.log('[Flow Auto] 에셋 파일 전달 완료: ' + searchName);
        break;
      }
      if (done === 'error') {
        document.documentElement.removeAttribute('data-flow-upload-done');
        console.error('[Flow Auto] 에셋 파일 전달 실패: ' + searchName);
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
        }));
        await sleep(300);
        return false;
      }
      await sleep(300);
      waited += 300;
    }

    // 5. 패널 열린 상태에서 바로 키보드 선택 (패널 닫으면 인덱싱 안 돼서 검색 실패)
    //    업로드 직후 에셋 카드가 패널에 보이므로, 바로 검색+선택
    console.log('[Flow Auto] 에셋 업로드 완료, 패널 내에서 키보드 선택: ' + searchName);

    // 업로드 속성 정리
    document.documentElement.removeAttribute('data-flow-upload');
    document.documentElement.removeAttribute('data-flow-upload-name');

    // 업로드 후 에셋이 패널에 나타날 때까지 대기
    await sleep(2000);

    // 패널 내 검색바 찾기
    var searchInputAfter = null;
    var searchCandidates = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
    for (var si = 0; si < searchCandidates.length; si++) {
      var siRect = searchCandidates[si].getBoundingClientRect();
      var siPh = (searchCandidates[si].placeholder || '').toLowerCase();
      if (siRect.width > 100 && siRect.height > 20 && siRect.top > 200 &&
          (siPh.includes('검색') || siPh.includes('search') || siPh.includes('에셋') || siPh.includes('asset'))) {
        searchInputAfter = searchCandidates[si];
        break;
      }
    }

    if (!searchInputAfter) {
      console.warn('[Flow Auto] 업로드 후 검색바 미발견, 패널 닫기');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
      }));
      await sleep(500);
      return false;
    }

    // 검색바에 에셋 이름 입력
    console.log('[Flow Auto] 업로드 후 패널 내 검색: "' + searchName + '"');
    searchInputAfter.focus();
    await sleep(200);
    searchInputAfter.value = '';
    searchInputAfter.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    searchInputAfter.value = searchName;
    searchInputAfter.dispatchEvent(new Event('input', { bubbles: true }));
    searchInputAfter.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1500);

    // "일치하는 결과 없음" 체크
    var srRect = searchInputAfter.getBoundingClientRect();
    var noRes = false;
    var chkEls = document.querySelectorAll('div, span, p');
    for (var cr = 0; cr < chkEls.length; cr++) {
      var crRect = chkEls[cr].getBoundingClientRect();
      if (crRect.top > srRect.bottom && crRect.top < srRect.bottom + 400 && crRect.width > 50) {
        var crText = (chkEls[cr].textContent || '').trim();
        if (crText === '일치하는 결과 없음' || crText === 'No matching results' || crText === 'No results found') {
          noRes = true;
          break;
        }
      }
    }

    if (noRes) {
      console.warn('[Flow Auto] 업로드 후 검색 결과 없음: ' + searchName);
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
      }));
      await sleep(300);
      return false;
    }

    // SPA 네비게이션 차단
    var origPush = history.pushState.bind(history);
    var origReplace = history.replaceState.bind(history);
    history.pushState = function() { console.log('[Flow Auto] 네비게이션 차단됨 (pushState)'); };
    history.replaceState = function() { console.log('[Flow Auto] 네비게이션 차단됨 (replaceState)'); };
    var blockNavUpload = function(e) { e.preventDefault(); e.stopImmediatePropagation(); };
    window.addEventListener('popstate', blockNavUpload, true);
    window.addEventListener('beforeunload', blockNavUpload, true);

    // ArrowDown → Enter 키보드 선택
    searchInputAfter.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true
    }));
    searchInputAfter.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true
    }));
    await sleep(300);

    var focusedAfter = document.activeElement;
    var enterTgt = (focusedAfter && focusedAfter !== searchInputAfter && focusedAfter !== document.body) ? focusedAfter : searchInputAfter;
    enterTgt.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
    }));
    enterTgt.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
    }));
    await sleep(800);

    // 네비게이션 차단 해제
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', blockNavUpload, true);
    window.removeEventListener('beforeunload', blockNavUpload, true);

    // 패널 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
    }));
    await sleep(1000);

    // ref 카운트 폴링 (UI 렌더링 지연 대응)
    var upPollInterval = 500;
    var upMaxPollWait = 5000;
    var upPollWaited = 0;
    var afterUploadVoids = 0;

    while (upPollWaited < upMaxPollWait) {
      await sleep(upPollInterval);
      upPollWaited += upPollInterval;
      afterUploadVoids = countRefImages(promptEl);
      if (afterUploadVoids > beforeVoids) {
        console.log('[Flow Auto] 에셋 "' + searchName + '" 업로드 + 선택 성공! ref: ' + beforeVoids + ' → ' + afterUploadVoids + ' (' + (upPollWaited / 1000) + '초)');
        return true;
      }
    }

    console.warn('[Flow Auto] 에셋 "' + searchName + '" 업로드 후 선택 실패 — ref: ' + beforeVoids + ' → ' + afterUploadVoids);
    return false;
  }

  // 11. 캐릭터별 레퍼런스 일괄 선택
  // flowTagMap: 캐릭터 이름 → Flow 태그 (영문, 에셋 검색용)
  // uploadedAssetNames: 이미 업로드한 에셋 추적 (같은 세션에서 중복 업로드 방지)
  var uploadedAssetNames = new Set();

  async function uploadReferences(charNames, characterMap) {
    var names = charNames.split(',').map(function(n) { return n.trim(); });
    var flowTagMap = characterMap.__flowTagMap || {};

    for (var i = 0; i < names.length; i++) {
      if (isStopRequested()) throw new Error('__STOPPED__');

      var name = names[i];
      var flowTag = flowTagMap[name] || flowTagMap[name.normalize('NFC')] || null;
      var searchName = flowTag || name; // flowTag 있으면 영문명으로 검색

      console.log('[Flow Auto] 레퍼런스 선택 ' + (i + 1) + '/' + names.length + ': ' + name +
        (flowTag ? ' (Flow태그: ' + flowTag + ')' : ' (태그 미설정, 한글 검색)'));

      // 에셋 패널에서 검색 → 키보드 선택
      var selected = await selectAssetByName(searchName);

      if (!selected) {
        // 검색 결과 없음 → 최초 1회만 업로드 (이미 업로드한 에셋은 스킵)
        if (uploadedAssetNames.has(searchName)) {
          console.log('[Flow Auto] 에셋 "' + searchName + '" 이미 업로드됨 — 재업로드 스킵');
        } else {
          var dataUrl = characterMap[name] || characterMap[name.normalize('NFC')];
          if (dataUrl) {
            console.log('[Flow Auto] 새 에셋 업로드 (최초 1회): ' + searchName);
            var uploaded = await uploadNewAsset(searchName, dataUrl);
            if (uploaded) {
              uploadedAssetNames.add(searchName);
            } else {
              console.warn('[Flow Auto] 에셋 업로드 실패: ' + searchName + ', 스킵');
            }
          } else {
            console.warn('[Flow Auto] 캐릭터 "' + name + '" 이미지 없음, 스킵');
          }
        }
      }

      await sleep(300);
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

      // 이미지: getMediaUrlRedirect 패턴 새 img 감지 (에셋 이미지 제외)
      var newCount = 0;
      document.querySelectorAll('img').forEach(function(img) {
        if (img.src && img.src.includes('getMediaUrlRedirect') &&
            !knownSrcs.has(img.src) && !downloadedSrcs.has(img.src) &&
            !assetSrcs.has(img.src)) {
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
          !downloadedSrcs.has(img.src) && !assetSrcs.has(img.src) &&
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
        // fetch로 이미지 가져오기 → dataUrl 변환 → background에 전달
        const response = await fetch(imageSrc);
        const blob = await response.blob();

        var reader = new FileReader();
        var dataUrl = await new Promise(function(resolve, reject) {
          reader.onload = function() { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_IMAGE',
          url: dataUrl,
          filename: fullPath
        });
        console.log('[Flow Auto] 다운로드 요청:', fullPath);
        return true;
      } catch (e) {
        console.error('[Flow Auto] 다운로드 실패:', e.message);
        return false;
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

  // 이미지 카드의 텍스트를 읽어서 프롬프트와 매칭 (1:1 추적)
  // Flow 카드는 이미지 + 프롬프트 텍스트를 함께 표시하므로, 카드 텍스트에서 프롬프트를 찾음
  function findPromptForImage(imgElement, batchPrompts, alreadyMatched) {
    var el = imgElement;
    var bestMatch = -1;
    var bestMatchLen = 0;

    for (var depth = 0; depth < 20; depth++) {
      el = el.parentElement;
      if (!el || el === document.body) break;
      var text = el.textContent || '';
      if (text.length < 20) continue;   // 카드 레벨까지 올라가기

      for (var i = 0; i < batchPrompts.length; i++) {
        if (alreadyMatched.has(i)) continue;

        // prompt (Flow에 제출된 전체 텍스트) 우선, originalPrompt 보조
        var candidates = [
          batchPrompts[i].prompt,
          batchPrompts[i].originalPrompt
        ];

        for (var ci = 0; ci < candidates.length; ci++) {
          var searchStr = candidates[ci];
          if (!searchStr || searchStr.length < 5) continue;

          // 여러 길이로 시도: 80자 → 50자 → 30자 (점점 짧게)
          var lengths = [
            Math.min(searchStr.length, 80),
            Math.min(searchStr.length, 50),
            Math.min(searchStr.length, 30)
          ];

          for (var li = 0; li < lengths.length; li++) {
            var matchLen = lengths[li];
            var matchText = searchStr.substring(0, matchLen);

            if (text.includes(matchText) && matchLen > bestMatchLen) {
              bestMatch = i;
              bestMatchLen = matchLen;
              break;  // 가장 긴 매칭이 성공하면 더 짧은 건 불필요
            }
          }
        }
      }

      // 매칭을 찾았으면 더 위로 올라갈 필요 없음
      if (bestMatch >= 0) {
        console.log('[Flow Auto] 텍스트매칭 성공: 이미지→프롬프트 #' + bestMatch +
          ' (depth=' + depth + ', matchLen=' + bestMatchLen + ')');
        return bestMatch;
      }

      // 너무 큰 컨테이너에 도달하면 중단 (false positive 방지)
      if (text.length > 10000) break;
    }

    // 매칭 실패 — 디버그 로그
    console.warn('[Flow Auto] 텍스트매칭 실패: 이미지 src=' +
      (imgElement.src || '').substring(0, 60) + '...');
    var debugEl = imgElement;
    for (var dd = 0; dd < 10; dd++) {
      debugEl = debugEl.parentElement;
      if (!debugEl || debugEl === document.body) break;
      var dt = (debugEl.textContent || '').substring(0, 200);
      if (dt.length >= 20) {
        console.log('[Flow Auto] 카드텍스트 depth=' + dd + ' len=' + (debugEl.textContent || '').length + ': "' + dt + '"');
      }
    }
    for (var pi = 0; pi < batchPrompts.length; pi++) {
      if (!alreadyMatched.has(pi)) {
        console.log('[Flow Auto] 프롬프트[' + pi + '] prompt: "' + (batchPrompts[pi].prompt || '').substring(0, 80) + '"');
        console.log('[Flow Auto] 프롬프트[' + pi + '] original: "' + (batchPrompts[pi].originalPrompt || '').substring(0, 80) + '"');
      }
    }

    return -1;
  }

  // 배치 다운로드: 새 이미지를 수집하여 프롬프트 순서대로 다운로드
  // 에셋 이미지(~100KB)와 생성 이미지(~500KB+)를 크기로 구분
  var MIN_GENERATED_IMAGE_SIZE = 200 * 1024; // 200KB 이상만 생성 이미지로 간주
  async function downloadBatch(batchStart, batchEnd, preGenSrcs, detectedImages) {
    // Phase 3에서 전달받은 이미지 배열 사용 (DOM 재탐색으로 인한 누락 방지)
    var candidateImages;
    if (detectedImages && detectedImages.length > 0) {
      candidateImages = detectedImages.slice(); // 복사본 사용
      console.log('[Flow Auto] 배치 다운로드: Phase 3 감지 이미지 ' + candidateImages.length + '개 사용');
    } else {
      // 폴백: DOM에서 직접 탐색
      candidateImages = [];
      document.querySelectorAll('img').forEach(function(img) {
        if (img.src && img.src.includes('getMediaUrlRedirect') &&
            !preGenSrcs.has(img.src) && !downloadedSrcs.has(img.src) &&
            !assetSrcs.has(img.src)) {
          candidateImages.push(img);
        }
      });
      console.log('[Flow Auto] 배치 다운로드: DOM 탐색 이미지 ' + candidateImages.length + '개 (폴백)');
    }

    // 위치순 정렬 (아래→위 = 제출 순서)
    // Flow는 최신 생성물을 위에 표시 (역순) → 아래가 먼저 제출된 프롬프트
    candidateImages.sort(function(a, b) {
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      if (Math.abs(ar.top - br.top) < 20) return ar.left - br.left;
      return br.top - ar.top; // 아래→위 (제출 순서 = 프롬프트 순서)
    });

    console.log('[Flow Auto] 배치 다운로드: 후보 이미지 ' + candidateImages.length + '개, 크기 필터 적용...');

    // 후보 이미지를 fetch해서 실제 크기로 필터링 (에셋 이미지 제외)
    var verifiedImages = [];
    for (var ci = 0; ci < candidateImages.length; ci++) {
      try {
        var headResp = await fetch(candidateImages[ci].src);
        var headBlob = await headResp.blob();
        var fileSize = headBlob.size;
        if (fileSize >= MIN_GENERATED_IMAGE_SIZE) {
          verifiedImages.push({ img: candidateImages[ci], blob: headBlob, size: fileSize });
          console.log('[Flow Auto] 이미지 #' + (ci + 1) + ': ' + Math.round(fileSize / 1024) + 'KB → 생성 이미지 (다운로드 대상)');
        } else {
          console.log('[Flow Auto] 이미지 #' + (ci + 1) + ': ' + Math.round(fileSize / 1024) + 'KB → 에셋/썸네일 (스킵)');
          downloadedSrcs.add(candidateImages[ci].src); // 에셋도 등록하여 재처리 방지
        }
      } catch (e) {
        console.warn('[Flow Auto] 이미지 #' + (ci + 1) + ' fetch 실패, 스킵:', e.message);
        downloadedSrcs.add(candidateImages[ci].src);
      }
    }

    var batchCount = batchEnd - batchStart;
    var dlCount = Math.min(verifiedImages.length, batchCount);
    console.log('[Flow Auto] 크기 필터 후: 생성 이미지 ' + verifiedImages.length + '개, 다운로드 ' + dlCount + '개');

    // === 프롬프트-이미지 1:1 매칭 (카드 텍스트 기반) ===
    var batchPrompts = [];
    for (var bp = batchStart; bp < batchEnd; bp++) {
      batchPrompts.push(promptsWithCharacters[bp]);
    }

    var imageToPromptMap = []; // verifiedImages 인덱스 → batchPrompts 인덱스
    var matchedPrompts = new Set();
    var matchCount = 0;

    for (var mi = 0; mi < verifiedImages.length; mi++) {
      var matchIdx = findPromptForImage(verifiedImages[mi].img, batchPrompts, matchedPrompts);
      if (matchIdx >= 0) {
        imageToPromptMap[mi] = matchIdx;
        matchedPrompts.add(matchIdx);
        matchCount++;
      } else {
        imageToPromptMap[mi] = -1;
      }
    }

    // 매칭 안 된 이미지 → 매칭 안 된 프롬프트에 순서대로 배정 (위치 기반 폴백)
    if (matchCount < verifiedImages.length) {
      var unmatchedPromptIndices = [];
      for (var upi = 0; upi < batchCount; upi++) {
        if (!matchedPrompts.has(upi)) unmatchedPromptIndices.push(upi);
      }
      var unmatchedIdx = 0;
      for (var fi = 0; fi < verifiedImages.length; fi++) {
        if (imageToPromptMap[fi] === -1 && unmatchedIdx < unmatchedPromptIndices.length) {
          imageToPromptMap[fi] = unmatchedPromptIndices[unmatchedIdx++];
        }
      }
    }

    console.log('[Flow Auto] 프롬프트 매칭: ' + matchCount + '/' + verifiedImages.length + ' 텍스트 매칭, ' +
      (verifiedImages.length - matchCount) + '개 위치 폴백');

    // 매칭 안 된 프롬프트 = 생성 실패
    if (matchCount > 0 && matchedPrompts.size < batchCount) {
      for (var fpi = 0; fpi < batchCount; fpi++) {
        if (!matchedPrompts.has(fpi)) {
          var failedItem = batchPrompts[fpi];
          console.warn('[Flow Auto] ⚠ 프롬프트 #' + (failedItem.index + 1) + ' 생성 실패 (이미지 미감지): ' +
            (failedItem.filename || failedItem.originalPrompt.substring(0, 30)));
        }
      }
    }

    for (var di = 0; di < dlCount; di++) {
      var promptBatchIdx = imageToPromptMap[di];
      var pIdx = (promptBatchIdx >= 0) ? (batchStart + promptBatchIdx) : (batchStart + di);
      if (pIdx >= promptsWithCharacters.length) break;

      var pItem = promptsWithCharacters[pIdx];
      downloadedSrcs.add(verifiedImages[di].img.src);

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

      var matchMethod = (imageToPromptMap[di] >= 0 && matchCount > 0) ? '텍스트매칭' : '위치폴백';
      try {
        var blob = verifiedImages[di].blob;
        console.log('[Flow Auto] DL ' + (di + 1) + '/' + dlCount + ': ' + fullFilename +
          ' (' + Math.round(blob.size / 1024) + 'KB, ' + matchMethod + ')');

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
      } catch (e) {
        console.error('[Flow Auto] 다운로드 실패: ' + fullFilename, e.message);
      }
    }

    // 남은 이미지도 downloadedSrcs에 등록 (다음 배치 오염 방지)
    for (var ri = dlCount; ri < verifiedImages.length; ri++) {
      downloadedSrcs.add(verifiedImages[ri].img.src);
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

    // === Phase 0: 에셋 사전 준비 ===
    // 프롬프트에서 고유 캐릭터를 추출하고, 에셋이 없는 것은 미리 업로드
    // 이렇게 하면 100장+ 이미지에서도 에셋 대기 시간 없음
    var uniqueChars = [];
    var seenChars = {};
    for (var uc = 0; uc < promptsWithCharacters.length; uc++) {
      var charStr = promptsWithCharacters[uc].character;
      if (!charStr) continue;
      var charList = charStr.split(',').map(function(c) { return c.trim(); });
      for (var cl = 0; cl < charList.length; cl++) {
        if (charList[cl] && !seenChars[charList[cl]]) {
          seenChars[charList[cl]] = true;
          uniqueChars.push(charList[cl]);
        }
      }
    }

    if (uniqueChars.length > 0) {
      console.log('[Flow Auto] === Phase 0: 에셋 사전 준비 (' + uniqueChars.length + '명) ===');
      console.log('[Flow Auto] 캐릭터: ' + uniqueChars.join(', '));

      var flowTagMap = characters.__flowTagMap || {};

      // Phase 0 시작 전 이미지 스냅샷 (Phase 0 중 나타나는 에셋 이미지 추적용)
      var prePhase0Srcs = new Set();
      document.querySelectorAll('img').forEach(function(img) {
        if (img.src) prePhase0Srcs.add(img.src);
      });

      for (var ui = 0; ui < uniqueChars.length; ui++) {
        if (isStopRequested()) {
          console.log('[Flow Auto] 사용자 정지 요청 — 자동화 중단');
          try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
          return;
        }

        var charName = uniqueChars[ui];
        var flowTag = flowTagMap[charName] || flowTagMap[charName.normalize('NFC')] || null;
        var searchName = flowTag || charName;

        console.log('[Flow Auto] Phase 0 [' + (ui + 1) + '/' + uniqueChars.length + ']: ' + charName +
          (flowTag ? ' (Flow태그: ' + flowTag + ')' : ''));

        var needsUpload = false;

        // 1단계: 에셋이 이미 라이브러리에 있는지 확인
        try {
          var found = await selectAssetByName(searchName);
          if (found) {
            console.log('[Flow Auto] Phase 0: 에셋 "' + searchName + '" 이미 존재');
          } else {
            needsUpload = true;
          }
        } catch (e) {
          if (e.message === '__STOPPED__') {
            try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e2) {}
            return;
          }
          console.warn('[Flow Auto] Phase 0: 에셋 검색 실패 (' + charName + '):', e.message);
          needsUpload = true;
          // 패널이 열린 채 남았을 수 있으므로 닫기
          try {
            document.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
            }));
            await sleep(500);
          } catch(e2) {}
        }

        // 2단계: 에셋 없으면 업로드
        if (needsUpload && !uploadedAssetNames.has(searchName)) {
          var dataUrl = characters[charName] || characters[charName.normalize('NFC')];
          if (dataUrl) {
            try {
              console.log('[Flow Auto] Phase 0: 에셋 "' + searchName + '" 업로드 중...');
              var uploaded = await uploadNewAsset(searchName, dataUrl);
              if (uploaded) {
                uploadedAssetNames.add(searchName);
                console.log('[Flow Auto] Phase 0: 에셋 "' + searchName + '" 업로드 완료');
              } else {
                console.warn('[Flow Auto] Phase 0: 에셋 "' + searchName + '" 업로드 실패');
              }
            } catch (e) {
              if (e.message === '__STOPPED__') {
                try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e2) {}
                return;
              }
              console.warn('[Flow Auto] Phase 0: 업로드 실패 (' + charName + '):', e.message);
              // 패널 닫기
              try {
                document.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
                }));
                await sleep(500);
              } catch(e2) {}
            }
          } else {
            console.warn('[Flow Auto] Phase 0: 캐릭터 "' + charName + '" 이미지 데이터 없음');
          }
        }

        await sleep(500);
      }

      // Phase 0 중 나타난 에셋 이미지를 assetSrcs에 등록 (Phase 3 오인 방지)
      document.querySelectorAll('img').forEach(function(img) {
        if (img.src && img.src.includes('getMediaUrlRedirect') && !prePhase0Srcs.has(img.src)) {
          assetSrcs.add(img.src);
          console.log('[Flow Auto] Phase 0 에셋 이미지 등록: ' + img.src.substring(0, 80) + '...');
        }
      });

      // 프롬프트 영역 초기화 (Phase 0에서 에셋이 삽입됐을 수 있으므로)
      try {
        await clearReferences();
      } catch(e) {
        console.log('[Flow Auto] Phase 0 후 프롬프트 초기화 실패 (무시):', e.message);
      }
      await sleep(500);

      console.log('[Flow Auto] === Phase 0 완료: ' + uniqueChars.length + '명 에셋 준비됨 ===');
    }

    // === 파이프라인 모드: 전체 제출 → 순서 매칭 다운로드 ===
    var totalCount = promptsWithCharacters.length;
    console.log('[Flow Auto] 파이프라인 모드: ' + totalCount + '개 프롬프트');

    try {
      // Phase 1: 생성 전 스냅샷
      var preGenSrcs = new Set();
      document.querySelectorAll('img').forEach(function(img) {
        if (img.src) preGenSrcs.add(img.src);
      });
      var preSubmitEditLinks = new Set();
      document.querySelectorAll('a').forEach(function(a) {
        if (a.href && a.href.includes('/edit/')) preSubmitEditLinks.add(a.href);
      });
      console.log('[Flow Auto] 기존 edit 링크: ' + preSubmitEditLinks.size + '개');

      // Phase 2: 프롬프트 전체 연속 제출
      for (var j = 0; j < totalCount; j++) {
        if (isStopRequested()) {
          console.log('[Flow Auto] 사용자 정지 요청 — 자동화 중단');
          try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
          return;
        }

        var item = promptsWithCharacters[j];
        var charForThisPrompt = item.character || '';
        var logPrefix = '[' + (item.index + 1) + ']' + (item.filename ? ' [' + item.filename + ']' : '');

        console.log('[Flow Auto] 제출 ' + (j + 1) + '/' + totalCount + ': ' + logPrefix);

        try {
          chrome.runtime.sendMessage({
            action: 'PROGRESS_UPDATE',
            currentIndex: j,
            totalCount: totalCount,
            promptIndex: item.index,
            status: 'processing',
            currentPrompt: '제출 ' + (j + 1) + '/' + totalCount + ' ' + logPrefix
          });
        } catch(e) {}

        // 에셋 레퍼런스 선택
        if (charForThisPrompt) {
          console.log('[Flow Auto] 레퍼런스 선택: ' + charForThisPrompt);
          await uploadReferences(charForThisPrompt, characters);
          await sleep(500);
        }

        await fillPrompt(item.prompt);
        await sleep(500);

        await clickGenerate();

        if (j < totalCount - 1) {
          await sleep(Math.max(delayMs, 2000));
        }
      }

      console.log('[Flow Auto] === 제출 완료: ' + totalCount + '개 ===');

      // Phase 3: edit 링크 DOM 위치 기반 매칭 다운로드
      // 갤러리는 최신이 맨 앞(역순): newEditLinks[0] = 마지막 제출, [N-1] = 첫 제출
      await sleep(3000);

      // 새 edit 링크 수집 (DOM 순서)
      var newEditLinks = [];
      document.querySelectorAll('a').forEach(function(a) {
        if (a.href && a.href.includes('/edit/') && !preSubmitEditLinks.has(a.href)) {
          newEditLinks.push(a);
        }
      });
      console.log('[Flow Auto] 새 edit 링크: ' + newEditLinks.length + '개 (기대: ' + totalCount + '개)');

      // edit 링크 부족 시 추가 대기 (최대 30초)
      if (newEditLinks.length < totalCount) {
        for (var elw = 0; elw < 15; elw++) {
          await sleep(2000);
          newEditLinks = [];
          document.querySelectorAll('a').forEach(function(a) {
            if (a.href && a.href.includes('/edit/') && !preSubmitEditLinks.has(a.href)) {
              newEditLinks.push(a);
            }
          });
          if (newEditLinks.length >= totalCount) break;
        }
        console.log('[Flow Auto] edit 링크 재확인: ' + newEditLinks.length + '개');
      }

      // edit 링크 → 프롬프트 매칭: 각 edit 페이지에서 프롬프트 텍스트 읽기
      var editLinkToPrompt = {};
      var matchedInMapping = new Set();
      console.log('[Flow Auto] 상세 페이지에서 프롬프트 텍스트 매칭 시작...');

      for (var el = 0; el < newEditLinks.length; el++) {
        var editUrl = newEditLinks[el].href;
        var editId = editUrl.split('/edit/')[1] || '';
        try {
          var editHtml = await fetch(editUrl, { credentials: 'include' }).then(function(r) { return r.text(); });

          // 각 프롬프트의 고유 텍스트(앞 30자)로 검색
          var found = false;
          for (var pi = 0; pi < totalCount; pi++) {
            if (matchedInMapping.has(pi)) continue;
            var searchText = promptsWithCharacters[pi].originalPrompt.substring(0, 30);
            if (editHtml.includes(searchText)) {
              editLinkToPrompt[editUrl] = pi;
              matchedInMapping.add(pi);
              found = true;
              console.log('[Flow Auto] 텍스트 매칭: ' + editId.substring(0, 12) + '... → 프롬프트 ' + (pi + 1) +
                ' ("' + searchText.substring(0, 20) + '...")');
              break;
            }
          }
          if (!found) {
            console.warn('[Flow Auto] 텍스트 매칭 실패: ' + editId.substring(0, 12) + '...');
          }
        } catch (e) {
          console.warn('[Flow Auto] edit 페이지 fetch 실패: ' + editId.substring(0, 12) + '... — ' + e.message);
        }
      }

      // 매칭 안 된 edit 링크 → 위치 폴백 (역순)
      for (var el2 = 0; el2 < newEditLinks.length; el2++) {
        if (editLinkToPrompt[newEditLinks[el2].href] !== undefined) continue;
        var posIdx = totalCount - 1 - el2;
        if (posIdx >= 0 && posIdx < totalCount && !matchedInMapping.has(posIdx)) {
          editLinkToPrompt[newEditLinks[el2].href] = posIdx;
          matchedInMapping.add(posIdx);
          console.log('[Flow Auto] 위치 폴백: edit ' + el2 + ' → 프롬프트 ' + (posIdx + 1));
        }
      }

      console.log('[Flow Auto] 매칭 완료: 텍스트 ' + Object.keys(editLinkToPrompt).length + '/' + newEditLinks.length);

      var downloadedCount = 0;
      var matchedPromptIndices = new Set();
      var maxWait = selectedOutputType === 'video'
        ? Math.min(totalCount * 180000, 1200000)
        : Math.min(totalCount * 60000, 600000);
      var pollInterval = 2000;
      var waited = 0;
      var lastChangeTime = Date.now();
      var STALL_TIMEOUT = 60000;

      while (waited < maxWait && downloadedCount < totalCount) {
        if (isStopRequested()) {
          try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
          return;
        }

        await sleep(pollInterval);
        waited += pollInterval;

        // 각 edit 링크 내 완성된 이미지 탐색
        for (var eli = 0; eli < newEditLinks.length && downloadedCount < totalCount; eli++) {
          var editLink = newEditLinks[eli];
          var matchIdx = editLinkToPrompt[editLink.href];
          if (matchIdx === undefined || matchedPromptIndices.has(matchIdx)) continue;

          // 이 카드 안의 이미지 확인
          var cardImgs = editLink.querySelectorAll('img');
          var foundImg = null;
          for (var ci = 0; ci < cardImgs.length; ci++) {
            if (cardImgs[ci].src && cardImgs[ci].src.includes('getMediaUrlRedirect') &&
                !downloadedSrcs.has(cardImgs[ci].src)) {
              foundImg = cardImgs[ci];
              break;
            }
          }
          if (!foundImg) continue;

          // 크기 필터
          try {
            var imgResp = await fetch(foundImg.src);
            var imgBlob = await imgResp.blob();

            if (imgBlob.size < MIN_GENERATED_IMAGE_SIZE) continue;

            // 매칭 확정 → 다운로드
            var pItem = promptsWithCharacters[matchIdx];
            matchedPromptIndices.add(matchIdx);

            var fullFilename;
            if (pItem.filename) {
              var safeName = pItem.filename.replace(/[<>:"|?*]/g, '_').replace(/_+/g, '_');
              fullFilename = safeName.includes('.') ? safeName : safeName + '.png';
            } else {
              var autoName = pItem.prompt.substring(0, 30)
                .replace(/[^a-zA-Z0-9가-힣]/g, '_').replace(/_+/g, '_');
              fullFilename = 'flow_' + (pItem.index + 1) + '_' + autoName + '.png';
            }

            // blob → dataUrl → background
            var reader = new FileReader();
            var dataUrl = await new Promise(function(resolve, reject) {
              reader.onload = function() { resolve(reader.result); };
              reader.onerror = reject;
              reader.readAsDataURL(imgBlob);
            });
            chrome.runtime.sendMessage({
              action: 'DOWNLOAD_IMAGE',
              url: dataUrl,
              filename: savePath + '/' + fullFilename
            });

            downloadedSrcs.add(foundImg.src);
            downloadedCount++;
            lastChangeTime = Date.now();

            console.log('[Flow Auto] DL ' + downloadedCount + '/' + totalCount + ': ' + fullFilename +
              ' (' + Math.round(imgBlob.size / 1024) + 'KB, 카드위치매칭)');

            try {
              chrome.runtime.sendMessage({
                action: 'PROGRESS_UPDATE',
                currentIndex: downloadedCount,
                totalCount: totalCount,
                promptIndex: pItem.index,
                status: 'completed',
                currentPrompt: 'DL ' + downloadedCount + '/' + totalCount + ' ' + fullFilename
              });
            } catch(e) {}
          } catch (e) {
            console.warn('[Flow Auto] 이미지 처리 실패:', e.message);
          }
        }

        // 조기 종료
        var almostDone = downloadedCount >= Math.max(1, totalCount - 1);
        if (almostDone && Date.now() - lastChangeTime > STALL_TIMEOUT) {
          console.log('[Flow Auto] ' + (STALL_TIMEOUT / 1000) + '초간 새 이미지 없음 — 조기 종료 (' +
            downloadedCount + '/' + totalCount + ')');
          break;
        }

        if (waited % 15000 === 0) {
          console.log('[Flow Auto] 대기 중... ' + downloadedCount + '/' + totalCount + ' (' + (waited / 1000) + '초)');
        }
      }

      console.log('[Flow Auto] === 완료: ' + downloadedCount + '/' + totalCount +
        ' 다운로드 (' + (waited / 1000) + '초) ===');

      if (downloadedCount === 0) {
        throw new Error('생성 실패 — 다운로드 0개 (전체 ' + totalCount + '개 제출)');
      }

      // 진행 상황: 전체 완료 표시
      try {
        chrome.runtime.sendMessage({
          action: 'PROGRESS_UPDATE',
          currentIndex: totalCount,
          totalCount: totalCount,
          promptIndex: promptsWithCharacters[totalCount - 1].index,
          status: 'completed',
          currentPrompt: '전체 완료 (' + downloadedCount + '/' + totalCount + ')'
        });
      } catch(e) {}

    } catch (error) {
      if (error.message === '__STOPPED__' || isStopRequested()) {
        console.log('[Flow Auto] 사용자 정지 요청 — 자동화 중단');
        try { chrome.runtime.sendMessage({ action: 'AUTOMATION_STOPPED' }); } catch(e) {}
        return;
      }
      console.error('[Flow Auto] 파이프라인 실패:', error.message);
      window.__flowAutoRunning = false;
      clearInterval(popupWatcher);
      try {
        chrome.runtime.sendMessage({
          action: 'HARD_RESET_NEEDED',
          completedCount: 0,
        });
      } catch(e) {}
      return;
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
    // 커스텀 폴더: 권한 확인 후 Finder에서 열기
    try {
      const perm = await customDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        alert('폴더 접근 권한이 만료되었습니다. "위치 변경"으로 다시 선택해주세요.');
        customDirHandle = null;
        await clearDirHandle();
        saveLocation.value = 'flow-images';
        saveLocation.readOnly = false;
        saveState();
        return;
      }
      // 폴더 내 아무 파일이나 찾아서 경로 확인 → Finder로 열기
      try {
        for await (const entry of customDirHandle.values()) {
          if (entry.kind === 'file') {
            // 파일이 있으면 임시로 chrome.downloads에 기록된 것을 찾기
            chrome.runtime.sendMessage({ action: 'OPEN_FOLDER', savePath: customDirHandle.name });
            return;
          }
        }
      } catch (e) {}
      // 폴더가 비어있거나 검색 실패 → 폴더 이름으로 시도
      chrome.runtime.sendMessage({ action: 'OPEN_FOLDER', savePath: customDirHandle.name });
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
        const testModeCheck = document.getElementById('testModeCheck');
        if (message.status === 'completed' && testModeCheck && testModeCheck.checked) {
          console.log('[Popup] 테스트 모드: completed 스킵 (프롬프트 유지)');
        } else {
          prompts[origIdx].status = message.status;
        }
        // Free 사용자: 생성 완료 시 카운트 증가
        if (message.status === 'completed' && currentTier !== 'pro') {
          incrementFreeUsage().then(() => refreshLicenseBar());
        }
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
