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

const tocByPage = {
  home: [["home-overview", "오늘 개요", ""], ["home-progress", "진행률", ""], ["home-stats", "요약 지표", "4"], ["home-today", "오늘 할 일", ""], ["home-recent", "최근 추가", ""], ["home-queue", "복습 큐", ""]],
  today: [["today-log", "문장 추가", ""], ["today-calendar", "학습 캘린더", ""], ["today-sentences", "문장 카드", ""], ["today-learned", "오늘 배운 항목", ""]],
  sources: [["sources-library", "자료 라이브러리", ""]],
  words: [["words-list", "단어 목록", ""], ["words-taxonomy", "품사·문자 분류", ""]],
  grammar: [["grammar-detail", "문법 상세", ""]],
  expressions: [["expressions-list", "표현 목록", ""]],
  kanji: [["kanji-grid", "한자 목록", ""]],
  review: [["review-queue", "복습 큐", ""]],
  stats: [["stats-overview", "주간 통계", ""]],
  settings: [["settings-general", "일반 설정", ""]]
};

const kindLabels = {
  word: "단어",
  grammar: "문법",
  expression: "표현",
  kanji: "한자",
  sentence: "문장",
  source: "자료"
};

const badgeClassByKind = {
  word: "red",
  grammar: "blue",
  expression: "green",
  kanji: "yellow",
  sentence: "purple",
  source: "green"
};

const partOptions = ["명사", "대명사", "동사", "い형용사", "な형용사", "부사", "조사", "조동사", "접속사", "감탄사", "표현", "동사표현", "형용사표현", "부사표현", "문법표현", "サ변동사"];
const scriptOptions = ["한자", "히라가나", "가타카나", "한자+히라가나", "한자+가타카나", "혼합"];
const manualEntryPlaceholders = {
  word: "`私` (わたし) 나, 저 | 한자=私 (사사 사) | 품사=대명사 | 문자=한자",
  grammar: "`したかな` 동사 'する'의 과거형 'した'에 의문을 나타내는 종조사 'かな'가 붙어, 자신의 행동을 되돌아보며 자문하는 뉘앙스를 나타냅니다.",
  expression: "`お疲れさまです` (おつかれさまです) 수고하셨습니다. 직장이나 모임에서 인사, 감사, 마무리 인사로 넓게 쓰는 표현입니다."
};

function byId(id) {
  return document.getElementById(id);
}

