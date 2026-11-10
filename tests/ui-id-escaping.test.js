// Regression guard for the record-id XSS class: record ids are foreign input
// (backup import / Supabase sync both persist them verbatim), the UI drops
// them straight into HTML attributes, and every page patch reaches the DOM via
// innerHTML (packages/ui/dom/applyPagePatch.js). An id like
// `x" autofocus onfocus="alert(1)` used to close its own attribute and add
// real ones.
//
// Rather than string-matching the escaped output (which is easy to write
// vacuously - the escaped form still *contains* the text `onfocus=`), these
// tests scan the rendered markup for attributes that exist in tag context and
// assert none of them are event handlers or `autofocus`. The
// "(sanity)" test below proves the scanner actually catches the bug.
import { describe, it, expect } from "vitest";
import {
  badgeClassByKind,
  kindLabels,
  renderKanjiPage,
  renderLearnedSectionsPage,
  renderReviewPage,
  renderTasksPage,
  renderTodayPage,
  noteCard,
  renderWordsPage
} from "@nihongo-study/ui";
import * as core from "@nihongo-study/core";

const HOSTILE_ID = `x" autofocus onfocus="alert(1)`;

// Byte-identical to the escapeHtml the real app threads through `helpers`
// (apps/web/src/templates.js).
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Mirrors apps/web's renderHelpers() / apps/desktop's renderHelpers().
function helpers(extra = {}) {
  return {
    badgeClassByKind,
    core,
    escapeHtml,
    highlight: escapeHtml,
    kindLabels,
    reviewStatusText: core.reviewStatusText,
    reviewQueueReview: item => core.reviewQueueReview(item),
    reviewQueueStatusText: item => core.reviewQueueStatusText({ item }),
    ...extra
  };
}

// Walks the markup and collects attribute names that appear in *tag* context,
// skipping everything inside a quoted attribute value. That distinction is the
// whole point: an escaped id sits harmlessly inside a quoted value, while an
// unescaped one becomes a set of new attributes.
function attributeNames(html) {
  const names = new Set();
  let index = 0;
  while (index < html.length) {
    if (html[index] !== "<") {
      index += 1;
      continue;
    }
    index += 1;
    while (index < html.length && !/[\s>/]/.test(html[index])) {
      index += 1;
    }
    while (index < html.length && html[index] !== ">") {
      if (/[\s/]/.test(html[index])) {
        index += 1;
        continue;
      }
      let name = "";
      while (index < html.length && !/[\s=>/]/.test(html[index])) {
        name += html[index];
        index += 1;
      }
      if (name) {
        names.add(name.toLowerCase());
      }
      while (index < html.length && /\s/.test(html[index])) {
        index += 1;
      }
      if (html[index] !== "=") {
        continue;
      }
      index += 1;
      while (index < html.length && /\s/.test(html[index])) {
        index += 1;
      }
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        while (index < html.length && html[index] !== quote) {
          index += 1;
        }
        index += 1;
      } else {
        while (index < html.length && !/[\s>]/.test(html[index])) {
          index += 1;
        }
      }
    }
    index += 1;
  }
  return names;
}

function injectedAttributes(html) {
  return [...attributeNames(html)]
    .filter(name => name.startsWith("on") || name === "autofocus")
    .sort();
}

function hostileWord(overrides = {}) {
  return {
    id: HOSTILE_ID,
    kind: "word",
    title: "水",
    reading: "みず",
    meaning: "물",
    review: "오늘",
    sourceSentences: [{ id: HOSTILE_ID, title: "문장", studyDate: HOSTILE_ID }],
    ...overrides
  };
}

function patchHtml(patch) {
  return Object.values(patch.html || {}).join("");
}

