import "@nihongo-study/ui/styles";
import * as core from "@nihongo-study/core";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import {
  applyPagePatch as applySharedPagePatch,
  badgeClassByKind,
  kindLabels,
  manualEntryPlaceholders,
  partOptions,
  renderCalendarPage,
  renderHomePage,
  renderKanjiPage,
  renderKanjiQuizPage,
  renderLearnedSectionsPage,
  renderQuickFiltersPage,
  renderQuizSettingsPage,
  renderReviewPage,
  renderSentencesPage,
  safeSourceUrl,
  renderSourcesPage,
  renderStatsPage,
  renderStudyCardsPage,
  renderTasksPage,
  renderTaxonomyPage,
  renderTodayPage,
  renderWordQuizPage,
  renderWordsPage,
  reviewOptions,
  scheduledReviewOptions,
  scriptOptions,
  tocByPage
} from "@nihongo-study/ui";
import { createSampleState } from "./sampleState.js";
import { escapeHtml, renderAppShell } from "./templates.js";
import { mergeBackupData, backupData, parseBackupFile } from "./merge.js";
import { emptyQuiz, startQuiz as startQuizSession, exitQuizSession as exitQuizSessionImpl, submitQuizChoice as submitQuizChoiceImpl } from "./quiz.js";
import {
  createSync,
  renderAccountStatus as renderAccountStatusImpl,
  signInWithGoogle as signInWithGoogleImpl,
  signOutOfAccount as signOutOfAccountImpl,
  wireAuthChange
} from "./syncSetup.js";

const store = createIdbStorage({
  seedState: () => createSampleState(todayKey)
});
const sync = createSync({ storage: store, mergeSnapshots: (current, imported) => mergeBackupData(current, imported, selectedDate || todayKey()) });
const storageNotice = "웹 데이터는 IndexedDB에 저장됩니다. 브라우저 사이트 데이터를 삭제하면 함께 삭제됩니다.";
const backupFormat = "nihongo-study-web-backup";
const backupVersion = 1;

const aiSentenceAnalysisPlaceholder = "한국어 또는 일본어 문장을 입력하세요 *AI 문장 분석 사용";

let state = createSampleState(todayKey);
let aiSentenceAnalysisInProgress = false;
let aiSentenceAnalysisEnabled = false;
let dailyEntryInputDefaultPlaceholder = "";
let accountSession = null;
let currentPage = "home";
let selectedDate = state.selectedDate;
let calendarMonth = selectedDate.slice(0, 7);
let calendarCollapsed = false;
let searchTerm = "";
let wordSort = { key: "", direction: "" };
let wordQuizMode = "random";
let kanjiQuizMode = "random";
let wordQuiz = emptyQuiz();
let kanjiQuiz = emptyQuiz();
let reviewQueueDrafts = new Map();
let quizQuestionFontSize = 32;
let quizReviewOnCorrect = true;
let quizCorrectReview = "내일";
let storageStatus = storageNotice;

function byId(id) {
  return document.getElementById(id);
}

