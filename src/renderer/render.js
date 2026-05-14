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
  const leftCandidates = childWords.length ? `
    <section class="candidate-section">
      <div class="candidate-title">새 단어</div>
      <div class="word-candidate-grid">${childWords.map(entryToCandidate).map(renderWordCandidate).join("")}</div>
    </section>
  ` : "";
  const rightCandidates = [
    childGrammar.length ? `
      <section class="candidate-section">
        <div class="candidate-title">새 문법</div>
        <div class="grammar-candidate-list">${childGrammar.map(renderGrammarCandidate).join("")}</div>
      </section>
    ` : "",
    childExpressions.length ? `
      <section class="candidate-section">
        <div class="candidate-title">새 표현</div>
        <div class="grammar-candidate-list">${childExpressions.map(renderGrammarCandidate).join("")}</div>
      </section>
    ` : ""
  ].join("");
  const candidateLayout = leftCandidates || rightCandidates ? `
    <div class="daily-candidate-layout">
      ${leftCandidates ? `<div class="daily-candidate-column">${leftCandidates}</div>` : ""}
      ${rightCandidates ? `<div class="daily-candidate-column">${rightCandidates}</div>` : ""}
    </div>
  ` : "";
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
      ${candidateLayout}
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
  return `<button class="speaker-btn" data-speak-text="${escapeHtml(text)}" title="음성 재생" aria-label="음성 재생">🔊</button>`;
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
      <p class="muted">${highlight([item.level, item.note || item.meaning].filter(Boolean).join(" · "))}</p>
      <div class="card-actions">
        ${item.source ? `<a class="ghost-btn" href="${escapeHtml(item.source)}" target="_blank" rel="noreferrer">링크 열기</a>` : ""}
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
