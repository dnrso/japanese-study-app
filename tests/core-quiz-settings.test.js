import { describe, expect, it } from "vitest";
import { DEFAULT_QUIZ_SETTINGS, clampQuizSessionSize, resolveQuizSettings } from "@nihongo-study/core";

describe("resolveQuizSettings", () => {
  it("falls back to defaults for missing, malformed or foreign values", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "5", "null", 7]) {
      expect(resolveQuizSettings(raw)).toEqual(DEFAULT_QUIZ_SETTINGS);
    }
    expect(DEFAULT_QUIZ_SETTINGS.reflectInReview).toBe(true);
  });

  it("restores a valid saved object (string or parsed)", () => {
    const saved = { questionFontSize: 48, reflectInReview: false, sessionSize: 20 };
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

  it("sessionSize: default 10, integer, clamped to 5-50", () => {
    expect(DEFAULT_QUIZ_SETTINGS.sessionSize).toBe(10);
    expect(resolveQuizSettings({}).sessionSize).toBe(10);
    expect(resolveQuizSettings(null).sessionSize).toBe(10);
    for (const bad of ["abc", "", null, NaN, Infinity, {}]) {
      expect(resolveQuizSettings({ sessionSize: bad }).sessionSize).toBe(10);
    }
    expect(resolveQuizSettings({ sessionSize: 4 }).sessionSize).toBe(5);
    expect(resolveQuizSettings({ sessionSize: 0 }).sessionSize).toBe(5);
    expect(resolveQuizSettings({ sessionSize: -3 }).sessionSize).toBe(5);
    expect(resolveQuizSettings({ sessionSize: 51 }).sessionSize).toBe(50);
    expect(resolveQuizSettings({ sessionSize: 999 }).sessionSize).toBe(50);
    expect(resolveQuizSettings({ sessionSize: 12.6 }).sessionSize).toBe(13);
    expect(resolveQuizSettings({ sessionSize: 12.4 }).sessionSize).toBe(12);
    expect(resolveQuizSettings({ sessionSize: "25" }).sessionSize).toBe(25);
    expect(clampQuizSessionSize("7.5")).toBe(8);
  });
});
