const {
  tocByPage,
  kindLabels,
  badgeClassByKind,
  partOptions,
  scriptOptions,
  manualEntryPlaceholders
} = window.NihonGoConfig;

const {
  byId,
  escapeHtml,
  empty,
  toDateKey,
  localTodayKey
} = window.NihonGoUtils;

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
let reviewSelection = new Set();
let storagePaths = null;
let selectedDate = localTodayKey();
let calendarMonth = selectedDate.slice(0, 7);

function applyState(nextState) {
  state = nextState;
  selectedDate = nextState.selectedDate || selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  renderAll();
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
  if (!searchTerm) {
    return true;
  }
  const haystack = [item.title, item.reading, item.meaning, item.level, item.part, item.script, item.review, item.kanji, item.source, item.note]
    .join(" ")
    .toLowerCase();
  return haystack.includes(searchTerm.toLowerCase());
}

function items(kind) {
  return state.items.filter(item => item.kind === kind && matchesSearch(item));
}

function getWordSortValue(item, key) {
  if (key === "sourceSentence") {
    return (item.sourceSentences || [])
      .map(sentence => sentence.title || "")
      .join(" ");
  }
  return item[key] || "";
}

function sortedWords(list) {
  if (!wordSort.key || !wordSort.direction) {
    return list;
  }
  const direction = wordSort.direction === "desc" ? -1 : 1;
  return [...list].sort((left, right) => {
    const result = String(getWordSortValue(left, wordSort.key))
      .localeCompare(String(getWordSortValue(right, wordSort.key)), undefined, {
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
  const candidates = state.items.filter(item => item.kind === kind && item.title && item.meaning);
  const resolvedMode = mode === "random" ? randomItem([forwardMode, reverseMode]) : mode;
  const answerType = resolvedMode === reverseMode ? "title" : "meaning";
  const uniqueAnswers = [...new Set(candidates.map(item => item[answerType]))];
  if (candidates.length < 4 || uniqueAnswers.length < 4) {
    return null;
  }

  const minCorrect = Math.min(...candidates.map(item => Number(item.quizCorrectCount || 0)));
  const weakestWords = candidates.filter(item => Number(item.quizCorrectCount || 0) === minCorrect);
  const item = randomItem(weakestWords);
  const correctAnswer = item[answerType];
  const distractors = shuffle(candidates.filter(candidate => candidate.id !== item.id && candidate[answerType] !== correctAnswer))
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
    choices: shuffle([correctAnswer, ...distractors])
  };
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function reviewItems() {
  return state.items.filter(item => ["오늘", "대기"].includes(item.review) && item.kind !== "source" && matchesSearch(item));
}
