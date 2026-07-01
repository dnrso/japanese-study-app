const databaseVersion = 2;

const reviewIntervals = {
  "내일": 1,
  "3일 후": 3,
  "일주일": 7,
  "2주일": 14,
  "한달": 30
};

const reviewStates = ["오늘", ...Object.keys(reviewIntervals), "대기"];
const storeDefinitions = [
  { name: "meta", options: { keyPath: "key" }, indexes: [] },
  { name: "studyDays", options: { keyPath: "studyDate" }, indexes: [] },
  {
    name: "dailyEntries",
    options: { keyPath: "id" },
    indexes: [
      { name: "studyDate", keyPath: "studyDate" },
      { name: "kind", keyPath: "kind" },
      { name: "parentId", keyPath: "parentId" }
    ]
  },
  {
    name: "dailyEntryLinks",
    options: { keyPath: "id" },
    indexes: [
      { name: "entryId", keyPath: "entryId" },
      { name: "sentenceId", keyPath: "sentenceId" }
    ]
  },
  {
    name: "tasks",
    options: { keyPath: "id" },
    indexes: [{ name: "studyDate", keyPath: "studyDate" }]
  },
  {
    name: "items",
    options: { keyPath: "id" },
    indexes: [{ name: "kind", keyPath: "kind" }]
  }
];
const stores = storeDefinitions.map(store => store.name);