function bindEvents() {
  dailyEntryInputDefaultPlaceholder = byId("dailyEntryInput").placeholder;

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => openPage(tab.dataset.page));
  });

  document.body.addEventListener("click", async event => {
    const speakTarget = event.target.closest("[data-speak-text]");
    if (speakTarget) {
      speak(speakTarget.dataset.speakText);
      return;
    }

    const openTarget = event.target.closest("[data-open-page]");
    if (openTarget) {
      openPage(openTarget.dataset.openPage);
      return;
    }

    const filterTarget = event.target.closest("[data-filter]");
    if (filterTarget) {
      applyQuickFilter(filterTarget.dataset.filter);
      return;
    }

    const calendarTarget = event.target.closest("[data-calendar-date]");
    if (calendarTarget) {
      selectedDate = calendarTarget.dataset.calendarDate;
      calendarMonth = selectedDate.slice(0, 7);
      await refreshState();
      return;
    }

    const taskTarget = event.target.closest("[data-toggle-task]");
    if (taskTarget) {
      await toggleTask(taskTarget.dataset.toggleTask);
      return;
    }

    const wordSortTarget = event.target.closest("[data-word-sort]");
    if (wordSortTarget) {
      wordSort = core.nextWordSort(wordSort, wordSortTarget.dataset.wordSort);
      renderWords();
      return;
    }

    const taxonomyTarget = event.target.closest("[data-word-taxonomy]");
    if (taxonomyTarget) {
      const select = byId(taxonomyTarget.dataset.wordTaxonomy === "part" ? "wordPartFilter" : "wordScriptFilter");
      const value = taxonomyTarget.dataset.wordTaxonomyValue;
      select.value = select.value === value ? "" : value;
      renderWords();
      renderTaxonomy();
      return;
    }

    const addTarget = event.target.closest("[data-add-item]");
    if (addTarget) {
      await promptAddItem(addTarget.dataset.kind);
      return;
    }

    const editTarget = event.target.closest("[data-edit-item]");
    if (editTarget) {
      await promptEditItem(editTarget.dataset.editItem);
      return;
    }

    const deleteTarget = event.target.closest("[data-delete-item]");
    if (deleteTarget) {
      await deleteItem(deleteTarget.dataset.deleteItem);
      return;
    }

    const cycleTarget = event.target.closest("[data-cycle-review]");
    if (cycleTarget) {
      await cycleReview(cycleTarget.dataset.cycleReview);
      return;
    }

    const reviewQueueCycleTarget = event.target.closest("[data-cycle-review-queue]");
    if (reviewQueueCycleTarget) {
      reviewQueueDrafts = core.cycleReviewQueueDraft({
        items: state.items,
        drafts: reviewQueueDrafts,
        id: reviewQueueCycleTarget.dataset.cycleReviewQueue,
        options: ["대기", ...scheduledReviewOptions]
      });
      renderReview();
      return;
    }

    const kanjiWordsTarget = event.target.closest("[data-show-kanji-words]");
    if (kanjiWordsTarget) {
      setSearch(kanjiWordsTarget.dataset.showKanjiWords);
      openPage("words");
      return;
    }

    const jumpTarget = event.target.closest("[data-jump-sentence]");
    if (jumpTarget) {
      jumpToSentence(jumpTarget.dataset.jumpSentence, jumpTarget.dataset.sourceDate || selectedDate);
      return;
    }

    const deleteDailyTarget = event.target.closest("[data-delete-daily-entry]");
    if (deleteDailyTarget) {
      await deleteDailyEntry(deleteDailyTarget.dataset.deleteDailyEntry);
      return;
    }

    const quizTarget = event.target.closest("[data-quiz-kind]");
    if (quizTarget) {
      startQuiz(quizTarget.dataset.quizKind);
      return;
    }

    const wordChoice = event.target.closest("[data-word-quiz-choice]");
    if (wordChoice && wordQuiz.question && !wordQuiz.answered) {
      await submitQuizChoice("word", wordChoice.dataset.wordQuizChoice);
      return;
    }

    const kanjiChoice = event.target.closest("[data-kanji-quiz-choice]");
    if (kanjiChoice && kanjiQuiz.question && !kanjiQuiz.answered) {
      await submitQuizChoice("kanji", kanjiChoice.dataset.kanjiQuizChoice);
      return;
    }

    if (event.target.closest("[data-next-word-quiz]")) {
      startQuiz("word");
      return;
    }

    if (event.target.closest("[data-next-kanji-quiz]")) {
      startQuiz("kanji");
    }
  });

  byId("globalSearch").addEventListener("input", event => {
    searchTerm = event.target.value.trim();
    renderAll();
  });

  byId("wordPartFilter").addEventListener("change", () => {
    renderWords();
    renderTaxonomy();
  });
  byId("wordScriptFilter").addEventListener("change", () => {
    renderWords();
    renderTaxonomy();
  });
  byId("wordReviewFilter").addEventListener("change", renderWords);

  byId("addTaskBtn").addEventListener("click", addTask);
  byId("prevMonthBtn").addEventListener("click", () => moveCalendarMonth(-1));
  byId("nextMonthBtn").addEventListener("click", () => moveCalendarMonth(1));
  byId("calendarToggleBtn").addEventListener("click", toggleCalendarCollapsed);
  byId("todayBtn").addEventListener("click", async () => {
    selectedDate = todayKey();
    calendarMonth = selectedDate.slice(0, 7);
    await refreshState();
  });

  byId("addDailyEntryBtn").addEventListener("click", addDailyEntryFromInput);
  byId("aiSentenceAnalysisCheckbox")?.addEventListener("click", event => {
    if (event.target.checked && !accountSession) {
      event.preventDefault();
      event.target.checked = false;
      setAiSentenceAnalysisStatus("로그인 유저만 사용 가능합니다.");
      return;
    }
  });
  byId("aiSentenceAnalysisCheckbox")?.addEventListener("change", event => {
    aiSentenceAnalysisEnabled = event.target.checked;
    updateDailyEntryPlaceholder();
    setAiSentenceAnalysisStatus(aiSentenceAnalysisEnabled ? "AI 문장 분석이 켜졌습니다." : "");
  });
  byId("addManualEntryBtn").addEventListener("click", addManualEntryFromInput);
  byId("registerLearnedBtn").addEventListener("click", registerLearnedEntries);
  byId("completeReviewBtn").addEventListener("click", completeSelectedReview);
  byId("quizExitBtn").addEventListener("click", exitQuizSession);
  byId("resetDataBtn").addEventListener("click", resetSampleData);
  byId("downloadBackupBtn").addEventListener("click", downloadBackup);
  byId("loadBackupBtn").addEventListener("click", () => byId("backupFileInput").click());
  byId("mergeBackupBtn").addEventListener("click", () => byId("mergeBackupFileInput").click());
  byId("googleSignInBtn").addEventListener("click", signInWithGoogle);
  byId("googleSignOutBtn").addEventListener("click", signOutOfAccount);
  byId("backupFileInput").addEventListener("change", loadBackupFromFile);
  byId("mergeBackupFileInput").addEventListener("change", mergeBackupFromFile);

  let lastSelectedManualKind = "";
  document.querySelectorAll("input[name='dailyManualKind']").forEach(input => {
    input.addEventListener("click", () => {
      if (input.checked && lastSelectedManualKind === input.value) {
        input.checked = false;
        lastSelectedManualKind = "";
        hideManualEntryInput();
        return;
      }
      lastSelectedManualKind = input.value;
      updateManualEntryPlaceholder();
      revealManualEntryInput();
    });
  });

  document.querySelectorAll("input[name='wordQuizMode']").forEach(input => {
    input.addEventListener("change", event => {
      wordQuizMode = event.target.value;
      wordQuiz = emptyQuiz();
      byId("quizStatus").textContent = "단어 퀴즈 유형을 선택했습니다.";
      renderWordQuiz();
    });
  });

  document.querySelectorAll("input[name='kanjiQuizMode']").forEach(input => {
    input.addEventListener("change", event => {
      kanjiQuizMode = event.target.value;
      kanjiQuiz = emptyQuiz();
      byId("quizStatus").textContent = "한자 퀴즈 유형을 선택했습니다.";
      renderKanjiQuiz();
    });
  });

  byId("quizQuestionFontSizeRange").addEventListener("input", event => {
    quizQuestionFontSize = core.clampQuizQuestionFontSize(event.target.value);
    applyQuizQuestionFontSize();
    byId("quizQuestionFontSizeValue").textContent = `${quizQuestionFontSize}px`;
  });

  byId("quizReviewOnCorrectCheckbox").addEventListener("change", event => {
    quizReviewOnCorrect = event.target.checked;
    renderQuizSettings();
  });

  byId("quizCorrectReviewSelect").addEventListener("change", event => {
    quizCorrectReview = core.resolveQuizCorrectReview(event.target.value, scheduledReviewOptions);
    renderQuizSettings();
  });

  document.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      byId("globalSearch").focus();
    }
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      promptAddItem("word");
    }
  });
}

