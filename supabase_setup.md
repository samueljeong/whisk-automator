# Step 4: 라이선스 체크 함수

SQL Editor의 기존 내용 전체 지우고, 아래만 붙여넣고 Run

```
CREATE OR REPLACE FUNCTION check_license(p_device_hash TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_license RECORD;
  v_conflict BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_license FROM licenses WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    INSERT INTO licenses (user_id, tier, device_hash, last_login_at)
    VALUES (v_user_id, 'free', p_device_hash, now());
    RETURN json_build_object('tier', 'free', 'expires_at', NULL, 'device_conflict', FALSE);
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

  RETURN json_build_object(
    'tier', CASE WHEN v_license.expires_at IS NOT NULL AND v_license.expires_at < now() THEN 'free' ELSE COALESCE(v_license.tier, 'free') END,
    'expires_at', v_license.expires_at,
    'device_conflict', v_conflict
  );
END;
$$;
```
