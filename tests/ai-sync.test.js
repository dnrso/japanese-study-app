// Drift guard for the hand-copied AI analysis code: supabase/functions
// can't import workspace packages at runtime (Deno edge functions), so
// supabase/functions/_shared/ai.js is a manual copy of packages/ai/src/
// index.js (the real source of truth). This test fails loudly the moment
// the two drift apart again, instead of silently shipping stale server-side
// prompt/rate-limit/retry logic.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_PATH, SYNC_HEADER, TARGET_PATH } from "../scripts/sync-ai.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("packages/ai <-> supabase/functions/_shared/ai.js sync", () => {
  it("is byte-identical to packages/ai/src/index.js except for the sync header", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const target = readFileSync(TARGET_PATH, "utf8");

    expect(
      target.startsWith(SYNC_HEADER),
      `${path.relative(rootDir, TARGET_PATH)} is missing the expected sync header. Run \`npm run sync:ai\` to regenerate it from ${path.relative(rootDir, SOURCE_PATH)}.`
    ).toBe(true);

    const targetBody = target.slice(SYNC_HEADER.length);
    expect(
      targetBody,
      `${path.relative(rootDir, TARGET_PATH)} has drifted from ${path.relative(rootDir, SOURCE_PATH)} (the source of truth). Run \`npm run sync:ai\` to bring it back in sync, then commit both files together.`
    ).toBe(source);
  });
});
