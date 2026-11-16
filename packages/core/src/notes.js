// Pure helpers for the 노트 tab: no DOM, no storage access.

export const UNTITLED_NOTE_TITLE = "제목 없는 노트";

// Markdown table separator rows ("| :---: | :--- |") and horizontal rules
// carry no words, so they are skipped when a line of text is wanted.
const DECORATION_LINE = /^[\s|:\-*_=]+$/;

function plainLine(line) {
  return String(line || "")
    .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+[.)])\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textLines(body) {
  return String(body || "")
    .split(/\r?\n/)
    .filter(line => line.trim() && !DECORATION_LINE.test(line))
    .map(plainLine)
    .filter(Boolean);
}

// The title a note is saved with when the title field is left empty: the
// first line of the body that has words in it (a leading "# 제목" heading in
// practice), cut to a list-friendly length.
export function deriveNoteTitle(body, maxLength = 80) {
  const [first = ""] = textLines(body);
  return first.length > maxLength ? `${first.slice(0, maxLength).trimEnd()}…` : first;
}

export function noteDisplayTitle(note = {}) {
  return String(note.title || "").trim() || deriveNoteTitle(note.body) || UNTITLED_NOTE_TITLE;
}

// One line of body text for the list row. The line that only repeats the
// title is dropped so the row does not say the same thing twice.
export function notePreview(note = {}, maxLength = 110) {
  const title = noteDisplayTitle(note);
  const joined = textLines(note.body)
    .filter((line, index) => !(index === 0 && line === title))
    .join(" · ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength).trimEnd()}…` : joined;
}

export function matchesNoteSearch(note = {}, searchTerm = "") {
  const needle = String(searchTerm || "").trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${note.title || ""}\n${note.body || ""}`.toLowerCase().includes(needle);
}

// Pinned notes first, then the most recently edited.
export function sortNotes(notes = []) {
  return [...notes].sort((left, right) =>
    Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  );
}

export function visibleNotes(notes = [], searchTerm = "") {
  return sortNotes(notes.filter(note => matchesNoteSearch(note, searchTerm)));
}

// Whether the editor holds something the stored note does not. `note` is
// null/undefined for a note that has never been saved.
export function noteDraftIsDirty(note, draft = {}) {
  const title = String(draft.title || "").trim();
  const body = String(draft.body || "");
  if (!note) {
    return Boolean(title || body.trim());
  }
  return title !== String(note.title || "").trim() || body !== String(note.body || "");
}
