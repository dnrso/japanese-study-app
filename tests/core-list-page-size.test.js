import { describe, it, expect } from "vitest";
import { DEFAULT_KANJI_WORD_LIMIT, DEFAULT_LIST_PAGE_SIZES, KANJI_WORD_LIMIT_OPTIONS, LIST_PAGE_SIZE_OPTIONS, resolveKanjiWordLimit, resolveListPageSize } from "@nihongo-study/core";

describe("DEFAULT_LIST_PAGE_SIZES / LIST_PAGE_SIZE_OPTIONS", () => {
  it("has the expected per-view defaults", () => {
    expect(DEFAULT_LIST_PAGE_SIZES).toEqual({
      sentences: 10,
      words: 20,
      grammar: 12,
      expression: 12,
      kanji: 24
    });
  });

  it("offers the selectable page sizes used by the 설정 tab", () => {
    expect(LIST_PAGE_SIZE_OPTIONS).toEqual([10, 20, 30, 50]);
  });
});

describe("resolveListPageSize", () => {
  it("falls back to the view's own default when there's no override (기본값)", () => {
    expect(resolveListPageSize("sentences", null)).toBe(10);
    expect(resolveListPageSize("words", undefined)).toBe(20);
    expect(resolveListPageSize("grammar", 0)).toBe(12);
    expect(resolveListPageSize("kanji", null)).toBe(24);
  });

  it("uses the override when one is set for that view", () => {
    expect(resolveListPageSize("sentences", 30)).toBe(30);
    expect(resolveListPageSize("kanji", 50)).toBe(50);
  });

  it("resolves each view independently - overriding one view doesn't affect another", () => {
    // Simulates main.js's per-view overrides map: only "words" has an
    // override, the rest stay on their own defaults.
    const overrides = { sentences: null, words: 50, grammar: null, expression: null, kanji: null };
    expect(resolveListPageSize("sentences", overrides.sentences)).toBe(10);
    expect(resolveListPageSize("words", overrides.words)).toBe(50);
    expect(resolveListPageSize("grammar", overrides.grammar)).toBe(12);
    expect(resolveListPageSize("expression", overrides.expression)).toBe(12);
    expect(resolveListPageSize("kanji", overrides.kanji)).toBe(24);
  });

  it("falls back to the words default for an unknown view", () => {
    expect(resolveListPageSize("unknown-view", null)).toBe(20);
  });
});

describe("resolveKanjiWordLimit", () => {
  it("offers 0/1/2/3/5/all with a default of 3", () => {
    expect(KANJI_WORD_LIMIT_OPTIONS).toEqual(["0", "1", "2", "3", "5", "all"]);
    expect(DEFAULT_KANJI_WORD_LIMIT).toBe(3);
  });

  it("maps valid values to numbers and 'all' to Infinity", () => {
    expect(resolveKanjiWordLimit("0")).toBe(0);
    expect(resolveKanjiWordLimit("5")).toBe(5);
    expect(resolveKanjiWordLimit(2)).toBe(2);
    expect(resolveKanjiWordLimit("all")).toBe(Infinity);
  });

  it("falls back to 3 for missing or invalid values", () => {
    expect(resolveKanjiWordLimit(null)).toBe(3);
    expect(resolveKanjiWordLimit(undefined)).toBe(3);
    expect(resolveKanjiWordLimit("")).toBe(3);
    expect(resolveKanjiWordLimit("4")).toBe(3);
    expect(resolveKanjiWordLimit("-1")).toBe(3);
    expect(resolveKanjiWordLimit("abc")).toBe(3);
  });
});
