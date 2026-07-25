// Behavioral conformance suite for the storage adapter contract.
//
// One factory-driven suite, executed once per adapter (storage-idb against
// fake-indexeddb, storage-sqlite against a temp better-sqlite3 file), so
// parity drift between desktop and web fails CI instead of shipping.
// `assertStorageAdapter`'s typeof-only check cannot see any of this.
//
// THE ACTUAL CONTRACT (verified by reading both adapters, not inferred from
// method names). sqlite is synchronous, idb returns promises; every call here
// is awaited so the same assertions run on both.
//
//   method                  storage-sqlite                              storage-idb
//   initDatabase            () -> Database                              () -> Promise<IDBDatabase>
//   getState                (studyDate = today) -> state                (studyDate = today) -> state
//   saveStudyLog            (studyLog) -> state   [throws if omitted]   (studyLog = {}) -> state
//   addDailyEntry           (entry) -> state      [throws if omitted]   (entry = {}) -> state
//   deleteDailyEntry        (id, studyDate) -> state                    (id, studyDate = today) -> state
//   registerDailyEntries    (ids, studyDate) -> { state, result }       (ids = [], studyDate = today) -> { state, result }
//   addTask                 (task) -> state       [throws if omitted]   (task = {}) -> state
//   updateTaskDone          (id, done, studyDate) -> state              (id, done, studyDate = today) -> state
//   upsertItem              (item) -> state   [FULL REPLACE, see D6]    (item = {}) -> state   [MERGE, see D6]
//   deleteItem              (id, studyDate) -> state                    (id, studyDate = today) -> state
//   updateItemReview        (id, review, studyDate) -> state            (id, review, studyDate = today) -> state
//   completeReview          (targets, studyDate) -> state               (targets = [], studyDate = today) -> state
//   submitWordQuizAnswer    (payload = {}) -> { state, result }         (payload = {}) -> { state, result }
//   resetSampleData         () -> state   [alias of clearAllData]       () -> state   [clears, then re-seeds, see D19]
//   clearAllData            () -> state   [hard DELETE, no tombstones]  () -> state   [store.clear(), no tombstones]
//   exportData              () -> envelope + writes CSV/YAML to disk    () -> envelope, nothing written to disk
//   importCsvExports        (studyDate) -> state  [reads exports/*.csv] (backup = null, studyDate = today) -> state
//   importFullBackup        () -> state  [reads full-backup.yaml]       (backup = null) -> state
//
// Divergences are NOT papered over: each is asserted per-adapter through the
// `expected` table on the adapter descriptors below, tagged
// `KNOWN DIVERGENCE D<n>` with the offending file:line and what the unified
// behavior should be. The table is the debt ledger; D1..D19 are all live today.
//
//   D1  getState().allDailyEntries          idb only (apps/web/src/main.js:549 needs it)
//   D2  exportData().data.allDailyEntries   sqlite only (inverse of D1)
//   D3  exportData() envelope keys          sqlite/files vs dbPath
//   D4  getState() record projection        audit columns + parsedJson
//   D5  getState().studyDays row shape      sqlite drops `note`
//   D6  partial upsertItem()                merge (idb) vs destructive replace (sqlite)
//   D7  upsertItem() 한자 derivation        sqlite only
//   D8  registered item provenance          level/source hard-coded on idb
//   D9  registering a sentence entry        no-op on idb, 문장 item on sqlite
//   D10 register 한자 derivation            sqlite only
//   D11 unknown entry id                    reported as a duplicate on sqlite only
//   D12 result.linked                       hard-coded [] on idb
//   D13 result.errors                       unreachable catch on idb
//   D14 importFullBackup(backup)            object form ignored on sqlite
//   D15 importCsvExports(backup, date)      object form ignored on sqlite
//   D16 quiz result.nextReview              leaks a value on sqlite
//   D17 repeated sentence candidates        merged on sqlite, duplicated on idb
//   D18 seedState / resetSampleData         sample data only exists on idb
//   D19 missing arguments                   defaulted on idb, TypeError on sqlite
//
// The rawText parsers used to be a 20th entry here (two separate
// reimplementations that disagreed on every derived `meaning`); they were
// unified into @nihongo-study/storage-core while this suite was being written,
// so the shared `sharedChildRecords` assertion below guards that instead.
import "fake-indexeddb/auto";
import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "node:module";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import { loadSqliteAdapter, describeStorageSuite, createTmpDirs } from "./helpers/storage-adapters.js";

