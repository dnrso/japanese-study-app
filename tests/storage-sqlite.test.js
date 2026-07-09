// Ported from scratchpad test-sqlite-parity.js.
//
// ABI CAVEAT: better-sqlite3 in this repo may be compiled against Electron's
// NODE_MODULE_VERSION (the desktop app rebuilds it via electron-rebuild),
// which will not load under a plain Node runtime. We attempt to load the
// native binding at module init; if it doesn't match this Node ABI, the
// whole suite is skipped with a console.warn explaining how to fix it
// locally (npm rebuild better-sqlite3). CI runs a fresh `npm ci`, which
// builds the native addon for plain Node, so it should run there.
import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);

let Database;
let createSqliteStorage;
let abiError = null;

try {
  Database = require("better-sqlite3");
  const probe = new Database(":memory:");
  probe.close();
  ({ createSqliteStorage } = require("../packages/storage-sqlite/src/index.js"));
} catch (error) {
  abiError = error;
}

if (abiError) {
  console.warn(
    "[storage-sqlite.test.js] Skipping suite: better-sqlite3 native binding does not match " +
    "this Node ABI (likely built for Electron instead of plain Node). Run " +
    "`npm rebuild better-sqlite3` to run this suite locally. Original error: " +
    abiError.message
  );
}

const describeMaybe = abiError ? describe.skip : describe;

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

describeMaybe("storage-sqlite (better-sqlite3, temp DBs)", () => {
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
});
