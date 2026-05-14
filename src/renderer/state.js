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

function reviewItems() {
  return state.items.filter(item => ["오늘", "대기"].includes(item.review) && item.kind !== "source" && matchesSearch(item));
}
