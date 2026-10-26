// Ported from scratchpad live-check-storage.mjs.
// Drives the real @nihongo-study/storage-idb module against fake-indexeddb,
// exercising: addDailyEntry -> deleteDailyEntry (soft delete) -> getState
// (filtered read), plus a simulated "page reload" by creating a brand-new
// createIdbStorage() instance pointed at the same fake-indexeddb backing
// store, and deleteItem soft-delete parity.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { createIdbStorage } from "@nihongo-study/storage-idb";

const studyDate = "2026-07-06";

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("storage-idb (fake-indexeddb)", () => {
  let dbName;

  beforeEach(() => {
    // Unique db name per test run to avoid cross-test interference while
    // still allowing "reload" simulations within a single test (same name,
    // new storage instance).
    dbName = `live-check-db-${Math.random().toString(16).slice(2)}`;
  });

  it("cascades soft-delete from a sentence card to its child daily entries and survives a simulated reload", async () => {
    const storage1 = createIdbStorage({ dbName });
    await storage1.initDatabase();

    const addResult = await storage1.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: [
        "テスト文です",
        "읽기 てすとぶんです",
        "해석 This is a test sentence",
        "단어장",
        "`テスト`(てすと) 테스트",
        "문법",
        "표현"
      ].join("\n")
    });

    const sentenceEntry = addResult.dailyEntries.find(entry => entry.kind === "sentence");
    expect(sentenceEntry).toBeTruthy();

    const wordChild = addResult.allDailyEntries.find(entry => entry.parentId === sentenceEntry.id && entry.kind === "word");
    expect(wordChild).toBeTruthy();

    const registerResult = await storage1.registerDailyEntries([wordChild.id], studyDate);
    const registeredItem = registerResult.state.items.find(item => item.title === wordChild.title);
    expect(registeredItem).toBeTruthy();

    const afterDelete = await storage1.deleteDailyEntry(sentenceEntry.id, studyDate);
    expect(afterDelete.dailyEntries.some(entry => entry.id === sentenceEntry.id)).toBe(false);
    expect(
      afterDelete.allDailyEntries.some(entry => entry.id === sentenceEntry.id || entry.parentId === sentenceEntry.id)
    ).toBe(false);

    // Simulate a page reload: brand-new storage instance, same fake-indexeddb backing store.
    const storage2 = createIdbStorage({ dbName });
    await storage2.initDatabase();
    const stateAfterReload = await storage2.getState(studyDate);

    expect(stateAfterReload.dailyEntries.some(entry => entry.id === sentenceEntry.id)).toBe(false);
    expect(
      stateAfterReload.allDailyEntries.some(entry => entry.id === sentenceEntry.id || entry.parentId === sentenceEntry.id)
    ).toBe(false);
    expect(stateAfterReload.items.some(item => item.id === registeredItem.id)).toBe(true);

    // exportData() must retain tombstones (deletedAt) for sync payloads.
    const exported = await storage2.exportData();
    const tombstonedEntry = exported.data.dailyEntries.find(entry => entry.id === sentenceEntry.id);
    expect(tombstonedEntry?.deletedAt).toBeTruthy();

    const tombstonedLink = exported.data.dailyEntryLinks.find(
      link => link.entryId === wordChild.id || link.sentenceId === sentenceEntry.id
    );
    expect(tombstonedLink?.deletedAt).toBeTruthy();

    // studyDays entryCount reflects the filtered (active-only) entries.
    const dayRow = stateAfterReload.studyDays.find(day => day.studyDate === studyDate);
    expect(dayRow).toBeTruthy();
    expect(dayRow.entryCount).toBe(0);
  });

  it("deleteItem soft-deletes and stays gone after a simulated reload, while export retains the tombstone", async () => {
    const storage3 = createIdbStorage({ dbName });
    await storage3.initDatabase();
    const upsertState = await storage3.upsertItem({ kind: "word", title: "테스트단어", meaning: "test word", studyDate });
    const item = upsertState.items.find(candidate => candidate.title === "테스트단어");

    const afterItemDelete = await storage3.deleteItem(item.id, studyDate);
    expect(afterItemDelete.items.some(candidate => candidate.id === item.id)).toBe(false);

    const storage4 = createIdbStorage({ dbName });
    await storage4.initDatabase();
    const stateAfterItemReload = await storage4.getState(studyDate);
    expect(stateAfterItemReload.items.some(candidate => candidate.id === item.id)).toBe(false);

    const exportedItems = await storage4.exportData();
    const exportedItem = exportedItems.data.items.find(candidate => candidate.id === item.id);
    expect(exportedItem?.deletedAt).toBeTruthy();
  });

  it("schedules review due dates from today, not from a past studyDate being browsed", async () => {
    const storage = createIdbStorage({ dbName });
    await storage.initDatabase();

    // The user is browsing an old study day; anything scheduled now must
    // still land in the future, otherwise promoteDueReviews() (which runs on
    // every getState) instantly flips it back to "오늘".
    const pastDate = "2020-01-05";
    const today = todayKey();

    const upserted = await storage.upsertItem({
      kind: "word",
      title: "과거복습",
      reading: "",
      meaning: "past study date",
      studyDate: pastDate
    });
    const item = upserted.items.find(candidate => candidate.title === "과거복습");
    expect(item).toBeTruthy();

    // Cycling the review (word list "복습" button) while a past date is active.
    const afterCycle = await storage.updateItemReview(item.id, "한달", pastDate);
    const cycled = afterCycle.items.find(candidate => candidate.id === item.id);
    expect(cycled.review).toBe("한달");
    expect(cycled.reviewDueDate > today).toBe(true);

    // Completing a review from the review queue, same situation.
    const afterComplete = await storage.completeReview([{ id: item.id, review: "일주일" }], pastDate);
    const completed = afterComplete.items.find(candidate => candidate.id === item.id);
    expect(completed.review).toBe("일주일");
    expect(completed.reviewDueDate > today).toBe(true);

    // And via the quiz path (correct answer + updateReviewOnCorrect).
    const quizResult = await storage.submitWordQuizAnswer({
      itemId: item.id,
      quizKind: "word",
      answerType: "meaning",
      selectedAnswer: "past study date",
      updateReviewOnCorrect: true,
      correctReview: "3일 후",
      studyDate: pastDate
    });
    expect(quizResult.result.correct).toBe(true);
    const quizzed = quizResult.state.items.find(candidate => candidate.id === item.id);
    expect(quizzed.review).toBe("3일 후");
    expect(quizzed.reviewDueDate > today).toBe(true);
  });

  it("importFullBackup tolerates a legacy sqlite-shaped dailyEntry (parsedJson string only) without losing the parsed breakdown", async () => {
    const storage = createIdbStorage({ dbName });
    await storage.initDatabase();

    const legacyParsed = {
      title: "レガシー",
      reading: "れがしー",
      meaning: "legacy entry",
      kind: "word",
      words: [],
      grammar: [],
      expressions: []
    };
    const legacyEntry = {
      id: "legacy-entry-1",
      studyDate,
      parentId: "",
      kind: "word",
      title: "レガシー",
      reading: "れがしー",
      meaning: "legacy entry",
      rawText: "",
      // Legacy sqlite exportData() shape: only a serialized `parsedJson`
      // string, no structured `parsed` object.
      parsedJson: JSON.stringify(legacyParsed),
      registered: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      deletedAt: null
    };

    const state = await storage.importFullBackup({
      data: {
        selectedDate: studyDate,
        studyDays: [],
        allDailyEntries: [legacyEntry],
        dailyEntryLinks: [],
        tasks: [],
        items: []
      }
    });

    const imported = state.allDailyEntries.find(entry => entry.id === "legacy-entry-1");
    expect(imported).toBeTruthy();
    expect(imported.parsed).toEqual(legacyParsed);
  });

  // The transaction-boundary half of D13 (tests/storage-conformance.test.js),
  // which the shared conformance test cannot reach: its invalid record never
  // gets as far as a write, and sqlite has no IndexedDB transaction to abort.
  // registerDailyEntries used to wrap the WHOLE batch in one runTransaction
  // with the try/catch inside the callback, so a failing put aborted everything
  // and rejected the returned promise with `errors` still empty. It now opens
  // one transaction per entry, so a failure is reported, rolled back on its own,
  // and the rest of the batch still commits.
  it("registerDailyEntries reports a failed write in result.errors, rolls back only that entry and keeps the batch going", async () => {
    const storage = createIdbStorage({ dbName });
    await storage.initDatabase();
    const state = await storage.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: [
        "# 오늘의 문장",
        "단어장",
        "`単語`(たんご)|품사=명사|한자=単(single)",
        "문법",
        "`〜てもいい`|메모=문법 표현"
      ].join("\n")
    });
    const word = state.dailyEntries.find(entry => entry.kind === "word");
    const grammar = state.dailyEntries.find(entry => entry.kind === "grammar");

    // The only way to force a genuine IndexedDB write failure here: make the
    // item put for 単語 fail, the way a quota/DataError would in a browser.
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value && value.title === "単語") {
        throw new DOMException("simulated write failure", "DataError");
      }
      return realPut.call(this, value, key);
    };
    let response;
    try {
      response = await storage.registerDailyEntries([word.id, grammar.id], studyDate);
    } finally {
      IDBObjectStore.prototype.put = realPut;
    }

    expect(response.result.errors).toHaveLength(1);
    expect(response.result.registered).toEqual(["문법: 〜てもいい"]);
    // The failed entry wrote nothing at all - not the word, not its 한자 - and
    // its `registered` flag stayed false, so the card still shows 등록 필요.
    expect(response.state.items.map(item => item.title)).toEqual(["〜てもいい"]);
    expect(response.state.dailyEntries.find(entry => entry.id === word.id).registered).toBe(false);
    expect(response.state.dailyEntries.find(entry => entry.id === grammar.id).registered).toBe(true);

    // And the rolled-back titles are not falsely remembered as collected: the
    // same entry registers cleanly on a retry.
    const retry = await storage.registerDailyEntries([word.id], studyDate);
    expect(retry.result.errors).toEqual([]);
    expect(retry.result.registered).toEqual(expect.arrayContaining(["단어: 単語", "한자: 単"]));
  });
});
