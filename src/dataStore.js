const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const YAML = require("yaml");

const rootDir = path.resolve(__dirname, "..");
const appDataDir = path.join(rootDir, "app-data");
const exportsDir = path.join(appDataDir, "exports");
const backupsDir = path.join(appDataDir, "backups");
const dbPath = path.join(appDataDir, "nihongo.sqlite");

const csvFilesByKind = {
  word: "words.csv",
  grammar: "grammar.csv",
  expression: "expressions.csv",
  kanji: "kanji.csv",
  source: "sources.csv",
  sentence: "sentences.csv"
};

let db;

function createId() {
  return crypto.randomUUID();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS study_log (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      minutes INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      total_minutes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_days (
      study_date TEXT PRIMARY KEY,
      minutes INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_entries (
      id TEXT PRIMARY KEY,
      study_date TEXT NOT NULL,
      parent_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      reading TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL DEFAULT '',
      parsed_json TEXT NOT NULL DEFAULT '{}',
      registered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_entry_links (
      entry_id TEXT NOT NULL,
      sentence_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entry_id, sentence_id),
      FOREIGN KEY (entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (sentence_id) REFERENCES daily_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      reading TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      part TEXT NOT NULL DEFAULT '',
      script TEXT NOT NULL DEFAULT '',
      review TEXT NOT NULL DEFAULT '',
      kanji TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
    CREATE INDEX IF NOT EXISTS idx_items_review ON items(review);
    CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(study_date);
    CREATE INDEX IF NOT EXISTS idx_daily_entries_kind_title ON daily_entries(kind, title);
    CREATE INDEX IF NOT EXISTS idx_daily_entry_links_sentence ON daily_entry_links(sentence_id);
  `);

  ensureColumn("daily_entries", "parent_id", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_daily_entries_parent ON daily_entries(parent_id);");
  migrateParentLinks();
  migrateLegacyStudyLog();
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(column => column.name === columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
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
    INSERT OR IGNORE INTO daily_entry_links (entry_id, sentence_id)
    SELECT child.id, child.parent_id
    FROM daily_entries child
    JOIN daily_entries parent ON parent.id = child.parent_id
    WHERE child.parent_id IS NOT NULL
      AND child.parent_id <> ''
      AND child.kind IN ('word', 'grammar', 'expression')
      AND parent.kind = 'sentence'
  `).run();
}

function getState(studyDate = todayKey()) {
  const selectedDate = normalizeDate(studyDate);
  const studyLog = getStudyLog(selectedDate);
  const tasks = db.prepare("SELECT id, title, note, tag, done FROM tasks ORDER BY datetime(created_at) DESC, rowid DESC").all()
    .map(task => ({ ...task, done: Boolean(task.done) }));
  const items = db.prepare(`
    SELECT id, kind, title, reading, meaning, level, part, script, review, kanji, source, note
    FROM items
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
      (SELECT COUNT(*) FROM daily_entries WHERE daily_entries.study_date = study_days.study_date) AS entryCount
    FROM study_days
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
  const day = db.prepare("SELECT minutes, summary, note FROM study_days WHERE study_date = ?").get(studyDate) || {
    minutes: 0,
    summary: "",
    note: ""
  };
  const total = db.prepare("SELECT COALESCE(SUM(minutes), 0) AS totalMinutes FROM study_days").get();
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

function deleteDailyEntry(id, studyDate) {
  const date = normalizeDate(studyDate);
  db.transaction(() => {
    const entry = db.prepare("SELECT id, kind FROM daily_entries WHERE id = ?").get(id);
    if (!entry) {
      return;
    }
    if (entry.kind === "sentence") {
      const linkedEntries = db.prepare("SELECT entry_id AS entryId FROM daily_entry_links WHERE sentence_id = ?").all(id);
      db.prepare("DELETE FROM daily_entry_links WHERE sentence_id = ?").run(id);
      const hasLink = db.prepare("SELECT 1 FROM daily_entry_links WHERE entry_id = ? LIMIT 1");
      const getRemainingLink = db.prepare("SELECT sentence_id AS sentenceId FROM daily_entry_links WHERE entry_id = ? LIMIT 1");
      const getChild = db.prepare("SELECT parent_id AS parentId FROM daily_entries WHERE id = ?");
      linkedEntries.forEach(link => {
        const child = getChild.get(link.entryId);
        if (child?.parentId === id && !hasLink.get(link.entryId)) {
          db.prepare("DELETE FROM daily_entries WHERE id = ?").run(link.entryId);
        } else if (child?.parentId === id) {
          const remaining = getRemainingLink.get(link.entryId);
          db.prepare("UPDATE daily_entries SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(remaining?.sentenceId || "", link.entryId);
        }
      });
    } else {
      db.prepare("DELETE FROM daily_entry_links WHERE entry_id = ?").run(id);
    }
    db.prepare("DELETE FROM daily_entries WHERE id = ?").run(id);
  })();
  return getState(date);
}

function insertDailyEntry(payload) {
  db.prepare(`
    INSERT INTO daily_entries (id, study_date, parent_id, kind, title, reading, meaning, raw_text, parsed_json)
    VALUES (@id, @studyDate, @parentId, @kind, @title, @reading, @meaning, @rawText, @parsedJson)
  `).run(payload);
}

function upsertDailyCandidate(payload, sentenceId) {
  if (!payload.title) {
    return;
  }

  const existing = db.prepare(`
    SELECT *
    FROM daily_entries
    WHERE study_date = ? AND kind = ? AND title = ?
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
  db.prepare(`
    INSERT OR IGNORE INTO daily_entry_links (entry_id, sentence_id)
    VALUES (?, ?)
  `).run(entryId, sentenceId);
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

function registerDailyEntry(id) {
  const entry = db.prepare("SELECT * FROM daily_entries WHERE id = ?").get(id);
  if (!entry) {
    return { state: getState(), result: { registered: [], duplicates: ["항목을 찾을 수 없습니다."] } };
  }

  const parsed = safeJson(entry.parsed_json);
  const candidates = withKanjiItems(dailyEntryToItems(entry.kind, parsed));
  const duplicates = [];
  const registered = [];

  const exists = db.prepare("SELECT 1 FROM items WHERE kind = ? AND title = ? LIMIT 1");
  const insert = db.prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, kanji, source, note)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @kanji, @source, @note)
  `);

  db.transaction(() => {
    candidates.forEach(item => {
      if (!item.title) {
        return;
      }
      if (exists.get(item.kind, item.title)) {
        duplicates.push(`${kindLabel(item.kind)}: ${item.title}`);
        return;
      }
      insert.run(normalizeItem({ ...item, id: createId(), review: "대기" }));
      registered.push(`${kindLabel(item.kind)}: ${item.title}`);
    });

    if (registered.length > 0) {
      db.prepare("UPDATE daily_entries SET registered = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    }
  })();

  return {
    state: getState(entry.study_date),
    result: { registered, duplicates }
  };
}

function addTask(task) {
  db.prepare(`
    INSERT INTO tasks (id, title, note, tag, done)
    VALUES (@id, @title, @note, @tag, @done)
  `).run(normalizeTask({ ...task, id: task.id || createId() }));
  return getState(task.studyDate);
}

function updateTaskDone(id, done, studyDate) {
  db.prepare("UPDATE tasks SET done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(done ? 1 : 0, id);
  return getState(studyDate);
}

function upsertItem(item) {
  const payload = normalizeItem({ ...item, id: item.id || createId() });
  const insert = db.prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, kanji, source, note)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @kanji, @source, @note)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      reading = excluded.reading,
      meaning = excluded.meaning,
      level = excluded.level,
      part = excluded.part,
      script = excluded.script,
      review = excluded.review,
      kanji = excluded.kanji,
       source = excluded.source,
       note = excluded.note,
       updated_at = CURRENT_TIMESTAMP
  `);
  const exists = db.prepare("SELECT 1 FROM items WHERE kind = ? AND title = ? LIMIT 1");

  db.transaction(() => {
    insert.run(payload);
    kanjiItemsFromWord(payload).forEach(kanjiItem => {
      if (!exists.get(kanjiItem.kind, kanjiItem.title)) {
        insert.run(normalizeItem({ ...kanjiItem, id: createId(), review: payload.review || "대기" }));
      }
    });
  })();

  return getState(item.studyDate);
}

function deleteItem(id, studyDate) {
  db.prepare("DELETE FROM items WHERE id = ?").run(id);
  return getState(studyDate);
}

function updateItemReview(id, review, studyDate) {
  db.prepare("UPDATE items SET review = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(review, id);
  return getState(studyDate);
}

function completeReview(ids, studyDate) {
  const update = db.prepare("UPDATE items SET review = '3일 후', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  db.transaction(itemIds => itemIds.forEach(id => update.run(id)))(ids);
  return getState(studyDate);
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
    allDailyEntries: db.prepare(`
      SELECT id, study_date AS studyDate, parent_id AS parentId, kind, title, reading, meaning, raw_text AS rawText,
        parsed_json AS parsedJson, registered
      FROM daily_entries
      ORDER BY study_date DESC, datetime(created_at) DESC
    `).all(),
    dailyEntryLinks: db.prepare(`
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
  const insertDay = db.prepare(`
    INSERT INTO study_days (study_date, minutes, summary, note)
    VALUES (@studyDate, @minutes, @summary, @note)
  `);
  const insertEntry = db.prepare(`
    INSERT INTO daily_entries (id, study_date, parent_id, kind, title, reading, meaning, raw_text, parsed_json, registered)
    VALUES (@id, @studyDate, @parentId, @kind, @title, @reading, @meaning, @rawText, @parsedJson, @registered)
  `);
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO daily_entry_links (entry_id, sentence_id)
    VALUES (@entryId, @sentenceId)
  `);
  const insertItem = db.prepare(`
    INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, kanji, source, note)
    VALUES (@id, @kind, @title, @reading, @meaning, @level, @part, @script, @review, @kanji, @source, @note)
  `);

  db.transaction(() => {
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

function ensureStudyDay(studyDate) {
  db.prepare(`
    INSERT INTO study_days (study_date)
    VALUES (?)
    ON CONFLICT(study_date) DO NOTHING
  `).run(studyDate);
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
      const title = firstMatch(line, /`([^`]+)`/) || "";
      const reading = firstMatch(line, /`[^`]+`\s*\(([^)]+)\)/) || "";
      const meaning = inlineMeaning(line) || "";
      return {
        kind: "word",
        title,
        reading,
        meaning: meaning.trim(),
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

function inlineMeaning(line) {
  return firstMatch(text(line), /`[^`]+`\s*(?:\([^)]+\))?\s*:?\s*([^|\n]+)/).trim();
}

function inlineDescription(line) {
  return firstMatch(text(line), /`[^`]+`\s*(?:\([^)]+\))?\s*:?\s*(.+)$/).trim();
}

function dailyEntryToItems(kind, parsed) {
  if (kind === "sentence") {
    return [
      {
        kind: "sentence",
        title: parsed.title,
        reading: parsed.reading,
        meaning: parsed.meaning,
        part: "문장",
        script: "혼합",
        note: parsed.note
      }
    ];
  }

  if (kind === "word") {
    const inlineWord = parseWordLines(parsed.note || "")[0];
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
    registered: entry.registered ? 1 : 0
  };
}

function groupItemsByKind(items) {
  return items.reduce((acc, item) => {
    acc[item.kind] ||= [];
    acc[item.kind].push(item);
    return acc;
  }, {});
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
    done: task.done ? 1 : 0
  };
}

function normalizeItem(item) {
  return {
    id: text(item.id || createId()),
    kind: text(item.kind || "word"),
    title: text(item.title),
    reading: text(item.reading),
    meaning: text(item.meaning),
    level: text(item.level),
    part: text(item.part),
    script: text(item.script),
    review: text(item.review),
    kanji: text(item.kanji),
    source: text(item.source),
    note: text(item.note)
  };
}

function normalizeDailyKind(kind) {
  return ["sentence", "word", "grammar", "expression"].includes(kind) ? kind : "sentence";
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : todayKey();
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1] || "";
}

function fieldValue(line, fieldName) {
  return firstMatch(line, new RegExp(`${fieldName}=([^|]+)`)).trim();
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

function toCsv(rows) {
  const columns = ["id", "kind", "title", "reading", "meaning", "level", "part", "script", "review", "kanji", "source", "note"];
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

module.exports = {
  initDatabase,
  getState,
  saveStudyLog,
  addDailyEntry,
  deleteDailyEntry,
  registerDailyEntry,
  addTask,
  updateTaskDone,
  upsertItem,
  deleteItem,
  updateItemReview,
  completeReview,
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
