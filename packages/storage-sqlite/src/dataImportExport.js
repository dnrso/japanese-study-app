const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const tombstoneTtlMs = 90 * 24 * 60 * 60 * 1000;

function pruneStaleTombstones(records) {
  const cutoff = Date.now() - tombstoneTtlMs;
  return records.filter(record => {
    if (!record.deletedAt) {
      return true;
    }
    const deletedAtMs = Date.parse(record.deletedAt);
    return !Number.isFinite(deletedAtMs) || deletedAtMs >= cutoff;
  });
}

function createDataImportExport(deps) {
  const {
    getDb,
    paths,
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
    migrateParentLinks,
    safeJson,
    allDailyEntryLinksMap
  } = deps;
  const { appDataDir, exportsDir, backupsDir, dbPath } = paths;

function allStudyDaysRaw() {
  return getDb().prepare(`
    SELECT study_date AS studyDate, minutes, summary, note,
      created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
    FROM study_days
    ORDER BY study_date DESC
  `).all();
}

// Canonical exchange shape for dailyEntries: matches storage-idb's field set
// exactly (structured `parsed` object, `parentTitle`, `sourceSentences`,
// boolean `registered`) so backups round-trip losslessly between platforms.
// `parsed`/`sourceSentences`/`parentTitle` are all derived here from sqlite's
// own columns (parsed_json, parent_id join, daily_entry_links) rather than
// stored directly, since sqlite recomputes them fresh on every read/export.
function allDailyEntriesRaw() {
  const rows = getDb().prepare(`
    SELECT child.id, child.study_date AS studyDate, child.parent_id AS parentId,
      parent.title AS parentTitle, child.kind, child.title, child.reading, child.meaning,
      child.raw_text AS rawText, child.parsed_json AS parsedJson, child.registered,
      child.created_at AS createdAt, child.updated_at AS updatedAt, child.deleted_at AS deletedAt
    FROM daily_entries child
    LEFT JOIN daily_entries parent ON parent.id = child.parent_id
    ORDER BY child.study_date DESC, datetime(child.created_at) DESC
  `).all();

  const linksMap = allDailyEntryLinksMap();
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
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt
    };
  });
}

function allDailyEntryLinksRaw() {
  return getDb().prepare(`
    SELECT id, entry_id AS entryId, sentence_id AS sentenceId,
      created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
    FROM daily_entry_links
    ORDER BY datetime(created_at) ASC
  `).all();
}

function allTasksRaw() {
  return getDb().prepare(`
    SELECT id, title, note, tag, done, study_date AS studyDate,
      created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
    FROM tasks
    ORDER BY datetime(created_at) DESC, rowid DESC
  `).all().map(task => ({ ...task, done: Boolean(task.done) }));
}

function allItemsRaw() {
  return getDb().prepare(`
    SELECT id, kind, title, reading, meaning, level, part, script, review,
      review_due_date AS reviewDueDate, kanji, source, note,
      quiz_correct_count AS quizCorrectCount,
      quiz_wrong_count AS quizWrongCount,
      last_quizzed_at AS lastQuizzedAt,
      last_reviewed_at AS lastReviewedAt,
      created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
    FROM items
    ORDER BY datetime(created_at) DESC, rowid DESC
  `).all();
}

function exportData() {
  ensureDirectories();
  const state = getState();
  const byKind = groupItemsByKind(state.items);

  Object.entries(csvFilesByKind).forEach(([kind, filename]) => {
    writeUtf8(path.join(exportsDir, filename), toCsv(byKind[kind] || []));
  });

  writeUtf8(path.join(exportsDir, "study-log.yaml"), YAML.stringify({
    selectedDate: state.selectedDate,
    studyDays: state.studyDays,
    dailyEntries: state.dailyEntries
  }));

  // dailyEntries and allDailyEntries intentionally share the same rows here,
  // mirroring storage-idb's exportData() where both fields dump the entire
  // store (not just the selected day).
  const dailyEntriesExport = pruneStaleTombstones(allDailyEntriesRaw());
  const data = {
    selectedDate: state.selectedDate,
    studyDays: pruneStaleTombstones(allStudyDaysRaw()),
    dailyEntries: dailyEntriesExport,
    allDailyEntries: dailyEntriesExport,
    dailyEntryLinks: pruneStaleTombstones(allDailyEntryLinksRaw()),
    tasks: pruneStaleTombstones(allTasksRaw()),
    items: pruneStaleTombstones(allItemsRaw())
  };

  writeUtf8(path.join(backupsDir, "full-backup.yaml"), YAML.stringify(data));

  return {
    appDataDir,
    sqlite: dbPath,
    exportsDir,
    backupsDir,
    files: [
      ...Object.values(csvFilesByKind).map(filename => path.join(exportsDir, filename)),
      path.join(exportsDir, "study-log.yaml"),
      path.join(backupsDir, "full-backup.yaml")
    ],
    data
  };
}

function importCsvExports(studyDate) {
  ensureDirectories();
  Object.entries(csvFilesByKind).forEach(([kind, filename]) => {
    const filePath = path.join(exportsDir, filename);
    if (!fs.existsSync(filePath)) {
      return;
    }
    parseCsv(readUtf8(filePath)).forEach(row => upsertItem(normalizeItem({ ...row, kind, id: row.id || createId() })));
  });
  return getState(studyDate);
}

