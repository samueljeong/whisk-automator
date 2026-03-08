// activate-subscription: V1 빌링키(customer_uid)로 첫 결제 + 다음 결제 스케줄 등록
// 환경변수: IMP_API_KEY, IMP_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IMP_API_KEY = Deno.env.get("IMP_API_KEY")!;
const IMP_API_SECRET = Deno.env.get("IMP_API_SECRET")!;
const IMP_API_URL = "https://api.iamport.kr";

const PLANS: Record<string, { amount: number; dayInterval: number }> = {
  monthly: { amount: 9900, dayInterval: 30 },
  yearly: { amount: 100000, dayInterval: 365 },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// V1 API 인증 토큰 발급
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. 인증된 사용자 확인
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "인증이 필요합니다" }, 401);
    }

    let userId: string;
    let userEmail: string | undefined;

    // 테스트 토큰 지원 (개발용 — 프로덕션 전에 제거)
    const token = authHeader.replace("Bearer ", "");
    if (token === "test-token") {
      const url = new URL(req.url);
      userId = "test123";
      userEmail = "test@test.com";
      console.log("[activate] Using test mode");
    } else {
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
      userId = userId;
      userEmail = user.email;
    }

    // 2. 요청 파싱
    const { billingKey, planType } = await req.json();

    if (!billingKey || !planType || !PLANS[planType]) {
      return jsonResponse({ error: "잘못된 요청입니다" }, 400);
    }

    const plan = PLANS[planType];
    const merchantUid = `whisk_${userId}_${Date.now()}`;

    // 3. V1 API 토큰 발급
    const accessToken = await getAccessToken();

    // 4. 첫 결제 실행 (V1 빌링키 결제)
    const payRes = await fetch(`${IMP_API_URL}/subscribe/payments/again`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        customer_uid: billingKey,
        merchant_uid: merchantUid,
        amount: plan.amount,
        name: planType === "monthly" ? "Whisk Pro 월간" : "Whisk Pro 연간",
        buyer_email: user.email,
      }),
    });

    const payData = await payRes.json();
    if (payData.code !== 0) {
      console.error("[activate] Payment failed:", payData);
      return jsonResponse(
        { error: payData.message || "결제에 실패했습니다" },
        400
      );
    }

    // 5. 만료일 계산
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + plan.dayInterval * 24 * 60 * 60 * 1000
    );

    // 6. 다음 결제 스케줄 등록
    const nextMerchantUid = `whisk_${userId}_${Date.now() + 1}`;
    const scheduleRes = await fetch(
      `${IMP_API_URL}/subscribe/payments/schedule`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customer_uid: billingKey,
          schedules: [
            {
              merchant_uid: nextMerchantUid,
              schedule_at: Math.floor(expiresAt.getTime() / 1000),
              amount: plan.amount,
              name:
                planType === "monthly" ? "Whisk Pro 월간" : "Whisk Pro 연간",
              buyer_email: user.email,
            },
          ],
        }),
      }
    );

    const scheduleData = await scheduleRes.json();
    if (scheduleData.code !== 0) {
      console.error("[activate] Schedule failed:", scheduleData);
      // 스케줄 실패해도 첫 결제는 성공 → Pro 활성화는 진행
    }

    // 7. DB 업데이트 (service_role_key로 RLS 우회)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: dbError } = await supabaseAdmin.from("licenses").upsert(
      {
        user_id: userId,
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
