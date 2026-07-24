#!/usr/bin/env node
// Syncs packages/ai/src/index.js (source of truth for the Gemini analysis
// logic/prompt) into supabase/functions/_shared/ai.js (a hand-copy consumed
// by the Deno edge function, which can't import workspace packages at
// runtime - see supabase/functions/analyze-sentence/index.ts).
//
// Run via `npm run sync:ai` whenever packages/ai/src/index.js changes. The
// only allowed difference between the two files afterward is SYNC_HEADER
// below (which only makes sense on the copy, not on the source file
// itself) - tests/ai-sync.test.js asserts everything else is byte-identical
// and fails with a pointer back to this script if it ever drifts.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_PATH = path.join(rootDir, "packages/ai/src/index.js");
export const TARGET_PATH = path.join(rootDir, "supabase/functions/_shared/ai.js");

export const SYNC_HEADER = "// Copied verbatim from packages/ai/src/index.js — keep in sync.\n// Deno-compatible ESM (uses only globalThis.fetch, no Node APIs).\n";

export function syncAi() {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const target = SYNC_HEADER + source;
  writeFileSync(TARGET_PATH, target);
  return { source, target };
}

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  syncAi();
  console.log(`Synced ${path.relative(rootDir, SOURCE_PATH)} -> ${path.relative(rootDir, TARGET_PATH)}`);
}
