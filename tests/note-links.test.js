// 노트 tab card links: detection in @nihongo-study/core, persistence of the
// manual/excluded lists, [[제목]] rendering and the chip/editor/popover markup.
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import * as core from "@nihongo-study/core";
import {
  badgeClassByKind,
  kindLabels,
  noteCardPopover,
  renderMarkdown,
  renderNoteLinkEditor,
  renderNotesPage
} from "@nihongo-study/ui";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const helpers = { badgeClassByKind, core, escapeHtml, highlight: escapeHtml, kindLabels };

const items = [
  { id: "k1", kind: "kanji", title: "掃", meaning: "쓸 소" },
  { id: "k2", kind: "kanji", title: "除", meaning: "덜 제" },
  { id: "k3", kind: "kanji", title: "雨", meaning: "비 우" },
  { id: "w1", kind: "word", title: "掃除", reading: "そうじ", meaning: "청소" },
  { id: "w2", kind: "word", title: "する", reading: "する", meaning: "하다" },
  { id: "w3", kind: "word", title: "ありがとう", reading: "ありがとう", meaning: "고맙다" },
  { id: "w4", kind: "word", title: "雨", reading: "あめ", meaning: "비" },
  { id: "g1", kind: "grammar", title: "〜てしまう", meaning: "완료·후회" },
  { id: "g2", kind: "grammar", title: "〜たり〜たり", meaning: "나열" },
  { id: "e1", kind: "expression", title: "お疲れ様です", reading: "おつかれさまです", meaning: "수고하셨습니다" },
  { id: "s1", kind: "source", title: "掃除", meaning: "자료는 연결 대상이 아님" }
];
const keys = links => links.map(link => `${link.kind}:${link.title}:${link.origin}`);

describe("autoLinkNeedle", () => {
  it("links kanji by the single character and other cards only when distinctive", () => {
    expect(core.autoLinkNeedle(items[0])).toBe("掃");
    expect(core.autoLinkNeedle(items[3])).toBe("掃除");
    expect(core.autoLinkNeedle(items[4])).toBe("");
    expect(core.autoLinkNeedle(items[5])).toBe("ありがとう");
    // A one-character word would collide with its own kanji card.
    expect(core.autoLinkNeedle(items[6])).toBe("");
  });

  it("matches a grammar pattern without its 〜 and skips patterns with a gap", () => {
    expect(core.autoLinkNeedle(items[7])).toBe("てしまう");
    expect(core.autoLinkNeedle(items[8])).toBe("");
  });
});