export function createIdbStorage(options = {}) {
  const dbName = options.dbName || "nihongo-study";
  const seedState = typeof options.seedState === "function" ? options.seedState : null;
  let dbPromise = null;

  const paths = {
    appDataDir: "IndexedDB",
    exportsDir: "Browser download",
    backupsDir: "Browser download",
    dbPath: dbName
  };

  async function initDatabase() {
    const db = await getDb();
    const meta = await getValue("meta", "initialized");
    if (!meta && seedState) {
      await seedDatabase(seedState());
    }
    return db;
  }

  async function getState(studyDate = todayKey()) {
    await promoteDueReviews();
    const selectedDate = normalizeDate(studyDate);
    const [studyDays, allDailyEntries, tasks, items, links] = await Promise.all([
      getAll("studyDays"),
      getAll("dailyEntries"),
      getAll("tasks"),
      getAll("items"),
      getAll("dailyEntryLinks")
    ]);

    const allDailyEntriesWithLinks = allDailyEntries
      .sort(sortNewest)
      .map(entry => ({ ...entry, sourceSentences: sourceSentencesForEntry(entry, allDailyEntries, links) }));

    const dailyEntries = allDailyEntriesWithLinks
      .filter(entry => entry.studyDate === selectedDate)
      .sort(sortNewest);

    const itemsWithLinks = items
      .sort(sortNewest)
      .map(item => ({ ...item, sourceSentences: sourceSentencesForItem(item, allDailyEntries, links) }));

    const studyDaysWithCounts = studyDays
      .map(day => ({
        ...day,
        entryCount: allDailyEntries.filter(entry => entry.studyDate === day.studyDate).length
      }))
      .sort((left, right) => right.studyDate.localeCompare(left.studyDate));

    return {
      selectedDate,
      studyLog: studyLogForDate(studyDays, selectedDate),
      studyDays: studyDaysWithCounts,
      dailyEntries,
      allDailyEntries: allDailyEntriesWithLinks,
      tasks: tasks.sort(sortNewest),
      items: itemsWithLinks
    };
  }

  async function saveStudyLog(studyLog = {}) {
    const payload = normalizeStudyLog(studyLog);
    const existing = await getValue("studyDays", payload.studyDate);
    await putValue("studyDays", {
      ...existing,
      ...payload,
      updatedAt: now()
    });
    return getState(payload.studyDate);
  }

  async function addDailyEntry(entry = {}) {
    const studyDate = normalizeDate(entry.studyDate);
    const kind = normalizeDailyKind(entry.kind);
    const parsed = parseDailyEntry(kind, entry.rawText || entry.title || "");
    const parentId = text(entry.parentId);
    const payload = normalizeDailyEntry({
      id: createId(),
      studyDate,
      parentId,
      kind,
      title: parsed.title,
      reading: parsed.reading,
      meaning: parsed.meaning,
      rawText: entry.rawText,
      parsed,
      registered: false
    });

    await runTransaction(["studyDays", "dailyEntries", "dailyEntryLinks"], "readwrite", transaction => {
      transaction.objectStore("studyDays").put(ensureStudyDayPayload(studyDate));
      transaction.objectStore("dailyEntries").put(payload);
      if (parentId) {
        transaction.objectStore("dailyEntryLinks").put(linkPayload(payload.id, parentId));
      }
      if (kind === "sentence") {
        parsed.words.forEach(item => putDailyCandidate(transaction, payload, "word", item));
        parsed.grammar.forEach(item => putDailyCandidate(transaction, payload, "grammar", item));
        parsed.expressions.forEach(item => putDailyCandidate(transaction, payload, "expression", item));
      }
    });

    return getState(studyDate);
  }

  async function deleteDailyEntry(id, studyDate = todayKey()) {
    const entry = await getValue("dailyEntries", id);
    if (!entry) {
      return getState(studyDate);
    }
    const allEntries = await getAll("dailyEntries");
    const allLinks = await getAll("dailyEntryLinks");
    const removeIds = new Set([id]);
    if (entry.kind === "sentence") {
      allEntries
        .filter(candidate => candidate.parentId === id)
        .forEach(candidate => removeIds.add(candidate.id));
    }

    await runTransaction(["dailyEntries", "dailyEntryLinks"], "readwrite", transaction => {
      const entryStore = transaction.objectStore("dailyEntries");
      const linkStore = transaction.objectStore("dailyEntryLinks");
      removeIds.forEach(removeId => entryStore.delete(removeId));
      allLinks
        .filter(link => removeIds.has(link.entryId) || removeIds.has(link.sentenceId))
        .forEach(link => linkStore.delete(link.id));
    });

    return getState(studyDate || entry.studyDate);
  }

  async function registerDailyEntries(ids = [], studyDate = todayKey()) {
    const entries = await getAll("dailyEntries");
    const items = await getAll("items");
    const targets = entries.filter(entry => ids.includes(entry.id) && ["word", "grammar", "expression"].includes(entry.kind));
    const registered = [];
    const duplicates = [];
    const linked = [];
    const errors = [];

    await runTransaction(["dailyEntries", "items"], "readwrite", transaction => {
      const entryStore = transaction.objectStore("dailyEntries");
      const itemStore = transaction.objectStore("items");
      targets.forEach(entry => {
        try {
          const exists = items.some(item => item.kind === entry.kind && item.title === entry.title);
          if (exists) {
            duplicates.push(`${kindLabel(entry.kind)}: ${entry.title}`);
          } else {
            itemStore.put(itemFromDailyEntry(entry));
            registered.push(`${kindLabel(entry.kind)}: ${entry.title}`);
          }
          entryStore.put({ ...entry, registered: true, updatedAt: now() });
        } catch (error) {
          errors.push(error.message || String(error));
        }
      });
    });

    return {
      state: await getState(studyDate),
      result: { registered, duplicates, linked, errors }
    };
  }

  async function addTask(task = {}) {
    const payload = normalizeTask({ ...task, id: task.id || createId() });
    await putValue("tasks", payload);
    return getState(task.studyDate);
  }

  async function updateTaskDone(id, done, studyDate = todayKey()) {
    const task = await getValue("tasks", id);
    if (task) {
      await putValue("tasks", { ...task, done: Boolean(done), updatedAt: now() });
    }
    return getState(studyDate);
  }

  async function upsertItem(item = {}) {
    const existing = item.id ? await getValue("items", item.id) : null;
    const payload = normalizeItem({
      ...existing,
      ...item,
      id: item.id || createId()
    });
    await putValue("items", payload);
    return getState(item.studyDate);
  }

  async function deleteItem(id, studyDate = todayKey()) {
    await deleteValue("items", id);
    return getState(studyDate);
  }

  async function updateItemReview(id, review, studyDate = todayKey()) {
    const item = await getValue("items", id);
    if (item) {
      const nextReview = normalizeReview(review);
      await putValue("items", {
        ...item,
        review: nextReview,
        reviewDueDate: reviewDueDateFor(nextReview, studyDate),
        updatedAt: now()
      });
    }
    return getState(studyDate);
  }

  async function completeReview(targets = [], studyDate = todayKey()) {
    const normalized = normalizeReviewCompletionTargets(targets);
    if (!normalized.length) {
      return getState(studyDate);
    }
    const items = await getAll("items");
    await runTransaction(["items"], "readwrite", transaction => {
      const store = transaction.objectStore("items");
      normalized.forEach(target => {
        const item = items.find(candidate => candidate.id === target.id && candidate.kind !== "source");
        if (item) {
          store.put({
            ...item,
            review: target.review,
            reviewDueDate: reviewDueDateFor(target.review, studyDate),
            updatedAt: now()
          });
        }
      });
    });
    return getState(studyDate);
  }

  async function submitWordQuizAnswer(payload = {}) {
    const quizKind = ["word", "kanji"].includes(text(payload.quizKind)) ? text(payload.quizKind) : "word";
    const item = await getValue("items", text(payload.itemId));
    if (!item || item.kind !== quizKind) {
      return { state: await getState(payload.studyDate), result: { correct: false, missing: true } };
    }

    const answerType = text(payload.answerType) === "title" ? "title" : "meaning";
    const correctAnswer = answerType === "title" ? item.title : item.meaning;
    const correct = text(payload.selectedAnswer ?? payload.selectedMeaning) === text(correctAnswer);
    const nextReview = normalizeReview(payload.correctReview || payload.reviewAfterCorrect);
    const nextItem = {
      ...item,
      quizCorrectCount: Number(item.quizCorrectCount || 0) + (correct ? 1 : 0),
      quizWrongCount: Number(item.quizWrongCount || 0) + (correct ? 0 : 1),
      lastQuizzedAt: now(),
      updatedAt: now()
    };

    let reviewUpdated = false;
    if (correct && payload.updateReviewOnCorrect && nextReview) {
      nextItem.review = nextReview;
      nextItem.reviewDueDate = reviewDueDateFor(nextReview, payload.studyDate);
      reviewUpdated = true;
    }

    await putValue("items", nextItem);
    return {
      state: await getState(payload.studyDate),
      result: {
        correct,
        correctAnswer,
        correctMeaning: item.meaning,
        reviewUpdated,
        nextReview: reviewUpdated ? nextReview : "",
        nextReviewDueDate: reviewUpdated ? nextItem.reviewDueDate : ""
      }
    };
  }

  async function clearAllData() {
    await runTransaction(stores, "readwrite", transaction => {
      stores.forEach(name => transaction.objectStore(name).clear());
      transaction.objectStore("meta").put({ key: "initialized", value: true });
    });
    return getState();
  }

  async function resetSampleData() {
    await runTransaction(stores, "readwrite", transaction => {
      stores.forEach(name => transaction.objectStore(name).clear());
    });
    if (seedState) {
      await seedDatabase(seedState());
    } else {
      await putValue("meta", { key: "initialized", value: true });
    }
    return getState();
  }

  async function exportData() {
    const data = {
      selectedDate: todayKey(),
      studyDays: await getAll("studyDays"),
      dailyEntries: await getAll("dailyEntries"),
      dailyEntryLinks: await getAll("dailyEntryLinks"),
      tasks: await getAll("tasks"),
      items: await getAll("items")
    };
    return { ...paths, data };
  }

  async function importCsvExports(importData = null, studyDate = todayKey()) {
    if (typeof importData === "string") {
      return getState(importData);
    }

    const rows = normalizeCsvImportRows(importData);
    if (!rows.length) {
      return getState(studyDate);
    }

    await runTransaction(["items"], "readwrite", transaction => {
      const itemStore = transaction.objectStore("items");
      rows.forEach(row => itemStore.put(normalizeItem({ ...row, id: row.id || createId() })));
    });
    return getState(studyDate);
  }

  async function importFullBackup(backup = null) {
    if (!backup || typeof backup !== "object") {
      return getState();
    }

    const source = backup.data && typeof backup.data === "object" ? backup.data : backup;
    const selectedDate = normalizeDate(source.selectedDate || backup.selectedDate);
    await seedDatabase(source);
    return getState(selectedDate);
  }

  async function seedDatabase(seed) {
    const normalized = normalizeSeedState(seed);
    await runTransaction(stores, "readwrite", transaction => {
      stores.forEach(name => transaction.objectStore(name).clear());
      const metaStore = transaction.objectStore("meta");
      metaStore.put({ key: "initialized", value: true });
      normalized.studyDays.forEach(day => transaction.objectStore("studyDays").put(day));
      normalized.dailyEntries.forEach(entry => transaction.objectStore("dailyEntries").put(entry));
      normalized.dailyEntryLinks.forEach(link => transaction.objectStore("dailyEntryLinks").put(link));
      normalized.tasks.forEach(task => transaction.objectStore("tasks").put(task));
      normalized.items.forEach(item => transaction.objectStore("items").put(item));
    });
  }

  function getDb() {
    if (!dbPromise) {
      dbPromise = openDatabase(dbName);
    }
    return dbPromise;
  }

  async function getAll(storeName) {
    const db = await getDb();
    return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  }

  async function getValue(storeName, key) {
    const db = await getDb();
    return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
  }

  async function putValue(storeName, value) {
    await runTransaction([storeName], "readwrite", transaction => {
      transaction.objectStore(storeName).put(value);
    });
  }

  async function deleteValue(storeName, key) {
    await runTransaction([storeName], "readwrite", transaction => {
      transaction.objectStore(storeName).delete(key);
    });
  }

  async function runTransaction(storeNames, mode, callback) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      try {
        callback(transaction);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async function promoteDueReviews() {
    const today = todayKey();
    const dueItems = (await getAll("items")).filter(item =>
      item.reviewDueDate && item.reviewDueDate <= today && item.kind !== "source"
    );
    if (!dueItems.length) {
      return;
    }
    await runTransaction(["items"], "readwrite", transaction => {
      const store = transaction.objectStore("items");
      dueItems.forEach(item => {
        store.put({
          ...item,
          review: "오늘",
          reviewDueDate: "",
          updatedAt: now()
        });
      });
    });
  }

  return {
    initDatabase,
    getState,
    saveStudyLog,
    addDailyEntry,
    deleteDailyEntry,
    registerDailyEntries,
    addTask,
    updateTaskDone,
    upsertItem,
    deleteItem,
    updateItemReview,
    completeReview,
    submitWordQuizAnswer,
    resetSampleData,
    clearAllData,
    exportData,
    importCsvExports,
    importFullBackup,
    paths
  };
}

function openDatabase(dbName) {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }
  return openDatabaseWithVersion(dbName, databaseVersion, true);
}

