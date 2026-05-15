function bindEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => openPage(tab.dataset.page));
  });

  document.body.addEventListener("click", async event => {
    const speakTarget = event.target.closest("[data-speak-text]");
    if (speakTarget) {
      await window.NihonGoTts.speak(speakTarget.dataset.speakText);
      return;
    }

    const calendarTarget = event.target.closest("[data-calendar-date]");
    if (calendarTarget) {
      selectedDate = calendarTarget.dataset.calendarDate;
      applyState(await dataApi.getState(selectedDate));
      return;
    }

    const openTarget = event.target.closest("[data-open-page]");
    if (openTarget) {
      openPage(openTarget.dataset.openPage);
      return;
    }

    const wordSortTarget = event.target.closest("[data-word-sort]");
    if (wordSortTarget) {
      const key = wordSortTarget.dataset.wordSort;
      if (wordSort.key !== key) {
        wordSort = { key, direction: "asc" };
      } else if (wordSort.direction === "asc") {
        wordSort = { key, direction: "desc" };
      } else {
        wordSort = { key: "", direction: "" };
      }
      renderWords();
      return;
    }

    const quizTarget = event.target.closest("[data-quiz-kind]");
    if (quizTarget) {
      if (quizTarget.dataset.quizKind === "word") {
        startWordQuiz();
        return;
      }
      if (quizTarget.dataset.quizKind === "kanji") {
        startKanjiQuiz();
        return;
      }
      const label = quizTarget.querySelector("strong")?.textContent || "퀴즈";
      byId("quizStatus").textContent = `${label} 기능은 이후 구현 예정입니다.`;
      wordQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
      kanjiQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
      renderWordQuiz();
      renderKanjiQuiz();
      return;
    }

    const wordQuizChoiceTarget = event.target.closest("[data-word-quiz-choice]");
    if (wordQuizChoiceTarget && wordQuiz.question && !wordQuiz.answered) {
      await submitQuizChoice("word", wordQuizChoiceTarget.dataset.wordQuizChoice);
      return;
    }

    const kanjiQuizChoiceTarget = event.target.closest("[data-kanji-quiz-choice]");
    if (kanjiQuizChoiceTarget && kanjiQuiz.question && !kanjiQuiz.answered) {
      await submitQuizChoice("kanji", kanjiQuizChoiceTarget.dataset.kanjiQuizChoice);
      return;
    }

    const nextWordQuizTarget = event.target.closest("[data-next-word-quiz]");
    if (nextWordQuizTarget) {
      startWordQuiz();
      return;
    }

    const nextKanjiQuizTarget = event.target.closest("[data-next-kanji-quiz]");
    if (nextKanjiQuizTarget) {
      startKanjiQuiz();
      return;
    }

    const taxonomyTarget = event.target.closest("[data-word-taxonomy]");
    if (taxonomyTarget) {
      const selectId = taxonomyTarget.dataset.wordTaxonomy === "part" ? "wordPartFilter" : "wordScriptFilter";
      const select = byId(selectId);
      const value = taxonomyTarget.dataset.wordTaxonomyValue;
      select.value = select.value === value ? "" : value;
      renderWords();
      renderTaxonomy();
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
        applyState(await dataApi.updateTaskDone(task.id, !task.done, selectedDate));
      }
      return;
    }

    const registerDailyTarget = event.target.closest("[data-register-daily-entry]");
    if (registerDailyTarget) {
      const response = await dataApi.registerDailyEntry(registerDailyTarget.dataset.registerDailyEntry);
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
      applyState(await dataApi.deleteDailyEntry(deleteDailyTarget.dataset.deleteDailyEntry, selectedDate));
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

  byId("wordPartFilter").addEventListener("change", () => {
    renderWords();
    renderTaxonomy();
  });
  byId("wordScriptFilter").addEventListener("change", () => {
    renderWords();
    renderTaxonomy();
  });
  byId("wordReviewFilter").addEventListener("change", renderWords);

  byId("quickAddBtn").addEventListener("click", () => openDialog("word"));

  byId("prevMonthBtn").addEventListener("click", () => moveCalendarMonth(-1));
  byId("nextMonthBtn").addEventListener("click", () => moveCalendarMonth(1));
  byId("todayBtn").addEventListener("click", async () => {
    selectedDate = localTodayKey();
    applyState(await dataApi.getState(selectedDate));
  });

  byId("addDailyEntryBtn").addEventListener("click", async () => {
    const rawText = byId("dailyEntryInput").value.trim();
    if (!rawText) {
      return;
    }
    applyState(await dataApi.addDailyEntry({
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
    applyState(await dataApi.addDailyEntry({
      studyDate: selectedDate,
      kind,
      rawText
    }));
    byId("manualEntryInput").value = "";
  });

  document.querySelectorAll("input[name='dailyManualKind']").forEach(input => {
    input.addEventListener("change", updateManualEntryPlaceholder);
  });

  document.querySelectorAll("input[name='wordQuizMode']").forEach(input => {
    input.addEventListener("change", event => {
      wordQuizMode = event.target.value;
      wordQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
      byId("quizStatus").textContent = "단어 퀴즈 유형을 선택했습니다.";
      renderWordQuiz();
    });
  });

  document.querySelectorAll("input[name='kanjiQuizMode']").forEach(input => {
    input.addEventListener("change", event => {
      kanjiQuizMode = event.target.value;
      kanjiQuiz = { question: null, answered: false, selectedAnswer: "", result: null };
      byId("quizStatus").textContent = "한자 퀴즈 유형을 선택했습니다.";
      renderKanjiQuiz();
    });
  });

  byId("quizQuestionFontSizeRange").addEventListener("input", event => {
    setQuizQuestionFontSize(event.target.value);
    byId("quizQuestionFontSizeValue").textContent = `${quizQuestionFontSize}px`;
  });

  byId("registerLearnedBtn").addEventListener("click", async () => {
    const targets = (state.dailyEntries || []).filter(entry =>
      ["word", "grammar", "expression"].includes(entry.kind) && !entry.registered
    );

    if (!targets.length) {
      window.alert("등록할 새 단어, 새 문법, 새 표현이 없습니다.");
      return;
    }

    const response = await dataApi.registerDailyEntries(targets.map(entry => entry.id), selectedDate);
    const registered = response.result.registered || [];
    const duplicates = response.result.duplicates || [];
    const errors = response.result.errors || [];

    applyState(response.state);
    window.alert([
      registered.length ? `등록: ${registered.join(", ")}` : "",
      duplicates.length ? `중복: ${duplicates.join(", ")}` : "",
      errors.length ? `오류: ${errors.join(", ")}` : ""
    ].filter(Boolean).join("\n") || "등록된 항목이 없습니다.");
  });

  byId("addTaskBtn").addEventListener("click", async () => {
    const title = prompt("할 일 제목을 입력하세요.");
    if (!title) {
      return;
    }
    applyState(await dataApi.addTask({ id: crypto.randomUUID(), title, note: "직접 추가한 할 일", tag: "일반", done: false, studyDate: selectedDate }));
  });

  byId("itemForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const saved = await saveItemFromDialog();
      if (saved) {
        byId("itemDialog").close();
      }
    } catch (error) {
      window.alert(error.message || "저장에 실패했습니다.");
    }
  });

  byId("closeDialogBtn").addEventListener("click", () => byId("itemDialog").close());
  byId("cancelDialogBtn").addEventListener("click", () => byId("itemDialog").close());

  byId("completeReviewBtn").addEventListener("click", async () => {
    if (reviewSelection.size === 0) {
      return;
    }
    const selectedIds = [...reviewSelection];
    reviewSelection.clear();
    applyState(await dataApi.completeReview(selectedIds, selectedDate));
  });

  byId("resetDataBtn").addEventListener("click", async () => {
    reviewSelection.clear();
    applyState(await dataApi.resetSampleData());
    setStorageStatus("SQLite 데이터를 초기화했습니다.");
  });

  byId("exportDataBtn").addEventListener("click", async () => {
    const result = await dataApi.exportData();
    setStorageStatus(`내보내기 완료: ${result.exportsDir}`);
  });

  byId("importCsvBtn").addEventListener("click", async () => {
    applyState(await dataApi.importCsv(selectedDate));
    setStorageStatus("exports 폴더의 CSV를 SQLite로 가져왔습니다.");
  });

  byId("importBackupBtn").addEventListener("click", async () => {
    try {
      reviewSelection.clear();
      applyState(await dataApi.importBackup());
      setStorageStatus("full-backup.yaml에서 전체 데이터를 복원했습니다.");
    } catch (error) {
      setStorageStatus(error.message);
    }
  });

  window.NihonGoTts.init();

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

async function submitQuizChoice(kind, selectedAnswer) {
  const quiz = kind === "kanji" ? kanjiQuiz : wordQuiz;
  const response = await dataApi.submitWordQuizAnswer({
    quizKind: kind,
    itemId: quiz.question.item.id,
    selectedAnswer,
    answerType: quiz.question.answerType,
    studyDate: selectedDate
  });
  const updatedItem = response.state.items.find(item => item.id === quiz.question.item.id) || quiz.question.item;
  const nextQuiz = {
    ...quiz,
    question: { ...quiz.question, item: updatedItem },
    answered: true,
    selectedAnswer,
    result: response.result
  };
  state = response.state;

  if (kind === "kanji") {
    kanjiQuiz = nextQuiz;
    renderKanjiQuiz();
  } else {
    wordQuiz = nextQuiz;
    renderWordQuiz();
  }
  renderStats();
}