describe("noteCardLinks", () => {
  it("auto-links registered cards that appear in the body, 한자 → 단어 → 문법 → 표현", () => {
    const note = { body: "お疲れ様です。忘れてしまう前に **掃除** する。除はあとで。" };
    expect(keys(core.noteCardLinks(note, items))).toEqual([
      "kanji:掃:auto",
      "kanji:除:auto",
      "word:掃除:auto",
      "grammar:〜てしまう:auto",
      "expression:お疲れ様です:auto"
    ]);
  });

  it("orders cards of one kind by where they first appear", () => {
    const links = core.noteCardLinks({ body: "除 … 雨 … 掃" }, items);
    expect(links.map(link => link.title)).toEqual(["除", "雨", "掃"]);
  });

  it("returns the live card with each link and nothing for an empty body", () => {
    expect(core.noteCardLinks({ body: "掃" }, items)[0].item).toBe(items[0]);
    expect(core.noteCardLinks({ body: "" }, items)).toEqual([]);
    expect(core.noteCardLinks({}, [])).toEqual([]);
  });

  it("drops an auto link the user excluded, but only that one", () => {
    const note = { body: "掃除", excludedLinks: [{ kind: "kanji", title: "除" }] };
    expect(keys(core.noteCardLinks(note, items))).toEqual(["kanji:掃:auto", "word:掃除:auto"]);
  });

  it("keeps a hand-added link even when the body never mentions it", () => {
    const note = { body: "아무 내용", links: [{ kind: "word", title: "する" }] };
    expect(keys(core.noteCardLinks(note, items))).toEqual(["word:する:manual"]);
  });

  it("keeps a hand-added link whose card is gone, without a live card, last", () => {
    const note = { body: "掃", links: [{ kind: "word", title: "消えた単語" }] };
    const links = core.noteCardLinks(note, items);
    expect(keys(links)).toEqual(["kanji:掃:auto", "word:消えた単語:manual"]);
    expect(links[1].item).toBeNull();
  });

  it("resolves [[제목]] to every card with that title, and reports unknown titles", () => {
    const links = core.noteCardLinks({ body: "[[雨]] 그리고 [[없는 카드]] [[ する ]]" }, items);
    expect(keys(links)).toEqual(["kanji:雨:wiki", "word:雨:wiki", "word:する:wiki", ":없는 카드:wiki"]);
    expect(links[3].item).toBeNull();
  });

  it("does not let an exclusion hide an explicit [[link]] or a hand-added link", () => {
    const excludedLinks = [{ kind: "kanji", title: "掃" }];
    expect(keys(core.noteCardLinks({ body: "[[掃]]", excludedLinks }, items))).toEqual(["kanji:掃:wiki"]);
    expect(keys(core.noteCardLinks({ body: "掃", excludedLinks, links: excludedLinks }, items))).toEqual(["kanji:掃:manual"]);
  });

  it("never links a kind outside 한자/단어/문법/표현", () => {
    const links = core.noteCardLinks({ body: "掃除", links: [{ kind: "source", title: "掃除" }] }, items);
    expect(links.some(link => link.kind === "source")).toBe(false);
  });

  it("links one card once when its title is registered twice", () => {
    const doubled = [...items, { id: "k1-copy", kind: "kanji", title: "掃" }];
    expect(core.noteCardLinks({ body: "掃 掃 掃" }, doubled)).toHaveLength(1);
  });
});

describe("link helpers", () => {
  it("normalizes a stored list: known kinds, trimmed titles, no repeats", () => {
    expect(core.normalizeNoteLinks([
      { kind: "kanji", title: " 掃 " },
      { kind: "kanji", title: "掃" },
      { kind: "sentence", title: "문장" },
      { kind: "word", title: "" },
      null,
      "掃"
    ])).toEqual([{ kind: "kanji", title: "掃" }]);
    expect(core.normalizeNoteLinks(undefined)).toEqual([]);
  });

  it("reads [[제목]] titles once each and ignores malformed brackets", () => {
    expect(core.wikiLinkTitles("[[掃除]] [[掃除]] [[ 雨 ]] [[]] [[a|b]] [[줄\n바꿈]] [단일]")).toEqual(["掃除", "雨"]);
  });

  it("searches cards by title, reading and meaning, skipping linked ones", () => {
    expect(core.searchLinkableCards(items, "そうじ").map(item => item.id)).toEqual(["w1"]);
    expect(core.searchLinkableCards(items, "청소").map(item => item.id)).toEqual(["w1"]);
    expect(core.searchLinkableCards(items, "掃").map(item => item.id)).toEqual(["k1", "w1"]);
    expect(core.searchLinkableCards(items, "掃", { exclude: [{ kind: "kanji", title: "掃" }] }).map(item => item.id)).toEqual(["w1"]);
    expect(core.searchLinkableCards(items, "  ")).toEqual([]);
    expect(core.searchLinkableCards(items, "자료는")).toEqual([]);
  });

  it("counts a changed link list as an unsaved edit", () => {
    const note = { title: "t", body: "b", links: [{ kind: "kanji", title: "掃" }], excludedLinks: [] };
    const same = { title: "t", body: "b", links: [{ kind: "kanji", title: "掃" }], excludedLinks: [] };
    expect(core.noteDraftIsDirty(note, same)).toBe(false);
    expect(core.noteDraftIsDirty(note, { ...same, links: [] })).toBe(true);
    expect(core.noteDraftIsDirty(note, { ...same, excludedLinks: [{ kind: "kanji", title: "除" }] })).toBe(true);
    expect(core.noteDraftIsDirty(null, { title: "", body: "", links: [{ kind: "kanji", title: "掃" }] })).toBe(true);
  });
});

