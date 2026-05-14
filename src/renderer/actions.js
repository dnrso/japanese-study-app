function setStorageStatus(message) {
  byId("storageStatus").textContent = message;
}

function moveCalendarMonth(delta) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  calendarMonth = toDateKey(next).slice(0, 7);
  renderCalendar();
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
    applyState(await dataApi.getState(selectedDate));
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
  updateDialogFields(kind);
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
  byId("sourceTitle").value = item?.title || "";
  byId("sourceLink").value = item?.source || "";
  byId("sourceNote").value = item?.note || item?.meaning || "";
  byId("sourceLevel").value = item?.level || "";
  byId("sourceTags").value = item?.reading || "";
  dialog.showModal();
}

function updateDialogFields(kind) {
  const isSource = kind === "source";
  byId("defaultItemFields").hidden = isSource;
  byId("itemNote").hidden = isSource;
  byId("sourceItemFields").hidden = !isSource;
  byId("itemTitle").required = !isSource;
  byId("sourceTitle").required = isSource;
  byId("defaultItemFields").querySelectorAll("input, textarea, select").forEach(field => {
    field.disabled = isSource;
  });
  byId("itemNote").disabled = isSource;
  byId("sourceItemFields").querySelectorAll("input, textarea, select").forEach(field => {
    field.disabled = !isSource;
  });
}

async function saveItemFromDialog() {
  const form = byId("itemForm");
  const kind = byId("itemKind").value;
  const editId = form.dataset.editId;
  const payload = kind === "source" ? {
    id: editId || crypto.randomUUID(),
    kind,
    studyDate: selectedDate,
    title: byId("sourceTitle").value.trim(),
    reading: byId("sourceTags").value.trim(),
    meaning: "",
    level: byId("sourceLevel").value.trim(),
    part: "",
    script: "",
    review: "",
    source: byId("sourceLink").value.trim(),
    note: byId("sourceNote").value.trim(),
    kanji: ""
  } : {
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
    window.alert(kind === "source" ? "자료 제목을 입력하세요." : "제목을 입력하세요.");
    return false;
  }

  applyState(await dataApi.upsertItem(payload));
  return true;
}

async function cycleReview(id) {
  const order = ["오늘", "내일", "3일 후", "대기"];
  const item = state.items.find(item => item.id === id);
  if (!item) {
    return;
  }
  const index = order.indexOf(item.review);
  applyState(await dataApi.updateItemReview(id, order[(index + 1) % order.length], selectedDate));
}

async function deleteItem(id) {
  reviewSelection.delete(id);
  applyState(await dataApi.deleteItem(id, selectedDate));
}

function showKanjiWords(kanji) {
  searchTerm = kanji;
  byId("globalSearch").value = kanji;
  byId("wordPartFilter").value = "";
  byId("wordReviewFilter").value = "";
  renderWords();
  openPage("words");
}
