// Ported from scratchpad test-sqlite-parity.js.
//
// ABI CAVEAT: better-sqlite3 in this repo may be compiled against Electron's
// NODE_MODULE_VERSION (the desktop app rebuilds it via electron-rebuild),
// which will not load under a plain Node runtime. loadSqliteAdapter() probes
// the native binding; describeStorageSuite() then skips this suite in LOCAL
// dev only (with a console.warn explaining `npm rebuild better-sqlite3`) and
// turns the same situation into a HARD FAILURE when CI is set - a silent
// describe.skip here used to make these 12 tests vanish while CI stayed green.
import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import "fake-indexeddb/auto";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import { loadSqliteAdapter, describeStorageSuite } from "./helpers/storage-adapters.js";

const { Database, createSqliteStorage, loadError: abiError } = loadSqliteAdapter();

const tmpDirs = [];
function tmpDataDir(suffix) {
  const dir = path.join(os.tmpdir(), `nihongo-sqlite-parity-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  // Best-effort cleanup: better-sqlite3 doesn't expose a close() from
  // createSqliteStorage, so on Windows the WAL/db file handle may still be
  // held open here, making rmSync fail with EPERM. That's a harmless
  // OS-temp-dir leak (the OS reclaims it eventually), not a test failure.
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[storage-sqlite.test.js] Could not clean up temp dir ${dir}: ${error.message}`);
    }
  }
});

