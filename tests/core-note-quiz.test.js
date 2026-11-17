// Quiz from a note: which linked cards may be asked, and how a question-id
// scope narrows quizAvailability.
import { describe, it, expect } from "vitest";
import {
  NOTE_QUIZ_KINDS,
  intersectQuestionIds,
  noteQuizLinkedCount,
  noteQuizQuestionIds,
  quizAvailability
} from "@nihongo-study/core";

// Weak = wrong at least once and fewer than two correct answers in a row since.
const weak = { quizWrongCount: 1, quizCorrectStreak: 0 };

const items = [
  { id: "k1", kind: "kanji", title: "掃", meaning: "쓸 소" },
  { id: "k2", kind: "kanji", title: "除", meaning: "덜 제", ...weak },
  { id: "k3", kind: "kanji", title: "雨", meaning: "비 우" },
  { id: "k4", kind: "kanji", title: "空", meaning: "" },
  { id: "k5", kind: "kanji", title: "海", meaning: "바다 해", ...weak },
  { id: "k6", kind: "kanji", title: "山", meaning: "메 산" },
  { id: "w1", kind: "word", title: "掃除", reading: "そうじ", meaning: "청소" },
  { id: "w2", kind: "word", title: "ありがとう", reading: "ありがとう", meaning: "고맙다" },
  { id: "w3", kind: "word", title: "雨", reading: "あめ", meaning: "비", ...weak },
  { id: "w4", kind: "word", title: "勉強", reading: "べんきょう", meaning: "" },
  { id: "w5", kind: "word", title: "学校", reading: "がっこう", meaning: "학교" },
  { id: "w6", kind: "word", title: "先生", reading: "せんせい", meaning: "선생님", ...weak },
  { id: "g1", kind: "grammar", title: "〜てしまう", meaning: "완료·후회" },
  { id: "e1", kind: "expression", title: "お疲れ様です", meaning: "수고하셨습니다" }
];

describe("NOTE_QUIZ_KINDS", () => {
  it("lists the kinds with a quiz engine", () => {
    expect(NOTE_QUIZ_KINDS).toEqual(["kanji", "word"]);
  });
});

describe("noteQuizQuestionIds / noteQuizLinkedCount", () => {
  it("returns only registered, quizzable cards of the asked kind", () => {
    const note = { body: "掃除をしてしまう。お疲れ様です。空", links: [], excludedLinks: [] };
    expect(noteQuizQuestionIds(note, items, "kanji")).toEqual(["k1", "k2"]);
    expect(noteQuizQuestionIds(note, items, "word")).toEqual(["w1"]);
    // 空 has no meaning: counted but not askable.
    expect(noteQuizLinkedCount(note, items, "kanji")).toBe(3);
    expect(noteQuizLinkedCount(note, items, "word")).toBe(1);
  });

  it("counts auto, manual and [[wiki]] links alike", () => {
    const note = {
      body: "掃 and [[学校]] and [[없는카드]]",
      links: [{ kind: "word", title: "先生" }, { kind: "word", title: "미등록" }],
      excludedLinks: []
    };
    expect(noteQuizQuestionIds(note, items, "word")).toEqual(["w5", "w6"]);
    expect(noteQuizQuestionIds(note, items, "kanji")).toEqual(["k1"]);
    expect(noteQuizLinkedCount(note, items, "word")).toBe(2);
  });

  it("drops excluded auto links", () => {
    const note = { body: "雨が降る", links: [], excludedLinks: [{ kind: "kanji", title: "雨" }] };
    expect(noteQuizQuestionIds(note, items, "kanji")).toEqual([]);
    expect(noteQuizQuestionIds(note, items, "word")).toEqual([]); // a one-kanji word is never auto-linked
    expect(noteQuizLinkedCount(note, items, "kanji")).toBe(0);
  });

  it("excludes cards without meaning from ids but counts them", () => {
    const note = { body: "[[勉強]] [[学校]]", links: [] };
    expect(noteQuizQuestionIds(note, items, "word")).toEqual(["w5"]);
    expect(noteQuizLinkedCount(note, items, "word")).toBe(2);
  });

  it("does not repeat a card linked several ways", () => {
    const note = { body: "[[雨]] 雨 雨", links: [{ kind: "word", title: "雨" }, { kind: "kanji", title: "雨" }] };
    expect(noteQuizQuestionIds(note, items, "word")).toEqual(["w3"]);
    expect(noteQuizQuestionIds(note, items, "kanji")).toEqual(["k3"]);
    expect(noteQuizLinkedCount(note, items, "kanji")).toBe(1);
  });

  it("returns nothing for unsupported kinds or a missing note", () => {
    const note = { body: "お疲れ様です してしまう", links: [{ kind: "grammar", title: "〜てしまう" }] };
    for (const kind of ["grammar", "expression", "sentence", ""]) {
      expect(noteQuizQuestionIds(note, items, kind)).toEqual([]);
      expect(noteQuizLinkedCount(note, items, kind)).toBe(0);
    }
    expect(noteQuizQuestionIds(null, items, "kanji")).toEqual([]);
    expect(noteQuizLinkedCount(undefined, items, "word")).toBe(0);
    expect(noteQuizQuestionIds({ body: "" }, items, "kanji")).toEqual([]);
  });
});