function applyState(nextState) {
  state = nextState;
  selectedDate = nextState.selectedDate || selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  renderAll();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function renderAll() {
  renderDate();
  renderToc(currentPage);
  renderHome();
  renderCalendar();
  renderTasks();
  renderToday();
  renderLearnedSections();
  renderSources();
  renderWords();
  renderCards("grammar", "grammarCards");
  renderCards("expression", "expressionCards");
  renderKanji();
  renderReview();
  renderStats();
  renderTaxonomy();
  renderQuickFilters();
  renderStoragePaths();
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
  const items = tocByPage[pageId] || [];
  list.innerHTML = items.map((item, index) => `
    <a class="toc-item ${index === 0 ? "active" : ""}" href="#${item[0]}">
      <span>${item[1]}</span>
      ${item[2] ? `<span class="count">${item[2]}</span>` : ""}
    </a>
  `).join("");
}

function renderHome() {
  const progress = Math.min(100, Math.round((Number(state.studyLog.minutes || 0) / 90) * 100));
  byId("progressPercent").textContent = `${progress}%`;
  byId("progressRing").style.background = `conic-gradient(var(--accent) ${progress * 3.6}deg, var(--line) 0deg)`;
  byId("progressText").textContent = progress >= 100 ? "오늘 목표를 달성했습니다." : `목표까지 ${Math.max(0, 90 - Number(state.studyLog.minutes || 0))}분 남았습니다.`;
  byId("todayDoneCount").textContent = `${state.dailyEntries?.length || 0}개`;
  byId("newItemCount").textContent = `${state.items.filter(item => item.kind !== "source").length}개`;
  byId("reviewItemCount").textContent = `${reviewItems().length}개`;
  byId("studyMinutes").textContent = `${Number(state.studyLog.minutes || 0)}분`;
  byId("focusText").textContent = state.studyLog.summary || "새 항목을 추가하고 복습 큐를 정리하세요.";

  const recent = state.items.filter(item => item.kind !== "source").slice(0, 3);
  byId("recentItems").innerHTML = recent.length ? recent.map(renderStudyCard).join("") : empty("최근 추가 항목이 없습니다.");

  const groups = ["word", "grammar", "expression", "kanji"].map(kind => {
    const count = state.items.filter(item => item.kind === kind && ["오늘", "대기"].includes(item.review)).length;
    return `<tr><td>${kindLabels[kind]}</td><td>${count}</td><td><span class="badge ${count ? "red" : "green"}">${count ? "복습 필요" : "정리됨"}</span></td></tr>`;
  });
  byId("reviewSummary").innerHTML = groups.join("");
}

function renderTasks() {
  byId("taskList").innerHTML = state.tasks.length ? state.tasks.map(task => `
    <div class="task ${task.done ? "done" : ""}" data-task-id="${task.id}">
      <button class="check" data-toggle-task="${task.id}" aria-label="완료 전환"></button>
      <div><strong>${highlight(task.title)}</strong><span>${highlight(task.note)}</span></div>
      <span class="badge ${task.done ? "green" : "red"}">${escapeHtml(task.tag)}</span>
    </div>
  `).join("") : empty("오늘 할 일이 없습니다.");
}

function renderToday() {
  byId("selectedDateTitle").textContent = `${selectedDate} 문장 추가`;
  updateManualEntryPlaceholder();
  const sentenceEntries = dailyEntriesByKind("sentence").filter(entry => !entry.parentId);
  byId("dailyEntryCards").innerHTML = sentenceEntries.length
    ? sentenceEntries.map(renderDailyEntryCard).join("")
    : empty("이 날짜에 추가한 기록이 없습니다. 위 입력창에 문장, 단어, 문법, 표현을 붙여넣어 보세요.");
}

function dailyEntriesByKind(kind) {
  return (state.dailyEntries || []).filter(entry => entry.kind === kind);
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
  byId("calendarTitle").textContent = `${calendarMonth.replace("-", ".")} 학습 캘린더`;
  const days = new Map((state.studyDays || []).map(day => [day.studyDate, day]));
  const [year, month] = calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  byId("calendarGrid").innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    const day = days.get(key);
    const isSelected = key === selectedDate;
    const isOtherMonth = date.getMonth() !== month - 1;
    return `
      <button class="calendar-day ${isSelected ? "selected" : ""} ${isOtherMonth ? "other-month" : ""}" data-calendar-date="${key}">
        <strong>${date.getDate()}</strong>
        ${day ? `<span>${day.minutes || 0}분 · ${day.entryCount || 0}개</span>` : ""}
      </button>
    `;
  }).join("");
}

function renderDailyEntryCard(entry) {
  const parsed = entry.parsed || {};
  const childWords = linkedEntriesForSentence("word", entry.id);
  const childGrammar = linkedEntriesForSentence("grammar", entry.id);
  const childExpressions = linkedEntriesForSentence("expression", entry.id);
  return `
    <article class="study-card daily-entry-card" id="daily-entry-${entry.id}" data-daily-entry-id="${entry.id}">
      <div class="daily-entry-card-head">
        <div class="daily-entry-tags">
          <span class="badge ${badgeClassByKind[entry.kind] || "green"}">${kindLabels[entry.kind] || entry.kind}</span>
          ${entry.registered ? `<span class="badge green">전체 등록됨</span>` : `<span class="badge yellow">오늘 기록</span>`}
          <button class="danger-btn tiny-action-btn" data-delete-daily-entry="${entry.id}">삭제</button>
        </div>
      </div>
      <h3 class="daily-sentence-title">${speakerButton(entry.title)}<span>${highlight(entry.title)}</span></h3>
      <div class="daily-reading-meaning">
        <section>
          <span>읽기</span>
          <p>${highlight(entry.reading || "-")}</p>
        </section>
        <section>
          <span>해석</span>
          <p>${highlight(entry.meaning || "-")}</p>
        </section>
      </div>
      ${childWords.length ? `<section class="candidate-section"><div class="candidate-title">새 단어</div><div class="word-candidate-grid">${childWords.map(entryToCandidate).map(renderWordCandidate).join("")}</div></section>` : ""}
      ${childGrammar.length ? `<section class="candidate-section"><div class="candidate-title">새 문법</div><div class="grammar-candidate-list">${childGrammar.map(renderGrammarCandidate).join("")}</div></section>` : ""}
      ${childExpressions.length ? `<section class="candidate-section"><div class="candidate-title">새 표현</div><div class="grammar-candidate-list">${childExpressions.map(renderGrammarCandidate).join("")}</div></section>` : ""}
    </article>
  `;
}

