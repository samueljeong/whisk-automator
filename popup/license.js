// Supabase OTP 인증 + 라이선스 모듈
const SUPABASE_URL = "https://cyrbibbosfybylsparfk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YPB5wFe6t2ij6dVzdlQYrA_fQf5Sqqm";
const CHECK_LICENSE_URL = `${SUPABASE_URL}/rest/v1/rpc/check_license`;
const REDEEM_COUPON_URL = `${SUPABASE_URL}/rest/v1/rpc/redeem_coupon`;

// Storage 키
const AUTH_TOKEN_KEY = "flow_auth_token";
const LICENSE_CACHE_KEY = "flow_license_cache";
const FREE_USAGE_KEY = "flow_free_usage";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// Free 한도
const FREE_DAILY_LIMIT = 5;


// ─── OTP 인증 ───

async function sendOtp(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.msg || "인증 코드 발송에 실패했습니다");
  }
  return true;
}

async function verifyOtp(email, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      token,
      type: "email",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.msg || err.error_description || "인증 코드가 잘못되었거나 만료되었습니다"
    );
  }

  const data = await res.json();

  await chrome.storage.local.set({
    [AUTH_TOKEN_KEY]: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      email,
    },
  });

  return data;
}

async function signOut() {
  await chrome.storage.local.remove([AUTH_TOKEN_KEY, LICENSE_CACHE_KEY]);
}

// ─── 토큰 관리 ───

async function getAccessToken() {
  const result = await chrome.storage.local.get(AUTH_TOKEN_KEY);
  const auth = result[AUTH_TOKEN_KEY];
  if (!auth) return null;

  // 만료 1분 전까지 유효
  if (auth.expires_at > Date.now() + 60000) {
    return auth.access_token;
  }

  // 만료 임박 → refresh
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
      }
    );

    if (!res.ok) throw new Error("Refresh failed");
    const data = await res.json();

    await chrome.storage.local.set({
      [AUTH_TOKEN_KEY]: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
        email: auth.email,
      },
    });

    return data.access_token;
  } catch {
    // 갱신 실패 → 로그아웃
    await chrome.storage.local.remove(AUTH_TOKEN_KEY);
    return null;
  }
}

async function getAuthEmail() {
  const result = await chrome.storage.local.get(AUTH_TOKEN_KEY);
  return result[AUTH_TOKEN_KEY]?.email || null;
}

// ─── 라이선스 체크 ───

async function checkLicense() {
  const token = await getAccessToken();

  // 비로그인 → Free
  if (!token) {
    const remaining = await getFreeRemaining();
    return { valid: true, tier: "free", daily_remaining: remaining };
  }

  // 마스터 이메일 → 항상 Pro
  const email = await getAuthEmail();
  if (await isMasterEmail(email)) {
    return { valid: true, tier: "pro", email, _master: true };
  }

  // 캐시 확인
  const cached = await getCachedLicense();
  if (cached) {
    return cached;
  }

  // 서버 체크
  const deviceHash = await getDeviceHash();
  try {
    const res = await fetch(CHECK_LICENSE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ p_device_hash: deviceHash }),
    });

    if (!res.ok) {
      // 401 → 토큰 만료, 로그아웃
      if (res.status === 401) {
        await signOut();
        const remaining = await getFreeRemaining();
        return { valid: true, tier: "free", daily_remaining: remaining };
      }
      throw new Error("License check failed");
    }

    const data = await res.json();
    const email = await getAuthEmail();

    const result = {
      valid: true,
      tier: data.tier || "free",
      expires: data.expires_at,
      email: email,
      device_conflict: data.device_conflict || false,
      cancel_at_period_end: data.cancel_at_period_end || false,
    };

    // 디바이스 충돌 → 강제 로그아웃
    if (data.device_conflict) {
      await signOut();
      return { valid: true, tier: "free", device_conflict: true };
    }

    // 캐시 저장 (HMAC 서명 포함)
    const cacheData = { ...result, cached_at: Date.now() };
    const signature = await signCache(cacheData);
    await chrome.storage.local.set({
      [LICENSE_CACHE_KEY]: { ...cacheData, _sig: signature },
    });

    return result;
  } catch (err) {
    DEBUG && console.log("[License] Server error:", err.message);
    // 서버 오류 → 캐시된 값 사용 (없으면 Free)
    const fallback = await getCachedLicense(true);
    if (fallback) return fallback;
    const remaining = await getFreeRemaining();
    return { valid: true, tier: "free", daily_remaining: remaining };
  }
}

