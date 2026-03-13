// portone-webhook: 포트원 V2 웹훅 수신 → DB 업데이트 + 다음 스케줄 등록
// 환경변수: PORTONE_API_SECRET, PORTONE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 배포 시: --no-verify-jwt 필수 (외부에서 호출)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET")!;
const PORTONE_WEBHOOK_SECRET = Deno.env.get("PORTONE_WEBHOOK_SECRET") || "";
const PORTONE_API_URL = "https://api.portone.io";

const PLANS: Record<string, { amount: number; dayInterval: number }> = {
  monthly: { amount: 9900, dayInterval: 30 },
  yearly: { amount: 100000, dayInterval: 365 },
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function apiHeaders(): Record<string, string> {
  return {
    Authorization: `PortOne ${PORTONE_API_SECRET}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.text();

    // 웹훅 서명 검증 (Standard Webhooks)
    if (PORTONE_WEBHOOK_SECRET) {
      const webhookId = req.headers.get("webhook-id");
      const webhookSignature = req.headers.get("webhook-signature");
      const webhookTimestamp = req.headers.get("webhook-timestamp");

      if (!webhookId || !webhookSignature || !webhookTimestamp) {
        console.error("[webhook] Missing signature headers");
        return new Response("Missing signature", { status: 400 });
      }

      const now = Math.floor(Date.now() / 1000);
      const ts = parseInt(webhookTimestamp);
      if (Math.abs(now - ts) > 300) {
        console.error("[webhook] Timestamp too old");
        return new Response("Timestamp expired", { status: 400 });
      }

      const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
      const secretBytes = base64Decode(
        PORTONE_WEBHOOK_SECRET.replace("whsec_", "")
      );
      const key = await crypto.subtle.importKey(
        "raw",
        secretBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBytes = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signedContent)
      );
      const expectedSig = `v1,${base64Encode(new Uint8Array(signatureBytes))}`;

      const signatures = webhookSignature.split(" ");
      const verified = signatures.some((sig) => sig === expectedSig);
      if (!verified) {
        console.error("[webhook] Signature mismatch");
        return new Response("Invalid signature", { status: 400 });
      }
    }

    const event = JSON.parse(body);
    console.log(`[webhook] Event type: ${event.type}`);

    // V2 웹훅 이벤트
    if (event.type === "Transaction.Paid") {
      const paymentId = event.data?.paymentId;
      if (paymentId) {
        await handlePaymentSuccess(paymentId);
      }
    } else if (event.type === "Transaction.Failed") {
      const paymentId = event.data?.paymentId;
      if (paymentId) {
        await handlePaymentFailed(paymentId);
      }
    } else {
      console.log(`[webhook] Unhandled event:`, event.type);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook] Error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

async function handlePaymentSuccess(paymentId: string) {
  // V2 API로 결제 상세 조회
  const payRes = await fetch(
    `${PORTONE_API_URL}/payments/${encodeURIComponent(paymentId)}`,
    { headers: apiHeaders() }
  );

  if (!payRes.ok) {
    console.error("[webhook] Failed to fetch payment:", paymentId);
    return;
  }

  const payment = await payRes.json();
  const billingKey = payment.billingKey;

  if (!billingKey) {
    console.error("[webhook] No billingKey in payment");
    return;
  }

  // DB에서 이 billing_key를 가진 라이선스 조회
  const { data: license } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("billing_key", billingKey)
    .single();

  if (!license) {
    console.error("[webhook] No license found for billing_key:", billingKey);
    return;
  }

  const planType = license.plan_type || "monthly";
  const plan = PLANS[planType];

  // 만료일 갱신
  const now = new Date();
  const newExpiry = new Date(
    now.getTime() + plan.dayInterval * 24 * 60 * 60 * 1000
  );

  // 취소 예정이 아니면 다음 스케줄 등록
  if (!license.cancel_at_period_end) {
    const nextPaymentId = `flow_${license.user_id}_${Date.now()}`;
    const scheduleRes = await fetch(
      `${PORTONE_API_URL}/payments/${encodeURIComponent(nextPaymentId)}/schedule`,
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          payment: {
            billingKey,
            orderName:
              planType === "monthly"
                ? "Flow+Grok Pro 월간"
                : "Flow+Grok Pro 연간",
            amount: { total: plan.amount },
            currency: "KRW",
          },
          timeToPay: newExpiry.toISOString(),
        }),
      }
    );

    if (!scheduleRes.ok) {
      const scheduleErr = await scheduleRes.json().catch(() => ({}));
      console.error("[webhook] Failed to schedule next payment:", scheduleErr);
    }
  }

  // DB 업데이트
  await supabaseAdmin
    .from("licenses")
    .update({
      tier: "pro",
      expires_at: newExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", license.user_id);

  console.log(
    `[webhook] Payment success for ${license.user_id}, expires: ${newExpiry.toISOString()}`
  );
}

async function handlePaymentFailed(paymentId: string) {
  const payRes = await fetch(
    `${PORTONE_API_URL}/payments/${encodeURIComponent(paymentId)}`,
    { headers: apiHeaders() }
  );

  if (!payRes.ok) {
    console.error("[webhook] Failed to fetch failed payment:", paymentId);
    return;
  }

  const payment = await payRes.json();
  const billingKey = payment.billingKey;

  if (!billingKey) return;

  const { data: license } = await supabaseAdmin
    .from("licenses")
    .select("user_id")
    .eq("billing_key", billingKey)
    .single();

  if (!license) return;

  // 결제 실패 → tier를 free로 변경
  await supabaseAdmin
    .from("licenses")
    .update({
      tier: "free",
      billing_key: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", license.user_id);

  console.log(
    `[webhook] Payment failed for ${license.user_id}, downgraded to free`
  );
}

// Base64 유틸리티
function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
