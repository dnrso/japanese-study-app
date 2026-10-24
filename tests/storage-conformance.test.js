// Behavioral conformance suite for the storage adapter contract.
//
// Runs against storage-idb (the only adapter) on fake-indexeddb, driven off
// `storageContract` in packages/storage. `assertStorageAdapter`'s typeof-only
// check cannot see any of this.
//
// Observed behavior worth knowing (each is asserted below):
//   - exportData() returns { appDataDir, exportsDir, backupsDir, dbPath, data };
//     nothing is written to disk (the browser download is the host's job).
//   - getState() returns whole records (createdAt/updatedAt/deletedAt present,
//     no parsedJson) and full study-day records including `note`.
//   - upsertItem() merges into an existing row and does NOT derive 한자 items
//     from item.kanji (registerDailyEntries() does).
//   - registerDailyEntries() never reports `linked` (always []).
//   - importFullBackup(backup) and importCsvExports(backup, studyDate) take the
//     data as an object argument.
//   - resetSampleData() clears, then restores the shared sample seed;
//     clearAllData() hard-clears with no tombstones.
//   - applyRemoteSnapshot(remote, merge) runs merge synchronously inside one
//     readwrite transaction against current local rows.
//
// The rawText parsers are shared through @nihongo-study/storage-core, so the
// `sharedChildRecords` assertion below guards the parsed output.
import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import { createSampleState, missingDailyEntryMessage } from "@nihongo-study/storage-core";
import { mergeBackupData } from "../packages/core/src/index.js";

const require = createRequire(import.meta.url);
const {
  storageContract,
  storageMethodNames,
  storagePathKeys,
  storageStateShape,
  assertStorageAdapter
} = require("../packages/storage/src/index.js");

const studyDate = "2026-07-06";
const pastDate = "2020-01-05";
const emptyDate = "2026-12-31";

function todayKey() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Sentence title "오늘의 문장" plus three
// children - word 単語, grammar 〜てもいい, expression よろしくお願いします.
const sentenceRawText = [
  "# 오늘의 문장",
  "읽기 きょうのぶんしょう",
  "해석 오늘의 문장입니다",
  "단어장",
  "`単語`(たんご)|품사=명사|한자=単(single),語(word)|메모=단어",
  "문법",
  "`〜てもいい`|메모=문법 표현",
  "표현",
  "`よろしくお願いします`|메모=인사"
].join("\n");

// Derived child records for `sentenceRawText`, parsed by parseDailyEntry in
// @nihongo-study/storage-core. The values themselves are still poor - the shared
// parser leaks the raw "|메모=..." metadata into a grammar meaning and derives
// nothing for an expression - but this constant is the only place to update if
// the parser is fixed.
const sharedChildRecords = {
  word: { title: "単語", reading: "たんご", meaning: "(たんご)", kanji: "単(single),語(word)" },
  grammar: { title: "〜てもいい", reading: "", meaning: "|메모=문법 표현" },
  expression: { title: "よろしくお願いします", reading: "", meaning: "" }
};

const backupPayload = {
  data: {
    selectedDate: studyDate,
    studyDays: [],
    allDailyEntries: [],
    dailyEntryLinks: [],
    tasks: [],
    items: [{ id: "imported-1", kind: "word", title: "백업단어", meaning: "from backup" }]
  }
};

const csvPayload = { items: [{ id: "csv-1", kind: "word", title: "CSV단어", meaning: "from csv" }] };

const sampleSeed = () => ({
  selectedDate: studyDate,
  studyDays: [],
  dailyEntries: [],
  dailyEntryLinks: [],
  tasks: [],
  items: [{ id: "seed-1", kind: "word", title: "샘플단어", meaning: "sample" }]
});

const adapter = {
  async create(options = {}) {
    const store = createIdbStorage({ dbName: unique("conformance-idb"), ...options });
    await store.initDatabase();
    return store;
  }
};

describe("storage contract", () => {
  it("storageMethodNames stays derived from storageContract", () => {
    expect(storageMethodNames).toEqual(storageContract.map(entry => entry.name));
    expect(storageMethodNames).toHaveLength(20);
    expect(new Set(storageMethodNames).size).toBe(storageMethodNames.length);
  });

  it("every contract entry declares a signature the conformance suite can consume", () => {
    storageContract.forEach(entry => {
      expect(typeof entry.name).toBe("string");
      expect(Array.isArray(entry.params)).toBe(true);
      expect(["state", "stateResult", "export", "handle", "applied", "none"]).toContain(entry.returns);
    });
    expect(storageStateShape.required).toContain("items");
    expect(storageStateShape.required).toContain("allDailyEntries");
    expect(storageStateShape.arrays).toContain("allDailyEntries");
    expect(storageStateShape.optional).not.toContain("allDailyEntries");
    expect(storagePathKeys).toEqual(["appDataDir", "exportsDir", "backupsDir", "dbPath"]);
  });

  it("assertStorageAdapter rejects missing methods, bad arity, bad paths and undeclared methods", () => {
    const stub = {};
    storageMethodNames.forEach(name => {
      stub[name] = () => ({});
    });
    stub.paths = { appDataDir: "a", exportsDir: "b", backupsDir: "c", dbPath: "d" };

    expect(() => assertStorageAdapter(stub)).not.toThrow();
    expect(() => assertStorageAdapter(null)).toThrow(/must be an object/);
    expect(() => assertStorageAdapter({ ...stub, getState: undefined })).toThrow(/missing methods: getState/);
    expect(() => assertStorageAdapter({ ...stub, paths: { ...stub.paths, dbPath: 1 } })).toThrow(/paths\.dbPath must be a string/);
    expect(() => assertStorageAdapter({ ...stub, paths: { ...stub.paths, dbPath: "" } })).toThrow(/non-empty/);
    // The check the old typeof-only version could not make: a method that
    // demands more arguments than the contract's canonical signature.
    expect(() => assertStorageAdapter({ ...stub, deleteItem: (a, b, c) => ({ a, b, c }) }))
      .toThrow(/incompatible method signatures: deleteItem declares 3 required parameters/);
    // Non-strict tolerates additions (so desktop boot never breaks on one);
    // strict rejects them so the contract cannot silently fall behind.
    const withExtra = { ...stub, migrateEverything: () => ({}) };
    expect(() => assertStorageAdapter(withExtra)).not.toThrow();
    expect(() => assertStorageAdapter(withExtra, { strict: true })).toThrow(/does not declare: migrateEverything/);
  });
});

