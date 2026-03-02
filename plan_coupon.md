# 쿠폰 등록 시스템 구현 계획

> 리서치: `research_coupon.md` 참조

## 개요

사용자가 쿠폰 코드를 입력하면 Pro 기간이 부여되는 시스템.
관리자(사무엘)가 Supabase SQL Editor에서 쿠폰을 생성하고,
사용자는 확장 UI에서 코드를 입력해 등록한다.

---

## 단계 1: Supabase 테이블 생성

- [x] `coupons` 테이블

```sql
CREATE TABLE coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- 쿠폰 코드 (예: "LAUNCH2026")
  days INTEGER NOT NULL DEFAULT 30,   -- Pro 부여 일수
  max_uses INTEGER DEFAULT 1,         -- 최대 사용 횟수 (NULL = 무제한)
  used_count INTEGER DEFAULT 0,       -- 현재 사용 횟수
  expires_at TIMESTAMPTZ,             -- 쿠폰 만료일 (NULL = 무제한)
  created_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT TRUE         -- 관리자가 비활성화 가능
);

-- 코드 검색 성능
CREATE INDEX idx_coupons_code ON coupons(code);

-- RLS: 쿠폰 읽기는 인증된 사용자 누구나, 수정은 불가
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read coupons"
  ON coupons FOR SELECT TO authenticated USING (true);
```

- [x] `coupon_redemptions` 테이블 (중복 사용 방지)

```sql
CREATE TABLE coupon_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coupon_id, user_id)  -- 한 사용자가 같은 쿠폰 중복 사용 방지
);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own redemptions"
  ON coupon_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own redemptions"
  ON coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
```

---

## 단계 2: Supabase RPC 함수

- [x] `redeem_coupon(p_code TEXT)` 함수

```sql
CREATE OR REPLACE FUNCTION redeem_coupon(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_coupon RECORD;
  v_already BOOLEAN;
  v_new_expires TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized', 'message', '로그인이 필요합니다');
  END IF;

  -- 쿠폰 조회
  SELECT * INTO v_coupon FROM coupons WHERE code = UPPER(TRIM(p_code)) AND active = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invalid_code', 'message', '유효하지 않은 쿠폰 코드입니다');
  END IF;

  -- 만료 체크
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN json_build_object('error', 'expired', 'message', '만료된 쿠폰입니다');
  END IF;

  -- 사용 횟수 체크
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN json_build_object('error', 'used_up', 'message', '이미 모두 소진된 쿠폰입니다');
  END IF;

  -- 중복 사용 체크
  SELECT EXISTS(
    SELECT 1 FROM coupon_redemptions WHERE coupon_id = v_coupon.id AND user_id = v_user_id
  ) INTO v_already;
  IF v_already THEN
    RETURN json_build_object('error', 'already_redeemed', 'message', '이미 사용한 쿠폰입니다');
  END IF;

  -- Pro 기간 계산: 기존 만료일이 미래면 거기에 추가, 아니면 지금부터
  SELECT expires_at INTO v_new_expires FROM licenses WHERE user_id = v_user_id;
  IF v_new_expires IS NOT NULL AND v_new_expires > now() THEN
    v_new_expires := v_new_expires + (v_coupon.days || ' days')::INTERVAL;
  ELSE
    v_new_expires := now() + (v_coupon.days || ' days')::INTERVAL;
  END IF;

  -- licenses 업데이트
  UPDATE licenses
  SET tier = 'pro',
      expires_at = v_new_expires,
      cancel_at_period_end = FALSE,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- redemption 기록
  INSERT INTO coupon_redemptions (coupon_id, user_id) VALUES (v_coupon.id, v_user_id);

  -- used_count 증가
  UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;

  RETURN json_build_object(
    'success', TRUE,
    'message', v_coupon.days || '일 Pro가 적용되었습니다!',
    'days', v_coupon.days,
    'expires_at', v_new_expires
  );
END;
$$;
```

핵심 로직:
- 쿠폰 코드는 대문자 변환 후 비교 (`UPPER(TRIM(p_code))`)
- 기존 Pro 기간이 남아있으면 **기간 연장** (덮어쓰기 아님)
- `SECURITY DEFINER`로 RLS 우회하여 licenses 테이블 직접 수정

---

## 단계 3: 클라이언트 — `license.js`에 함수 추가

- [x] `redeemCoupon(code)` 함수

```javascript
const REDEEM_COUPON_URL = `${SUPABASE_URL}/rest/v1/rpc/redeem_coupon`;

async function redeemCoupon(code) {
  const token = await getAccessToken();
  if (!token) {
    return { error: 'unauthorized', message: '로그인이 필요합니다' };
  }

  const res = await fetch(REDEEM_COUPON_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ p_code: code }),
  });

  if (!res.ok) {
    return { error: 'network', message: '서버 연결에 실패했습니다' };
  }

  const data = await res.json();

  // 성공 시 라이선스 캐시 무효화
  if (data.success) {
    await chrome.storage.local.remove(LICENSE_CACHE_KEY);
  }

  return data;
}
```

---

## 단계 4: UI — `popup.html` 변경

- [x] 라이선스 바에 "쿠폰 등록" 버튼 추가
- [x] 쿠폰 입력 모달 추가

### 4-1. 라이선스 바 버튼

`upgradeBtn` 옆에 추가:
```html
<button id="couponBtn" class="btn btn-small btn-coupon" hidden>쿠폰 등록</button>
```

### 4-2. 쿠폰 모달