function renderAll() {
  updatePageVisibility();
  renderDate();
  renderToc(currentPage);
  renderHome();
  renderTasks();
  renderCalendar();
  renderToday();
  renderLearnedSections();
  renderSources();
  renderSentences();
  renderWordFilters();
  renderWords();
  renderCards("grammar", "grammarCards");
  renderCards("expression", "expressionCards");
  renderKanji();
  renderWordQuiz();
  renderKanjiQuiz();
  renderReview();
  renderStats();
  renderTaxonomy();
  renderQuickFilters();
  renderQuizSettings();
  renderStorageStatus();
  renderAccountStatus();
}

async function refreshState(studyDate = selectedDate) {
  state = await store.getState(studyDate);
  selectedDate = state.selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  renderAll();
}

function renderHome() {
  applyPagePatch(renderHomePage({
    overview: core.homeOverview(state, searchTerm),
    helpers: renderHelpers()
  }));
  applyPagePatch({
    text: {
      reviewedWordCount: `${core.reviewedTodayCount(state.items, "word", selectedDate)}개`,
      reviewedKanjiCount: `${core.reviewedTodayCount(state.items, "kanji", selectedDate)}개`
    }
  });
}

function renderTasks() {
  applyPagePatch(renderTasksPage({
    tasks: state.tasks.filter(task => !task.studyDate || task.studyDate === selectedDate),
    helpers: renderHelpers()
  }));
}

function renderToday() {
  updateManualEntryPlaceholder();
  const entries = dailyEntriesForSelectedDate();
  applyPagePatch(renderTodayPage({
    selectedDate,
    sentenceEntries: core.rootSentenceEntries(entries),
    helpers: {
      ...renderHelpers(),
      entryToCandidate: core.dailyEntryToCandidate,
      linkedEntriesForSentence
    }
  }));
}

function renderCalendar() {
  applyPagePatch(renderCalendarPage({
    calendarMonth,
    selectedDate,
    studyDays: state.studyDays,
    toDateKey
  }));
  applyCalendarCollapsedState();
}

function applyCalendarCollapsedState() {
  const panel = byId("today-calendar");
  const toggleBtn = byId("calendarToggleBtn");
  if (!panel || !toggleBtn) {
    return;
  }
  panel.classList.toggle("calendar-collapsed", calendarCollapsed);
  toggleBtn.setAttribute("aria-expanded", String(!calendarCollapsed));
}

function toggleCalendarCollapsed() {
  calendarCollapsed = !calendarCollapsed;
  applyCalendarCollapsedState();
}

