# 쿠폰 등록 시스템 리서치

## 현재 인증/결제 구조

### 인증
- Supabase Email OTP (매직코드)
- `popup/license.js`에서 처리
- 토큰: `chrome.storage.local`에 access_token + refresh_token 저장

### 라이선스 체크
- Supabase RPC `check_license(p_device_hash)` 호출
- 5분 캐시 (`LICENSE_CACHE_KEY`)
- 반환값: `{ tier, expires_at, device_conflict, cancel_at_period_end }`

### DB 테이블: `licenses`
```
user_id UUID (PK, auth.uid())
tier TEXT ("free" | "pro")
device_hash TEXT
last_login_at TIMESTAMP
updated_at TIMESTAMP
expires_at TIMESTAMP
billing_key TEXT (미사용 - 결제 미배포)
plan_type TEXT (미사용)
cancel_at_period_end BOOLEAN
```

### 무료 사용 제한
- 5장/일, **클라이언트 사이드** 트래킹 (`chrome.storage.local`)
- `canGenerate(count)` → 생성 전 게이트
- 개발자 이메일 `zkvp17@naver.com` 바이패스

### UI 라이선스 바 상태
| 상태 | 표시 | 버튼 |
|------|------|------|
| Pro 활성 | "Pro · email · 날짜까지" | 로그아웃, 구독관리 |
| Pro 취소예정 | "Pro · 날짜에 만료" | 로그아웃 |
| 로그인 무료 | "무료 · email · 오늘 N/5장" | 로그아웃, 업그레이드 |
| 비로그인 무료 | "무료 · 오늘 N/5장" | 업그레이드 |

## 쿠폰 시스템 요구사항

1. 관리자(사무엘)가 Supabase DB에서 쿠폰 코드 생성
2. 사용자가 UI에서 쿠폰 코드 입력 → Pro 기간 부여
3. 동일 쿠폰 중복 사용 방지
4. 쿠폰별 최대 사용 횟수 제한
5. 쿠폰 만료일 설정 가능

## 필요한 변경

### Supabase (서버)
1. `coupons` 테이블 생성
2. `coupon_redemptions` 테이블 생성 (중복 방지)
3. `redeem_coupon` RPC 함수 생성

### 클라이언트 (확장)
1. `license.js`에 `redeemCoupon(code)` 함수 추가
2. `popup.html`에 쿠폰 입력 UI 추가
3. `popup.js`에 쿠폰 등록 이벤트 핸들러 추가

## 쿠폰 입력 UI 위치

현재 라이선스 바:
```
[무료 · zkvp17@naver.com · 오늘 0/5장]  [로그아웃] [Pro 업그레이드]
```

쿠폰 버튼 추가 위치 → "Pro 업그레이드" 옆:
```
[무료 · zkvp17@naver.com · 오늘 0/5장]  [로그아웃] [Pro 업그레이드] [쿠폰 등록]
```

비로그인 사용자: 쿠폰 버튼 클릭 시 로그인 화면으로 이동 (쿠폰은 user_id에 연결되므로 로그인 필수)