function openDatabaseWithVersion(dbName, version, allowRepair) {
  return new Promise((resolve, reject) => {
    const request = version
      ? globalThis.indexedDB.open(dbName, version)
      : globalThis.indexedDB.open(dbName);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;
      ensureDatabaseSchema(db, transaction);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const missingStores = missingObjectStores(db);
      if (missingStores.length) {
        if (allowRepair) {
          const repairVersion = db.version + 1;
          db.close();
          openDatabaseWithVersion(dbName, repairVersion, false).then(resolve, reject);
          return;
        }
        db.close();
        reject(new Error(`IndexedDB schema is incomplete. Missing object stores: ${missingStores.join(", ")}`));
        return;
      }
      resolve(db);
    };
    request.onerror = () => {
      if (allowRepair && version && request.error?.name === "VersionError") {
        openDatabaseWithVersion(dbName, undefined, true).then(resolve, reject);
        return;
      }
      reject(request.error);
    };
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open tab."));
  });
}

function ensureDatabaseSchema(db, transaction) {
  storeDefinitions.forEach(definition => {
    const store = createStore(db, transaction, definition.name, definition.options);
    definition.indexes.forEach(index => createIndex(store, index.name, index.keyPath));
  });
}

function missingObjectStores(db) {
  return stores.filter(name => !db.objectStoreNames.contains(name));
}

