-- ============================================
-- 쿠폰 시스템 SQL (Supabase SQL Editor에서 실행)
-- ============================================

-- 1. coupons 테이블
CREATE TABLE coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  days INTEGER NOT NULL DEFAULT 30,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_coupons_code ON coupons(code);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read coupons"
  ON coupons FOR SELECT TO authenticated USING (true);

-- 2. coupon_redemptions 테이블
CREATE TABLE coupon_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coupon_id, user_id)
);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own redemptions"
  ON coupon_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own redemptions"
  ON coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. redeem_coupon RPC 함수
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

  SELECT * INTO v_coupon FROM coupons WHERE code = UPPER(TRIM(p_code)) AND active = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invalid_code', 'message', '유효하지 않은 쿠폰 코드입니다');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN json_build_object('error', 'expired', 'message', '만료된 쿠폰입니다');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN json_build_object('error', 'used_up', 'message', '이미 모두 소진된 쿠폰입니다');
  END IF;

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

  UPDATE licenses
  SET tier = 'pro',
      expires_at = v_new_expires,
      cancel_at_period_end = FALSE,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO coupon_redemptions (coupon_id, user_id) VALUES (v_coupon.id, v_user_id);

  UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;

  RETURN json_build_object(
    'success', TRUE,
    'message', v_coupon.days || '일 Pro가 적용되었습니다!',
    'days', v_coupon.days,
    'expires_at', v_new_expires
  );
END;
$$;

-- ============================================
-- 쿠폰 생성 예시 (필요할 때 실행)
-- ============================================

-- 유튜브 댓글 이벤트용 1인 1회 쿠폰 (30일)
-- INSERT INTO coupons (code, days, max_uses) VALUES ('YOUTUBE01', 30, 1);
-- INSERT INTO coupons (code, days, max_uses) VALUES ('YOUTUBE02', 30, 1);

-- 프로모션 쿠폰 (7일, 100명까지)
-- INSERT INTO coupons (code, days, max_uses) VALUES ('LAUNCH2026', 7, 100);
