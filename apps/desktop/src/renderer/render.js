let uiPages = null;

async function initUiPages() {
  uiPages = await import("../../../../packages/ui/render.js");
}

function renderAll() {
  renderDate();
  renderToc(currentPage);
  renderHome();
  renderCalendar();
  renderTasks();
  renderToday();
  renderLearnedSections();
  renderSources();
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
  renderStoragePaths();
}

function applyPagePatch(patch = {}) {
  uiPages.applyPagePatch(patch, { getElementById: byId });
}

function renderHelpers() {
  return {
    badgeClassByKind,
    core,
    escapeHtml,
    highlight,
    kindLabels,
    reviewQueueStatusText,
    reviewStatusText
  };
}

function renderDate() {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  byId("todayDate").textContent = formatter.format(new Date());
}

function renderToc(pageId) {
  const list = byId("tocList");
  const tocItems = tocByPage[pageId] || [];
  list.innerHTML = tocItems.map((item, index) => `
    <a class="toc-item ${index === 0 ? "active" : ""}" href="#${item[0]}">
      <span>${item[1]}</span>
      ${item[2] ? `<span class="count">${item[2]}</span>` : ""}
    </a>
  `).join("");
}

function renderHome() {
  applyPagePatch(uiPages.renderHomePage({
    overview: core.homeOverview(state, searchTerm),
    helpers: renderHelpers()
  }));
}

function renderTasks() {
  applyPagePatch(uiPages.renderTasksPage({
    tasks: state.tasks,
    helpers: renderHelpers()
  }));
}

function renderToday() {
  updateManualEntryPlaceholder();
  applyPagePatch(uiPages.renderTodayPage({
    selectedDate,
    sentenceEntries: core.rootSentenceEntries(state.dailyEntries),
    helpers: {
      ...renderHelpers(),
      entryToCandidate,
      linkedEntriesForSentence
    }
  }));
}

function dailyEntriesByKind(kind) {
  return core.dailyEntriesByKind(state.dailyEntries, kind);
}

function updateManualEntryPlaceholder() {
  const input = byId("manualEntryInput");
  if (!input) {
    return;
  }
  const kind = document.querySelector("input[name='dailyManualKind']:checked")?.value || "word";
  input.placeholder = manualEntryPlaceholders[kind] || manualEntryPlaceholders.word;
}

function renderCalendar() {
  applyPagePatch(uiPages.renderCalendarPage({
    calendarMonth,
    selectedDate,
    studyDays: state.studyDays,
    toDateKey
  }));
}

function linkedEntriesForSentence(kind, sentenceId) {
  return core.linkedEntriesForSentence(state.dailyEntries, kind, sentenceId);
}

function entryToCandidate(entry) {
  return core.dailyEntryToCandidate(entry);
}

function renderLearnedSections() {
  applyPagePatch(uiPages.renderLearnedSectionsPage({
    entriesByKind: {
      word: dailyEntriesByKind("word"),
      grammar: dailyEntriesByKind("grammar"),
      expression: dailyEntriesByKind("expression")
    },
    helpers: renderHelpers()
  }));
}

function renderSources() {
  applyPagePatch(uiPages.renderSourcesPage({
    sources: items("source"),
    helpers: renderHelpers()
  }));
}

function renderWords() {
  const part = byId("wordPartFilter").value;
  const script = byId("wordScriptFilter").value;
  const review = byId("wordReviewFilter").value;
  renderWordSortHeaders();
  const rows = sortedWords(items("word").filter(item =>
    (!part || item.part === part) &&
    (!script || item.script === script) &&
    (!review || item.review === review)
  ));
  applyPagePatch(uiPages.renderWordsPage({
    rows,
    helpers: renderHelpers()
  }));
}

function renderWordFilters() {
  renderSelectOptions("wordPartFilter", "전체 품사", partOptions);
  renderSelectOptions("wordScriptFilter", "전체 문자", scriptOptions);
  renderSelectOptions("wordReviewFilter", "전체 복습", reviewOptions);
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
    const label = isActive && wordSort.direction === "asc"
      ? "오름차순 정렬됨"
      : isActive && wordSort.direction === "desc"
        ? "내림차순 정렬됨"
        : "정렬 없음";
    button.classList.toggle("active", isActive && Boolean(wordSort.direction));
    button.setAttribute("aria-sort", isActive && wordSort.direction ? (wordSort.direction === "asc" ? "ascending" : "descending") : "none");
    button.title = label;
  });
  document.querySelectorAll("[data-word-sort-indicator]").forEach(indicator => {
    const isActive = indicator.dataset.wordSortIndicator === wordSort.key;
    indicator.textContent = isActive && wordSort.direction === "asc" ? "▲" : isActive && wordSort.direction === "desc" ? "▼" : "";
  });
}

function renderCards(kind, targetId) {
  applyPagePatch(uiPages.renderStudyCardsPage({
    kind,
    targetId,
    list: items(kind),
    helpers: renderHelpers()
  }));
}

function renderKanji() {
  applyPagePatch(uiPages.renderKanjiPage({
    kanji: items("kanji"),
    helpers: renderHelpers()
  }));
}

function renderReview() {
  applyPagePatch(uiPages.renderReviewPage({
    reviewItems: reviewItems(),
    helpers: renderHelpers()
  }));
}

function renderStats() {
  applyPagePatch(uiPages.renderStatsPage({
    stats: core.studyStats(state)
  }));
}

function renderTaxonomy() {
  applyPagePatch(uiPages.renderTaxonomyPage({
    partOptions,
    scriptOptions,
    selectedPart: byId("wordPartFilter").value,
    selectedScript: byId("wordScriptFilter").value,
    helpers: renderHelpers()
  }));
}

function renderWordQuiz() {
  applyPagePatch(uiPages.renderWordQuizPage({
    quiz: wordQuiz,
    helpers: renderHelpers()
  }));
}

function renderKanjiQuiz() {
  applyPagePatch(uiPages.renderKanjiQuizPage({
    quiz: kanjiQuiz,
    helpers: renderHelpers()
  }));
}

function renderQuickFilters() {
  applyPagePatch(uiPages.renderQuickFiltersPage({
    counts: core.quickFilterCounts(state, searchTerm)
  }));
}

function renderStoragePaths() {
  applyPagePatch(uiPages.renderStoragePathsPage({ storagePaths }));
}

function renderQuizSettings() {
  applyQuizQuestionFontSize();
  applyPagePatch(uiPages.renderQuizSettingsPage({
    quizQuestionFontSize,
    quizReviewOnCorrect,
    quizCorrectReview,
    scheduledReviewOptions,
    helpers: renderHelpers()
  }));

  const reviewCheckbox = byId("quizReviewOnCorrectCheckbox");
  if (reviewCheckbox) {
    reviewCheckbox.checked = quizReviewOnCorrect;
  }
}
