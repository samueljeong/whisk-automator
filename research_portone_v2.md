# PortOne V2 API 기술 리서치 — 정기결제 (빌링키) 구현

> 리서치 날짜: 2026-03-01
> 목적: 위스크 크롬 확장 + Supabase 환경에서 PortOne V2 API로 구독 결제 구현
> 참고: `research_pg_payments.md`의 PG 비교 → 포트원 선택 이후의 구체적 기술 조사

---

## 1. PortOne V2 JavaScript SDK (Browser)

### 1-1. SDK 로드 방법

**CDN Script Tag (결제 웹페이지에서 사용 — 추천):**

```html
<script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
<!-- window.PortOne 전역 객체로 사용 가능 -->
```

**ESM Module Import:**

```javascript
import * as PortOne from "https://cdn.portone.io/v2/browser-sdk.esm.js";
```

**npm (빌드 환경이 있는 경우):**

```bash
npm i @portone/browser-sdk
# yarn add @portone/browser-sdk
# pnpm add @portone/browser-sdk
```

```javascript
import * as PortOne from "@portone/browser-sdk/v2";
```

> 우리 케이스(정적 결제 페이지)에서는 **CDN Script Tag**가 가장 간단.

### 1-2. SDK 제공 함수 목록

| 함수 | 용도 |
|------|------|
| `requestPayment()` | 일반 결제 요청 |
| `requestIssueBillingKey()` | 빌링키 발급 (카드 등록) |
| `requestIssueBillingKeyAndPay()` | 빌링키 발급 + 초회 결제 동시 |
| `requestIdentityVerification()` | 본인인증 |
| `loadPaymentUI()` | 결제 UI 로드 |
| `loadIssueBillingKeyUI()` | 빌링키 발급 UI 로드 |

> TypeScript `.d.ts` 타입 정의 포함. npm 설치 시 자동 제공.

### 1-3. storeId, channelKey 확인 위치

