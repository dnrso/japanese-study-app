// Imported by relative path, not by package name: nothing in this repo
// resolves bare @nihongo-study specifiers at runtime. The desktop renderer
// loads shared packages as plain ES modules with no bundler, and the packaged
// app.asar carries no @nihongo-study scope in node_modules, so the relative
// form is the one that works everywhere. Vite handles it fine too.
import {
  addDays,
  createSampleState,
  itemToRawText,
  kindLabel,
  normalizeDailyKind,
  normalizeDate,
  normalizeDeletedAt,
  normalizeOptionalDate,
  normalizeReview,
  normalizeReviewCompletionTargets,
  missingDailyEntryMessage,
  parseDailyEntry as parseCanonicalDailyEntry,
  pruneStaleTombstones,
  reviewIntervals,
  text,
  todayKey,
  toNumber,
  withKanjiItems
} from "../../storage-core/src/index.js";

const databaseVersion = 2;

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
  // First-run seeding stays opt-in (the host has to ask for it), but
  // resetSampleData() - the "샘플 데이터" button - always restores sample data,
  // falling back to the shared seed in @nihongo-study/storage-core when the
  // host injected none. storage-sqlite does exactly the same, so the button
  // behaves identically on desktop and web.
  const seedState = typeof options.seedState === "function" ? options.seedState : null;
  const sampleState = seedState || createSampleState;
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
      getAllActive("studyDays"),
      getAllActive("dailyEntries"),
      getAllActive("tasks"),
      getAllActive("items"),
      getAllActive("dailyEntryLinks")
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
    if (!entry || entry.deletedAt) {
      return getState(studyDate);
    }
    const allEntries = await getAll("dailyEntries");
    const allLinks = await getAll("dailyEntryLinks");
    const removeIds = new Set([id]);
    if (entry.kind === "sentence") {
      allEntries
        .filter(candidate => candidate.parentId === id && !candidate.deletedAt)
        .forEach(candidate => removeIds.add(candidate.id));
    }

    const tombstoneAt = now();
    await runTransaction(["dailyEntries", "dailyEntryLinks"], "readwrite", transaction => {
      const entryStore = transaction.objectStore("dailyEntries");
      const linkStore = transaction.objectStore("dailyEntryLinks");
      removeIds.forEach(removeId => {
        const candidate = allEntries.find(item => item.id === removeId);
        if (candidate) {
          entryStore.put({ ...candidate, deletedAt: tombstoneAt, updatedAt: tombstoneAt });
        }
      });
      allLinks
        .filter(link => (removeIds.has(link.entryId) || removeIds.has(link.sentenceId)) && !link.deletedAt)
        .forEach(link => linkStore.put({ ...link, deletedAt: tombstoneAt, updatedAt: tombstoneAt }));
    });

    return getState(studyDate || entry.studyDate);
  }

  // ONE TRANSACTION PER ENTRY, on purpose (D13 in
  // tests/storage-conformance.test.js). The catch used to sit inside a single
  // runTransaction callback spanning the whole batch, where it could only ever
  // see a synchronous throw: an IndexedDB request fails asynchronously, so a
  // failed put aborted the transaction, rejected runTransaction's promise and
  // rejected this function - leaving `errors` empty and the caller with nothing
  // to show. IndexedDB gives no way to continue past a failed request inside
  // the same transaction (an unhandled request error aborts it), so "report the
  // failure AND keep going" requires a transaction boundary per entry. That is
  // also exactly storage-sqlite's granularity: it wraps each id in its own
  // db.transaction and catches per id (packages/storage-sqlite/src/index.js:667),
  // so on both adapters a mid-batch failure leaves the entries before it
  // committed and the entries after it still processed - atomic per entry, not
  // per batch.
  async function registerDailyEntries(ids = [], studyDate = todayKey()) {
    const entries = await getAllActive("dailyEntries");
    const links = await getAllActive("dailyEntryLinks");
    const items = await getAllActive("items");
    const registered = [];
    const duplicates = [];
    const linked = [];
    const errors = [];
    // kind::title of everything already collected. Seeded from the snapshot
    // read above and extended as rows are written, because an IDB write is
    // not readable again inside the same transaction: without it a batch that
    // derives the same 한자 twice (two words sharing a character, or a word
    // whose 한자 is also being registered) would insert it twice.
    const existingKeys = new Set(items.map(item => `${item.kind}::${item.title}`));

    for (const id of ids) {
      // Matched against the in-memory snapshot rather than a store.get(id):
      // a non-string id (a dropped/garbled IPC argument) is not a valid IDB
      // key and would throw DataError instead of reporting anything.
      const entry = entries.find(candidate => candidate.id === id);
      if (!entry) {
        // D11: an unknown id is an error, not a duplicate. storage-sqlite
        // reports the same string.
        errors.push(missingDailyEntryMessage);
        continue;
      }

      const pending = [];
      const claimedKeys = [];
      let duplicateCount = 0;
      itemsFromDailyEntry(entry, parentSentenceTitle(entry, entries, links)).forEach(candidate => {
        if (!candidate.title) {
          return;
        }
        const key = `${candidate.kind}::${candidate.title}`;
        if (existingKeys.has(key)) {
          duplicates.push(`${kindLabel(candidate.kind)}: ${candidate.title}`);
          duplicateCount += 1;
          return;
        }
        existingKeys.add(key);
        claimedKeys.push(key);
        pending.push(candidate);
      });

      // Nothing to write and nothing to report: leave `registered` alone, the
      // way sqlite does (it only stamps the flag when something happened).
      if (!pending.length && !duplicateCount) {
        continue;
      }

      try {
        await runTransaction(["dailyEntries", "items"], "readwrite", transaction => {
          const itemStore = transaction.objectStore("items");
          pending.forEach(candidate => itemStore.put(candidate));
          transaction.objectStore("dailyEntries").put({ ...entry, registered: true, updatedAt: now() });
        });
        pending.forEach(candidate => registered.push(`${kindLabel(candidate.kind)}: ${candidate.title}`));
      } catch (error) {
        errors.push(error?.message || String(error));
        // The transaction rolled back, so nothing was collected after all: give
        // the titles back so a later entry in the same batch can still claim
        // them, and report nothing as registered.
        claimedKeys.forEach(key => existingKeys.delete(key));
      }
    }

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
    const item = await getValue("items", id);
    if (item && !item.deletedAt) {
      const tombstoneAt = now();
      await putValue("items", { ...item, deletedAt: tombstoneAt, updatedAt: tombstoneAt });
    }
    return getState(studyDate);
  }

  async function updateItemReview(id, review, studyDate = todayKey()) {
    const item = await getValue("items", id);
    if (item) {
      const nextReview = normalizeReview(review);
      await putValue("items", {
        ...item,
        review: nextReview,
        // Due dates are scheduled from today, not from the browsed studyDate
        // (matches storage-sqlite; otherwise reviewing while viewing a past
        // date yields an already-past due date that promoteDueReviews
        // immediately flips back to "오늘").
        reviewDueDate: reviewDueDateFor(nextReview),
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
    const items = await getAllActive("items");
    const reviewedAt = now();
    await runTransaction(["items"], "readwrite", transaction => {
      const store = transaction.objectStore("items");
      normalized.forEach(target => {
        const item = items.find(candidate => candidate.id === target.id && candidate.kind !== "source");
        if (item) {
          store.put({
            ...item,
            review: target.review,
            // Scheduled from today, not the browsed studyDate (see updateItemReview).
            reviewDueDate: reviewDueDateFor(target.review),
            lastReviewedAt: reviewedAt,
            updatedAt: reviewedAt
          });
        }
      });
    });
    return getState(studyDate);
  }

  async function submitWordQuizAnswer(payload = {}) {
    const quizKind = ["word", "kanji"].includes(text(payload.quizKind)) ? text(payload.quizKind) : "word";
    const item = await getValue("items", text(payload.itemId));
    if (!item || item.deletedAt || item.kind !== quizKind) {
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
      // Scheduled from today, not the browsed payload.studyDate (see updateItemReview).
      nextItem.reviewDueDate = reviewDueDateFor(nextReview);
      nextItem.lastReviewedAt = nextItem.updatedAt;
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
    const seed = sampleState();
    // seedDatabase() clears every store (and re-stamps the "initialized" meta
    // flag) inside the same transaction before it writes the seed.
    await seedDatabase(seed);
    // The seed's own date, not today: identical for the shared sample (which
    // is built around today) and correct for an injected seed that is not.
    return getState(normalizeDate(seed.selectedDate));
  }

  async function exportData() {
    const data = {
      selectedDate: todayKey(),
      studyDays: pruneStaleTombstones(await getAll("studyDays")),
      dailyEntries: pruneStaleTombstones(await getAll("dailyEntries")),
      dailyEntryLinks: pruneStaleTombstones(await getAll("dailyEntryLinks")),
      tasks: pruneStaleTombstones(await getAll("tasks")),
      items: pruneStaleTombstones(await getAll("items"))
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

  async function getAllActive(storeName) {
    return (await getAll(storeName)).filter(record => !record.deletedAt);
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
    const dueItems = (await getAllActive("items")).filter(item =>
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
    createdAt: text(link.createdAt || link.created_at || now()),
    updatedAt: text(link.updatedAt || link.updated_at || link.createdAt || link.created_at || now()),
    deletedAt: normalizeDeletedAt(link.deletedAt || link.deleted_at)
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
    updatedAt: text(day.updatedAt || now()),
    deletedAt: normalizeDeletedAt(day.deletedAt)
  };
}

function ensureStudyDayPayload(studyDate) {
  return {
    studyDate,
    minutes: 0,
    summary: "",
    note: "",
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null
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
    // The shared parser returns structured items, not the source bullet line,
    // so regenerate the candidate's raw text the way the sqlite adapter's
    // dailyCandidatePayload does. Keeps both adapters' stored rawText equal.
    rawText: itemToRawText(item),
    parsed: { ...item, kind },
    registered: false,
    sourceSentences: [{ id: sentence.id, title: sentence.title, studyDate: sentence.studyDate }]
  });
  transaction.objectStore("dailyEntries").put(entry);
  transaction.objectStore("dailyEntryLinks").put(linkPayload(entry.id, sentence.id));
}

// Every collection item a single daily entry registers into: the entry itself
// plus, for a word carrying 한자=..., one 한자 item per character.
//
// A sentence entry registers as a `sentence` item (D9). It used to be filtered
// out of registerDailyEntries entirely, so on web the 등록 call was a silent
// no-op - no item, no duplicate, no error, no message - while desktop created a
// 문장 item. The shape here is the one dailyEntryToItems' sentence branch in
// @nihongo-study/storage-core builds for sqlite: fixed part 문장 / script 혼합,
// note = the parsed raw text, no `source` (a sentence has no parent sentence to
// name, so it keeps an empty one rather than gaining the "오늘 공부" fallback -
// packages/storage-sqlite/src/index.js:619 does the same) and no 한자 items
// (withKanjiItems only derives them from a `word`).
//
// The 한자 derivation is withKanjiItems from @nihongo-study/storage-core - the
// same shared helper storage-sqlite has always run here (and in upsertItem).
// It used to be desktop-only, so the web/Android 한자 collection could never
// fill from daily entries at all (D10 in tests/storage-conformance.test.js).
// It is forward-only: entries registered before this change are untouched, and
// re-registering one is a no-op because the duplicate check below already
// covers the derived items.
//
// `source` is the provenance both adapters now agree on (D8): the title of the
// sentence this entry came from, resolved by parentSentenceTitle below and
// passed in. `level` is deliberately NOT set - this adapter used to stamp "웹"
// on every registered item, encoding the platform in a field the UI presents as
// a free-text 레벨/난이도. The field stays user-editable; nothing invents a
// value for it any more.
function itemsFromDailyEntry(entry, parentTitle) {
  const isSentence = entry.kind === "sentence";
  const item = {
    kind: entry.kind,
    title: entry.title,
    reading: entry.reading,
    meaning: entry.meaning,
    part: isSentence ? "문장" : entry.parsed?.part,
    script: isSentence ? "혼합" : entry.parsed?.script,
    kanji: isSentence ? "" : entry.parsed?.kanji,
    review: "대기",
    source: isSentence ? "" : parentTitle || "오늘 공부",
    note: entry.parsed?.note || "",
    sourceSentences: entry.sourceSentences || []
  };
  // Derived from the un-normalized shape on purpose: withKanjiItems reads
  // kind/kanji/level/title/reading straight off it, so the 한자 items inherit
  // the word's (now empty) level and get source = the word's own title.
  return withKanjiItems([item]).map(normalizeItem);
}

// Accepts either the canonical exchange shape (structured `parsed` object)
// or a legacy sqlite-shaped entry that only carries a `parsedJson`/
// `parsed_json` string, so pre-parity desktop backup files still import
// without losing the parsed word/grammar/expression breakdown.
function normalizeDailyEntry(entry = {}) {
  const parsed = entry.parsed && typeof entry.parsed === "object"
    ? entry.parsed
    : parseLegacyParsedJson(entry.parsedJson ?? entry.parsed_json);
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
    updatedAt: text(entry.updatedAt || now()),
    deletedAt: normalizeDeletedAt(entry.deletedAt)
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
    updatedAt: text(task.updatedAt || now()),
    deletedAt: normalizeDeletedAt(task.deletedAt)
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
    lastReviewedAt: text(item.lastReviewedAt),
    createdAt: text(item.createdAt || now()),
    updatedAt: text(item.updatedAt || now()),
    deletedAt: normalizeDeletedAt(item.deletedAt)
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

function parseLegacyParsedJson(value) {
  if (typeof value !== "string" || !value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Thin adapter over the shared parser in @nihongo-study/storage-core. This
// adapter used to carry its own reimplementation (parseSentenceBlock /
// parseInlineEntry), which mangled every markdown-bulleted variant of the
// format - see the parser's own header.
//
// The only adapter-specific bit left: for word/grammar/expression entries this
// adapter persists 품사/문자/한자 as flat fields on the entry's `parsed` blob
// and reads them back in itemsFromDailyEntry when registering. The canonical
// parser exposes them per-bullet in `parsed.words`, so lift the first inline
// match up exactly the way the sqlite adapter's dailyEntryToItems does
// (parsed.note is the trimmed raw text `parsed.words` was parsed from, so
// parsed.words[0] and parseWordLines(parsed.note)[0] are the same object).
function parseDailyEntry(kind, rawText) {
  const parsed = parseCanonicalDailyEntry(kind, rawText);
  if (parsed.kind === "sentence") {
    return parsed;
  }
  const [inlineWord] = parsed.words;
  return {
    ...parsed,
    kanji: inlineWord?.kanji || "",
    part: inlineWord?.part || "",
    script: inlineWord?.script || ""
  };
}

// The title of the sentence a word/grammar/expression entry came from - the
// `source` every registered item gets (D8). Resolution order is the one
// storage-sqlite uses (packages/storage-sqlite/src/index.js:264 and
// dataImportExport.js:64), so both adapters produce the same string for the
// same data: a stored parentTitle (only legacy desktop imports carry one), else
// the parent entry looked up by parentId, else the first linked sentence.
//
// Returns "" for a manually added standalone entry (the 단어/문법/표현 input has
// no parent sentence at all); the caller supplies the "오늘 공부" fallback.
//
// Known limitation, deliberate for now: this copies the title, so renaming a
// sentence orphans the items registered from it.
function parentSentenceTitle(entry, allEntries, links) {
  if (entry.parentTitle) {
    return text(entry.parentTitle);
  }
  if (entry.parentId) {
    const parent = allEntries.find(candidate => candidate.id === entry.parentId);
    if (parent?.title) {
      return text(parent.title);
    }
  }
  const [first] = sourceSentencesForEntry(entry, allEntries, links);
  return text(first?.title);
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
  const createdAt = now();
  return {
    id: `${entryId}::${sentenceId}`,
    entryId,
    sentenceId,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null
  };
}

function reviewDueDateFor(review, baseDate = todayKey()) {
  const days = reviewIntervals[review];
  return days ? addDays(normalizeDate(baseDate), days) : "";
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