describe("note link storage", () => {
  it("persists manual and excluded links and survives a backup round trip", async () => {
    const storage = createIdbStorage({ dbName: `note-links-${Date.now()}-${Math.random().toString(16).slice(2)}` });
    await storage.initDatabase();
    const state = await storage.upsertNote({
      id: "note-links",
      title: "연결",
      body: "掃除",
      links: [{ kind: "word", title: "する" }, { kind: "word", title: "する" }, { kind: "", title: "x" }],
      excludedLinks: [{ kind: "kanji", title: "除" }]
    });
    expect(state.notes[0].links).toEqual([{ kind: "word", title: "する" }]);
    expect(state.notes[0].excludedLinks).toEqual([{ kind: "kanji", title: "除" }]);

    // An edit that does not mention the lists leaves them alone.
    const edited = await storage.upsertNote({ id: "note-links", body: "掃除 2" });
    expect(edited.notes[0].links).toEqual([{ kind: "word", title: "する" }]);

    const restored = await storage.importFullBackup(await storage.exportData());
    expect(restored.notes[0].excludedLinks).toEqual([{ kind: "kanji", title: "除" }]);
    await storage.close();
  });

  it("gives a note saved before links existed empty lists", async () => {
    const storage = createIdbStorage({ dbName: `note-links-${Date.now()}-${Math.random().toString(16).slice(2)}` });
    await storage.initDatabase();
    const state = await storage.importFullBackup({ data: { notes: [{ id: "old", title: "예전 노트", body: "掃" }] } });
    expect(state.notes[0]).toMatchObject({ links: [], excludedLinks: [] });
    await storage.close();
  });
});

describe("[[제목]] rendering", () => {
  const cardKind = title => ({ 掃除: "word", 雨: "kanji" })[title] || "";

  it("renders a resolved link as a button coloured by its card's kind", () => {
    const { html } = renderMarkdown("오늘은 [[掃除]] 했다", { cardKind });
    expect(html).toContain('<button type="button" class="notebook-link notebook-link--word" data-note-card-kind="word" data-note-card-title="掃除">掃除</button>');
  });

  it("renders an unknown title as a missing link", () => {
    const { html } = renderMarkdown("[[없음]]", { cardKind });
    expect(html).toContain('class="notebook-link notebook-link--missing" data-note-card-kind=""');
  });

  it("escapes the title and ignores a kind it does not know", () => {
    const { html } = renderMarkdown('[["><img src=x onerror=alert(1)>]]', { cardKind: () => '"><script>' });
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('data-note-card-kind=""');
    expect(html).toContain("&quot;&gt;&lt;img");
  });

  it("works inside tables, emphasis and headings, and leaves ordinary links alone", () => {
    const { html, headings } = renderMarkdown("# [[雨]] 정리\n\n| 단어 |\n| --- |\n| **[[掃除]]** |\n\n[사전](https://example.com) [[a|b]] [[]]", { cardKind });
    expect(headings[0].text).toBe("雨 정리");
    expect(html).toContain('<strong><button type="button" class="notebook-link notebook-link--word"');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain("[[a|b]]");
    expect(html.match(/notebook-link /g)).toHaveLength(2);
  });

  it("renders without a resolver", () => {
    expect(renderMarkdown("[[掃除]]").html).toContain("notebook-link--missing");
  });
});

