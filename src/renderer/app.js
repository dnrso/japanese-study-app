const STORAGE_KEY = "nihongo-study-app-state-v1";

const sampleState = {
  studyLog: {
    minutes: 61,
    summary: "영상 자료 1개, 새 단어 12개, 표현 3개",
    note: "〜てしまう와 予定 관련 예문을 복습했다.",
    totalMinutes: 450
  },
  tasks: [
    { id: crypto.randomUUID(), title: "단어 20개 복습", note: "틀린 단어는 복습 큐에 재등록", tag: "중요", done: false },
    { id: crypto.randomUUID(), title: "문법 〜てしまう 정리", note: "예문 3개와 비슷한 문법 연결", tag: "문법", done: true },
    { id: crypto.randomUUID(), title: "유튜브 자료 1개 이어서 보기", note: "12:30부터 다시 시작", tag: "자료", done: false }
  ],
  items: [
    { id: crypto.randomUUID(), kind: "word", title: "予定", reading: "よてい", meaning: "예정, 계획", level: "N4", part: "명사", script: "한자", review: "오늘", kanji: "予(미리 예), 定(정할 정)", source: "인터뷰 영상 #12", note: "来週の予定を確認する。" },
    { id: crypto.randomUUID(), kind: "word", title: "一体", reading: "いったい", meaning: "도대체, 대관절", level: "N3", part: "부사", script: "한자", review: "오늘", kanji: "一(한 일), 体(몸 체)", source: "NHK Easy News", note: "一体どうしたの。" },
    { id: crypto.randomUUID(), kind: "word", title: "何", reading: "なに", meaning: "무엇", level: "N5", part: "대명사", script: "한자", review: "내일", kanji: "何(어찌 하)", source: "", note: "" },
    { id: crypto.randomUUID(), kind: "word", title: "起きた", reading: "おきた", meaning: "일어났다, 발생했다", level: "N4", part: "동사", script: "한자+히라가나", review: "3일 후", kanji: "起(일어날 기)", source: "NHK Easy News", note: "" },
    { id: crypto.randomUUID(), kind: "word", title: "んだ", reading: "", meaning: "~한 것이다, ~인 거야", level: "회화", part: "문법표현", script: "히라가나", review: "대기", kanji: "없음", source: "", note: "설명, 강조의 뉘앙스" },
    { id: crypto.randomUUID(), kind: "grammar", title: "〜てしまう", reading: "Vて + しまう", meaning: "완료, 후회, 유감의 뉘앙스", level: "N4", part: "문법", script: "혼합", review: "오늘", source: "JLPT N3 문법 교재", note: "宿題を忘れてしまった。회화에서는 〜ちゃう 형태로 자주 줄어듭니다." },
    { id: crypto.randomUUID(), kind: "expression", title: "気にしないで", reading: "きにしないで", meaning: "신경 쓰지 마", level: "캐주얼", part: "표현", script: "혼합", review: "내일", source: "회화", note: "친구와 대화할 때 사용" },
    { id: crypto.randomUUID(), kind: "expression", title: "お世話になっております", reading: "おせわになっております", meaning: "항상 신세지고 있습니다", level: "정중", part: "표현", script: "혼합", review: "대기", source: "비즈니스", note: "메일 첫 인사" },
    { id: crypto.randomUUID(), kind: "kanji", title: "大", reading: "ダイ · おお", meaning: "크다", level: "N5", part: "한자", script: "한자", review: "3일 후", source: "", note: "大学, 大きい" },
    { id: crypto.randomUUID(), kind: "kanji", title: "学", reading: "ガク · まな", meaning: "배우다", level: "N5", part: "한자", script: "한자", review: "오늘", source: "", note: "学校, 学ぶ" },
    { id: crypto.randomUUID(), kind: "sentence", title: "宿題を忘れてしまった。", reading: "しゅくだいをわすれてしまった", meaning: "숙제를 잊어버렸다.", level: "N4", part: "문장", script: "혼합", review: "오늘", source: "문법 교재", note: "〜てしまう 예문" },
    { id: crypto.randomUUID(), kind: "source", title: "日本語 인터뷰 영상 #12", reading: "YouTube", meaning: "회화 듣기 자료", level: "N3", part: "자료", script: "영상", review: "", source: "72", note: "12:30부터 이어보기" },
    { id: crypto.randomUUID(), kind: "source", title: "NHK Easy News", reading: "뉴스", meaning: "쉬운 일본어 기사", level: "N4", part: "자료", script: "독해", review: "", source: "44", note: "어제 학습" },
    { id: crypto.randomUUID(), kind: "source", title: "JLPT N3 문법 교재", reading: "교재", meaning: "문법 정리", level: "N3", part: "자료", script: "문법", review: "", source: "31", note: "5개 문법 연결" }
  ]
};

