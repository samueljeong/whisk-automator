// License validation module
const LICENSE_SERVER = 'https://whisk-license.onrender.com';
const CACHE_KEY = 'whisk_license';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const OFFLINE_GRACE = 7 * 24 * 60 * 60 * 1000; // 7 days
const REQUEST_TIMEOUT = 15000; // 15s for Render cold start

async function checkLicense() {
  const cached = await getCachedLicense();

  // Valid cache exists
  if (cached && cached.valid) {
    const age = Date.now() - cached.timestamp;

    // Cache fresh enough, use it
    if (age < CACHE_DURATION) {
      return { valid: true, expires: cached.expires, cached: true };
    }

    // Cache stale, try server refresh
    const result = await validateWithServer(cached.key);
    if (result) return result;

    // Server unreachable but within offline grace period
    if (age < OFFLINE_GRACE) {
      return { valid: true, expires: cached.expires, cached: true, offline: true };
    }
  }

  // No valid cache, try server with cached key
  if (cached && cached.key) {
    const result = await validateWithServer(cached.key);
    if (result) return result;
  }

  return { valid: false };
}

async function submitLicenseKey(key) {
  key = key.trim().toUpperCase();

  // Format check
  const parts = key.split('-');
  if (parts.length !== 3 || parts[0] !== 'WHISK' || parts[1].length !== 4 || parts[2].length !== 4) {
    return { valid: false, error: 'WHISK-XXXX-XXXX 형식으로 입력해주세요' };
  }

  const result = await validateWithServer(key);
  if (!result) {
    return { valid: false, error: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' };
  }
  return result;
}

async function validateWithServer(key) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const resp = await fetch(`${LICENSE_SERVER}/api/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await resp.json();

    if (data.valid) {
      await cacheLicense(key, data.expires);
      return { valid: true, expires: data.expires };
    }

    // Invalid or expired - clear cache
    await clearLicenseCache();
    return { valid: false, error: data.error || '유효하지 않은 키입니다' };
  } catch (e) {
    console.log('[License] Server unreachable:', e.message);
    return null; // Server unreachable
  }
}

async function cacheLicense(key, expires) {
  await chrome.storage.local.set({
    [CACHE_KEY]: { key, expires, valid: true, timestamp: Date.now() }
  });
}

async function getCachedLicense() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return result[CACHE_KEY] || null;
}

async function clearLicenseCache() {
  await chrome.storage.local.remove(CACHE_KEY);
}

function formatExpiry(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  } catch {
    return dateStr;
  }
}
