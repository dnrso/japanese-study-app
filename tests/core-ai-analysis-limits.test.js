import { describe, it, expect } from "vitest";
import { AI_ANALYSIS_LIMITS } from "@nihongo-study/core";

describe("AI_ANALYSIS_LIMITS", () => {
  it("matches the server-enforced limits (keep in sync with supabase/functions/analyze-sentence/index.ts and _shared/ai.js)", () => {
    expect(AI_ANALYSIS_LIMITS).toEqual({
      perMinute: 1,
      perDay: 100,
      maxChars: 300
    });
  });
});