function linkedEntriesForSentence(kind, sentenceId) {
  return dailyEntriesByKind(kind).filter(item =>
    (item.sourceSentences || []).some(sentence => sentence.id === sentenceId) || item.parentId === sentenceId
  );
}

function entryToCandidate(entry) {
  return {
    title: entry.title,
    reading: entry.reading,
    meaning: entry.meaning,
    kanji: entry.parsed?.kanji || "",
    part: entry.parsed?.part || "",
    script: entry.parsed?.script || ""
  };
}

function renderLearnedSections() {
  renderLearnedKind("word", "learnedWordCards");
  renderLearnedKind("grammar", "learnedGrammarCards");
  renderLearnedKind("expression", "learnedExpressionCards");
}

function renderLearnedKind(kind, targetId) {
  const entries = dailyEntriesByKind(kind);
  byId(targetId).innerHTML = entries.length
    ? entries.map(renderLearnedCard).join("")
    : empty(`${kindLabels[kind]} 기록이 없습니다.`);
}

function renderLearnedCard(entry) {
  const parsed = entry.parsed || {};
  const sourceSentences = entry.sourceSentences?.length
    ? entry.sourceSentences
    : entry.parentId
      ? [{ id: entry.parentId, title: entry.parentTitle || "문장 보기" }]
      : [];
  return `
    <article class="learned-card" data-daily-entry-id="${entry.id}">
      <div class="learned-card-head">
        <div class="learned-card-tags">
          <span class="badge ${badgeClassByKind[entry.kind] || "green"}">${kindLabels[entry.kind]}</span>
          ${entry.registered ? `<span class="badge green">등록됨</span>` : `<span class="badge yellow">대기</span>`}
          <button class="danger-btn tiny-action-btn" data-delete-daily-entry="${entry.id}">삭제</button>
        </div>
      </div>
      <h4>${speakerButton(entry.title)}<span>${highlight(entry.title)}</span>${entry.reading ? `<span class="learned-inline-reading">${highlight(entry.reading)}</span>` : ""}</h4>
      <p class="learned-meaning item-meaning-text">${highlight(entry.meaning || "-")}</p>
      ${entry.kind === "word" ? `<div class="word-meta learned-meta">
        ${parsed.kanji ? `<span>한자 ${highlight(parsed.kanji)}</span>` : ""}
        ${parsed.part ? `<span>품사 ${highlight(parsed.part)}</span>` : ""}
        ${parsed.script ? `<span>문자 ${highlight(parsed.script)}</span>` : ""}
      </div>` : ""}
      ${sourceSentences.length ? `<div class="source-link-list">
        ${sourceSentences.map(sentence => `<button class="source-link" data-jump-sentence="${sentence.id}">사용 문장: ${highlight(sentence.title || "문장 보기")}</button>`).join("")}
      </div>` : `<span class="source-link muted">직접 추가</span>`}
    </article>
  `;
}

function speakerButton(text) {
  return `<button class="speaker-btn" data-speak-text="${escapeHtml(text)}" title="음성 재생 예정" aria-label="음성 재생 예정">🔊</button>`;
}