function createStore(db, transaction, name, options) {
  if (db.objectStoreNames.contains(name)) {
    return transaction.objectStore(name);
  }
  return db.createObjectStore(name, options);
}

function createIndex(store, name, keyPath) {
  if (store && !store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique: false });
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeSeedState(seed = {}) {
  const selectedDate = normalizeDate(seed.selectedDate);
  const dailyEntries = (seed.allDailyEntries || seed.dailyEntries || []).map(normalizeDailyEntry);
  const importedLinks = Array.isArray(seed.dailyEntryLinks)
    ? seed.dailyEntryLinks.map(normalizeDailyEntryLink).filter(link => link.entryId && link.sentenceId)
    : [];
  const dailyEntryLinks = importedLinks.length
    ? importedLinks
    : dailyEntries
      .flatMap(entry => (entry.sourceSentences || []).map(sentence => linkPayload(entry.id, sentence.id)))
      .filter(link => link.entryId && link.sentenceId);
  const studyDays = normalizeStudyDays(seed.studyDays || [], dailyEntries, seed.studyLog, selectedDate);
  return {
    studyDays,
    dailyEntries,
    dailyEntryLinks,
    tasks: (seed.tasks || []).map(normalizeTask),
    items: (seed.items || []).map(normalizeItem)
  };
}

