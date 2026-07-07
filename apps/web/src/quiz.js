import * as core from "@nihongo-study/core";
import { kindLabels } from "@nihongo-study/ui";

// Quiz session logic. These functions close over mutable quiz state that
// lives in main.js (wordQuiz/kanjiQuiz/etc.), so callers pass a small `ctx`
// object exposing getters/setters instead of module-level bindings. This
// keeps the functions here free of main.js's module scope while preserving
// identical behavior byte-for-byte.
//
// Expected `ctx` shape:
// {
//   byId, state (getter via ctx.getState()), store, selectedDate (getter),
//   wordQuizMode, kanjiQuizMode, quizReviewOnCorrect, quizCorrectReview,
//   getWordQuiz, setWordQuiz, getKanjiQuiz, setKanjiQuiz,
//   renderWordQuiz, renderKanjiQuiz, renderStats, renderQuickFilters
// }

export function emptyQuiz() {
  return { question: null, answered: false, selectedAnswer: "", result: null };
}

export function startQuiz(kind, ctx) {
  const { byId } = ctx;
  if (kind === "grammar" || kind === "expression") {
    byId("quizStatus").textContent = `${kindLabels[kind]} 퀴즈는 다음 단계에서 구현합니다.`;
    return;
  }

  const isKanji = kind === "kanji";
  const question = core.buildQuizQuestion({
    items: ctx.getState().items,
    kind: isKanji ? "kanji" : "word",
    mode: isKanji ? ctx.kanjiQuizMode : ctx.wordQuizMode,
    forwardMode: isKanji ? "kanjiToMeaning" : "jpToMeaning",
    reverseMode: isKanji ? "meaningToKanji" : "meaningToJp"
  });

  const nextQuiz = { question, answered: false, selectedAnswer: "", result: null };
  if (isKanji) {
    ctx.setKanjiQuiz(nextQuiz);
    ctx.setWordQuiz(emptyQuiz());
  } else {
    ctx.setWordQuiz(nextQuiz);
    ctx.setKanjiQuiz(emptyQuiz());
  }
  byId("quizStatus").textContent = question ? "정답을 선택하세요." : "퀴즈를 만들려면 같은 유형의 항목과 보기 후보가 4개 이상 필요합니다.";
  ctx.renderWordQuiz();
  ctx.renderKanjiQuiz();

  if (question) {
    const panelId = isKanji ? "kanjiQuizPanel" : "wordQuizPanel";
    window.setTimeout(() => {
      byId(panelId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }
}

export function exitQuizSession(ctx) {
  const { byId } = ctx;
  ctx.setWordQuiz(emptyQuiz());
  ctx.setKanjiQuiz(emptyQuiz());
  byId("quizStatus").textContent = "샘플 데이터로 단어/한자 퀴즈를 실행할 수 있습니다.";
  ctx.renderWordQuiz();
  ctx.renderKanjiQuiz();
  byId("quiz-select").scrollIntoView({ behavior: "smooth", block: "start" });
}

export async function submitQuizChoice(kind, selectedAnswer, ctx) {
  const quiz = kind === "kanji" ? ctx.getKanjiQuiz() : ctx.getWordQuiz();
  const response = await ctx.store.submitWordQuizAnswer({
    quizKind: kind,
    itemId: quiz.question.item.id,
    selectedAnswer,
    answerType: quiz.question.answerType,
    updateReviewOnCorrect: ctx.quizReviewOnCorrect,
    correctReview: ctx.quizCorrectReview,
    studyDate: ctx.selectedDate
  });
  ctx.setState(response.state);
  const item = response.state.items.find(candidate => candidate.id === quiz.question.item.id);
  const nextQuiz = {
    ...quiz,
    question: { ...quiz.question, item: item || quiz.question.item },
    answered: true,
    selectedAnswer,
    result: response.result
  };
  if (kind === "kanji") {
    ctx.setKanjiQuiz(nextQuiz);
    ctx.renderKanjiQuiz();
  } else {
    ctx.setWordQuiz(nextQuiz);
    ctx.renderWordQuiz();
  }
  ctx.renderStats();
  ctx.renderQuickFilters();
}
