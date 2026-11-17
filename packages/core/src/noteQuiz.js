// Pure helpers for "퀴즈 from a note": which of a note's linked cards a quiz
// may ask about. No DOM, no storage access.
//
// Imports only from ./notes.js: index.js re-exports this module, so importing
// index.js here would be circular.
import { noteCardLinks } from "./notes.js";

// The card kinds a note quiz can ask (grammar/expression have no quiz engine).
export const NOTE_QUIZ_KINDS = ["kanji", "word"];

// Registered cards of `kind` linked to the note, any origin (auto, manual,
// [[wiki]]), in noteCardLinks order without repeats.
function linkedItems(note, items, kind) {
  if (!note || !NOTE_QUIZ_KINDS.includes(kind)) {
    return [];
  }
  const seen = new Set();
  return noteCardLinks(note, Array.isArray(items) ? items : [])
    .map(link => link.item)
    .filter(item => {
      if (!item || item.kind !== kind || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
}

// Ids of the note's linked cards that a quiz of `kind` may ask about: the
// same title && meaning rule quizCandidates uses, so every id is in the pool.
export function noteQuizQuestionIds(note, items, kind) {
  return linkedItems(note, items, kind)
    .filter(item => item.title && item.meaning)
    .map(item => item.id);
}

// How many registered cards of `kind` the note links to, including ones that
// cannot be asked yet (no meaning), for "N자 중 M자 출제 가능".
export function noteQuizLinkedCount(note, items, kind) {
  return linkedItems(note, items, kind).length;
}

// Combines two "askable ids" restrictions; null/undefined means unrestricted.
// Both arrays: the ids in both, in `first`'s order, without repeats.
export function intersectQuestionIds(first, second) {
  const firstList = Array.isArray(first) ? first : null;
  const secondList = Array.isArray(second) ? second : null;
  if (!firstList && !secondList) {
    return null;
  }
  if (!firstList || !secondList) {
    return [...(firstList || secondList)];
  }
  const allowed = new Set(secondList);
  const seen = new Set();
  return firstList.filter(id => {
    if (!allowed.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}
