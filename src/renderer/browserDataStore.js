(function () {
  const DB_NAME = "nihongo-study";
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = "snapshots";
  const SNAPSHOT_KEY = "default";
  const LEGACY_STORAGE_KEY = "nihongo-study-web-data-v1";
  const reviewIntervals = {
    "내일": 1,
    "3일 후": 3,
    "일주일": 7,
    "2주일": 14,
    "한달": 30
  };
  const reviewStates = ["오늘", ...Object.keys(reviewIntervals), "대기"];
  let databasePromise = null;

  function createEmptySnapshot() {
    return {
      studyDays: [],
      dailyEntries: [],
      tasks: [],
      items: []
    };
  }

  function openDatabase() {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("이 브라우저는 IndexedDB를 지원하지 않습니다."));
    }
    if (databasePromise) {
      return databasePromise;
    }
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB를 열 수 없습니다."));
      request.onblocked = () => reject(new Error("다른 탭에서 IndexedDB 업데이트를 막고 있습니다."));
    });
    return databasePromise;
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB 요청에 실패했습니다."));
    });
  }

  async function readSnapshotRecord() {
    const database = await openDatabase();
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    return idbRequest(transaction.objectStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY));
  }

  async function writeSnapshotRecord(snapshot) {
    const database = await openDatabase();
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
    return idbRequest(transaction.objectStore(SNAPSHOT_STORE).put(normalizeSnapshot(snapshot), SNAPSHOT_KEY));
  }

  async function loadSnapshot() {
    const snapshot = await readSnapshotRecord();
    if (snapshot) {
      return normalizeSnapshot(snapshot);
    }
    const legacySnapshot = loadLegacySnapshot();
    if (hasSnapshotData(legacySnapshot)) {
      await saveSnapshot(legacySnapshot);
      clearLegacySnapshot();
      return legacySnapshot;
    }
    return createEmptySnapshot();
  }

  async function saveSnapshot(snapshot) {
    await writeSnapshotRecord(snapshot);
  }

  function loadLegacySnapshot() {
    try {
      return normalizeSnapshot(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null"));
    } catch {
      return createEmptySnapshot();
    }
  }

  function clearLegacySnapshot() {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // IndexedDB migration should still succeed if legacy cleanup is blocked.
    }
  }

  function hasSnapshotData(snapshot) {
    return snapshot.studyDays.length > 0 ||
      snapshot.dailyEntries.length > 0 ||
      snapshot.tasks.length > 0 ||
      snapshot.items.length > 0;
  }

  function normalizeSnapshot(snapshot) {
    const source = snapshot && typeof snapshot === "object" ? snapshot : {};
    return {
      studyDays: Array.isArray(source.studyDays) ? source.studyDays.map(normalizeStudyDay) : [],
      dailyEntries: Array.isArray(source.dailyEntries) ? source.dailyEntries.map(normalizeDailyEntry) : [],
      tasks: Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [],
      items: Array.isArray(source.items) ? source.items.map(normalizeItem) : []
    };
  }

  function createId() {
    return globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  function addDays(dateValue, days) {
    const [year, month, day] = normalizeDate(dateValue).split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  async function getState(studyDate = todayKey()) {
    const snapshot = await loadSnapshot();
    await promoteDueReviews(snapshot);
    const selectedDate = normalizeDate(studyDate);
    const dailyEntries = entriesForDate(snapshot, selectedDate);
    const studyDays = snapshot.studyDays
      .map(day => ({
        studyDate: day.studyDate,
        minutes: day.minutes,
        summary: day.summary,
        entryCount: snapshot.dailyEntries.filter(entry => entry.studyDate === day.studyDate).length
      }))
      .sort(descByDate);

    return clone({
      selectedDate,
      studyLog: getStudyLog(snapshot, selectedDate),
      studyDays,
      dailyEntries,
      tasks: clone(snapshot.tasks).sort(descByCreatedAt),
      items: itemsWithSourceSentences(snapshot).sort(descByCreatedAt)
    });
  }

  function getStudyLog(snapshot, studyDate) {
    const day = snapshot.studyDays.find(item => item.studyDate === studyDate) || normalizeStudyDay({ studyDate });
    const totalMinutes = snapshot.studyDays.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    return {
      minutes: day.minutes,
      summary: day.summary,
      note: day.note,
      totalMinutes
    };
  }

  function entriesForDate(snapshot, studyDate) {
    return snapshot.dailyEntries
      .filter(entry => entry.studyDate === studyDate)
      .map(entry => entryWithSourceSentences(snapshot, entry))
      .sort(descByCreatedAt);
  }

  function entryWithSourceSentences(snapshot, entry) {
    const parent = entry.parentId
      ? snapshot.dailyEntries.find(candidate => candidate.id === entry.parentId)
      : null;
    return {
      ...entry,
      registered: Boolean(entry.registered),
      sourceSentences: parent ? [sourceSentenceFromEntry(parent)] : [],
      parentTitle: parent?.title || entry.parentTitle || ""
    };
  }

  function sourceSentenceFromEntry(entry) {
    return {
      id: entry.id,
      studyDate: entry.studyDate,
      title: entry.title
    };
  }

  function itemsWithSourceSentences(snapshot) {
    return snapshot.items.map(item => {
      const links = snapshot.dailyEntries
        .filter(entry => entry.kind === item.kind && entry.title === item.title && entry.parentId)
        .map(entry => snapshot.dailyEntries.find(candidate => candidate.id === entry.parentId))
        .filter(Boolean)
        .map(sourceSentenceFromEntry);
      return {
        ...item,
        sourceSentences: uniqueSourceSentences(links)
      };
    });
  }

  function uniqueSourceSentences(sourceSentences) {
    const seen = new Set();
    return sourceSentences.filter(sentence => {
      const key = `${sentence.studyDate}::${normalizeWhitespace(sentence.title)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async function saveStudyLog(studyLog) {
    const snapshot = await loadSnapshot();
    const payload = normalizeStudyDay({
      studyDate: studyLog.studyDate,
      minutes: studyLog.minutes,
      summary: studyLog.summary,
      note: studyLog.note
    });
    const index = snapshot.studyDays.findIndex(day => day.studyDate === payload.studyDate);
    if (index >= 0) {
      snapshot.studyDays[index] = { ...snapshot.studyDays[index], ...payload, updatedAt: nowIso() };
    } else {
      snapshot.studyDays.push({ ...payload, createdAt: nowIso(), updatedAt: nowIso() });
    }
    await saveSnapshot(snapshot);
    return getState(payload.studyDate);
  }

  async function addDailyEntry(entry) {
    const snapshot = await loadSnapshot();
    const parsed = parseDailyEntry(entry.kind, entry.rawText);
    const payload = normalizeDailyEntry({
      id: createId(),
      studyDate: entry.studyDate,
      parentId: entry.parentId,
      kind: entry.kind,
      title: parsed.title,
      reading: parsed.reading,
      meaning: parsed.meaning,
      rawText: entry.rawText,
      parsed,
      registered: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    ensureStudyDay(snapshot, payload.studyDate);
    snapshot.dailyEntries.push(payload);

    if (payload.kind === "sentence") {
      [
        ...(parsed.words || []).map(item => dailyCandidatePayload(payload, "word", item)),
        ...(parsed.grammar || []).map(item => dailyCandidatePayload(payload, "grammar", item)),
        ...(parsed.expressions || []).map(item => dailyCandidatePayload(payload, "expression", item))
      ].forEach(candidate => upsertDailyCandidate(snapshot, candidate));
    }

    await saveSnapshot(snapshot);
    return getState(payload.studyDate);
  }

  async function deleteDailyEntry(id, studyDate) {
    const snapshot = await loadSnapshot();
    const entry = snapshot.dailyEntries.find(candidate => candidate.id === id);
    if (!entry) {
      return getState(studyDate);
    }
    const deleteIds = entry.kind === "sentence"
      ? new Set([id, ...snapshot.dailyEntries.filter(candidate => candidate.parentId === id).map(candidate => candidate.id)])
      : new Set([id]);
    snapshot.dailyEntries = snapshot.dailyEntries.filter(candidate => !deleteIds.has(candidate.id));
    await saveSnapshot(snapshot);
    return getState(studyDate || entry.studyDate);
  }

  async function registerDailyEntries(ids, studyDate) {
    const snapshot = await loadSnapshot();
    const registered = [];
    const duplicates = [];
    const linked = [];
    const errors = [];

    (Array.isArray(ids) ? ids : []).forEach(id => {
      const entry = snapshot.dailyEntries.find(candidate => candidate.id === id);
      if (!entry) {
        errors.push("항목을 찾을 수 없습니다.");
        return;
      }
      const candidates = withKanjiItems(dailyEntryToItems(entry.kind, entry.parsed));
      candidates.forEach(item => {
        if (!item.title) {
          return;
        }
        if (snapshot.items.some(existing => existing.kind === item.kind && existing.title === item.title)) {
          duplicates.push(`${kindLabel(item.kind)}: ${item.title}`);
          if (entry.parentId) {
            linked.push(`${kindLabel(item.kind)}: ${item.title}`);
          }
          return;
        }
        snapshot.items.push(normalizeItem({
          ...item,
          id: createId(),
          review: "대기",
          createdAt: nowIso(),
          updatedAt: nowIso()
        }));
        registered.push(`${kindLabel(item.kind)}: ${item.title}`);
      });
      entry.registered = true;
      entry.updatedAt = nowIso();
    });

    await saveSnapshot(snapshot);
    return {
      state: await getState(studyDate),
      result: { registered, duplicates, linked, errors }
    };
  }

  async function addTask(task) {
    const snapshot = await loadSnapshot();
    snapshot.tasks.push(normalizeTask({
      ...task,
      id: task.id || createId(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
    await saveSnapshot(snapshot);
    return getState(task.studyDate);
  }

  async function updateTaskDone(id, done, studyDate) {
    const snapshot = await loadSnapshot();
    const task = snapshot.tasks.find(candidate => candidate.id === id);
    if (task) {
      task.done = Boolean(done);
      task.updatedAt = nowIso();
    }
    await saveSnapshot(snapshot);
    return getState(studyDate);
  }

  async function upsertItem(item) {
    const snapshot = await loadSnapshot();
    const index = snapshot.items.findIndex(candidate => candidate.id === item.id);
    const previous = index >= 0 ? snapshot.items[index] : null;
    const payload = normalizeItem({
      ...previous,
      ...item,
      id: item.id || createId(),
      createdAt: previous?.createdAt || nowIso(),
      updatedAt: nowIso()
    });
    if (previous && item.reviewDueDate === undefined && previous.review === payload.review) {
      payload.reviewDueDate = previous.reviewDueDate;
    }
    if (index >= 0) {
      snapshot.items[index] = payload;
    } else {
      snapshot.items.push(payload);
    }

    if (payload.kind === "word") {
      withKanjiItems([payload]).slice(1).forEach(kanjiItem => {
        if (!snapshot.items.some(existing => existing.kind === kanjiItem.kind && existing.title === kanjiItem.title)) {
          snapshot.items.push(normalizeItem({
            ...kanjiItem,
            id: createId(),
            review: payload.review || "대기",
            reviewDueDate: payload.reviewDueDate,
            createdAt: nowIso(),
            updatedAt: nowIso()
          }));
        }
      });
    }

    await saveSnapshot(snapshot);
    return getState(item.studyDate);
  }

  async function deleteItem(id, studyDate) {
    const snapshot = await loadSnapshot();
    snapshot.items = snapshot.items.filter(item => item.id !== id);
    await saveSnapshot(snapshot);
    return getState(studyDate);
  }

  async function updateItemReview(id, review, studyDate) {
    const snapshot = await loadSnapshot();
    const item = snapshot.items.find(candidate => candidate.id === id);
    if (item) {
      item.review = normalizeReview(review);
      item.reviewDueDate = reviewDueDateFor(item.review);
      item.updatedAt = nowIso();
    }
    await saveSnapshot(snapshot);
    return getState(studyDate);
  }

  async function completeReview(targets, studyDate) {
    const snapshot = await loadSnapshot();
    (Array.isArray(targets) ? targets : []).forEach(target => {
      const id = typeof target === "object" ? target.id : target;
      const nextReview = normalizeCompletionReview(typeof target === "object" ? target.review : "3일 후");
      const item = snapshot.items.find(candidate => candidate.id === id && candidate.kind !== "source");
      if (item && nextReview) {
        item.review = nextReview;
        item.reviewDueDate = reviewDueDateFor(nextReview);
        item.updatedAt = nowIso();
      }
    });
    await saveSnapshot(snapshot);
    return getState(studyDate);
  }

  async function submitWordQuizAnswer(payload = {}) {
    const snapshot = await loadSnapshot();
    const quizKind = ["word", "kanji"].includes(text(payload.quizKind)) ? text(payload.quizKind) : "word";
    const item = snapshot.items.find(candidate => candidate.id === text(payload.itemId) && candidate.kind === quizKind);
    if (!item) {
      return { state: await getState(payload.studyDate), result: { correct: false, missing: true } };
    }

    const answerType = text(payload.answerType) === "title" ? "title" : "meaning";
    const correctAnswer = item[answerType] || "";
    const correct = text(payload.selectedAnswer ?? payload.selectedMeaning) === text(correctAnswer);
    item.quizCorrectCount = Number(item.quizCorrectCount || 0) + (correct ? 1 : 0);
    item.quizWrongCount = Number(item.quizWrongCount || 0) + (correct ? 0 : 1);
    item.lastQuizzedAt = nowIso();

    const nextReview = normalizeReview(payload.correctReview || payload.reviewAfterCorrect);
    let reviewUpdated = false;
    if (correct && payload.updateReviewOnCorrect && nextReview) {
      item.review = nextReview;
      item.reviewDueDate = reviewDueDateFor(nextReview);
      reviewUpdated = true;
    }

    await saveSnapshot(snapshot);
    return {
      state: await getState(payload.studyDate),
      result: {
        correct,
        correctAnswer,
        correctMeaning: item.meaning,
        reviewUpdated,
        nextReview,
        nextReviewDueDate: item.reviewDueDate
      }
    };
  }

  async function resetSampleData() {
    await saveSnapshot(createEmptySnapshot());
    return getState();
  }

  async function exportData() {
    const snapshot = await loadSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nihongo-study-web-backup-${todayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return {
      exportsDir: "browser-download",
      files: [link.download]
    };
  }

  async function importCsv(studyDate) {
    return getState(studyDate);
  }

  async function importBackup() {
    return getState();
  }

  function getPaths() {
    return {
      appDataDir: "browser:IndexedDB",
      dbPath: `IndexedDB:${DB_NAME}/${SNAPSHOT_STORE}/${SNAPSHOT_KEY}`,
      exportsDir: "browser:download",
      backupsDir: "browser:manual-import-planned"
    };
  }

  async function promoteDueReviews(snapshot) {
    let changed = false;
    const today = todayKey();
    snapshot.items.forEach(item => {
      if (item.reviewDueDate && item.reviewDueDate <= today) {
        item.review = "오늘";
        item.reviewDueDate = "";
        item.updatedAt = nowIso();
        changed = true;
      }
    });
    if (changed) {
      await saveSnapshot(snapshot);
    }
  }

  function ensureStudyDay(snapshot, studyDate) {
    if (!snapshot.studyDays.some(day => day.studyDate === studyDate)) {
      snapshot.studyDays.push(normalizeStudyDay({ studyDate, createdAt: nowIso(), updatedAt: nowIso() }));
    }
  }

  function upsertDailyCandidate(snapshot, payload) {
    if (!payload.title) {
      return;
    }
    const existing = snapshot.dailyEntries.find(entry =>
      entry.studyDate === payload.studyDate &&
      entry.kind === payload.kind &&
      entry.title === payload.title
    );
    if (existing) {
      if (!existing.parentId) {
        existing.parentId = payload.parentId;
      }
      existing.reading = existing.reading || payload.reading;
      existing.meaning = existing.meaning || payload.meaning;
      existing.rawText = existing.rawText || payload.rawText;
      existing.parsed = { ...payload.parsed, ...existing.parsed };
      existing.updatedAt = nowIso();
      return;
    }
    snapshot.dailyEntries.push(payload);
  }

  function dailyCandidatePayload(parent, kind, item) {
    const parsed = {
      kind,
      title: text(item.title),
      reading: text(item.reading),
      meaning: text(item.meaning),
      kanji: text(item.kanji),
      part: text(item.part),
      script: text(item.script),
      words: [],
      grammar: [],
      expressions: [],
      note: text(item.note || item.meaning)
    };
    return normalizeDailyEntry({
      id: createId(),
      studyDate: parent.studyDate,
      parentId: parent.id,
      kind,
      title: parsed.title,
      reading: parsed.reading,
      meaning: parsed.meaning,
      rawText: itemToRawText(item),
      parsed,
      registered: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  function parseDailyEntry(kind, rawText) {
    const normalizedKind = normalizeDailyKind(kind);
    const raw = text(rawText).trim();
    const title = firstMatch(raw, /^#{1,6}\s*(.+)$/m) || firstMatch(raw, /`([^`]+)`/) || raw.split(/\r?\n/)[0] || "";
    const reading = firstMatch(raw, /^읽기\s+(.+)$/m) || firstMatch(raw, /\*\*읽기\*\*\s*:\s*(.+)/) || firstMatch(raw, /`[^`]+`\s*\(([^)]+)\)/) || "";
    const meaning = firstMatch(raw, /^해석\s+(.+)$/m) || firstMatch(raw, /\*\*해석\*\*\s*:\s*(.+)/) || inlineMeaning(raw) || "";

    return {
      kind: normalizedKind,
      title: title.trim(),
      reading: reading.trim(),
      meaning: meaning.trim(),
      words: parseWordLines(raw),
      grammar: parseGrammarLines(raw),
      expressions: parseExpressionLines(raw),
      note: raw
    };
  }

  function sectionedBulletLines(raw) {
    const result = [];
    let section = "";
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (/^(?:-\s*)?(?:\*\*)?단어장(?:\*\*)?$/.test(trimmed)) section = "word";
      if (/^(?:-\s*)?(?:\*\*)?문법(?:\*\*)?$/.test(trimmed)) section = "grammar";
      if (/^(?:-\s*)?(?:\*\*)?표현(?:\*\*)?$/.test(trimmed)) section = "expression";
      if (/^(?:-\s*)?`.+`/.test(trimmed)) {
        result.push({ section, line: trimmed });
      }
    });
    return result;
  }

  function parseWordLines(raw) {
    return sectionedBulletLines(raw)
      .filter(item => item.section === "word" || /품사=|문자=|한자=/.test(item.line))
      .map(item => {
        const line = item.line;
        return {
          kind: "word",
          title: firstMatch(line, /`([^`]+)`/) || "",
          reading: firstMatch(line, /`[^`]+`\s*\(([^)]+)\)/) || "",
          meaning: inlineMeaning(line).trim(),
          kanji: fieldValue(line, "한자"),
          part: fieldValue(line, "품사"),
          script: fieldValue(line, "문자")
        };
      });
  }

  function parseGrammarLines(raw) {
    return sectionedBulletLines(raw)
      .filter(item => item.section === "grammar")
      .map(item => ({
        kind: "grammar",
        title: firstMatch(item.line, /`([^`]+)`/) || "",
        reading: "",
        meaning: inlineDescription(item.line) || "",
        note: inlineDescription(item.line) || ""
      }));
  }

  function parseExpressionLines(raw) {
    return sectionedBulletLines(raw)
      .filter(item => item.section === "expression")
      .map(item => ({
        kind: "expression",
        title: firstMatch(item.line, /`([^`]+)`/) || "",
        reading: firstMatch(item.line, /`[^`]+`\s*\(([^)]+)\)/) || "",
        meaning: inlineMeaning(item.line) || "",
        note: inlineDescription(item.line) || ""
      }));
  }

  function dailyEntryToItems(kind, parsed) {
    if (kind === "sentence") {
      return [{
        kind: "sentence",
        title: parsed.title,
        reading: parsed.reading,
        meaning: parsed.meaning,
        part: "문장",
        script: "혼합",
        note: parsed.note
      }];
    }
    if (kind === "word") {
      const inlineWord = parseWordLines(parsed.note || "")[0] || {};
      return [{
        kind: "word",
        title: parsed.title,
        reading: parsed.reading,
        meaning: parsed.meaning,
        kanji: parsed.kanji || "",
        part: parsed.part || "",
        script: parsed.script || "",
        note: parsed.note,
        ...inlineWord
      }];
    }
    if (kind === "grammar") {
      return [{ kind: "grammar", title: parsed.title, reading: parsed.reading, meaning: parsed.meaning, part: "문법", script: "혼합", note: parsed.note }];
    }
    if (kind === "expression") {
      return [{ kind: "expression", title: parsed.title, reading: parsed.reading, meaning: parsed.meaning, part: "표현", script: "혼합", note: parsed.note }];
    }
    return [];
  }

  function withKanjiItems(items) {
    return items.flatMap(item => [item, ...kanjiItemsFromWord(item)]);
  }

  function kanjiItemsFromWord(item) {
    if (item.kind !== "word" || !text(item.kanji).trim()) {
      return [];
    }
    return splitOutsideParens(item.kanji)
      .map(parseKanjiToken)
      .filter(Boolean)
      .map(kanji => ({
        kind: "kanji",
        title: kanji.title,
        reading: "",
        meaning: kanji.meaning,
        level: item.level || "",
        part: "한자",
        script: "한자",
        source: item.title,
        note: `${item.title}${item.reading ? ` (${item.reading})` : ""}`
      }));
  }

  function splitOutsideParens(value) {
    const result = [];
    let depth = 0;
    let current = "";
    for (const char of text(value)) {
      if (char === "(" || char === "（") {
        depth += 1;
      } else if ((char === ")" || char === "）") && depth > 0) {
        depth -= 1;
      }
      if ((char === "," || char === "、") && depth === 0) {
        if (current.trim()) {
          result.push(current.trim());
        }
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) {
      result.push(current.trim());
    }
    return result;
  }

  function parseKanjiToken(value) {
    const token = text(value).trim();
    const match = token.match(/^([一-龯々〆ヵヶ]+)\s*[（(]([^）)]+)[）)]/u);
    if (match) {
      return { title: match[1], meaning: match[2].trim() };
    }
    const title = firstMatch(token, /([一-龯々〆ヵヶ]+)/u);
    if (!title) {
      return null;
    }
    return { title, meaning: token.replace(title, "").trim() };
  }

  function itemToRawText(item) {
    const parts = [`### ${text(item.title)}`];
    if (item.reading) parts.push(`- **읽기**: ${item.reading}`);
    if (item.meaning) parts.push(`- **해석**: ${item.meaning}`);
    if (item.kanji) parts.push(`- **한자**: ${item.kanji}`);
    if (item.part) parts.push(`- **품사**: ${item.part}`);
    if (item.script) parts.push(`- **문자**: ${item.script}`);
    if (item.note && item.note !== item.meaning) parts.push(`- **메모**: ${item.note}`);
    return parts.join("\n");
  }

  function normalizeStudyDay(day) {
    return {
      studyDate: normalizeDate(day.studyDate || day.study_date),
      minutes: toNumber(day.minutes),
      summary: text(day.summary),
      note: text(day.note),
      createdAt: text(day.createdAt || day.created_at),
      updatedAt: text(day.updatedAt || day.updated_at)
    };
  }

  function normalizeDailyEntry(entry) {
    const parsed = entry.parsed && typeof entry.parsed === "object"
      ? entry.parsed
      : safeJson(entry.parsedJson || entry.parsed_json);
    return {
      id: text(entry.id || createId()),
      studyDate: normalizeDate(entry.studyDate || entry.study_date),
      parentId: text(entry.parentId || entry.parent_id),
      kind: normalizeDailyKind(entry.kind),
      title: text(entry.title),
      reading: text(entry.reading),
      meaning: text(entry.meaning),
      rawText: text(entry.rawText || entry.raw_text),
      parsed,
      registered: Boolean(entry.registered),
      createdAt: text(entry.createdAt || entry.created_at || nowIso()),
      updatedAt: text(entry.updatedAt || entry.updated_at || nowIso())
    };
  }

  function normalizeTask(task) {
    return {
      id: text(task.id || createId()),
      title: text(task.title),
      note: text(task.note),
      tag: text(task.tag),
      done: Boolean(task.done),
      createdAt: text(task.createdAt || task.created_at || nowIso()),
      updatedAt: text(task.updatedAt || task.updated_at || nowIso())
    };
  }

  function normalizeItem(item) {
    const kind = text(item.kind || "word");
    const review = kind === "source" ? "" : normalizeReview(item.review || "대기");
    const reviewDueDate = item.reviewDueDate === undefined && item.review_due_date === undefined
      ? reviewDueDateFor(review)
      : normalizeOptionalDate(item.reviewDueDate || item.review_due_date);
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
      reviewDueDate,
      kanji: text(item.kanji),
      source: text(item.source),
      note: text(item.note),
      quizCorrectCount: toNumber(item.quizCorrectCount || item.quiz_correct_count),
      quizWrongCount: toNumber(item.quizWrongCount || item.quiz_wrong_count),
      lastQuizzedAt: text(item.lastQuizzedAt || item.last_quizzed_at),
      createdAt: text(item.createdAt || item.created_at || nowIso()),
      updatedAt: text(item.updatedAt || item.updated_at || nowIso())
    };
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
    return reviewStates.includes(review) ? review : "";
  }

  function normalizeCompletionReview(value) {
    const review = normalizeReview(value);
    return review === "오늘" ? "3일 후" : review;
  }

  function reviewDueDateFor(review, baseDate = todayKey()) {
    const days = reviewIntervals[review];
    return days ? addDays(baseDate, days) : "";
  }

  function safeJson(value) {
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  }

  function inlineMeaning(line) {
    return firstMatch(text(line), /`[^`]+`\s*(?:\([^)]+\))?\s*:?\s*([^|\n]+)/).trim();
  }

  function inlineDescription(line) {
    return firstMatch(text(line), /`[^`]+`\s*(?:\([^)]+\))?\s*:?\s*(.+)$/).trim();
  }

  function firstMatch(value, pattern) {
    return text(value).match(pattern)?.[1] || "";
  }

  function fieldValue(line, fieldName) {
    return firstMatch(line, new RegExp(`${fieldName}=([^|]+)`)).trim();
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

  function descByCreatedAt(left, right) {
    return text(right.createdAt).localeCompare(text(left.createdAt));
  }

  function descByDate(left, right) {
    return text(right.studyDate).localeCompare(text(left.studyDate));
  }

  function normalizeWhitespace(value) {
    return text(value).trim().replace(/\s+/g, " ");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return String(value ?? "");
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  window.browserDataStore = {
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
    exportData,
    importCsv,
    importBackup,
    getPaths
  };
})();