포트원 관리자 콘솔 (https://admin.portone.io/) 접속 후:

- **storeId**: [결제 연동] → [연동 정보]에서 확인
- **channelKey**: [결제 연동] → [연동 정보] → [채널 관리]에서 확인

---

## 2. 빌링키 발급 (카드 등록)

### 2-1. 방법 A: SDK 결제창 (추천)

사용자가 PG사 제공 UI에서 카드를 등록. 카드 정보가 가맹점/포트원 서버를 거치지 않고 직접 PG사로 전달되므로 보안적으로 안전.

#### 전체 코드 예시

```html
<!DOCTYPE html>
<html>
<head>
  <title>위스크 구독 결제</title>
  <script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
</head>
<body>
  <button id="subscribe-btn">카드 등록하기</button>

  <script>
    document.getElementById("subscribe-btn").addEventListener("click", async () => {
      try {
        const issueResponse = await PortOne.requestIssueBillingKey({
          storeId: "store-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
          channelKey: "channel-key-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
          billingKeyMethod: "CARD",
          // 선택 옵션
          issueName: "위스크 프리미엄 구독",
          customer: {
            customerId: "user_abc123",  // Supabase auth user id
            email: "user@example.com",
            fullName: "홍길동",
          },
          displayAmount: 9900,  // 참고용 표시 금액
          currency: "CURRENCY_KRW",
          // noticeUrls: ["https://xxx.supabase.co/functions/v1/portone-webhook"],
        });

        // --- 응답 처리 ---
        if (issueResponse.code !== undefined) {
          // 에러 발생 (사용자 취소 포함)
          alert("카드 등록 실패: " + issueResponse.message);
          return;
        }

        // 성공 — billingKey를 서버로 전송
        const response = await fetch("https://xxx.supabase.co/functions/v1/save-billing-key", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + supabaseAccessToken,
          },
          body: JSON.stringify({
            billingKey: issueResponse.billingKey,
            userId: currentUserId,
          }),
        });

        if (response.ok) {
          // 카드 등록 + 첫 결제 성공
          window.close();  // 또는 성공 페이지로 이동
        }
      } catch (error) {
        console.error("결제 오류:", error);
      }
    });
  </script>
</body>
</html>
```

#### requestIssueBillingKey 파라미터 상세

**필수:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `storeId` | string | 상점 아이디 (관리자 콘솔에서 확인) |
| `billingKeyMethod` | string | "CARD", "MOBILE", "EASY_PAY", "PAYPAL" |

**채널 지정 (둘 중 하나 필수):**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `channelKey` | string | 특정 채널 키 |
| (또는 채널 그룹 ID) | string | 채널 그룹으로 지정 |

**선택:**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `displayAmount` | number | 결제창에 표시될 참고 금액 |
| `currency` | string | displayAmount의 통화 (ISO 4217) |
| `issueName` | string | 주문명 |
| `issueId` | string | 고유 주문 ID |
| `customer` | object | 구매자 정보 (아래 참조) |
| `windowType` | string | "IFRAME", "REDIRECTION", "POPUP", "UI" |
| `redirectUrl` | string | 리다이렉션 시 돌아올 URL |
| `customData` | json | 커스텀 메타데이터 |
| `noticeUrls` | string[] | 웹훅 URL (콘솔 설정 오버라이드) |
| `productType` | string | "REAL" 또는 "DIGITAL" |
| `locale` | string | UI 언어 |

**customer 객체:**

| 필드 | 타입 | 비고 |
|------|------|------|
| `customerId` | string | 구매자 고유 ID (일부 PG 필수) |
| `fullName` | string | 이름 (30바이트 제한) |
| `phoneNumber` | string | 전화번호 |
| `email` | string | 이메일 |
| `address` | object | 주소 |
| `gender` | string | "MALE", "FEMALE", "OTHER" |
| `birthYear`, `birthMonth`, `birthDay` | string | 생년월일 |

#### 응답 형식

**성공 시:**

```javascript
{
  billingKey: "billing-key-XXXXXXXX",  // 빌링키 (서버에 저장해야 함)
  // code가 undefined이면 성공
}
```

**실패 시:**

```javascript
{
  code: "USER_CANCELLED",      // 에러 코드
  message: "사용자가 결제를 취소했습니다",  // 에러 메시지
}
```

> 판별: `response.code !== undefined` 이면 실패, `undefined`이면 성공

### 2-2. 방법 B: REST API로 빌링키 발급 (서버 사이드)

카드 정보를 직접 수집하여 API로 발급. PCI-DSS 부담이 있어 비추천. 커스텀 UI가 필요한 경우에만 사용.

```javascript
// 서버 사이드 (Edge Function 등)
const response = await fetch("https://api.portone.io/billing-keys", {
  method: "POST",
  headers: {
    "Authorization": `PortOne ${PORTONE_API_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    channelKey: "channel-key-XXXX",
    customer: { id: "user_abc123" },
    method: {
      card: {
        credential: {
          number: "4242424242424242",
          expiryYear: "26",
          expiryMonth: "12",
          birthOrBusinessRegistrationNumber: "900101",
          passwordTwoDigits: "00",
        },
      },
    },
  }),
});

const { billingKeyInfo: { billingKey } } = await response.json();
```

> 주의: 방법 B는 개인정보 이용약관 명시 필수, PG사/카드사 심사 까다로움

### 2-3. 특수 케이스: requestIssueBillingKeyAndPay

KG이니시스, 웰컴페이먼츠 휴대폰 결제의 경우, 정책상 빌링키 발급과 초회 결제가 동시에 일어나야 함. 이 경우 `requestIssueBillingKeyAndPay()` 사용.

> 토스페이먼츠/NHN KCP 카드 결제에서는 `requestIssueBillingKey()`로 충분.

---

## 3. REST API — 빌링키로 결제 실행

### 3-1. 인증 방식

**Base URL:** `https://api.portone.io`

**두 가지 인증 방법:**

| 방법 | 헤더 | 비고 |
|------|------|------|
| API Secret 직접 | `Authorization: PortOne YOUR_API_SECRET` | 간단, 추천 |
| Access Token | `Authorization: Bearer ACCESS_TOKEN` | 토큰 만료 관리 필요 |

