const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

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
    normalizeDate,
    toNumber,
    text,
    createId,
    migrateParentLinks
  } = deps;
  const { appDataDir, exportsDir, backupsDir, dbPath } = paths;

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
  writeUtf8(path.join(backupsDir, "full-backup.yaml"), YAML.stringify({
    ...state,
    allDailyEntries: getDb().prepare(`
      SELECT id, study_date AS studyDate, parent_id AS parentId, kind, title, reading, meaning, raw_text AS rawText,
        parsed_json AS parsedJson, registered
      FROM daily_entries
      ORDER BY study_date DESC, datetime(created_at) DESC
    `).all(),
    dailyEntryLinks: getDb().prepare(`
      SELECT entry_id AS entryId, sentence_id AS sentenceId
      FROM daily_entry_links
      ORDER BY datetime(created_at) ASC
    `).all()
  }));

  return {
    appDataDir,
    sqlite: dbPath,
    exportsDir,
    backupsDir,
    files: [
      ...Object.values(csvFilesByKind).map(filename => path.join(exportsDir, filename)),
      path.join(exportsDir, "study-log.yaml"),
      path.join(backupsDir, "full-backup.yaml")
    ]
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
    INSERT INTO study_days (study_date, minutes, summary, note)
    VALUES (@studyDate, @minutes, @summary, @note)
  `);
  const insertEntry = getDb().prepare(`
    INSERT INTO daily_entries (id, study_date, parent_id, kind, title, reading, meaning, raw_text, parsed_json, registered)
    VALUES (@id, @studyDate, @parentId, @kind, @title, @reading, @meaning, @rawText, @parsedJson, @registered)
  `);
  const insertLink = getDb().prepare(`
    INSERT OR IGNORE INTO daily_entry_links (entry_id, sentence_id)
    VALUES (@entryId, @sentenceId)
  `);
  const insertItem = getDb().prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, kanji, source, note, quiz_correct_count, quiz_wrong_count, last_quizzed_at)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @kanji, @source, @note, @quizCorrectCount, @quizWrongCount, @lastQuizzedAt)
  `);

  getDb().transaction(() => {
    clearAllData();
    (backup.studyDays || []).forEach(day => insertDay.run({
      studyDate: normalizeDate(day.studyDate),
      minutes: toNumber(day.minutes),
      summary: text(day.summary),
      note: text(day.note)
    }));
    (backup.allDailyEntries || backup.dailyEntries || []).forEach(entry => insertEntry.run(normalizeDailyEntry(entry)));
    (backup.dailyEntryLinks || []).forEach(link => insertLink.run({
      entryId: text(link.entryId || link.entry_id),
      sentenceId: text(link.sentenceId || link.sentence_id)
    }));
    migrateParentLinks();
    (backup.items || []).forEach(item => insertItem.run(normalizeItem(item)));
  })();

  return getState(backup.selectedDate);
}

function groupItemsByKind(items) {
  return items.reduce((acc, item) => {
    acc[item.kind] ||= [];
    acc[item.kind].push(item);
    return acc;
  }, {});
}

function toCsv(rows) {
  const columns = ["id", "kind", "title", "reading", "meaning", "level", "part", "script", "review", "kanji", "source", "note", "quizCorrectCount", "quizWrongCount", "lastQuizzedAt"];
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