describe("chips in the list and reader", () => {
  const now = new Date(2026, 10, 16, 15, 0);
  const note = { id: "n1", title: "청소 노트", body: "掃除 本文", updatedAt: now.toISOString() };
  const linksFor = candidate => core.noteCardLinks(candidate, items);

  it("shows a row's linked cards as chips instead of the body preview", () => {
    const { html } = renderNotesPage({ view: "list", notes: [note], total: 1, now, linksFor, helpers });
    expect(html.notesList).toContain('class="notebook-chip badge yellow" lang="ja" data-note-card-kind="kanji" data-note-card-title="掃"');
    expect(html.notesList).toContain('class="notebook-chip badge red" lang="ja" data-note-card-kind="word" data-note-card-title="掃除"');
    expect(html.notesList).not.toContain("notebook-row-preview");
  });

  it("keeps the body preview for a note with no linked cards", () => {
    const plain = { ...note, body: "연결할 것이 없는 본문" };
    const { html } = renderNotesPage({ view: "list", notes: [plain], total: 1, now, linksFor, helpers });
    expect(html.notesList).toContain("notebook-row-preview");
    expect(html.notesList).not.toContain("notebook-row-chips");
  });

  it("folds chips past the row limit into +N and keeps chips out of the open-note button", () => {
    const many = Array.from({ length: 14 }, (_, index) => ({ id: `m${index}`, kind: "kanji", title: String.fromCodePoint(0x4e00 + index) }));
    const crowded = { ...note, body: many.map(item => item.title).join("") };
    const { html } = renderNotesPage({ view: "list", notes: [crowded], total: 1, now, linksFor: candidate => core.noteCardLinks(candidate, many), helpers });
    expect(html.notesList.match(/data-note-card-title=/g)).toHaveLength(10);
    expect(html.notesList).toContain(">+4</span>");
    const openButton = html.notesList.slice(html.notesList.indexOf("data-open-note"), html.notesList.indexOf("notebook-row-date"));
    expect(openButton).not.toContain("notebook-chip");
  });

  it("lists every linked card above an open note, and hides the block when there are none", () => {
    const read = renderNotesPage({ view: "read", notes: [note], total: 1, note, rendered: { html: "<p>x</p>" }, now, linksFor, helpers });
    expect(read.hidden.notesReadLinks).toBe(false);
    expect(read.html.notesReadLinks).toContain("연결된 카드 3");
    expect(read.html.notesReadLinks.match(/data-note-card-title=/g)).toHaveLength(3);

    const plain = { ...note, body: "없음" };
    const empty = renderNotesPage({ view: "read", notes: [plain], total: 1, note: plain, rendered: { html: "" }, now, linksFor, helpers });
    expect(empty.hidden.notesReadLinks).toBe(true);
  });

  it("draws a link to an unregistered card muted, with an escaped title", () => {
    const hostile = { ...note, body: "", links: [{ kind: "word", title: '"><img src=x>' }] };
    const { html } = renderNotesPage({ view: "list", notes: [hostile], total: 1, now, linksFor, helpers });
    expect(html.notesList).toContain("notebook-chip--missing");
    expect(html.notesList).toContain('data-note-card-kind=""');
    expect(html.notesList).not.toContain("<img");
  });
});

