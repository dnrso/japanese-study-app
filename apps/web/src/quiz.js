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
//   getSentenceQuiz, setSentenceQuiz, speak,
//   renderWordQuiz, renderKanjiQuiz, renderSentenceQuiz, renderStats, renderQuickFilters
// }

export function emptyQuiz() {
  return { question: null, answered: false, selectedAnswer: "", result: null };
}

export function emptySentenceQuiz() {
  return { question: null, answered: false, selectedAnswer: "", result: null, insufficientData: false, score: { correct: 0, wrong: 0 } };
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
  ctx.setSentenceQuiz(emptySentenceQuiz());
  byId("quizStatus").textContent = question ? "정답을 선택하세요." : "퀴즈를 만들려면 같은 유형의 항목과 보기 후보가 4개 이상 필요합니다.";
  ctx.renderWordQuiz();
  ctx.renderKanjiQuiz();
  ctx.renderSentenceQuiz();

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
  ctx.setSentenceQuiz(emptySentenceQuiz());
  byId("quizStatus").textContent = "샘플 데이터로 단어/한자 퀴즈를 실행할 수 있습니다.";
  ctx.renderWordQuiz();
  ctx.renderKanjiQuiz();
  ctx.renderSentenceQuiz();
  byId("quiz-select").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Sentence quiz session logic. `mode` is "meaning" (Mode A: show the
// Japanese sentence, choose its Korean meaning) or "listen" (Mode B: play
// the sentence audio, choose the matching Japanese sentence, then reveal
// the sentence + meaning). Sentence entries are daily-entry-shaped, not
// review items, so this never calls store.submitWordQuizAnswer and never
// stamps lastReviewedAt / touches SRS state — it's practice-only, tracked
// with an in-session score instead of the persisted per-item quiz stats
// that word/kanji quizzes use.
export function startSentenceQuiz(mode, ctx) {
  const { byId } = ctx;
  const previous = ctx.getSentenceQuiz();
  const sameMode = previous.question?.mode === mode;
  const entries = ctx.getState().allDailyEntries || ctx.getState().dailyEntries || [];
  const question = core.buildSentenceQuizQuestion({
    entries,
    mode,
    excludeItemId: previous.question?.item?.id || ""
  });

  const nextQuiz = {
    question,
    answered: false,
    selectedAnswer: "",
    result: null,
    insufficientData: !question,
    score: sameMode ? previous.score : { correct: 0, wrong: 0 }
  };
  ctx.setSentenceQuiz(nextQuiz);
  ctx.setWordQuiz(emptyQuiz());
  ctx.setKanjiQuiz(emptyQuiz());

  byId("quizStatus").textContent = question ? "정답을 선택하세요." : "문장 퀴즈를 만들려면 문장이 4개 이상 필요합니다.";
  ctx.renderWordQuiz();
  ctx.renderKanjiQuiz();
  ctx.renderSentenceQuiz();

  if (question) {
    window.setTimeout(() => {
      byId("sentenceQuizPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    if (mode === "listen") {
      ctx.speak(question.item.title);
    }
  }
}

export function submitSentenceQuizChoice(selectedAnswer, ctx) {
  const quiz = ctx.getSentenceQuiz();
  if (!quiz.question || quiz.answered) {
    return;
  }
  const correct = selectedAnswer === quiz.question.correctAnswer;
  const nextQuiz = {
    ...quiz,
    answered: true,
    selectedAnswer,
    result: { correct, correctAnswer: quiz.question.correctAnswer },
    score: {
      correct: quiz.score.correct + (correct ? 1 : 0),
      wrong: quiz.score.wrong + (correct ? 0 : 1)
    }
  };
  ctx.setSentenceQuiz(nextQuiz);
  ctx.renderSentenceQuiz();
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