function importFullBackup() {
  const backupPath = path.join(backupsDir, "full-backup.yaml");
  if (!fs.existsSync(backupPath)) {
    throw new Error("full-backup.yaml 파일이 없습니다.");
  }
  const backup = YAML.parse(readUtf8(backupPath));
  return replaceBackup(backup);
}

function replaceBackup(backup) {
  const insertDay = getDb().prepare(`
    INSERT INTO study_days (study_date, minutes, summary, note, created_at, updated_at, deleted_at)
    VALUES (@studyDate, @minutes, @summary, @note, @createdAt, @updatedAt, @deletedAt)
  `);
  const insertEntry = getDb().prepare(`
    INSERT INTO daily_entries (id, study_date, parent_id, kind, title, reading, meaning, raw_text, parsed_json, registered, created_at, updated_at, deleted_at)
    VALUES (@id, @studyDate, @parentId, @kind, @title, @reading, @meaning, @rawText, @parsedJson, @registered, @createdAt, @updatedAt, @deletedAt)
  `);
  const insertLink = getDb().prepare(`
    INSERT OR IGNORE INTO daily_entry_links (id, entry_id, sentence_id, created_at, updated_at, deleted_at)
    VALUES (@id, @entryId, @sentenceId, @createdAt, @updatedAt, @deletedAt)
  `);
  const insertTask = getDb().prepare(`
    INSERT INTO tasks (id, title, note, tag, done, study_date, deleted_at)
    VALUES (@id, @title, @note, @tag, @done, @studyDate, @deletedAt)
  `);
  const insertItem = getDb().prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, review_due_date, kanji, source, note, quiz_correct_count, quiz_wrong_count, last_quizzed_at, last_reviewed_at, deleted_at)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @reviewDueDate, @kanji, @source, @note, @quizCorrectCount, @quizWrongCount, @lastQuizzedAt, @lastReviewedAt, @deletedAt)
  `);

  getDb().transaction(() => {
    clearAllData();
    (backup.studyDays || []).forEach(day => insertDay.run({
      studyDate: normalizeDate(day.studyDate),
      minutes: toNumber(day.minutes),
      summary: text(day.summary),
      note: text(day.note),
      createdAt: text(day.createdAt || day.created_at || new Date().toISOString()),
      updatedAt: text(day.updatedAt || day.updated_at || new Date().toISOString()),
      deletedAt: normalizeDeletedAtValue(day.deletedAt ?? day.deleted_at)
    }));
    (backup.allDailyEntries || backup.dailyEntries || []).forEach(entry => {
      const normalized = normalizeDailyEntry(entry);
      const now = new Date().toISOString();
      insertEntry.run({
        ...normalized,
        createdAt: text(entry.createdAt || entry.created_at || now),
        updatedAt: text(entry.updatedAt || entry.updated_at || now)
      });
    });
    (backup.dailyEntryLinks || []).forEach(link => {
      const entryId = text(link.entryId || link.entry_id);
      const sentenceId = text(link.sentenceId || link.sentence_id);
      if (!entryId || !sentenceId) {
        return;
      }
      const now = new Date().toISOString();
      insertLink.run({
        id: text(link.id || `${entryId}::${sentenceId}`),
        entryId,
        sentenceId,
        createdAt: text(link.createdAt || link.created_at || now),
        updatedAt: text(link.updatedAt || link.updated_at || link.createdAt || link.created_at || now),
        deletedAt: normalizeDeletedAtValue(link.deletedAt ?? link.deleted_at)
      });
    });
    migrateParentLinks();
    (backup.tasks || []).forEach(task => insertTask.run(normalizeTask(task)));
    (backup.items || []).forEach(item => insertItem.run(normalizeItem(item)));
  })();

  return getState(backup.selectedDate);
}

function normalizeDeletedAtValue(value) {
  return value ? text(value) : null;
}

function groupItemsByKind(items) {
  return items.reduce((acc, item) => {
    acc[item.kind] ||= [];
    acc[item.kind].push(item);
    return acc;
  }, {});
}

function toCsv(rows) {
  const columns = ["id", "kind", "title", "reading", "meaning", "level", "part", "script", "review", "reviewDueDate", "kanji", "source", "note", "quizCorrectCount", "quizWrongCount", "lastQuizzedAt"];
  return [
    columns.join(","),
    ...rows.map(row => columns.map(column => csvCell(row[column])).join(","))
  ].join("\r\n");
}

function csvCell(value) {
  const textValue = text(value);
  if (/[",\r\n]/.test(textValue)) {
    return `"${textValue.replaceAll('"', '""')}"`;
  }
  return textValue;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...dataRows] = rows.filter(cells => cells.some(value => value.trim() !== ""));
  if (!header) {
    return [];
  }
  return dataRows.map(cells => Object.fromEntries(header.map((column, index) => [column, cells[index] || ""])));
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeUtf8(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}


  return {
    exportData,
    importCsvExports,
    importFullBackup
  };
}

module.exports = { createDataImportExport };
