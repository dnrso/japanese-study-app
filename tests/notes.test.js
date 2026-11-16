// 노트 tab: storage (storage-idb on fake-indexeddb), backup/sync merge, the
// pure list helpers in @nihongo-study/core and the Markdown renderer.
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import * as core from "@nihongo-study/core";
import { noteDateLabel, renderMarkdown, renderNotesPage } from "@nihongo-study/ui";

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openStorage() {
  return createIdbStorage({ dbName: unique("notes-test") });
}

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const helpers = { core, escapeHtml, highlight: escapeHtml };

describe("notes storage", () => {
  it("saves several notes and returns them from getState", async () => {
    const storage = openStorage();
    await storage.initDatabase();
    await storage.upsertNote({ id: "note-a", title: "한자 노트", body: "# 한자\n\n| 한자 | 뜻 |\n| --- | --- |\n| **捨** | 버릴 사 |" });
    const state = await storage.upsertNote({ id: "note-b", title: "문법 노트", body: "〜てしまう" });

    expect(state.notes.map(note => note.id).sort()).toEqual(["note-a", "note-b"]);
    const saved = state.notes.find(note => note.id === "note-a");
    expect(saved.body).toContain("| **捨** | 버릴 사 |");
    expect(saved.createdAt).toBeTruthy();
    expect(saved.deletedAt).toBeNull();
    await storage.close();
  });

  it("keeps the body exactly as typed, including leading whitespace and line breaks", async () => {
    const storage = openStorage();
    await storage.initDatabase();
    const body = "\n  - 들여쓴 목록\n\n    code block\n";
    const state = await storage.upsertNote({ id: "note-raw", title: "", body });
    expect(state.notes[0].body).toBe(body);
    await storage.close();
  });

  it("updates an existing note in place, keeping createdAt", async () => {
    const storage = openStorage();
    await storage.initDatabase();
    const first = (await storage.upsertNote({ id: "note-edit", title: "초안", body: "1" })).notes[0];
    await new Promise(resolve => setTimeout(resolve, 5));
    const state = await storage.upsertNote({ id: "note-edit", title: "완성", body: "2" });

    expect(state.notes).toHaveLength(1);
    expect(state.notes[0]).toMatchObject({ id: "note-edit", title: "완성", body: "2", createdAt: first.createdAt });
    expect(state.notes[0].updatedAt > first.updatedAt).toBe(true);
    await storage.close();
  });

  it("generates an id when the caller supplies none", async () => {
    const storage = openStorage();
    await storage.initDatabase();
    const state = await storage.upsertNote({ title: "id 없음", body: "" });
    expect(state.notes).toHaveLength(1);
    expect(core.isSafeRecordId(state.notes[0].id)).toBe(true);
    await storage.close();
  });

  it("deletes with a tombstone that stays in the export", async () => {
    const storage = openStorage();
    await storage.initDatabase();
    await storage.upsertNote({ id: "note-keep", title: "남는 노트", body: "" });
    await storage.upsertNote({ id: "note-gone", title: "지울 노트", body: "" });
    const state = await storage.deleteNote("note-gone");

    expect(state.notes.map(note => note.id)).toEqual(["note-keep"]);
    const exported = (await storage.exportData()).data.notes;
    expect(exported.find(note => note.id === "note-gone").deletedAt).toBeTruthy();
    expect(exported.find(note => note.id === "note-keep").deletedAt).toBeNull();
    await storage.close();
  });

  it("round-trips notes through a full backup", async () => {
    const source = openStorage();
    await source.initDatabase();
    await source.upsertNote({ id: "note-backup", title: "백업", body: "**굵게**" });
    const backup = await source.exportData();
    await source.close();

    const target = openStorage();
    await target.initDatabase();
    const state = await target.importFullBackup(backup);
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0]).toMatchObject({ id: "note-backup", title: "백업", body: "**굵게**" });
    await target.close();
  });

  it("opens a database created before the notes store existed", async () => {
    const dbName = unique("notes-legacy");
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("meta", { keyPath: "key" });
        db.createObjectStore("studyDays", { keyPath: "studyDate" });
        db.createObjectStore("dailyEntries", { keyPath: "id" });
        db.createObjectStore("dailyEntryLinks", { keyPath: "id" });
        db.createObjectStore("tasks", { keyPath: "id" });
        db.createObjectStore("items", { keyPath: "id" }).put({ id: "w1", kind: "word", title: "雨", meaning: "비" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const storage = createIdbStorage({ dbName });
    await storage.initDatabase();
    const before = await storage.getState();
    expect(before.notes).toEqual([]);
    expect(before.items.map(item => item.title)).toEqual(["雨"]);

    const after = await storage.upsertNote({ id: "note-new", title: "새 노트", body: "" });
    expect(after.notes).toHaveLength(1);
    expect(after.items.map(item => item.title)).toEqual(["雨"]);
    await storage.close();
  });

  it("merges a remote snapshot's notes with the local ones", async () => {
    const storage = openStorage();
    await storage.initDatabase();
    await storage.upsertNote({ id: "note-local", title: "로컬", body: "" });
    await storage.upsertNote({ id: "note-shared", title: "로컬 버전", body: "old" });

    const remote = {
      notes: [
        { id: "note-remote", title: "원격", body: "", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "note-shared", title: "원격 버전", body: "new", updatedAt: "2999-01-01T00:00:00.000Z" }
      ]
    };
    const { state } = await storage.applyRemoteSnapshot(remote, (local, imported) => core.mergeBackupData(local, imported, "2026-07-06"));

    expect(state.notes.map(note => note.id).sort()).toEqual(["note-local", "note-remote", "note-shared"]);
    expect(state.notes.find(note => note.id === "note-shared")).toMatchObject({ title: "원격 버전", body: "new" });
    await storage.close();
  });
});

