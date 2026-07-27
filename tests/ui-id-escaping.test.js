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
  renderWordsPage,
  studyCard
} from "@nihongo-study/ui";
import * as core from "@nihongo-study/core";

const HOSTILE_ID = `x" autofocus onfocus="alert(1)`;

// Byte-identical to the escapeHtml the real apps thread through `helpers`
// (apps/web/src/templates.js, apps/desktop/src/renderer/domUtils.js).
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

  it("studyCard does not let an id break out of its attributes", () => {
    const html = studyCard(hostileWord(), helpers());
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    // Still round-trips for the click handlers, just escaped.
    expect(html).toContain(`data-item-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-delete-item="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("studyCard also escapes an unknown `kind` (which falls through kindLabels)", () => {
    const html = studyCard(hostileWord({ kind: `<img src=x onerror="alert(1)">` }), helpers());
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain("<img");
  });

  it("studyCard escapes the sourceSentences ids it renders as jump links", () => {
    const html = studyCard(hostileWord({ kind: "grammar" }), helpers());
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).toContain(`data-jump-sentence="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-source-date="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("renderWordsPage does not let an id break out of its attributes", () => {
    const html = patchHtml(renderWordsPage({ rows: [hostileWord()], helpers: helpers() }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    expect(html).toContain(`data-item-id="${escapeHtml(HOSTILE_ID)}"`);
    expect(html).toContain(`data-cycle-review="${escapeHtml(HOSTILE_ID)}"`);
  });

  it("renderKanjiPage does not let an id break out of its attributes", () => {
    const html = patchHtml(renderKanjiPage({
      kanji: [hostileWord({ kind: "kanji", title: "水" })],
      helpers: helpers()
    }));
    expect(injectedAttributes(html)).toEqual([]);
    expect(html).not.toContain(HOSTILE_ID);
    expect(html).toContain(`data-item-id="${escapeHtml(HOSTILE_ID)}"`);
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