function renderLearnedSections() {
  applyPagePatch(renderLearnedSectionsPage({
    entriesByKind: {
      word: dailyEntriesByKind("word"),
      grammar: dailyEntriesByKind("grammar"),
      expression: dailyEntriesByKind("expression")
    },
    helpers: renderHelpers()
  }));
}

function renderSources() {
  applyPagePatch(renderSourcesPage({
    sources: items("source"),
    helpers: renderHelpers()
  }));
}

function renderSentences() {
  const sentenceEntries = core.rootSentenceEntries(allDailyEntriesForSentences());
  applyPagePatch(renderSentencesPage({
    caption: searchTerm ? `검색 결과 ${sentenceEntries.length}개` : `오늘 공부에서 저장한 문장 ${sentenceEntries.length}개`,
    sentences: sentenceEntries,
    helpers: {
      ...renderHelpers(),
      linkedEntriesForSentence: linkedEntriesForAnySentence
    }
  }));
}

function renderWordFilters() {
  renderSelectOptions("wordPartFilter", "전체 품사", partOptions);
  renderSelectOptions("wordScriptFilter", "전체 문자", scriptOptions);
  renderSelectOptions("wordReviewFilter", "전체 복습", reviewOptions);
}

function renderWords() {
  const part = byId("wordPartFilter").value;
  const script = byId("wordScriptFilter").value;
  const review = byId("wordReviewFilter").value;
  const rows = core.sortWords(items("word").filter(item =>
    (!part || item.part === part) &&
    (!script || item.script === script) &&
    (!review || item.review === review)
  ), wordSort);
  renderWordSortHeaders();
  applyPagePatch(renderWordsPage({ rows, helpers: renderHelpers() }));
}

function renderCards(kind, targetId) {
  applyPagePatch(renderStudyCardsPage({
    kind,
    targetId,
    list: items(kind),
    helpers: renderHelpers()
  }));
}

function renderKanji() {
  applyPagePatch(renderKanjiPage({
    kanji: items("kanji"),
    helpers: renderHelpers()
  }));
}

function renderWordQuiz() {
  applyPagePatch(renderWordQuizPage({
    quiz: wordQuiz,
    helpers: renderHelpers()
  }));
  updateQuizSessionView();
}

function renderKanjiQuiz() {
  applyPagePatch(renderKanjiQuizPage({
    quiz: kanjiQuiz,
    helpers: renderHelpers()
  }));
  updateQuizSessionView();
}

function updateQuizSessionView() {
  const grid = byId("quizSelectGrid");
  const exitBtn = byId("quizExitBtn");
  if (!grid || !exitBtn) {
    return;
  }
  const sessionActive = Boolean(wordQuiz.question || kanjiQuiz.question);
  grid.hidden = sessionActive;
  exitBtn.hidden = !sessionActive;
}

function exitQuizSession() {
  exitQuizSessionImpl(quizCtx());
}

function renderReview() {
  reviewQueueDrafts = core.pruneReviewQueueDrafts({
    items: state.items,
    drafts: reviewQueueDrafts
  });
  applyPagePatch(renderReviewPage({
    reviewItems: core.reviewItems(state.items, searchTerm),
    helpers: renderHelpers()
  }));
}

function renderStats() {
  applyPagePatch(renderStatsPage({
    stats: core.studyStats(state)
  }));
}

function renderTaxonomy() {
  applyPagePatch(renderTaxonomyPage({
    partOptions,
    scriptOptions,
    selectedPart: byId("wordPartFilter").value,
    selectedScript: byId("wordScriptFilter").value,
    helpers: renderHelpers()
  }));
}

function renderQuickFilters() {
  applyPagePatch(renderQuickFiltersPage({
    counts: core.quickFilterCounts(state, searchTerm)
  }));
}

function renderQuizSettings() {
  applyQuizQuestionFontSize();
  applyPagePatch(renderQuizSettingsPage({
    quizQuestionFontSize,
    quizReviewOnCorrect,
    quizCorrectReview,
    scheduledReviewOptions,
    helpers: renderHelpers()
  }));
  byId("quizReviewOnCorrectCheckbox").checked = quizReviewOnCorrect;
}

function renderStorageStatus() {
  applyPagePatch({
    text: {
      appDataPath: store.paths.appDataDir,
      sqlitePath: "사용 안 함",
      exportPath: store.paths.exportsDir,
      backupPath: store.paths.backupsDir,
      storageStatus
    }
  });
}

function renderAccountStatus() {
  renderAccountStatusImpl(syncCtx());
}

async function signInWithGoogle() {
  await signInWithGoogleImpl(syncCtx());
}

async function signOutOfAccount() {
  await signOutOfAccountImpl(syncCtx());
}

function renderDate() {
  byId("todayDate").textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(new Date());
}