describe("mergeBackupData notes", () => {
  const local = { notes: [{ id: "n1", title: "A", body: "local", updatedAt: "2026-05-02T00:00:00.000Z" }] };

  it("keeps local notes when the imported snapshot predates the notes tab", () => {
    const result = core.mergeBackupData(local, { items: [] }, "2026-07-06");
    expect(result.data.notes).toEqual(local.notes);
  });

  it("lets the newer side win and counts the update", () => {
    const newer = { notes: [{ id: "n1", title: "A", body: "remote", updatedAt: "2026-05-03T00:00:00.000Z" }] };
    const older = { notes: [{ id: "n1", title: "A", body: "remote", updatedAt: "2026-05-01T00:00:00.000Z" }] };
    expect(core.mergeBackupData(local, newer, "2026-07-06").data.notes[0].body).toBe("remote");
    expect(core.mergeBackupData(local, newer, "2026-07-06").summary.updated).toBe(1);
    expect(core.mergeBackupData(local, older, "2026-07-06").data.notes[0].body).toBe("local");
  });

  it("carries a newer remote deletion as a tombstone", () => {
    const deleted = { notes: [{ id: "n1", title: "A", body: "local", updatedAt: "2026-05-04T00:00:00.000Z", deletedAt: "2026-05-04T00:00:00.000Z" }] };
    expect(core.mergeBackupData(local, deleted, "2026-07-06").data.notes[0].deletedAt).toBeTruthy();
  });

  it("does not merge two different notes that share a title", () => {
    const sameTitle = { notes: [{ id: "n2", title: "A", body: "other", updatedAt: "2026-05-02T00:00:00.000Z" }] };
    expect(core.mergeBackupData(local, sameTitle, "2026-07-06").data.notes).toHaveLength(2);
  });

  it("rejects a note whose id is not a safe record id", () => {
    const unsafe = { notes: [{ id: '"><img src=x onerror=alert(1)>', title: "x", body: "" }] };
    expect(() => core.mergeBackupData(local, unsafe, "2026-07-06")).toThrow();
    expect(() => core.parseBackupFile(JSON.stringify({ data: unsafe }))).toThrow();
  });

  it("accepts a backup that only contains notes", () => {
    expect(() => core.parseBackupFile(JSON.stringify({ data: local }))).not.toThrow();
  });
});