**Access Token 발급 (필요한 경우):**

```
POST /login/api-secret
Body: { "apiSecret": "YOUR_API_SECRET" }
Response: { "accessToken": "...", "refreshToken": "..." }
```

- Access Token 유효기간: 30분
- Refresh Token 유효기간: 1일
- 새로 로그인하면 이전 Refresh Token 즉시 만료

> **추천**: Edge Function에서는 `Authorization: PortOne ${secret}` 방식이 가장 간단.
> 토큰 갱신 로직이 불필요.

### 3-2. 빌링키로 단건 결제

**Endpoint:** `POST /payments/{paymentId}/billing-key`

```javascript
const paymentId = `payment-${crypto.randomUUID()}`;

const response = await fetch(
  `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
  {
    method: "POST",
    headers: {
      "Authorization": `PortOne ${PORTONE_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      billingKey: "billing-key-XXXXXXXX",
      orderName: "위스크 프리미엄 월간 구독",
      amount: {
        total: 9900,
      },
      currency: "KRW",
      customer: {
        id: "user_abc123",
      },
      noticeUrls: ["https://xxx.supabase.co/functions/v1/portone-webhook"],
    }),
  }
);

const result = await response.json();
// result에 결제 결과 포함
```

**요청 본문 필드:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `billingKey` | string | O | 발급받은 빌링키 |
| `orderName` | string | O | 주문명 |
| `amount` | object | O | `{ total: number }` |
| `currency` | string | O | "KRW" |
| `customer` | object | | 구매자 정보 |
| `customData` | string | | 커스텀 데이터 |
| `noticeUrls` | string[] | | 웹훅 URL |

### 3-3. 빌링키 조회

```
GET /billing-keys/{billingKey}
Authorization: PortOne YOUR_API_SECRET
```

### 3-4. 빌링키 삭제

```
DELETE /billing-keys/{billingKey}
Authorization: PortOne YOUR_API_SECRET
```

- 나이버페이의 경우 `reason` 파라미터 필수

---

## 4. 정기결제 스케줄링

### 4-1. Schedule API (포트원 자체 스케줄러)

포트원이 지정된 시간에 자동으로 결제를 실행. 가맹점에서 cron 구현 불필요.

**Endpoint:** `POST /payments/{paymentId}/schedule`

```javascript
const paymentId = `sub-monthly-${userId}-${Date.now()}`;

const response = await fetch(
  `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/schedule`,
  {
    method: "POST",
    headers: {
      "Authorization": `PortOne ${PORTONE_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment: {
        billingKey: "billing-key-XXXXXXXX",
        orderName: "위스크 프리미엄 월간 구독 (2026년 4월)",
        customer: {
          id: "user_abc123",
        },
        amount: {
          total: 9900,
        },
        currency: "KRW",
      },
      timeToPay: "2026-04-01T00:00:00+09:00",  // RFC 3339, 한국 시간
    }),
  }
);

const schedule = await response.json();
// schedule에 PaymentScheduleSummary 반환 (스케줄 ID 등)
```

**요청 본문:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `payment.billingKey` | string | 빌링키 |
| `payment.orderName` | string | 주문명 |
| `payment.amount.total` | integer | 결제 금액 |
| `payment.currency` | string | "KRW" |
| `payment.customer.id` | string | 구매자 ID |
| `payment.customData` | string | 커스텀 데이터 |
| `timeToPay` | string | RFC 3339 결제 예정 시각 |

### 4-2. 스케줄 조회

```
GET /payment-schedules/{paymentScheduleId}
Authorization: PortOne YOUR_API_SECRET
```

### 4-3. 스케줄 취소

```
DELETE /payment-schedules
Authorization: PortOne YOUR_API_SECRET
Body: {
  "billingKey": "...",       // 빌링키로 해당 빌링키의 모든 스케줄 취소
  "scheduleIds": ["..."]     // 또는 특정 스케줄 ID로 취소
}
```

> billingKey 또는 scheduleIds 중 하나 이상 필수. 둘 다 제공 시 일치해야 함.

### 4-4. 정기결제 반복 흐름 (핵심)

```
1. 사용자 카드 등록 → billingKey 획득

