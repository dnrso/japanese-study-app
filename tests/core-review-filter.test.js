import { describe, it, expect } from "vitest";
import {
  REVIEW_KIND_FILTER_OPTIONS,
  matchesReviewKindFilter,
  normalizeReviewKindFilter,
  reviewCompletionTargets,
  reviewItems
} from "@nihongo-study/core";

// Minimal review-item shapes: isReviewQueueItem only cares about `review`
// (오늘/대기) and `kind !== "source"`, and matchesSearch reads the SEARCH_FIELDS
// strings, so title/meaning are enough to exercise search composition.
const items = [
  { id: "w1", kind: "word", title: "私", meaning: "나, 저", review: "대기" },
  { id: "w2", kind: "word", title: "犬", meaning: "개", review: "오늘" },
  { id: "e1", kind: "expression", title: "お疲れさまです", meaning: "수고하셨습니다", review: "대기" },
  { id: "g1", kind: "grammar", title: "したかな", meaning: "했었나", review: "오늘" },
  { id: "s1", kind: "sentence", title: "犬が好きです", meaning: "개를 좋아합니다", review: "대기" },
  { id: "k1", kind: "kanji", title: "犬", meaning: "개 견", review: "대기" },
  // Excluded from the queue regardless of any filter.
  { id: "src1", kind: "source", title: "犬 교재", meaning: "", review: "대기" },
  { id: "w3", kind: "word", title: "猫", meaning: "고양이", review: "일주일" }
];

const ids = list => list.map(item => item.id);

describe("REVIEW_KIND_FILTER_OPTIONS", () => {
  it("offers 단어/표현/문법/문장/한자 in control order", () => {
    expect(REVIEW_KIND_FILTER_OPTIONS).toEqual(["word", "expression", "grammar", "sentence", "kanji"]);
  });

  // 자료 is the one kind isReviewQueueItem excludes outright, so it must never
  // become an option: selecting it could only ever show an empty queue.
  it("never offers 자료", () => {
    expect(REVIEW_KIND_FILTER_OPTIONS).not.toContain("source");
  });
});

describe("normalizeReviewKindFilter", () => {
  it("keeps a supported kind", () => {
    REVIEW_KIND_FILTER_OPTIONS.forEach(kind => {
      expect(normalizeReviewKindFilter(kind)).toBe(kind);
    });
  });

  it("degrades anything else to 전체 (empty string)", () => {
    expect(normalizeReviewKindFilter("")).toBe("");
    expect(normalizeReviewKindFilter("source")).toBe("");
    expect(normalizeReviewKindFilter("nonsense")).toBe("");
    expect(normalizeReviewKindFilter(undefined)).toBe("");
    expect(normalizeReviewKindFilter(null)).toBe("");
  });
});

describe("matchesReviewKindFilter", () => {
  it("matches everything under 전체", () => {
    expect(matchesReviewKindFilter({ kind: "word" }, "")).toBe(true);
    expect(matchesReviewKindFilter({ kind: "kanji" }, "")).toBe(true);
  });

  it("matches only the selected kind", () => {
    expect(matchesReviewKindFilter({ kind: "sentence" }, "sentence")).toBe(true);
    expect(matchesReviewKindFilter({ kind: "word" }, "sentence")).toBe(false);
  });

  it("treats an unsupported filter value as 전체", () => {
    expect(matchesReviewKindFilter({ kind: "word" }, "source")).toBe(true);
    expect(matchesReviewKindFilter({ kind: "word" }, "nonsense")).toBe(true);
  });
});