function renderWordCandidate(word) {
  return `
    <div class="word-candidate">
      <div class="word-candidate-main">
        <div class="word-inline-title">
          ${speakerButton(word.title)}
          <strong>${highlight(word.title)}</strong>
          <span>${highlight(word.reading || "-")}</span>
        </div>
      </div>
      <p class="item-meaning-text">${highlight(word.meaning || "-")}</p>
      <div class="word-meta">
        ${word.kanji ? `<span>한자 ${highlight(word.kanji)}</span>` : ""}
        ${word.part ? `<span>품사 ${highlight(word.part)}</span>` : ""}
        ${word.script ? `<span>문자 ${highlight(word.script)}</span>` : ""}
      </div>
    </div>
  `;
}

function renderGrammarCandidate(item) {
  return `
    <article class="grammar-candidate">
      <div class="grammar-candidate-head">
        ${speakerButton(item.title)}
        <strong>${highlight(item.title)}</strong>
      </div>
      <p class="item-meaning-text">${highlight(item.meaning || "-")}</p>
    </article>
  `;
}

function renderSources() {
  byId("sourceCards").innerHTML = items("source").length ? items("source").map(item => `
    <article class="source-card" data-item-id="${item.id}">
      <span class="badge green">${highlight(item.reading || "자료")}</span>
      <div class="source-title">${highlight(item.title)}</div>
      <p class="muted">진행률 ${escapeHtml(item.source || 0)}% · ${highlight(item.note || item.meaning)}</p>
      <div class="card-actions">
        <button class="ghost-btn" data-show-kanji-words="${escapeHtml(item.title)}">단어보기</button>
        <button class="ghost-btn" data-edit-item="${item.id}">수정</button>
      </div>
    </article>
  `).join("") : empty("자료를 추가해 보세요.");
}

function renderWords() {
  const part = byId("wordPartFilter").value;
  const review = byId("wordReviewFilter").value;
  const rows = items("word").filter(item => (!part || item.part === part) && (!review || item.review === review));
  byId("wordRows").innerHTML = rows.length ? rows.map(item => `
    <tr data-item-id="${item.id}">
      <td><div class="japanese word-table-title">${speakerButton(item.title)}<span>${highlight(item.title)}</span></div></td>
      <td>${highlight(item.reading || "-")}</td>
      <td>${highlight(item.meaning)}</td>
      <td>${highlight(item.kanji || "없음")}</td>
      <td><span class="badge blue">${highlight(item.part || "-")}</span></td>
      <td><span class="badge green">${highlight(item.script || "-")}</span></td>
      <td>${renderSourceSentenceLinks(item.sourceSentences)}</td>
      <td><button class="badge ${item.review === "오늘" ? "red" : "yellow"}" data-cycle-review="${item.id}">${highlight(item.review || "대기")}</button></td>
      <td><button class="danger-btn" data-delete-item="${item.id}">삭제</button></td>
    </tr>
  `).join("") : `<tr><td colspan="9">${empty("조건에 맞는 단어가 없습니다.")}</td></tr>`;
}

function renderSourceSentenceLinks(sourceSentences = []) {
  sourceSentences = (sourceSentences || []).filter((sentence, index, list) =>
    list.findIndex(item => sourceSentenceKey(item) === sourceSentenceKey(sentence)) === index
  );
  if (!sourceSentences.length) {
    return `<span class="muted">-</span>`;
  }
  return `<div class="word-source-links">
    ${sourceSentences.map(sentence => `<button class="source-link" data-jump-sentence="${sentence.id}" data-source-date="${sentence.studyDate || ""}">${highlight(sentence.title || "문장 보기")}</button>`).join("")}
  </div>`;
}

function sourceSentenceKey(sentence) {
  return [
    sentence.studyDate || "",
    String(sentence.title || "").trim().replace(/\s+/g, " ")
  ].join("::");
}

function renderCards(kind, targetId) {
  const list = items(kind);
  byId(targetId).innerHTML = list.length ? list.map(renderStudyCard).join("") : empty(`${kindLabels[kind]} 항목을 추가해 보세요.`);
}

