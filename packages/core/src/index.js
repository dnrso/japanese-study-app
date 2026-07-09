export * from "./merge.js";

const REVIEW_QUEUE_INTERVALS = {
  "내일": 1,
  "3일 후": 3,
  "일주일": 7,
  "2주일": 14,
  "한달": 30
};

const SEARCH_FIELDS = [
  "title",
  "reading",
  "meaning",
  "level",
  "part",
  "script",
  "review",
  "kanji",
  "source",
  "note"
];

export function clampQuizQuestionFontSize(value) {
  return Math.min(64, Math.max(24, Number(value) || 32));
}

// Minimal structural contract for an AI-generated (or manually written)
// sentence analysis block, mirrored from packages/storage-idb's
// parseSentenceBlock and supabase/functions/_shared/ai.js's
// hasValidSentenceBlockStructure: the raw text must open with a "# "
// heading line and contain at least a 읽기 line and a 해석 line. Used to
// reject conversational AI replies (no structured block) before they are
// ever saved as a sentence card.
export function hasValidSentenceBlockStructure(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return false;
  }
  if (!lines[0].startsWith("# ")) {
    return false;
  }
  const hasReading = lines.some(line => line.startsWith("읽기"));
  const hasMeaning = lines.some(line => line.startsWith("해석"));
  return hasReading && hasMeaning;
}

export function resolveQuizCorrectReview(value, scheduledReviewOptions) {
  if (value === "") {
    return "";
  }
  return scheduledReviewOptions.includes(value) ? value : "내일";
}

export function normalizeQuizCorrectReview(value, scheduledReviewOptions) {
  return scheduledReviewOptions.includes(value) ? value : "";
}

export function reviewStatusText(item) {
  const review = item.review || "대기";
  if (item.reviewDueDate && !["오늘", "대기"].includes(review)) {
    return `${review} (${item.reviewDueDate})`;
  }
  return review;
}

export function reviewQueueReview(item, drafts = new Map()) {
  return drafts.get(item.id) || "대기";
}

export function reviewQueueDueDate(review, todayKey = dateKey(new Date())) {
  const days = REVIEW_QUEUE_INTERVALS[review];
  if (!days) {
    return "";
  }
  return addDays(todayKey, days);
}

export function reviewQueueStatusText({ item, drafts = new Map(), todayKey = dateKey(new Date()) }) {
  const review = reviewQueueReview(item, drafts);
  const dueDate = reviewQueueDueDate(review, todayKey);
  return dueDate ? `${review} (${dueDate})` : review;
}

export function pruneReviewQueueDrafts({ items = [], drafts = new Map() }) {
  const queueIds = new Set(items.filter(isReviewQueueItem).map(item => item.id));
  return new Map([...drafts.entries()].filter(([id]) => queueIds.has(id)));
}

export function cycleReviewQueueDraft({ items = [], drafts = new Map(), id, options = [] }) {
  const item = items.find(candidate => candidate.id === id);
  if (!item) {
    return new Map(drafts);
  }

  const nextDrafts = new Map(drafts);
  const currentReview = reviewQueueReview(item, drafts);
  const currentIndex = options.indexOf(currentReview);
  const nextReview = options[((currentIndex >= 0 ? currentIndex : 0) + 1) % options.length] || "대기";

  if (nextReview === "대기") {
    nextDrafts.delete(id);
  } else {
    nextDrafts.set(id, nextReview);
  }
  return nextDrafts;
}

export function reviewCompletionTargets({ items = [], drafts = new Map(), searchTerm = "" }) {
  return reviewItems(items, searchTerm)
    .map(item => ({ id: item.id, review: reviewQueueReview(item, drafts) }))
    .filter(item => item.review !== "대기");
}

