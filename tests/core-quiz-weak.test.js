import { describe, it, expect } from "vitest";
import {
  buildQuizQuestion,
  buildSentenceQuizQuestion,
  createQuizSession,
  isWeakItem,
  quizAvailability,
  recordQuizStat,
  weakItems,
  weakQuizCounts,
  weakQuizQuestionIds
} from "@nihongo-study/core";

const word = (id, extra = {}) => ({ id, kind: "word", title: `単語${id}`, meaning: `뜻${id}`, ...extra });
const NOW = "2026-11-13T10:00:00.000Z";

describe("recordQuizStat", () => {
  it("a wrong answer bumps the count, resets the streak and stamps the time", () => {
    expect(recordQuizStat({ quizWrongCount: 2, quizCorrectStreak: 5 }, false, NOW)).toEqual({
      quizWrongCount: 3,
      quizCorrectStreak: 0,
      lastQuizWrongAt: NOW
    });
  });

  it("a correct answer extends the streak and keeps the last wrong time", () => {
    expect(recordQuizStat({ quizWrongCount: 1, quizCorrectStreak: 1, lastQuizWrongAt: "2026-01-01T00:00:00.000Z" }, true, NOW)).toEqual({
      quizWrongCount: 1,
      quizCorrectStreak: 2,
      lastQuizWrongAt: "2026-01-01T00:00:00.000Z"
    });
  });

  it("tolerates legacy items without the new fields", () => {
    expect(recordQuizStat({}, true, NOW)).toEqual({ quizWrongCount: 0, quizCorrectStreak: 1, lastQuizWrongAt: "" });
    expect(recordQuizStat({ quizWrongCount: 4 }, false, NOW).quizWrongCount).toBe(5);
  });
});

describe("isWeakItem / weakItems", () => {
  it("is weak after a wrong answer until two correct answers in a row", () => {
    let item = word("a");
    expect(isWeakItem(item)).toBe(false);
    item = { ...item, ...recordQuizStat(item, false, NOW) };
    expect(isWeakItem(item)).toBe(true);
    item = { ...item, ...recordQuizStat(item, true, NOW) };
    expect(isWeakItem(item)).toBe(true);
    item = { ...item, ...recordQuizStat(item, true, NOW) };
    expect(isWeakItem(item)).toBe(false);
    item = { ...item, ...recordQuizStat(item, false, NOW) };
    expect(isWeakItem(item)).toBe(true);
  });

  it("ignores deleted and never-wrong items; weakItems filters by kind", () => {
    const items = [
      word("a", { quizWrongCount: 1 }),
      word("b", { quizWrongCount: 1, quizCorrectStreak: 2 }),
      word("c", { quizWrongCount: 1, deletedAt: NOW }),
      { id: "k", kind: "kanji", title: "雨", meaning: "비", quizWrongCount: 2 }
    ];
    expect(weakItems(items, "word").map(item => item.id)).toEqual(["a"]);
    expect(weakItems(items, "kanji").map(item => item.id)).toEqual(["k"]);
    expect(weakItems(items).map(item => item.id)).toEqual(["a", "k"]);
  });
});

describe("weak-only quizzes", () => {
  const items = [word("a", { quizWrongCount: 1 }), word("b"), word("c"), word("d"), word("e")];
  const entries = [1, 2, 3, 4].map(n => ({ id: `e${n}`, kind: "sentence", title: `文${n}`, meaning: `문장${n}` }));
  const sentenceItems = [{ id: "s2", kind: "sentence", title: "文2", meaning: "문장2", quizWrongCount: 1 }];

  it("asks only restricted ids but draws choices from the whole pool", () => {
    for (let i = 0; i < 20; i += 1) {
      const question = buildQuizQuestion({ items, kind: "word", mode: "jpToMeaning", forwardMode: "jpToMeaning", reverseMode: "meaningToJp", questionIds: ["a"] });
      expect(question.item.id).toBe("a");
      expect(question.choices).toHaveLength(4);
      expect(question.choices).toContain("뜻a");
    }
  });

  it("returns null when nothing in the restriction can be asked", () => {
    expect(buildQuizQuestion({ items, kind: "word", mode: "jpToMeaning", forwardMode: "jpToMeaning", reverseMode: "meaningToJp", questionIds: ["zzz"] })).toBeNull();
    expect(buildSentenceQuizQuestion({ entries, questionIds: [] })).toBeNull();
  });

  it("restricts sentence questions to the given entry ids", () => {
    const question = buildSentenceQuizQuestion({ entries, questionIds: ["e2"] });
    expect(question.item.id).toBe("e2");
    expect(question.choices).toHaveLength(4);
  });

  it("maps weak sentence items to their daily entries by title", () => {
    const all = [...items, ...sentenceItems];
    expect(weakQuizQuestionIds({ items: all, entries, quizKind: "sentence-meaning" })).toEqual(["e2"]);
    expect(weakQuizQuestionIds({ items: all, entries, quizKind: "word" })).toEqual(["a"]);
    expect(weakQuizCounts({ items: all, entries })).toEqual({ word: 1, kanji: 0, sentence: 1 });
  });

  it("availability: weak-only with no weak items is unavailable (reason weak)", () => {
    const base = { items, entries, quizKind: "kanji" };
    const kanji = [1, 2, 3, 4].map(n => ({ id: `k${n}`, kind: "kanji", title: `漢${n}`, meaning: `한${n}` }));
    const none = quizAvailability({ ...base, items: kanji, onlyWeak: true });
    expect(none).toMatchObject({ canStart: false, reason: "weak", questionCount: 0 });
    expect(quizAvailability({ ...base, items: kanji }).canStart).toBe(true);
    const one = quizAvailability({ items, entries, quizKind: "word", mode: "jpToMeaning", onlyWeak: true });
    expect(one).toMatchObject({ canStart: true, questionCount: 1, poolSize: 5 });
    // A too-small pool keeps its own reason.
    expect(quizAvailability({ items: items.slice(0, 2), quizKind: "word", onlyWeak: true }).reason).toBe("count");
  });

  it("session length is min(10, weak count)", () => {
    expect(createQuizSession(1).total).toBe(1);
    expect(createQuizSession(25).total).toBe(10);
  });
});