function renderStudyCard(item) {
  const meaningText = String(item.meaning || "").trim();
  const noteText = String(item.note || "").trim();
  const note = noteText && noteText !== meaningText ? item.note : "";
  return `
    <article class="study-card" data-item-id="${item.id}">
      <span class="badge ${badgeClassByKind[item.kind] || "green"}">${kindLabels[item.kind] || item.kind}</span>
      <h3>${speakerButton(item.title)}<span>${highlight(item.title)}</span></h3>
      <p>${highlight([item.reading, item.meaning, item.level].filter(Boolean).join(" · "))}</p>
      ${note ? `<p class="muted">${highlight(note)}</p>` : ""}
      ${item.kind === "grammar" ? `<div class="source-link-list">${renderSourceSentenceLinks(item.sourceSentences)}</div>` : ""}
      <div class="card-actions">
        ${item.review ? `<button class="ghost-btn" data-cycle-review="${item.id}">복습: ${escapeHtml(item.review)}</button>` : ""}
        <button class="ghost-btn" data-edit-item="${item.id}">수정</button>
        <button class="danger-btn" data-delete-item="${item.id}">삭제</button>
      </div>
    </article>
  `;
}

function renderKanji() {
  const list = items("kanji");
  byId("kanjiCards").innerHTML = list.length ? list.map(item => `
    <article class="kanji-card" data-item-id="${item.id}">
      <div class="kanji-card-top">
        ${speakerButton(item.title)}
        <button class="danger-btn tiny-action-btn" data-delete-item="${item.id}">삭제</button>
      </div>
      <div class="kanji-char"><span>${highlight(item.title)}</span></div>
      <div class="kanji-info">
        <strong>${highlight(item.meaning || "-")}</strong>
        <p>${highlight(item.reading || "-")}</p>
      </div>
      <div class="card-actions">
        <button class="ghost-btn" data-show-kanji-words="${escapeHtml(item.title)}">단어보기</button>
        <button class="ghost-btn" data-cycle-review="${item.id}">복습: ${escapeHtml(item.review || "대기")}</button>
        <button class="danger-btn" data-delete-item="${item.id}">삭제</button>
      </div>
    </article>
  `).join("") : empty("한자를 추가해 보세요.");
}

function renderReview() {
  const list = reviewItems();
  byId("reviewCards").innerHTML = list.length ? list.map(item => `
    <article class="study-card" data-item-id="${item.id}">
      <label class="review-check">
        <input type="checkbox" data-review-select="${item.id}" ${reviewSelection.has(item.id) ? "checked" : ""} />
        <span class="badge ${badgeClassByKind[item.kind] || "green"}">${kindLabels[item.kind]}</span>
      </label>
      <h3>${speakerButton(item.title)}<span>${highlight(item.title)}</span></h3>
      <p>${highlight([item.reading, item.meaning].filter(Boolean).join(" · "))}</p>
      <p class="muted">복습 상태: ${highlight(item.review)}</p>
    </article>
  `).join("") : empty("오늘 복습할 항목이 없습니다.");
}

function renderStats() {
  byId("totalMinutes").textContent = `${Number(state.studyLog.totalMinutes || 0)}분`;
  byId("totalWords").textContent = state.items.filter(item => item.kind === "word").length;
  byId("totalGrammarExpression").textContent = state.items.filter(item => ["grammar", "expression"].includes(item.kind)).length;
  byId("completedSources").textContent = state.items.filter(item => item.kind === "source" && Number(item.source) >= 100).length;
}

function renderTaxonomy() {
  byId("partChips").innerHTML = partOptions.map(option => `<span class="taxonomy-chip">${option}</span>`).join("");
  byId("scriptChips").innerHTML = scriptOptions.map(option => `<span class="taxonomy-chip">${option}</span>`).join("");
}

function renderQuickFilters() {
  byId("reviewFilterCount").textContent = reviewItems().length;
  byId("n3FilterCount").textContent = state.items.filter(item => item.level === "N3").length;
  byId("sourceFilterCount").textContent = state.items.filter(item => item.source && item.kind !== "source").length;
  byId("pendingFilterCount").textContent = state.tasks.filter(task => !task.done).length;
}

