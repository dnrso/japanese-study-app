import { describe, expect, it } from "vitest";
import { DEFAULT_QUIZ_SETTINGS, resolveQuizSettings } from "@nihongo-study/core";

const options = ["내일", "3일 후", "일주일", "2주일", "한달"];

describe("resolveQuizSettings", () => {
  it("falls back to defaults for missing, malformed or foreign values", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "5", "null", 7]) {
      expect(resolveQuizSettings(raw, options)).toEqual(DEFAULT_QUIZ_SETTINGS);
    }
  });

  it("restores a valid saved object (string or parsed)", () => {
    const saved = { questionFontSize: 48, reviewOnCorrect: false, correctReview: "일주일" };
    expect(resolveQuizSettings(JSON.stringify(saved), options)).toEqual(saved);
    expect(resolveQuizSettings(saved, options)).toEqual(saved);
  });

  it("keeps the 변경 안 함 (empty) review value", () => {
    expect(resolveQuizSettings({ correctReview: "" }, options).correctReview).toBe("");
  });

  it("validates each field independently", () => {
    expect(resolveQuizSettings({ questionFontSize: 999 }, options).questionFontSize).toBe(64);
    expect(resolveQuizSettings({ questionFontSize: 1 }, options).questionFontSize).toBe(24);
    expect(resolveQuizSettings({ questionFontSize: "abc" }, options).questionFontSize).toBe(32);
    expect(resolveQuizSettings({ reviewOnCorrect: "yes" }, options).reviewOnCorrect).toBe(true);
    expect(resolveQuizSettings({ correctReview: "bogus" }, options).correctReview).toBe("내일");
    expect(resolveQuizSettings({ correctReview: 3 }, options).correctReview).toBe("내일");
  });
});
