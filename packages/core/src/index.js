// Single definition of the SRS intervals lives in packages/storage-core, which
// the storage adapter also reads, so the review queue's due-date arithmetic
// can never drift from the intervals the adapter actually persists.
import { addDays, dateKey, weakItems, reviewIntervals as REVIEW_QUEUE_INTERVALS } from "@nihongo-study/storage-core";

export * from "./merge.js";
// Weak-item stats (recordQuizStat / isWeakItem / weakItems) live in storage-core
// so the storage adapter can write them; re-exported here for the app and tests.
export { WEAK_ITEM_CORRECT_STREAK, recordQuizStat, isWeakItem, weakItems } from "@nihongo-study/storage-core";

// Display-only copy of the AI 문장 분석 usage limits, for the client to show
// alongside the AI checkbox (see apps/web/src/main.js). The limits are
// actually ENFORCED server-side and are NOT read from here at runtime -
// keep these three numbers in sync by hand with:
//   - supabase/functions/analyze-sentence/index.ts's RATE_LIMIT_PER_MINUTE_MS
//     (60_000ms = 1/min) and DAILY_LIMIT (100)
//   - supabase/functions/_shared/ai.js's
//     maxSentenceLength (300)
// The edge function can't import from this workspace package at runtime
// (it's a separately-deployed Deno function), so a cross-reference comment
// here and at each of those constants is the honest sync mechanism.
export const AI_ANALYSIS_LIMITS = {
  perMinute: 1,
  perDay: 100,
  maxChars: 300
};

const SEARCH_FIELDS = ["title", "reading", "meaning", "kanji", "note"];

export function clampQuizQuestionFontSize(value) {
  return Math.min(64, Math.max(24, Number(value) || 32));
}

// Minimal structural contract for an AI-generated (or manually written)
// sentence analysis block, mirrored from packages/storage-core's
// parseDailyEntry and supabase/functions/_shared/ai.js's
// hasValidSentenceBlockStructure: the raw text must open with a "# "
// heading line and contain at least a 읽기 line and a 해석 line. Used to
// reject conversational AI replies (no structured block) before they are
// ever saved as a sentence card, and (via diagnoseSentenceBlockStructure)
// to tell a user manually typing a block which part they're missing.
//
// diagnoseSentenceBlockStructure is the source of truth for both checks -
// hasValidSentenceBlockStructure is implemented in terms of it so the two
// can't drift apart.
export function diagnoseSentenceBlockStructure(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const missing = [];
  if (!lines.length || !lines[0].startsWith("# ")) {
    missing.push("원문(#으로 시작)");
  }
  if (!lines.some(line => line.startsWith("읽기"))) {
    missing.push("읽기");
  }
  if (!lines.some(line => line.startsWith("해석"))) {
    missing.push("해석");
  }
  return { valid: missing.length === 0, missing };
}

export function hasValidSentenceBlockStructure(rawText) {
  return diagnoseSentenceBlockStructure(rawText).valid;
}

// Lenient pre-check used only to decide whether the manual 문장 추가 flow
// should bother validating at all: parseDailyEntry (packages/storage-core)
// happily accepts plain single-line/free text with no "#"/읽기/해석 markers
// at all - it just becomes a sentence card titled with that text and empty
// reading/meaning. That's a legitimate, long-standing quick-entry style and
// must not be rejected. Only text that actually looks like an attempted
// structured block (a "#" heading line, or a 읽기/해석 line) is worth
// diagnosing/blocking on save.
export function looksLikeSentenceBlockAttempt(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return lines.some(line => line.startsWith("#") || line.startsWith("읽기") || line.startsWith("해석"));
}

// 퀴즈 설정(문제 글자 크기, 퀴즈 결과의 복습 일정 반영 여부)을 localStorage에서
// 읽은 원시 값(JSON 문자열 또는 이미 파싱된 객체)으로부터 검증해 복원한다.
// 알 수 없거나 깨진 값은 필드별로 기본값(32px, 켬)으로 돌아간다.
export const DEFAULT_QUIZ_SETTINGS = Object.freeze({
  questionFontSize: 32,
  reflectInReview: true
});