function renderStoragePaths() {
  if (!storagePaths) {
    return;
  }
  byId("appDataPath").textContent = storagePaths.appDataDir;
  byId("sqlitePath").textContent = storagePaths.dbPath;
  byId("exportPath").textContent = storagePaths.exportsDir;
  byId("backupPath").textContent = storagePaths.backupsDir;
}

function setStorageStatus(message) {
  byId("storageStatus").textContent = message;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTodayKey() {
  return toDateKey(new Date());
}

function moveCalendarMonth(delta) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  calendarMonth = toDateKey(next).slice(0, 7);
  renderCalendar();
}

function empty(message) {
  return `<div class="empty-state">${message}</div>`;
}

function openPage(pageId, options = {}) {
  const shouldScrollTop = options.scrollTop !== false;
  currentPage = pageId;
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.page === pageId));
  document.querySelectorAll(".page").forEach(page => page.classList.toggle("hidden-page", page.id !== pageId));
  renderToc(pageId);
  if (shouldScrollTop) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function jumpToSentence(sentenceId, sourceDate = "") {
  if (sourceDate && sourceDate !== selectedDate) {
    selectedDate = sourceDate;
    applyState(await window.studyData.getState(selectedDate));
  }

  openPage("today", { scrollTop: false });
  const sentenceCard = byId(`daily-entry-${sentenceId}`);
  if (!sentenceCard) {
    return;
  }

  window.setTimeout(() => {
    sentenceCard.scrollIntoView({ behavior: "smooth", block: "center" });
    sentenceCard.classList.add("focus-flash");
    window.setTimeout(() => sentenceCard.classList.remove("focus-flash"), 900);
  }, 50);
}

function openDialog(kind, item = null) {
  const dialog = byId("itemDialog");
  byId("dialogTitle").textContent = `${kindLabels[kind] || "항목"} ${item ? "수정" : "추가"}`;
  byId("itemKind").value = kind;
  byId("itemForm").dataset.editId = item?.id || "";
  byId("itemTitle").value = item?.title || "";
  byId("itemReading").value = item?.reading || "";
  byId("itemMeaning").value = item?.meaning || "";
  byId("itemLevel").value = item?.level || "";
  byId("itemPart").value = item?.part || "";
  byId("itemScript").value = item?.script || "";
  byId("itemReview").value = item?.review || (kind === "source" ? "" : "대기");
  byId("itemDetail").value = ["word", "kanji"].includes(kind) ? (item?.kanji || "") : kind === "source" ? (item?.source || "") : "";
  byId("itemSource").value = kind === "source" ? "" : (item?.source || "");
  byId("itemNote").value = item?.note || "";
  dialog.showModal();
}

async function saveItemFromDialog() {
  const form = byId("itemForm");
  const kind = byId("itemKind").value;
  const editId = form.dataset.editId;
  const payload = {
    id: editId || crypto.randomUUID(),
    kind,
    studyDate: selectedDate,
    title: byId("itemTitle").value.trim(),
    reading: byId("itemReading").value.trim(),
    meaning: byId("itemMeaning").value.trim(),
    level: byId("itemLevel").value.trim(),
    part: byId("itemPart").value.trim(),
    script: byId("itemScript").value.trim(),
    review: byId("itemReview").value.trim(),
    source: kind === "source" ? byId("itemDetail").value.trim() : byId("itemSource").value.trim(),
    note: byId("itemNote").value.trim(),
    kanji: ["word", "kanji"].includes(kind) ? byId("itemDetail").value.trim() : ""
  };

  if (!payload.title) {
    return;
  }

  applyState(await window.studyData.upsertItem(payload));
}

async function cycleReview(id) {
  const order = ["오늘", "내일", "3일 후", "대기"];
  const item = state.items.find(item => item.id === id);
  if (!item) {
    return;
  }
  const index = order.indexOf(item.review);
  applyState(await window.studyData.updateItemReview(id, order[(index + 1) % order.length], selectedDate));
}