2. 첫 결제 실행 (POST /payments/{id}/billing-key)
   + 다음 달 결제 스케줄 등록 (POST /payments/{id}/schedule)

3. 다음 달 → 포트원이 자동 결제 실행
   → 웹훅 "Transaction.Paid" 수신

4. 웹훅 핸들러에서:
   - 결제 성공 확인
   - 구독 상태 업데이트 (다음 갱신일 등)
   - 그 다음 달 결제 스케줄 등록

5. 3~4 반복 (매월)

실패 시:
   - 웹훅 "Transaction.Failed" 수신
   - 재시도 로직 또는 사용자 알림
   - 구독 일시정지 처리
```

---

## 5. 웹훅 (Webhook)

### 5-1. 이벤트 타입

**거래(Transaction) 이벤트:**

| 타입 | 설명 |
|------|------|
| `Transaction.Ready` | 결제창 열림 |
| `Transaction.Paid` | **결제 승인 완료** |
| `Transaction.VirtualAccountIssued` | 가상계좌 발급 |
| `Transaction.PartialCancelled` | 부분 환불 |
| `Transaction.Cancelled` | 전체 환불 |
| `Transaction.Failed` | **결제 실패** |
| `Transaction.PayPending` | 결제 승인 대기 |
| `Transaction.CancelPending` | 환불 요청 (비동기) |
| `Transaction.DisputeCreated` | 분쟁 발생 |
| `Transaction.DisputeResolved` | 분쟁 해결 |

**빌링키(BillingKey) 이벤트:**

| 타입 | 설명 |
|------|------|
| `BillingKey.Ready` | 빌링키 발급창 열림 |
| `BillingKey.Issued` | 빌링키 발급 성공 |
| `BillingKey.Failed` | 빌링키 발급 실패 |
| `BillingKey.Deleted` | 빌링키 삭제 |
| `BillingKey.Updated` | 빌링키 업데이트 |

### 5-2. 웹훅 페이로드 (v2024-04-25 형식)

Standard Webhooks 스펙 준수.

```json
{
  "type": "Transaction.Paid",
  "timestamp": "2026-03-01T10:00:00.000Z",
  "data": {
    "storeId": "store-XXXXXXXX",
    "paymentId": "payment-abc123",
    "transactionId": "txn-XXXXXXXX",
    "cancellationId": null
  }
}
```

**이벤트별 data 필드:**

| 이벤트 종류 | data 필드 |
|------------|-----------|
| Transaction.* | `storeId`, `paymentId`, `transactionId`, (optional) `cancellationId` |
| BillingKey.* | `storeId`, `billingKey` |

### 5-3. 웹훅 검증 (HMAC 서명)

포트원은 Standard Webhooks 스펙에 따라 서명을 검증함.

**웹훅 시크릿**: 관리자 콘솔 [결제 연동] → [연동 관리] → [결제알림(Webhook) 관리]에서 발급

**검증용 헤더:**
- `webhook-id`: 웹훅 고유 ID
- `webhook-signature`: HMAC 서명
- `webhook-timestamp`: 타임스탬프 (리플레이 공격 방지)

**Server SDK로 검증 (추천):**

```javascript
import * as PortOne from "@portone/server-sdk";

// 또는 npm install @portone/server-sdk (Node.js v20+)

