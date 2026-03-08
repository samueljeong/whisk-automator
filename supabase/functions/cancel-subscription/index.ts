// cancel-subscription: 구독 취소 (즉시 해지 아닌 기간 만료 시 해지)
// 환경변수: IMP_API_KEY, IMP_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IMP_API_KEY = Deno.env.get("IMP_API_KEY")!;
const IMP_API_SECRET = Deno.env.get("IMP_API_SECRET")!;
const IMP_API_URL = "https://api.iamport.kr";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // 2. 현재 구독 정보 조회
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: license } = await supabaseAdmin
      .from("licenses")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!license || license.tier !== "pro") {
      return jsonResponse({ error: "활성 구독이 없습니다" }, 400);
    }

    // 3. 예약된 스케줄 결제 취소
    if (license.billing_key) {
      try {
        const accessToken = await getAccessToken();
        await fetch(
          `${IMP_API_URL}/subscribe/payments/unschedule`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              customer_uid: license.billing_key,
            }),
          }
        );
        console.log(`[cancel] Unscheduled payments for ${license.billing_key}`);
      } catch (err) {
        console.error("[cancel] Failed to unschedule:", err);
      }
    }

    // 4. DB 업데이트: cancel_at_period_end = true (즉시 해지 아님)
    const { error: dbError } = await supabaseAdmin
      .from("licenses")
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (dbError) {
      console.error("[cancel] DB error:", dbError);
      return jsonResponse({ error: "DB 업데이트 실패" }, 500);
    }

    return jsonResponse({
      success: true,
      message: "구독이 취소되었습니다",
      expiresAt: license.expires_at,
    });
  } catch (err) {
    console.error("[cancel] Unexpected error:", err);
    return jsonResponse({ error: "서버 오류가 발생했습니다" }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