let state = loadState();
let currentPage = "home";
let searchTerm = "";
let reviewSelection = new Set();

const tocByPage = {
  home: [["home-overview", "오늘 개요", ""], ["home-progress", "진행률", ""], ["home-stats", "요약 지표", "4"], ["home-today", "오늘 할 일", ""], ["home-recent", "최근 추가", ""], ["home-queue", "복습 큐", ""]],
  today: [["today-log", "오늘 공부 기록", ""], ["today-sentences", "문장·읽기·해석", ""]],
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

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return structuredClone(sampleState);
  }

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(sampleState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function byId(id) {
  return document.getElementById(id);
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
  const haystack = [item.title, item.reading, item.meaning, item.level, item.part, item.script, item.review, item.source, item.note]
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
  renderTasks();
  renderToday();
  renderSources();
  renderWords();
  renderCards("grammar", "grammarCards");
  renderCards("expression", "expressionCards");
  renderKanji();
  renderReview();
  renderStats();
  renderTaxonomy();
  renderQuickFilters();
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
  byId("todayDoneCount").textContent = `${state.tasks.filter(task => task.done).length}개`;
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
  byId("studyMinutesInput").value = state.studyLog.minutes || 0;
  byId("studySummaryInput").value = state.studyLog.summary || "";
  byId("studyNoteInput").value = state.studyLog.note || "";
  byId("sentenceCards").innerHTML = items("sentence").length ? items("sentence").map(renderStudyCard).join("") : empty("문장을 추가해 보세요.");
}

function renderSources() {
  byId("sourceCards").innerHTML = items("source").length ? items("source").map(item => `
    <article class="source-card" data-item-id="${item.id}">
      <span class="badge green">${highlight(item.reading || "자료")}</span>
      <div class="source-title">${highlight(item.title)}</div>
      <p class="muted">진행률 ${escapeHtml(item.source || 0)}% · ${highlight(item.note || item.meaning)}</p>
      <div class="card-actions">
        <button class="ghost-btn" data-edit-item="${item.id}">수정</button>
        <button class="danger-btn" data-delete-item="${item.id}">삭제</button>
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
      <td class="japanese">${highlight(item.title)}</td>
      <td>${highlight(item.reading || "-")}</td>
      <td>${highlight(item.meaning)}</td>
      <td>${highlight(item.kanji || "없음")}</td>
      <td><span class="badge blue">${highlight(item.part || "-")}</span></td>
      <td><span class="badge green">${highlight(item.script || "-")}</span></td>
      <td><button class="badge ${item.review === "오늘" ? "red" : "yellow"}" data-cycle-review="${item.id}">${highlight(item.review || "대기")}</button></td>
      <td><button class="danger-btn" data-delete-item="${item.id}">삭제</button></td>
    </tr>
  `).join("") : `<tr><td colspan="8">${empty("조건에 맞는 단어가 없습니다.")}</td></tr>`;
}

function renderCards(kind, targetId) {
  const list = items(kind);
  byId(targetId).innerHTML = list.length ? list.map(renderStudyCard).join("") : empty(`${kindLabels[kind]} 항목을 추가해 보세요.`);
}

function renderStudyCard(item) {
  return `
    <article class="study-card" data-item-id="${item.id}">
      <span class="badge ${badgeClassByKind[item.kind] || "green"}">${kindLabels[item.kind] || item.kind}</span>
      <h3>${highlight(item.title)}</h3>
      <p>${highlight([item.reading, item.meaning, item.level].filter(Boolean).join(" · "))}</p>
      ${item.note ? `<p class="muted">${highlight(item.note)}</p>` : ""}
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
      <div class="kanji-char">${highlight(item.title)}</div>
      <strong>${highlight(item.meaning)}</strong>
      <p class="muted">${highlight(item.reading)}</p>
      <div class="card-actions">
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
      <h3>${highlight(item.title)}</h3>
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

function empty(message) {
  return `<div class="empty-state">${message}</div>`;
}

function openPage(pageId) {
  currentPage = pageId;
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.page === pageId));
  document.querySelectorAll(".page").forEach(page => page.classList.toggle("hidden-page", page.id !== pageId));
  renderToc(pageId);
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  byId("itemDetail").value = kind === "word" ? (item?.kanji || "") : kind === "source" ? (item?.source || "") : "";
  byId("itemSource").value = kind === "source" ? "" : (item?.source || "");
  byId("itemNote").value = item?.note || "";
  dialog.showModal();
}

function saveItemFromDialog() {
  const form = byId("itemForm");
  const kind = byId("itemKind").value;
  const editId = form.dataset.editId;
  const payload = {
    id: editId || crypto.randomUUID(),
    kind,
    title: byId("itemTitle").value.trim(),
    reading: byId("itemReading").value.trim(),
    meaning: byId("itemMeaning").value.trim(),
    level: byId("itemLevel").value.trim(),
    part: byId("itemPart").value.trim(),
    script: byId("itemScript").value.trim(),
    review: byId("itemReview").value.trim(),
    source: kind === "source" ? byId("itemDetail").value.trim() : byId("itemSource").value.trim(),
    note: byId("itemNote").value.trim(),
    kanji: kind === "word" ? byId("itemDetail").value.trim() : ""
  };

  if (!payload.title) {
    return;
  }

  if (editId) {
    state.items = state.items.map(item => item.id === editId ? { ...item, ...payload } : item);
  } else {
    state.items.unshift(payload);
  }
  saveState();
  renderAll();
}

function cycleReview(id) {
  const order = ["오늘", "내일", "3일 후", "대기"];
  state.items = state.items.map(item => {
    if (item.id !== id) {
      return item;
    }
    const index = order.indexOf(item.review);
    return { ...item, review: order[(index + 1) % order.length] };
  });
  saveState();
  renderAll();
}

function deleteItem(id) {
  state.items = state.items.filter(item => item.id !== id);
  reviewSelection.delete(id);
  saveState();
  renderAll();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => openPage(tab.dataset.page));
  });

  document.body.addEventListener("click", event => {
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
      deleteItem(deleteTarget.dataset.deleteItem);
      return;
    }

    const cycleTarget = event.target.closest("[data-cycle-review]");
    if (cycleTarget) {
      cycleReview(cycleTarget.dataset.cycleReview);
      return;
    }

    const taskTarget = event.target.closest("[data-toggle-task]");
    if (taskTarget) {
      state.tasks = state.tasks.map(task => task.id === taskTarget.dataset.toggleTask ? { ...task, done: !task.done } : task);
      saveState();
      renderAll();
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

  byId("addTaskBtn").addEventListener("click", () => {
    const title = prompt("할 일 제목을 입력하세요.");
    if (!title) {
      return;
    }
    state.tasks.unshift({ id: crypto.randomUUID(), title, note: "직접 추가한 할 일", tag: "일반", done: false });
    saveState();
    renderAll();
  });

  byId("saveStudyLogBtn").addEventListener("click", () => {
    const previousMinutes = Number(state.studyLog.minutes || 0);
    const nextMinutes = Number(byId("studyMinutesInput").value || 0);
    state.studyLog = {
      minutes: nextMinutes,
      summary: byId("studySummaryInput").value.trim(),
      note: byId("studyNoteInput").value.trim(),
      totalMinutes: Number(state.studyLog.totalMinutes || 0) + Math.max(0, nextMinutes - previousMinutes)
    };
    saveState();
    renderAll();
  });

  byId("itemForm").addEventListener("submit", event => {
    event.preventDefault();
    saveItemFromDialog();
    byId("itemDialog").close();
  });

  byId("closeDialogBtn").addEventListener("click", () => byId("itemDialog").close());
  byId("cancelDialogBtn").addEventListener("click", () => byId("itemDialog").close());

  byId("completeReviewBtn").addEventListener("click", () => {
    if (reviewSelection.size === 0) {
      return;
    }
    state.items = state.items.map(item => reviewSelection.has(item.id) ? { ...item, review: "3일 후" } : item);
    reviewSelection.clear();
    saveState();
    renderAll();
  });

  byId("resetDataBtn").addEventListener("click", () => {
    state = structuredClone(sampleState);
    reviewSelection.clear();
    saveState();
    renderAll();
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

bindEvents();
renderAll();