function normalizeCsvImportRows(importData) {
  if (!importData || typeof importData !== "object") {
    return [];
  }

  const source = importData.data && typeof importData.data === "object" ? importData.data : importData;
  if (Array.isArray(source.items)) {
    return source.items;
  }

  const kindAliases = {
    source: ["source", "sources"],
    word: ["word", "words"],
    grammar: ["grammar", "grammars"],
    expression: ["expression", "expressions"],
    kanji: ["kanji", "kanjis"]
  };

  return Object.entries(kindAliases).flatMap(([kind, aliases]) =>
    aliases.flatMap(alias => Array.isArray(source[alias])
      ? source[alias].map(row => ({ ...row, kind: row.kind || kind }))
      : [])
  );
}

function normalizeDailyEntryLink(link = {}) {
  const entryId = text(link.entryId || link.entry_id);
  const sentenceId = text(link.sentenceId || link.sentence_id);
  return {
    id: text(link.id || `${entryId}::${sentenceId}`),
    entryId,
    sentenceId,
    createdAt: text(link.createdAt || link.created_at || now())
  };
}

function normalizeStudyDays(studyDays, dailyEntries, studyLog = {}, selectedDate) {
  const days = new Map(studyDays.map(day => [normalizeDate(day.studyDate), normalizeStudyDay(day)]));
  dailyEntries.forEach(entry => {
    if (!days.has(entry.studyDate)) {
      days.set(entry.studyDate, ensureStudyDayPayload(entry.studyDate));
    }
  });
  const selected = days.get(selectedDate) || ensureStudyDayPayload(selectedDate);
  days.set(selectedDate, {
    ...selected,
    minutes: toNumber(studyLog.minutes ?? selected.minutes),
    summary: text(studyLog.summary ?? selected.summary),
    note: text(studyLog.note ?? selected.note),
    updatedAt: now()
  });
  return [...days.values()];
}

function normalizeStudyDay(day = {}) {
  return {
    studyDate: normalizeDate(day.studyDate),
    minutes: toNumber(day.minutes),
    summary: text(day.summary),
    note: text(day.note),
    createdAt: text(day.createdAt || now()),
    updatedAt: text(day.updatedAt || now())
  };
}

function ensureStudyDayPayload(studyDate) {
  return {
    studyDate,
    minutes: 0,
    summary: "",
    note: "",
    createdAt: now(),
    updatedAt: now()
  };
}

function studyLogForDate(studyDays, selectedDate) {
  const day = studyDays.find(candidate => candidate.studyDate === selectedDate) || ensureStudyDayPayload(selectedDate);
  return {
    minutes: toNumber(day.minutes),
    summary: text(day.summary),
    note: text(day.note),
    totalMinutes: studyDays.reduce((sum, candidate) => sum + toNumber(candidate.minutes), 0)
  };
}

function putDailyCandidate(transaction, sentence, kind, item) {
  if (!item.title) {
    return;
  }
  const entry = normalizeDailyEntry({
    id: createId(),
    studyDate: sentence.studyDate,
    parentId: sentence.id,
    kind,
    title: item.title,
    reading: item.reading,
    meaning: item.meaning,
    rawText: item.rawText,
    parsed: { ...item, kind },
    registered: false,
    sourceSentences: [{ id: sentence.id, title: sentence.title, studyDate: sentence.studyDate }]
  });
  transaction.objectStore("dailyEntries").put(entry);
  transaction.objectStore("dailyEntryLinks").put(linkPayload(entry.id, sentence.id));
}

