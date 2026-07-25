import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { AI_ANALYSIS_LIMITS } from "@nihongo-study/core";

// AI_ANALYSIS_LIMITS is a display-only copy of limits that are enforced
// server-side, and nothing imports the server values at runtime (the edge
// function is a separately-deployed Deno function). So this test reads the
// enforced numbers straight out of the server sources instead of restating
// them as literals here — otherwise changing a server constant would leave
// the client silently advertising the old limit and CI would still pass.
//
// Kept dependency-free and cross-platform on purpose: URL-relative
// readFileSync, no path separators assumed, no child processes.
const EDGE_FUNCTION_PATH = new URL(
  "../supabase/functions/analyze-sentence/index.ts",
  import.meta.url
);
const SHARED_AI_PATH = new URL(
  "../supabase/functions/_shared/ai.js",
  import.meta.url
);

const edgeFunctionSource = readFileSync(EDGE_FUNCTION_PATH, "utf8");
const sharedAiSource = readFileSync(SHARED_AI_PATH, "utf8");

// Matches `const NAME = 60_000;` / `export const NAME = 300;`.
function numericConstant(source, name, sourceLabel) {
  const match = new RegExp(
    `\\bconst\\s+${name}\\s*=\\s*(\\d[\\d_]*)\\b`
  ).exec(source);
  if (!match) {
    throw new Error(
      `Could not find a numeric \`const ${name} = ...\` in ${sourceLabel}. ` +
        "If it was renamed or moved, update tests/core-ai-analysis-limits.test.js."
    );
  }
  return Number(match[1].replace(/_/g, ""));
}

const rateLimitPerMinuteMs = numericConstant(
  edgeFunctionSource,
  "RATE_LIMIT_PER_MINUTE_MS",
  "supabase/functions/analyze-sentence/index.ts"
);
const dailyLimit = numericConstant(
  edgeFunctionSource,
  "DAILY_LIMIT",
  "supabase/functions/analyze-sentence/index.ts"
);
const maxSentenceLength = numericConstant(
  sharedAiSource,
  "maxSentenceLength",
  "supabase/functions/_shared/ai.js"
);

const MS_PER_MINUTE = 60_000;

describe("AI_ANALYSIS_LIMITS", () => {
  it("expresses the per-minute cooldown as a whole number of requests per minute", () => {
    expect(rateLimitPerMinuteMs).toBeGreaterThan(0);
    expect(MS_PER_MINUTE % rateLimitPerMinuteMs).toBe(0);
  });

  it("matches the limits enforced by supabase/functions/analyze-sentence/index.ts and _shared/ai.js", () => {
    expect(AI_ANALYSIS_LIMITS).toEqual({
      perMinute: MS_PER_MINUTE / rateLimitPerMinuteMs,
      perDay: dailyLimit,
      maxChars: maxSentenceLength
    });
  });

  it("keeps the daily-limit number inside the edge function's Korean 429 message in sync", () => {
    // The 429 body hardcodes the count as text ("오늘의 AI 분석 사용량(100회)을
    // 모두 사용했습니다."), which drifts silently when DAILY_LIMIT changes.
    const match = /사용량\((\d+)회\)/.exec(edgeFunctionSource);
    expect(match, "daily-limit 429 message not found in the edge function")
      .not.toBeNull();
    expect(Number(match[1])).toBe(dailyLimit);
  });
});
