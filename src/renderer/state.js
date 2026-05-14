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

function reviewItems() {
  return state.items.filter(item => ["오늘", "대기"].includes(item.review) && item.kind !== "source" && matchesSearch(item));
}