const require = createRequire(import.meta.url);
const {
  storageContract,
  storageMethodNames,
  storagePathKeys,
  storageStateShape,
  assertStorageAdapter
} = require("../packages/storage/src/index.js");

const sqlite = loadSqliteAdapter();
const tmpDirs = createTmpDirs("storage-conformance");
afterAll(() => tmpDirs.cleanup());

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

// Parses identically on both adapters: sentence title "오늘의 문장" plus three
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

// Derived child records for `sentenceRawText`, asserted against BOTH adapters
// from this single constant - that is the parity guard. Both now route through
// parseDailyEntry in @nihongo-study/storage-core; the two adapters used to ship
// separate reimplementations that disagreed on every one of these `meaning`
// values (this was tracked here as a KNOWN DIVERGENCE until the shared parser
// landed). The values themselves are still poor - the shared parser leaks the
// raw "|메모=..." metadata into a grammar meaning and derives nothing for an
// expression - but that is now one parser bug rather than a parity bug, so a
// fix moves both platforms at once and this constant is the only place to
// update.
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

const adapters = [
  {
    name: "storage-idb",
    loadError: null,
    async create(options = {}) {
      const store = createIdbStorage({ dbName: unique("conformance-idb"), ...options });
      await store.initDatabase();
      return store;
    },
    expected: {
      // KNOWN DIVERGENCE D1: getState() exposes `allDailyEntries` only on idb
      // (packages/storage-idb/src/index.js:110). apps/web/src/main.js:549 reads
      // it (`state.allDailyEntries || state.dailyEntries`, also :585), so the
      // home-page random sentence silently degrades to "selected day only" on
      // desktop. UNIFY: packages/storage-sqlite/src/index.js:249 must return
      // allDailyEntries too, and it should move to storageStateShape.required.
      stateHasAllDailyEntries: true,
      // KNOWN DIVERGENCE D2: exportData().data carries `allDailyEntries` only
      // on sqlite (packages/storage-sqlite/src/dataImportExport.js:140) - the
      // exact inverse of D1 - so a backup written on web lacks a key sqlite's
      // own export emits. UNIFY: emit it on both, or on neither.
      exportDataHasAllDailyEntries: false,
      // KNOWN DIVERGENCE D3: exportData() envelope keys differ. idb returns
      // {...paths, data} incl. `dbPath` (packages/storage-idb/src/index.js:376);
      // sqlite returns `sqlite` + `files` and no `dbPath`
      // (packages/storage-sqlite/src/dataImportExport.js:147-158).
      // UNIFY: one envelope - paths + data - with `files` desktop-only.
      exportEnvelopeExtraKeys: ["dbPath"],
      // KNOWN DIVERGENCE D4: idb returns whole records from getState, so
      // items/tasks/dailyEntries carry createdAt/updatedAt/deletedAt; sqlite
      // hand-picks columns (packages/storage-sqlite/src/index.js:199-249) and
      // instead leaks the raw `parsedJson` string on dailyEntries. Sync/merge
      // code that reads updatedAt off a getState record only works on web.
      // UNIFY: one projection - audit columns exposed, no parsedJson.
      stateExposesAuditColumns: true,
      stateExposesParsedJson: false,
      // KNOWN DIVERGENCE D5: studyDays rows. sqlite selects only
      // study_date/minutes/summary (+entryCount)
      // (packages/storage-sqlite/src/index.js:242), dropping `note`; idb
      // returns the full day record. UNIFY: include note - the study-day note
      // is editable in both UIs.
      studyDayKeys: ["studyDate", "minutes", "summary", "note", "createdAt", "updatedAt", "deletedAt", "entryCount"],
      // KNOWN DIVERGENCE D6: upsertItem merge semantics, and the worst of the
      // bunch. idb merges into the existing record
      // (packages/storage-idb/src/index.js:241-247); sqlite rebuilds the row
      // from the payload alone (packages/storage-sqlite/src/index.js:621), so a
      // partial update blanks reading/meaning/level/part/script/note/source and
      // silently downgrades review to "대기" (clearing the due date with it).
      // Any caller that PATCHes an item loses data on desktop.
      // UNIFY: merge-with-existing on both.
      partialUpsertMerges: true,
      // KNOWN DIVERGENCE D7: sqlite's upsertItem also derives 한자 items from
      // item.kanji (packages/storage-sqlite/src/index.js:682); idb never does.
      // UNIFY: derive in both (shared helper) or in neither.
      upsertDerivesKanjiItems: false,
      // KNOWN DIVERGENCE D8: registerDailyEntries writes different provenance.
      // idb hard-codes level "웹" and source "오늘 공부"
      // (packages/storage-idb/src/index.js:731,736); sqlite leaves both empty.
      // UNIFY: one provenance convention (and stop encoding the platform in a
      // JLPT-level field).
      registeredItemLevel: "웹",
      registeredItemSource: "오늘 공부",
      // KNOWN DIVERGENCE D9: idb filters registration targets to
      // word/grammar/expression (packages/storage-idb/src/index.js:196), so
      // registering a sentence card is a silent no-op; sqlite creates a
      // `sentence` item (dailyEntryToItems in
      // packages/storage-core/src/dailyEntryParser.js). UNIFY: decide whether
      // sentences are collection items at all, then do it on both.
      registersSentenceEntries: false,
      // KNOWN DIVERGENCE D10: sqlite derives 한자 items while registering
      // (withKanjiItems, packages/storage-sqlite/src/index.js:544); idb never
      // does, so the web 한자 collection can never fill from daily entries.
      // UNIFY: derive on both.
      registerDerivesKanjiItems: false,
      // KNOWN DIVERGENCE D11: an unknown id reports
      // duplicates:["항목을 찾을 수 없습니다."] on sqlite
      // (packages/storage-sqlite/src/index.js:540) and nothing at all on idb.
      // UNIFY: report it in `errors`, not `duplicates`, on both.
      unknownIdDuplicates: [],
      // KNOWN DIVERGENCE D12: `linked` is hard-coded to [] on idb
      // (packages/storage-idb/src/index.js:199 - it is declared and returned,
      // never written); sqlite reports re-linked duplicates
      // (packages/storage-sqlite/src/index.js:563). The web UI can never tell
      // the user a duplicate got linked to a new sentence.
      // UNIFY: implement duplicate re-linking on idb.
      reportsLinkedOnRelink: false,
      // KNOWN DIVERGENCE D13: idb's try/catch sits INSIDE the IDB transaction
      // callback (packages/storage-idb/src/index.js:215), where it can never
      // observe an async or abort failure, so `errors` is effectively always
      // empty; sqlite catches per id
      // (packages/storage-sqlite/src/index.js:597). UNIFY: move idb's catch
      // outside runTransaction so real failures reach the caller.
      reportsPerIdErrors: false,
      // KNOWN DIVERGENCE D16: sqlite returns result.nextReview even when it did
      // NOT touch the review (packages/storage-sqlite/src/index.js:792 assigns
      // it unconditionally, outside the `correct && updateReviewOnCorrect`
      // guard); idb blanks it (packages/storage-idb/src/index.js:341). A UI that
      // trusts nextReview without checking reviewUpdated shows a bogus next
      // review after a wrong answer on desktop.
      // UNIFY: blank it unless reviewUpdated.
      quizNextReviewWhenNotUpdated: "",
      // KNOWN DIVERGENCE D17: repeated sentence candidates. sqlite merges into
      // the existing same-date/kind/title entry and just adds a link
      // (upsertDailyCandidate, packages/storage-sqlite/src/index.js:433); idb
      // always inserts a fresh entry
      // (putDailyCandidate, packages/storage-idb/src/index.js:701), so the same
      // word appears once per sentence on web. UNIFY: dedupe on both.
      dedupesRepeatedCandidates: false,
      // KNOWN DIVERGENCE D14: importFullBackup signature. idb takes the backup
      // object (packages/storage-idb/src/index.js:396) - which is what
      // packages/sync/src/index.js:73 and apps/web/src/main.js:1315 call -
      // while sqlite takes NO arguments and reads backups/full-backup.yaml off
      // disk (packages/storage-sqlite/src/dataImportExport.js:174), silently
      // ignoring the object. UNIFY: accept the object on both and keep the disk
      // read as a separate desktop-only method.
      importFullBackupAcceptsObject: true,
      // KNOWN DIVERGENCE D15: importCsvExports signature. idb is
      // (backup, studyDate) and imports rows out of the object
      // (packages/storage-idb/src/index.js:379); sqlite is (studyDate) and
      // always reads exports/*.csv from disk
      // (packages/storage-sqlite/src/dataImportExport.js:162). idb only
      // tolerates sqlite's call shape through a `typeof importData === "string"`
      // shim. UNIFY: same argument list on both.
      importCsvExportsAcceptsObject: true,
      // KNOWN DIVERGENCE D18: the `seedState` factory option - and therefore
      // "sample data" at all - only exists on idb
      // (packages/storage-idb/src/index.js:56,355-363); sqlite's
      // resetSampleData is a plain alias of clearAllData
      // (packages/storage-sqlite/src/index.js:826), so the desktop "샘플 데이터"
      // reset just wipes the database. UNIFY: one seed source for both.
      honorsSeedStateOption: true,
      // KNOWN DIVERGENCE D19: idb defaults every record argument to {} / [];
      // sqlite has no defaults and throws a TypeError on a missing argument
      // (packages/storage-sqlite/src/index.js:861 dereferences studyLog).
      // A dropped IPC argument should not crash the main process.
      // UNIFY: default on both.
      defaultsMissingArguments: true
    }
  },
  {
    name: "storage-sqlite",
    loadError: sqlite.loadError,
    async create(options = {}) {
      const store = sqlite.createSqliteStorage({ appDataDir: tmpDirs.make("sqlite"), ...options });
      store.initDatabase();
      return store;
    },
    expected: {
      stateHasAllDailyEntries: false, // D1
      exportDataHasAllDailyEntries: true, // D2
      exportEnvelopeExtraKeys: ["sqlite", "files"], // D3
      stateExposesAuditColumns: false, // D4
      stateExposesParsedJson: true, // D4
      studyDayKeys: ["studyDate", "minutes", "summary", "entryCount"], // D5
      partialUpsertMerges: false, // D6
      upsertDerivesKanjiItems: true, // D7
      registeredItemLevel: "", // D8
      registeredItemSource: "", // D8
      registersSentenceEntries: true, // D9
      registerDerivesKanjiItems: true, // D10
      unknownIdDuplicates: ["항목을 찾을 수 없습니다."], // D11
      reportsLinkedOnRelink: true, // D12
      reportsPerIdErrors: true, // D13
      quizNextReviewWhenNotUpdated: "일주일", // D16
      dedupesRepeatedCandidates: true, // D17
      importFullBackupAcceptsObject: false, // D14
      importCsvExportsAcceptsObject: false, // D15
      honorsSeedStateOption: false, // D18
      defaultsMissingArguments: false // D19
    }
  }
];