describe("record ids rendered into HTML attributes", () => {
  it("(sanity) the scanner catches an id that is interpolated unescaped", () => {
    const vulnerable = `<article class="study-card" data-item-id="${HOSTILE_ID}">x</article>`;
    expect(injectedAttributes(vulnerable)).toEqual(["autofocus", "onfocus"]);
  });

  it("noteCard with showKind does not let an id break out of its attributes", () => {
    const html = noteCard(hostileWord(), ["대기", "오늘"], helpers(), { showKind: true });
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    expect(html).toContain(`data-item-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-delete-item="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-review-select="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("noteCard also escapes an unknown `kind` (which falls through kindLabels)", () => {
    const html = noteCard(hostileWord({ kind: `<img src=x onerror="alert(1)">` }), ["대기"], helpers(), { showKind: true });
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain("<img");
  });

  it("noteCard shows the kind badge and review select only as configured", () => {
    const withKind = noteCard(hostileWord({ id: "w1" }), ["대기", "오늘"], helpers(), { showKind: true });
    expect(withKind).toContain("badge");
    expect(withKind).toContain("review-select-sm");
    const noReview = noteCard(hostileWord({ id: "w1", review: undefined }), ["대기"], helpers(), { showKind: true });
    expect(noReview).not.toContain("data-review-select");
    const tab = noteCard(hostileWord({ id: "g1", kind: "grammar", review: undefined }), ["대기"], helpers());
    expect(tab).not.toContain('class="badge');
    expect(tab).toContain("data-review-select");
    expect(tab).not.toContain("note-card-footer");
  });

  it("noteCard hides a note that merely repeats the title/reading/meaning", () => {
    const sentence = { id: "s1", kind: "sentence", title: "水を飲む", reading: "みずをのむ", meaning: "물을 마신다", sourceSentences: [] };
    const html = noteCard({ ...sentence, note: "水を飲む みずをのむ 물을 마신다" }, [], helpers(), { showKind: true });
    expect(html).not.toContain("note-card-note");
  });

  it("noteCard escapes the sourceSentences ids it renders as jump links", () => {
    const html = noteCard(hostileWord({ kind: "grammar" }), ["대기"], helpers(), { showKind: true });
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).toContain(`data-jump-sentence="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-source-date="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("noteCard does not let an id break out of its attributes and links sources on any kind", () => {
    const html = noteCard(hostileWord({ kind: "expression" }), ["대기", "오늘"], helpers());
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    expect(html).toContain(`data-edit-item="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-delete-item="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-review-select="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-jump-sentence="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("noteCard hides a note that only repeats the meaning or the raw input line", () => {
    const base = { id: "g1", kind: "grammar", title: "〜てしまう", meaning: "동작의 완료를 나타낸다", sourceSentences: [] };
    const raw = noteCard({ ...base, note: "`〜てしまう` 동작의 완료를 나타낸다" }, ["대기"], helpers());
    expect(raw).not.toContain("note-card-note");
    expect(raw).not.toContain("note-card-source");
    const same = noteCard({ ...base, note: "동작의 완료를 나타낸다" }, ["대기"], helpers());
    expect(same).not.toContain("note-card-note");
    const real = noteCard({ ...base, note: "회화체에서는 ちゃう" }, ["대기"], helpers());
    expect(real).toContain("note-card-note");
  });

  it("renderWordsPage does not let an id break out of its attributes", () => {
    const html = patchHtml(renderWordsPage({ rows: [hostileWord()], helpers: helpers() }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    expect(html).toContain(`data-item-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-review-select="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("renderKanjiPage does not let an id break out of its attributes", () => {
    const words = [1, 2, 3, 4].map(n => hostileWord({ id: `w${n}`, title: `雨${n}` }));
    const html = patchHtml(renderKanjiPage({
      kanji: [hostileWord({ kind: "kanji", title: `雨" onclick="x` })],
      reviewOptions: ["대기", "오늘"],
      wordsFor: () => words,
      helpers: helpers()
    }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    expect(html).toContain(`data-item-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-edit-item="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-delete-item="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-review-select="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-show-kanji-words="${escapeHtml('雨" onclick="x')}"`);
  });

  it("renderKanjiPage shows linked words, caps them at 3 and hides the auto source note", () => {
    const item = { id: "k1", kind: "kanji", title: "雨", meaning: "", reading: "", note: "雨 (あめ)", review: "대기" };
    const words = [
      { id: "w1", title: "雨", reading: "あめ", meaning: "비" },
      { id: "w2", title: "大雨", reading: "おおあめ", meaning: "큰비" },
      { id: "w3", title: "雨天", reading: "うてん", meaning: "우천" },
      { id: "w4", title: "梅雨", reading: "つゆ", meaning: "장마" }
    ];
    const html = patchHtml(renderKanjiPage({ kanji: [item], reviewOptions: ["대기"], wordsFor: () => words, helpers: helpers() }));
    expect(html).toContain("쓰인 단어");
    expect(html.match(/class="kanji-word"/g)).toHaveLength(3);
    expect(html).toContain("단어 4개 모두 보기");
    expect(html).toContain("뜻·읽기 추가");
    expect(html).not.toContain("kanji-memo");
    const bare = patchHtml(renderKanjiPage({
      kanji: [{ ...item, meaning: "비 우", note: "내 메모" }],
      wordsFor: () => [],
      helpers: helpers()
    }));
    expect(bare).not.toContain("쓰인 단어");
    expect(bare).not.toContain("뜻·읽기 추가");
    expect(bare).toContain("내 메모");
  });

  it("renderKanjiPage shows the given empty message", () => {
    const html = patchHtml(renderKanjiPage({ kanji: [], emptyMessage: "조건에 맞는 한자가 없습니다.", helpers: helpers() }));
    expect(html).toContain("조건에 맞는 한자가 없습니다.");
  });

  it("renderReviewPage does not let an id break out of its attributes", () => {
    const html = patchHtml(renderReviewPage({ reviewItems: [hostileWord()], helpers: helpers() }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).toContain(`data-cycle-review-queue="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("renderTasksPage does not let a task id break out of its attributes", () => {
    const html = patchHtml(renderTasksPage({
      tasks: [{ id: HOSTILE_ID, title: "할 일", note: "메모", tag: "일반", done: false }],
      helpers: helpers()
    }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).toContain(`data-task-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-toggle-task="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("renderTodayPage does not let a daily entry id break out of its attributes", () => {
    const sentence = { id: HOSTILE_ID, kind: "sentence", title: "こんにちは", reading: "", meaning: "안녕" };
    const child = { id: `${HOSTILE_ID}-child`, kind: "word", title: "水", reading: "みず", meaning: "물", parentId: HOSTILE_ID };
    const html = patchHtml(renderTodayPage({
      selectedDate: "2026-07-25",
      sentenceEntries: [sentence],
      helpers: helpers({
        entryToCandidate: core.dailyEntryToCandidate,
        linkedEntriesForSentence: (kind, sentenceId) => core.linkedEntriesForSentence([child], kind, sentenceId)
      })
    }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).toContain(`id="daily-entry-${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-daily-entry-id="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("renderLearnedSectionsPage does not let a daily entry id break out of its attributes", () => {
    const entry = {
      id: HOSTILE_ID,
      kind: "word",
      title: "水",
      reading: "みず",
      meaning: "물",
      parentId: HOSTILE_ID,
      parentTitle: "문장"
    };
    const html = patchHtml(renderLearnedSectionsPage({
      entriesByKind: { word: [entry], grammar: [], expression: [] },
      helpers: helpers()
    }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).toContain(`data-daily-entry-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-jump-sentence="${escapeHtml(HOSTILE_ID)}"`);
  });
});
