// One-off generator for tests/fixtures/legacy-desktop.sqlite and
// tests/fixtures/legacy-desktop.expected.json.
//
// It drives the REAL legacy code path (packages/storage-sqlite: initDatabase +
// its write methods), so the fixture is a genuine legacy desktop database.
// Requires better-sqlite3 built for plain Node (`npm rebuild better-sqlite3`),
// which is why it is run manually and never from vitest:
//
//   node tests/fixtures/make-legacy-desktop-fixture.mjs
//
// The expected JSON is storage-sqlite's own exportData().data for that database
// (selectedDate dropped) with SQLite CURRENT_TIMESTAMP values normalized to ISO
// the same way apps/desktop/src/legacySqliteReader.js does. `generatedAt` is the
// reference "now" for the 90-day tombstone pruning: tests pass it to the reader.
//
// packages/storage-sqlite is deleted in a later PR; after that this generator can
// no longer be re-run, and the committed fixture files are the source of truth.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const { createSqliteStorage } = require(path.join(root, "packages/storage-sqlite/src/index.js"));
const Database = require("better-sqlite3");
const { normalizeTimestamp } = require(path.join(root, "apps/desktop/src/legacySqliteReader.js"));

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nihongo-legacy-fixture-"));
const store = createSqliteStorage({ appDataDir: workDir });
store.initDatabase();

const day1 = "2026-07-01";
const day2 = "2026-07-02";
const day3 = "2026-07-03";

// study days
store.saveStudyLog({ studyDate: day1, minutes: 30, summary: "N5 단어 복습", note: "ひらがなの復習" });
store.saveStudyLog({ studyDate: day2, minutes: 45, summary: "문법 공부", note: "〜てもいい を練習した" });
store.saveStudyLog({ studyDate: day3, minutes: 0, summary: "", note: "" });

// daily entries: two sentences (with child word/grammar/expression), a standalone word
const sentence1 = [
  "# 今日は天気がいいです",
  "읽기 きょうはてんきがいいです",
  "해석 오늘은 날씨가 좋습니다",
  "단어장",
  "`天気`(てんき)|품사=명사|한자=天(heaven),気(spirit)|메모=날씨",
  "`単語`(たんご)|품사=명사|한자=単(single),語(word)|메모=단어",
  "문법",
  "`〜てもいい`|메모=허가 표현",
  "표현",
  "`よろしくお願いします`|메모=인사"
].join("\n");
const sentence2 = [
  "# 単語を覚えてもいいですか",
  "읽기 たんごをおぼえてもいいですか",
  "해석 단어를 외워도 될까요?",
  "단어장",
  "`単語`(たんご)|품사=명사|한자=単(single),語(word)|메모=단어",
  "`覚える`(おぼえる)|품사=동사|메모=외우다",
  "문법",
  "`〜てもいい`|메모=허가 표현"
].join("\n");
const sentence3 = ["# 消えた文章", "읽기 きえたぶんしょう", "해석 삭제될 문장"].join("\n");

store.addDailyEntry({ studyDate: day1, kind: "sentence", rawText: sentence1 });
store.addDailyEntry({ studyDate: day2, kind: "sentence", rawText: sentence2 });
const withDeletable = store.addDailyEntry({ studyDate: day3, kind: "sentence", rawText: sentence3 });
store.addDailyEntry({ studyDate: day3, kind: "word", rawText: "`図書館`(としょかん)|품사=명사|한자=図(map),書(write),館(hall)|메모=도서관" });

// Register the day-1 and day-2 sentences into study items (word/grammar/expression/kanji/sentence).
const sentenceIds = [day1, day2].map(date => {
  const state = store.getState(date);
  return state.dailyEntries.find(entry => entry.kind === "sentence").id;
});
store.registerDailyEntries(sentenceIds, day1);

// Tombstoned daily entry (soft delete stamps an ISO deletedAt).
const deletable = withDeletable.dailyEntries.find(entry => entry.title === "消えた文章");
store.deleteDailyEntry(deletable.id, day3);

