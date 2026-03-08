// portone-webhook: 포트원 V1 웹훅 수신 → DB 업데이트 + 다음 스케줄 등록
// 환경변수: IMP_API_KEY, IMP_API_SECRET, PORTONE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 배포 시: --no-verify-jwt 필수 (외부에서 호출)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IMP_API_KEY = Deno.env.get("IMP_API_KEY")!;
const IMP_API_SECRET = Deno.env.get("IMP_API_SECRET")!;
const PORTONE_WEBHOOK_SECRET = Deno.env.get("PORTONE_WEBHOOK_SECRET") || "";
const IMP_API_URL = "https://api.iamport.kr";

const PLANS: Record<string, { amount: number; dayInterval: number }> = {
  monthly: { amount: 9900, dayInterval: 30 },
  yearly: { amount: 100000, dayInterval: 365 },
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${IMP_API_URL}/users/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imp_key: IMP_API_KEY,
      imp_secret: IMP_API_SECRET,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Token error: ${data.message}`);
  }
  return data.response.access_token;
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
      const secretBytes = base64Decode(PORTONE_WEBHOOK_SECRET.replace("whsec_", ""));
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
    console.log(`[webhook] Event: ${event.type}`);

    // V1 웹훅: imp_uid와 merchant_uid로 결제 조회
    // V2 웹훅: Transaction.Paid / Transaction.Failed
    if (event.type === "Transaction.Paid" || event.status === "paid") {
      const impUid = event.data?.paymentId || event.imp_uid;
      if (impUid) {
        await handlePaymentSuccess(impUid);
      }
    } else if (event.type === "Transaction.Failed" || event.status === "failed") {
      const impUid = event.data?.paymentId || event.imp_uid;
      if (impUid) {
        await handlePaymentFailed(impUid);
      }
    } else {
      console.log(`[webhook] Unhandled event:`, event);
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

async function handlePaymentSuccess(impUid: string) {
  // V1 API로 결제 상세 조회
  const accessToken = await getAccessToken();
  const payRes = await fetch(
    `${IMP_API_URL}/payments/${encodeURIComponent(impUid)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const payData = await payRes.json();
  if (payData.code !== 0) {
    console.error("[webhook] Failed to fetch payment:", impUid);
    return;
  }

  const payment = payData.response;
  const customerUid = payment.customer_uid;

  if (!customerUid) {
    console.error("[webhook] No customer_uid in payment");
    return;
  }

  // DB에서 이 billing_key를 가진 라이선스 조회
  const { data: license } = await supabaseAdmin
    .from("licenses")
    .select("*")
    .eq("billing_key", customerUid)
    .single();

  if (!license) {
    console.error("[webhook] No license found for billing_key:", customerUid);
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
    const nextMerchantUid = `whisk_${license.user_id}_${Date.now()}`;
    const scheduleRes = await fetch(
      `${IMP_API_URL}/subscribe/payments/schedule`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customer_uid: customerUid,
          schedules: [
            {
              merchant_uid: nextMerchantUid,
              schedule_at: Math.floor(newExpiry.getTime() / 1000),
              amount: plan.amount,
              name:
                planType === "monthly" ? "Whisk Pro 월간" : "Whisk Pro 연간",
            },
          ],
        }),
      }
    );

    const scheduleData = await scheduleRes.json();
    if (scheduleData.code !== 0) {
      console.error("[webhook] Failed to schedule next payment:", scheduleData);
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

async function handlePaymentFailed(impUid: string) {
  const accessToken = await getAccessToken();
  const payRes = await fetch(
    `${IMP_API_URL}/payments/${encodeURIComponent(impUid)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const payData = await payRes.json();
  if (payData.code !== 0) {
    console.error("[webhook] Failed to fetch failed payment:", impUid);
    return;
  }

  const payment = payData.response;
  const customerUid = payment.customer_uid;

  if (!customerUid) return;

  // billing_key로 라이선스 조회
  const { data: license } = await supabaseAdmin
    .from("licenses")
    .select("user_id")
    .eq("billing_key", customerUid)
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
