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
//   wordQuizMode, kanjiQuizMode, quizReflectInReview, quizWeakOnly (session-only
//   "약한 항목만 풀기"), today (YYYY-MM-DD),
//   getWordQuiz, setWordQuiz, getKanjiQuiz, setKanjiQuiz,
//   getSentenceQuiz, setSentenceQuiz, speak,
//   renderWordQuiz, renderKanjiQuiz, renderSentenceQuiz, renderAll
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
// `questionIds` (null = whole pool) limits what may be asked; choices always
// come from the full pool.
function buildQuestion(kind, ctx, excludeIds, questionIds = null) {
  if (kind === "sentence-meaning" || kind === "sentence-listen") {
    return core.buildSentenceQuizQuestion({ entries: allEntries(ctx), mode: sentenceModeOf(kind), excludeIds, questionIds });
  }
  const isKanji = kind === "kanji";
  return core.buildQuizQuestion({
    items: ctx.getState().items,
    kind: isKanji ? "kanji" : "word",
    mode: isKanji ? ctx.kanjiQuizMode : ctx.wordQuizMode,
    forwardMode: isKanji ? "kanjiToMeaning" : "jpToMeaning",
    reverseMode: isKanji ? "meaningToKanji" : "meaningToJp",
    excludeIds,
    questionIds
  });
}

// Weak-only: the ids askable in this run, computed once at session start from
// the CURRENT items (so a replay recomputes the pool) and kept on the quiz
// state; null when the run draws from the whole pool.
function questionIdsFor(kind, ctx) {
  if (!ctx.quizWeakOnly) {
    return null;
  }
  return core.weakQuizQuestionIds({ items: ctx.getState().items, entries: allEntries(ctx), quizKind: kind });
}

// Session length source: whole pool, or just the weak items in weak-only mode.
function sessionPoolSizeFor(kind, ctx) {
  return core.quizAvailability({
    items: ctx.getState().items,
    entries: allEntries(ctx),
    quizKind: kind,
    mode: kind === "kanji" ? ctx.kanjiQuizMode : ctx.wordQuizMode,
    onlyWeak: Boolean(ctx.quizWeakOnly)
  }).questionCount;
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
  const questionIds = questionIdsFor(kind, ctx);
  const question = buildQuestion(kind, ctx, [], questionIds);
  ctx.setWordQuiz(emptyQuiz());
  ctx.setKanjiQuiz(emptyQuiz());
  ctx.setSentenceQuiz(emptySentenceQuiz());
  if (!question) {
    renderAllQuizzes(ctx);
    return;
  }
  const session = core.createQuizSession(sessionPoolSizeFor(kind, ctx));
  slot(family, ctx).set({
    ...(family === "sentence" ? emptySentenceQuiz() : emptyQuiz()),
    question,
    session,
    questionIds
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
    const question = buildQuestion(kind, ctx, session.seenIds, quiz.questionIds || null);
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

// Applies one answer to the item's review schedule (core.quizReviewOutcome)
// through the same store calls the review queue uses: "advance" is the interval
// button's completeReview, "reset" is updateItemReview("오늘"), which leaves
// lastReviewedAt alone so a miss never counts as 오늘 복습 완료. Returns the
// action taken ("none" when disabled, unregistered or unchanged) and refreshes
// ctx state; the caller re-renders.
async function applyQuizReview(item, correct, ctx) {
  if (!ctx.quizReflectInReview || !item) {
    return "none";
  }
  const { action, review } = core.quizReviewOutcome(item, correct, { today: ctx.today });
  if (action === "advance") {
    ctx.setState(await ctx.store.completeReview([{ id: item.id, review }], ctx.selectedDate));
  } else if (action === "reset") {
    ctx.setState(await ctx.store.updateItemReview(item.id, review, ctx.selectedDate));
  }
  return action;
}

// A sentence quiz question is a daily entry; its review item is the registered
// sentence item with the same title (registration keys items by kind + title).
// Unregistered sentences have no item, so nothing is applied.
function sentenceReviewItem(entry, ctx) {
  return ctx.getState().items.find(item => item.kind === "sentence" && item.title === entry.title) || null;
}

// One answer at a time: the review write is awaited, so a second click on a
// choice must not run the same answer twice.
let answerInFlight = false;

// A sentence answer is recorded on the registered sentence item (when there is
// one) via store.recordQuizItemStat, then feeds its review schedule. The two
// writes are awaited one after the other, never concurrently.
export async function submitSentenceQuizChoice(selectedAnswer, ctx) {
  const quiz = ctx.getSentenceQuiz();
  if (!quiz.question || quiz.answered || answerInFlight) {
    return;
  }
  answerInFlight = true;
  try {
    const correct = selectedAnswer === quiz.question.correctAnswer;
    const reviewItem = sentenceReviewItem(quiz.question.item, ctx);
    if (reviewItem) {
      ctx.setState(await ctx.store.recordQuizItemStat({ itemId: reviewItem.id, correct, studyDate: ctx.selectedDate }));
    }
    const action = await applyQuizReview(reviewItem, correct, ctx);
    if (ctx.getSentenceQuiz().question !== quiz.question) {
      return;
    }
    ctx.setSentenceQuiz({
      ...quiz,
      answered: true,
      selectedAnswer,
      result: { correct, correctAnswer: quiz.question.correctAnswer },
      session: core.recordQuizReviewChange(core.recordQuizAnswer(quiz.session, quiz.question, correct, selectedAnswer), action)
    });
    ctx.renderAll();
  } finally {
    answerInFlight = false;
  }
}

export async function submitQuizChoice(kind, selectedAnswer, ctx) {
  const quiz = kind === "kanji" ? ctx.getKanjiQuiz() : ctx.getWordQuiz();
  if (answerInFlight) {
    return;
  }
  answerInFlight = true;
  try {
    const response = await ctx.store.submitWordQuizAnswer({
      quizKind: kind,
      itemId: quiz.question.item.id,
      selectedAnswer,
      answerType: quiz.question.answerType,
      studyDate: ctx.selectedDate
    });
    ctx.setState(response.state);
    const correct = Boolean(response.result?.correct);
    const savedItem = response.state.items.find(candidate => candidate.id === quiz.question.item.id);
    const action = await applyQuizReview(response.result?.missing ? null : savedItem, correct, ctx);
    const current = kind === "kanji" ? ctx.getKanjiQuiz() : ctx.getWordQuiz();
    if (current.question !== quiz.question) {
      // The run was exited/restarted while the answer was being saved.
      ctx.renderAll();
      return;
    }
    const item = ctx.getState().items.find(candidate => candidate.id === quiz.question.item.id);
    const question = { ...quiz.question, item: item || quiz.question.item };
    const nextQuiz = {
      ...quiz,
      question,
      answered: true,
      selectedAnswer,
      result: response.result,
      session: core.recordQuizReviewChange(core.recordQuizAnswer(quiz.session, question, correct, selectedAnswer), action)
    };
    if (kind === "kanji") {
      ctx.setKanjiQuiz(nextQuiz);
    } else {
      ctx.setWordQuiz(nextQuiz);
    }
    // Full refresh: the review queue, home counts and result cards show the new
    // review values. The quiz panels render from the quiz state set above, so
    // the answer feedback and 다음 문제 button survive it.
    ctx.renderAll();
  } finally {
    answerInFlight = false;
  }
}