function itemFromDailyEntry(entry) {
  return normalizeItem({
    kind: entry.kind,
    title: entry.title,
    reading: entry.reading,
    meaning: entry.meaning,
    level: "웹",
    part: entry.parsed?.part,
    script: entry.parsed?.script,
    kanji: entry.parsed?.kanji,
    review: "대기",
    source: entry.parentTitle || "오늘 공부",
    note: entry.parsed?.note || "",
    sourceSentences: entry.sourceSentences || []
  });
}

function normalizeDailyEntry(entry = {}) {
  const parsed = entry.parsed || {};
  return {
    id: text(entry.id || createId()),
    studyDate: normalizeDate(entry.studyDate),
    parentId: text(entry.parentId),
    parentTitle: text(entry.parentTitle),
    kind: normalizeDailyKind(entry.kind),
    title: text(entry.title || parsed.title),
    reading: text(entry.reading || parsed.reading),
    meaning: text(entry.meaning || parsed.meaning),
    rawText: text(entry.rawText),
    parsed,
    registered: Boolean(entry.registered),
    sourceSentences: entry.sourceSentences || [],
    createdAt: text(entry.createdAt || now()),
    updatedAt: text(entry.updatedAt || now())
  };
}

function normalizeTask(task = {}) {
  return {
    id: text(task.id || createId()),
    title: text(task.title),
    note: text(task.note),
    tag: text(task.tag),
    done: Boolean(task.done),
    studyDate: normalizeDate(task.studyDate),
    createdAt: text(task.createdAt || now()),
    updatedAt: text(task.updatedAt || now())
  };
}

function normalizeItem(item = {}) {
  const kind = text(item.kind || "word");
  const review = kind === "source" ? "" : normalizeReview(item.review || "대기");
  return {
    id: text(item.id || createId()),
    kind,
    title: text(item.title),
    reading: text(item.reading),
    meaning: text(item.meaning),
    level: text(item.level),
    part: text(item.part),
    script: text(item.script),
    review,
    reviewDueDate: item.reviewDueDate === undefined ? reviewDueDateFor(review) : normalizeOptionalDate(item.reviewDueDate),
    kanji: text(item.kanji),
    source: text(item.source),
    note: text(item.note),
    quizCorrectCount: toNumber(item.quizCorrectCount),
    quizWrongCount: toNumber(item.quizWrongCount),
    lastQuizzedAt: text(item.lastQuizzedAt),
    createdAt: text(item.createdAt || now()),
    updatedAt: text(item.updatedAt || now())
  };
}

function normalizeStudyLog(studyLog = {}) {
  return {
    studyDate: normalizeDate(studyLog.studyDate),
    minutes: toNumber(studyLog.minutes),
    summary: text(studyLog.summary),
    note: text(studyLog.note)
  };
}

function parseDailyEntry(kind, rawText) {
  if (kind === "sentence") {
    return parseSentenceBlock(rawText);
  }
  return parseInlineEntry(rawText, kind);
}

function parseSentenceBlock(rawText) {
  const lines = text(rawText).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const title = cleanHeading(lines.find(line => !line.startsWith("읽기") && !line.startsWith("해석") && !["단어장", "문법", "표현"].includes(line)) || "새 문장");
  return {
    title,
    reading: cleanLabelLine(lines.find(line => line.startsWith("읽기")) || ""),
    meaning: cleanLabelLine(lines.find(line => line.startsWith("해석")) || ""),
    words: parseSectionEntries(lines, "단어장", "문법").map(line => parseInlineEntry(line, "word")),
    grammar: parseSectionEntries(lines, "문법", "표현").map(line => parseInlineEntry(line, "grammar")),
    expressions: parseSectionEntries(lines, "표현", "").map(line => parseInlineEntry(line, "expression"))
  };
}

function parseSectionEntries(lines, sectionName, nextSectionName) {
  const startIndex = lines.findIndex(line => line === sectionName);
  if (startIndex < 0) {
    return [];
  }
  const nextIndex = nextSectionName
    ? lines.findIndex((line, index) => index > startIndex && line === nextSectionName)
    : -1;
  return lines
    .slice(startIndex + 1, nextIndex > startIndex ? nextIndex : undefined)
    .filter(line => line && !["단어장", "문법", "표현"].includes(line));
}