describe("note list helpers", () => {
  it("uses the typed title, then the first line of the body, then a placeholder", () => {
    expect(core.noteDisplayTitle({ title: " 직접 쓴 제목 ", body: "# 본문 제목" })).toBe("직접 쓴 제목");
    expect(core.noteDisplayTitle({ title: "", body: "---\n\n# 📒 한자 **암기** 노트\n\n내용" })).toBe("📒 한자 암기 노트");
    expect(core.noteDisplayTitle({ title: "", body: "  \n" })).toBe(core.UNTITLED_NOTE_TITLE);
  });

  it("builds a one-line preview without table rules or the repeated title", () => {
    const note = { title: "", body: "# 제목\n\n| 한자 | 훈음 |\n| :---: | :--- |\n| **捨** | 버릴 사 |" };
    expect(core.notePreview(note)).toBe("한자 훈음 · 捨 버릴 사");
  });

  it("truncates a long preview", () => {
    const preview = core.notePreview({ title: "t", body: "가".repeat(500) }, 20);
    expect(preview).toHaveLength(21);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("searches title and body, case-insensitively", () => {
    const notes = [
      { id: "1", title: "Kanji", body: "掃除", updatedAt: "2026-01-01" },
      { id: "2", title: "문법", body: "〜てしまう", updatedAt: "2026-01-02" }
    ];
    expect(core.visibleNotes(notes, "kanji").map(note => note.id)).toEqual(["1"]);
    expect(core.visibleNotes(notes, "しまう").map(note => note.id)).toEqual(["2"]);
    expect(core.visibleNotes(notes, "").map(note => note.id)).toEqual(["2", "1"]);
  });

  it("sorts pinned notes first, then most recently updated", () => {
    const notes = [
      { id: "old", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", updatedAt: "2026-03-01T00:00:00.000Z" },
      { id: "pinned", pinned: true, updatedAt: "2025-01-01T00:00:00.000Z" }
    ];
    expect(core.sortNotes(notes).map(note => note.id)).toEqual(["pinned", "new", "old"]);
    expect(notes.map(note => note.id)).toEqual(["old", "new", "pinned"]);
  });

  it("detects unsaved editor changes", () => {
    const note = { title: "제목", body: "본문" };
    expect(core.noteDraftIsDirty(note, { title: "제목 ", body: "본문" })).toBe(false);
    expect(core.noteDraftIsDirty(note, { title: "제목", body: "본문\n" })).toBe(true);
    expect(core.noteDraftIsDirty(null, { title: "", body: "  \n" })).toBe(false);
    expect(core.noteDraftIsDirty(null, { title: "", body: "x" })).toBe(true);
  });
});

describe("renderMarkdown", () => {
  it("renders tables, emphasis, lists and inline code", () => {
    const { html } = renderMarkdown("| 한자 | 훈음 |\n| :---: | :--- |\n| **捨** | 버릴 사 |\n\n* **`帚`** 짝꿍\n\n1. 첫째");
    expect(html).toContain('<div class="notebook-table-wrap"><table>');
    expect(html).toContain("<strong>捨</strong>");
    expect(html).toContain("<code>帚</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
  });

  it("escapes raw HTML instead of passing it through", () => {
    const { html } = renderMarkdown('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n**ok** <b onclick="x()">b</b>');
    expect(html).not.toMatch(/<img|<script|<b /i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>ok</strong>");
  });

  it("refuses javascript: links and opens real links in a new tab", () => {
    const { html } = renderMarkdown("[나쁜 링크](javascript:alert(1)) [사전](https://example.com/?q=1)");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).toContain('<a href="https://example.com/?q=1" target="_blank" rel="noopener noreferrer">사전</a>');
  });

  it("numbers headings and reports them for the table of contents", () => {
    const { html, headings } = renderMarkdown("# 제목 <x>\n\n### 1️⃣ [청소] **손**(扌)\n\n본문");
    expect(headings).toEqual([
      { id: "note-heading-1", level: 1, text: "제목 <x>" },
      { id: "note-heading-2", level: 3, text: "1️⃣ [청소] 손(扌)" }
    ]);
    expect(html).toContain('<h1 id="note-heading-1">');
    expect(html).toContain('<h3 id="note-heading-2">');
  });

  it("keeps single line breaks", () => {
    expect(renderMarkdown("첫 줄\n둘째 줄").html).toContain("<br>");
  });
});

describe("renderNotesPage", () => {
  const now = new Date(2026, 10, 16, 15, 0);
  const notes = [
    { id: "note-1", title: "한자 <b>노트</b>", body: "본문 & 내용", updatedAt: new Date(2026, 10, 16, 14, 20).toISOString() }
  ];

  it("lists each note with an escaped title, preview and date", () => {
    const patch = renderNotesPage({ view: "list", notes, total: 1, now, helpers });
    expect(patch.hidden).toMatchObject({ notesListView: false, notesReadView: true, notesEditView: true });
    expect(patch.text.notesCount).toBe("노트 1개");
    expect(patch.html.notesList).toContain('data-open-note="note-1"');
    expect(patch.html.notesList).toContain("한자 &lt;b&gt;노트&lt;/b&gt;");
    expect(patch.html.notesList).toContain("본문 &amp; 내용");
    expect(patch.html.notesList).toContain("오늘 14:20");
    expect(patch.html.notesList).not.toContain("<b>");
  });

  it("shows an invitation when there are no notes and a search message when filtered out", () => {
    expect(renderNotesPage({ view: "list", notes: [], total: 0, now, helpers }).html.notesList).toContain("노트로 남겨 보세요");
    const filtered = renderNotesPage({ view: "list", notes: [], total: 3, searchTerm: "<없음>", now, helpers });
    expect(filtered.html.notesList).toContain("&lt;없음&gt;");
    expect(filtered.text.notesCount).toBe("노트 0개 / 전체 3개");
  });

  it("shows the reader for an open note and falls back to the list without one", () => {
    const read = renderNotesPage({ view: "read", notes, total: 1, note: notes[0], rendered: { html: "<p>본문</p>" }, now, helpers });
    expect(read.hidden).toMatchObject({ notesListView: true, notesReadView: false, notesEditView: true, notesReadTitle: false });
    expect(read.text.notesReadTitle).toBe("한자 <b>노트</b>");
    expect(read.html.notesReadBody).toBe("<p>본문</p>");

    // A title derived from the body is not repeated above the body.
    const untitled = { ...notes[0], title: "", body: "# 본문 제목" };
    const derived = renderNotesPage({ view: "read", notes, total: 1, note: untitled, rendered: { html: "<h1>본문 제목</h1>" }, now, helpers });
    expect(derived.hidden.notesReadTitle).toBe(true);
    expect(derived.text.notesReadTitle).toBe("");

    const missing = renderNotesPage({ view: "read", notes, total: 1, note: null, now, helpers });
    expect(missing.hidden.notesListView).toBe(false);
  });

  it("never patches the editor's fields", () => {
    const patch = renderNotesPage({ view: "edit", notes, total: 1, now, helpers });
    expect(patch.hidden.notesEditView).toBe(false);
    const patchedIds = [...Object.keys(patch.html), ...Object.keys(patch.text), ...Object.keys(patch.value || {})];
    expect(patchedIds.filter(id => /noteTitleInput|noteBodyInput|notePreview/.test(id))).toEqual([]);
  });

  it("escapes a hostile note id in every attribute", () => {
    const hostile = [{ id: '"><img src=x onerror=alert(1)>', title: "t", body: "", updatedAt: now.toISOString() }];
    expect(renderNotesPage({ view: "list", notes: hostile, total: 1, now, helpers }).html.notesList).not.toContain("<img");
  });
});

describe("noteDateLabel", () => {
  const now = new Date(2026, 10, 16, 15, 0);

  it("labels today, yesterday, this year and earlier years", () => {
    expect(noteDateLabel(new Date(2026, 10, 16, 9, 5).toISOString(), now)).toBe("오늘 09:05");
    expect(noteDateLabel(new Date(2026, 10, 15, 23, 59).toISOString(), now)).toBe("어제");
    expect(noteDateLabel(new Date(2026, 10, 9, 12, 0).toISOString(), now)).toBe("11월 9일");
    expect(noteDateLabel(new Date(2025, 2, 2, 12, 0).toISOString(), now)).toBe("2025년 3월 2일");
    expect(noteDateLabel("", now)).toBe("");
    expect(noteDateLabel("not a date", now)).toBe("");
  });
});