export function resolveQuizSettings(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_QUIZ_SETTINGS };
  }
  const fontSize = Number(parsed.questionFontSize);
  return {
    questionFontSize: Number.isFinite(fontSize) && fontSize > 0
      ? clampQuizQuestionFontSize(fontSize)
      : DEFAULT_QUIZ_SETTINGS.questionFontSize,
    reflectInReview: typeof parsed.reflectInReview === "boolean"
      ? parsed.reflectInReview
      : DEFAULT_QUIZ_SETTINGS.reflectInReview
  };
}

// What a quiz answer does to the item's review schedule (pure).
//  - wrong: back to "오늘" (due now), whatever the item had.
//  - correct on an item that is due (review 오늘/대기, or a scheduled interval
//    whose due date has passed): one step up the interval ladder
//    (REVIEW_QUEUE_INTERVALS order); the top stays at the top.
//  - correct on an item scheduled in the future: nothing, so replaying a quiz
//    cannot inflate intervals.
// `advance` is meant to be saved like a review-queue interval button
// (store.completeReview); `reset` with store.updateItemReview, which does not
// touch lastReviewedAt, so a miss never counts as "오늘 복습 완료".
export function quizReviewOutcome(item, correct, { today = dateKey(new Date()) } = {}) {
  const none = { action: "none", review: item?.review || "" };
  if (!item || !REVIEW_KIND_ORDER.includes(item.kind)) {
    return none;
  }
  const review = item.review || "대기";
  if (!correct) {
    return review === "오늘" ? none : { action: "reset", review: "오늘" };
  }
  const ladder = Object.keys(REVIEW_QUEUE_INTERVALS);
  const step = ladder.indexOf(review);
  const due = isReviewDue(item) || (step >= 0 && Boolean(item.reviewDueDate) && item.reviewDueDate <= today);
  if (!due) {
    return none;
  }
  return { action: "advance", review: ladder[Math.min(step + 1, ladder.length - 1)] };
}

export function reviewStatusText(item) {
  const review = item.review || "대기";
  if (item.reviewDueDate && !["오늘", "대기"].includes(review)) {
    return `${review} (${item.reviewDueDate})`;
  }
  return review;
}

// Due date a review interval resolves to when saved today (storage schedules
// from the real today, not the browsed study date).
export function reviewQueueDueDate(review, todayKey = dateKey(new Date())) {
  const days = REVIEW_QUEUE_INTERVALS[review];
  if (!days) {
    return "";
  }
  return addDays(todayKey, days);
}

// Fixed display order of the 복습 큐 kinds (tabs and the 전체 view's groups).
export const REVIEW_KIND_ORDER = ["word", "grammar", "expression", "kanji", "sentence"];

// Queue rows (already narrowed by the global search) grouped by kind in
// REVIEW_KIND_ORDER; kinds without rows are omitted.
export function groupReviewItemsByKind(items = []) {
  return REVIEW_KIND_ORDER
    .map(kind => ({ kind, items: items.filter(item => item.kind === kind) }))
    .filter(group => group.items.length);
}

// Per-kind row counts of the search-narrowed queue plus the `all` total, for
// the kind tabs. Not narrowed by the kind filter itself.
export function reviewKindCounts(items = [], searchTerm = "") {
  const queue = reviewItems(items, searchTerm);
  const counts = { all: queue.length };
  REVIEW_KIND_FILTER_OPTIONS.forEach(kind => {
    counts[kind] = queue.filter(item => item.kind === kind).length;
  });
  return counts;
}

// done = items whose lastReviewedAt is today (the home tab's "오늘 복습 완료"
// source, reviewedTodayCount); remaining = the whole search-narrowed queue.
// Every queue kind counts as done - including 문장, which the home stat leaves
// out - so completing a row always moves both numbers.
export function reviewQueueProgress(items = [], searchTerm = "", todayDate = dateKey(new Date())) {
  const done = REVIEW_KIND_FILTER_OPTIONS.reduce((total, kind) => total + reviewedTodayCount(items, kind, todayDate), 0);
  const remaining = reviewItems(items, searchTerm).length;
  return { done, remaining, percent: done + remaining ? Math.round((done / (done + remaining)) * 100) : 0 };
}