describeStorageSuite("storage-sqlite (better-sqlite3, temp DBs)", abiError, () => {
  const studyDate = "2026-07-06";
  let dir1;
  let store1;
  let sentenceEntry;
  let wordItem;

  it("Case1: fresh DB init creates the new soft-delete/lastReviewedAt columns", () => {
    dir1 = tmpDataDir("fresh");
    store1 = createSqliteStorage({ appDataDir: dir1 });
    store1.initDatabase();

    const rawDb = new Database(path.join(dir1, "nihongo.sqlite"));
    const itemCols = rawDb.prepare("PRAGMA table_info(items)").all().map(c => c.name);
    const dailyCols = rawDb.prepare("PRAGMA table_info(daily_entries)").all().map(c => c.name);
    const linkCols = rawDb.prepare("PRAGMA table_info(daily_entry_links)").all().map(c => c.name);
    const taskCols = rawDb.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    const dayCols = rawDb.prepare("PRAGMA table_info(study_days)").all().map(c => c.name);
    rawDb.close();

    expect(itemCols).toContain("last_reviewed_at");
    expect(itemCols).toContain("deleted_at");
    expect(dailyCols).toContain("deleted_at");
    expect(linkCols).toContain("id");
    expect(linkCols).toContain("updated_at");
    expect(linkCols).toContain("deleted_at");
    expect(taskCols).toContain("deleted_at");
    expect(dayCols).toContain("deleted_at");
  });

  it("Case2: deleting a sentence entry cascades soft-delete (tombstones) to child entries and links", () => {
    let state = store1.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: [
        "# 오늘의 문장",
        "읽기 きょうのぶんしょう",
        "해석 오늘의 문장입니다",
        "단어장",
        "`単語`(たんご)|품사=명사|메모=단어",
        "문법",
        "`〜てもいい`|메모=문법 표현",
        "표현",
        "`よろしくお願いします`|메모=인사"
      ].join("\n")
    });

    sentenceEntry = state.dailyEntries.find(entry => entry.kind === "sentence");
    expect(sentenceEntry).toBeTruthy();

    const childBefore = state.dailyEntries.filter(entry => entry.parentId === sentenceEntry.id);
    expect(childBefore).toHaveLength(3);

    state = store1.deleteDailyEntry(sentenceEntry.id, studyDate);
    const afterDeleteEntries = state.dailyEntries.filter(entry => entry.id === sentenceEntry.id || entry.parentId === sentenceEntry.id);
    expect(afterDeleteEntries).toHaveLength(0);

    const rawDb = new Database(path.join(dir1, "nihongo.sqlite"));
    const tombstonedEntries = rawDb.prepare(
      "SELECT id, deleted_at AS deletedAt FROM daily_entries WHERE id = ? OR parent_id = ?"
    ).all(sentenceEntry.id, sentenceEntry.id);
    expect(tombstonedEntries.length).toBeGreaterThan(0);
    expect(tombstonedEntries.every(row => Boolean(row.deletedAt))).toBe(true);

    const tombstonedLinks = rawDb.prepare(
      "SELECT deleted_at AS deletedAt FROM daily_entry_links WHERE entry_id = ? OR sentence_id = ?"
    ).all(sentenceEntry.id, sentenceEntry.id);
    expect(tombstonedLinks.length).toBeGreaterThan(0);
    expect(tombstonedLinks.every(row => Boolean(row.deletedAt))).toBe(true);
    rawDb.close();
  });

  it("Case3: exportData includes tombstoned entries and links with deletedAt", () => {
    const exported = store1.exportData();
    const exportedDeletedEntry = exported.data.dailyEntries.find(entry => entry.id === sentenceEntry.id);
    expect(exportedDeletedEntry?.deletedAt).toBeTruthy();

    const exportedDeletedLinks = exported.data.dailyEntryLinks.filter(
      link => link.entryId === sentenceEntry.id || link.sentenceId === sentenceEntry.id
    );
    expect(exportedDeletedLinks.length).toBeGreaterThan(0);
    expect(exportedDeletedLinks.every(link => Boolean(link.deletedAt))).toBe(true);
  });

  let store1Reopened;
  it("Case4: reopening the DB (new instance, same file) keeps the deletion out of getState", () => {
    store1Reopened = createSqliteStorage({ appDataDir: dir1 });
    store1Reopened.initDatabase();
    const stateAfterReopen = store1Reopened.getState(studyDate);
    const stillGone = stateAfterReopen.dailyEntries.filter(
      entry => entry.id === sentenceEntry.id || entry.parentId === sentenceEntry.id
    );
    expect(stillGone).toHaveLength(0);
  });

  it("Case5: completeReview stamps lastReviewedAt (empty initially, set after review)", () => {
    let state = store1Reopened.upsertItem({ kind: "word", title: "テスト", reading: "てすと", meaning: "test", review: "대기" });
    wordItem = state.items.find(item => item.title === "テスト");
    expect(wordItem).toBeTruthy();
    expect(wordItem.lastReviewedAt).toBe("");

    const completeReviewState = store1Reopened.completeReview([{ id: wordItem.id, review: "일주일" }], studyDate);
    const reviewedItem = completeReviewState.items.find(item => item.id === wordItem.id);
    expect(reviewedItem?.lastReviewedAt).toBeTruthy();
  });

  it("Case5b: submitWordQuizAnswer (correct + updateReviewOnCorrect) stamps lastReviewedAt", () => {
    const quizItemState = store1Reopened.upsertItem({ kind: "word", title: "クイズ", reading: "くいず", meaning: "quiz", review: "대기" });
    const quizItem = quizItemState.items.find(item => item.title === "クイズ");
    const quizResult = store1Reopened.submitWordQuizAnswer({
      itemId: quizItem.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "quiz",
      updateReviewOnCorrect: true,
      correctReview: "3일 후",
      studyDate
    });
    const quizzedItem = quizResult.state.items.find(item => item.id === quizItem.id);
    expect(quizzedItem?.lastReviewedAt).toBeTruthy();
  });

  it("deleteItem soft-deletes (stamps deleted_at) instead of removing the row", () => {
    const deleteItemState = store1Reopened.deleteItem(wordItem.id, studyDate);
    const goneItem = deleteItemState.items.find(item => item.id === wordItem.id);
    expect(goneItem).toBeFalsy();

    const rawDb = new Database(path.join(dir1, "nihongo.sqlite"));
    const rawDeletedItem = rawDb.prepare("SELECT deleted_at AS deletedAt FROM items WHERE id = ?").get(wordItem.id);
    expect(rawDeletedItem?.deletedAt).toBeTruthy();
    rawDb.close();
  });

  it("Case6: an existing old-schema DB (no new columns, composite-PK links table) migrates in place without error", () => {
    const dir2 = tmpDataDir("legacy");
    const legacyDbPath = path.join(dir2, "nihongo.sqlite");
    const legacyDb = new Database(legacyDbPath);
    legacyDb.exec(`
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
        PRIMARY KEY (entry_id, sentence_id)
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
    `);

    const legacySentenceId = "legacy-sentence-1";
    const legacyWordId = "legacy-word-1";
    legacyDb.prepare(`
      INSERT INTO daily_entries (id, study_date, kind, title, reading, meaning, raw_text, parsed_json, registered)
      VALUES (?, ?, 'sentence', 'legacy title', '', '', '', '{}', 0)
    `).run(legacySentenceId, studyDate);
    legacyDb.prepare(`
      INSERT INTO daily_entries (id, study_date, kind, title, reading, meaning, raw_text, parsed_json, registered)
      VALUES (?, ?, 'word', 'legacy word', '', '', '', '{}', 0)
    `).run(legacyWordId, studyDate);
    legacyDb.prepare(`
      INSERT INTO daily_entry_links (entry_id, sentence_id) VALUES (?, ?)
    `).run(legacyWordId, legacySentenceId);
    legacyDb.prepare(`
      INSERT INTO items (id, kind, title, reading, meaning, level, part, script, review, kanji, source, note)
      VALUES ('legacy-item-1', 'word', 'legacy word', '', 'meaning', '', '', '', '대기', '', '', '')
    `).run();
    legacyDb.close();

    let store2;
    expect(() => {
      store2 = createSqliteStorage({ appDataDir: dir2 });
      store2.initDatabase();
    }).not.toThrow();

    const rawDb2 = new Database(legacyDbPath);
    const legacyLinkCols = rawDb2.prepare("PRAGMA table_info(daily_entry_links)").all().map(c => c.name);
    expect(legacyLinkCols).toContain("id");
    expect(legacyLinkCols).toContain("updated_at");
    expect(legacyLinkCols).toContain("deleted_at");

    const preservedLink = rawDb2.prepare(
      "SELECT * FROM daily_entry_links WHERE entry_id = ? AND sentence_id = ?"
    ).get(legacyWordId, legacySentenceId);
    expect(preservedLink).toBeTruthy();

    const legacyItemCols = rawDb2.prepare("PRAGMA table_info(items)").all().map(c => c.name);
    expect(legacyItemCols).toContain("last_reviewed_at");
    expect(legacyItemCols).toContain("deleted_at");
    rawDb2.close();

    const state2 = store2.getState(studyDate);
    expect(state2.dailyEntries.some(entry => entry.id === legacyWordId)).toBe(true);
  });

  it("Case7: fresh DB init adds tasks.study_date column", () => {
    const dir = tmpDataDir("tasks-study-date");
    const store = createSqliteStorage({ appDataDir: dir });
    store.initDatabase();

    const rawDb = new Database(path.join(dir, "nihongo.sqlite"));
    const taskCols = rawDb.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    rawDb.close();
    expect(taskCols).toContain("study_date");
  });

  it("Case8: addTask persists studyDate and it round-trips through getState and exportData", () => {
    const dir = tmpDataDir("tasks-roundtrip");
    const store = createSqliteStorage({ appDataDir: dir });
    store.initDatabase();

    const state = store.addTask({ title: "복습하기", note: "", tag: "일반", done: false, studyDate });
    const task = state.tasks.find(candidate => candidate.title === "복습하기");
    expect(task?.studyDate).toBe(studyDate);

    const exported = store.exportData();
    const exportedTask = exported.data.tasks.find(candidate => candidate.id === task.id);
    expect(exportedTask?.studyDate).toBe(studyDate);
  });

  it("Case8b: an unknown review string is never persisted as-is (falls back to 대기, empty stays empty)", () => {
    const dir = tmpDataDir("invalid-review");
    const store = createSqliteStorage({ appDataDir: dir });
    store.initDatabase();

    const state = store.upsertItem({
      kind: "word",
      title: "잘못된복습",
      reading: "",
      meaning: "bad review value",
      review: "존재하지않는상태",
      studyDate
    });
    const item = state.items.find(candidate => candidate.title === "잘못된복습");
    expect(item).toBeTruthy();
    expect(item.review).not.toBe("존재하지않는상태");
    expect(item.review).toBe("대기");

    // The raw column must not contain the garbage value either.
    const rawDb = new Database(path.join(dir, "nihongo.sqlite"));
    const rawItem = rawDb.prepare("SELECT review FROM items WHERE id = ?").get(item.id);
    rawDb.close();
    expect(rawItem.review).toBe("대기");

    // updateItemReview shares the same normalizer.
    const updated = store.updateItemReview(item.id, "완전히다른값", studyDate);
    expect(updated.items.find(candidate => candidate.id === item.id)?.review).toBe("대기");

    // Empty must stay empty: source items rely on it (as does the quiz's
    // "변경 안 함" option, which sends "" to mean "leave the review alone").
    const sourceState = store.upsertItem({ kind: "source", title: "출처자료", meaning: "", studyDate });
    const sourceItem = sourceState.items.find(candidate => candidate.title === "출처자료");
    expect(sourceItem?.review).toBe("");
  });

  it("Case8c: a partial upsertItem() PATCHes the row instead of rebuilding it (regression: D6 data loss)", () => {
    const dir = tmpDataDir("partial-upsert");
    const store = createSqliteStorage({ appDataDir: dir });
    store.initDatabase();
    const dbFile = path.join(dir, "nihongo.sqlite");

    const created = store.upsertItem({
      kind: "word",
      title: "부분수정",
      reading: "ぶぶん",
      meaning: "partial",
      level: "N3",
      part: "명사",
      script: "한자+히라가나",
      source: "교재",
      note: "메모",
      kanji: "部(part)",
      review: "일주일",
      studyDate
    });
    const item = created.items.find(candidate => candidate.title === "부분수정");
    expect(item.reviewDueDate).toBeTruthy();
    // The 한자 sub-item derived from `kanji` (see D7).
    expect(created.items.filter(candidate => candidate.kind === "kanji").map(candidate => candidate.title)).toEqual(["部"]);

    // Backdate the audit columns so "createdAt is preserved, updatedAt moves"
    // is observable despite CURRENT_TIMESTAMP's one-second resolution.
    const backdate = new Database(dbFile);
    backdate.prepare("UPDATE items SET created_at = ?, updated_at = ? WHERE id = ?")
      .run("2000-01-01 00:00:00", "2000-01-01 00:00:00", item.id);
    backdate.close();

    // The PATCH the desktop app used to lose data on: id + kind + title only.
    const patched = store.upsertItem({ id: item.id, kind: "word", title: "부분수정2", studyDate });
    const after = patched.items.find(candidate => candidate.id === item.id);

    expect(after.title).toBe("부분수정2");
    expect(after.reading).toBe("ぶぶん");
    expect(after.meaning).toBe("partial");
    expect(after.level).toBe("N3");
    expect(after.part).toBe("명사");
    expect(after.script).toBe("한자+히라가나");
    expect(after.source).toBe("교재");
    expect(after.note).toBe("메모");
    expect(after.kanji).toBe("部(part)");
    expect(after.review).toBe("일주일");
    expect(after.reviewDueDate).toBe(item.reviewDueDate);
    // The omitted `kanji` must not trigger a second derivation pass either.
    expect(patched.items.filter(candidate => candidate.kind === "kanji")).toHaveLength(1);

    const rawDb = new Database(dbFile);
    const rawItem = rawDb.prepare(`
      SELECT reading, meaning, level, part, script, source, note, review,
        review_due_date AS reviewDueDate,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM items WHERE id = ?
    `).get(item.id);
    rawDb.close();

    // Nothing was blanked on disk, createdAt survived, updatedAt advanced.
    expect(rawItem.reading).toBe("ぶぶん");
    expect(rawItem.note).toBe("메모");
    expect(rawItem.review).toBe("일주일");
    expect(rawItem.reviewDueDate).toBe(item.reviewDueDate);
    expect(rawItem.createdAt).toBe("2000-01-01 00:00:00");
    expect(rawItem.updatedAt).not.toBe("2000-01-01 00:00:00");

    // A key that IS present wins, even when empty.
    const cleared = store.upsertItem({ id: item.id, note: "", level: "", studyDate });
    const blanked = cleared.items.find(candidate => candidate.id === item.id);
    expect(blanked.note).toBe("");
    expect(blanked.level).toBe("");
    expect(blanked.reading).toBe("ぶぶん");
    expect(blanked.review).toBe("일주일");
  });

  it("Case9: round-trip - idb exportData -> sqlite importFullBackup -> sqlite exportData preserves parsed structure, sourceSentences, and tasks.studyDate", async () => {
    const dbName = `sqlite-parity-idb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const idbStore = createIdbStorage({ dbName });
    await idbStore.initDatabase();

    await idbStore.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: [
        "# 라운드트립 문장",
        "읽기 らうんどとりっぷぶんしょう",
        "해석 round trip sentence",
        "단어장",
        "`単語`(たんご)|품사=명사|메모=단어",
        "문법",
        "표현"
      ].join("\n")
    });
    await idbStore.addTask({ id: "idb-task-1", title: "복습", note: "", tag: "일반", done: false, studyDate });

    const idbExport = await idbStore.exportData();
    const idbSentence = idbExport.data.dailyEntries.find(entry => entry.kind === "sentence");
    expect(idbSentence).toBeTruthy();
    expect(idbSentence.parsed).toBeTruthy();
    expect(typeof idbSentence.parsed).toBe("object");

    const sqliteDir = tmpDataDir("roundtrip-sqlite");
    const sqliteStore = createSqliteStorage({ appDataDir: sqliteDir });
    sqliteStore.initDatabase();
    // Prime backupsDir/full-backup.yaml, then overwrite it with the idb
    // export so importFullBackup() (which always reads from that fixed
    // file) picks up the idb-shaped payload.
    sqliteStore.exportData();
    fs.writeFileSync(
      path.join(sqliteDir, "backups", "full-backup.yaml"),
      YAML.stringify(idbExport.data),
      "utf8"
    );
    sqliteStore.importFullBackup();

    const sqliteExport = sqliteStore.exportData();
    const importedSentence = sqliteExport.data.dailyEntries.find(entry => entry.kind === "sentence" && entry.title === idbSentence.title);
    expect(importedSentence).toBeTruthy();
    expect(importedSentence.parsed).toBeTruthy();
    expect(importedSentence.parsed.title).toBe(idbSentence.parsed.title);
    expect(importedSentence.parsed.reading).toBe(idbSentence.parsed.reading);
    expect(importedSentence.registered).toBe(false);

    const importedWord = sqliteExport.data.dailyEntries.find(entry => entry.kind === "word" && entry.title === "単語");
    expect(importedWord).toBeTruthy();
    expect(importedWord.sourceSentences.some(sentence => sentence.title === idbSentence.title)).toBe(true);

    const importedTask = sqliteExport.data.tasks.find(task => task.id === "idb-task-1");
    expect(importedTask?.studyDate).toBe(studyDate);
  });
});
