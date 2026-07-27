export function normalizeDailyKind(kind) {
  return ["sentence", "word", "grammar", "expression"].includes(kind) ? kind : "sentence";
}

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
