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
  const linkKeys = links => normalizeNoteLinks(links).map(noteLinkKey).sort().join("\n");
  if (!note) {
    return Boolean(title || body.trim() || linkKeys(draft.links));
  }
  return title !== String(note.title || "").trim()
    || body !== String(note.body || "")
    || linkKeys(draft.links) !== linkKeys(note.links)
    || linkKeys(draft.excludedLinks) !== linkKeys(note.excludedLinks);
}

// ---------------------------------------------------------------------------
// Card links: which study cards (한자/단어/문법/표현) a note is connected to.
//
// A link is stored and compared as { kind, title }, never by item id: the
// backup/sync merge can replace a card with the other device's copy of it
// (same kind/title/reading/meaning, different id), and an id reference would
// silently go dead when that happens.
//
// Three origins, in the order they win when the same card qualifies twice:
//   "wiki"    a [[제목]] written in the body
//   "manual"  added by hand in the editor (note.links)
//   "auto"    the card's title appears in the body; the user can switch a
//             single auto link off, which is remembered in note.excludedLinks
// ---------------------------------------------------------------------------

export const NOTE_LINK_KINDS = ["kanji", "word", "grammar", "expression"];

const KANJI_CHAR = /[㐀-䶿一-鿿豈-﫿々]/;
const WIKI_LINK = /\[\[([^[\]\n|]{1,80})\]\]/g;

export function noteLinkKey(link = {}) {
  return `${link.kind || ""}::${String(link.title || "").trim()}`;
}

// Cleans a stored link list: known kinds only, non-empty titles, no repeats.
export function normalizeNoteLinks(links) {
  const seen = new Set();
  return (Array.isArray(links) ? links : [])
    .map(link => ({ kind: String(link?.kind || ""), title: String(link?.title || "").trim() }))
    .filter(link => {
      const key = noteLinkKey(link);
      if (!NOTE_LINK_KINDS.includes(link.kind) || !link.title || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

// [[제목]] links in a body as { title, position }, first occurrence of each.
function wikiLinks(body) {
  const found = new Map();
  for (const match of String(body || "").matchAll(WIKI_LINK)) {
    const title = match[1].trim();
    if (title && !found.has(title)) {
      found.set(title, match.index);
    }
  }
  return [...found].map(([title, position]) => ({ title, position }));
}

export function wikiLinkTitles(body) {
  return wikiLinks(body).map(link => link.title);
}

// The text to look for in a body when auto-linking a card, or "" when the
// card must not be auto-linked. Short kana-only titles (する, の, はい) would
// match inside unrelated words in almost every note, so a title needs either
// a kanji in it or some length to qualify. A grammar pattern is matched
// without its 〜 placeholders, and not at all when it has one in the middle.
export function autoLinkNeedle(item = {}) {
  const title = String(item.title || "").trim();
  if (item.kind === "kanji") {
    return title;
  }
  const needle = title.replace(/^[〜~～…\s]+|[〜~～…\s]+$/g, "");
  if (!needle || /[〜~～…]/.test(needle)) {
    return "";
  }
  const minLength = KANJI_CHAR.test(needle) ? 2 : 4;
  return needle.length >= minLength ? needle : "";
}

// Per-`items`-array lookup tables. getState() hands out a fresh array after
// every write, so the array itself is a safe cache key.
const linkIndexCache = new WeakMap();

function linkIndex(items) {
  let index = linkIndexCache.get(items);
  if (index) {
    return index;
  }
  index = { byKey: new Map(), byTitle: new Map(), needles: [] };
  items.forEach(item => {
    if (!NOTE_LINK_KINDS.includes(item.kind) || !String(item.title || "").trim()) {
      return;
    }
    const key = noteLinkKey(item);
    if (index.byKey.has(key)) {
      return;
    }
    index.byKey.set(key, item);
    const title = String(item.title).trim();
    index.byTitle.set(title, [...(index.byTitle.get(title) || []), item]);
    const needle = autoLinkNeedle(item);
    if (needle) {
      index.needles.push({ item, needle });
    }
  });
  linkIndexCache.set(items, index);
  return index;
}

function kindOrder(kind) {
  const order = NOTE_LINK_KINDS.indexOf(kind);
  return order === -1 ? NOTE_LINK_KINDS.length : order;
}

// Every card a note is connected to, as
//   { kind, title, item, origin, position }
// `item` is the live card, or null when a manual/wiki link points at a card
// that is not registered (any more); such a wiki link has kind "".
// Sorted 한자 → 단어 → 문법 → 표현, then by where the card first shows up in
// the body, with unregistered ones last.
export function noteCardLinks(note = {}, items = []) {
  const body = String(note.body || "");
  const index = linkIndex(items);
  const links = new Map();
  const add = link => {
    const key = noteLinkKey(link);
    if (!links.has(key)) {
      links.set(key, link);
    }
  };

  wikiLinks(body).forEach(({ title, position }) => {
    const matches = index.byTitle.get(title) || [];
    if (!matches.length) {
      add({ kind: "", title, item: null, origin: "wiki", position });
    }
    matches.forEach(item => add({ kind: item.kind, title, item, origin: "wiki", position }));
  });

  normalizeNoteLinks(note.links).forEach(link => {
    const item = index.byKey.get(noteLinkKey(link)) || null;
    const position = body.indexOf(link.title);
    add({ ...link, item, origin: "manual", position: position === -1 ? Infinity : position });
  });

  const excluded = new Set(normalizeNoteLinks(note.excludedLinks).map(noteLinkKey));
  if (body) {
    index.needles.forEach(({ item, needle }) => {
      const position = body.indexOf(needle);
      if (position !== -1 && !excluded.has(noteLinkKey(item))) {
        add({ kind: item.kind, title: String(item.title).trim(), item, origin: "auto", position });
      }
    });
  }

  return [...links.values()].sort((left, right) =>
    Number(!left.item) - Number(!right.item)
    || kindOrder(left.kind) - kindOrder(right.kind)
    || left.position - right.position
  );
}

// Every registered card whose title is exactly `title` - what a [[title]]
// resolves to.
export function cardsByTitle(items = [], title) {
  return linkIndex(items).byTitle.get(String(title || "").trim()) || [];
}

export function cardByLink(items = [], link) {
  return linkIndex(items).byKey.get(noteLinkKey(link)) || null;
}

// Cards offered by the editor's "카드 추가" search: matched on title, reading
// and meaning, title-prefix matches first, minus the ones already linked.
export function searchLinkableCards(items = [], query = "", { exclude = [], limit = 8 } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const taken = new Set(exclude.map(noteLinkKey));
  const rank = item => (String(item.title).toLowerCase().startsWith(needle) ? 0 : 1);
  return [...linkIndex(items).byKey.values()]
    .filter(item => !taken.has(noteLinkKey(item))
      && [item.title, item.reading, item.meaning].some(value => String(value || "").toLowerCase().includes(needle)))
    .sort((left, right) => rank(left) - rank(right) || String(left.title).length - String(right.title).length)
    .slice(0, limit);
}