function renderToc(pageId) {
  const tocItems = tocByPage[pageId] || [];
  byId("tocList").innerHTML = tocItems.map((item, index) => `
    <a class="toc-item ${index === 0 ? "active" : ""}" href="#${item[0]}">
      <span>${item[1]}</span>
      ${item[2] ? `<span class="count">${item[2]}</span>` : ""}
    </a>
  `).join("");
}

function renderSelectOptions(selectId, allLabel, options) {
  const select = byId(selectId);
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">${allLabel}</option>`,
    ...options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
  ].join("");
  select.value = options.includes(currentValue) ? currentValue : "";
}

function renderWordSortHeaders() {
  document.querySelectorAll("[data-word-sort]").forEach(button => {
    const isActive = button.dataset.wordSort === wordSort.key;
    button.classList.toggle("active", isActive && Boolean(wordSort.direction));
    button.setAttribute("aria-sort", isActive && wordSort.direction ? (wordSort.direction === "asc" ? "ascending" : "descending") : "none");
  });
  document.querySelectorAll("[data-word-sort-indicator]").forEach(indicator => {
    const isActive = indicator.dataset.wordSortIndicator === wordSort.key;
    indicator.textContent = isActive && wordSort.direction === "asc" ? "▲" : isActive && wordSort.direction === "desc" ? "▼" : "";
  });
}

function updatePageVisibility() {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("hidden-page", page.id !== currentPage);
  });
  document.querySelectorAll(".tab").forEach(tab => {
    const active = tab.dataset.page === currentPage;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  });
}

function updateDailyEntryPlaceholder() {
  const input = byId("dailyEntryInput");
  if (!input) {
    return;
  }
  input.placeholder = aiSentenceAnalysisEnabled
    ? aiSentenceAnalysisPlaceholder
    : dailyEntryInputDefaultPlaceholder;
}

function updateManualEntryPlaceholder() {
  const checked = document.querySelector("input[name='dailyManualKind']:checked");
  const kind = checked?.value || "word";
  byId("manualEntryInput").placeholder = manualEntryPlaceholders[kind] || manualEntryPlaceholders.word;
}

function revealManualEntryInput() {
  byId("manualEntryInput").hidden = false;
  byId("addManualEntryBtn").hidden = false;
}

function hideManualEntryInput() {
  byId("manualEntryInput").hidden = true;
  byId("addManualEntryBtn").hidden = true;
}

function openPage(pageId) {
  if (!byId(pageId)) {
    return;
  }
  currentPage = pageId;
  renderAll();
  byId(pageId).scrollIntoView({ block: "start" });
}

function applyQuickFilter(filter) {
  if (filter === "review") {
    setSearch("");
    openPage("review");
    return;
  }
  if (filter === "N3") {
    setSearch("N3");
    openPage("words");
    return;
  }
  if (filter === "source") {
    setSearch("뉴스");
    openPage("words");
    return;
  }
  if (filter === "pending") {
    setSearch("");
    openPage("home");
    byId("home-today").scrollIntoView({ block: "start" });
  }
}

async function addTask() {
  const title = window.prompt("할 일 제목을 입력하세요.");
  if (!title) {
    return;
  }
  state = await store.addTask({
    id: nextId("task"),
    title,
    note: "웹 미리보기에서 추가한 할 일",
    tag: "일반",
    done: false,
    studyDate: selectedDate
  });
  renderAll();
}

async function toggleTask(id) {
  const task = state.tasks.find(candidate => candidate.id === id);
  if (!task) {
    return;
  }
  state = await store.updateTaskDone(task.id, !task.done, selectedDate);
  renderAll();
}

async function addDailyEntryFromInput() {
  if (aiSentenceAnalysisInProgress) {
    return;
  }
  const input = byId("dailyEntryInput");
  const rawInput = input.value.trim();
  if (!rawInput) {
    input.focus();
    return;
  }

  let rawText = rawInput;
  if (aiSentenceAnalysisEnabled) {
    if (!accountSession) {
      setAiSentenceAnalysisStatus("로그인 유저만 사용 가능합니다.");
      return;
    }

    setAiSentenceAnalysisBusy(true);
    setAiSentenceAnalysisStatus("AI 문장 분석 중입니다.");
    try {
      const invokeResult = await sync.invokeFunction("analyze-sentence", { sentence: rawInput });
      if (invokeResult.skipped) {
        const message = invokeResult.reason === "no-session"
          ? "로그인 유저만 사용 가능합니다."
          : invokeResult.reason === "disabled"
            ? "Supabase 환경변수가 설정되지 않았습니다."
            : `AI 분석 요청이 실패했습니다: ${invokeResult.error?.message || invokeResult.reason}`;
        setAiSentenceAnalysisStatus(message);
        return;
      }

      const result = invokeResult.data;
      if (!result?.ok) {
        setAiSentenceAnalysisStatus(result?.message || "AI 분석 요청이 실패했습니다.");
        return;
      }
      rawText = result.rawText;
      setAiSentenceAnalysisStatus("AI 분석 결과를 문장 카드에 추가했습니다.");
    } catch (error) {
      const message = error.message || String(error);
      setAiSentenceAnalysisStatus(`AI 분석 요청이 실패했습니다: ${message}`);
      return;
    } finally {
      setAiSentenceAnalysisBusy(false);
    }
  }

  state = await store.addDailyEntry({
    studyDate: selectedDate,
    kind: "sentence",
    rawText
  });
  state = await store.saveStudyLog({
    studyDate: selectedDate,
    minutes: Math.min(90, Number(state.studyLog.minutes || 0) + 10),
    summary: state.studyLog.summary || "오늘 추가한 문장을 복습하세요.",
    note: state.studyLog.note || ""
  });
  input.value = "";
  if (!aiSentenceAnalysisEnabled) {
    setAiSentenceAnalysisStatus("");
  }
  renderAll();
}

