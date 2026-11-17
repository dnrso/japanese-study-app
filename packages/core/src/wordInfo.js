// What the 문장 tab shows about one word of a sentence: its 품사 and, per
// kanji in its title, the meaning and the registered 한자 card (if any).
// Pure: the caller passes the word (a daily entry or an item) and state.items.

import { cardByLink } from "./notes.js";

// One kanji character that can be its own 한자 card (々 repeats the previous
// one and is never registered on its own).
const KANJI_CHAR = /[㐀-䶿一-鿿豈-﫿]/u;
const KANJI_FIELD_TOKEN = /([㐀-䶿一-鿿豈-﫿々]+)\s*[（(]([^）)]+)[）)]/gu;

// "今 (이제 금), 日 (날 일)" → Map { 今 → 이제 금, 日 → 날 일 }. Only
// single-character tokens are kept: they are what a title is split into.
export function parseWordKanjiField(value) {
  const meanings = new Map();
  for (const match of String(value || "").matchAll(KANJI_FIELD_TOKEN)) {
    const char = match[1];
    if ([...char].length === 1 && !meanings.has(char)) {
      meanings.set(char, match[2].trim());
    }
  }
  return meanings;
}

//   { part, card, segments }
// part      품사 from the entry, else from the registered 단어 card
// card      the registered 단어 card, or null
// segments  the title cut into runs: { text } for kana and the like,
//           { text, kanji: { char, meaning, card } } for each kanji, where
//           card is the registered 한자 card or null and meaning falls back
//           from the word's 한자= field to that card's 뜻
export function sentenceWordInfo(word = {}, items = []) {
  const title = String(word.title || "").trim();
  const card = title ? cardByLink(items, { kind: "word", title }) : null;
  const pick = key => String(word.parsed?.[key] || word[key] || card?.[key] || "").trim();
  const meanings = parseWordKanjiField(pick("kanji"));
  const segments = [];
  for (const char of title) {
    if (KANJI_CHAR.test(char)) {
      const kanjiCard = cardByLink(items, { kind: "kanji", title: char });
      segments.push({
        text: char,
        kanji: { char, meaning: meanings.get(char) || String(kanjiCard?.meaning || "").trim(), card: kanjiCard }
      });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && !last.kanji) {
      last.text += char;
    } else {
      segments.push({ text: char });
    }
  }
  return { part: pick("part"), card, segments };
}
