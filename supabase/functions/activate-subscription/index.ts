// activate-subscription: 빌링키로 첫 결제 + 다음 결제 스케줄 등록
// 환경변수: PORTONE_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET")!;
const PORTONE_API_URL = "https://api.portone.io";

const PLANS: Record<string, { amount: number; dayInterval: number }> = {
  monthly: { amount: 9900, dayInterval: 30 },
  yearly: { amount: 100000, dayInterval: 365 },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. 인증된 사용자 확인
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "인증이 필요합니다" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonResponse({ error: "인증이 유효하지 않습니다" }, 401);
    }

    // 2. 요청 파싱
    const { billingKey, planType } = await req.json();

    if (!billingKey || !planType || !PLANS[planType]) {
      return jsonResponse({ error: "잘못된 요청입니다" }, 400);
    }

    const plan = PLANS[planType];
    const paymentId = `whisk_${user.id}_${Date.now()}`;

    // 3. 첫 결제 실행
    const payRes = await fetch(
      `${PORTONE_API_URL}/payments/${encodeURIComponent(paymentId)}/billing-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
        },
        body: JSON.stringify({
          billingKey,
          orderName: planType === "monthly" ? "Whisk Pro 월간" : "Whisk Pro 연간",
          amount: { total: plan.amount },
          currency: "KRW",
          customer: {
            id: user.id,
            email: user.email,
          },
        }),
      }
    );

    if (!payRes.ok) {
      const err = await payRes.json().catch(() => ({}));
      console.error("[activate] Payment failed:", err);
      return jsonResponse(
        { error: err.message || "결제에 실패했습니다" },
        400
      );
    }

    // 4. 만료일 계산
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + plan.dayInterval * 24 * 60 * 60 * 1000
    );

    // 5. 다음 결제 스케줄 등록
    const nextPaymentId = `whisk_${user.id}_${Date.now() + 1}`;
    const scheduleRes = await fetch(
      `${PORTONE_API_URL}/payments/${encodeURIComponent(nextPaymentId)}/schedule`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
        },
        body: JSON.stringify({
          payment: {
            billingKey,
            orderName:
              planType === "monthly" ? "Whisk Pro 월간" : "Whisk Pro 연간",
            amount: { total: plan.amount },
            currency: "KRW",
            customer: {
              id: user.id,
              email: user.email,
            },
          },
          timeToPay: expiresAt.toISOString(),
        }),
      }
    );

    if (!scheduleRes.ok) {
      const err = await scheduleRes.json().catch(() => ({}));
      console.error("[activate] Schedule failed:", err);
      // 스케줄 실패해도 첫 결제는 성공 → Pro 활성화는 진행
    }

    // 6. DB 업데이트 (service_role_key로 RLS 우회)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: dbError } = await supabaseAdmin.from("licenses").upsert(
      {
        user_id: user.id,
        tier: "pro",
        billing_key: billingKey,
        plan_type: planType,
        expires_at: expiresAt.toISOString(),
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (dbError) {
      console.error("[activate] DB error:", dbError);
      return jsonResponse({ error: "DB 업데이트 실패" }, 500);
    }

    return jsonResponse({
      success: true,
      tier: "pro",
      planType,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[activate] Unexpected error:", err);
    return jsonResponse({ error: "서버 오류가 발생했습니다" }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
