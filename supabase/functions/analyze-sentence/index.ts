import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  analyzeJapaneseSentenceForStudy,
  defaultGeminiModel,
} from "../_shared/ai.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
