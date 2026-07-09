import { describe, it, expect } from "vitest";
import { buildSentenceQuizQuestion } from "@nihongo-study/core";

function sentenceEntry(id, title, meaning) {
  return { id, kind: "sentence", title, meaning, studyDate: "2026-07-09" };
}

const entries = [
  sentenceEntry("s1", "私なんか気に障ることしたかな", "나 따위가 기분 상할 만한 일을 한 걸까"),
  sentenceEntry("s2", "今日は天気がいいですね", "오늘은 날씨가 좋네요"),
  sentenceEntry("s3", "もう少し待ってください", "조금만 더 기다려 주세요"),
  sentenceEntry("s4", "本当にありがとうございます", "정말 감사합니다")
];

describe("buildSentenceQuizQuestion", () => {
  it("returns null when fewer than 4 sentence candidates exist", () => {
    expect(buildSentenceQuizQuestion({ entries: entries.slice(0, 3), mode: "meaning" })).toBeNull();
  });

  it("ignores non-sentence entries and entries missing a meaning", () => {
    const mixed = [
      ...entries,
      { id: "w1", kind: "word", title: "気に障る", meaning: "기분에 거슬리다" },
      { id: "s5", kind: "sentence", title: "meaning 없음", meaning: "" }
    ];
    const question = buildSentenceQuizQuestion({ entries: mixed, mode: "meaning", random: () => 0 });
    expect(question).not.toBeNull();
    expect(question.item.kind).toBe("sentence");
  });

  it("builds a meaning-mode question with the Korean meaning as the answer", () => {
    const question = buildSentenceQuizQuestion({ entries, mode: "meaning", random: () => 0 });
    expect(question.answerType).toBe("meaning");
    expect(question.correctAnswer).toBe(question.item.meaning);
    expect(question.choices).toHaveLength(4);
    expect(question.choices).toContain(question.correctAnswer);
    expect(new Set(question.choices).size).toBe(4);
  });

  it("builds a listen-mode question with the Japanese sentence as the answer", () => {
    const question = buildSentenceQuizQuestion({ entries, mode: "listen", random: () => 0 });
    expect(question.answerType).toBe("title");
    expect(question.correctAnswer).toBe(question.item.title);
    expect(question.choices).toContain(question.correctAnswer);
  });

  it("excludes the previous question's item when possible, to avoid immediate repeats", () => {
    const question = buildSentenceQuizQuestion({ entries, mode: "meaning", random: () => 0, excludeItemId: "s1" });
    expect(question.item.id).not.toBe("s1");
  });
});
