import { describe, expect, it } from "vitest";
import { renderSentenceQuizPage } from "@nihongo-study/ui";
import { createQuizSession, quizReviewOutcome, recordQuizAnswer, recordQuizReviewChange } from "@nihongo-study/core";

const today = "2026-11-12";
const item = (review, extra = {}) => ({ id: "i", kind: "word", title: "犬", review, ...extra });
const outcome = (it, correct) => quizReviewOutcome(it, correct, { today });

describe("quizReviewOutcome", () => {
  it("resets a wrong answer to 오늘 whatever the item had", () => {
    for (const review of ["대기", "내일", "3일 후", "일주일", "2주일", "한달"]) {
      expect(outcome(item(review, { reviewDueDate: "2026-12-01" }), false)).toEqual({ action: "reset", review: "오늘" });
    }
    expect(outcome(item(""), false)).toEqual({ action: "reset", review: "오늘" });
  });

  it("leaves an item already on 오늘 alone when wrong", () => {
    expect(outcome(item("오늘"), false).action).toBe("none");
  });

  it("advances a correct answer on a due item to 내일", () => {
    expect(outcome(item("오늘"), true)).toEqual({ action: "advance", review: "내일" });
    expect(outcome(item("대기"), true)).toEqual({ action: "advance", review: "내일" });
  });

  it("advances an item without a review field like 대기", () => {
    expect(outcome({ id: "i", kind: "kanji", title: "犬" }, true)).toEqual({ action: "advance", review: "내일" });
    expect(outcome({ id: "i", kind: "kanji", title: "犬" }, false)).toEqual({ action: "reset", review: "오늘" });
  });

  it("climbs one step per correct answer for a scheduled item whose due date passed", () => {
    const ladder = ["내일", "3일 후", "일주일", "2주일", "한달"];
    ladder.forEach((review, index) => {
      expect(outcome(item(review, { reviewDueDate: today }), true)).toEqual({
        action: "advance",
        review: ladder[Math.min(index + 1, ladder.length - 1)]
      });
    });
  });

  it("keeps the top of the ladder at the top", () => {
    expect(outcome(item("한달", { reviewDueDate: "2026-11-01" }), true)).toEqual({ action: "advance", review: "한달" });
  });

  it("does nothing for a correct answer on an item scheduled in the future", () => {
    expect(outcome(item("3일 후", { reviewDueDate: "2026-11-15" }), true).action).toBe("none");
    expect(outcome(item("한달", { reviewDueDate: "2026-12-12" }), true).action).toBe("none");
  });

  it("ignores items that are not reviewable", () => {
    expect(outcome(item("대기", { kind: "source" }), true).action).toBe("none");
    expect(outcome(item("내일", { kind: "source" }), false).action).toBe("none");
    expect(outcome(null, false).action).toBe("none");
  });
});

describe("recordQuizReviewChange", () => {
  it("starts empty and tallies resets and advances without touching the answer tally", () => {
    let session = createQuizSession(5);
    expect(session.reviewChanges).toEqual({ reset: 0, advanced: 0 });
    session = recordQuizReviewChange(recordQuizAnswer(session, { item: { id: "a" }, answerType: "meaning", correctAnswer: "x" }, false), "reset");
    session = recordQuizReviewChange(session, "advance");
    session = recordQuizReviewChange(session, "advance");
    session = recordQuizReviewChange(session, "none");
    expect(session.reviewChanges).toEqual({ reset: 1, advanced: 2 });
    expect(session.missed).toHaveLength(1);
  });
});

describe("quiz result review line", () => {
  const render = (reviewChanges, showReviewChanges) => renderSentenceQuizPage({
    quiz: { question: { mode: "meaning" }, session: { finished: true, total: 5, correct: 2, missed: [], reviewChanges } },
    showReviewChanges,
    helpers: { escapeHtml: value => String(value), highlight: value => value }
  }).html.sentenceQuizPanel;

  it("shows only the non-zero parts, and nothing when off or unchanged", () => {
    expect(render({ reset: 3, advanced: 2 }, true)).toContain("복습 일정 반영 · 오늘로 3개 · 다음 간격으로 2개");
    expect(render({ reset: 0, advanced: 2 }, true)).toContain("복습 일정 반영 · 다음 간격으로 2개");
    expect(render({ reset: 0, advanced: 0 }, true)).not.toContain("복습 일정 반영");
    expect(render({ reset: 3, advanced: 2 }, false)).not.toContain("복습 일정 반영");
  });
});
