-- Step 4: 결제 관련 컬럼 추가
ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS billing_key TEXT,
  ADD COLUMN IF NOT EXISTS plan_type TEXT CHECK (plan_type IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Step 5: check_license RPC 업데이트
CREATE OR REPLACE FUNCTION check_license(p_device_hash TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_license RECORD;
  v_conflict BOOLEAN := FALSE;
  v_tier TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_license FROM licenses WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO licenses (user_id, tier, device_hash, last_login_at)
    VALUES (v_user_id, 'free', p_device_hash, now());
    RETURN json_build_object(
      'tier', 'free',
      'expires_at', NULL,
      'device_conflict', FALSE,
      'cancel_at_period_end', FALSE
    );
  END IF;

  IF v_license.device_hash IS NOT NULL
     AND p_device_hash IS NOT NULL
     AND v_license.device_hash != p_device_hash THEN
    v_conflict := TRUE;
  END IF;

  UPDATE licenses
  SET device_hash = COALESCE(p_device_hash, device_hash),
      last_login_at = now(),
      updated_at = now()
  WHERE user_id = v_user_id;

  -- 만료일이 지났으면 free로 전환
  v_tier := CASE
    WHEN v_license.expires_at IS NOT NULL AND v_license.expires_at < now() THEN 'free'
    ELSE COALESCE(v_license.tier, 'free')
  END;

  RETURN json_build_object(
    'tier', v_tier,
    'expires_at', v_license.expires_at,
    'device_conflict', v_conflict,
    'cancel_at_period_end', COALESCE(v_license.cancel_at_period_end, FALSE)
  );
END;
$$;