// What a review completion overwrites on an item - the data
// store.restoreItemReview puts back to undo it.
export function reviewSnapshot(item = {}) {
  return {
    review: item.review || "대기",
    reviewDueDate: item.reviewDueDate || "",
    lastReviewedAt: item.lastReviewedAt || ""
  };
}

// NFKC + lowercase + katakana -> hiragana, so "アメ" finds "あめ". Kana and
// ASCII keep their UTF-16 length, which lets highlight ranges map back onto
// the original text (searchHighlightRanges bails out when the length differs).
export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function searchTerms(searchTerm = "") {
  return normalizeSearchText(searchTerm).split(/[\s\u3000]+/).filter(Boolean);
}

// AND semantics: every whitespace-separated term must appear in the text.
export function matchesSearchText(text, searchTerm = "") {
  const terms = searchTerms(searchTerm);
  if (!terms.length) {
    return true;
  }
  const haystack = normalizeSearchText(text);
  return terms.every(term => haystack.includes(term));
}

export function matchesSearch(item, searchTerm = "") {
  // 문장의 note는 입력 원문 전체(품사·문자 줄 포함)라 검색 대상에서 뺀다.
  const fields = item.kind === "sentence" ? SEARCH_FIELDS.filter(field => field !== "note") : SEARCH_FIELDS;
  return matchesSearchText(fields.map(field => item[field] || "").join(" "), searchTerm);
}

// Merged, sorted [start, end) ranges of `text` covered by any search term.
// Returns [] when normalization changed the text length (ranges would not map).
export function searchHighlightRanges(text, searchTerm = "") {
  const source = String(text ?? "");
  const terms = searchTerms(searchTerm);
  if (!terms.length || !source) {
    return [];
  }
  const haystack = normalizeSearchText(source);
  if (haystack.length !== source.length) {
    return [];
  }
  const ranges = [];
  terms.forEach(term => {
    let index = haystack.indexOf(term);
    while (index !== -1) {
      ranges.push([index, index + term.length]);
      index = haystack.indexOf(term, index + term.length);
    }
  });
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  ranges.forEach(range => {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([...range]);
    }
  });
  return merged;
}

export function itemsByKind(items = [], kind, searchTerm = "") {
  return items.filter(item => item.kind === kind && matchesSearch(item, searchTerm));
}