function setAiSentenceAnalysisBusy(busy) {
  aiSentenceAnalysisInProgress = busy;
  const addButton = byId("addDailyEntryBtn");
  const checkbox = byId("aiSentenceAnalysisCheckbox");
  if (addButton) {
    addButton.disabled = busy;
    addButton.textContent = busy ? "분석 중" : "문장 추가";
  }
  if (checkbox) {
    checkbox.disabled = busy;
  }
}

function setAiSentenceAnalysisStatus(message) {
  const element = byId("aiSentenceAnalysisStatus");
  if (element) {
    element.textContent = message;
  }
}

async function addManualEntryFromInput() {
  const input = byId("manualEntryInput");
  const rawText = input.value.trim();
  const kind = document.querySelector("input[name='dailyManualKind']:checked")?.value || "word";
  if (!rawText) {
    return;
  }
  state = await store.addDailyEntry({
    studyDate: selectedDate,
    kind,
    rawText
  });
  input.value = "";
  renderAll();
}

async function registerLearnedEntries() {
  const targets = dailyEntriesForSelectedDate().filter(entry =>
    ["word", "grammar", "expression"].includes(entry.kind) && !entry.registered
  );
  if (!targets.length) {
    window.alert("등록할 새 단어, 새 문법, 새 표현이 없습니다.");
    return;
  }

  const response = await store.registerDailyEntries(targets.map(entry => entry.id), selectedDate);
  state = response.state;
  const registeredCount = response.result.registered.length;
  const duplicateCount = response.result.duplicates.length;
  window.alert(`등록 ${registeredCount}개${duplicateCount ? `, 중복 ${duplicateCount}개` : ""}`);
  renderAll();
}

async function promptAddItem(kind) {
  const title = window.prompt(`${kindLabels[kind] || "항목"} 제목을 입력하세요.`);
  if (!title) {
    return;
  }
  const reading = kind === "source" ? "자료" : window.prompt("읽기/분류를 입력하세요.", "") || "";
  const meaning = window.prompt("뜻/요약을 입력하세요.", "") || "";
  const sourceLink = kind === "source" ? normalizeSourceLinkInput(window.prompt("자료 링크를 입력하세요.", "") || "") : "웹 미리보기";
  if (sourceLink === null) {
    return;
  }
  const sourceProgress = kind === "source" ? normalizeSourceProgressInput(window.prompt("자료 진행률을 입력하세요. (0-100)", "")) : "";
  state = await store.upsertItem({
    id: nextId(kind),
    kind,
    title,
    reading,
    meaning,
    level: kind === "source" ? "웹" : "N3",
    part: kind === "word" ? "명사" : "",
    script: kind === "word" ? "한자+히라가나" : "",
    review: kind === "source" ? "" : "대기",
    source: sourceLink,
    note: "",
    kanji: sourceProgress,
    studyDate: selectedDate
  });
  renderAll();
  openPage(pageForKind(kind));
}

function normalizeSourceLinkInput(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) {
    return "";
  }
  const url = safeSourceUrl(rawUrl);
  if (!url) {
    window.alert("자료 링크는 http:// 또는 https:// URL만 사용할 수 있습니다.");
    return null;
  }
  return url;
}

async function promptEditItem(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item) {
    return;
  }
  const title = window.prompt("제목을 수정하세요.", item.title);
  if (!title) {
    return;
  }
  const meaning = window.prompt("뜻/요약을 수정하세요.", item.meaning || "") || "";
  const payload = {
    ...item,
    title,
    meaning,
    studyDate: selectedDate
  };
  if (item.kind === "source") {
    const sourceLinkInput = window.prompt("자료 링크를 수정하세요.", safeSourceUrl(item.source) || "");
    const sourceProgress = window.prompt("자료 진행률을 수정하세요. (0-100)", sourceProgressInputValue(item));
    if (sourceLinkInput !== null) {
      const sourceLink = normalizeSourceLinkInput(sourceLinkInput);
      if (sourceLink === null) {
        return;
      }
      payload.source = sourceLink;
    }
    if (sourceProgress !== null) {
      payload.kanji = normalizeSourceProgressInput(sourceProgress);
    }
  }
  state = await store.upsertItem(payload);
  renderAll();
}

