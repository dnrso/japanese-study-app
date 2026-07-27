export function normalizeDailyKind(kind) {
  return ["sentence", "word", "grammar", "expression"].includes(kind) ? kind : "sentence";
}

// What registerDailyEntries reports for an id that matches no live daily
// entry. It lives beside kindLabel because it is the other user-facing Korean
// string the register flow puts into its `result`, and both adapters must emit
// the identical text: sqlite used to report it in `duplicates` and idb reported
// nothing at all (D11 in tests/storage-conformance.test.js); both now push this
// exact string into `result.errors`.
export const missingDailyEntryMessage = "항목을 찾을 수 없습니다.";

export function kindLabel(kind) {
  return {
    sentence: "문장",
    word: "단어",
    grammar: "문법",
    expression: "표현",
    kanji: "한자",
    source: "자료"
  }[kind] || kind;
}