describe("storage conformance: storage-idb", () => {
  async function freshStore(options) {
    return adapter.create(options);
  }

  async function caught(run) {
    try {
      await run();
      return null;
    } catch (error) {
      return error;
    }
  }

  function byTitle(records, title) {
    return records.find(record => record.title === title);
  }

  async function storeWithSentence() {
    const store = await freshStore();
    const state = await store.addDailyEntry({ studyDate, kind: "sentence", rawText: sentenceRawText });
    const sentence = state.dailyEntries.find(entry => entry.kind === "sentence");
    const child = kind => state.dailyEntries.find(entry => entry.kind === kind);
    return { store, state, sentence, child };
  }

  // ---------------------------------------------------------------- contract

  it("satisfies the strict storage adapter contract", async () => {
    const store = await freshStore();
    expect(() => assertStorageAdapter(store, { strict: true })).not.toThrow();
    storageContract.forEach(entry => {
      expect(typeof store[entry.name]).toBe("function");
      expect(store[entry.name].length).toBeLessThanOrEqual(entry.params.length);
    });
    storagePathKeys.forEach(key => expect(store.paths[key]).toBeTruthy());
  });

  it("getState() returns the canonical state envelope", async () => {
    const store = await freshStore();
    const state = await store.getState(studyDate);

    storageStateShape.required.forEach(key => expect(state).toHaveProperty(key));
    storageStateShape.arrays.forEach(key => expect(Array.isArray(state[key])).toBe(true));
    expect(state.selectedDate).toBe(studyDate);
    expect(Object.keys(state.studyLog).sort()).toEqual([...storageStateShape.studyLogKeys].sort());
    expect(state.studyLog.minutes).toBe(0);
    expect(state.studyLog.totalMinutes).toBe(0);

    const defaulted = await store.getState();
    expect(defaulted.selectedDate).toBe(todayKey());
  });

  it("getState() scopes dailyEntries to the requested date but not tasks or items", async () => {
    const store = await freshStore();
    await store.addDailyEntry({ studyDate, kind: "sentence", rawText: sentenceRawText });
    await store.addTask({ title: "할일", note: "", tag: "일반", done: false, studyDate: "2026-01-01" });
    await store.upsertItem({ kind: "word", title: "항목", meaning: "item" });

    const scoped = await store.getState(emptyDate);
    expect(scoped.selectedDate).toBe(emptyDate);
    expect(scoped.dailyEntries).toHaveLength(0);
    expect(scoped.tasks.some(task => task.title === "할일")).toBe(true);
    expect(byTitle(scoped.items, "항목")).toBeTruthy();
  });

  // ------------------------------------------------------- items: CRUD basics

  it("upsertItem() inserts with the canonical defaults", async () => {
    const store = await freshStore();
    const state = await store.upsertItem({ kind: "word", title: "単語A", reading: "たんごA", meaning: "word A" });
    const item = byTitle(state.items, "単語A");

    expect(item.id).toBeTruthy();
    expect(item.kind).toBe("word");
    expect(item.reading).toBe("たんごA");
    expect(item.meaning).toBe("word A");
    expect(item.review).toBe("대기");
    expect(item.reviewDueDate).toBe("");
    expect(item.quizCorrectCount).toBe(0);
    expect(item.quizWrongCount).toBe(0);
    expect(item.lastQuizzedAt).toBe("");
    expect(item.lastReviewedAt).toBe("");
    expect(Array.isArray(item.sourceSentences)).toBe(true);
  });

  it("upsertItem() with an existing id updates in place and keeps the quiz counters", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "元", reading: "もと", meaning: "origin" });
    const item = byTitle(created.items, "元");
    await store.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "origin",
      studyDate
    });

    const updated = await store.upsertItem({
      id: item.id,
      kind: "word",
      title: "元気",
      reading: "げんき",
      meaning: "energy"
    });
    const same = updated.items.filter(candidate => candidate.id === item.id);

    expect(same).toHaveLength(1);
    expect(same[0].title).toBe("元気");
    expect(same[0].meaning).toBe("energy");
    expect(same[0].quizCorrectCount).toBe(1);
    expect(same[0].lastQuizzedAt).toBeTruthy();
    expect(updated.items.filter(candidate => candidate.kind === "word")).toHaveLength(1);
  });

  it("upsertItem() PATCHes an existing row: omitted keys survive, present keys win even when empty", async () => {
    // A partial payload must not blank omitted fields (review, due date, ...).
    const store = await freshStore();
    const created = await store.upsertItem({
      kind: "word",
      title: "부분수정",
      reading: "もと",
      meaning: "origin",
      level: "N3",
      part: "명사",
      script: "한자+히라가나",
      source: "교재",
      note: "메모",
      review: "일주일"
    });
    const item = byTitle(created.items, "부분수정");
    expect(item.reviewDueDate > todayKey()).toBe(true);

    const patched = await store.upsertItem({ id: item.id, kind: "word", title: "부분수정2" });
    const after = patched.items.find(candidate => candidate.id === item.id);

    expect(after.title).toBe("부분수정2");
    expect(after.reading).toBe("もと");
    expect(after.meaning).toBe("origin");
    expect(after.level).toBe("N3");
    expect(after.part).toBe("명사");
    expect(after.script).toBe("한자+히라가나");
    expect(after.source).toBe("교재");
    expect(after.note).toBe("메모");
    // An unrelated partial update must not touch the review schedule.
    expect(after.review).toBe("일주일");
    expect(after.reviewDueDate).toBe(item.reviewDueDate);

    // Present-but-empty still clears: the edit dialog wipes a note by sending "".
    const cleared = await store.upsertItem({ id: item.id, note: "", meaning: "" });
    const blanked = cleared.items.find(candidate => candidate.id === item.id);

    expect(blanked.note).toBe("");
    expect(blanked.meaning).toBe("");
    expect(blanked.title).toBe("부분수정2");
    expect(blanked.reading).toBe("もと");
    expect(blanked.review).toBe("일주일");
    expect(blanked.reviewDueDate).toBe(item.reviewDueDate);
  });

  it("normalizes review values on write: empty stays empty, unknown becomes 대기", async () => {
    const store = await freshStore();

    const garbage = await store.upsertItem({ kind: "word", title: "이상한복습", meaning: "x", review: "존재하지않는상태" });
    expect(byTitle(garbage.items, "이상한복습").review).toBe("대기");

    const source = await store.upsertItem({ kind: "source", title: "출처자료", meaning: "" });
    const sourceItem = byTitle(source.items, "출처자료");
    expect(sourceItem.review).toBe("");
    expect(sourceItem.reviewDueDate).toBe("");

    const cleared = await store.updateItemReview(byTitle(garbage.items, "이상한복습").id, "", studyDate);
    expect(byTitle(cleared.items, "이상한복습").review).toBe("");
    const reset = await store.updateItemReview(byTitle(garbage.items, "이상한복습").id, "완전히다른값", studyDate);
    expect(byTitle(reset.items, "이상한복습").review).toBe("대기");
    expect(byTitle(reset.items, "이상한복습").reviewDueDate).toBe("");
  });

  it("deleteItem() soft-deletes: gone from getState, retained with deletedAt in exportData", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "지울것", meaning: "delete me" });
    const item = byTitle(created.items, "지울것");

    const afterDelete = await store.deleteItem(item.id, studyDate);
    expect(afterDelete.items.some(candidate => candidate.id === item.id)).toBe(false);

    const exported = await store.exportData();
    const tombstone = exported.data.items.find(candidate => candidate.id === item.id);
    expect(tombstone).toBeTruthy();
    expect(tombstone.deletedAt).toBeTruthy();
  });

  it("deleteItem() is idempotent and tolerates unknown ids", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "두번지움", meaning: "twice" });
    const item = byTitle(created.items, "두번지움");

    await store.deleteItem(item.id, studyDate);
    const first = (await store.exportData()).data.items.find(candidate => candidate.id === item.id);
    await store.deleteItem(item.id, studyDate);
    const second = (await store.exportData()).data.items.find(candidate => candidate.id === item.id);

    expect(first.deletedAt).toBeTruthy();
    expect(second.deletedAt).toBe(first.deletedAt);
    expect(await caught(() => store.deleteItem("does-not-exist", studyDate))).toBeNull();
  });

  // ------------------------------------------------- review state + due dates

  it("updateItemReview() schedules the due date from today, not from the browsed studyDate", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "과거복습", meaning: "past study date" });
    const item = byTitle(created.items, "과거복습");

    const cycled = await store.updateItemReview(item.id, "한달", pastDate);
    const reviewed = byTitle(cycled.items, "과거복습");
    expect(reviewed.review).toBe("한달");
    expect(reviewed.reviewDueDate > todayKey()).toBe(true);
    expect(reviewed.lastReviewedAt).toBe("");
  });

  it("completeReview() stamps review, due date and lastReviewedAt from today", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "완료복습", meaning: "complete" });
    const item = byTitle(created.items, "완료복습");

    const completed = await store.completeReview([{ id: item.id, review: "일주일" }], pastDate);
    const reviewed = byTitle(completed.items, "완료복습");
    expect(reviewed.review).toBe("일주일");
    expect(reviewed.reviewDueDate > todayKey()).toBe(true);
    expect(reviewed.lastReviewedAt).toBeTruthy();
  });

  it("completeReview() accepts bare ids (defaulting to 3일 후), ignores empty targets and source items", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "기본복습", meaning: "default" });
    const item = byTitle(created.items, "기본복습");
    const sourceState = await store.upsertItem({ kind: "source", title: "출처", meaning: "" });
    const sourceItem = byTitle(sourceState.items, "출처");

    const bare = await store.completeReview([item.id], studyDate);
    expect(byTitle(bare.items, "기본복습").review).toBe("3일 후");

    const noop = await store.completeReview([], studyDate);
    expect(noop.selectedDate).toBe(studyDate);
    expect(byTitle(noop.items, "기본복습").review).toBe("3일 후");

    const sourceAttempt = await store.completeReview([{ id: sourceItem.id, review: "일주일" }], studyDate);
    const untouched = byTitle(sourceAttempt.items, "출처");
    expect(untouched.review).toBe("");
    expect(untouched.lastReviewedAt).toBe("");
  });

  it("promotes items whose due date has passed to 오늘 on the next read", async () => {
    const store = await freshStore();
    const state = await store.upsertItem({
      kind: "word",
      title: "만기복습",
      meaning: "already due",
      review: "내일",
      reviewDueDate: "2020-01-01"
    });
    const promoted = byTitle(state.items, "만기복습");
    expect(promoted.review).toBe("오늘");
    expect(promoted.reviewDueDate).toBe("");
  });

  // ------------------------------------------------------------------- quiz

  it("submitWordQuizAnswer() counts a correct answer without touching the review", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "정답", meaning: "correct answer" });
    const item = byTitle(created.items, "정답");

    const { state, result } = await store.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "correct answer",
      studyDate
    });
    const quizzed = byTitle(state.items, "정답");

    expect(result.correct).toBe(true);
    expect(result.correctAnswer).toBe("correct answer");
    expect(result.correctMeaning).toBe("correct answer");
    expect(result.reviewUpdated).toBe(false);
    expect(result.nextReview).toBe("");
    expect(result.nextReviewDueDate).toBe("");
    expect(quizzed.quizCorrectCount).toBe(1);
    expect(quizzed.quizWrongCount).toBe(0);
    expect(quizzed.lastQuizzedAt).toBeTruthy();
    expect(quizzed.review).toBe("대기");
    expect(quizzed.lastReviewedAt).toBe("");
  });

  it("submitWordQuizAnswer() counts a wrong answer and compares against the title when asked", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "오답", meaning: "wrong answer" });
    const item = byTitle(created.items, "오답");

    const wrong = await store.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "nope",
      studyDate
    });
    expect(wrong.result.correct).toBe(false);
    expect(byTitle(wrong.state.items, "오답").quizWrongCount).toBe(1);
    expect(byTitle(wrong.state.items, "오답").quizCorrectCount).toBe(0);

    const byTitleAnswer = await store.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "title",
      selectedAnswer: "오답",
      studyDate
    });
    expect(byTitleAnswer.result.correctAnswer).toBe("오답");
    expect(byTitleAnswer.result.correct).toBe(true);
  });

  it("submitWordQuizAnswer() updates the review only on a correct answer with updateReviewOnCorrect", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "복습갱신", meaning: "update review" });
    const item = byTitle(created.items, "복습갱신");

    const { state, result } = await store.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "update review",
      updateReviewOnCorrect: true,
      correctReview: "3일 후",
      studyDate: pastDate
    });
    const quizzed = byTitle(state.items, "복습갱신");

    expect(result.reviewUpdated).toBe(true);
    expect(result.nextReview).toBe("3일 후");
    expect(result.nextReviewDueDate > todayKey()).toBe(true);
    expect(quizzed.review).toBe("3일 후");
    expect(quizzed.reviewDueDate).toBe(result.nextReviewDueDate);
    expect(quizzed.lastReviewedAt).toBeTruthy();
  });

  it("submitWordQuizAnswer() reports a missing item for unknown ids and mismatched quizKind", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "종류불일치", meaning: "kind mismatch" });
    const item = byTitle(created.items, "종류불일치");

    const unknown = await store.submitWordQuizAnswer({ itemId: "nope", quizKind: "word", studyDate });
    expect(unknown.result).toEqual({ correct: false, missing: true });
    expect(unknown.state.selectedDate).toBe(studyDate);

    const mismatch = await store.submitWordQuizAnswer({ itemId: item.id, quizKind: "kanji", studyDate });
    expect(mismatch.result).toEqual({ correct: false, missing: true });
    expect(byTitle(mismatch.state.items, "종류불일치").quizWrongCount).toBe(0);
  });

  // --------------------------------------------------- study days and tasks

  it("saveStudyLog() persists the day and totalMinutes sums every day", async () => {
    const store = await freshStore();
    const first = await store.saveStudyLog({ studyDate, minutes: 30, summary: "요약", note: "노트" });
    expect(first.studyLog).toEqual({ minutes: 30, summary: "요약", note: "노트", totalMinutes: 30 });
    expect(first.studyDays.some(day => day.studyDate === studyDate)).toBe(true);

    const second = await store.saveStudyLog({ studyDate: "2026-07-07", minutes: 12, summary: "", note: "" });
    expect(second.studyLog.totalMinutes).toBe(42);
    expect(second.studyDays).toHaveLength(2);

    const overwritten = await store.saveStudyLog({ studyDate, minutes: 45, summary: "수정", note: "" });
    expect(overwritten.studyLog.minutes).toBe(45);
    expect(overwritten.studyLog.totalMinutes).toBe(57);
    expect(overwritten.studyDays).toHaveLength(2);
  });

  it("addTask()/updateTaskDone() round-trip the task and tolerate unknown ids", async () => {
    const store = await freshStore();
    const created = await store.addTask({ title: "복습하기", note: "메모", tag: "일반", done: false, studyDate });
    const task = created.tasks.find(candidate => candidate.title === "복습하기");
    expect(task.studyDate).toBe(studyDate);
    expect(task.note).toBe("메모");
    expect(task.tag).toBe("일반");
    expect(task.done).toBe(false);

    const done = await store.updateTaskDone(task.id, true, studyDate);
    expect(done.tasks.find(candidate => candidate.id === task.id).done).toBe(true);
    const undone = await store.updateTaskDone(task.id, false, studyDate);
    expect(undone.tasks.find(candidate => candidate.id === task.id).done).toBe(false);
    expect(await caught(() => store.updateTaskDone("nope", true, studyDate))).toBeNull();
  });

  // ------------------------------------------------ daily entries + tombstones

  it("addDailyEntry() creates the study day and derives word/grammar/expression children", async () => {
    const { state, sentence, child } = await storeWithSentence();

    expect(sentence.title).toBe("오늘의 문장");
    expect(sentence.reading).toBe("きょうのぶんしょう");
    expect(sentence.meaning).toBe("오늘의 문장입니다");
    expect(sentence.registered).toBe(false);
    expect(child("word").title).toBe("単語");
    expect(child("word").parentId).toBe(sentence.id);
    expect(child("grammar").title).toBe("〜てもいい");
    expect(child("expression").title).toBe("よろしくお願いします");
    expect(state.dailyEntries).toHaveLength(4);

    const day = state.studyDays.find(candidate => candidate.studyDate === studyDate);
    expect(day).toBeTruthy();
    expect(day.entryCount).toBe(4);
  });

  it("addDailyEntry() derives child records through the shared parser", async () => {
    const { child } = await storeWithSentence();

    Object.entries(sharedChildRecords).forEach(([kind, canonical]) => {
      const entry = child(kind);
      expect(entry.title).toBe(canonical.title);
      expect(entry.reading).toBe(canonical.reading);
      expect(entry.meaning).toBe(canonical.meaning);
      expect(entry.registered).toBe(false);
      if (canonical.kanji !== undefined) {
        expect(entry.parsed.kanji).toBe(canonical.kanji);
      }
    });
  });

  it("deleteDailyEntry() cascades a soft delete to children and links, keeping tombstones in exportData", async () => {
    const { store, sentence } = await storeWithSentence();

    const afterDelete = await store.deleteDailyEntry(sentence.id, studyDate);
    expect(afterDelete.dailyEntries).toHaveLength(0);
    expect(afterDelete.studyDays.find(day => day.studyDate === studyDate).entryCount).toBe(0);

    const exported = await store.exportData();
    const tombstoned = exported.data.dailyEntries.filter(
      entry => entry.id === sentence.id || entry.parentId === sentence.id
    );
    expect(tombstoned.length).toBeGreaterThan(0);
    expect(tombstoned.every(entry => Boolean(entry.deletedAt))).toBe(true);

    const tombstonedLinks = exported.data.dailyEntryLinks.filter(link => link.sentenceId === sentence.id);
    expect(tombstonedLinks.length).toBeGreaterThan(0);
    expect(tombstonedLinks.every(link => Boolean(link.deletedAt))).toBe(true);

    expect(await caught(() => store.deleteDailyEntry(sentence.id, studyDate))).toBeNull();
    expect(await caught(() => store.deleteDailyEntry("does-not-exist", studyDate))).toBeNull();
  });

  it("registerDailyEntries() turns a daily entry into an item, marks it registered and reports duplicates", async () => {
    const { store, child } = await storeWithSentence();
    const wordEntry = child("word");

    const first = await store.registerDailyEntries([wordEntry.id], studyDate);
    expect(first.result.registered).toContain("단어: 単語");
    expect(first.result.duplicates).toEqual([]);
    expect(Array.isArray(first.result.linked)).toBe(true);
    expect(Array.isArray(first.result.errors)).toBe(true);
    const registeredItem = byTitle(first.state.items, "単語");
    expect(registeredItem.kind).toBe("word");
    expect(registeredItem.review).toBe("대기");
    expect(registeredItem.reviewDueDate).toBe("");
    expect(first.state.dailyEntries.find(entry => entry.id === wordEntry.id).registered).toBe(true);

    const second = await store.registerDailyEntries([wordEntry.id], studyDate);
    expect(second.result.registered).not.toContain("단어: 単語");
    expect(second.result.duplicates).toContain("단어: 単語");
    expect(second.state.items.filter(item => item.kind === "word" && item.title === "単語")).toHaveLength(1);
  });

  // Registered items record the title of the sentence the entry came from in
  // `source` (resolved from parentId, else the first daily_entry_links row) and
  // invent no `level`: 레벨/난이도 is free text the user fills in.
  it("registerDailyEntries() records the parent sentence title as source and no level", async () => {
    const { store, child } = await storeWithSentence();
    const registered = await store.registerDailyEntries(
      [child("word").id, child("grammar").id, child("expression").id],
      studyDate
    );

    ["単語", "〜てもいい", "よろしくお願いします"].forEach(title => {
      const item = byTitle(registered.state.items, title);
      expect(item.source).toBe("오늘의 문장");
      expect(item.level).toBe("");
    });
  });

  // The one entry shape with no sentence to name: the 단어/문법/표현 manual input
  // (apps/web/src/main.js addManualEntryFromInput) writes an entry with no
  // parentId and no link row. Registering falls back to the generic "오늘 공부".
  it("registerDailyEntries() falls back to 오늘 공부 for a parentless entry", async () => {
    const store = await freshStore();
    const added = await store.addDailyEntry({ studyDate, kind: "word", rawText: "`独立`(どくりつ)" });
    const entry = added.dailyEntries.find(candidate => candidate.title === "独立");

    const registered = await store.registerDailyEntries([entry.id], studyDate);
    const item = byTitle(registered.state.items, "独立");

    expect(item.source).toBe("오늘 공부");
    expect(item.level).toBe("");
  });

  // Registering runs the shared withKanjiItems helper from
  // @nihongo-study/storage-core, so the 한자 collection fills from daily entries.
  it("registerDailyEntries() derives one 한자 item per character of the word's 한자 field", async () => {
    const { store, child } = await storeWithSentence();
    const wordEntry = child("word");
    expect(wordEntry.parsed.kanji).toBe("単(single),語(word)");

    const first = await store.registerDailyEntries([wordEntry.id], studyDate);
    const kanjiItems = first.state.items.filter(item => item.kind === "kanji");
    expect(kanjiItems.map(item => item.title).sort()).toEqual(["単", "語"]);
    expect(first.result.registered).toEqual(expect.arrayContaining(["한자: 単", "한자: 語"]));

    // Every field withKanjiItems fills is filled as follows, `level`
    // included: it is inherited from the parent word item,
    // which no longer has a fabricated one. `source` stays the word's own title
    // rather than the sentence's.
    const single = byTitle(kanjiItems, "単");
    expect(single.meaning).toBe("single");
    expect(single.part).toBe("한자");
    expect(single.script).toBe("한자");
    expect(single.source).toBe("単語");
    expect(single.note).toBe("単語 (たんご)");
    expect(single.review).toBe("대기");
    expect(single.reviewDueDate).toBe("");
    expect(single.level).toBe("");

    // Re-registering the same entry creates nothing: the derived items go
    // through the same duplicate check as the word itself.
    const second = await store.registerDailyEntries([wordEntry.id], studyDate);
    expect(second.result.registered).toEqual([]);
    expect(second.result.duplicates).toEqual(expect.arrayContaining(["한자: 単", "한자: 語"]));
    expect(second.state.items.filter(item => item.kind === "kanji")).toHaveLength(2);
  });

  it("registerDailyEntries() derives a shared 한자 item once for a batch of words that both use it", async () => {
    const { store, sentence } = await storeWithSentence();
    const withSecondWord = await store.addDailyEntry({
      studyDate,
      kind: "word",
      rawText: "`単位`(たんい)|품사=명사|한자=単(single),位(rank)",
      parentId: sentence.id
    });
    const ids = withSecondWord.dailyEntries
      .filter(entry => entry.kind === "word")
      .map(entry => entry.id);
    expect(ids).toHaveLength(2);

    const registered = await store.registerDailyEntries(ids, studyDate);
    const kanjiTitles = registered.state.items.filter(item => item.kind === "kanji").map(item => item.title).sort();

    expect(kanjiTitles).toEqual(["位", "単", "語"]);
    expect(registered.result.registered.filter(entry => entry === "한자: 単")).toHaveLength(1);
    expect(registered.result.duplicates).toContain("한자: 単");
  });

  // A sentence id registers a 문장 item, the one dailyEntryToItems' sentence
  // branch in @nihongo-study/storage-core defines.
  it("registerDailyEntries() registers a sentence entry as a 문장 item", async () => {
    const { store, sentence } = await storeWithSentence();

    const first = await store.registerDailyEntries([sentence.id], studyDate);
    expect(first.result.registered).toEqual(["문장: 오늘의 문장"]);
    expect(first.result.duplicates).toEqual([]);
    expect(first.result.errors).toEqual([]);

    const item = byTitle(first.state.items, "오늘의 문장");
    expect(item.kind).toBe("sentence");
    expect(item.reading).toBe("きょうのぶんしょう");
    expect(item.meaning).toBe("오늘의 문장입니다");
    expect(item.part).toBe("문장");
    expect(item.script).toBe("혼합");
    // The whole card text: `note` is the raw block the shared parser parsed.
    expect(item.note).toBe(sentenceRawText);
    // No parent sentence to name, and no invented level: a sentence is its
    // own source, so `source` stays empty instead of taking the "오늘 공부"
    // fallback a parentless 단어/문법/표현 entry gets.
    expect(item.source).toBe("");
    expect(item.level).toBe("");
    expect(item.review).toBe("대기");
    expect(item.reviewDueDate).toBe("");
    // A sentence derives no 한자 items - withKanjiItems only fires on a `word` -
    // so the whole registration is exactly one item.
    expect(first.state.items).toHaveLength(1);
    expect(first.state.dailyEntries.find(entry => entry.id === sentence.id).registered).toBe(true);

    // Same kind::title duplicate check as every other kind.
    const second = await store.registerDailyEntries([sentence.id], studyDate);
    expect(second.result.registered).toEqual([]);
    expect(second.result.duplicates).toEqual(["문장: 오늘의 문장"]);
    expect(second.state.items.filter(candidate => candidate.kind === "sentence")).toHaveLength(1);
  });

  // An id matching no live entry is reported in `errors` with the one shared
  // message, not as a duplicate.
  it("registerDailyEntries() reports an unknown entry id in result.errors", async () => {
    const store = await freshStore();
    const registered = await store.registerDailyEntries(["does-not-exist"], studyDate);

    expect(registered.result.registered).toEqual([]);
    expect(registered.result.duplicates).toEqual([]);
    expect(registered.result.errors).toEqual([missingDailyEntryMessage]);
  });

  // Registration opens one transaction per entry and catches around it, so a
  // failing entry is reported in `errors` without dropping the rest of the
  // batch. The tradeoff: a batch is atomic PER ENTRY, not as a whole, so a
  // failure mid-batch leaves the entries before it committed.
  it("registerDailyEntries() surfaces a failing entry in result.errors without dropping the rest of the batch", async () => {
    const { store, child } = await storeWithSentence();
    // An unbindable record where an id belongs (a garbled IPC/postMessage
    // argument): no entry matches it.
    const invalid = await store.registerDailyEntries([{ notAnId: true }], studyDate);
    expect(invalid.result.registered).toEqual([]);
    expect(invalid.result.duplicates).toEqual([]);
    expect(invalid.result.errors.length).toBeGreaterThan(0);
    expect(invalid.state.items).toHaveLength(0);

    // The failure costs only its own entry: the ids around it still register.
    const mixed = await store.registerDailyEntries(
      [child("word").id, { notAnId: true }, child("grammar").id],
      studyDate
    );
    expect(mixed.result.errors).toHaveLength(1);
    expect(mixed.result.registered).toEqual(expect.arrayContaining(["단어: 単語", "문법: 〜てもいい"]));
    expect(byTitle(mixed.state.items, "単語")).toBeTruthy();
    expect(byTitle(mixed.state.items, "〜てもいい")).toBeTruthy();
  });

  // ------------------------------------------------------- reset / clear / export

  it("clearAllData() empties every collection, tombstones included", async () => {
    const { store, sentence } = await storeWithSentence();
    await store.upsertItem({ kind: "word", title: "지워질항목", meaning: "gone" });
    await store.addTask({ title: "지워질할일", note: "", tag: "", done: false, studyDate });
    await store.saveStudyLog({ studyDate, minutes: 10, summary: "", note: "" });
    await store.deleteDailyEntry(sentence.id, studyDate);

    const cleared = await store.clearAllData();
    expect(cleared.items).toHaveLength(0);
    expect(cleared.dailyEntries).toHaveLength(0);
    expect(cleared.tasks).toHaveLength(0);
    expect(cleared.studyDays).toHaveLength(0);

    const exported = await store.exportData();
    expect(exported.data.items).toHaveLength(0);
    expect(exported.data.dailyEntries).toHaveLength(0);
    expect(exported.data.dailyEntryLinks).toHaveLength(0);
    expect(exported.data.tasks).toHaveLength(0);
    expect(exported.data.studyDays).toHaveLength(0);
  });

  it("exportData() returns the shared envelope with a whole-store, tombstone-preserving payload", async () => {
    const { store, sentence } = await storeWithSentence();
    await store.addDailyEntry({ studyDate: "2026-07-07", kind: "word", rawText: "`他日`" });
    await store.deleteDailyEntry(sentence.id, studyDate);

    const exported = await store.exportData();
    expect(exported.appDataDir).toBeTruthy();
    expect(exported.exportsDir).toBeTruthy();
    expect(exported.backupsDir).toBeTruthy();
    ["selectedDate", "studyDays", "dailyEntries", "dailyEntryLinks", "tasks", "items"].forEach(key => {
      expect(exported.data).toHaveProperty(key);
    });
    // Not just the selected day: the payload is a full-store dump.
    expect(exported.data.dailyEntries.some(entry => entry.studyDate === "2026-07-07")).toBe(true);
    expect(exported.data.dailyEntries.some(entry => entry.id === sentence.id && entry.deletedAt)).toBe(true);
  });

  // resetSampleData() restores the one shared seed from @nihongo-study/storage-core,
  // which is what this asserts against.
  it("resetSampleData() clears the store and restores the shared sample data", async () => {
    const { store } = await storeWithSentence();
    await store.upsertItem({ kind: "word", title: "리셋", meaning: "reset" });
    await store.addTask({ title: "지워질할일", note: "", tag: "", done: false, studyDate });
    await store.saveStudyLog({ studyDate, minutes: 10, summary: "", note: "" });

    const reset = await store.resetSampleData();
    const sample = createSampleState();

    expect(reset.selectedDate).toBe(sample.selectedDate);
    expect(reset.items).toEqual([]);
    expect(reset.tasks).toEqual([]);
    // Not empty, and not the old contents either: the onboarding sentence card.
    expect(reset.dailyEntries).toHaveLength(sample.dailyEntries.length);
    sample.dailyEntries.forEach((seeded, index) => {
      const entry = reset.dailyEntries[index];
      expect(entry.id).toBe(seeded.id);
      expect(entry.kind).toBe(seeded.kind);
      expect(entry.title).toBe(seeded.title);
      expect(entry.reading).toBe(seeded.reading);
      expect(entry.meaning).toBe(seeded.meaning);
      expect(entry.studyDate).toBe(seeded.studyDate);
      expect(entry.registered).toBe(false);
    });

    expect(reset.studyDays).toHaveLength(1);
    const day = reset.studyDays.find(candidate => candidate.studyDate === sample.selectedDate);
    expect(day.minutes).toBe(0);
    expect(day.entryCount).toBe(sample.dailyEntries.length);
    expect(reset.studyLog).toEqual({ minutes: 0, summary: "", note: "", totalMinutes: 0 });
  });

  it("honors an injected seedState on first run and on resetSampleData", async () => {
    const store = await freshStore({ seedState: sampleSeed });
    const seeded = await store.getState(studyDate);
    expect(byTitle(seeded.items, "샘플단어")).toBeTruthy();

    await store.clearAllData();
    const reset = await store.resetSampleData();

    // The injected seed replaces the shared default outright, and the returned
    // state is scoped to the seed's own selectedDate.
    expect(byTitle(reset.items, "샘플단어")).toBeTruthy();
    expect(reset.selectedDate).toBe(studyDate);
    expect(reset.dailyEntries).toHaveLength(0);
  });

  it("accepts the legacy allDailyEntries alias when seeding", async () => {
    const legacyEntry = {
      id: "legacy-entry",
      studyDate,
      kind: "sentence",
      title: "레거시 문장",
      rawText: "# 레거시 문장"
    };
    const store = await freshStore({
      seedState: () => ({
        selectedDate: studyDate,
        studyDays: [],
        allDailyEntries: [legacyEntry],
        dailyEntryLinks: [],
        tasks: [],
        items: []
      })
    });
    const state = await store.getState(studyDate);

    expect(state.dailyEntries).toEqual([
      expect.objectContaining({ id: legacyEntry.id, title: legacyEntry.title })
    ]);
    expect(state.allDailyEntries).toEqual([
      expect.objectContaining({ id: legacyEntry.id, title: legacyEntry.title })
    ]);
  });

  it("importCsvExports() accepts a studyDate string", async () => {
    const store = await freshStore();
    const state = await store.importCsvExports(studyDate);
    expect(state.selectedDate).toBe(studyDate);
  });

  // ------------------------------------------------------- adapter shape

  it("getState().allDailyEntries spans dates while dailyEntries stays selected-date-only", async () => {
    const store = await freshStore();
    await store.addDailyEntry({ studyDate, kind: "sentence", rawText: sentenceRawText });
    const otherDate = "2026-07-07";
    await store.addDailyEntry({
      studyDate: otherDate,
      kind: "sentence",
      rawText: sentenceRawText.replace("# 오늘의 문장", "# 다른 날 문장")
    });

    const state = await store.getState(studyDate);
    expect(state.dailyEntries.length).toBeGreaterThan(0);
    expect(state.dailyEntries.every(entry => entry.studyDate === studyDate)).toBe(true);
    expect(state.allDailyEntries.some(entry => entry.studyDate === otherDate)).toBe(true);

    const linkedWord = state.allDailyEntries.find(entry =>
      entry.studyDate === otherDate && entry.kind === "word" && entry.title === "単語"
    );
    expect(linkedWord.sourceSentences).toEqual([
      expect.objectContaining({ studyDate: otherDate, title: "다른 날 문장" })
    ]);
  });

  it("exportData() uses dailyEntries as the sole full-history exchange field", async () => {
    const store = await freshStore();
    await store.addDailyEntry({ studyDate, kind: "sentence", rawText: sentenceRawText });
    await store.addDailyEntry({ studyDate: emptyDate, kind: "word", rawText: "`다른날`" });
    const exported = await store.exportData();

    expect(exported.data.dailyEntries.some(entry => entry.studyDate === studyDate)).toBe(true);
    expect(exported.data.dailyEntries.some(entry => entry.studyDate === emptyDate)).toBe(true);
    expect(exported.data).not.toHaveProperty("allDailyEntries");
  });

  it("exportData() envelope carries the storage paths and the data", async () => {
    const { store } = await storeWithSentence();
    const exported = await store.exportData();

    expect(exported).toHaveProperty("dbPath");
    expect(exported).toHaveProperty("data");
    expect(exported).not.toHaveProperty("sqlite");
    expect(exported).not.toHaveProperty("files");
  });

  it("getState() returns whole records (audit columns, no parsedJson, full studyDays rows)", async () => {
    const { store } = await storeWithSentence();
    await store.addTask({ title: "형태확인", note: "", tag: "", done: false, studyDate });
    await store.upsertItem({ kind: "word", title: "형태항목", meaning: "shape" });
    const state = await store.getState(studyDate);
    const auditKeys = ["createdAt", "updatedAt", "deletedAt"];
    const hasAuditColumns = record => auditKeys.every(key => key in record);

    expect(hasAuditColumns(state.dailyEntries[0])).toBe(true);
    expect(hasAuditColumns(state.items[0])).toBe(true);
    expect(hasAuditColumns(state.tasks[0])).toBe(true);
    expect("parsedJson" in state.dailyEntries[0]).toBe(false);
    expect(Object.keys(state.studyDays[0]).sort()).toEqual(
      ["studyDate", "minutes", "summary", "note", "createdAt", "updatedAt", "deletedAt", "entryCount"].sort()
    );
  });

  it("upsertItem() does not derive 한자 items from item.kanji", async () => {
    const store = await freshStore();
    const state = await store.upsertItem({ kind: "word", title: "漢字語", meaning: "kanji word", kanji: "漢(china)" });

    expect(byTitle(state.items, "漢字語")).toBeTruthy();
    expect(state.items.filter(item => item.kind === "kanji")).toHaveLength(0);
  });

  it("registerDailyEntries() does not report a re-linked duplicate in result.linked", async () => {
    const { store, sentence } = await storeWithSentence();
    // A word entry added directly under a sentence: registering it as a
    // duplicate does not populate `linked`.
    const withChild = await store.addDailyEntry({ studyDate, kind: "word", rawText: "`リンク`", parentId: sentence.id });
    const wordEntry = withChild.dailyEntries.find(entry => entry.kind === "word" && entry.title === "リンク");
    await store.upsertItem({ kind: "word", title: "リンク", meaning: "link" });

    const registered = await store.registerDailyEntries([wordEntry.id], studyDate);
    expect(registered.result.duplicates).toContain("단어: リンク");
    expect(registered.result.linked).toEqual([]);
  });

  it("importFullBackup() takes the backup object", async () => {
    const store = await freshStore();
    const error = await caught(() => store.importFullBackup(backupPayload));

    expect(error).toBeNull();
    const state = await store.getState(studyDate);
    expect(byTitle(state.items, "백업단어")).toBeTruthy();
  });

  it("importCsvExports() imports an object payload", async () => {
    const store = await freshStore();
    const state = await store.importCsvExports(csvPayload, studyDate);

    expect(byTitle(state.items, "CSV단어")).toBeTruthy();
    expect(state.selectedDate).toBe(studyDate);
  });

  it("submitWordQuizAnswer() blanks review scheduling fields when the review was not updated", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({ kind: "word", title: "누출", meaning: "leak" });
    const item = byTitle(created.items, "누출");

    const { state, result } = await store.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "WRONG",
      updateReviewOnCorrect: true,
      correctReview: "일주일",
      studyDate
    });

    expect(result.correct).toBe(false);
    expect(result.reviewUpdated).toBe(false);
    expect(result.nextReviewDueDate).toBe("");
    expect(byTitle(state.items, "누출").review).toBe("대기");
    expect(result.nextReview).toBe("");
  });

  it("a repeated sentence candidate is merged and linked", async () => {
    const store = await freshStore();
    await store.addDailyEntry({ studyDate, kind: "sentence", rawText: sentenceRawText });
    const state = await store.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: sentenceRawText.replace("# 오늘의 문장", "# 둘째 문장")
    });
    const wordEntries = state.dailyEntries.filter(entry => entry.kind === "word" && entry.title === "単語");

    expect(wordEntries).toHaveLength(1);
    expect(state.dailyEntries).toHaveLength(5);
    expect(wordEntries[0].sourceSentences).toHaveLength(2);
  });

  // --------------------------------------------------- applyRemoteSnapshot

  const mergeRemote = (local, remote) => mergeBackupData(local, remote);
  const futureStamp = "2999-01-01T00:00:00.000Z";
  const pastStamp = "2000-01-01T00:00:00.000Z";
  const idsOf = rows => rows.map(row => row.id ?? row.studyDate).sort();

  function remoteItem(fields) {
    return { kind: "word", reading: "", level: "", part: "", script: "", source: "", note: "", ...fields };
  }

  it("applyRemoteSnapshot() lets the newer updatedAt win and keeps local when the remote is older", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "lww-newer", kind: "word", title: "あたらしい", meaning: "local-a" });
    await store.upsertItem({ id: "lww-older", kind: "word", title: "ふるい", meaning: "local-b" });

    const { state } = await store.applyRemoteSnapshot({
      items: [
        remoteItem({ id: "lww-newer", title: "あたらしい", meaning: "remote-a", updatedAt: futureStamp }),
        remoteItem({ id: "lww-older", title: "ふるい", meaning: "remote-b", updatedAt: pastStamp })
      ]
    }, mergeRemote);

    expect(state.items.find(item => item.id === "lww-newer").meaning).toBe("remote-a");
    expect(state.items.find(item => item.id === "lww-older").meaning).toBe("local-b");
    const persisted = await store.getState();
    expect(persisted.items.find(item => item.id === "lww-newer").meaning).toBe("remote-a");
  });

  it("applyRemoteSnapshot() applies a newer remote tombstone and keeps it in exportData()", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "tomb-1", kind: "word", title: "きえる", meaning: "local" });

    const { state } = await store.applyRemoteSnapshot({
      items: [remoteItem({ id: "tomb-1", title: "きえる", meaning: "local", updatedAt: futureStamp, deletedAt: futureStamp })]
    }, mergeRemote);

    expect(state.items.find(item => item.id === "tomb-1")).toBeUndefined();
    const exported = (await store.exportData()).data;
    expect(exported.items.find(item => item.id === "tomb-1").deletedAt).toBeTruthy();
  });

  it("applyRemoteSnapshot() remaps remote daily entries and links onto local ids by content key", async () => {
    const { store } = await storeWithSentence();
    const local = (await store.exportData()).data;
    expect(local.dailyEntries.length).toBeGreaterThan(1);
    expect(local.dailyEntryLinks.length).toBeGreaterThan(0);

    const prefix = id => (id ? `remote-${id}` : id);
    const remote = {
      dailyEntries: local.dailyEntries.map(entry => ({
        ...entry,
        id: prefix(entry.id),
        parentId: prefix(entry.parentId),
        sourceSentences: (entry.sourceSentences || []).map(sentence => ({ ...sentence, id: prefix(sentence.id) }))
      })),
      dailyEntryLinks: local.dailyEntryLinks.map(link => ({
        ...link,
        id: prefix(link.id),
        entryId: prefix(link.entryId),
        sentenceId: prefix(link.sentenceId)
      }))
    };

    const { data } = await store.applyRemoteSnapshot(remote, mergeRemote);

    expect(idsOf(data.dailyEntries)).toEqual(idsOf(local.dailyEntries));
    expect(data.dailyEntries.some(entry => String(entry.id).startsWith("remote-"))).toBe(false);
    const after = (await store.exportData()).data;
    expect(idsOf(after.dailyEntries)).toEqual(idsOf(local.dailyEntries));
    expect(after.dailyEntryLinks).toHaveLength(local.dailyEntryLinks.length);
    const entryIds = new Set(after.dailyEntries.map(entry => entry.id));
    after.dailyEntryLinks.forEach(link => {
      expect(entryIds.has(link.entryId)).toBe(true);
      expect(entryIds.has(link.sentenceId)).toBe(true);
    });
  });

  it("applyRemoteSnapshot() returns { state, data } and data matches the subsequent exportData()", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "apply-local", kind: "word", title: "ろーかる", meaning: "local" });
    await store.addTask({ title: "할 일" });

    const result = await store.applyRemoteSnapshot({
      items: [remoteItem({ id: "apply-remote", title: "りもーと", meaning: "remote", updatedAt: futureStamp })]
    }, mergeRemote);

    expect(Object.keys(result).sort()).toEqual(["data", "state"]);
    expect(result.state.selectedDate).toBe(todayKey());
    expect(result.state.items.map(item => item.id)).toEqual(expect.arrayContaining(["apply-local", "apply-remote"]));

    const exported = (await store.exportData()).data;
    // studyDays is excluded: the adapter's normalizeStudyDays() adds a row for the
    // selected date while persisting, which the pre-write merge result lacks.
    for (const name of ["dailyEntries", "dailyEntryLinks", "tasks", "items"]) {
      expect(idsOf(result.data[name] || [])).toEqual(idsOf(exported[name]));
    }
    expect(result.data.selectedDate).toBe(todayKey());
    // Persisting normalizes defaults (review, counters), so compare the identifying fields.
    const byId = rows => Object.fromEntries(rows.map(row => [row.id, [row.title, row.meaning, row.updatedAt]]));
    expect(byId(result.data.items)).toEqual(byId(exported.items));
    expect(byId(result.data.tasks)).toEqual(byId(exported.tasks));
  });

  it("applyRemoteSnapshot() with a null remote returns the current data unchanged and never calls merge", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "keep-1", kind: "word", title: "のこる", meaning: "stay" });
    const merge = vi.fn();

    const result = await store.applyRemoteSnapshot(null, merge);

    expect(merge).not.toHaveBeenCalled();
    expect(result.state.items.map(item => item.id)).toEqual(["keep-1"]);
    expect(idsOf(result.data.items)).toEqual(["keep-1"]);
    expect(idsOf((await store.exportData()).data.items)).toEqual(["keep-1"]);
  });

  it("applyRemoteSnapshot() rejects a merge that returns a Promise and writes nothing", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "safe-1", kind: "word", title: "あんぜん", meaning: "safe" });

    const error = await caught(() => store.applyRemoteSnapshot(
      { items: [remoteItem({ id: "never-1", title: "こない", meaning: "x", updatedAt: futureStamp })] },
      async (local, remote) => mergeBackupData(local, remote)
    ));

    expect(error).toBeInstanceOf(TypeError);
    const state = await store.getState();
    expect(state.items.map(item => item.id)).toEqual(["safe-1"]);
  });

  it("applyRemoteSnapshot() rejects a merge that throws or returns no data, leaving local rows untouched", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "safe-2", kind: "word", title: "あんぜん", meaning: "safe" });
    const boom = new Error("merge exploded");

    expect(await caught(() => store.applyRemoteSnapshot({ items: [] }, () => { throw boom; }))).toBe(boom);
    expect(await caught(() => store.applyRemoteSnapshot({ items: [] }, () => ({})))).toBeInstanceOf(TypeError);
    expect((await store.getState()).items.map(item => item.id)).toEqual(["safe-2"]);
  });

  it("applyRemoteSnapshot() keeps a write that races it (idb serializes the readwrite transactions)", async () => {
    const store = await freshStore();
    await store.upsertItem({ id: "race-base", kind: "word", title: "もと", meaning: "base" });

    await Promise.all([
      store.applyRemoteSnapshot({
        items: [remoteItem({ id: "race-remote", title: "りもーと", meaning: "remote", updatedAt: futureStamp })]
      }, mergeRemote),
      store.upsertItem({ id: "race-new", kind: "word", title: "あたらしい", meaning: "new" })
    ]);

    const ids = (await store.getState()).items.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining(["race-base", "race-remote", "race-new"]));
  });

  it("record- and array-taking methods tolerate omitted arguments", async () => {
    const store = await freshStore();
    const calls = [
      () => store.saveStudyLog(),
      () => store.addDailyEntry(),
      () => store.registerDailyEntries(),
      () => store.addTask(),
      () => store.upsertItem(),
      () => store.completeReview()
    ];

    for (const call of calls) {
      expect(await caught(call)).toBeNull();
    }
    expect((await store.getState()).selectedDate).toBe(todayKey());
  });
});
