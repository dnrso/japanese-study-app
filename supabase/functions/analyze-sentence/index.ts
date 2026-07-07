import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  analyzeJapaneseSentenceForStudy,
  defaultGeminiModel,
} from "../_shared/ai.js";

// Rate limit constants: 1 request/minute and 100 requests/day per user.
const RATE_LIMIT_PER_MINUTE_MS = 60_000;
const DAILY_LIMIT = 100;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Today's usage date is tracked in UTC (Postgres `date` default via
// `now()` would also be UTC-derived on most hosts, but we compute it
// explicitly here so the app logic doesn't depend on the DB's timezone).
function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, message: "POST 요청만 지원합니다." }, 405);
  }

  // Require an authenticated Supabase user (login-gated).
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ ok: false, message: "로그인이 필요합니다." }, 401);
  }

  let payload: { sentence?: string; model?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { ok: false, message: "요청 본문을 해석할 수 없습니다." },
      400,
    );
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) {
    return jsonResponse(
      { ok: false, message: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." },
      500,
    );
  }

  // Service-role client bypasses RLS to read/write per-user usage rows;
  // both env vars are auto-injected into deployed edge functions.
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const usageDate = todayUtcDateString();
  const { data: usageRow, error: usageError } = await supabaseAdmin
    .from("ai_usage")
    .select("request_count, last_request_at")
    .eq("user_id", user.id)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (usageError) {
    return jsonResponse(
      { ok: false, message: "사용량 확인 중 오류가 발생했습니다." },
      500,
    );
  }

  const currentCount = usageRow?.request_count ?? 0;
  const lastRequestAt = usageRow?.last_request_at
    ? new Date(usageRow.last_request_at).getTime()
    : null;

  if (lastRequestAt !== null && Date.now() - lastRequestAt < RATE_LIMIT_PER_MINUTE_MS) {
    return jsonResponse(
      {
        ok: false,
        reason: "rate-limited-minute",
        message: "AI 분석은 1분에 한 번만 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.",
      },
      429,
    );
  }

  if (currentCount >= DAILY_LIMIT) {
    return jsonResponse(
      {
        ok: false,
        reason: "rate-limited-daily",
        message: "오늘의 AI 분석 사용량(100회)을 모두 사용했습니다.",
      },
      429,
    );
  }

  // Record this attempt (not just successes) before calling Gemini, so
  // retried/failed attempts still count against the limits — simpler to
  // reason about and safer against abuse than only counting successes.
  const { error: upsertError } = await supabaseAdmin
    .from("ai_usage")
    .upsert(
      {
        user_id: user.id,
        usage_date: usageDate,
        request_count: currentCount + 1,
        last_request_at: new Date().toISOString(),
      },
      { onConflict: "user_id,usage_date" },
    );

  if (upsertError) {
    return jsonResponse(
      { ok: false, message: "사용량 기록 중 오류가 발생했습니다." },
      500,
    );
  }

  try {
    const result = await analyzeJapaneseSentenceForStudy({
      sentence: payload.sentence,
      apiKey,
      model: payload.model || defaultGeminiModel,
    });
    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (error) {
    return jsonResponse(
      { ok: false, message: (error as Error).message || "AI 분석 요청 실패" },
      502,
    );
  }
});
