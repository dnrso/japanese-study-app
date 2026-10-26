// Reads the legacy desktop SQLite database (apps/desktop's old app-data/nihongo.sqlite)
// WITHOUT better-sqlite3 and without packages/storage-sqlite, using Node's
// built-in `node:sqlite`. It returns the same `data` object that
// storage-sqlite's exportData() produced, so the result can be fed straight into
// storage-idb's importFullBackup() / core.mergeBackupData().
//
// The SQL and the row shaping below are a deliberate port of storage-sqlite's
// allStudyDaysRaw / allDailyEntriesRaw / allDailyEntryLinksRaw / allTasksRaw /
// allItemsRaw (+ allDailyEntryLinksMap), a package that has since been removed.
// tests/desktop-legacy-reader.test.js checks the output against a frozen fixture
// and expected JSON that package generated.
//
// Safety: the original database is never opened. db (+ -wal) is copied into a
// temp directory and the copy is opened read-only, which also makes WAL content
// that was never checkpointed visible (SQLite replays the copied -wal).
//
// Not exported (and therefore not migrated), matching storage-sqlite's export:
//   - study_log (legacy single-row table; its rows were already folded into
//     study_days by storage-sqlite's migrateLegacyStudyLog, and its
//     total_minutes is just SUM(study_days.minutes), derived at read time).
const fs = require("fs");
const os = require("os");
const path = require("path");
// Same relative-path convention as storage-sqlite -> storage-core (the packaged
// app has no @nihongo-study workspace symlinks). merge.js is dependency-free ESM,
// loaded through require(esm); it owns the record-id rule.
const { unsafeRecordIds } = require("../../../packages/core/src/merge.js");

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SQLITE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/;

class LegacyReadError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "LegacyReadError";
    this.code = code;
    Object.assign(this, extra);
  }
}

// CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS" in UTC; JS would parse that as
// local time. Already-ISO values (and empty/null) pass through untouched.
function normalizeTimestamp(value) {
  if (typeof value !== "string") {
    return value;
  }
  const match = SQLITE_TIMESTAMP.exec(value);
  if (!match) {
    return value;
  }
  const fraction = match[3] ? match[3].slice(0, 4).padEnd(4, "0") : ".000";
  return `${match[1]}T${match[2]}${fraction}Z`;
}

function pruneStaleTombstones(records, now) {
  const cutoff = now - TOMBSTONE_TTL_MS;
  return records.filter(record => {
    if (!record.deletedAt) {
      return true;
    }
    const deletedAtMs = Date.parse(record.deletedAt);
    return !Number.isFinite(deletedAtMs) || deletedAtMs >= cutoff;
  });
}

function text(value) {
  return String(value ?? "");
}

function safeJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function normalizeLinkTitle(value) {
  return text(value).trim().replace(/\s+/g, " ");
}

function sameSourceSentence(link, row) {
  return link.id === row.id ||
    (text(link.studyDate) === text(row.studyDate) && normalizeLinkTitle(link.title) === normalizeLinkTitle(row.title));
}

