import { describe, it, expect } from "vitest";
import {
  buildQuizQuestion,
  buildSentenceQuizQuestion,
  planQuizQuestionIds,
  sentenceQuizPlanCandidates
} from "@nihongo-study/core";

// Deterministic LCG so shuffles are reproducible.
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const stamp = n => `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`;
const fresh = id => ({ id });
const weak = (id, wrong = 1, at = 5) => ({ id, quizWrongCount: wrong, quizCorrectStreak: 0, lastQuizzedAt: stamp(at) });
const stale = (id, at) => ({ id, quizCorrectCount: 3, quizCorrectStreak: 3, lastQuizzedAt: stamp(at) });
const many = (count, make, prefix) => Array.from({ length: count }, (_, i) => make(`${prefix}${i}`, i + 1));
const bucketOf = id => id[0];

describe("planQuizQuestionIds", () => {
  it("splits 10 as 4 weak / 3 new / 3 stale when every bucket is plentiful", () => {
    const candidates = [
      ...many(8, (id, i) => weak(id, 1, i), "w"),
      ...many(8, id => fresh(id), "n"),
      ...many(8, (id, i) => stale(id, i), "s")
    ];
    const plan = planQuizQuestionIds({ candidates, size: 10, random: seeded(3) });
    expect(plan).toHaveLength(10);
    expect(plan.filter(id => bucketOf(id) === "w")).toHaveLength(4);
    expect(plan.filter(id => bucketOf(id) === "n")).toHaveLength(3);
    expect(plan.filter(id => bucketOf(id) === "s")).toHaveLength(3);
  });

  it("gives rounding remainders to weak first, then stale", () => {
    const candidates = [
      ...many(30, (id, i) => weak(id, 1, i), "w"),
      ...many(30, id => fresh(id), "n"),
      ...many(30, (id, i) => stale(id, i), "s")
    ];
    const count = (size, letter) => planQuizQuestionIds({ candidates, size, random: seeded(1) }).filter(id => bucketOf(id) === letter).length;
    // 5 -> floor 2/1/1, remainder 1 -> weak
    expect([count(5, "w"), count(5, "n"), count(5, "s")]).toEqual([3, 1, 1]);
    // 6 -> 2/1/1, remainder 2 -> weak, stale
    expect([count(6, "w"), count(6, "n"), count(6, "s")]).toEqual([3, 1, 2]);
    // 20 -> 8/6/6, 50 -> 20/15/15
    expect([count(20, "w"), count(20, "n"), count(20, "s")]).toEqual([8, 6, 6]);
    expect([count(50, "w"), count(50, "n"), count(50, "s")]).toEqual([20, 15, 15]);
  });

  it("still asks older items when many new items exist", () => {
    const candidates = [
      ...many(40, id => fresh(id), "n"),
      ...many(3, (id, i) => stale(id, i), "s"),
      ...many(2, (id, i) => weak(id, 1, i), "w")
    ];
    const plan = planQuizQuestionIds({ candidates, size: 10, random: seeded(7) });
    expect(plan).toHaveLength(10);
    expect(plan.filter(id => bucketOf(id) === "s")).toHaveLength(3);
    expect(plan.filter(id => bucketOf(id) === "w")).toHaveLength(2);
    // the shortfall of weak (4 -> 2) goes to stale first (already exhausted), then new
    expect(plan.filter(id => bucketOf(id) === "n")).toHaveLength(5);
  });

  it("redistributes a short bucket to stale, then weak, then new", () => {
    // no weak items: 4 weak quota -> stale first
    const noWeak = [...many(10, id => fresh(id), "n"), ...many(10, (id, i) => stale(id, i), "s")];
    const a = planQuizQuestionIds({ candidates: noWeak, size: 10, random: seeded(2) });
    expect(a.filter(id => bucketOf(id) === "s")).toHaveLength(7);
    expect(a.filter(id => bucketOf(id) === "n")).toHaveLength(3);
    // no weak, only 4 stale: remaining shortfall goes to new
    const fewStale = [...many(10, id => fresh(id), "n"), ...many(4, (id, i) => stale(id, i), "s")];
    const b = planQuizQuestionIds({ candidates: fewStale, size: 10, random: seeded(2) });
    expect(b.filter(id => bucketOf(id) === "s")).toHaveLength(4);
    expect(b.filter(id => bucketOf(id) === "n")).toHaveLength(6);
    // no stale, new short: stale quota -> weak
    const c = planQuizQuestionIds({ candidates: [...many(10, (id, i) => weak(id, 1, i), "w"), ...many(1, id => fresh(id), "n")], size: 10, random: seeded(2) });
    expect(c.filter(id => bucketOf(id) === "w")).toHaveLength(9);
    expect(c.filter(id => bucketOf(id) === "n")).toHaveLength(1);
  });

  it("returns every askable id when size exceeds the pool", () => {
    const candidates = [weak("w0"), fresh("n0"), stale("s0", 1), stale("s1", 2)];
    const plan = planQuizQuestionIds({ candidates, size: 10, random: seeded(4) });
    expect([...plan].sort()).toEqual(["n0", "s0", "s1", "w0"]);
  });

  it("returns an empty plan for empty input or size 0", () => {
    expect(planQuizQuestionIds({ candidates: [], size: 10 })).toEqual([]);
    expect(planQuizQuestionIds({ candidates: [fresh("a")], size: 0 })).toEqual([]);
  });

  it("restricts to questionIds first (weak-only) and plans on that set", () => {
    const candidates = [...many(6, (id, i) => weak(id, 1, i), "w"), ...many(6, id => fresh(id), "n")];
    const questionIds = ["w0", "w1", "w2", "n0"];
    const plan = planQuizQuestionIds({ candidates, size: 10, random: seeded(5), questionIds });
    expect([...plan].sort()).toEqual(["n0", "w0", "w1", "w2"]);
    expect(planQuizQuestionIds({ candidates, size: 10, questionIds: [] })).toEqual([]);
  });

  it("picks the oldest stale items first", () => {
    const candidates = [
      ...many(10, (id, i) => stale(id, i + 1), "s"), // s0 oldest ... s9 newest
      ...many(10, id => fresh(id), "n")
    ];
    // 10 -> 4 weak (none) + 3 new + 3 stale; weak shortfall goes to stale -> 7 oldest stale
    const plan = planQuizQuestionIds({ candidates, size: 10, random: seeded(9) });
    const staleIds = plan.filter(id => bucketOf(id) === "s").sort();
    expect(staleIds).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
  });

  it("orders weak by wrong count, then older lastQuizzedAt", () => {
    const candidates = [
      weak("w-low-old", 1, 1),
      weak("w-high-new", 3, 9),
      weak("w-high-old", 3, 2),
      weak("w-mid", 2, 5),
      ...many(20, id => fresh(id), "n"),
      ...many(20, (id, i) => stale(id, i), "s")
    ];
    // size 10 -> 4 weak quota: all four weak items
    expect(planQuizQuestionIds({ candidates, size: 10, random: seeded(1) }).filter(id => id.startsWith("w-")).sort())
      .toEqual(["w-high-new", "w-high-old", "w-low-old", "w-mid"]);
    // size 5 -> weak quota 3: the three highest in order (3,3 by age, then 2)
    const plan = planQuizQuestionIds({ candidates, size: 5, random: seeded(1) });
    expect(plan.filter(id => id.startsWith("w-")).sort()).toEqual(["w-high-new", "w-high-old", "w-mid"]);
  });

  it("does not treat recovered items (2 correct in a row) as weak", () => {
    const recovered = { id: "r", quizWrongCount: 1, quizCorrectCount: 2, quizCorrectStreak: 2, lastQuizzedAt: stamp(1) };
    const candidates = [recovered, ...many(10, id => fresh(id), "n")];
    // only stale/new exist; recovered is stale and, as the oldest stale, is always planned
    const plan = planQuizQuestionIds({ candidates, size: 10, random: seeded(8) });
    expect(plan).toContain("r");
  });

  it("never duplicates ids (even with duplicate candidates) and is deterministic", () => {
    const candidates = [...many(12, id => fresh(id), "n"), ...many(12, (id, i) => stale(id, i), "s"), fresh("n0")];
    const a = planQuizQuestionIds({ candidates, size: 10, random: seeded(11) });
    const b = planQuizQuestionIds({ candidates, size: 10, random: seeded(11) });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    const c = planQuizQuestionIds({ candidates, size: 50, random: seeded(11) });
    expect(new Set(c).size).toBe(c.length);
    expect(c).toHaveLength(24);
  });

  it("interleaves buckets rather than asking them in bucket order", () => {
    const candidates = [
      ...many(10, (id, i) => weak(id, 1, i), "w"),
      ...many(10, id => fresh(id), "n"),
      ...many(10, (id, i) => stale(id, i), "s")
    ];
    const orders = new Set();
    for (let seed = 1; seed <= 5; seed += 1) {
      orders.add(planQuizQuestionIds({ candidates, size: 10, random: seeded(seed) }).map(bucketOf).join(""));
    }
    expect(orders.size).toBeGreaterThan(1);
    expect([...orders].some(order => order !== "wwwwnnnsss")).toBe(true);
  });
});

