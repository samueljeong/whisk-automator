# Stripe 구독 결제 + Supabase 연동 리서치

> 리서치 날짜: 2026-03-01
> 목표: whisk-automator Chrome 확장의 Free/Pro 티어 구독 결제 구현

---

## 1. 현재 whisk-automator 상태 파악

### 인증 구조 (`popup/license.js`)
- Supabase OTP 이메일 인증 사용 중
- `check_license` RPC 함수로 라이선스 확인 (서버사이드)
- `licenses` 테이블에 tier, expires_at 관리
- device_hash로 디바이스 충돌 감지
- Free: 일 5회 제한 (로컬 storage 카운트)
- Pro: 무제한

### 현재 업그레이드 버튼 (`popup/popup.js` 269행)
```javascript
// Pro 업그레이드 버튼 — 현재는 로그인 화면으로 이동만 함
document.getElementById('upgradeBtn')?.addEventListener('click', () => {
  showLoginScreen();
});
```
**결제 흐름이 아직 없음.** 업그레이드 버튼이 로그인 화면만 보여줌.

### 필요한 것
1. 사용자가 "Pro 업그레이드" 클릭 → Stripe 결제 페이지로 이동
2. 결제 완료 → Supabase `licenses` 테이블 업데이트 (tier='pro', expires_at=30일 후)
3. 매달 자동 갱신 또는 만료 처리

---

## 2. 4가지 접근법 비교

### 접근법 A: Stripe Payment Links (가장 간단)

**개요**: Stripe 대시보드에서 URL 생성, 코드 불필요

**장점**:
- 코드 제로 — 대시보드에서 클릭만으로 결제 페이지 생성
- 구독(recurring) 지원
- `prefilled_email`, `client_reference_id` URL 파라미터 지원
- 호스팅 필요 없음

**단점**:
- Stripe 대시보드에서만 상품/가격 관리
- 커스터마이징 제한적
- 할인 쿠폰, 트라이얼 등 고급 기능은 API 필요

**Chrome 확장에서 사용법**:
```javascript
// popup.js에서 업그레이드 버튼 클릭 시
const email = await getAuthEmail();
const userId = /* Supabase user id */;
const paymentUrl = `https://buy.stripe.com/YOUR_LINK_ID`
  + `?prefilled_email=${encodeURIComponent(email)}`
  + `&client_reference_id=${userId}`;
chrome.tabs.create({ url: paymentUrl });
```

**Webhook 연결 필요**: 결제 완료 후 Supabase에 반영하려면 여전히 webhook 필요

---

### 접근법 B: Stripe Checkout Session (추천)

**개요**: Edge Function에서 Checkout Session 생성 → Stripe 호스팅 결제 페이지로 리다이렉트

**장점**:
- Payment Links보다 유연 (메타데이터, 트라이얼, 쿠폰 등)
- 서버사이드에서 세션 생성 → 보안 우수
- 성공/취소 URL 커스터마이징
- customer_email 자동 설정

**단점**:
- Edge Function 코드 작성 필요 (하지만 단순함)
- Supabase Edge Function 배포 필요

**아키텍처**:
```
[Chrome 확장] → [Supabase Edge Function: create-checkout] → [Stripe API]
     ↓                                                            ↓
  새 탭 열기 ←──── checkout URL 반환 ←──────────────────────────┘
     ↓
[Stripe Checkout 페이지] → 결제 완료 → Webhook → [Edge Function: stripe-webhook]
                                                       ↓
                                              [Supabase DB: licenses 업데이트]
```

**Edge Function 코드 (create-checkout)**:
```typescript
import Stripe from 'https://esm.sh/stripe@17?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20',
})