기존 모달 패턴(`captureModal`)과 동일한 구조:
```html
<div id="couponModal" class="modal" hidden>
  <div class="modal-content">
    <h3>쿠폰 등록</h3>
    <div class="modal-form">
      <div class="form-group">
        <label for="couponCodeInput">쿠폰 코드:</label>
        <input type="text" id="couponCodeInput" placeholder="쿠폰 코드를 입력하세요" spellcheck="false" autocomplete="off">
      </div>
    </div>
    <p class="coupon-result" id="couponResult" hidden></p>
    <div class="modal-actions">
      <button id="cancelCouponBtn" class="btn btn-small btn-secondary">취소</button>
      <button id="submitCouponBtn" class="btn btn-small btn-primary">등록</button>
    </div>
  </div>
</div>
```

---

## 단계 5: UI — `popup.css` 스타일 추가

- [x] 쿠폰 버튼 + 결과 메시지 스타일

```css
/* 쿠폰 버튼 */
.btn-coupon {
  background: #2d2d44;
  color: #a78bfa;
  border: 1px solid #a78bfa;
}
.btn-coupon:hover {
  background: #3d3d54;
}

/* 쿠폰 결과 메시지 */
.coupon-result {
  font-size: 12px;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  text-align: center;
}
.coupon-result.success {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}
.coupon-result.error {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}
```

---

## 단계 6: 이벤트 핸들러 — `popup.js`

- [x] 쿠폰 버튼/모달 이벤트 로직

### 6-1. `updateLicenseBar()`에 쿠폰 버튼 표시 로직

```javascript
const couponBtn = document.getElementById('couponBtn');
// Free 사용자 (로그인/비로그인 모두)에게 쿠폰 버튼 표시
// Pro 사용자에게도 기간 연장용으로 표시
couponBtn.hidden = false;
```

### 6-2. 쿠폰 버튼 클릭

```javascript
document.getElementById('couponBtn')?.addEventListener('click', async () => {
  const email = await getAuthEmail();
  if (!email) {
    showLoginScreen(); // 비로그인 → 로그인 유도
    return;
  }
  // 모달 표시
  document.getElementById('couponModal').hidden = false;
  document.getElementById('couponCodeInput').value = '';
  document.getElementById('couponResult').hidden = true;
  document.getElementById('couponCodeInput').focus();
});
```

### 6-3. 등록/취소 버튼

```javascript
document.getElementById('submitCouponBtn')?.addEventListener('click', async () => {
  const code = document.getElementById('couponCodeInput').value.trim();
  if (!code) return;

  const btn = document.getElementById('submitCouponBtn');
  btn.disabled = true;
  btn.textContent = '확인 중...';

  const result = await redeemCoupon(code);
  const resultEl = document.getElementById('couponResult');
  resultEl.hidden = false;

  if (result.success) {
    resultEl.textContent = result.message; // "30일 Pro가 적용되었습니다!"
    resultEl.className = 'coupon-result success';
    // 라이선스 바 새로고침
    await refreshLicenseBar();
    // 1.5초 후 모달 닫기
    setTimeout(() => {
      document.getElementById('couponModal').hidden = true;
    }, 1500);
  } else {
    resultEl.textContent = result.message;
    resultEl.className = 'coupon-result error';
  }

  btn.disabled = false;
  btn.textContent = '등록';
});

document.getElementById('cancelCouponBtn')?.addEventListener('click', () => {
  document.getElementById('couponModal').hidden = true;
});
```

---

## 단계 7: 관리자 쿠폰 생성 가이드

- [x] SQL 예시를 `supabase_coupon.sql`로 별도 파일 생성

관리자(사무엘)가 Supabase SQL Editor에서 직접 생성:
```sql
-- 유튜브 댓글 이벤트용 1인 1회 쿠폰 (30일)
INSERT INTO coupons (code, days, max_uses) VALUES ('YOUTUBE01', 30, 1);
INSERT INTO coupons (code, days, max_uses) VALUES ('YOUTUBE02', 30, 1);

-- 다수 사용 가능한 프로모션 쿠폰 (7일, 100명까지)
INSERT INTO coupons (code, days, max_uses) VALUES ('LAUNCH2026', 7, 100);

-- 무제한 쿠폰 (테스트용)
INSERT INTO coupons (code, days, max_uses) VALUES ('TESTPRO', 30, NULL);
```

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `popup/license.js` | `redeemCoupon()` 함수 + URL 상수 추가 |
| `popup/popup.html` | 쿠폰 버튼 (라이선스 바) + 쿠폰 모달 |
| `popup/popup.css` | 쿠폰 버튼/결과 스타일 |
| `popup/popup.js` | `updateLicenseBar()`에 쿠폰 버튼 로직 + 이벤트 핸들러 |

Supabase는 SQL Editor에서 수동 실행 (코드 변경 아님):
- `coupons` 테이블
- `coupon_redemptions` 테이블
- `redeem_coupon` RPC 함수

---

## 트레이드오프

**쿠폰 코드 생성을 수동(SQL)으로 하는 이유:**
- 관리자 UI를 별도로 만들 필요 없음 (사용 빈도 낮음)
- Supabase Dashboard에서 테이블 직접 확인/수정 가능
- 나중에 필요하면 Edge Function으로 자동 생성 추가 가능

**Pro 사용자에게도 쿠폰 버튼 표시하는 이유:**
- 쿠폰이 기존 기간에 "추가"되므로 Pro도 사용 가능해야 함
- 숨기면 기간 연장 기회를 놓침
