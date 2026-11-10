import { describe, it, expect } from "vitest";
import {
  homeOverview,
  itemsByKind,
  matchesSearch,
  matchesSearchText,
  normalizeSearchText,
  quickFilterCounts,
  searchHighlightRanges,
  searchTerms
} from "@nihongo-study/core";

const umbrella = { id: "w1", kind: "word", title: "傘", reading: "かさ", meaning: "우산", review: "대기", level: "N5" };
const rain = { id: "w2", kind: "word", title: "雨", reading: "あめ", meaning: "비", review: "오늘", note: "Rainy" };

describe("search normalization", () => {
  it("folds katakana, case and width", () => {
    expect(normalizeSearchText("アメ ABC")).toBe("あめ abc");
    expect(normalizeSearchText("ＡＢ")).toBe("ab");
    expect(normalizeSearchText("  a ")).toBe("  a ");
  });

  it("splits terms on ascii and full-width whitespace", () => {
    expect(searchTerms("  傘　우산  ")).toEqual(["傘", "우산"]);
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("matchesSearch", () => {
  it("matches everything for an empty term", () => {
    expect(matchesSearch(umbrella, "")).toBe(true);
    expect(matchesSearch(umbrella, "  ")).toBe(true);
  });

  it("matches katakana input against hiragana readings", () => {
    expect(matchesSearch(rain, "アメ")).toBe(true);
    expect(matchesSearch(umbrella, "アメ")).toBe(false);
    expect(matchesSearch(rain, "rainy")).toBe(true);
  });

  it("requires every term (AND)", () => {
    expect(matchesSearch(umbrella, "傘 우산")).toBe(true);
    expect(matchesSearch(umbrella, "傘 비")).toBe(false);
  });

  it("no longer searches level/review", () => {
    expect(matchesSearch(umbrella, "N5")).toBe(false);
    expect(matchesSearch(umbrella, "대기")).toBe(false);
    expect(itemsByKind([umbrella, rain], "word", "あめ")).toEqual([rain]);
  });
});

describe("matchesSearchText", () => {
  it("applies AND semantics over free text", () => {
    expect(matchesSearchText("雨が降る あめ 비가 오다", "アメ 비")).toBe(true);
    expect(matchesSearchText("雨が降る", "雨 우산")).toBe(false);
    expect(matchesSearchText("anything", "")).toBe(true);
  });
});

describe("searchHighlightRanges", () => {
  it("finds kana-insensitive, case-insensitive ranges", () => {
    expect(searchHighlightRanges("あめ ふる", "アメ")).toEqual([[0, 2]]);
    expect(searchHighlightRanges("Rain rain", "RAIN")).toEqual([[0, 4], [5, 9]]);
  });

  it("merges overlapping and adjacent ranges", () => {
    expect(searchHighlightRanges("abcd", "ab bc")).toEqual([[0, 3]]);
    expect(searchHighlightRanges("abcd", "ab cd")).toEqual([[0, 4]]);
  });

  it("returns nothing for no terms, no match, or length-changing normalization", () => {
    expect(searchHighlightRanges("abc", "")).toEqual([]);
    expect(searchHighlightRanges("abc", "z")).toEqual([]);
    expect(searchHighlightRanges("㈱abc", "abc")).toEqual([]);
  });
});

describe("home summary ignores search", () => {
  const state = { items: [umbrella, rain] };
  it("homeOverview and quickFilterCounts take no search term", () => {
    expect(homeOverview(state, "存在しない").reviewItemCount).toBe(2);
    expect(quickFilterCounts(state, "存在しない").review).toBe(2);
  });
});

describe("matchesSearch sentence note", () => {
  it("문장의 note(입력 원문)는 검색하지 않는다", async () => {
    const { matchesSearch } = await import("../packages/core/src/index.js");
    const sentence = { kind: "sentence", title: "今日疲れた", note: "`今日` (きょう) 오늘 | 품사=명사" };
    expect(matchesSearch(sentence, "명사")).toBe(false);
    expect(matchesSearch({ ...sentence, kind: "word" }, "명사")).toBe(true);
  });
});
