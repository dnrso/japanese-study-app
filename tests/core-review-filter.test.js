import { describe, it, expect } from "vitest";
import {
  REVIEW_KIND_FILTER_OPTIONS,
  matchesReviewKindFilter,
  normalizeReviewKindFilter,
  groupReviewItemsByKind,
  reviewItems,
  reviewKindCounts,
  reviewQueueDueDate,
  reviewQueueProgress,
  reviewSnapshot
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
  it("offers 단어/문법/표현/한자/문장 in display order", () => {
    expect(REVIEW_KIND_FILTER_OPTIONS).toEqual(["word", "grammar", "expression", "kanji", "sentence"]);
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

describe("reviewKindCounts", () => {
  it("counts the search-narrowed queue per kind, plus the 전체 total", () => {
    expect(reviewKindCounts(items)).toEqual({ all: 6, word: 2, grammar: 1, expression: 1, kanji: 1, sentence: 1 });
    expect(reviewKindCounts(items, "犬")).toEqual({ all: 3, word: 1, grammar: 0, expression: 0, kanji: 1, sentence: 1 });
  });
});

describe("groupReviewItemsByKind", () => {
  it("groups in the fixed kind order and skips empty kinds", () => {
    const groups = groupReviewItemsByKind(reviewItems(items));
    expect(groups.map(group => group.kind)).toEqual(["word", "grammar", "expression", "kanji", "sentence"]);
    expect(groups.map(group => ids(group.items))).toEqual([["w1", "w2"], ["g1"], ["e1"], ["k1"], ["s1"]]);
    expect(groupReviewItemsByKind(reviewItems(items, "犬")).map(group => group.kind)).toEqual(["word", "kanji", "sentence"]);
    expect(groupReviewItemsByKind([])).toEqual([]);
  });
});

describe("reviewQueueProgress", () => {
  const reviewed = (id, kind, at) => ({ id, kind, title: id, review: "일주일", lastReviewedAt: at });
  const base = [
    ...items,
    reviewed("d1", "word", "2026-11-10T01:00:00.000Z"),
    reviewed("d2", "sentence", "2026-11-10T02:00:00.000Z"),
    reviewed("old", "word", "2026-11-09T02:00:00.000Z")
  ];

  it("counts today's completions against the remaining queue", () => {
    expect(reviewQueueProgress(base, "", "2026-11-10")).toEqual({ done: 2, remaining: 6, percent: 25 });
  });

  it("narrows only the remaining side by the search term", () => {
    expect(reviewQueueProgress(base, "犬", "2026-11-10")).toEqual({ done: 2, remaining: 3, percent: 40 });
  });

  it("is 0% with nothing done or remaining", () => {
    expect(reviewQueueProgress([], "", "2026-11-10")).toEqual({ done: 0, remaining: 0, percent: 0 });
  });
});

describe("reviewQueueDueDate / reviewSnapshot", () => {
  it("resolves intervals from the given day", () => {
    expect(reviewQueueDueDate("내일", "2026-11-10")).toBe("2026-11-11");
    expect(reviewQueueDueDate("3일 후", "2026-11-10")).toBe("2026-11-13");
    expect(reviewQueueDueDate("대기", "2026-11-10")).toBe("");
  });

  it("captures exactly what a completion overwrites", () => {
    expect(reviewSnapshot({ review: "오늘", reviewDueDate: "", lastReviewedAt: "x", title: "y" }))
      .toEqual({ review: "오늘", reviewDueDate: "", lastReviewedAt: "x" });
    expect(reviewSnapshot({})).toEqual({ review: "대기", reviewDueDate: "", lastReviewedAt: "" });
  });
});

import {
  isReviewDue,
  matchesStudyCardFilters,
  normalizeStudyCardSort,
  sortStudyCards,
  studyCardFilterCounts
} from "@nihongo-study/core";

describe("study card sort and filters", () => {
  const list = [
    { id: "a", title: "〜ている", review: "내일" },
    { id: "b", title: "あげる", review: "대기", sourceSentences: [{ id: "s1", title: "x", studyDate: "2026-01-01" }] },
    { id: "c", title: "~がち", review: "오늘" },
    { id: "d", title: "いい", review: "일주일" }
  ];
  const ids = rows => rows.map(row => row.id);

  it("keeps recent order, reverses for oldest, without mutating", () => {
    expect(ids(sortStudyCards(list, "recent"))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortStudyCards(list, "oldest"))).toEqual(["d", "c", "b", "a"]);
    expect(ids(list)).toEqual(["a", "b", "c", "d"]);
  });
  it("sorts by title ignoring a leading 〜/~", () => {
    expect(ids(sortStudyCards(list, "kana"))).toEqual(["b", "d", "c", "a"]);
  });
  it("puts due items first, then recent", () => {
    expect(ids(sortStudyCards(list, "due"))).toEqual(["b", "c", "a", "d"]);
    expect(isReviewDue(list[0])).toBe(false);
  });
  it("normalizes unknown sort keys", () => {
    expect(normalizeStudyCardSort("zzz")).toBe("recent");
    expect(normalizeStudyCardSort("kana")).toBe("kana");
  });
  it("counts and matches filters", () => {
    expect(studyCardFilterCounts(list)).toEqual({
      review: { all: 4, due: 2, scheduled: 2 },
      source: { all: 4, sentence: 1, manual: 3 }
    });
    expect(ids(list.filter(item => matchesStudyCardFilters(item, { review: "due", source: "sentence" })))).toEqual(["b"]);
    expect(ids(list.filter(item => matchesStudyCardFilters(item, { review: "scheduled" })))).toEqual(["a", "d"]);
    expect(list.every(item => matchesStudyCardFilters(item, {}))).toBe(true);
  });
});