describe("storage contract (adapter-independent)", () => {
  it("storageMethodNames stays derived from storageContract", () => {
    expect(storageMethodNames).toEqual(storageContract.map(entry => entry.name));
    expect(storageMethodNames).toHaveLength(18);
    expect(new Set(storageMethodNames).size).toBe(storageMethodNames.length);
  });

  it("every contract entry declares a signature the conformance suite can consume", () => {
    storageContract.forEach(entry => {
      expect(typeof entry.name).toBe("string");
      expect(Array.isArray(entry.params)).toBe(true);
      expect(["state", "stateResult", "export", "handle"]).toContain(entry.returns);
    });
    expect(storageStateShape.required).toContain("items");
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

for (const adapter of adapters) {
  describeStorageSuite(`storage conformance: ${adapter.name}`, adapter.loadError, () => defineConformanceTests(adapter));
}

function defineConformanceTests(adapter) {
  const expected = adapter.expected;

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

  it("addDailyEntry() derives byte-identical child records on both adapters (shared parser)", async () => {
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

  it("resetSampleData() leaves an unseeded store empty", async () => {
    const { store } = await storeWithSentence();
    await store.upsertItem({ kind: "word", title: "리셋", meaning: "reset" });

    const reset = await store.resetSampleData();
    expect(reset.items).toHaveLength(0);
    expect(reset.dailyEntries).toHaveLength(0);
    expect(reset.tasks).toHaveLength(0);
    expect(reset.studyDays).toHaveLength(0);
  });

  it("importCsvExports() accepts a studyDate string on both adapters", async () => {
    const store = await freshStore();
    const state = await store.importCsvExports(studyDate);
    expect(state.selectedDate).toBe(studyDate);
  });

  // ------------------------------------------------------- KNOWN DIVERGENCES

  it("KNOWN DIVERGENCE D1: getState().allDailyEntries exists on idb only", async () => {
    const { state } = await storeWithSentence();
    expect("allDailyEntries" in state).toBe(expected.stateHasAllDailyEntries);
    if (expected.stateHasAllDailyEntries) {
      // Whole store, not just the selected day - what apps/web/src/main.js:549 wants.
      expect(state.allDailyEntries.length).toBeGreaterThanOrEqual(state.dailyEntries.length);
    }
  });

  it("KNOWN DIVERGENCE D2+D3: exportData() envelope and allDailyEntries differ per adapter", async () => {
    const { store } = await storeWithSentence();
    const exported = await store.exportData();

    expect("allDailyEntries" in exported.data).toBe(expected.exportDataHasAllDailyEntries);
    expected.exportEnvelopeExtraKeys.forEach(key => expect(exported).toHaveProperty(key));
    const foreignKeys = adapters
      .filter(other => other.name !== adapter.name)
      .flatMap(other => other.expected.exportEnvelopeExtraKeys);
    foreignKeys.forEach(key => expect(key in exported).toBe(false));
  });

  it("KNOWN DIVERGENCE D4+D5: getState() record projections differ (audit columns, parsedJson, studyDays.note)", async () => {
    const { store } = await storeWithSentence();
    await store.addTask({ title: "형태확인", note: "", tag: "", done: false, studyDate });
    await store.upsertItem({ kind: "word", title: "형태항목", meaning: "shape" });
    const state = await store.getState(studyDate);
    const auditKeys = ["createdAt", "updatedAt", "deletedAt"];
    const hasAuditColumns = record => auditKeys.every(key => key in record);

    expect(hasAuditColumns(state.dailyEntries[0])).toBe(expected.stateExposesAuditColumns);
    expect(hasAuditColumns(state.items[0])).toBe(expected.stateExposesAuditColumns);
    expect(hasAuditColumns(state.tasks[0])).toBe(expected.stateExposesAuditColumns);
    expect("parsedJson" in state.dailyEntries[0]).toBe(expected.stateExposesParsedJson);
    expect(Object.keys(state.studyDays[0]).sort()).toEqual([...expected.studyDayKeys].sort());
  });

  it("KNOWN DIVERGENCE D6: a partial upsertItem() merges on idb but replaces the whole row on sqlite", async () => {
    const store = await freshStore();
    const created = await store.upsertItem({
      kind: "word",
      title: "부분수정",
      reading: "もと",
      meaning: "origin",
      level: "N3",
      part: "명사",
      note: "메모",
      review: "일주일"
    });
    const item = byTitle(created.items, "부분수정");
    expect(item.reviewDueDate > todayKey()).toBe(true);

    const patched = await store.upsertItem({ id: item.id, kind: "word", title: "부분수정2" });
    const after = patched.items.find(candidate => candidate.id === item.id);

    expect(after.title).toBe("부분수정2");
    if (expected.partialUpsertMerges) {
      expect(after.reading).toBe("もと");
      expect(after.meaning).toBe("origin");
      expect(after.level).toBe("N3");
      expect(after.note).toBe("메모");
      expect(after.review).toBe("일주일");
      expect(after.reviewDueDate).toBe(item.reviewDueDate);
    } else {
      // Data loss: everything the caller omitted is blanked and the review is
      // silently downgraded to 대기 (which also clears the due date).
      expect(after.reading).toBe("");
      expect(after.meaning).toBe("");
      expect(after.level).toBe("");
      expect(after.note).toBe("");
      expect(after.review).toBe("대기");
      expect(after.reviewDueDate).toBe("");
    }
  });

  it("KNOWN DIVERGENCE D7: upsertItem() derives 한자 items from item.kanji on sqlite only", async () => {
    const store = await freshStore();
    const state = await store.upsertItem({ kind: "word", title: "漢字語", meaning: "kanji word", kanji: "漢(china)" });
    const kanjiItems = state.items.filter(item => item.kind === "kanji");

    expect(byTitle(state.items, "漢字語")).toBeTruthy();
    if (expected.upsertDerivesKanjiItems) {
      expect(kanjiItems.map(item => item.title)).toEqual(["漢"]);
      expect(kanjiItems[0].source).toBe("漢字語");
    } else {
      expect(kanjiItems).toHaveLength(0);
    }
  });

  it("KNOWN DIVERGENCE D8: registerDailyEntries() writes different provenance metadata", async () => {
    const { store, child } = await storeWithSentence();
    const registered = await store.registerDailyEntries([child("word").id], studyDate);
    const item = byTitle(registered.state.items, "単語");

    expect(item.level).toBe(expected.registeredItemLevel);
    expect(item.source).toBe(expected.registeredItemSource);
  });

  it("KNOWN DIVERGENCE D9: registerDailyEntries() ignores sentence entries on idb, registers a 문장 item on sqlite", async () => {
    const { store, sentence } = await storeWithSentence();
    const registered = await store.registerDailyEntries([sentence.id], studyDate);
    const sentenceItems = registered.state.items.filter(item => item.kind === "sentence");

    if (expected.registersSentenceEntries) {
      expect(registered.result.registered).toContain("문장: 오늘의 문장");
      expect(sentenceItems.map(item => item.title)).toEqual(["오늘의 문장"]);
    } else {
      expect(registered.result.registered).toEqual([]);
      expect(sentenceItems).toHaveLength(0);
    }
  });

  it("KNOWN DIVERGENCE D10: registerDailyEntries() derives 한자 items on sqlite only", async () => {
    const { store, child } = await storeWithSentence();
    const wordEntry = child("word");
    expect(wordEntry.parsed.kanji).toBe("単(single),語(word)");

    const registered = await store.registerDailyEntries([wordEntry.id], studyDate);
    const kanjiTitles = registered.state.items.filter(item => item.kind === "kanji").map(item => item.title).sort();

    if (expected.registerDerivesKanjiItems) {
      expect(kanjiTitles).toEqual(["単", "語"]);
      expect(registered.result.registered).toEqual(expect.arrayContaining(["한자: 単", "한자: 語"]));
    } else {
      expect(kanjiTitles).toEqual([]);
      expect(registered.result.registered).toEqual(["단어: 単語"]);
    }
  });

  it("KNOWN DIVERGENCE D11: an unknown entry id is reported as a duplicate on sqlite and ignored on idb", async () => {
    const store = await freshStore();
    const registered = await store.registerDailyEntries(["does-not-exist"], studyDate);

    expect(registered.result.registered).toEqual([]);
    expect(registered.result.duplicates).toEqual(expected.unknownIdDuplicates);
    expect(registered.result.errors).toEqual([]);
  });

  it("KNOWN DIVERGENCE D12: only sqlite reports a re-linked duplicate in result.linked", async () => {
    const { store, sentence } = await storeWithSentence();
    // A word entry added directly under a sentence: sqlite writes no link row
    // for it (only sentence-derived candidates get one), so registering it as a
    // duplicate is what creates the link and populates `linked`.
    const withChild = await store.addDailyEntry({ studyDate, kind: "word", rawText: "`リンク`", parentId: sentence.id });
    const wordEntry = withChild.dailyEntries.find(entry => entry.kind === "word" && entry.title === "リンク");
    await store.upsertItem({ kind: "word", title: "リンク", meaning: "link" });

    const registered = await store.registerDailyEntries([wordEntry.id], studyDate);
    expect(registered.result.duplicates).toContain("단어: リンク");
    expect(registered.result.linked).toEqual(expected.reportsLinkedOnRelink ? ["단어: リンク"] : []);
  });

  it("KNOWN DIVERGENCE D13: only sqlite can surface per-id failures in result.errors", async () => {
    const store = await freshStore();
    // An unbindable id: sqlite's per-id try/catch reports it, idb's try/catch
    // lives inside the IDB transaction callback and never sees anything.
    const registered = await store.registerDailyEntries([{ notAnId: true }], studyDate);

    expect(registered.result.registered).toEqual([]);
    expect(registered.result.errors.length > 0).toBe(expected.reportsPerIdErrors);
  });

  it("KNOWN DIVERGENCE D14: importFullBackup() takes the backup object on idb and ignores it on sqlite", async () => {
    const store = await freshStore();
    const error = await caught(() => store.importFullBackup(backupPayload));

    if (expected.importFullBackupAcceptsObject) {
      expect(error).toBeNull();
      const state = await store.getState(studyDate);
      expect(byTitle(state.items, "백업단어")).toBeTruthy();
    } else {
      // packages/sync/src/index.js:73 calls exactly this form; on sqlite the
      // argument is dropped and the fixed backups/full-backup.yaml is read
      // instead, which for a fresh store does not exist at all.
      expect(error).toBeTruthy();
      expect(error.message).toMatch(/full-backup\.yaml/);
      const state = await store.getState(studyDate);
      expect(byTitle(state.items, "백업단어")).toBeFalsy();
    }
  });

  it("KNOWN DIVERGENCE D15: importCsvExports() imports an object payload on idb and ignores it on sqlite", async () => {
    const store = await freshStore();
    const state = await store.importCsvExports(csvPayload, studyDate);

    if (expected.importCsvExportsAcceptsObject) {
      expect(byTitle(state.items, "CSV단어")).toBeTruthy();
      expect(state.selectedDate).toBe(studyDate);
    } else {
      expect(byTitle(state.items, "CSV단어")).toBeFalsy();
      // The object lands in sqlite's `studyDate` parameter and normalizes to today.
      expect(state.selectedDate).toBe(todayKey());
    }
  });

  it("KNOWN DIVERGENCE D16: sqlite leaks result.nextReview when the review was not updated", async () => {
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
    expect(result.nextReview).toBe(expected.quizNextReviewWhenNotUpdated);
  });

  it("KNOWN DIVERGENCE D17: a repeated sentence candidate is merged on sqlite and duplicated on idb", async () => {
    const store = await freshStore();
    await store.addDailyEntry({ studyDate, kind: "sentence", rawText: sentenceRawText });
    const state = await store.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: sentenceRawText.replace("# 오늘의 문장", "# 둘째 문장")
    });
    const wordEntries = state.dailyEntries.filter(entry => entry.kind === "word" && entry.title === "単語");

    if (expected.dedupesRepeatedCandidates) {
      expect(wordEntries).toHaveLength(1);
      expect(state.dailyEntries).toHaveLength(5);
      expect(wordEntries[0].sourceSentences.length).toBe(2);
    } else {
      expect(wordEntries).toHaveLength(2);
      expect(state.dailyEntries).toHaveLength(8);
    }
  });

  it("KNOWN DIVERGENCE D18: only idb honors the seedState option, so resetSampleData() restores samples there", async () => {
    const store = await freshStore({ seedState: sampleSeed });
    const seeded = await store.getState(studyDate);
    const reset = await store.resetSampleData();

    if (expected.honorsSeedStateOption) {
      expect(byTitle(seeded.items, "샘플단어")).toBeTruthy();
      expect(byTitle(reset.items, "샘플단어")).toBeTruthy();
    } else {
      // resetSampleData is a plain alias of clearAllData here: the desktop
      // "샘플 데이터" button just wipes the database.
      expect(seeded.items).toHaveLength(0);
      expect(reset.items).toHaveLength(0);
    }
  });

  it("KNOWN DIVERGENCE D19: idb defaults missing record arguments, sqlite throws", async () => {
    const store = await freshStore();
    const studyLogError = await caught(() => store.saveStudyLog());
    const taskError = await caught(() => store.addTask());

    if (expected.defaultsMissingArguments) {
      expect(studyLogError).toBeNull();
      expect(taskError).toBeNull();
      expect((await store.getState()).selectedDate).toBe(todayKey());
    } else {
      expect(studyLogError).toBeInstanceOf(TypeError);
      expect(taskError).toBeInstanceOf(TypeError);
    }
  });
}