function sourceProgressInputValue(item) {
  const progress = core.sourceProgress(item);
  return progress > 0 ? String(progress) : "";
}

function normalizeSourceProgressInput(value) {
  const textValue = String(value ?? "").trim();
  if (!textValue) {
    return "";
  }
  const progress = Number(textValue);
  if (!Number.isFinite(progress)) {
    return "";
  }
  return String(Math.min(100, Math.max(0, Math.round(progress))));
}

async function deleteItem(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item || !window.confirm(`${item.title} 항목을 삭제할까요?`)) {
    return;
  }
  state = await store.deleteItem(id, selectedDate);
  reviewQueueDrafts.delete(id);
  renderAll();
}

async function deleteDailyEntry(id) {
  const entry = (state.allDailyEntries || state.dailyEntries).find(candidate => candidate.id === id);
  if (!entry || !window.confirm(`${entry.title} 기록을 삭제할까요?`)) {
    return;
  }
  state = await store.deleteDailyEntry(id, selectedDate);
  renderAll();
}

async function cycleReview(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item) {
    return;
  }
  const currentIndex = reviewOptions.indexOf(item.review || "대기");
  const nextReview = reviewOptions[((currentIndex >= 0 ? currentIndex : reviewOptions.length - 1) + 1) % reviewOptions.length];
  state = await store.updateItemReview(id, nextReview, selectedDate);
  renderAll();
}

function startQuiz(kind) {
  startQuizSession(kind, quizCtx());
}

async function submitQuizChoice(kind, selectedAnswer) {
  await submitQuizChoiceImpl(kind, selectedAnswer, quizCtx());
}

async function completeSelectedReview() {
  const targets = core.reviewCompletionTargets({
    items: state.items,
    drafts: reviewQueueDrafts,
    searchTerm
  });
  if (!targets.length) {
    window.alert("복습 완료로 변경할 항목을 먼저 선택하세요.");
    return;
  }
  state = await store.completeReview(targets, selectedDate);
  reviewQueueDrafts = new Map();
  renderAll();
}

async function resetSampleData() {
  if (!window.confirm("샘플 데이터를 초기 상태로 되돌릴까요?")) {
    return;
  }
  state = await store.resetSampleData();
  resetTransientUiState();
  storageStatus = "샘플 데이터로 초기화했습니다.";
  renderAll();
}

async function downloadBackup() {
  try {
    const exported = await store.exportData();
    const payload = {
      format: backupFormat,
      version: backupVersion,
      exportedAt: new Date().toISOString(),
      data: exported.data
    };
    const fileName = backupFileName();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStorageStatus(`백업 다운로드를 시작했습니다: ${fileName}`);
  } catch (error) {
    const message = error.message || String(error);
    setStorageStatus(`백업 다운로드 실패: ${message}`);
    window.alert(`백업 다운로드 실패\n${message}`);
  }
}

async function loadBackupFromFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    if (!window.confirm("현재 브라우저에 저장된 일본어 공부 데이터를 선택한 백업으로 교체할까요?")) {
      return;
    }
    const backup = parseBackupFile(await file.text());
    state = await store.importFullBackup(backup);
    resetTransientUiState();
    storageStatus = `백업 로드 완료: ${file.name}`;
    renderAll();
  } catch (error) {
    const message = error.message || String(error);
    setStorageStatus(`백업 로드 실패: ${message}`);
    window.alert(`백업 로드 실패\n${message}`);
  } finally {
    input.value = "";
  }
}

async function mergeBackupFromFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    if (!window.confirm("선택한 백업 데이터를 현재 데이터에 추가할까요? 중복 데이터는 제외됩니다.")) {
      return;
    }
    const backup = parseBackupFile(await file.text());
    const current = await store.exportData();
    const result = mergeBackupData(backupData(current), backupData(backup), selectedDate || todayKey());
    state = await store.importFullBackup({ data: result.data });
    resetTransientUiState();
    storageStatus = `백업 추가 완료: ${file.name} · 추가 ${result.summary.added}개, 갱신 ${result.summary.updated}개, 중복 제외 ${result.summary.skipped}개`;
    renderAll();
  } catch (error) {
    const message = error.message || String(error);
    setStorageStatus(`백업 추가 실패: ${message}`);
    window.alert(`백업 추가 실패\n${message}`);
  } finally {
    input.value = "";
  }
}

function resetTransientUiState() {
  selectedDate = state.selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  searchTerm = "";
  wordSort = { key: "", direction: "" };
  wordQuiz = emptyQuiz();
  kanjiQuiz = emptyQuiz();
  reviewQueueDrafts = new Map();
  byId("globalSearch").value = "";
}

function backupFileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replaceAll(":", "");
  return `nihongo-study-backup-${stamp}.json`;
}

function setStorageStatus(message) {
  storageStatus = message;
  const element = byId("storageStatus");
  if (element) {
    element.textContent = message;
  }
}

function moveCalendarMonth(offset) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  calendarMonth = toDateKey(next).slice(0, 7);
  renderCalendar();
}

function jumpToSentence(id, sourceDate) {
  selectedDate = sourceDate || selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  openPage("today");
  window.setTimeout(() => {
    byId(`daily-entry-${id}`)?.scrollIntoView({ block: "center" });
  }, 0);
}

function speak(text) {
  if (!window.speechSynthesis || !text) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  window.speechSynthesis.speak(utterance);
}

function applyQuizQuestionFontSize() {
  document.documentElement.style.setProperty("--quiz-question-font-size", `${quizQuestionFontSize}px`);
}

function setSearch(value) {
  searchTerm = String(value || "").trim();
  byId("globalSearch").value = searchTerm;
}

function applyPagePatch(patch) {
  applySharedPagePatch(patch, { document });
}

function renderHelpers() {
  return {
    badgeClassByKind,
    core,
    escapeHtml,
    highlight,
    kindLabels,
    reviewQueueStatusText,
    reviewQueueReview,
    reviewStatusText: core.reviewStatusText
  };
}

function items(kind) {
  return core.itemsByKind(state.items, kind, searchTerm);
}

function dailyEntriesForSelectedDate() {
  return state.dailyEntries.filter(entry => !entry.studyDate || entry.studyDate === selectedDate);
}

function allDailyEntriesForSentences() {
  const entries = state.allDailyEntries || state.dailyEntries;
  if (!searchTerm) {
    return entries;
  }
  const normalizedSearch = searchTerm.toLowerCase();
  return entries.filter(entry => [
    entry.title,
    entry.reading,
    entry.meaning,
    entry.studyDate
  ].some(value => String(value || "").toLowerCase().includes(normalizedSearch)));
}

function dailyEntriesByKind(kind) {
  return core.dailyEntriesByKind(dailyEntriesForSelectedDate(), kind);
}

function linkedEntriesForSentence(kind, sentenceId) {
  return core.linkedEntriesForSentence(dailyEntriesForSelectedDate(), kind, sentenceId);
}

function linkedEntriesForAnySentence(kind, sentenceId) {
  return core.linkedEntriesForSentence(state.allDailyEntries || state.dailyEntries, kind, sentenceId);
}

function reviewQueueStatusText(item) {
  return core.reviewQueueStatusText({
    item,
    drafts: reviewQueueDrafts,
    todayKey: selectedDate
  });
}

function reviewQueueReview(item) {
  return core.reviewQueueReview(item, reviewQueueDrafts);
}

function pageForKind(kind) {
  if (kind === "source") {
    return "sources";
  }
  if (kind === "expression") {
    return "expressions";
  }
  return kind === "word" ? "words" : kind;
}

function nextId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function highlight(value) {
  return escapeHtml(value);
}

function quizCtx() {
  return {
    byId,
    getState: () => state,
    setState: nextState => { state = nextState; },
    store,
    selectedDate,
    wordQuizMode,
    kanjiQuizMode,
    quizReviewOnCorrect,
    quizCorrectReview,
    getWordQuiz: () => wordQuiz,
    setWordQuiz: nextQuiz => { wordQuiz = nextQuiz; },
    getKanjiQuiz: () => kanjiQuiz,
    setKanjiQuiz: nextQuiz => { kanjiQuiz = nextQuiz; },
    renderWordQuiz,
    renderKanjiQuiz,
    renderStats,
    renderQuickFilters
  };
}

function syncCtx() {
  return {
    byId,
    sync,
    getAccountSession: () => accountSession,
    setAccountSession: nextSession => { accountSession = nextSession; },
    getAiSentenceAnalysisEnabled: () => aiSentenceAnalysisEnabled,
    setAiSentenceAnalysisEnabled: enabled => { aiSentenceAnalysisEnabled = enabled; },
    updateDailyEntryPlaceholder,
    renderAccountStatus,
    getState: () => state,
    setState: nextState => { state = nextState; },
    resetTransientUiState,
    renderAll
  };
}

async function start() {
  renderAppShell(byId);
  bindEvents();
  try {
    await store.initDatabase();
    state = await store.getState(selectedDate);
    selectedDate = state.selectedDate;
    calendarMonth = selectedDate.slice(0, 7);
    renderAll();
  } catch (error) {
    byId("app").innerHTML = `
      <main class="main">
        <section class="panel section">
          <h1>IndexedDB 초기화 실패</h1>
          <p class="muted">${escapeHtml(error.message || String(error))}</p>
        </section>
      </main>
    `;
    return;
  }

  wireAuthChange(syncCtx());
}

start();
