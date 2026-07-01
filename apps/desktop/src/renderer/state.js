const {
  byId,
  escapeHtml,
  toDateKey,
  localTodayKey
} = window.NihonGoUtils;

let tocByPage = {};
let kindLabels = {};
let badgeClassByKind = {};
let reviewOptions = [];
let scheduledReviewOptions = [];
let partOptions = [];
let scriptOptions = [];
let manualEntryPlaceholders = {};
let core = null;

let state = {
  studyLog: { minutes: 0, summary: "", note: "", totalMinutes: 0 },
  tasks: [],
  items: []
};
let currentPage = "home";
let searchTerm = "";
let wordSort = { key: "", direction: "" };
let wordQuizMode = "random";
let wordQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
let kanjiQuizMode = "random";
let kanjiQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
let quizQuestionFontSize = 32;
let quizReviewOnCorrect = true;
let quizCorrectReview = "내일";
let reviewQueueDrafts = new Map();
let storagePaths = null;
let selectedDate = localTodayKey();
let calendarMonth = selectedDate.slice(0, 7);
let reviewQueueOptions = ["대기"];

function initStateConfig(config = window.NihonGoConfig) {
  const resolvedConfig = config || {};
  tocByPage = resolvedConfig.tocByPage || {};
  kindLabels = resolvedConfig.kindLabels || {};
  badgeClassByKind = resolvedConfig.badgeClassByKind || {};
  reviewOptions = resolvedConfig.reviewOptions || [];
  scheduledReviewOptions = resolvedConfig.scheduledReviewOptions || [];
  partOptions = resolvedConfig.partOptions || [];
  scriptOptions = resolvedConfig.scriptOptions || [];
  manualEntryPlaceholders = resolvedConfig.manualEntryPlaceholders || {};
  reviewQueueOptions = ["대기", ...scheduledReviewOptions];
  quizQuestionFontSize = loadQuizQuestionFontSize();
  quizReviewOnCorrect = loadQuizReviewOnCorrect();
  quizCorrectReview = loadQuizCorrectReview();
}

async function initCore() {
  core = await import("../../../../packages/core/src/index.js");
}

function applyState(nextState) {
  state = nextState;
  pruneReviewQueueDrafts();
  selectedDate = nextState.selectedDate || selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  renderAll();
}

function pruneReviewQueueDrafts() {
  reviewQueueDrafts = core.pruneReviewQueueDrafts({ items: state.items, drafts: reviewQueueDrafts });
}

function loadQuizQuestionFontSize() {
  const stored = Number(localStorage.getItem("quizQuestionFontSize"));
  return Number.isFinite(stored) ? clampQuizQuestionFontSize(stored) : 32;
}

function clampQuizQuestionFontSize(value) {
  return core ? core.clampQuizQuestionFontSize(value) : Math.min(64, Math.max(24, Number(value) || 32));
}

function setQuizQuestionFontSize(value) {
  quizQuestionFontSize = clampQuizQuestionFontSize(value);
  localStorage.setItem("quizQuestionFontSize", String(quizQuestionFontSize));
  applyQuizQuestionFontSize();
}

function applyQuizQuestionFontSize() {
  document.documentElement.style.setProperty("--quiz-question-font-size", `${quizQuestionFontSize}px`);
}

function loadQuizReviewOnCorrect() {
  const stored = localStorage.getItem("quizReviewOnCorrect");
  return stored === null ? true : stored === "true";
}

function setQuizReviewOnCorrect(value) {
  quizReviewOnCorrect = Boolean(value);
  localStorage.setItem("quizReviewOnCorrect", String(quizReviewOnCorrect));
  renderQuizSettings();
}

function loadQuizCorrectReview() {
  const stored = localStorage.getItem("quizCorrectReview");
  return core
    ? core.resolveQuizCorrectReview(stored, scheduledReviewOptions)
    : stored === "" ? "" : scheduledReviewOptions.includes(stored) ? stored : "내일";
}

function setQuizCorrectReview(value) {
  quizCorrectReview = core.normalizeQuizCorrectReview(value, scheduledReviewOptions);
  localStorage.setItem("quizCorrectReview", quizCorrectReview);
}

function reviewStatusText(item) {
  return core.reviewStatusText(item);
}

function reviewQueueReview(item) {
  return core.reviewQueueReview(item, reviewQueueDrafts);
}

function reviewQueueStatusText(item) {
  return core.reviewQueueStatusText({ item, drafts: reviewQueueDrafts, todayKey: localTodayKey() });
}

function cycleReviewQueueDraft(id) {
  reviewQueueDrafts = core.cycleReviewQueueDraft({
    items: state.items,
    drafts: reviewQueueDrafts,
    id,
    options: reviewQueueOptions
  });
  renderReview();
}

function reviewCompletionTargets() {
  return core.reviewCompletionTargets({
    items: state.items,
    drafts: reviewQueueDrafts,
    searchTerm
  });
}

function clearReviewQueueDrafts() {
  reviewQueueDrafts.clear();
}

function reviewQueueDueDate(review) {
  return core.reviewQueueDueDate(review, localTodayKey());
}

function highlight(value) {
  const safe = escapeHtml(value);
  if (!searchTerm) {
    return safe;
  }
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(escapedTerm, "gi"), match => `<mark>${match}</mark>`);
}

function matchesSearch(item) {
  return core.matchesSearch(item, searchTerm);
}

function items(kind) {
  return core.itemsByKind(state.items, kind, searchTerm);
}

function sortedWords(list) {
  return core.sortWords(list, wordSort);
}

function startWordQuiz() {
  const question = buildWordQuizQuestion();
  wordQuiz = { question, answered: false, selectedAnswer: "", result: null };
  kanjiQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
  byId("quizStatus").textContent = question
    ? (question.answerType === "title" ? "뜻에 맞는 일본어 단어를 고르세요." : "일본어 단어의 뜻을 고르세요.")
    : "단어 퀴즈를 시작하려면 뜻이 있는 단어가 4개 이상 필요합니다.";
  renderWordQuiz();
  renderKanjiQuiz();
}

function buildWordQuizQuestion() {
  return buildQuizQuestion({
    kind: "word",
    mode: wordQuizMode,
    forwardMode: "jpToMeaning",
    reverseMode: "meaningToJp"
  });
}

function startKanjiQuiz() {
  const question = buildKanjiQuizQuestion();
  wordQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
  kanjiQuiz = { question, answered: false, selectedAnswer: "", result: null };
  byId("quizStatus").textContent = question
    ? (question.answerType === "title" ? "뜻에 맞는 한자를 고르세요." : "한자의 뜻을 고르세요.")
    : "한자 퀴즈를 시작하려면 뜻이 있는 한자가 4개 이상 필요합니다.";
  renderKanjiQuiz();
  renderWordQuiz();
}

function buildKanjiQuizQuestion() {
  return buildQuizQuestion({
    kind: "kanji",
    mode: kanjiQuizMode,
    forwardMode: "kanjiToMeaning",
    reverseMode: "meaningToKanji"
  });
}

function buildQuizQuestion({ kind, mode, forwardMode, reverseMode }) {
  return core.buildQuizQuestion({
    items: state.items,
    kind,
    mode,
    forwardMode,
    reverseMode
  });
}

function reviewItems() {
  return core.reviewItems(state.items, searchTerm);
}