Deno.serve(async (req) => {
  // 1. 인증된 사용자 확인
  const authHeader = req.headers.get('Authorization')!
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Stripe Checkout Session 생성
  const session = await stripe.checkout.sessions.create({
    customer_email: user.email,
    client_reference_id: user.id,  // Supabase user ID
    line_items: [{
      price: Deno.env.get('STRIPE_PRICE_ID')!,  // 월간 구독 가격 ID
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: 'https://your-domain.com/payment-success',
    cancel_url: 'https://your-domain.com/payment-cancel',
  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

---

### 접근법 C: Stripe Customer Portal (구독 관리용)

**개요**: Stripe이 호스팅하는 고객 포털. 결제 수단 변경, 구독 취소, 인보이스 확인.

**용도**: 결제 *시작*이 아니라 기존 구독 *관리*용
- 결제 수단 업데이트
- 구독 취소/다운그레이드
- 인보이스 다운로드

**Chrome 확장에서 사용법**: Pro 사용자에게 "구독 관리" 버튼 제공
```typescript
// Edge Function: create-portal-session
const session = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,  // licenses 테이블에 저장해둔 Stripe customer ID
  return_url: 'https://your-domain.com/settings',
})
return new Response(JSON.stringify({ url: session.url }))
```

---

### 접근법 D: Stripe Checkout + Payment Links 하이브리드

**가장 실용적 접근**:
- **최초 결제**: Payment Link (코드 제로)
- **Webhook**: Supabase Edge Function (DB 업데이트)
- **구독 관리**: Customer Portal (취소, 카드 변경)

---

## 3. Webhook → Supabase 연결 (핵심)

### Supabase Edge Function으로 Stripe Webhook 처리

어떤 접근법이든 **결제 완료를 DB에 반영하는 webhook은 필수**.

**전체 코드 (stripe-webhook Edge Function)**:
```typescript
import Stripe from 'https://esm.sh/stripe@17?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20',
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()

// Supabase Admin 클라이언트 (service_role_key — RLS 우회)
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
      undefined,
      cryptoProvider
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(err.message, { status: 400 })
  }

  console.log(`Event received: ${event.type}`)

  switch (event.type) {
    // ─── 최초 결제 완료 ───
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id  // Supabase user ID
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      if (userId && session.mode === 'subscription') {
        // licenses 테이블 업데이트
        await supabaseAdmin
          .from('licenses')
          .upsert({
            user_id: userId,
            tier: 'pro',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
      }
      break
    }

    // ─── 구독 갱신 (매달 자동 결제 성공) ───
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string

      if (invoice.billing_reason === 'subscription_cycle') {
        // subscription에서 period_end 가져오기
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd = new Date(subscription.current_period_end * 1000)

        await supabaseAdmin
          .from('licenses')
          .update({
            tier: 'pro',
            expires_at: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId)
      }
      break
    }

    // ─── 결제 실패 ───
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string

      // 즉시 다운그레이드하지 않음 — Stripe이 자동 재시도 (보통 3회)
      // 최종 실패 시 customer.subscription.deleted 이벤트가 옴
      console.log(`Payment failed for subscription ${subscriptionId}`)
      break
    }

    // ─── 구독 취소/만료 ───
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const subscriptionId = subscription.id

      await supabaseAdmin
        .from('licenses')
        .update({
          tier: 'free',
          expires_at: null,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscriptionId)
      break
    }

    // ─── 구독 상태 변경 (업/다운그레이드, 일시중지 등) ───
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const status = subscription.status // active, past_due, canceled, etc.

      if (status === 'active') {
        const periodEnd = new Date(subscription.current_period_end * 1000)
        await supabaseAdmin
          .from('licenses')
          .update({
            tier: 'pro',
            expires_at: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
      } else if (status === 'past_due' || status === 'unpaid') {
        // 결제 실패 상태 — 유예 기간 동안은 Pro 유지
        console.log(`Subscription ${subscription.id} status: ${status}`)
      }
      break
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
```

### 필수 처리 이벤트 정리

| 이벤트 | 발생 시점 | 처리 |
|--------|----------|------|
| `checkout.session.completed` | 최초 결제 완료 | tier='pro', expires_at 설정, stripe IDs 저장 |
| `invoice.payment_succeeded` | 매달 자동 결제 성공 | expires_at을 다음 period_end로 갱신 |
| `invoice.payment_failed` | 결제 실패 | 로그만 (Stripe이 자동 재시도) |
| `customer.subscription.deleted` | 최종 취소/만료 | tier='free'로 다운그레이드 |
| `customer.subscription.updated` | 구독 상태 변경 | status에 따라 처리 |

---

## 4. Chrome 확장에서의 결제 흐름 상세

### 핵심 제약: Chrome 확장은 서버가 아님

Chrome 확장은 클라이언트 코드만 가능. Stripe Secret Key를 확장에 넣으면 안 됨.
→ **반드시 서버사이드 (Supabase Edge Function)를 경유해야 함.**

### 결제 시작 흐름 (2가지 옵션)

#### 옵션 1: Payment Link 방식 (서버 불필요)
```
[사용자] "Pro 업그레이드" 클릭
    ↓
[popup.js] Stripe Payment Link URL 생성
  - prefilled_email=user@email.com
  - client_reference_id=supabase_user_id
    ↓
[chrome.tabs.create] 새 탭에서 Stripe 결제 페이지 열기
    ↓
[Stripe] 결제 완료 → webhook → Edge Function → DB 업데이트
    ↓
[확장] 다음 checkLicense() 호출 시 Pro 확인됨
```

#### 옵션 2: Checkout Session 방식 (서버 경유)
```
[사용자] "Pro 업그레이드" 클릭
    ↓
[popup.js] Edge Function 'create-checkout' 호출 (access_token 포함)
    ↓
[Edge Function] Stripe Checkout Session 생성, URL 반환
    ↓
[popup.js] chrome.tabs.create({ url: session.url })
    ↓
[Stripe] 결제 완료 → webhook → Edge Function → DB 업데이트
    ↓
[확장] 다음 checkLicense() 호출 시 Pro 확인됨
```

### 결제 완료 감지 (확장 내)

결제 후 Stripe 성공 페이지에서 확장으로 돌아올 때:
1. **가장 간단**: 성공 URL을 자체 페이지로 설정 → 그 페이지에서 `checkLicense()` 재실행
2. **더 즉각적**: Background service worker에서 탭 URL 모니터링 → 성공 URL 감지 시 라이선스 캐시 갱신
3. **가장 단순**: 아무 것도 안 함 — 기존 5분 캐시 TTL 후 자동 갱신됨

---

## 5. licenses 테이블 스키마 변경 필요사항

현재 테이블에 Stripe 관련 컬럼이 없을 것으로 예상. 추가 필요:

```sql
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
```

---

## 6. 자동 갱신/만료 처리

### Stripe이 알아서 해주는 것
- 월간 구독 생성 → Stripe이 매달 자동 청구
- 결제 실패 시 자동 재시도 (기본 3회, 설정 가능)
- 최종 실패 시 구독 자동 취소

### 우리가 해야 하는 것
- **`invoice.payment_succeeded` webhook**: expires_at을 다음 billing period end로 갱신
- **`customer.subscription.deleted` webhook**: tier를 'free'로 변경
- **check_license RPC**: expires_at이 지났으면 tier='free' 반환 (방어 로직)

### 만료 안전장치 (check_license 함수에 추가)
```sql
-- 기존 check_license 함수에 추가:
-- expires_at이 지났으면 webhook를 못 받았더라도 free로 처리
IF license_row.expires_at IS NOT NULL AND license_row.expires_at < NOW() THEN
  RETURN json_build_object('tier', 'free', 'expired', true);
END IF;
```

---

## 7. 추천 아키텍처 (솔로 개발자 최적)

### Payment Link + Webhook Edge Function (하이브리드)

**이유**:
- Payment Link: 서버 코드 없이 결제 페이지 생성 (Stripe 대시보드에서)
- Webhook Edge Function: 결제 결과를 DB에 반영 (필수, 약 100줄)
- Customer Portal: 구독 관리 (Stripe 제공, 설정만 하면 됨)

**구현 범위**:
1. Stripe 대시보드: 상품/가격 생성, Payment Link 생성
2. Supabase Edge Function 1개: `stripe-webhook` (위 코드)
3. DB 마이그레이션: stripe 컬럼 추가
4. Chrome 확장: upgradeBtn 클릭 → Payment Link URL 열기 (5줄)

**총 코드량**: Edge Function ~100줄 + 확장 수정 ~10줄

### 대안: Checkout Session 방식

Payment Link보다 나은 점:
- `client_reference_id`를 서버에서 안전하게 설정 (Payment Link은 URL에 노출)
- 더 많은 메타데이터 첨부 가능
- 동적 가격/할인 적용 가능

추가 작업:
- Edge Function 1개 더: `create-checkout` (~40줄)
- 확장에서 fetch 호출 필요

**처음엔 Payment Link으로 시작, 필요 시 Checkout Session으로 전환 추천.**

---

## 8. 구현 순서 (계획 아님, 리서치 기반 작업 목록)

1. **Stripe 대시보드 설정**
   - 계정 생성/로그인
   - Product 생성 (Whisk Pro, 월간 구독)
   - Price 설정 ($X/month)
   - Payment Link 생성 (recurring mode)
   - Webhook endpoint 설정

2. **Supabase DB 마이그레이션**
   - licenses 테이블에 stripe 컬럼 추가

3. **Supabase Edge Function 배포**
   - `stripe-webhook` 함수 생성
   - 환경 변수 설정 (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SIGNING_SECRET)
   - Stripe webhook URL을 Edge Function URL로 설정

4. **Chrome 확장 수정**
   - `popup/popup.js`: upgradeBtn 클릭 → Payment Link 열기
   - `popup/license.js`: check_license 만료 방어 로직 (이미 서버에서 처리하면 불필요)
   - host_permissions에 `https://buy.stripe.com/*` 추가 (필요 시)

5. **테스트**
   - Stripe 테스트 모드에서 결제 → webhook 수신 → DB 확인
   - stripe CLI로 로컬 webhook 테스트: `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`

---

## 9. 주의사항 / 함정

### 보안
- Stripe Secret Key는 **절대** Chrome 확장에 넣지 말 것 → Edge Function 환경 변수에만
- Webhook은 반드시 서명 검증 (`constructEventAsync`)
- `client_reference_id`를 URL에 넣으면 사용자가 변조 가능 → Checkout Session이 더 안전

### 멱등성 (Idempotency)
- Stripe은 같은 webhook을 여러 번 보낼 수 있음
- upsert 사용하거나 event ID로 중복 방지

### Payment Link의 email 문제
- `prefilled_email`은 사용자가 수정 가능
- 다른 이메일로 결제하면 Supabase user와 매칭 안 될 수 있음
- 해결: `client_reference_id`로 user_id를 전달하면 email이 달라도 매칭 가능

### Supabase Edge Function 무료 한도
- 월 500,000 invocations (무료 플랜)
- webhook 호출은 결제 이벤트당 1회이므로 충분

---

## 출처

- [Supabase: Handling Stripe Webhooks with Edge Functions](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
- [Stripe: Build a subscription integration](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [Stripe: Payment Links (no-code)](https://stripe.com/payments/payment-links)
- [Stripe: Track a payment link (URL parameters)](https://docs.stripe.com/payment-links/url-parameters)
- [Stripe: Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe: How subscriptions work](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe: Customer Portal (self-service)](https://docs.stripe.com/customer-management)
- [DEV.to: How to integrate Stripe into a Chrome extension](https://dev.to/notearthian/how-to-integrate-stripe-payments-into-a-chrome-extension-step-by-step-2gf3)
- [GitHub: Supabase Stripe webhook example](https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/stripe-webhooks/index.ts)
- [Medium: Stripe Subscriptions with Supabase, Next.js, and FastAPI](https://medium.com/@ojasskapre/implementing-stripe-subscriptions-with-supabase-next-js-and-fastapi-666e1aada1b5)
- [GitHub: Supabase stripe-sync-engine](https://github.com/supabase/stripe-sync-engine)
- [Stripe: Customize checkout for Payment Links](https://docs.stripe.com/payment-links/customize)
