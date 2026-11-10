import * as core from "@nihongo-study/core";

// Quiz session logic. These functions close over mutable quiz state that
// lives in main.js (wordQuiz/kanjiQuiz/etc.), so callers pass a small `ctx`
// object exposing getters/setters instead of module-level bindings. This
// keeps the functions here free of main.js's module scope while preserving
// identical behavior byte-for-byte.
//
// A quiz run is a session (see core's createQuizSession): each quiz state
// object carries `session` ({index,total,correct,missed,seenIds,finished}),
// null when no run is active. When session.finished the result view shows.
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
  return { question: null, answered: false, selectedAnswer: "", result: null, session: null };
}

export function emptySentenceQuiz() {
  return { question: null, answered: false, selectedAnswer: "", result: null, session: null };
}

function allEntries(ctx) {
  const state = ctx.getState();
  return state.allDailyEntries || state.dailyEntries || [];
}

function sentenceModeOf(kind) {
  return kind === "sentence-listen" ? "listen" : "meaning";
}

// Builds one question for `kind` (word | kanji | sentence-meaning |
// sentence-listen), skipping items already asked in the session.
function buildQuestion(kind, ctx, excludeIds) {
  if (kind === "sentence-meaning" || kind === "sentence-listen") {
    return core.buildSentenceQuizQuestion({ entries: allEntries(ctx), mode: sentenceModeOf(kind), excludeIds });
  }
  const isKanji = kind === "kanji";
  return core.buildQuizQuestion({
    items: ctx.getState().items,
    kind: isKanji ? "kanji" : "word",
    mode: isKanji ? ctx.kanjiQuizMode : ctx.wordQuizMode,
    forwardMode: isKanji ? "kanjiToMeaning" : "jpToMeaning",
    reverseMode: isKanji ? "meaningToKanji" : "meaningToJp",
    excludeIds
  });
}

function poolSizeFor(kind, ctx) {
  return core.quizAvailability({
    items: ctx.getState().items,
    entries: allEntries(ctx),
    quizKind: kind,
    mode: kind === "kanji" ? ctx.kanjiQuizMode : ctx.wordQuizMode
  }).poolSize;
}

function panelIdFor(kind) {
  return kind === "kanji" ? "kanjiQuizPanel" : kind === "word" ? "wordQuizPanel" : "sentenceQuizPanel";
}

// Slot for the quiz state of a given panel family (word | kanji | sentence).
function slot(family, ctx) {
  if (family === "kanji") {
    return { get: ctx.getKanjiQuiz, set: ctx.setKanjiQuiz };
  }
  if (family === "word") {
    return { get: ctx.getWordQuiz, set: ctx.setWordQuiz };
  }
  return { get: ctx.getSentenceQuiz, set: ctx.setSentenceQuiz };
}

function familyOf(kind) {
  return kind === "word" || kind === "kanji" ? kind : "sentence";
}

function renderAllQuizzes(ctx) {
  ctx.renderWordQuiz();
  ctx.renderKanjiQuiz();
  ctx.renderSentenceQuiz();
}

// Starts a new session of up to QUIZ_SESSION_SIZE questions.
export function startQuiz(kind, ctx) {
  const { byId } = ctx;
  const family = familyOf(kind);
  const question = buildQuestion(kind, ctx, []);
  ctx.setWordQuiz(emptyQuiz());
  ctx.setKanjiQuiz(emptyQuiz());
  ctx.setSentenceQuiz(emptySentenceQuiz());
  if (!question) {
    renderAllQuizzes(ctx);
    return;
  }
  const session = core.createQuizSession(poolSizeFor(kind, ctx));
  slot(family, ctx).set({
    ...(family === "sentence" ? emptySentenceQuiz() : emptyQuiz()),
    question,
    session
  });
  renderAllQuizzes(ctx);
  window.setTimeout(() => {
    byId(panelIdFor(kind))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
  if (question.mode === "listen") {
    ctx.speak(question.item.title);
  }
}

export function exitQuizSession(ctx) {
  ctx.setWordQuiz(emptyQuiz());
  ctx.setKanjiQuiz(emptyQuiz());
  ctx.setSentenceQuiz(emptySentenceQuiz());
  renderAllQuizzes(ctx);
  ctx.byId("quiz-select").scrollIntoView({ behavior: "smooth", block: "start" });
}

// "다음 문제" / "결과 보기": advance the session of `family` after an answer.
export function nextQuizQuestion(family, ctx) {
  const { get, set } = slot(family, ctx);
  const quiz = get();
  if (!quiz.session || !quiz.answered || quiz.session.finished) {
    return;
  }
  const session = core.advanceQuizSession(quiz.session);
  if (session.finished) {
    set({ ...quiz, session });
  } else {
    const mode = quiz.question.mode;
    const kind = family === "sentence" ? (mode === "listen" ? "sentence-listen" : "sentence-meaning") : family;
    const question = buildQuestion(kind, ctx, session.seenIds);
    if (!question) {
      set({ ...quiz, session: { ...session, finished: true } });
    } else {
      set({ ...quiz, question, answered: false, selectedAnswer: "", result: null, session });
      if (question.mode === "listen") {
        ctx.speak(question.item.title);
      }
    }
  }
  renderAllQuizzes(ctx);
}

// Sentence quizzes are practice-only: sentence entries are daily-entry-shaped,
// not review items, so this never calls store.submitWordQuizAnswer and never
// touches lastReviewedAt / SRS state. Only the in-session tally is kept.
export function submitSentenceQuizChoice(selectedAnswer, ctx) {
  const quiz = ctx.getSentenceQuiz();
  if (!quiz.question || quiz.answered) {
    return;
  }
  const correct = selectedAnswer === quiz.question.correctAnswer;
  ctx.setSentenceQuiz({
    ...quiz,
    answered: true,
    selectedAnswer,
    result: { correct, correctAnswer: quiz.question.correctAnswer },
    session: core.recordQuizAnswer(quiz.session, quiz.question, correct, selectedAnswer)
  });
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
  const current = kind === "kanji" ? ctx.getKanjiQuiz() : ctx.getWordQuiz();
  if (current.question !== quiz.question) {
    // The run was exited/restarted while the answer was being saved.
    return;
  }
  const item = response.state.items.find(candidate => candidate.id === quiz.question.item.id);
  const nextQuiz = {
    ...quiz,
    question: { ...quiz.question, item: item || quiz.question.item },
    answered: true,
    selectedAnswer,
    result: response.result,
    session: core.recordQuizAnswer(quiz.session, { ...quiz.question, item: item || quiz.question.item }, Boolean(response.result?.correct), selectedAnswer)
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