function parseInlineEntry(rawText, kind) {
  const meta = {};
  const [mainPart, ...metaParts] = text(rawText).split("|").map(part => part.trim());
  metaParts.forEach(part => {
    const [key, ...valueParts] = part.split("=");
    if (key && valueParts.length) {
      meta[key.trim()] = valueParts.join("=").trim();
    }
  });

  const titleMatch = mainPart.match(/`([^`]+)`/) || mainPart.match(/^([^\s(]+)/);
  const readingMatch = mainPart.match(/\(([^)]+)\)/);
  const title = titleMatch?.[1] || "새 항목";
  const reading = readingMatch?.[1] || "";
  const meaning = mainPart
    .replace(/`[^`]+`/, "")
    .replace(/\([^)]+\)/, "")
    .trim() || title;

  return {
    kind,
    title,
    reading,
    meaning,
    kanji: meta["한자"] || "",
    part: meta["품사"] || "",
    script: meta["문자"] || "",
    note: meta["메모"] || "",
    rawText
  };
}

function sourceSentencesForEntry(entry, allEntries, links) {
  const sourceSentences = links
    .filter(link => link.entryId === entry.id)
    .map(link => allEntries.find(candidate => candidate.id === link.sentenceId))
    .filter(Boolean)
    .map(sentence => ({ id: sentence.id, title: sentence.title, studyDate: sentence.studyDate }));
  if (!sourceSentences.length && entry.parentId) {
    const parent = allEntries.find(candidate => candidate.id === entry.parentId);
    return parent ? [{ id: parent.id, title: parent.title, studyDate: parent.studyDate }] : [];
  }
  return uniqueSourceSentences(sourceSentences);
}

function sourceSentencesForItem(item, allEntries, links) {
  const dailyMatches = allEntries.filter(entry => entry.kind === item.kind && entry.title === item.title);
  return uniqueSourceSentences(dailyMatches.flatMap(entry => sourceSentencesForEntry(entry, allEntries, links)));
}

function uniqueSourceSentences(sourceSentences) {
  const seen = new Set();
  return sourceSentences.filter(sentence => {
    const key = `${sentence.studyDate || ""}::${sentence.title || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function linkPayload(entryId, sentenceId) {
  return {
    id: `${entryId}::${sentenceId}`,
    entryId,
    sentenceId,
    createdAt: now()
  };
}

function normalizeReviewCompletionTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }
  return targets
    .map(target => {
      if (target && typeof target === "object") {
        return {
          id: text(target.id),
          review: normalizeCompletionReview(target.review)
        };
      }
      return { id: text(target), review: "3일 후" };
    })
    .filter(target => target.id && target.review);
}

function normalizeCompletionReview(value) {
  const review = normalizeReview(value);
  if (review === "오늘") {
    return "3일 후";
  }
  return reviewIntervals[review] ? review : "";
}

function normalizeDailyKind(kind) {
  return ["sentence", "word", "grammar", "expression"].includes(kind) ? kind : "sentence";
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : todayKey();
}

function normalizeOptionalDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : "";
}

function normalizeReview(value) {
  const review = text(value);
  return reviewStates.includes(review) ? review : "대기";
}

function reviewDueDateFor(review, baseDate = todayKey()) {
  const days = reviewIntervals[review];
  return days ? addDays(normalizeDate(baseDate), days) : "";
}

function addDays(dateValue, days) {
  const [year, month, day] = normalizeDate(dateValue).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function todayKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanHeading(value) {
  return text(value).replace(/^#+\s*/, "").trim();
}

function cleanLabelLine(value) {
  return text(value).replace(/^(읽기|해석)\s*/, "").trim();
}

function kindLabel(kind) {
  return {
    sentence: "문장",
    word: "단어",
    grammar: "문법",
    expression: "표현",
    kanji: "한자",
    source: "자료"
  }[kind] || kind;
}

function sortNewest(left, right) {
  return text(right.createdAt).localeCompare(text(left.createdAt));
}

function now() {
  return new Date().toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value) {
  return String(value ?? "");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