// tasks
store.addTask({ id: "task-1", title: "漢字を10個覚える", note: "N5 한자", tag: "한자", studyDate: day1 });
store.addTask({ id: "task-2", title: "宿題を出す", note: "", tag: "", studyDate: day2 });
store.addTask({ id: "task-3", title: "削除済みタスク", note: "", tag: "", studyDate: day2, deletedAt: new Date().toISOString() });
store.updateTaskDone("task-2", true, day2);

// items added directly: every kind, quiz counters, review state, sources
store.upsertItem({
  id: "item-word-1", kind: "word", title: "勉強", reading: "べんきょう", meaning: "공부",
  level: "N5", part: "명사", script: "한자", review: "오늘", kanji: "勉(endeavor),強(strong)",
  source: "教科書", note: "毎日勉強する"
});
store.upsertItem({ id: "item-grammar-1", kind: "grammar", title: "〜ながら", reading: "", meaning: "~하면서", level: "N4", note: "同時進行" });
store.upsertItem({ id: "item-expression-1", kind: "expression", title: "お疲れ様です", reading: "おつかれさまです", meaning: "수고하셨습니다", level: "N4" });
store.upsertItem({ id: "item-kanji-1", kind: "kanji", title: "水", reading: "すい・みず", meaning: "물", level: "N5", note: "水曜日" });
store.upsertItem({ id: "item-sentence-1", kind: "sentence", title: "猫が好きです。", reading: "ねこがすきです", meaning: "고양이를 좋아합니다", review: "내일" });
store.upsertItem({ id: "item-source-1", kind: "source", title: "NHK Easy", reading: "", meaning: "", note: "https://www3.nhk.or.jp/news/easy/" });
store.upsertItem({ id: "item-deleted", kind: "word", title: "古い単語", meaning: "지워질 단어" });
store.upsertItem({ id: "item-stale", kind: "word", title: "とても古い単語", meaning: "오래된 삭제" });
store.submitWordQuizAnswer({ itemId: "item-word-1", quizKind: "word", answerType: "meaning", selectedAnswer: "공부", studyDate: day1 });
store.submitWordQuizAnswer({ itemId: "item-word-1", quizKind: "word", answerType: "meaning", selectedAnswer: "오답", studyDate: day1 });
store.completeReview([{ id: "item-grammar-1", review: "3일 후" }], day1);
store.deleteItem("item-deleted", day1);
store.deleteItem("item-stale", day1);

// Age one tombstone past the 90-day pruning window so export (and the reader) drop it.
// Raw UPDATE on a second handle: there is no API to back-date a tombstone.
{
  const raw = new Database(path.join(workDir, "nihongo.sqlite"));
  raw.prepare("UPDATE items SET deleted_at = '2025-01-01T00:00:00.000Z', updated_at = '2025-01-01T00:00:00.000Z' WHERE id = 'item-stale'").run();
  raw.close();
}

const generatedAt = new Date().toISOString();
const exported = store.exportData();
const { selectedDate, ...data } = exported.data;

const timestampFields = ["createdAt", "updatedAt", "deletedAt"];
const normalized = Object.fromEntries(Object.entries(data).map(([name, rows]) => [
  name,
  rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    timestampFields.includes(key) ? normalizeTimestamp(value) : value
  ])))
]));

store.close(); // checkpoints the WAL and removes -wal/-shm

fs.copyFileSync(path.join(workDir, "nihongo.sqlite"), path.join(here, "legacy-desktop.sqlite"));
const counts = Object.fromEntries(Object.entries(normalized).map(([name, rows]) => [name, rows.length]));
fs.writeFileSync(
  path.join(here, "legacy-desktop.expected.json"),
  `${JSON.stringify({ generatedAt, counts, data: normalized }, null, 2)}\n`,
  "utf8"
);
fs.rmSync(workDir, { recursive: true, force: true });
console.log("Wrote legacy-desktop.sqlite and legacy-desktop.expected.json", counts);
