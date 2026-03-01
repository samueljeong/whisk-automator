# Supabase 설정 SQL

아래를 복사해서 Supabase SQL Editor에 붙여넣고 Run 클릭

```sql
CREATE TABLE licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  expires_at TIMESTAMPTZ,
  device_hash TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own license"
  ON licenses FOR SELECT
  USING (auth.uid() = user_id);
```