describe("buildQuizQuestion itemId", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, kind: "word", title: `語${i}`, meaning: `뜻${i}`, quizCorrectCount: i }));
  const base = { items, kind: "word", mode: "jpToMeaning", forwardMode: "jpToMeaning", reverseMode: "meaningToJp" };

  it("asks exactly the planned item, with choices from the full pool", () => {
    for (let i = 0; i < 10; i += 1) {
      const q = buildQuizQuestion({ ...base, itemId: "w4" });
      expect(q.item.id).toBe("w4");
      expect(q.choices).toHaveLength(4);
    }
  });

  it("falls back to a random unseen item when the planned one is invalid, excluded or not askable", () => {
    expect(buildQuizQuestion({ ...base, itemId: "nope", excludeIds: ["w0"] }).item.id).not.toBe("w0");
    expect(buildQuizQuestion({ ...base, itemId: "w1", excludeIds: ["w1"] }).item.id).not.toBe("w1");
    expect(buildQuizQuestion({ ...base, itemId: "w1", questionIds: ["w2"] }).item.id).toBe("w2");
  });

  it("without itemId picks randomly among unseen items, not by lowest correct count", () => {
    const picked = new Set();
    for (let seed = 1; seed <= 30; seed += 1) {
      picked.add(buildQuizQuestion({ ...base, random: () => seed / 31 }).item.id);
    }
    expect(picked.size).toBeGreaterThan(1);
  });
});