async function getCachedLicense(ignoreExpiry = false) {
  const result = await chrome.storage.local.get(LICENSE_CACHE_KEY);
  const cached = result[LICENSE_CACHE_KEY];
  if (!cached) return null;
  if (!ignoreExpiry && Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
  // 무결성 검증
  const { _sig, ...data } = cached;
  if (_sig && !(await verifyCache(data, _sig))) {
    await chrome.storage.local.remove(LICENSE_CACHE_KEY);
    return null;
  }
  return data;
}

// ─── Free 일일 카운트 ───

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getFreeUsageToday() {
  const result = await chrome.storage.local.get(FREE_USAGE_KEY);
  const record = result[FREE_USAGE_KEY];
  if (record && record.date === getTodayKey()) return record.count;
  return 0;
}

async function getFreeRemaining() {
  const used = await getFreeUsageToday();
  return Math.max(0, FREE_DAILY_LIMIT - used);
}

async function incrementFreeUsage() {
  const today = getTodayKey();
  const current = await getFreeUsageToday();
  await chrome.storage.local.set({
    [FREE_USAGE_KEY]: { date: today, count: current + 1 },
  });
  return current + 1;
}

async function canGenerate(count = 1) {
  // 마스터 이메일 → 항상 허용
  const email = await getAuthEmail();
  if (await isMasterEmail(email)) {
    return { allowed: true };
  }

  // 로그인 상태 확인
  const token = await getAccessToken();
  if (token) {
    // Pro 사용자 체크 (캐시에서)
    const cached = await getCachedLicense(true);
    if (cached && cached.tier === "pro") {
      return { allowed: true };
    }
  }

  // Free 한도 체크
  const used = await getFreeUsageToday();
  if (used + count > FREE_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: "daily_limit",
      message: `오늘 무료 한도(${FREE_DAILY_LIMIT}장)를 모두 사용했습니다`,
      used: used,
      limit: FREE_DAILY_LIMIT,
    };
  }
  return { allowed: true, remaining: FREE_DAILY_LIMIT - used };
}

// ─── 디바이스 핑거프린트 ───

async function getDeviceHash() {
  const raw = `${chrome.runtime.id}-${navigator.userAgent}-${screen.width}x${screen.height}`;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── 유틸리티 ───

function formatExpiry(dateStr) {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  } catch {
    return dateStr || "";
  }
}

function formatExpiryShort(dateStr) {
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return dateStr || "";
  }
}

async function getAuthUserId() {
  const result = await chrome.storage.local.get(AUTH_TOKEN_KEY);
  const auth = result[AUTH_TOKEN_KEY];
  if (!auth || !auth.access_token) return null;
  try {
    const payload = JSON.parse(atob(auth.access_token.split('.')[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

// ─── 캐시 무결성 ───
const CACHE_SIGN_KEY = 'flow_cache_sign';

async function signCache(data) {
  const raw = JSON.stringify(data);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(chrome.runtime.id),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyCache(data, signature) {
  const expected = await signCache(data);
  return expected === signature;
}

// ─── 쿠폰 등록 ───

async function redeemCoupon(code) {
  const token = await getAccessToken();
  if (!token) {
    return { error: "unauthorized", message: "로그인이 필요합니다" };
  }

  try {
    const res = await fetch(REDEEM_COUPON_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ p_code: code }),
    });

    if (!res.ok) {
      return { error: "network", message: "서버 연결에 실패했습니다" };
    }

    const data = await res.json();

    // 성공 시 라이선스 캐시 무효화
    if (data.success) {
      await chrome.storage.local.remove(LICENSE_CACHE_KEY);
    }

    return data;
  } catch {
    return { error: "network", message: "서버 연결에 실패했습니다" };
  }
}
