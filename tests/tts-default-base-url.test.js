import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { VOICEVOX_DEFAULT_BASE_URL } from "@nihongo-study/tts";

const require = createRequire(import.meta.url);
const { DEFAULT_BASE_URL } = require("../apps/desktop/src/ttsConfig.js");

describe("VOICEVOX default engine URL", () => {
  // ttsConfig.js is CommonJS and cannot statically import the ES module
  // package, so it keeps its own literal; this keeps the two in step.
  it("is the same in packages/tts and the desktop config", () => {
    expect(DEFAULT_BASE_URL).toBe(VOICEVOX_DEFAULT_BASE_URL);
  });
});