export function sortWords(list = [], wordSort = { key: "", direction: "" }) {
  if (!wordSort.key || !wordSort.direction) {
    return list;
  }

  const direction = wordSort.direction === "desc" ? -1 : 1;
  return [...list].sort((left, right) => {
    const result = String(wordSortValue(left, wordSort.key))
      .localeCompare(String(wordSortValue(right, wordSort.key)), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    if (result !== 0) {
      return result * direction;
    }
    return String(left.title || "").localeCompare(String(right.title || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

export function nextWordSort(currentSort = { key: "", direction: "" }, key) {
  if (currentSort.key !== key) {
    return { key, direction: "asc" };
  }
  if (currentSort.direction === "asc") {
    return { key, direction: "desc" };
  }
  return { key: "", direction: "" };
}

// Eligibility rule shared by the question builders and the quiz-selection
// screen's availability display.
export const QUIZ_MIN_CANDIDATES = 4;
export const QUIZ_SESSION_SIZE = 10;

export function quizCandidates(items = [], kind) {
  return items.filter(item => item.kind === kind && item.title && item.meaning);
}

export function sentenceQuizCandidates(entries = []) {
  return entries.filter(entry => entry.kind === "sentence" && !entry.parentId && entry.title && entry.meaning);
}

// Ids a weak-only quiz may ASK about (the wrong-answer choices still come from
// the full pool). word/kanji: weak items that are quiz candidates. sentence-*:
// the pool entries whose title matches a weak registered `sentence` item (the
// same title mapping the sentence quiz uses to apply answers).
export function weakQuizQuestionIds({ items = [], entries = [], quizKind } = {}) {
  if (quizKind === "sentence-meaning" || quizKind === "sentence-listen") {
    const weakTitles = new Set(weakItems(items, "sentence").map(item => item.title));
    return sentenceQuizCandidates(entries).filter(entry => weakTitles.has(entry.title)).map(entry => entry.id);
  }
  return weakItems(quizCandidates(items, quizKind), quizKind).map(item => item.id);
}

// Weak counts for the quiz-selection summary (단어 N · 한자 M · 문장 K).
export function weakQuizCounts({ items = [], entries = [] } = {}) {
  return {
    word: weakQuizQuestionIds({ items, entries, quizKind: "word" }).length,
    kanji: weakQuizQuestionIds({ items, entries, quizKind: "kanji" }).length,
    sentence: weakQuizQuestionIds({ items, entries, quizKind: "sentence-meaning" }).length
  };
}

// Pool size and startability for one selection-screen card. `quizKind` is
// word | kanji | sentence-meaning | sentence-listen; `mode` is the word/kanji
// radio value (random needs both directions to be answerable). With
// `onlyWeak`, the card is also unavailable (reason "weak") when no weak item
// of that kind can be asked; `questionCount` is how many questions may be
// asked (the whole pool, or the weak ids) and sizes the session.
export function quizAvailability({ items = [], entries = [], quizKind, mode = "random", onlyWeak = false } = {}) {
  const isSentence = quizKind === "sentence-meaning" || quizKind === "sentence-listen";
  const candidates = isSentence ? sentenceQuizCandidates(entries) : quizCandidates(items, quizKind);
  let answerTypes;
  if (quizKind === "sentence-meaning") {
    answerTypes = ["meaning"];
  } else if (quizKind === "sentence-listen") {
    answerTypes = ["title"];
  } else if (mode === "random") {
    answerTypes = ["title", "meaning"];
  } else {
    answerTypes = [mode === "meaningToJp" || mode === "meaningToKanji" ? "title" : "meaning"];
  }
  const distinct = Math.min(...answerTypes.map(type => new Set(candidates.map(item => item[type])).size));
  const poolSize = candidates.length;
  const poolStartable = poolSize >= QUIZ_MIN_CANDIDATES && distinct >= QUIZ_MIN_CANDIDATES;
  const questionCount = onlyWeak ? weakQuizQuestionIds({ items, entries, quizKind }).length : poolSize;
  const canStart = poolStartable && questionCount > 0;
  return {
    poolSize,
    distinctCount: distinct,
    required: QUIZ_MIN_CANDIDATES,
    questionCount,
    canStart,
    reason: canStart ? "" : poolSize < QUIZ_MIN_CANDIDATES ? "count" : distinct < QUIZ_MIN_CANDIDATES ? "distinct" : "weak"
  };
}

// --- Quiz session bookkeeping (pure). A session is up to QUIZ_SESSION_SIZE
// questions; `index` is the 0-based current question.
export function createQuizSession(poolSize, size = QUIZ_SESSION_SIZE) {
  return { index: 0, total: Math.max(0, Math.min(size, poolSize)), correct: 0, missed: [], seenIds: [], finished: false, reviewChanges: { reset: 0, advanced: 0 } };
}

export function quizMissedEntry(question, selectedAnswer = "") {
  const { item, answerType, mode } = question;
  const base = { id: item.id, item, selectedAnswer: String(selectedAnswer || "") };
  if (mode === "listen") {
    return { ...base, prompt: item.title, answer: item.meaning };
  }
  return { ...base, prompt: answerType === "title" ? item.meaning : item.title, answer: question.correctAnswer };
}

export function recordQuizAnswer(session, question, correct, selectedAnswer = "") {
  return {
    ...session,
    correct: session.correct + (correct ? 1 : 0),
    missed: correct ? session.missed : [...session.missed, quizMissedEntry(question, selectedAnswer)],
    seenIds: session.seenIds.includes(question.item.id) ? session.seenIds : [...session.seenIds, question.item.id]
  };
}

// Tallies one review-schedule change applied for a quiz answer
// (quizReviewOutcome's action: "reset" | "advance"; "none" changes nothing).
export function recordQuizReviewChange(session, action) {
  const key = action === "reset" ? "reset" : action === "advance" ? "advanced" : "";
  if (!key) {
    return session;
  }
  const changes = session.reviewChanges || { reset: 0, advanced: 0 };
  return { ...session, reviewChanges: { ...changes, [key]: (changes[key] || 0) + 1 } };
}

export function isLastQuizQuestion(session) {
  return session.index + 1 >= session.total;
}

// Moves to the next question, or marks the session finished after the last.
export function advanceQuizSession(session) {
  return isLastQuizQuestion(session)
    ? { ...session, finished: true }
    : { ...session, index: session.index + 1 };
}

export function buildQuizQuestion({
  items = [],
  kind,
  mode = "random",
  forwardMode,
  reverseMode,
  random = Math.random,
  excludeIds = [],
  questionIds = null
}) {
  const candidates = quizCandidates(items, kind);
  const resolvedMode = mode === "random" ? randomItem([forwardMode, reverseMode], random) : mode;
  const answerType = resolvedMode === reverseMode ? "title" : "meaning";
  const uniqueAnswers = [...new Set(candidates.map(item => item[answerType]))];
  if (candidates.length < 4 || uniqueAnswers.length < 4) {
    return null;
  }

  // Items already asked in this session are skipped while others remain.
  // `questionIds` (optional) restricts which items may be ASKED (weak-only
  // quiz); the choices still come from every candidate.
  const askableCandidates = questionIds ? candidates.filter(item => questionIds.includes(item.id)) : candidates;
  if (!askableCandidates.length) {
    return null;
  }
  const fresh = askableCandidates.filter(item => !excludeIds.includes(item.id));
  const askable = fresh.length ? fresh : askableCandidates;
  const minCorrect = Math.min(...askable.map(item => Number(item.quizCorrectCount || 0)));
  const weakestItems = askable.filter(item => Number(item.quizCorrectCount || 0) === minCorrect);
  const item = randomItem(weakestItems, random);
  const correctAnswer = item[answerType];
  const distractors = shuffle(candidates.filter(candidate => candidate.id !== item.id && candidate[answerType] !== correctAnswer), random)
    .map(candidate => candidate[answerType])
    .filter((answer, index, list) => answer && list.indexOf(answer) === index)
    .slice(0, 3);

  if (distractors.length < 3) {
    return null;
  }

  return {
    item,
    kind,
    mode: resolvedMode,
    answerType,
    correctAnswer,
    choices: shuffle([correctAnswer, ...distractors], random)
  };
}

// Sentence quiz question builder. Unlike buildQuizQuestion, `entries` are
// daily-entry-shaped sentence records (title = 원문, meaning = 해석), not
// review items, so there is no quizCorrectCount weighting and answering a
// sentence question never touches SRS/review state.
export function buildSentenceQuizQuestion({
  entries = [],
  mode = "meaning",
  random = Math.random,
  excludeItemId = "",
  excludeIds = [],
  questionIds = null
} = {}) {
  const candidates = sentenceQuizCandidates(entries);
  const answerType = mode === "listen" ? "title" : "meaning";
  const uniqueAnswers = [...new Set(candidates.map(entry => entry[answerType]))];
  if (candidates.length < 4 || uniqueAnswers.length < 4) {
    return null;
  }

  // `questionIds` (optional) restricts which entries may be ASKED (weak-only
  // quiz); the choices still come from every candidate.
  const askableCandidates = questionIds ? candidates.filter(entry => questionIds.includes(entry.id)) : candidates;
  if (!askableCandidates.length) {
    return null;
  }
  const pool = askableCandidates.filter(entry => entry.id !== excludeItemId && !excludeIds.includes(entry.id));
  const item = randomItem(pool.length ? pool : askableCandidates, random);
  const correctAnswer = item[answerType];
  const distractors = shuffle(candidates.filter(candidate => candidate.id !== item.id && candidate[answerType] !== correctAnswer), random)
    .map(candidate => candidate[answerType])
    .filter((answer, index, list) => answer && list.indexOf(answer) === index)
    .slice(0, 3);

  if (distractors.length < 3) {
    return null;
  }

  return {
    item,
    kind: "sentence",
    mode,
    answerType,
    correctAnswer,
    choices: shuffle([correctAnswer, ...distractors], random)
  };
}

// Kinds offered by the 복습 큐 page's 종류 filter, in the order the control
// lists them. "" is the 전체 sentinel (no kind narrowing).
//
// Every kind that can reach the queue gets an option: isReviewQueueItem only
// excludes kind === "source", so 문장 and 한자 items are queue members like
// the rest and are filterable individually.
export const REVIEW_KIND_FILTER_OPTIONS = REVIEW_KIND_ORDER;

// Anything unrecognised (stale value, hand-edited DOM) degrades to 전체
// rather than filtering the queue down to nothing.
export function normalizeReviewKindFilter(kindFilter) {
  return REVIEW_KIND_FILTER_OPTIONS.includes(kindFilter) ? kindFilter : "";
}

export function matchesReviewKindFilter(item, kindFilter = "") {
  const kind = normalizeReviewKindFilter(kindFilter);
  return !kind || item?.kind === kind;
}

// `kindFilter` composes with (never replaces) the global search term: an
// item has to clear both to stay in the queue.
export function reviewItems(items = [], searchTerm = "", kindFilter = "") {
  return items.filter(item =>
    isReviewQueueItem(item) &&
    matchesSearch(item, searchTerm) &&
    matchesReviewKindFilter(item, kindFilter)
  );
}

export function dailyEntriesByKind(dailyEntries = [], kind) {
  return (dailyEntries || []).filter(entry => entry.kind === kind);
}

export function rootSentenceEntries(dailyEntries = []) {
  return dailyEntriesByKind(dailyEntries, "sentence").filter(entry => !entry.parentId);
}

export function linkedEntriesForSentence(dailyEntries = [], kind, sentenceId) {
  return dailyEntriesByKind(dailyEntries, kind).filter(item =>
    (item.sourceSentences || []).some(sentence => sentence.id === sentenceId) || item.parentId === sentenceId
  );
}

export function dailyEntryToCandidate(entry) {
  return {
    title: entry.title,
    reading: entry.reading,
    meaning: entry.meaning,
    kanji: entry.parsed?.kanji || "",
    part: entry.parsed?.part || "",
    script: entry.parsed?.script || ""
  };
}

export function uniqueSourceSentences(sourceSentences = []) {
  return (sourceSentences || []).filter((sentence, index, list) =>
    list.findIndex(item => sourceSentenceKey(item) === sourceSentenceKey(sentence)) === index
  );
}

// Every daily entry kind gets promoted into the permanent study collections
// by registerDailyEntries: word/grammar/expression become items of their own
// kind (plus derived 한자 items), and a sentence becomes a 문장 item
// (part=문장, script=혼합). So a
// sentence's own `registered` flag IS a meaningful "needs action" signal, and
// the 전체 등록 button targets sentences too: a sentence card "needs
// registration" when the sentence itself or any of its
// word/grammar/expression children is still unregistered.
const REGISTERABLE_DAILY_KINDS = ["word", "grammar", "expression", "sentence"];

export function entryNeedsRegistration(entry) {
  return REGISTERABLE_DAILY_KINDS.includes(entry?.kind) && !entry?.registered;
}

export function unregisteredStudyDates(dailyEntries = []) {
  return new Set(
    (dailyEntries || [])
      .filter(entryNeedsRegistration)
      .map(entry => entry.studyDate)
  );
}

// A sentence has "complete" registration once every word/grammar/expression
// entry linked to it (its children) has been registered. This is deliberately
// only about the children - it answers "is this sentence's vocabulary fully
// collected?" for the home tab's 오늘의 문장 pick, and ignores the sentence's
// own `registered` flag. The sentence cards' 등록 필요 badge is a wider rollup
// (children + the sentence itself), so the two no longer match exactly.
export function sentenceHasCompleteRegistration(dailyEntries = [], sentenceId) {
  const children = ["word", "grammar", "expression"].flatMap(kind =>
    linkedEntriesForSentence(dailyEntries, kind, sentenceId)
  );
  return children.length > 0 && children.every(child => !entryNeedsRegistration(child));
}

// Picks a random sentence entry for the home tab's "오늘의 문장" panel,
// preferring sentences whose linked entries are all registered and falling
// back to any sentence when none qualify.
//
// `excludeId` (used for the refresh button's re-roll) drops the currently
// shown sentence from consideration first, so the button doesn't look
// broken when the "complete" pool only has one member: if excluding it
// empties the preferred pool, we fall back to the full sentence pool (also
// minus excludeId) before finally falling back to re-showing the same
// sentence when it's the only one in storage.
export function pickRandomSentence(dailyEntries = [], random = Math.random, { excludeId } = {}) {
  const sentences = rootSentenceEntries(dailyEntries);
  if (!sentences.length) {
    return null;
  }
  const complete = sentences.filter(entry => sentenceHasCompleteRegistration(dailyEntries, entry.id));
  const preferred = complete.length ? complete : sentences;

  const withoutExcluded = excludeId ? preferred.filter(entry => entry.id !== excludeId) : preferred;
  if (withoutExcluded.length) {
    return withoutExcluded[Math.floor(random() * withoutExcluded.length)];
  }

  const fallbackWithoutExcluded = excludeId ? sentences.filter(entry => entry.id !== excludeId) : sentences;
  const pool = fallbackWithoutExcluded.length ? fallbackWithoutExcluded : sentences;
  return pool[Math.floor(random() * pool.length)];
}

// Selectable page sizes for the 설정 tab's "페이지당 항목 수" control, plus
// the per-view defaults used when the user picks 기본값 (no override).
export const LIST_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export const DEFAULT_LIST_PAGE_SIZES = {
  sentences: 10,
  words: 20,
  grammar: 12,
  expression: 12,
  kanji: 24
};

// Pure resolver so the settings-driven page size is unit-testable without
// touching the DOM/localStorage: `override` is either a number from
// LIST_PAGE_SIZE_OPTIONS (applies to every view uniformly) or a falsy
// value meaning "기본값" (use this view's own default).
export function resolveListPageSize(view, override, defaults = DEFAULT_LIST_PAGE_SIZES) {
  if (override) {
    return override;
  }
  return defaults[view] || defaults.words;
}

// 한자 탭 카드에 보여 줄 "쓰인 단어" 개수 설정. 값은 select/저장용 문자열
// ("all" = 전체)이고, resolveKanjiWordLimit()가 렌더링용 숫자(전체 = Infinity)로
// 바꿔 준다. 알 수 없는 값은 기본값(3)으로 돌아간다.
export const KANJI_WORD_LIMIT_OPTIONS = ["0", "1", "2", "3", "5", "all"];
export const DEFAULT_KANJI_WORD_LIMIT = 3;

export function resolveKanjiWordLimit(value) {
  const key = String(value ?? "");
  if (!KANJI_WORD_LIMIT_OPTIONS.includes(key)) {
    return DEFAULT_KANJI_WORD_LIMIT;
  }
  return key === "all" ? Infinity : Number(key);
}

export function studyStats(state = {}) {
  const items = state.items || [];
  return {
    totalMinutes: Number(state.studyLog?.totalMinutes || 0),
    totalWords: items.filter(item => item.kind === "word").length,
    totalGrammarExpression: items.filter(item => ["grammar", "expression"].includes(item.kind)).length,
    completedSources: items.filter(item => item.kind === "source" && sourceProgress(item) >= 100).length
  };
}

export function sourceProgress(item = {}) {
  const progress = [item.kanji, item.source]
    .map(value => String(value ?? "").trim())
    .filter(Boolean)
    .map(value => Number(value))
    .find(value => Number.isFinite(value));
  return progress === undefined ? 0 : Math.min(100, Math.max(0, progress));
}

export function reviewedTodayCount(items = [], kind, todayDate = dateKey(new Date())) {
  return items.filter(item => item.kind === kind && String(item.lastReviewedAt || "").slice(0, 10) === todayDate).length;
}

// Home/sidebar counts are global summaries: never filtered by the search box.
export function quickFilterCounts(state = {}) {
  const items = state.items || [];
  const tasks = state.tasks || [];
  return {
    review: reviewItems(items).length,
    // Words that came from a saved sentence (the 단어 tab's "문장에서 등록" filter).
    source: items.filter(item => item.kind === "word" && uniqueSourceSentences(item.sourceSentences).length).length,
    pending: tasks.filter(task => !task.done).length
  };
}

const HOME_STUDY_KINDS = ["word", "grammar", "expression", "kanji"];
const ONBOARDING_ENTRY_ID = "sentence-onboarding";

export function homeOverview(state = {}) {
  const items = state.items || [];
  const allEntries = state.allDailyEntries || state.dailyEntries || [];
  const studyItems = items.filter(item => item.kind !== "source");
  return {
    // Nothing studied yet beyond the seeded instructional card: the home
    // page shows its getting-started guide instead of the daily summary.
    isFirstRun: !studyItems.length && allEntries.every(entry => entry.id === ONBOARDING_ENTRY_ID),
    focusText: state.studyLog?.summary || "새 항목을 추가하고 복습 큐를 정리하세요.",
    todaySentenceCount: (state.dailyEntries || [])
      .filter(entry => entry.kind === "sentence" && entry.id !== ONBOARDING_ENTRY_ID).length,
    newItemCount: studyItems.length,
    reviewItemCount: reviewItems(items).length,
    recentItems: studyItems.slice(0, 3),
    reviewedTodayCount: HOME_STUDY_KINDS.reduce(
      (total, kind) => total + reviewedTodayCount(items, kind, state.selectedDate || undefined),
      0
    ),
    reviewSummary: HOME_STUDY_KINDS.map(kind => ({
      kind,
      count: items.filter(item => item.kind === kind && ["오늘", "대기"].includes(item.review)).length
    }))
  };
}

function isReviewQueueItem(item) {
  const review = item.review || "대기";
  return ["오늘", "대기"].includes(review) && item.kind !== "source";
}

// 복습 필요 = in the review queue (review 오늘/대기); 예정 = every other item.
export function isReviewDue(item = {}) {
  return isReviewQueueItem(item);
}

export const STUDY_CARD_SORT_OPTIONS = [
  ["recent", "최근 등록순"],
  ["oldest", "오래된순"],
  ["kana", "가나다순"],
  ["due", "복습 필요순"]
];

function sortTitleKey(item) {
  return String(item.title || "").trim().replace(/^[〜~]+\s*/, "");
}

// Items arrive newest first (store order), so "recent" keeps that order,
// "oldest" reverses it, and "due" is a stable partition: due items first, each
// group still newest first. Never mutates `list`.
export function sortStudyCards(list = [], sortKey = "recent") {
  const rows = [...list];
  if (sortKey === "oldest") {
    return rows.reverse();
  }
  if (sortKey === "kana") {
    return rows.sort((a, b) => sortTitleKey(a).localeCompare(sortTitleKey(b), "ja"));
  }
  if (sortKey === "due") {
    return [...rows.filter(isReviewDue), ...rows.filter(item => !isReviewDue(item))];
  }
  return rows;
}

export function normalizeStudyCardSort(value) {
  return STUDY_CARD_SORT_OPTIONS.some(([key]) => key === value) ? value : "recent";
}

// Counts for the 문법/표현 filter tabs, within one (already search-narrowed)
// list. Each group's counts ignore the other group's selection.
export function studyCardFilterCounts(list = []) {
  const due = list.filter(isReviewDue).length;
  const sentence = list.filter(item => uniqueSourceSentences(item.sourceSentences).length > 0).length;
  return {
    review: { all: list.length, due, scheduled: list.length - due },
    source: { all: list.length, sentence, manual: list.length - sentence }
  };
}

export function matchesStudyCardFilters(item, { review = "", source = "" } = {}) {
  if (review && isReviewDue(item) !== (review === "due")) {
    return false;
  }
  if (source && (uniqueSourceSentences(item.sourceSentences).length > 0) !== (source === "sentence")) {
    return false;
  }
  return true;
}

function wordSortValue(item, key) {
  if (key === "sourceSentence") {
    return (item.sourceSentences || [])
      .map(sentence => sentence.title || "")
      .join(" ");
  }
  return item[key] || "";
}

function sourceSentenceKey(sentence) {
  return [
    sentence.studyDate || "",
    String(sentence.title || "").trim().replace(/\s+/g, " ")
  ].join("::");
}

function randomItem(list, random) {
  return list[Math.floor(random() * list.length)];
}

function shuffle(list, random) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
