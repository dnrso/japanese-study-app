import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  aiSentenceAnalysisMessages,
  analyzeJapaneseSentenceForStudy,
  defaultGeminiModel,
} from "../_shared/ai.js";

// Rate limit constants: 1 request/minute and 100 requests/day per user.
// These are the values actually ENFORCED (server-side, source of truth).
// packages/core/src/index.js's AI_ANALYSIS_LIMITS is a display-only copy
// shown next to the client's AI 문장 분석 checkbox - keep both in sync by
// hand if these ever change (this function can't import from that
// workspace package at runtime).
// tests/core-ai-analysis-limits.test.js parses these two declarations out of
// this file, so keep them as plain `const NAME = <number>;` lines.
const RATE_LIMIT_PER_MINUTE_MS = 60_000;
const DAILY_LIMIT = 100;

// The model is NOT caller-controlled: it would let any authenticated user bill
// an arbitrarily expensive Gemini model to the project's paid key. The only
// caller (apps/web/src/main.js -> sync.invokeFunction("analyze-sentence", ...))
// sends nothing but `sentence`, so the request's `model` field is ignored
// entirely and the server-side default is always used.
const ANALYSIS_MODEL = defaultGeminiModel;

// One row returned by public.consume_ai_usage(). `reason` is "" when allowed,
// otherwise "rate-limited-minute" or "rate-limited-daily".
type UsageDecision = {
  allowed: boolean;
  reason: string;
  request_count: number;
};

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

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { ok: false, message: "요청 본문을 해석할 수 없습니다." },
      400,
    );
  }

  // `sentence` must be a string. Without this check a non-string (e.g. an
  // object or an array) was coerced by String() into "[object Object]" and
  // sent to Gemini as if it were a sentence. Rejected before any quota is
  // consumed - a malformed request never reaches the paid API, so there is
  // nothing to rate limit.
  const sentence = (payload as { sentence?: unknown } | null)?.sentence;
  if (typeof sentence !== "string") {
    return jsonResponse(
      {
        ok: false,
        reason: "emptySentence",
        message: aiSentenceAnalysisMessages.emptySentence,
        rawText: "",
        sourceSentence: "",
      },
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

  // Check-and-increment in one atomic DB statement (see
  // supabase/migrations/20260725000000_ai_usage_consume_rpc.sql). Doing the
  // read, the comparison and the write separately from here was a TOCTOU race:
  // N parallel requests all read the same request_count, all passed the check,
  // and all wrote the same count + 1, so 100 concurrent calls were recorded as
  // a single one. consume_ai_usage() both records the attempt and decides
  // whether it was allowed, using the database clock for the per-minute
  // spacing so the client can't influence the window.
  //
  // As before, the attempt is recorded BEFORE Gemini is called, so failed and
  // retried attempts still count against the limits — simpler to reason about
  // and safer against abuse than only counting successes.
  const usageDate = todayUtcDateString();
  const { data: usage, error: usageError } = await supabaseAdmin
    .rpc("consume_ai_usage", {
      p_user_id: user.id,
      p_usage_date: usageDate,
      p_daily_limit: DAILY_LIMIT,
      p_rate_limit_ms: RATE_LIMIT_PER_MINUTE_MS,
    })
    .single();

  const decision = usage as UsageDecision | null;
  if (usageError || !decision) {
    return jsonResponse(
      { ok: false, message: "사용량 확인 중 오류가 발생했습니다." },
      500,
    );
  }

  if (!decision.allowed) {
    if (decision.reason === "rate-limited-daily") {
      return jsonResponse(
        {
          ok: false,
          reason: "rate-limited-daily",
          message: "오늘의 AI 분석 사용량(100회)을 모두 사용했습니다.",
        },
        429,
      );
    }
    return jsonResponse(
      {
        ok: false,
        reason: "rate-limited-minute",
        message: "AI 분석은 1분에 한 번만 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.",
      },
      429,
    );
  }

  try {
    const result = await analyzeJapaneseSentenceForStudy({
      sentence,
      apiKey,
      model: ANALYSIS_MODEL,
    });
    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (error) {
    return jsonResponse(
      { ok: false, message: (error as Error).message || "AI 분석 요청 실패" },
      502,
    );
  }
});