describe("sentence quiz planning", () => {
  const entries = [1, 2, 3, 4, 5, 6].map(n => ({ id: `e${n}`, kind: "sentence", title: `文${n}`, meaning: `문장${n}` }));
  const items = [
    { id: "i1", kind: "sentence", title: "文1", meaning: "문장1", quizWrongCount: 2, quizCorrectStreak: 0, lastQuizzedAt: stamp(1) },
    { id: "i2", kind: "sentence", title: "文2", meaning: "문장2", quizCorrectCount: 4, quizCorrectStreak: 4, lastQuizzedAt: stamp(2) }
  ];

  it("maps entries to registered sentence item stats; unregistered entries are new", () => {
    const candidates = sentenceQuizPlanCandidates({ items, entries });
    expect(candidates.map(c => c.id)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6"]);
    expect(candidates[0]).toMatchObject({ quizWrongCount: 2 });
    expect(candidates[2]).toEqual({ id: "e3" });
    const plan = planQuizQuestionIds({ candidates, size: 6, random: seeded(2) });
    expect([...plan].sort()).toEqual(["e1", "e2", "e3", "e4", "e5", "e6"]);
    // size 5: weak e1 (quota 3 > 1), stale e2 gets shortfall; both appear despite 4 new entries
    const small = planQuizQuestionIds({ candidates, size: 5, random: seeded(2) });
    expect(small).toContain("e1");
    expect(small).toContain("e2");
  });

  it("asks the planned entry via itemId", () => {
    const q = buildSentenceQuizQuestion({ entries, itemId: "e5" });
    expect(q.item.id).toBe("e5");
    expect(buildSentenceQuizQuestion({ entries, itemId: "e5", excludeIds: ["e5"] }).item.id).not.toBe("e5");
  });
});