async function deleteItem(id) {
  reviewSelection.delete(id);
  applyState(await window.studyData.deleteItem(id, selectedDate));
}

function showKanjiWords(kanji) {
  searchTerm = kanji;
  byId("globalSearch").value = kanji;
  byId("wordPartFilter").value = "";
  byId("wordReviewFilter").value = "";
  renderWords();
  openPage("words");
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => openPage(tab.dataset.page));
  });

  document.body.addEventListener("click", async event => {
    const calendarTarget = event.target.closest("[data-calendar-date]");
    if (calendarTarget) {
      selectedDate = calendarTarget.dataset.calendarDate;
      applyState(await window.studyData.getState(selectedDate));
      return;
    }

    const openTarget = event.target.closest("[data-open-page]");
    if (openTarget) {
      openPage(openTarget.dataset.openPage);
      return;
    }

    const addTarget = event.target.closest("[data-add-item]");
    if (addTarget) {
      openDialog(addTarget.dataset.kind);
      return;
    }

    const editTarget = event.target.closest("[data-edit-item]");
    if (editTarget) {
      const item = state.items.find(item => item.id === editTarget.dataset.editItem);
      if (item) {
        openDialog(item.kind, item);
      }
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

    const kanjiWordsTarget = event.target.closest("[data-show-kanji-words]");
    if (kanjiWordsTarget) {
      showKanjiWords(kanjiWordsTarget.dataset.showKanjiWords);
      return;
    }

    const taskTarget = event.target.closest("[data-toggle-task]");
    if (taskTarget) {
      const task = state.tasks.find(task => task.id === taskTarget.dataset.toggleTask);
      if (task) {
        applyState(await window.studyData.updateTaskDone(task.id, !task.done, selectedDate));
      }
      return;
    }

    const registerDailyTarget = event.target.closest("[data-register-daily-entry]");
    if (registerDailyTarget) {
      const response = await window.studyData.registerDailyEntry(registerDailyTarget.dataset.registerDailyEntry);
      applyState(response.state);
      const registered = response.result.registered.length ? `등록: ${response.result.registered.join(", ")}` : "";
      const duplicates = response.result.duplicates.length ? `중복: ${response.result.duplicates.join(", ")}` : "";
      window.alert([registered, duplicates].filter(Boolean).join("\n") || "등록할 항목이 없습니다.");
      return;
    }

    const jumpTarget = event.target.closest("[data-jump-sentence]");
    if (jumpTarget) {
      await jumpToSentence(jumpTarget.dataset.jumpSentence, jumpTarget.dataset.sourceDate || "");
      return;
    }

    const deleteDailyTarget = event.target.closest("[data-delete-daily-entry]");
    if (deleteDailyTarget) {
      applyState(await window.studyData.deleteDailyEntry(deleteDailyTarget.dataset.deleteDailyEntry, selectedDate));
    }
  });

  document.body.addEventListener("change", event => {
    const reviewTarget = event.target.closest("[data-review-select]");
    if (reviewTarget) {
      if (reviewTarget.checked) {
        reviewSelection.add(reviewTarget.dataset.reviewSelect);
      } else {
        reviewSelection.delete(reviewTarget.dataset.reviewSelect);
      }
    }
  });

  byId("globalSearch").addEventListener("input", event => {
    searchTerm = event.target.value.trim();
    renderAll();
  });

  byId("wordPartFilter").addEventListener("change", renderWords);
  byId("wordReviewFilter").addEventListener("change", renderWords);

  byId("quickAddBtn").addEventListener("click", () => openDialog("word"));

  byId("prevMonthBtn").addEventListener("click", () => moveCalendarMonth(-1));
  byId("nextMonthBtn").addEventListener("click", () => moveCalendarMonth(1));
  byId("todayBtn").addEventListener("click", async () => {
    selectedDate = localTodayKey();
    applyState(await window.studyData.getState(selectedDate));
  });

  byId("addDailyEntryBtn").addEventListener("click", async () => {
    const rawText = byId("dailyEntryInput").value.trim();
    if (!rawText) {
      return;
    }
    applyState(await window.studyData.addDailyEntry({
      studyDate: selectedDate,
      kind: "sentence",
      rawText
    }));
    byId("dailyEntryInput").value = "";
  });

  byId("addManualEntryBtn").addEventListener("click", async () => {
    const rawText = byId("manualEntryInput").value.trim();
    const kind = document.querySelector("input[name='dailyManualKind']:checked")?.value || "word";
    if (!rawText) {
      return;
    }
    applyState(await window.studyData.addDailyEntry({
      studyDate: selectedDate,
      kind,
      rawText
    }));
    byId("manualEntryInput").value = "";
  });

  document.querySelectorAll("input[name='dailyManualKind']").forEach(input => {
    input.addEventListener("change", updateManualEntryPlaceholder);
  });

  byId("registerLearnedBtn").addEventListener("click", async () => {
    const targets = (state.dailyEntries || []).filter(entry =>
      ["word", "grammar", "expression"].includes(entry.kind) && !entry.registered
    );

    if (!targets.length) {
      window.alert("등록할 새 단어, 새 문법, 새 표현이 없습니다.");
      return;
    }

    const registered = [];
    const duplicates = [];
    let nextState = state;

    for (const entry of targets) {
      const response = await window.studyData.registerDailyEntry(entry.id);
      nextState = response.state;
      registered.push(...response.result.registered);
      duplicates.push(...response.result.duplicates);
    }

    applyState(nextState);
    window.alert([
      registered.length ? `등록: ${registered.join(", ")}` : "",
      duplicates.length ? `중복: ${duplicates.join(", ")}` : ""
    ].filter(Boolean).join("\n") || "등록된 항목이 없습니다.");
  });

  byId("addTaskBtn").addEventListener("click", async () => {
    const title = prompt("할 일 제목을 입력하세요.");
    if (!title) {
      return;
    }
    applyState(await window.studyData.addTask({ id: crypto.randomUUID(), title, note: "직접 추가한 할 일", tag: "일반", done: false, studyDate: selectedDate }));
  });

  byId("itemForm").addEventListener("submit", async event => {
    event.preventDefault();
    await saveItemFromDialog();
    byId("itemDialog").close();
  });

  byId("closeDialogBtn").addEventListener("click", () => byId("itemDialog").close());
  byId("cancelDialogBtn").addEventListener("click", () => byId("itemDialog").close());

  byId("completeReviewBtn").addEventListener("click", async () => {
    if (reviewSelection.size === 0) {
      return;
    }
    const selectedIds = [...reviewSelection];
    reviewSelection.clear();
    applyState(await window.studyData.completeReview(selectedIds, selectedDate));
  });

  byId("resetDataBtn").addEventListener("click", async () => {
    reviewSelection.clear();
    applyState(await window.studyData.resetSampleData());
    setStorageStatus("SQLite 데이터를 초기화했습니다.");
  });

  byId("exportDataBtn").addEventListener("click", async () => {
    const result = await window.studyData.exportData();
    setStorageStatus(`내보내기 완료: ${result.exportsDir}`);
  });

  byId("importCsvBtn").addEventListener("click", async () => {
    applyState(await window.studyData.importCsv(selectedDate));
    setStorageStatus("exports 폴더의 CSV를 SQLite로 가져왔습니다.");
  });

  byId("importBackupBtn").addEventListener("click", async () => {
    try {
      reviewSelection.clear();
      applyState(await window.studyData.importBackup());
      setStorageStatus("full-backup.yaml에서 전체 데이터를 복원했습니다.");
    } catch (error) {
      setStorageStatus(error.message);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      byId("globalSearch").focus();
    }
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      openDialog("word");
    }
  });
}

async function init() {
  storagePaths = await window.studyData.getPaths();
  applyState(await window.studyData.getState(selectedDate));
  bindEvents();
}

init().catch(error => {
  document.body.innerHTML = `<main class="main"><section class="panel"><h1>데이터베이스 초기화 실패</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