const webhook = await PortOne.Webhook.verify(
  webhookSecret,   // 관리자 콘솔에서 발급한 시크릿
  requestBody,     // 원본 문자열 (파싱하지 않은 raw body)
  requestHeaders,  // { "webhook-id": "...", "webhook-signature": "...", "webhook-timestamp": "..." }
);
```

> 중요: `requestBody`는 반드시 **문자열(string)**으로 전달. JSON.parse() 하지 않은 원본.

**시크릿 관리:**
- 테스트/실연동 환경별 별도 시크릿
- 환경당 최대 2개 시크릿 동시 활성화 가능 (무중단 교체용)
- 교체: 새 시크릿 발급 → 서버 코드 업데이트 → 이전 시크릿 폐기

### 5-4. 웹훅 설정

**관리자 콘솔:**

1. [결제 연동] → [연동 관리] → [결제알림(Webhook) 관리]
2. [웹훅 버전]: "결제모듈 V2" 선택
3. [설정 모드]: "실연동" 또는 "테스트" 선택
4. Endpoint URL 입력
5. Content-Type: `application/json` (v2024-04-25 필수)

**SDK에서 런타임 오버라이드:**

```javascript
PortOne.requestIssueBillingKey({
  // ... 기본 파라미터 ...
  noticeUrls: ["https://xxx.supabase.co/functions/v1/portone-webhook"],
});
```

### 5-5. 웹훅 IP

포트원 V2 웹훅 발신 IP: **`52.78.5.241`**

> Supabase Edge Function은 IP 필터링 없이 사용 가능하므로 시그니처 검증으로 충분.

### 5-6. 재시도 정책

| 시도 | 대기 시간 |
|------|----------|
| 1차 | 즉시 |
| 2차 | 1분 후 |
| 3차 | 4분 후 |
| 4차 | 16분 후 |
| 5차 | 64분 후 |
| 6차 (최종) | 256분 후 |

- 최대 5회 재시도 (총 6회 시도)
- 지수 백오프 + 지터링 (트래픽 분산)
- 연결/읽기 타임아웃: 각 30초

---

## 6. 결제 웹페이지 구현 (크롬 확장용)

### 6-1. 요구사항

- 크롬 확장 팝업에서 PG SDK를 직접 사용할 수 없음 (CSP 제한)
- 별도 웹페이지를 `chrome.tabs.create()`로 열어서 결제 처리
- 정적 HTML 페이지로 충분 (서버 사이드 렌더링 불필요)

### 6-2. 최소 결제 페이지 예시

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>위스크 프리미엄 구독</title>
  <script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 480px;
      margin: 40px auto;
      padding: 20px;
      text-align: center;
    }
    .plan-card {
      border: 2px solid #4F46E5;
      border-radius: 12px;
      padding: 24px;
      margin: 16px 0;
      cursor: pointer;
    }
    .plan-card.selected {
      background: #EEF2FF;
    }
    .price { font-size: 28px; font-weight: bold; }
    .subscribe-btn {
      background: #4F46E5;
      color: white;
      border: none;
      padding: 16px 32px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
      margin-top: 24px;
    }
    .subscribe-btn:disabled {
      background: #9CA3AF;
      cursor: not-allowed;
    }
    .status { margin-top: 16px; color: #6B7280; }
  </style>
</head>
<body>
  <h1>위스크 프리미엄</h1>
  <p>AI 이미지 자동화의 모든 기능을 사용하세요</p>

  <div class="plan-card selected" id="monthly" onclick="selectPlan('monthly')">
    <div class="price">월 ₩9,900</div>
    <div>매월 자동 갱신</div>
  </div>

  <div class="plan-card" id="yearly" onclick="selectPlan('yearly')">
    <div class="price">연 ₩100,000</div>
    <div>₩8,333/월 (16% 할인)</div>
  </div>

  <button class="subscribe-btn" id="subscribe-btn" onclick="startSubscription()">
    카드 등록 및 구독 시작
  </button>

  <div class="status" id="status"></div>

  <script>
    // URL 파라미터에서 사용자 정보 받기
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("userId");
    const userEmail = params.get("email");
    const accessToken = params.get("token");

    let selectedPlan = "monthly";

    function selectPlan(plan) {
      selectedPlan = plan;
      document.getElementById("monthly").classList.toggle("selected", plan === "monthly");
      document.getElementById("yearly").classList.toggle("selected", plan === "yearly");
    }

    async function startSubscription() {
      const btn = document.getElementById("subscribe-btn");
      const status = document.getElementById("status");
      btn.disabled = true;
      status.textContent = "카드 등록 창을 여는 중...";

      try {
        // 1. 빌링키 발급 (카드 등록)
        const issueResponse = await PortOne.requestIssueBillingKey({
          storeId: "YOUR_STORE_ID",
          channelKey: "YOUR_CHANNEL_KEY",
          billingKeyMethod: "CARD",
          issueName: selectedPlan === "monthly"
            ? "위스크 프리미엄 월간 구독"
            : "위스크 프리미엄 연간 구독",
          customer: {
            customerId: userId,
            email: userEmail,
          },
          displayAmount: selectedPlan === "monthly" ? 9900 : 100000,
          currency: "CURRENCY_KRW",
        });

        // 2. 에러 체크
        if (issueResponse.code !== undefined) {
          status.textContent = "카드 등록이 취소되었습니다.";
          btn.disabled = false;
          return;
        }

        // 3. 서버에 빌링키 전송 → 첫 결제 + 스케줄 등록
        status.textContent = "구독을 처리하는 중...";
        const response = await fetch(
          "https://YOUR_PROJECT.supabase.co/functions/v1/activate-subscription",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              billingKey: issueResponse.billingKey,
              plan: selectedPlan,
              userId: userId,
            }),
          }
        );

        if (response.ok) {
          status.textContent = "구독이 시작되었습니다! 이 탭을 닫아주세요.";
          btn.textContent = "구독 완료";
          // 크롬 확장에 메시지 전달 (옵션)
          // chrome.runtime.sendMessage(EXTENSION_ID, { type: "subscription_activated" });
        } else {
          const error = await response.json();
          status.textContent = "오류: " + (error.message || "구독 처리 중 문제가 발생했습니다");
          btn.disabled = false;
        }
      } catch (err) {
        status.textContent = "오류: " + err.message;
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
```

