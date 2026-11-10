import { describe, it, expect } from "vitest";
import {
  QUIZ_SESSION_SIZE,
  advanceQuizSession,
  buildQuizQuestion,
  createQuizSession,
  isLastQuizQuestion,
  quizAvailability,
  recordQuizAnswer
} from "@nihongo-study/core";

const word = (id, title, meaning, extra = {}) => ({ id, kind: "word", title, meaning, ...extra });
const words = Array.from({ length: 8 }, (_, i) => word(`w${i}`, `単語${i}`, `뜻${i}`));
const sentence = (id, n) => ({ id, kind: "sentence", title: `文${n}`, meaning: `문장${n}` });
const question = (id, correctAnswer = "뜻", mode = "jpToMeaning") => ({
  item: { id, title: `T${id}`, meaning: `M${id}` },
  answerType: mode === "meaningToJp" ? "title" : "meaning",
  mode,
  correctAnswer
});

describe("quiz session", () => {
  it("caps the session at 10 and shrinks to a smaller pool", () => {
    expect(createQuizSession(30).total).toBe(QUIZ_SESSION_SIZE);
    expect(createQuizSession(6).total).toBe(6);
  });

  it("counts correct answers and collects missed items (question -> answer)", () => {
    let session = createQuizSession(5);
    session = recordQuizAnswer(session, question("a", "M-a"), true);
    session = recordQuizAnswer(session, question("b", "M-b"), false, "틀린 보기");
    session = recordQuizAnswer(session, question("c", "T-c", "meaningToJp"), false);
    expect(session.correct).toBe(1);
    expect(session.seenIds).toEqual(["a", "b", "c"]);
    expect(session.missed).toEqual([
      { id: "b", prompt: "Tb", answer: "M-b", item: { id: "b", title: "Tb", meaning: "Mb" }, selectedAnswer: "틀린 보기" },
      { id: "c", prompt: "Mc", answer: "T-c", item: { id: "c", title: "Tc", meaning: "Mc" }, selectedAnswer: "" }
    ]);
  });

  it("advances and finishes after the last question", () => {
    let session = createQuizSession(2);
    expect(isLastQuizQuestion(session)).toBe(false);
    session = advanceQuizSession(session);
    expect(session).toMatchObject({ index: 1, finished: false });
    expect(isLastQuizQuestion(session)).toBe(true);
    expect(advanceQuizSession(session).finished).toBe(true);
  });

  it("never repeats an item while the pool allows (excludeIds)", () => {
    const seen = [];
    for (let i = 0; i < words.length; i += 1) {
      const q = buildQuizQuestion({ items: words, kind: "word", mode: "jpToMeaning", forwardMode: "jpToMeaning", reverseMode: "meaningToJp", excludeIds: seen });
      expect(seen).not.toContain(q.item.id);
      seen.push(q.item.id);
    }
    expect(new Set(seen).size).toBe(words.length);
  });
});

describe("quizAvailability", () => {
  it("reports the pool and startability for word/kanji", () => {
    expect(quizAvailability({ items: words, quizKind: "word" })).toMatchObject({ poolSize: 8, canStart: true });
    expect(quizAvailability({ items: words.slice(0, 2), quizKind: "word" })).toMatchObject({ poolSize: 2, canStart: false, reason: "count" });
    expect(quizAvailability({ items: words, quizKind: "kanji" })).toMatchObject({ poolSize: 0, canStart: false });
  });

  it("ignores items missing a title/meaning", () => {
    const items = [...words.slice(0, 3), word("x", "x", "")];
    expect(quizAvailability({ items, quizKind: "word" }).poolSize).toBe(3);
  });

  it("requires 4 distinct answers for the chosen direction", () => {
    const items = [1, 2, 3, 4].map(n => word(`d${n}`, `語${n}`, "같은 뜻"));
    expect(quizAvailability({ items, quizKind: "word", mode: "jpToMeaning" })).toMatchObject({ canStart: false, reason: "distinct" });
    expect(quizAvailability({ items, quizKind: "word", mode: "meaningToJp" }).canStart).toBe(true);
    expect(quizAvailability({ items, quizKind: "word", mode: "random" }).canStart).toBe(false);
  });

  it("counts top-level sentences for both sentence quizzes", () => {
    const entries = [1, 2, 3, 4, 5].map(n => sentence(`s${n}`, n)).concat({ ...sentence("c", 9), parentId: "s1" });
    expect(quizAvailability({ entries, quizKind: "sentence-meaning" })).toMatchObject({ poolSize: 5, canStart: true });
    expect(quizAvailability({ entries: entries.slice(0, 3), quizKind: "sentence-listen" }).canStart).toBe(false);
  });
});