describe("intersectQuestionIds", () => {
  it("treats null/undefined as unrestricted", () => {
    expect(intersectQuestionIds(null, null)).toBeNull();
    expect(intersectQuestionIds(undefined, undefined)).toBeNull();
    const only = ["a", "b"];
    const copy = intersectQuestionIds(only, null);
    expect(copy).toEqual(["a", "b"]);
    expect(copy).not.toBe(only);
    expect(intersectQuestionIds(undefined, ["c"])).toEqual(["c"]);
  });

  it("keeps the ids in both, in first's order, without repeats", () => {
    expect(intersectQuestionIds(["c", "a", "b", "a"], ["a", "b", "c", "d"])).toEqual(["c", "a", "b"]);
    expect(intersectQuestionIds(["a"], ["b"])).toEqual([]);
    expect(intersectQuestionIds([], ["a"])).toEqual([]);
  });
});

describe("quizAvailability with questionIds", () => {
  it("is unchanged when questionIds is omitted or null", () => {
    for (const onlyWeak of [false, true]) {
      const base = quizAvailability({ items, quizKind: "kanji", onlyWeak });
      expect(quizAvailability({ items, quizKind: "kanji", onlyWeak, questionIds: null })).toEqual(base);
    }
    expect(quizAvailability({ items, quizKind: "kanji" })).toMatchObject({ poolSize: 5, questionCount: 5, canStart: true, reason: "" });
    expect(quizAvailability({ items, quizKind: "kanji", onlyWeak: true })).toMatchObject({ questionCount: 2, canStart: true });
  });

  it("limits questionCount to the scope but keeps pool rules on the whole pool", () => {
    const result = quizAvailability({ items, quizKind: "kanji", questionIds: ["k1", "k3", "zzz"] });
    expect(result).toMatchObject({ poolSize: 5, distinctCount: 5, questionCount: 2, canStart: true, reason: "" });
  });

  it("combines the scope with onlyWeak", () => {
    expect(quizAvailability({ items, quizKind: "kanji", onlyWeak: true, questionIds: ["k1", "k2"] }))
      .toMatchObject({ questionCount: 1, canStart: true });
    expect(quizAvailability({ items, quizKind: "kanji", onlyWeak: true, questionIds: ["k1", "k3"] }))
      .toMatchObject({ questionCount: 0, canStart: false, reason: "weak" });
  });

  it("reports scope when no candidate is in the scope", () => {
    expect(quizAvailability({ items, quizKind: "kanji", questionIds: [] }))
      .toMatchObject({ questionCount: 0, canStart: false, reason: "scope" });
    // k4 is linked but has no meaning, so it is not a candidate.
    expect(quizAvailability({ items, quizKind: "kanji", onlyWeak: true, questionIds: ["k4"] }))
      .toMatchObject({ questionCount: 0, canStart: false, reason: "scope" });
  });

  it("checks the pool size before the scope", () => {
    const small = items.filter(item => ["k1", "k2", "k3"].includes(item.id));
    expect(quizAvailability({ items: small, quizKind: "kanji", questionIds: [] }))
      .toMatchObject({ canStart: false, reason: "count" });
  });

  it("works end to end with a note's ids", () => {
    const note = { body: "掃除 [[雨]]", links: [{ kind: "word", title: "先生" }] };
    const questionIds = noteQuizQuestionIds(note, items, "word");
    expect(questionIds).toEqual(["w1", "w3", "w6"]);
    expect(quizAvailability({ items, quizKind: "word", questionIds })).toMatchObject({ questionCount: 3, canStart: true });
    expect(quizAvailability({ items, quizKind: "word", onlyWeak: true, questionIds })).toMatchObject({ questionCount: 2, canStart: true });
  });
});