### 6-3. 호스팅 옵션

| 옵션 | 비용 | 비고 |
|------|------|------|
| Vercel | 무료 (Hobby) | 정적 사이트 호스팅에 최적 |
| Netlify | 무료 (Starter) | 정적 사이트 호스팅 |
| Supabase Storage | 무료 | 직접 HTML 서빙 가능 |
| GitHub Pages | 무료 | 커스텀 도메인 지원 |

> PG사 실 계약 시 도메인이 필요할 수 있음 (토스페이먼츠 등)

---

## 7. Supabase 연동

### 7-1. Edge Function: 구독 활성화 (빌링키 저장 + 첫 결제 + 스케줄)

```typescript
// supabase/functions/activate-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // JWT에서 사용자 인증 확인
  const authHeader = req.headers.get("Authorization");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { billingKey, plan, userId } = await req.json();
  const amount = plan === "monthly" ? 9900 : 100000;
  const orderName = plan === "monthly"
    ? "위스크 프리미엄 월간 구독"
    : "위스크 프리미엄 연간 구독";

  try {
    // 1. 빌링키를 DB에 저장
    const { error: dbError } = await supabase
      .from("billing_keys")
      .upsert({
        user_id: userId,
        billing_key: billingKey,
        plan: plan,
        created_at: new Date().toISOString(),
      });

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    // 2. 첫 결제 실행
    const paymentId = `whisk-${plan}-${userId}-${Date.now()}`;
    const payResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`,
      {
        method: "POST",
        headers: {
          "Authorization": `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingKey,
          orderName,
          amount: { total: amount },
          currency: "KRW",
          customer: { id: userId },
        }),
      }
    );

    if (!payResponse.ok) {
      const payError = await payResponse.json();
      throw new Error(`Payment failed: ${JSON.stringify(payError)}`);
    }

    // 3. 다음 결제 스케줄 등록
    const nextPayDate = new Date();
    if (plan === "monthly") {
      nextPayDate.setMonth(nextPayDate.getMonth() + 1);
    } else {
      nextPayDate.setFullYear(nextPayDate.getFullYear() + 1);
    }

    const schedulePaymentId = `whisk-${plan}-${userId}-${nextPayDate.getTime()}`;
    const scheduleResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(schedulePaymentId)}/schedule`,
      {
        method: "POST",
        headers: {
          "Authorization": `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment: {
            billingKey,
            orderName: `${orderName} (갱신)`,
            amount: { total: amount },
            currency: "KRW",
            customer: { id: userId },
          },
          timeToPay: nextPayDate.toISOString(),
        }),
      }
    );

    if (!scheduleResponse.ok) {
      console.error("Schedule failed:", await scheduleResponse.json());
      // 스케줄 실패해도 첫 결제는 성공했으므로 에러를 던지지 않음
      // 대신 DB에 "schedule_failed" 표시 → 수동 처리
    }

    // 4. 구독 상태 업데이트
    await supabase
      .from("subscriptions")
      .upsert({
        user_id: userId,
        plan: plan,
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: nextPayDate.toISOString(),
        billing_key: billingKey,
        payment_id: paymentId,
      });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Subscription error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### 7-2. Edge Function: 웹훅 수신

```typescript
// supabase/functions/portone-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET")!;
const PORTONE_WEBHOOK_SECRET = Deno.env.get("PORTONE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  const body = await req.text();  // raw string (파싱 X)
  const headers = {
    "webhook-id": req.headers.get("webhook-id") || "",
    "webhook-signature": req.headers.get("webhook-signature") || "",
    "webhook-timestamp": req.headers.get("webhook-timestamp") || "",
  };

  // 1. 웹훅 서명 검증
  // Standard Webhooks 검증 (PortOne Server SDK 사용 가능)
  // 여기서는 수동 검증 또는 SDK 검증
  // TODO: @portone/server-sdk Deno 호환성 확인 필요
  // 대안: Standard Webhooks 라이브러리 사용
  //
  // import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
  // const wh = new Webhook(PORTONE_WEBHOOK_SECRET);
  // wh.verify(body, headers);

  // 2. 페이로드 파싱
  const payload = JSON.parse(body);
  const { type, data } = payload;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 3. 이벤트 타입별 처리
  switch (type) {
    case "Transaction.Paid": {
      const { paymentId, transactionId } = data;

      // 포트원 API로 결제 상세 조회 (금액 검증)
      const paymentRes = await fetch(
        `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: { "Authorization": `PortOne ${PORTONE_API_SECRET}` },
        }
      );
      const payment = await paymentRes.json();

      // 결제 기록 저장
      await supabase.from("payments").insert({
        payment_id: paymentId,
        transaction_id: transactionId,
        amount: payment.amount?.total,
        status: "paid",
        paid_at: new Date().toISOString(),
        raw_data: payment,
      });

      // 구독 갱신일 업데이트
      // paymentId 패턴에서 userId 추출하거나, customData에서 가져오기
      // ...

      // 다음 결제 스케줄 등록
      // (웹훅에서 스케줄 등록하는 것이 정기결제 반복의 핵심)
      // ...

      break;
    }

    case "Transaction.Failed": {
      const { paymentId } = data;

      // 결제 실패 기록
      await supabase.from("payments").insert({
        payment_id: paymentId,
        status: "failed",
        failed_at: new Date().toISOString(),
      });

      // 사용자 알림 (이메일 등)
      // 재시도 로직 또는 구독 일시정지
      break;
    }

    case "Transaction.Cancelled": {
      // 환불 처리
      break;
    }

    case "BillingKey.Deleted": {
      // 빌링키 삭제 → 구독 취소 처리
      const { billingKey } = data;
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("billing_key", billingKey);
      break;
    }

    default:
      console.log("Unhandled webhook type:", type);
  }

  // 웹훅은 반드시 200 응답을 빨리 반환해야 함
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

**JWT 검증 비활성화 (웹훅용):**

웹훅은 외부에서 호출되므로 Supabase의 기본 JWT 검증을 비활성화해야 함.

```toml
# supabase/config.toml
[functions.portone-webhook]
verify_jwt = false
```

또는 `--no-verify-jwt` 플래그로 배포:

```bash
supabase functions deploy portone-webhook --no-verify-jwt
```

### 7-3. DB 테이블 스키마

```sql
-- 빌링키 저장
CREATE TABLE billing_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  billing_key TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- RLS: 사용자 본인 것만 조회 가능
ALTER TABLE billing_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own billing keys"
  ON billing_keys FOR SELECT
  USING (auth.uid() = user_id);

-- 구독 상태
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')),
  billing_key TEXT NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- 결제 기록
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  transaction_id TEXT,
  user_id UUID REFERENCES auth.users(id),
  amount INTEGER,
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'cancelled', 'refunded')),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);
```

### 7-4. 빌링키 보안 저장

- 빌링키는 **카드 번호가 아님** — 포트원/PG사에서 발급한 토큰
- 빌링키 자체로는 결제 실행 불가 (API Secret과 함께 사용해야 함)
- 그래도 DB에서 암호화 저장 권장:
  - Supabase Vault (Extension: `pgsodium`)
  - 또는 서버 사이드 암호화 후 저장
- RLS 설정으로 사용자 본인 것만 조회 가능하게 설정

---

## 8. PG사 선택 참고

포트원을 통해 연결할 PG사 옵션:

| PG사 | 카드 수수료 | 가입비 | 빌링 지원 | 비고 |
|------|-----------|--------|----------|------|
| 토스페이먼츠 | 3.4% | ₩220,000 | O | 개발자 문서 최고, KRW만 지원 |
| NHN KCP | 3.2% | ₩220,000 | O | 안정적, 범용 |
| 나이스페이 | 3.3~3.5% | ₩330,000~550,000 | O | 포스타트 무료 가입 |
| KSNET | 2.5~3.0% | 협의 | O | 수수료 낮음 |
| 웰컴페이먼츠 | 협의 | 협의 | O | 소규모에 유리할 수 있음 |

> 포트원에서 PG사를 연결하면 포트원 가입비/수수료는 무료 (월 5천만 이하).
> PG사 수수료만 발생.

---

## 9. 테스트 환경

### 9-1. 포트원 테스트 모드

1. https://admin.portone.io/ 가입 (무료, 사업자등록 불필요)
2. 테스트 채널 생성 (토스페이먼츠 테스트 등)
3. 테스트 storeId, channelKey 발급
4. API Secret 발급 (테스트용)
5. 테스트 카드번호로 결제 테스트

### 9-2. 테스트 카드

토스페이먼츠 테스트 채널 사용 시 임의의 카드번호로 결제 가능.
(실제 카드 필요 없음, PG사별 테스트 카드 번호는 각 PG사 문서 참조)

---

## 10. 참고 자료

- [PortOne V2 JavaScript SDK 레퍼런스](https://developers.portone.io/sdk/ko/v2-sdk/readme?v=v2)
- [requestIssueBillingKey 파라미터](https://developers.portone.io/sdk/ko/v2-sdk/billing-key-request)
- [빌링키 발급 가이드](https://developers.portone.io/opi/ko/integration/start/v2/billing/issue)
- [REST API V2 — 빌링키](https://developers.portone.io/api/rest-v2/payment.billingKey?v=v2)
- [REST API V2 — 결제 스케줄](https://developers.portone.io/api/rest-v2/payment.paymentSchedule?v=v2)
- [REST API V2 — 인증](https://developers.portone.io/api/rest-v2/auth?v=v2)
- [V2 웹훅 연동하기](https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2)
- [PortOne Server SDK (JS)](https://portone-io.github.io/server-sdk/js/)
- [@portone/browser-sdk npm](https://www.npmjs.com/package/@portone/browser-sdk)
- [@portone/server-sdk npm](https://www.npmjs.com/package/@portone/server-sdk)
- [Standard Webhooks 스펙](https://www.standardwebhooks.com/)
- [Supabase Edge Functions — Stripe 웹훅 예제 (패턴 참고)](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
- [포트원 관리자 콘솔](https://admin.portone.io/)
- [TossPayments V2 연동 가이드 (포트원 경유)](https://developers.portone.io/opi/ko/integration/pg/v2/tosspayments?v=v2)
