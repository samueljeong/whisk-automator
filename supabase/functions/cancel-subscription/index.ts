// cancel-subscription: 구독 취소 (즉시 해지 아닌 기간 만료 시 해지)
// 환경변수: PORTONE_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET")!;
const PORTONE_API_URL = "https://api.portone.io";

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

    // 3. 예약된 스케줄 결제 취소 시도
    // 포트원 V2에서는 예약된 결제를 개별적으로 취소해야 함
    // customer.id로 스케줄 조회 후 취소
    try {
      const scheduleRes = await fetch(
        `${PORTONE_API_URL}/payment-schedules?filter.customerId=${encodeURIComponent(user.id)}`,
        {
          headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` },
        }
      );

      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json();
        const schedules = scheduleData.items || [];

        for (const schedule of schedules) {
          if (schedule.status === "SCHEDULED") {
            await fetch(
              `${PORTONE_API_URL}/payments/${encodeURIComponent(schedule.paymentId)}/schedule/revoke`,
              {
                method: "POST",
                headers: {
                  Authorization: `PortOne ${PORTONE_API_SECRET}`,
                },
              }
            );
            console.log(`[cancel] Revoked schedule: ${schedule.paymentId}`);
          }
        }
      }
    } catch (err) {
      console.error("[cancel] Failed to revoke schedules:", err);
      // 스케줄 취소 실패해도 DB 업데이트는 진행
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