describe("renderNoteLinkEditor", () => {
  const links = core.noteCardLinks({ body: "掃除 [[雨]]", links: [{ kind: "word", title: "する" }] }, items);

  it("gives auto and manual chips a remove button, but not [[links]]", () => {
    const { html, text } = renderNoteLinkEditor({ links, helpers });
    expect(text.noteLinkCount).toBe(String(links.length));
    expect(html.noteLinkChips).toContain('data-note-link-remove-kind="kanji" data-note-link-remove-title="掃" data-note-link-origin="auto"');
    expect(html.noteLinkChips).toContain('data-note-link-remove-kind="word" data-note-link-remove-title="する" data-note-link-origin="manual"');
    expect(html.noteLinkChips).not.toContain('data-note-link-remove-title="雨"');
  });

  it("shows search results only while searching, and says so when nothing matches", () => {
    const idle = renderNoteLinkEditor({ links, helpers });
    expect(idle.hidden.noteLinkResults).toBe(true);

    const found = renderNoteLinkEditor({ links, query: "あり", results: [items[5]], helpers });
    expect(found.hidden.noteLinkResults).toBe(false);
    expect(found.html.noteLinkResults).toContain('data-note-link-add-kind="word" data-note-link-add-title="ありがとう"');

    const none = renderNoteLinkEditor({ links, query: "<없음>", results: [], helpers });
    expect(none.html.noteLinkResults).toContain("&lt;없음&gt;");
  });

  it("offers excluded cards for restoring", () => {
    const patch = renderNoteLinkEditor({ links: [], excluded: [{ kind: "kanji", title: "除" }], helpers });
    expect(patch.hidden.noteLinkExcluded).toBe(false);
    expect(patch.html.noteLinkExcluded).toContain('data-note-link-restore-kind="kanji" data-note-link-restore-title="除"');
    expect(renderNoteLinkEditor({ links: [], helpers }).hidden.noteLinkExcluded).toBe(true);
  });
});

describe("noteCardPopover", () => {
  it("previews a registered card with a way to its tab", () => {
    const html = noteCardPopover({ title: "掃除", item: items[3], pageLabel: "단어", helpers });
    expect(html).toContain("そうじ");
    expect(html).toContain("청소");
    expect(html).toContain('data-speak-text="掃除"');
    expect(html).toContain('data-note-card-open-kind="word" data-note-card-open-title="掃除"');
    expect(html).toContain("단어 탭에서 보기");
  });

  it("says so when the card is not registered", () => {
    const html = noteCardPopover({ title: "<없음>", item: null, helpers });
    expect(html).toContain("등록된 카드가 없습니다.");
    expect(html).toContain("&lt;없음&gt;");
    expect(html).not.toContain("data-note-card-open-title");
  });
});

describe("list order, pinning and copies", () => {
  const notes = [
    { id: "b", title: "나", createdAt: "2026-01-03", editedAt: "2026-02-01", updatedAt: "2026-06-01" },
    { id: "a", title: "가", createdAt: "2026-01-01", editedAt: "2026-03-01", updatedAt: "2026-03-01" },
    { id: "c", title: "다", createdAt: "2026-01-02", editedAt: "2026-01-15", updatedAt: "2026-01-15", pinned: true }
  ];
  const order = sort => core.sortNotes(notes, sort).map(note => note.id);

  it("sorts by last edit, creation date or title, pinned notes always first", () => {
    expect(order("edited")).toEqual(["c", "a", "b"]);
    expect(order("created")).toEqual(["c", "b", "a"]);
    expect(order("title")).toEqual(["c", "a", "b"]);
    expect(order("nonsense")).toEqual(order("edited"));
    expect(core.normalizeNoteSort("title")).toBe("title");
    expect(core.normalizeNoteSort(null)).toBe(core.DEFAULT_NOTE_SORT);
  });

  it("orders by editedAt, not the sync clock, and falls back for older notes", () => {
    expect(core.noteEditedAt(notes[0])).toBe("2026-02-01");
    expect(core.noteEditedAt({ updatedAt: "2026-05-05" })).toBe("2026-05-05");
    expect(core.visibleNotes(notes, "", "edited").map(note => note.id)).toEqual(["c", "a", "b"]);
  });

  it("finds a note by the title of a hand-linked card", () => {
    const linked = [{ id: "n", title: "메모", body: "본문", links: [{ kind: "word", title: "掃除" }] }];
    expect(core.visibleNotes(linked, "掃除")).toHaveLength(1);
    expect(core.visibleNotes(linked, "経験")).toHaveLength(0);
  });

  it("copies text and links under a title marked as a copy, without the pin", () => {
    const copy = core.duplicateNoteFields({
      id: "n", title: "", body: "# 원본 제목\n내용", pinned: true,
      links: [{ kind: "word", title: "掃除" }], excludedLinks: [{ kind: "kanji", title: "除" }]
    });
    expect(copy).toEqual({
      title: "원본 제목 (사본)",
      body: "# 원본 제목\n내용",
      links: [{ kind: "word", title: "掃除" }],
      excludedLinks: [{ kind: "kanji", title: "除" }]
    });
  });

  it("pinning keeps editedAt; changing the text moves it", async () => {
    const storage = createIdbStorage({ dbName: `note-pin-${Date.now()}-${Math.random().toString(16).slice(2)}` });
    await storage.initDatabase();
    const created = (await storage.upsertNote({ id: "p", title: "제목", body: "본문" })).notes[0];
    expect(created.editedAt).toBe(created.updatedAt);

    await new Promise(resolve => setTimeout(resolve, 5));
    const pinned = (await storage.upsertNote({ id: "p", pinned: true })).notes[0];
    expect(pinned.pinned).toBe(true);
    expect(pinned.editedAt).toBe(created.editedAt);
    expect(pinned.updatedAt > created.updatedAt).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 5));
    const edited = (await storage.upsertNote({ id: "p", body: "본문 수정" })).notes[0];
    expect(edited.pinned).toBe(true);
    expect(edited.editedAt > created.editedAt).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 5));
    const relinked = (await storage.upsertNote({ id: "p", links: [{ kind: "word", title: "掃除" }] })).notes[0];
    expect(relinked.editedAt > edited.editedAt).toBe(true);
    await storage.close();
  });
});

