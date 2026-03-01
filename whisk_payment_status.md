# 위스크 결제 연동 진행 상황

> 최종 업데이트: 2026-03-01

## 현재 상태: 코드 완료, 사업자등록증 대기

손택스로 개인사업자 등록 신청 완료. 처리까지 1-3 영업일.
사업자등록증 나오면 아래 "재개 시 할 일"을 순서대로 진행.

---

## 완료된 것 (코드)

### 결제 웹페이지
- `payment/index.html` — 포트원 SDK, 빌링키 발급, 월간/연간 선택 UI
- `payment/success.html` — 결제 완료 안내 페이지
- **TODO 플레이스홀더**: `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY` (포트원 가입 후 교체)

### Supabase Edge Functions (3개)
- `supabase/functions/activate-subscription/index.ts` — 빌링키로 첫 결제 + 스케줄 등록
- `supabase/functions/portone-webhook/index.ts` — 웹훅 수신 → DB 갱신 + 체이닝
- `supabase/functions/cancel-subscription/index.ts` — 구독 취소 (기간 만료까지 Pro 유지)

### Chrome 확장 수정
- `popup/popup.js` — upgradeBtn → 결제 페이지 열기, manageSubBtn → 구독 취소
- `popup/popup.js` — `updateLicenseBar()` 4가지 상태: Pro(활성), Pro(취소예정), 로그인Free, 비로그인Free
- `popup/license.js` — `checkLicense()`에서 `cancel_at_period_end` 전달
- `popup/popup.css` — `.license-bar-cancel` 노란색 경고 스타일

### DB 마이그레이션 SQL (미실행)
- `supabase_setup.md` Step 4: `billing_key`, `plan_type`, `cancel_at_period_end` 컬럼 추가
- `supabase_setup.md` Step 5: `check_license` RPC에 `cancel_at_period_end` 반환 추가

---

## 재개 시 할 일 (순서대로)

### 1. 포트원 가입 + PG 연결
- admin.portone.io 가입 (사업자등록증 필요)
- PG사: **나이스페이 포스타트** (초기 비용 0원)
- 테스트 채널 + 실결제 채널 생성
- **Store ID**, **Channel Key**, **API Secret** 확보

### 2. payment/index.html 플레이스홀더 교체
```
PORTONE_STORE_ID = 'YOUR_STORE_ID'   → 실제 값
PORTONE_CHANNEL_KEY = 'YOUR_CHANNEL_KEY'  → 실제 값
```

### 3. Supabase 설정
- SQL Editor에서 `supabase_setup.md` Step 4 실행 (컬럼 추가)
- SQL Editor에서 `supabase_setup.md` Step 5 실행 (RPC 업데이트)
- Edge Function 환경변수 설정:
  - `PORTONE_API_SECRET` — 포트원 API 시크릿
  - `PORTONE_WEBHOOK_SECRET` — 포트원 웹훅 시크릿 (선택)

### 4. Edge Function 배포
```bash
supabase functions deploy activate-subscription
supabase functions deploy cancel-subscription
supabase functions deploy portone-webhook --no-verify-jwt
```

### 5. 결제 페이지 배포
- `payment/` 폴더를 Vercel에 배포
- 도메인: `whisk-payment.vercel.app` (또는 커스텀)
- `popup/popup.js`의 `PAYMENT_PAGE_URL` 확인/수정

### 6. 포트원 대시보드에서 웹훅 URL 등록
- URL: `https://cyrbibbosfybylsparfk.supabase.co/functions/v1/portone-webhook`

### 7. 테스트
- 포트원 테스트 모드로 빌링키 발급 → 첫 결제 확인
- 웹훅 수신 → DB 업데이트 확인
- 구독 취소 → cancel_at_period_end 확인
- 크롬 확장에서 Pro UI 전환 확인

---

## 가격 정책

| 플랜 | 가격 |
|------|------|
| Free | ₩0 (일 5장) |
| Pro 월간 | ₩9,900/월 |
| Pro 연간 | ₩100,000/년 |

## 취소 정책
- 취소 시 즉시 해지 아님 → 기간 만료까지 Pro 유지
- 환불 없음