export function matchesSearch(item, searchTerm = "") {
  const needle = String(searchTerm || "").trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return SEARCH_FIELDS
    .map(field => item[field] || "")
    .join(" ")
    .toLowerCase()
    .includes(needle);
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

export function buildQuizQuestion({
  items = [],
  kind,
  mode = "random",
  forwardMode,
  reverseMode,
  random = Math.random
}) {
  const candidates = items.filter(item => item.kind === kind && item.title && item.meaning);
  const resolvedMode = mode === "random" ? randomItem([forwardMode, reverseMode], random) : mode;
  const answerType = resolvedMode === reverseMode ? "title" : "meaning";
  const uniqueAnswers = [...new Set(candidates.map(item => item[answerType]))];
  if (candidates.length < 4 || uniqueAnswers.length < 4) {
    return null;
  }

  const minCorrect = Math.min(...candidates.map(item => Number(item.quizCorrectCount || 0)));
  const weakestItems = candidates.filter(item => Number(item.quizCorrectCount || 0) === minCorrect);
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
  excludeItemId = ""
} = {}) {
  const candidates = entries.filter(entry => entry.kind === "sentence" && !entry.parentId && entry.title && entry.meaning);
  const answerType = mode === "listen" ? "title" : "meaning";
  const uniqueAnswers = [...new Set(candidates.map(entry => entry[answerType]))];
  if (candidates.length < 4 || uniqueAnswers.length < 4) {
    return null;
  }

  const pool = excludeItemId ? candidates.filter(entry => entry.id !== excludeItemId) : candidates;
  const item = randomItem(pool.length ? pool : candidates, random);
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

export function reviewItems(items = [], searchTerm = "") {
  return items.filter(item => isReviewQueueItem(item) && matchesSearch(item, searchTerm));
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

// Only word/grammar/expression daily entries ever get promoted into the
// permanent study collections (see storage-idb's registerDailyEntries,
// which filters to exactly these kinds). Sentence entries are never a
// target of that call, so entry.registered stays false forever for a
// sentence and isn't a meaningful "needs action" signal by itself - a
// sentence "needs registration" only in the sense that it still has
// unregistered word/grammar/expression children.
const REGISTERABLE_DAILY_KINDS = ["word", "grammar", "expression"];

export function entryNeedsRegistration(entry) {
  return REGISTERABLE_DAILY_KINDS.includes(entry?.kind) && !entry?.registered;
}

export function hasUnregisteredEntries(dailyEntries = []) {
  return (dailyEntries || []).some(entryNeedsRegistration);
}

export function unregisteredStudyDates(dailyEntries = []) {
  return new Set(
    (dailyEntries || [])
      .filter(entryNeedsRegistration)
      .map(entry => entry.studyDate)
  );
}

// A sentence has "complete" registration once every word/grammar/expression
// entry linked to it (its children) has been registered - mirrors the
// rollup used by the sentence cards on the 오늘 공부/문장 tabs.
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

export function quickFilterCounts(state = {}, searchTerm = "") {
  const items = state.items || [];
  const tasks = state.tasks || [];
  return {
    review: reviewItems(items, searchTerm).length,
    n3: items.filter(item => item.level === "N3").length,
    source: items.filter(item => item.source && item.kind !== "source").length,
    pending: tasks.filter(task => !task.done).length
  };
}

export function homeOverview(state = {}, searchTerm = "") {
  const items = state.items || [];
  const minutes = Number(state.studyLog?.minutes || 0);
  const progress = Math.min(100, Math.round((minutes / 90) * 100));
  return {
    progress,
    remainingMinutes: Math.max(0, 90 - minutes),
    minutes,
    focusText: state.studyLog?.summary || "새 항목을 추가하고 복습 큐를 정리하세요.",
    todayEntryCount: state.dailyEntries?.length || 0,
    newItemCount: items.filter(item => item.kind !== "source").length,
    reviewItemCount: reviewItems(items, searchTerm).length,
    recentItems: items.filter(item => item.kind !== "source").slice(0, 3),
    reviewSummary: ["word", "grammar", "expression", "kanji"].map(kind => ({
      kind,
      count: items.filter(item => item.kind === kind && ["오늘", "대기"].includes(item.review)).length
    }))
  };
}

function isReviewQueueItem(item) {
  const review = item.review || "대기";
  return ["오늘", "대기"].includes(review) && item.kind !== "source";
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

function addDays(dateValue, days) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