describe("reviewItems kind filtering", () => {
  it("returns the whole queue (minus 자료) when no kind is selected", () => {
    expect(ids(reviewItems(items))).toEqual(["w1", "w2", "e1", "g1", "s1", "k1"]);
    expect(ids(reviewItems(items, "", ""))).toEqual(["w1", "w2", "e1", "g1", "s1", "k1"]);
  });

  it("narrows to a single kind", () => {
    expect(ids(reviewItems(items, "", "word"))).toEqual(["w1", "w2"]);
    expect(ids(reviewItems(items, "", "expression"))).toEqual(["e1"]);
    expect(ids(reviewItems(items, "", "grammar"))).toEqual(["g1"]);
  });

  it("includes 문장 and 한자 items, which already qualify for the queue", () => {
    expect(ids(reviewItems(items, "", "sentence"))).toEqual(["s1"]);
    expect(ids(reviewItems(items, "", "kanji"))).toEqual(["k1"]);
  });

  it("never lets a kind filter pull in a non-queue item", () => {
    // w3 is scheduled (일주일) and src1 is a 자료: no filter value resurrects them.
    ["", ...REVIEW_KIND_FILTER_OPTIONS].forEach(kind => {
      const result = ids(reviewItems(items, "", kind));
      expect(result).not.toContain("w3");
      expect(result).not.toContain("src1");
    });
  });

  it("composes with the search term instead of replacing it", () => {
    // 犬 alone matches a word, a sentence and a kanji item.
    expect(ids(reviewItems(items, "犬"))).toEqual(["w2", "s1", "k1"]);
    // ...and adding the kind filter intersects the two conditions.
    expect(ids(reviewItems(items, "犬", "word"))).toEqual(["w2"]);
    expect(ids(reviewItems(items, "犬", "sentence"))).toEqual(["s1"]);
    expect(ids(reviewItems(items, "犬", "kanji"))).toEqual(["k1"]);
    // An empty intersection is empty, not "fall back to one of them".
    expect(ids(reviewItems(items, "犬", "grammar"))).toEqual([]);
    expect(ids(reviewItems(items, "고양이", "word"))).toEqual([]);
  });

  it("shows every queue item under 전체, and each item under exactly one option", () => {
    const all = ids(reviewItems(items, "", ""));
    expect(all).toContain("k1");
    // Each option is disjoint and together they cover the whole queue, so no
    // queue item can hide from every filter the control offers.
    const perOption = REVIEW_KIND_FILTER_OPTIONS.flatMap(kind => ids(reviewItems(items, "", kind)));
    expect([...perOption].sort()).toEqual([...all].sort());
  });

  it("handles an empty item list", () => {
    expect(reviewItems([], "", "word")).toEqual([]);
    expect(reviewItems(undefined, "", "word")).toEqual([]);
  });
});

describe("reviewCompletionTargets with a kind filter", () => {
  const drafts = new Map([
    ["w1", "내일"],
    ["e1", "일주일"],
    ["s1", "한달"],
    ["k1", "3일 후"]
  ]);

  it("completes every drafted queue item under 전체", () => {
    expect(reviewCompletionTargets({ items, drafts })).toEqual([
      { id: "w1", review: "내일" },
      { id: "e1", review: "일주일" },
      { id: "s1", review: "한달" },
      { id: "k1", review: "3일 후" }
    ]);
  });

  it("only completes what the active kind filter leaves visible", () => {
    expect(reviewCompletionTargets({ items, drafts, kindFilter: "word" })).toEqual([
      { id: "w1", review: "내일" }
    ]);
    expect(reviewCompletionTargets({ items, drafts, kindFilter: "sentence" })).toEqual([
      { id: "s1", review: "한달" }
    ]);
    expect(reviewCompletionTargets({ items, drafts, kindFilter: "kanji" })).toEqual([
      { id: "k1", review: "3일 후" }
    ]);
  });

  it("intersects the kind filter with the search term", () => {
    expect(reviewCompletionTargets({ items, drafts, searchTerm: "犬", kindFilter: "sentence" })).toEqual([
      { id: "s1", review: "한달" }
    ]);
    // The drafted word item (w1 = 私) is filtered out by the search term.
    expect(reviewCompletionTargets({ items, drafts, searchTerm: "犬", kindFilter: "word" })).toEqual([]);
  });

  it("skips visible items that have no draft (still 대기)", () => {
    // w2/g1 are visible but undrafted, so a kind filter matching them
    // produces nothing to complete.
    expect(reviewCompletionTargets({ items, drafts: new Map(), kindFilter: "word" })).toEqual([]);
    expect(reviewCompletionTargets({ items, drafts, kindFilter: "grammar" })).toEqual([]);
  });
});
