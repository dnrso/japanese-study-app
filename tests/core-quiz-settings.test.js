import { describe, expect, it } from "vitest";
import { DEFAULT_QUIZ_SETTINGS, resolveQuizSettings } from "@nihongo-study/core";

describe("resolveQuizSettings", () => {
  it("falls back to defaults for missing, malformed or foreign values", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "5", "null", 7]) {
      expect(resolveQuizSettings(raw)).toEqual(DEFAULT_QUIZ_SETTINGS);
    }
    expect(DEFAULT_QUIZ_SETTINGS.reflectInReview).toBe(true);
  });

  it("restores a valid saved object (string or parsed)", () => {
    const saved = { questionFontSize: 48, reflectInReview: false };
    expect(resolveQuizSettings(JSON.stringify(saved))).toEqual(saved);
    expect(resolveQuizSettings(saved)).toEqual(saved);
  });

  it("ignores the retired reviewOnCorrect/correctReview fields", () => {
    expect(resolveQuizSettings({ reviewOnCorrect: false, correctReview: "일주일" })).toEqual(DEFAULT_QUIZ_SETTINGS);
  });

  it("validates each field independently", () => {
    expect(resolveQuizSettings({ questionFontSize: 999 }).questionFontSize).toBe(64);
    expect(resolveQuizSettings({ questionFontSize: 1 }).questionFontSize).toBe(24);
    expect(resolveQuizSettings({ questionFontSize: "abc" }).questionFontSize).toBe(32);
    expect(resolveQuizSettings({ reflectInReview: "yes" }).reflectInReview).toBe(true);
  });
});
