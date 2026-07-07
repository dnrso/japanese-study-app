const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { databaseSchema } = require("./dataSchema");
const { createDataImportExport } = require("./dataImportExport");
const { parseDailyEntry, dailyEntryToItems, withKanjiItems, itemToRawText } = require("./dailyEntryParser");

const csvFilesByKind = {
  word: "words.csv",
  grammar: "grammar.csv",
  expression: "expressions.csv",
  kanji: "kanji.csv",
  source: "sources.csv",
  sentence: "sentences.csv"
};

const reviewIntervals = {
  "내일": 1,
  "3일 후": 3,
  "일주일": 7,
  "2주일": 14,
  "한달": 30
};

const reviewStates = ["오늘", ...Object.keys(reviewIntervals), "대기"];

function resolveAppDataDir(options = {}) {
  return options.appDataDir || process.env.NIHONGO_APP_DATA_DIR || path.join(process.cwd(), "app-data");
}

function createSqliteStorage(options = {}) {
const appDataDir = resolveAppDataDir(options);
const exportsDir = path.join(appDataDir, "exports");
const backupsDir = path.join(appDataDir, "backups");
const dbPath = path.join(appDataDir, "nihongo.sqlite");

let db;

function createId() {
  return crypto.randomUUID();
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

function ensureDirectories() {
  fs.mkdirSync(exportsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
}

function initDatabase() {
  ensureDirectories();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrateDailyEntryLinksTable();
  db.exec(databaseSchema);


  ensureColumn("daily_entries", "parent_id", "TEXT");
  ensureColumn("daily_entries", "deleted_at", "TEXT");
  ensureColumn("items", "quiz_correct_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("items", "quiz_wrong_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("items", "last_quizzed_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("items", "review_due_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("items", "last_reviewed_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("items", "deleted_at", "TEXT");
  ensureColumn("study_days", "created_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  ensureColumn("study_days", "deleted_at", "TEXT");
  ensureColumn("tasks", "deleted_at", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_daily_entries_parent ON daily_entries(parent_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_items_review_due_date ON items(review_due_date);");
  migrateReviewDueDates();
  migrateParentLinks();
  migrateLegacyStudyLog();
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(column => column.name === columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

// Older databases created daily_entry_links with a composite primary key
// (entry_id, sentence_id) and no id/updated_at/deleted_at columns. Since that
// primary key shape can't be altered in place, rebuild the table under the
// current schema (surrogate id primary key + unique(entry_id, sentence_id))
// and copy existing rows across, synthesizing the same id idb uses.
function migrateDailyEntryLinksTable() {
  const exists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'daily_entry_links'
  `).get();
  if (!exists) {
    return;
  }
  const columns = db.prepare("PRAGMA table_info(daily_entry_links)").all();
  const hasId = columns.some(column => column.name === "id");
  if (hasId) {
    return;
  }

  db.transaction(() => {
    db.exec("ALTER TABLE daily_entry_links RENAME TO daily_entry_links_legacy");
    db.exec(`
      CREATE TABLE daily_entry_links (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        sentence_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (sentence_id) REFERENCES daily_entries(id) ON DELETE CASCADE
      )
    `);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_entry_links_pair ON daily_entry_links(entry_id, sentence_id)");
    const legacyRows = db.prepare("SELECT entry_id AS entryId, sentence_id AS sentenceId, created_at AS createdAt FROM daily_entry_links_legacy").all();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO daily_entry_links (id, entry_id, sentence_id, created_at, updated_at, deleted_at)
      VALUES (@id, @entryId, @sentenceId, @createdAt, @createdAt, NULL)
    `);
    legacyRows.forEach(row => insert.run({
      id: `${row.entryId}::${row.sentenceId}`,
      entryId: row.entryId,
      sentenceId: row.sentenceId,
      createdAt: row.createdAt || new Date().toISOString()
    }));
    db.exec("DROP TABLE daily_entry_links_legacy");
  })();
}

function migrateLegacyStudyLog() {
  const hasAnyDay = db.prepare("SELECT 1 FROM study_days LIMIT 1").get();
  if (hasAnyDay) {
    return;
  }
  const legacy = db.prepare("SELECT minutes, summary, note FROM study_log WHERE id = 1").get();
  if (!legacy || (!legacy.minutes && !legacy.summary && !legacy.note)) {
    return;
  }
  db.prepare(`
    INSERT INTO study_days (study_date, minutes, summary, note)
    VALUES (@studyDate, @minutes, @summary, @note)
  `).run({ studyDate: todayKey(), ...legacy });
}

function migrateParentLinks() {
  db.prepare(`
    INSERT OR IGNORE INTO daily_entry_links (id, entry_id, sentence_id)
    SELECT child.id || '::' || child.parent_id, child.id, child.parent_id
    FROM daily_entries child
    JOIN daily_entries parent ON parent.id = child.parent_id
    WHERE child.parent_id IS NOT NULL
      AND child.parent_id <> ''
      AND child.kind IN ('word', 'grammar', 'expression')
      AND parent.kind = 'sentence'
  `).run();
}

function migrateReviewDueDates() {
  const rows = db.prepare(`
    SELECT id, review
    FROM items
    WHERE review_due_date = ''
      AND review IN ('내일', '3일 후', '일주일', '2주일', '한달')
  `).all();
  const update = db.prepare("UPDATE items SET review_due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  const baseDate = todayKey();
  rows.forEach(row => update.run(reviewDueDateFor(row.review, baseDate), row.id));
}

function promoteDueReviews() {
  db.prepare(`
    UPDATE items SET
      review = '오늘',
      review_due_date = '',
      updated_at = CURRENT_TIMESTAMP
    WHERE review_due_date <> ''
      AND review_due_date <= ?
      AND deleted_at IS NULL
  `).run(todayKey());
}

function getState(studyDate = todayKey()) {
  promoteDueReviews();
  const selectedDate = normalizeDate(studyDate);
  const studyLog = getStudyLog(selectedDate);
  const tasks = db.prepare("SELECT id, title, note, tag, done FROM tasks WHERE deleted_at IS NULL ORDER BY datetime(created_at) DESC, rowid DESC").all()
    .map(task => ({ ...task, done: Boolean(task.done) }));
  const items = db.prepare(`
    SELECT id, kind, title, reading, meaning, level, part, script, review,
      review_due_date AS reviewDueDate, kanji, source, note,
      quiz_correct_count AS quizCorrectCount,
      quiz_wrong_count AS quizWrongCount,
      last_quizzed_at AS lastQuizzedAt,
      last_reviewed_at AS lastReviewedAt
    FROM items
    WHERE deleted_at IS NULL
    ORDER BY datetime(created_at) DESC, rowid DESC
  `).all();
  const itemLinks = itemSourceLinks();
  items.forEach(item => {
    item.sourceSentences = itemLinks.get(`${item.kind}::${item.title}`) || [];
  });
  const dailyEntries = db.prepare(`
    SELECT child.id, child.study_date AS studyDate, child.parent_id AS parentId,
      parent.title AS parentTitle, child.kind, child.title, child.reading, child.meaning,
      child.raw_text AS rawText, child.parsed_json AS parsedJson, child.registered
    FROM daily_entries child
    LEFT JOIN daily_entries parent ON parent.id = child.parent_id
    WHERE child.study_date = ?
      AND child.deleted_at IS NULL
    ORDER BY datetime(child.created_at) DESC, child.rowid DESC
  `).all(selectedDate).map(entry => ({
    ...entry,
    parsed: safeJson(entry.parsedJson),
    registered: Boolean(entry.registered)
  }));
  const linksByEntry = dailyEntryLinks(selectedDate);
  dailyEntries.forEach(entry => {
    entry.sourceSentences = linksByEntry.get(entry.id) || [];
    if (!entry.parentTitle && entry.sourceSentences.length > 0) {
      entry.parentTitle = entry.sourceSentences[0].title;
    }
  });
  const studyDays = db.prepare(`
    SELECT study_date AS studyDate, minutes, summary,
      (SELECT COUNT(*) FROM daily_entries WHERE daily_entries.study_date = study_days.study_date AND daily_entries.deleted_at IS NULL) AS entryCount
    FROM study_days
    WHERE deleted_at IS NULL
    ORDER BY study_date DESC
  `).all();

  return { selectedDate, studyLog, studyDays, dailyEntries, tasks, items };
}

function dailyEntryLinks(studyDate) {
  const rows = db.prepare(`
    SELECT DISTINCT link.entry_id AS entryId, sentence.id, sentence.study_date AS studyDate, sentence.title
    FROM daily_entry_links link
    JOIN daily_entries sentence ON sentence.id = link.sentence_id
    WHERE sentence.study_date = ?
      AND link.deleted_at IS NULL
      AND sentence.deleted_at IS NULL
    ORDER BY datetime(sentence.created_at) DESC, sentence.rowid DESC
  `).all(studyDate);

  return rows.reduce((map, row) => {
    if (!map.has(row.entryId)) {
      map.set(row.entryId, []);
    }
    const links = map.get(row.entryId);
    if (!links.some(link => sameSourceSentence(link, row))) {
      links.push({ id: row.id, studyDate: row.studyDate, title: row.title });
    }
    return map;
  }, new Map());
}

function itemSourceLinks() {
  const rows = db.prepare(`
    SELECT DISTINCT source.kind, source.title, sentence.id, sentence.study_date AS studyDate, sentence.title AS sentenceTitle
    FROM daily_entries source
    JOIN daily_entry_links link ON link.entry_id = source.id
    JOIN daily_entries sentence ON sentence.id = link.sentence_id
    WHERE source.kind IN ('word', 'grammar', 'expression')
      AND source.deleted_at IS NULL
      AND link.deleted_at IS NULL
      AND sentence.deleted_at IS NULL
    ORDER BY datetime(sentence.created_at) DESC, sentence.rowid DESC
  `).all();

  return rows.reduce((map, row) => {
    const key = `${row.kind}::${row.title}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    const links = map.get(key);
    if (!links.some(link => sameSourceSentence(link, { ...row, title: row.sentenceTitle }))) {
      links.push({ id: row.id, studyDate: row.studyDate, title: row.sentenceTitle });
    }
    return map;
  }, new Map());
}

function sameSourceSentence(link, row) {
  return link.id === row.id ||
    (text(link.studyDate) === text(row.studyDate) && normalizeLinkTitle(link.title) === normalizeLinkTitle(row.title));
}

function normalizeLinkTitle(value) {
  return text(value).trim().replace(/\s+/g, " ");
}

function getStudyLog(studyDate) {
  const day = db.prepare("SELECT minutes, summary, note FROM study_days WHERE study_date = ? AND deleted_at IS NULL").get(studyDate) || {
    minutes: 0,
    summary: "",
    note: ""
  };
  const total = db.prepare("SELECT COALESCE(SUM(minutes), 0) AS totalMinutes FROM study_days WHERE deleted_at IS NULL").get();
  return { ...day, totalMinutes: total.totalMinutes };
}

function saveStudyLog(studyLog) {
  const payload = normalizeStudyLog(studyLog);
  db.prepare(`
    INSERT INTO study_days (study_date, minutes, summary, note, updated_at)
    VALUES (@studyDate, @minutes, @summary, @note, CURRENT_TIMESTAMP)
    ON CONFLICT(study_date) DO UPDATE SET
      minutes = excluded.minutes,
      summary = excluded.summary,
      note = excluded.note,
      updated_at = CURRENT_TIMESTAMP
  `).run(payload);
  return getState(payload.studyDate);
}

function addDailyEntry(entry) {
  const parsed = parseDailyEntry(entry.kind, entry.rawText);
  const payload = {
    id: createId(),
    studyDate: normalizeDate(entry.studyDate),
    parentId: text(entry.parentId),
    kind: normalizeDailyKind(entry.kind),
    title: parsed.title,
    reading: parsed.reading,
    meaning: parsed.meaning,
    rawText: text(entry.rawText),
    parsedJson: JSON.stringify(parsed)
  };

  db.transaction(() => {
    ensureStudyDay(payload.studyDate);
    insertDailyEntry(payload);

    if (payload.kind === "sentence") {
      [
        ...(parsed.words || []).map(item => dailyCandidatePayload(payload, "word", item)),
        ...(parsed.grammar || []).map(item => dailyCandidatePayload(payload, "grammar", item)),
        ...(parsed.expressions || []).map(item => dailyCandidatePayload(payload, "expression", item))
      ].forEach(child => upsertDailyCandidate(child, payload.id));
    }
  })();

  return getState(payload.studyDate);
}

// Soft delete: stamps deletedAt/updatedAt instead of removing rows, mirroring
// storage-idb's cascade (sentence + its child word/grammar/expression entries,
// plus any links touching those ids) and its already-tombstoned no-op guard.
function deleteDailyEntry(id, studyDate) {
  const date = normalizeDate(studyDate || todayKey());
  const result = db.transaction(() => {
    const entry = db.prepare("SELECT id, kind, study_date AS studyDate, deleted_at AS deletedAt FROM daily_entries WHERE id = ?").get(id);
    if (!entry || entry.deletedAt) {
      return entry ? entry.studyDate : date;
    }

    const removeIds = new Set([id]);
    if (entry.kind === "sentence") {
      db.prepare(`
        SELECT id FROM daily_entries WHERE parent_id = ? AND deleted_at IS NULL
      `).all(id).forEach(child => removeIds.add(child.id));
    }

    const tombstoneAt = new Date().toISOString();
    const tombstoneEntry = db.prepare(`
      UPDATE daily_entries SET deleted_at = ?, updated_at = ? WHERE id = ?
    `);
    removeIds.forEach(removeId => tombstoneEntry.run(tombstoneAt, tombstoneAt, removeId));

    const idList = [...removeIds];
    const placeholders = idList.map(() => "?").join(", ");
    db.prepare(`
      UPDATE daily_entry_links SET deleted_at = ?, updated_at = ?
      WHERE deleted_at IS NULL
        AND (entry_id IN (${placeholders}) OR sentence_id IN (${placeholders}))
    `).run(tombstoneAt, tombstoneAt, ...idList, ...idList);

    return entry.studyDate;
  })();
  return getState(result || date);
}

function insertDailyEntry(payload) {
  db.prepare(`
    INSERT INTO daily_entries (id, study_date, parent_id, kind, title, reading, meaning, raw_text, parsed_json, deleted_at)
    VALUES (@id, @studyDate, @parentId, @kind, @title, @reading, @meaning, @rawText, @parsedJson, @deletedAt)
  `).run({ deletedAt: null, ...payload });
}

function upsertDailyCandidate(payload, sentenceId) {
  if (!payload.title) {
    return;
  }

  const existing = db.prepare(`
    SELECT *
    FROM daily_entries
    WHERE study_date = ? AND kind = ? AND title = ? AND deleted_at IS NULL
    ORDER BY CASE WHEN parent_id IS NULL OR parent_id = '' THEN 1 ELSE 0 END, datetime(created_at), rowid
    LIMIT 1
  `).get(payload.studyDate, payload.kind, payload.title);

  if (existing) {
    mergeDailyCandidate(existing, payload);
    linkDailyEntryToSentence(existing.id, sentenceId);
    return;
  }

  insertDailyEntry(payload);
  linkDailyEntryToSentence(payload.id, sentenceId);
}

function mergeDailyCandidate(existing, payload) {
  const existingParsed = safeJson(existing.parsed_json);
  const payloadParsed = safeJson(payload.parsedJson);
  const nextParsed = { ...payloadParsed, ...existingParsed };
  ["reading", "meaning", "kanji", "part", "script", "note"].forEach(key => {
    if (!text(existingParsed[key]) && text(payloadParsed[key])) {
      nextParsed[key] = payloadParsed[key];
    }
  });

  db.prepare(`
    UPDATE daily_entries SET
      reading = CASE WHEN reading = '' THEN @reading ELSE reading END,
      meaning = CASE WHEN meaning = '' THEN @meaning ELSE meaning END,
      raw_text = CASE WHEN raw_text = '' THEN @rawText ELSE raw_text END,
      parsed_json = @parsedJson,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: existing.id,
    reading: payload.reading,
    meaning: payload.meaning,
    rawText: payload.rawText,
    parsedJson: JSON.stringify(nextParsed)
  });
}

function linkDailyEntryToSentence(entryId, sentenceId) {
  if (!sentenceId) {
    return 0;
  }
  const existing = db.prepare(`
    SELECT deleted_at AS deletedAt FROM daily_entry_links WHERE entry_id = ? AND sentence_id = ?
  `).get(entryId, sentenceId);
  if (existing) {
    if (!existing.deletedAt) {
      return 0;
    }
    return db.prepare(`
      UPDATE daily_entry_links SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE entry_id = ? AND sentence_id = ?
    `).run(entryId, sentenceId).changes;
  }
  const result = db.prepare(`
    INSERT INTO daily_entry_links (id, entry_id, sentence_id)
    VALUES (@id, @entryId, @sentenceId)
  `).run({ id: `${entryId}::${sentenceId}`, entryId, sentenceId });
  return result.changes;
}

function ensureDailyEntrySourceLinks(entry) {
  return linkDailyEntryToSentence(entry.id, entry.parent_id);
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
  return {
    id: createId(),
    studyDate: parent.studyDate,
    parentId: parent.id,
    kind,
    title: parsed.title,
    reading: parsed.reading,
    meaning: parsed.meaning,
    rawText: itemToRawText(item),
    parsedJson: JSON.stringify(parsed)
  };
}

function registerDailyEntry(id) {
  const entry = db.prepare("SELECT * FROM daily_entries WHERE id = ? AND deleted_at IS NULL").get(id);
  if (!entry) {
    return { state: getState(), result: { registered: [], duplicates: ["항목을 찾을 수 없습니다."], linked: [] } };
  }

  const parsed = safeJson(entry.parsed_json);
  const candidates = withKanjiItems(dailyEntryToItems(entry.kind, parsed));
  const duplicates = [];
  const registered = [];
  const linked = [];

  const exists = db.prepare("SELECT 1 FROM items WHERE kind = ? AND title = ? AND deleted_at IS NULL LIMIT 1");
  const insert = db.prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, review_due_date, kanji, source, note, quiz_correct_count, quiz_wrong_count, last_quizzed_at, last_reviewed_at, deleted_at)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @reviewDueDate, @kanji, @source, @note, @quizCorrectCount, @quizWrongCount, @lastQuizzedAt, @lastReviewedAt, @deletedAt)
  `);

  db.transaction(() => {
    candidates.forEach(item => {
      if (!item.title) {
        return;
      }
      if (exists.get(item.kind, item.title)) {
        duplicates.push(`${kindLabel(item.kind)}: ${item.title}`);
        if (ensureDailyEntrySourceLinks(entry) > 0) {
          linked.push(`${kindLabel(item.kind)}: ${item.title}`);
        }
        return;
      }
      insert.run(normalizeItem({ ...item, id: createId(), review: "대기" }));
      registered.push(`${kindLabel(item.kind)}: ${item.title}`);
    });

    if (registered.length > 0 || duplicates.length > 0 || linked.length > 0) {
      db.prepare("UPDATE daily_entries SET registered = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    }
  })();

  return {
    state: getState(entry.study_date),
    result: { registered, duplicates, linked }
  };
}

function registerDailyEntries(ids, studyDate) {
  const registered = [];
  const duplicates = [];
  const linked = [];
  const errors = [];
  let nextDate = normalizeDate(studyDate);

  ids.forEach(id => {
    try {
      const response = registerDailyEntry(id);
      nextDate = response.state.selectedDate || nextDate;
      registered.push(...response.result.registered);
      duplicates.push(...response.result.duplicates);
      linked.push(...(response.result.linked || []));
    } catch (error) {
      errors.push(error.message || String(error));
    }
  });

  return {
    state: getState(nextDate),
    result: { registered, duplicates, linked, errors }
  };
}

function addTask(task) {
  db.prepare(`
    INSERT INTO tasks (id, title, note, tag, done, deleted_at)
    VALUES (@id, @title, @note, @tag, @done, @deletedAt)
  `).run(normalizeTask({ ...task, id: task.id || createId() }));
  return getState(task.studyDate);
}

function updateTaskDone(id, done, studyDate) {
  db.prepare("UPDATE tasks SET done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(done ? 1 : 0, id);
  return getState(studyDate);
}

function upsertItem(item) {
  const payload = normalizeItem({ ...item, id: item.id || createId() });
  const existingItem = item.id
    ? db.prepare(`
      SELECT kind, title,
        review,
        review_due_date AS reviewDueDate,
        quiz_correct_count AS quizCorrectCount,
        quiz_wrong_count AS quizWrongCount,
        last_quizzed_at AS lastQuizzedAt,
        last_reviewed_at AS lastReviewedAt,
        deleted_at AS deletedAt
      FROM items
      WHERE id = ?
    `).get(item.id)
    : null;
  if (existingItem && item.quizCorrectCount === undefined && item.quiz_correct_count === undefined) {
    payload.quizCorrectCount = existingItem.quizCorrectCount;
    payload.quizWrongCount = existingItem.quizWrongCount;
    payload.lastQuizzedAt = existingItem.lastQuizzedAt;
  }
  if (existingItem && item.reviewDueDate === undefined && item.review_due_date === undefined) {
    payload.reviewDueDate = existingItem.review === payload.review
      ? existingItem.reviewDueDate
      : reviewDueDateFor(payload.review);
  }
  if (existingItem && item.lastReviewedAt === undefined && item.last_reviewed_at === undefined) {
    payload.lastReviewedAt = existingItem.lastReviewedAt;
  }
  if (existingItem && item.deletedAt === undefined && item.deleted_at === undefined) {
    payload.deletedAt = existingItem.deletedAt;
  }
  const insert = db.prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, review_due_date, kanji, source, note, quiz_correct_count, quiz_wrong_count, last_quizzed_at, last_reviewed_at, deleted_at)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @reviewDueDate, @kanji, @source, @note, @quizCorrectCount, @quizWrongCount, @lastQuizzedAt, @lastReviewedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      reading = excluded.reading,
      meaning = excluded.meaning,
      level = excluded.level,
      part = excluded.part,
      script = excluded.script,
      review = excluded.review,
      review_due_date = excluded.review_due_date,
      kanji = excluded.kanji,
       source = excluded.source,
       note = excluded.note,
       quiz_correct_count = excluded.quiz_correct_count,
       quiz_wrong_count = excluded.quiz_wrong_count,
       last_quizzed_at = excluded.last_quizzed_at,
       last_reviewed_at = excluded.last_reviewed_at,
       deleted_at = excluded.deleted_at,
       updated_at = CURRENT_TIMESTAMP
  `);
  const exists = db.prepare("SELECT 1 FROM items WHERE kind = ? AND title = ? AND deleted_at IS NULL LIMIT 1");

  db.transaction(() => {
    insert.run(payload);
    if (existingItem && (existingItem.kind !== payload.kind || existingItem.title !== payload.title)) {
      updateLinkedDailyEntryTitles(existingItem.kind, existingItem.title, payload.kind, payload.title);
    }
    const generatedItems = payload.kind === "word" ? withKanjiItems([payload]).slice(1) : [];
    generatedItems.forEach(kanjiItem => {
      if (!exists.get(kanjiItem.kind, kanjiItem.title)) {
        insert.run(normalizeItem({ ...kanjiItem, id: createId(), review: payload.review || "대기", reviewDueDate: payload.reviewDueDate }));
      }
    });
  })();

  return getState(item.studyDate);
}

function updateLinkedDailyEntryTitles(previousKind, previousTitle, nextKind, nextTitle) {
  const linkedEntries = db.prepare(`
    SELECT DISTINCT entry.id, entry.parsed_json AS parsedJson
    FROM daily_entries entry
    JOIN daily_entry_links link ON link.entry_id = entry.id
    WHERE entry.kind = ? AND entry.title = ?
      AND entry.deleted_at IS NULL
      AND link.deleted_at IS NULL
  `).all(previousKind, previousTitle);
  const update = db.prepare(`
    UPDATE daily_entries SET
      kind = @kind,
      title = @title,
      parsed_json = @parsedJson,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  linkedEntries.forEach(entry => {
    const parsed = safeJson(entry.parsedJson);
    update.run({
      id: entry.id,
      kind: nextKind,
      title: nextTitle,
      parsedJson: JSON.stringify({ ...parsed, kind: nextKind, title: nextTitle })
    });
  });
}

// Soft delete: stamps deletedAt/updatedAt instead of removing the row,
// mirroring storage-idb's already-tombstoned no-op guard.
function deleteItem(id, studyDate) {
  const tombstoneAt = new Date().toISOString();
  db.prepare(`
    UPDATE items SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(tombstoneAt, tombstoneAt, id);
  return getState(studyDate);
}

function updateItemReview(id, review, studyDate) {
  const nextReview = normalizeReview(review);
  db.prepare(`
    UPDATE items SET
      review = ?,
      review_due_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextReview, reviewDueDateFor(nextReview), id);
  return getState(studyDate);
}

function completeReview(ids, studyDate) {
  const targets = normalizeReviewCompletionTargets(ids);
  if (targets.length === 0) {
    return getState(studyDate);
  }
  const reviewedAt = new Date().toISOString();
  const update = db.prepare(`
    UPDATE items SET
      review = ?,
      review_due_date = ?,
      last_reviewed_at = ?,
      updated_at = ?
    WHERE id = ?
      AND kind <> 'source'
      AND deleted_at IS NULL
  `);
  db.transaction(items => {
    items.forEach(item => update.run(item.review, reviewDueDateFor(item.review), reviewedAt, reviewedAt, item.id));
  })(targets);
  return getState(studyDate);
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
      return {
        id: text(target),
        review: "3일 후"
      };
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

function submitWordQuizAnswer(payload = {}) {
  const quizKind = ["word", "kanji"].includes(text(payload.quizKind)) ? text(payload.quizKind) : "word";
  const item = db.prepare("SELECT id, title, meaning FROM items WHERE id = ? AND kind = ? AND deleted_at IS NULL").get(text(payload.itemId), quizKind);
  if (!item) {
    return { state: getState(payload.studyDate), result: { correct: false, missing: true } };
  }

  const answerType = text(payload.answerType) === "title" ? "title" : "meaning";
  const correctAnswer = answerType === "title" ? item.title : item.meaning;
  const correct = text(payload.selectedAnswer ?? payload.selectedMeaning) === text(correctAnswer);
  const column = correct ? "quiz_correct_count" : "quiz_wrong_count";
  let reviewUpdated = false;
  let nextReview = "";
  let nextReviewDueDate = "";

  db.transaction(() => {
    const quizzedAt = new Date().toISOString();
    db.prepare(`
      UPDATE items SET
        ${column} = ${column} + 1,
        last_quizzed_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(quizzedAt, quizzedAt, item.id);

    nextReview = normalizeReview(payload.correctReview || payload.reviewAfterCorrect);
    if (correct && payload.updateReviewOnCorrect && nextReview) {
      nextReviewDueDate = reviewDueDateFor(nextReview);
      const reviewedAt = new Date().toISOString();
      db.prepare(`
        UPDATE items SET
          review = ?,
          review_due_date = ?,
          last_reviewed_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(nextReview, nextReviewDueDate, reviewedAt, reviewedAt, item.id);
      reviewUpdated = true;
    }
  })();

  return {
    state: getState(payload.studyDate),
    result: { correct, correctAnswer, correctMeaning: item.meaning, reviewUpdated, nextReview, nextReviewDueDate }
  };
}

function clearAllData() {
  db.transaction(() => {
    db.prepare("DELETE FROM daily_entry_links").run();
    db.prepare("DELETE FROM daily_entries").run();
    db.prepare("DELETE FROM items").run();
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM study_days").run();
    db.prepare("DELETE FROM study_log").run();
  })();
  return getState();
}

function resetSampleData() {
  return clearAllData();
}

function ensureStudyDay(studyDate) {
  db.prepare(`
    INSERT INTO study_days (study_date)
    VALUES (?)
    ON CONFLICT(study_date) DO NOTHING
  `).run(studyDate);
}

function normalizeDailyEntry(entry) {
  return {
    id: text(entry.id || createId()),
    studyDate: normalizeDate(entry.studyDate || entry.study_date),
    parentId: text(entry.parentId || entry.parent_id),
    kind: normalizeDailyKind(entry.kind),
    title: text(entry.title),
    reading: text(entry.reading),
    meaning: text(entry.meaning),
    rawText: text(entry.rawText || entry.raw_text),
    parsedJson: text(entry.parsedJson || entry.parsed_json || "{}"),
    registered: entry.registered ? 1 : 0,
    deletedAt: normalizeDeletedAt(entry.deletedAt ?? entry.deleted_at)
  };
}

function normalizeStudyLog(studyLog) {
  return {
    studyDate: normalizeDate(studyLog.studyDate),
    minutes: toNumber(studyLog.minutes),
    summary: text(studyLog.summary),
    note: text(studyLog.note)
  };
}

function normalizeTask(task) {
  return {
    id: text(task.id || createId()),
    title: text(task.title),
    note: text(task.note),
    tag: text(task.tag),
    done: task.done ? 1 : 0,
    deletedAt: normalizeDeletedAt(task.deletedAt ?? task.deleted_at)
  };
}

function normalizeItem(item) {
  const kind = text(item.kind || "word");
  const review = kind === "source" ? "" : normalizeReview(item.review || "대기");
  const explicitReviewDueDate = item.reviewDueDate ?? item.review_due_date;
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
    reviewDueDate: explicitReviewDueDate === undefined
      ? reviewDueDateFor(review)
      : normalizeOptionalDate(explicitReviewDueDate),
    kanji: text(item.kanji),
    source: text(item.source),
    note: text(item.note),
    quizCorrectCount: toNumber(item.quizCorrectCount || item.quiz_correct_count),
    quizWrongCount: toNumber(item.quizWrongCount || item.quiz_wrong_count),
    lastQuizzedAt: text(item.lastQuizzedAt || item.last_quizzed_at),
    lastReviewedAt: text(item.lastReviewedAt ?? item.last_reviewed_at),
    deletedAt: normalizeDeletedAt(item.deletedAt ?? item.deleted_at)
  };
}

function normalizeDeletedAt(value) {
  return value ? text(value) : null;
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
  return reviewStates.includes(review) ? review : review;
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

function text(value) {
  return String(value ?? "");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const importExport = createDataImportExport({
  getDb: () => db,
  paths: { appDataDir, exportsDir, backupsDir, dbPath },
  csvFilesByKind,
  ensureDirectories,
  getState,
  clearAllData,
  upsertItem,
  normalizeDailyEntry,
  normalizeItem,
  normalizeTask,
  normalizeDate,
  toNumber,
  text,
  createId,
  migrateParentLinks
});

const { exportData, importCsvExports, importFullBackup } = importExport;

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
  paths: {
    appDataDir,
    exportsDir,
    backupsDir,
    dbPath
  }
};
}

module.exports = { createSqliteStorage };