function openCopy(dbPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nihongo-legacy-read-"));
  const copyPath = path.join(tempDir, "legacy.sqlite");
  fs.copyFileSync(dbPath, copyPath);
  // -shm is an index that SQLite rebuilds; only the -wal carries data.
  if (fs.existsSync(`${dbPath}-wal`)) {
    fs.copyFileSync(`${dbPath}-wal`, `${copyPath}-wal`);
  }
  const { DatabaseSync } = require("node:sqlite");
  let db;
  try {
    db = new DatabaseSync(copyPath, { readOnly: true });
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
  return {
    db,
    close() {
      try {
        db.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  };
}

// Columns that older databases may lack (storage-sqlite added them through
// ensureColumn on every launch); missing ones read as their column default.
function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
}

function select(columns, table, spec) {
  return spec.map(([column, alias, fallback]) => {
    const expression = columns.has(column) ? `${table}.${column}` : (fallback ?? column);
    return `${expression} AS ${alias}`;
  }).join(", ");
}

function readStudyDays(db) {
  const columns = tableColumns(db, "study_days");
  if (!columns.size) {
    return [];
  }
  const fields = select(columns, "study_days", [
    ["study_date", "studyDate"],
    ["minutes", "minutes", "0"],
    ["summary", "summary", "''"],
    ["note", "note", "''"],
    ["created_at", "createdAt", "updated_at"],
    ["updated_at", "updatedAt", "NULL"],
    ["deleted_at", "deletedAt", "NULL"]
  ]);
  return db.prepare(`SELECT ${fields} FROM study_days ORDER BY study_date DESC`).all().map(row => ({
    studyDate: row.studyDate,
    minutes: row.minutes,
    summary: row.summary,
    note: row.note,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    deletedAt: normalizeTimestamp(row.deletedAt)
  }));
}

function readLinks(db) {
  const columns = tableColumns(db, "daily_entry_links");
  if (!columns.size) {
    return [];
  }
  const fields = select(columns, "daily_entry_links", [
    ["id", "id", "(entry_id || '::' || sentence_id)"],
    ["entry_id", "entryId"],
    ["sentence_id", "sentenceId"],
    ["created_at", "createdAt", "NULL"],
    ["updated_at", "updatedAt", columns.has("created_at") ? "created_at" : "NULL"],
    ["deleted_at", "deletedAt", "NULL"]
  ]);
  const order = columns.has("created_at") ? "datetime(created_at) ASC" : "rowid ASC";
  return db.prepare(`SELECT ${fields} FROM daily_entry_links ORDER BY ${order}`).all().map(row => ({
    id: row.id,
    entryId: row.entryId,
    sentenceId: row.sentenceId,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    deletedAt: normalizeTimestamp(row.deletedAt)
  }));
}

// entry id -> [{ id, studyDate, title }] of the (live) sentences it came from.
function sourceSentenceMap(db) {
  const rows = db.prepare(`
    SELECT DISTINCT link.entry_id AS entryId, sentence.id, sentence.study_date AS studyDate, sentence.title
    FROM daily_entry_links link
    JOIN daily_entries sentence ON sentence.id = link.sentence_id
    WHERE link.deleted_at IS NULL
      AND sentence.deleted_at IS NULL
    ORDER BY datetime(sentence.created_at) DESC, sentence.rowid DESC
  `).all();

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

function readDailyEntries(db) {
  const columns = tableColumns(db, "daily_entries");
  if (!columns.size) {
    return [];
  }
  const hasParent = columns.has("parent_id");
  const hasDeleted = columns.has("deleted_at");
  const rows = db.prepare(`
    SELECT child.id, child.study_date AS studyDate,
      ${hasParent ? "child.parent_id" : "NULL"} AS parentId,
      ${hasParent ? "parent.title" : "NULL"} AS parentTitle,
      child.kind, child.title, child.reading, child.meaning,
      child.raw_text AS rawText, child.parsed_json AS parsedJson, child.registered,
      child.created_at AS createdAt, child.updated_at AS updatedAt,
      ${hasDeleted ? "child.deleted_at" : "NULL"} AS deletedAt
    FROM daily_entries child
    ${hasParent ? "LEFT JOIN daily_entries parent ON parent.id = child.parent_id" : ""}
    ORDER BY child.study_date DESC, datetime(child.created_at) DESC
  `).all();

  const linksMap = hasDeleted ? sourceSentenceMap(db) : new Map();
  return rows.map(entry => {
    const sourceSentences = linksMap.get(entry.id) || [];
    const parentTitle = entry.parentTitle || (sourceSentences.length > 0 ? sourceSentences[0].title : "");
    return {
      id: entry.id,
      studyDate: entry.studyDate,
      parentId: entry.parentId,
      parentTitle,
      kind: entry.kind,
      title: entry.title,
      reading: entry.reading,
      meaning: entry.meaning,
      rawText: entry.rawText,
      parsed: safeJson(entry.parsedJson),
      registered: Boolean(entry.registered),
      sourceSentences,
      createdAt: normalizeTimestamp(entry.createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt),
      deletedAt: normalizeTimestamp(entry.deletedAt)
    };
  });
}

function readTasks(db) {
  const columns = tableColumns(db, "tasks");
  if (!columns.size) {
    return [];
  }
  const fields = select(columns, "tasks", [
    ["id", "id"], ["title", "title"], ["note", "note"], ["tag", "tag"], ["done", "done"],
    ["study_date", "studyDate", "''"],
    ["created_at", "createdAt"], ["updated_at", "updatedAt"],
    ["deleted_at", "deletedAt", "NULL"]
  ]);
  return db.prepare(`SELECT ${fields} FROM tasks ORDER BY datetime(created_at) DESC, rowid DESC`).all().map(task => ({
    id: task.id,
    title: task.title,
    note: task.note,
    tag: task.tag,
    done: Boolean(task.done),
    studyDate: task.studyDate,
    createdAt: normalizeTimestamp(task.createdAt),
    updatedAt: normalizeTimestamp(task.updatedAt),
    deletedAt: normalizeTimestamp(task.deletedAt)
  }));
}

function readItems(db) {
  const columns = tableColumns(db, "items");
  if (!columns.size) {
    return [];
  }
  const fields = select(columns, "items", [
    ["id", "id"], ["kind", "kind"], ["title", "title"], ["reading", "reading"], ["meaning", "meaning"],
    ["level", "level"], ["part", "part"], ["script", "script"], ["review", "review"],
    ["review_due_date", "reviewDueDate", "''"],
    ["kanji", "kanji"], ["source", "source"], ["note", "note"],
    ["quiz_correct_count", "quizCorrectCount", "0"],
    ["quiz_wrong_count", "quizWrongCount", "0"],
    ["last_quizzed_at", "lastQuizzedAt", "''"],
    ["last_reviewed_at", "lastReviewedAt", "''"],
    ["created_at", "createdAt"], ["updated_at", "updatedAt"],
    ["deleted_at", "deletedAt", "NULL"]
  ]);
  return db.prepare(`SELECT ${fields} FROM items ORDER BY datetime(created_at) DESC, rowid DESC`).all().map(row => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    reading: row.reading,
    meaning: row.meaning,
    level: row.level,
    part: row.part,
    script: row.script,
    review: row.review,
    reviewDueDate: row.reviewDueDate,
    kanji: row.kanji,
    source: row.source,
    note: row.note,
    quizCorrectCount: row.quizCorrectCount,
    quizWrongCount: row.quizWrongCount,
    lastQuizzedAt: row.lastQuizzedAt,
    lastReviewedAt: row.lastReviewedAt,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
    deletedAt: normalizeTimestamp(row.deletedAt)
  }));
}

function countsOf(data) {
  return {
    studyDays: data.studyDays.length,
    dailyEntries: data.dailyEntries.length,
    dailyEntryLinks: data.dailyEntryLinks.length,
    tasks: data.tasks.length,
    items: data.items.length
  };
}

// Returns { data, counts }. Throws LegacyReadError:
//   code "missing"    - no database file at dbPath
//   code "unsafe-ids" - some record ids fail core's id rule (error.ids lists them)
//   code "read-failed"- anything else (not a database, corrupt, ...)
function readLegacySqlite(dbPath, options = {}) {
  const now = options.now ?? Date.now();
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new LegacyReadError("missing", `Legacy database not found: ${dbPath}`);
  }

  let data;
  let handle;
  try {
    handle = openCopy(dbPath);
    const { db } = handle;
    data = {
      studyDays: pruneStaleTombstones(readStudyDays(db), now),
      dailyEntries: pruneStaleTombstones(readDailyEntries(db), now),
      dailyEntryLinks: pruneStaleTombstones(readLinks(db), now),
      tasks: pruneStaleTombstones(readTasks(db), now),
      items: pruneStaleTombstones(readItems(db), now)
    };
  } catch (error) {
    throw new LegacyReadError("read-failed", `Could not read legacy database: ${error.message}`);
  } finally {
    handle?.close();
  }

  const unsafe = unsafeRecordIds(data);
  if (unsafe.length) {
    const shown = unsafe.slice(0, 20).map(id => JSON.stringify(id)).join(", ");
    const more = unsafe.length > 20 ? ` (and ${unsafe.length - 20} more)` : "";
    throw new LegacyReadError(
      "unsafe-ids",
      `${unsafe.length} legacy record id(s) contain characters that are not allowed: ${shown}${more}`,
      { ids: unsafe }
    );
  }

  return { data, counts: countsOf(data) };
}

module.exports = { readLegacySqlite, normalizeTimestamp, countsOf, LegacyReadError };