describe("list row menu and paging", () => {
  const now = new Date(2026, 10, 16, 15, 0);
  const base = { id: "n1", title: "노트", body: "본문", updatedAt: now.toISOString(), editedAt: new Date(2026, 10, 9, 12, 0).toISOString() };

  it("puts pin, edit, duplicate and delete in the row menu", () => {
    const { html } = renderNotesPage({ view: "list", notes: [base], total: 1, now, helpers });
    expect(html.notesList).toContain('<details class="notebook-menu notebook-row-actions">');
    ["data-pin-note", "data-edit-note", "data-duplicate-note", "data-delete-note"].forEach(attribute => {
      expect(html.notesList).toContain(`${attribute}="n1"`);
    });
    expect(html.notesList).toContain("맨 위에 고정");
    expect(html.notesList).not.toContain("notebook-row-pin");
  });

  it("marks a pinned row and offers to unpin it", () => {
    const { html, text } = renderNotesPage({ view: "read", notes: [{ ...base, pinned: true }], total: 1, note: { ...base, pinned: true }, rendered: { html: "" }, now, helpers });
    expect(html.notesList).toContain("notebook-row--pinned");
    expect(html.notesList).toContain("notebook-row-pin");
    expect(html.notesList).toContain("고정 해제");
    expect(text.notePinBtn).toBe("고정 해제");
    expect(renderNotesPage({ view: "read", notes: [base], total: 1, note: base, rendered: { html: "" }, now, helpers }).text.notePinBtn).toBe("고정");
  });

  it("dates a row by editedAt rather than updatedAt", () => {
    const patch = renderNotesPage({ view: "read", notes: [base], total: 1, note: base, rendered: { html: "" }, now, helpers });
    expect(patch.html.notesList).toContain("11월 9일");
    expect(patch.html.notesList).not.toContain("오늘");
    expect(patch.text.notesReadMeta).toBe("마지막 수정 11월 9일");
  });

  it("counts every match, not just the current page, and passes the sort and pager through", () => {
    const patch = renderNotesPage({ view: "list", notes: [base], total: 45, matched: 23, searchTerm: "노트", sort: "title", pagination: "<nav>pager</nav>", now, helpers });
    expect(patch.text.notesCount).toBe("노트 23개 / 전체 45개");
    expect(patch.value).toEqual({ noteSortSelect: "title" });
    expect(patch.html.notesPagination).toBe("<nav>pager</nav>");
  });
});
