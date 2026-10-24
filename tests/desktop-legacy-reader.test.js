import { afterAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSqliteAdapter, describeStorageSuite } from "./helpers/storage-adapters.js";

const require = createRequire(import.meta.url);
const { readLegacySqlite, normalizeTimestamp, LegacyReadError } = require("../apps/desktop/src/legacySqliteReader.js");
const { DatabaseSync } = require("node:sqlite");

const fixturePath = path.resolve(__dirname, "fixtures/legacy-desktop.sqlite");
const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/legacy-desktop.expected.json"), "utf8"));
// Reference "now" for the 90-day tombstone pruning (the fixture's generation time).
const now = Date.parse(expected.generatedAt);

const tmpDirs = [];
function tmpDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nihongo-legacy-reader-${label}-`));
  tmpDirs.push(dir);
  return dir;
}
function fixtureCopy(label) {
  const dir = tmpDir(label);
  const file = path.join(dir, "nihongo.sqlite");
  fs.copyFileSync(fixturePath, file);
  return { dir, file };
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

afterAll(() => {
  tmpDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("legacy sqlite reader", () => {
  it("reads the fixture into exactly the expected backup data shape", () => {
    const { data, counts } = readLegacySqlite(fixturePath, { now });
    expect(data).toEqual(expected.data);
    expect(counts).toEqual(expected.counts);
    expect(Object.keys(data).sort()).toEqual(["dailyEntries", "dailyEntryLinks", "items", "studyDays", "tasks"]);
  });

  it("covers every item kind, sourceSentences, tombstones and Japanese text", () => {
    const { data } = readLegacySqlite(fixturePath, { now });
    expect([...new Set(data.items.map(item => item.kind))].sort()).toEqual(["expression", "grammar", "kanji", "sentence", "source", "word"]);
    expect(data.dailyEntries.some(entry => entry.sourceSentences.length > 0)).toBe(true);
    expect(data.dailyEntries.some(entry => entry.deletedAt)).toBe(true);
    expect(data.tasks.some(task => task.done === true)).toBe(true);
    expect(data.items.some(item => item.title === "勉強")).toBe(true);
    // The tombstone back-dated past 90 days is pruned.
    expect(data.items.some(item => item.id === "item-stale")).toBe(false);
  });

  it("normalizes CURRENT_TIMESTAMP values to ISO and leaves ISO values alone", () => {
    const { data } = readLegacySqlite(fixturePath, { now });
    const stamps = [...data.studyDays, ...data.dailyEntries, ...data.tasks, ...data.items, ...data.dailyEntryLinks]
      .flatMap(row => [row.createdAt, row.updatedAt, row.deletedAt])
      .filter(Boolean);
    expect(stamps.length).toBeGreaterThan(20);
    stamps.forEach(value => expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/));

    expect(normalizeTimestamp("2026-07-06 03:04:05")).toBe("2026-07-06T03:04:05.000Z");
    expect(normalizeTimestamp("2026-07-06T03:04:05.123Z")).toBe("2026-07-06T03:04:05.123Z");
    expect(normalizeTimestamp("")).toBe("");
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp("2026-07-06")).toBe("2026-07-06");
  });

  it("never modifies the original database", () => {
    const { file } = fixtureCopy("untouched");
    const before = sha256(file);
    readLegacySqlite(file, { now });
    expect(sha256(file)).toBe(before);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["nihongo.sqlite"]);
  });

  it("sees committed data that only exists in the -wal file", () => {
    const { file } = fixtureCopy("wal");
    const writer = new DatabaseSync(file);
    try {
      writer.exec("PRAGMA journal_mode = WAL");
      writer.exec("PRAGMA wal_autocheckpoint = 0");
      writer.exec("INSERT INTO items (id, kind, title, meaning) VALUES ('wal-item', 'word', 'ウォル', 'only in wal')");
      expect(fs.statSync(`${file}-wal`).size).toBeGreaterThan(0);
      const baseBefore = sha256(file);
      const walBefore = sha256(`${file}-wal`);

      const { data, counts } = readLegacySqlite(file, { now });
      const walItem = data.items.find(item => item.id === "wal-item");
      expect(walItem).toMatchObject({ title: "ウォル", meaning: "only in wal", deletedAt: null });
      expect(walItem.createdAt).toMatch(/Z$/);
      expect(counts.items).toBe(expected.counts.items + 1);
      expect(sha256(file)).toBe(baseBefore);
      expect(sha256(`${file}-wal`)).toBe(walBefore);
    } finally {
      writer.close();
    }
  });

  it("returns a clear error listing record ids that fail the id rule", () => {
    const { file } = fixtureCopy("badid");
    const writer = new DatabaseSync(file);
    writer.exec(`INSERT INTO items (id, kind, title) VALUES ('bad id"><img', 'word', 'x')`);
    writer.exec("INSERT INTO tasks (id, title) VALUES ('ok-id', 't')");
    writer.exec("INSERT INTO tasks (id, title) VALUES ('한글', 't')");
    writer.close();

    let error;
    try {
      readLegacySqlite(file, { now });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LegacyReadError);
    expect(error.code).toBe("unsafe-ids");
    expect([...error.ids].sort()).toEqual(['bad id"><img', "한글"].sort());
    expect(error.message).toContain("2 legacy record id(s)");
    expect(error.message).toContain("bad id");
  });

  it("reports a missing file and a non-database file distinctly", () => {
    const dir = tmpDir("missing");
    const missing = path.join(dir, "nope.sqlite");
    expect(() => readLegacySqlite(missing)).toThrowError(/not found/);
    expect(() => readLegacySqlite(missing)).toThrowError(expect.objectContaining({ code: "missing" }));

    const junk = path.join(dir, "junk.sqlite");
    fs.writeFileSync(junk, "this is not a database");
    expect(() => readLegacySqlite(junk)).toThrowError(expect.objectContaining({ code: "read-failed" }));
  });

  it("tolerates databases that predate later ALTER TABLE columns", () => {
    const dir = tmpDir("old-schema");
    const file = path.join(dir, "nihongo.sqlite");
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE study_days (study_date TEXT PRIMARY KEY, minutes INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, reading TEXT NOT NULL DEFAULT '', meaning TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT '', part TEXT NOT NULL DEFAULT '', script TEXT NOT NULL DEFAULT '', review TEXT NOT NULL DEFAULT '', kanji TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO study_days (study_date, minutes) VALUES ('2026-01-01', 5);
      INSERT INTO items (id, kind, title) VALUES ('i1', 'word', '古い');
    `);
    db.close();
    const { data, counts } = readLegacySqlite(file, { now });
    expect(counts).toEqual({ studyDays: 1, dailyEntries: 0, dailyEntryLinks: 0, tasks: 0, items: 1 });
    expect(data.items[0]).toMatchObject({ id: "i1", quizCorrectCount: 0, reviewDueDate: "", lastReviewedAt: "", deletedAt: null });
    expect(data.studyDays[0].createdAt).toBe(data.studyDays[0].updatedAt);
  });
});

const { createSqliteStorage, loadError } = loadSqliteAdapter();

describeStorageSuite("legacy reader parity with storage-sqlite", loadError, () => {
  it("returns the same data as storage-sqlite's export of the same database", () => {
    const { dir } = fixtureCopy("parity");
    const store = createSqliteStorage({ appDataDir: dir });
    // Pin the clock to the fixture's generation time: initDatabase/export promote
    // due reviews and prune 90-day tombstones relative to "now".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      store.initDatabase();
      const exported = store.exportData().data;
      const readerData = readLegacySqlite(path.join(dir, "nihongo.sqlite"), { now }).data;
      const normalized = Object.fromEntries(Object.keys(readerData).map(name => [
        name,
        exported[name].map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [
          key,
          ["createdAt", "updatedAt", "deletedAt"].includes(key) ? normalizeTimestamp(value) : value
        ])))
      ]));
      expect(readerData).toEqual(normalized);
    } finally {
      vi.useRealTimers();
      store.close();
    }
  });
});
