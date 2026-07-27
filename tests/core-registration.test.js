import { describe, it, expect } from "vitest";
import * as core from "@nihongo-study/core";
import { badgeClassByKind, kindLabels, renderTodayPage } from "@nihongo-study/ui";

const { entryNeedsRegistration, hasUnregisteredEntries, unregisteredStudyDates } = core;

const unregisteredWord = { kind: "word", registered: false, studyDate: "2026-07-09" };
const registeredWord = { kind: "word", registered: true, studyDate: "2026-07-09" };
const unregisteredSentence = { kind: "sentence", registered: false, studyDate: "2026-07-10" };
const registeredSentence = { kind: "sentence", registered: true, studyDate: "2026-07-10" };

describe("entryNeedsRegistration", () => {
  it("is true for an unregistered word/grammar/expression entry", () => {
    expect(entryNeedsRegistration(unregisteredWord)).toBe(true);
    expect(entryNeedsRegistration({ kind: "grammar", registered: false })).toBe(true);
    expect(entryNeedsRegistration({ kind: "expression", registered: false })).toBe(true);
  });

  it("is false once registered", () => {
    expect(entryNeedsRegistration(registeredWord)).toBe(false);
  });

  // Registering a sentence entry creates a 문장 item on both adapters (D9 in
  // tests/storage-conformance.test.js) and the 전체 등록 button submits
  // sentences, so a sentence's `registered` flag is a real "needs action"
  // signal - it is not the permanently-false field it used to be.
  it("is true for an unregistered sentence entry (sentences ARE registerDailyEntries targets)", () => {
    expect(entryNeedsRegistration(unregisteredSentence)).toBe(true);
  });

  it("is false for a sentence that has already been registered", () => {
    expect(entryNeedsRegistration(registeredSentence)).toBe(false);
  });

  it("is false for kinds that are not daily entries at all, and for junk input", () => {
    expect(entryNeedsRegistration({ kind: "kanji", registered: false })).toBe(false);
    expect(entryNeedsRegistration({ kind: "source", registered: false })).toBe(false);
    expect(entryNeedsRegistration(undefined)).toBe(false);
    expect(entryNeedsRegistration({})).toBe(false);
  });
});

describe("hasUnregisteredEntries", () => {
  it("is true when at least one entry still needs registration", () => {
    expect(hasUnregisteredEntries([registeredWord, unregisteredWord])).toBe(true);
  });

  it("is true when the only unregistered entry is a sentence", () => {
    expect(hasUnregisteredEntries([registeredWord, unregisteredSentence])).toBe(true);
  });

  it("is false when every registerable entry - sentences included - is registered", () => {
    expect(hasUnregisteredEntries([registeredWord, registeredSentence])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasUnregisteredEntries([])).toBe(false);
  });
});

describe("unregisteredStudyDates", () => {
  it("collects the dates with a registerable-but-unregistered entry, sentences included", () => {
    const dates = unregisteredStudyDates([unregisteredWord, registeredWord, unregisteredSentence]);
    expect(dates.has("2026-07-09")).toBe(true);
    expect(dates.has("2026-07-10")).toBe(true);
    expect(dates.size).toBe(2);
  });

  it("does not flag a day whose sentence is registered even though its children came first", () => {
    const dates = unregisteredStudyDates([
      { kind: "word", registered: true, studyDate: "2026-07-10" },
      registeredSentence
    ]);
    expect(dates.size).toBe(0);
  });
});

// The 오늘 공부 sentence card's badge must agree with unregisteredStudyDates:
// anything that still flags the day in the calendar must read 등록 필요 on the
// card, or the user sees "전체 등록됨" on a day the calendar marks with `!`.
describe("sentence card 등록 badge (renderTodayPage)", () => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cardBadge({ sentenceRegistered, children }) {
    const sentence = {
      id: "s1",
      kind: "sentence",
      title: "こんにちは",
      reading: "こんにちは",
      meaning: "안녕",
      studyDate: "2026-07-10",
      registered: sentenceRegistered
    };
    const patch = renderTodayPage({
      selectedDate: "2026-07-10",
      sentenceEntries: [sentence],
      helpers: {
        badgeClassByKind,
        core,
        escapeHtml,
        highlight: escapeHtml,
        kindLabels,
        entryToCandidate: core.dailyEntryToCandidate,
        linkedEntriesForSentence: (kind, sentenceId) => core.linkedEntriesForSentence(children, kind, sentenceId)
      }
    });
    const html = patch.html.dailyEntryCards;
    return ["등록 필요", "전체 등록됨", "등록됨"].find(label => html.includes(`>${label}</span>`));
  }

  const unregisteredChild = { id: "w1", kind: "word", title: "水", reading: "みず", meaning: "물", parentId: "s1", registered: false };
  const registeredChild = { id: "w1", kind: "word", title: "水", reading: "みず", meaning: "물", parentId: "s1", registered: true };

  it("sentence unregistered + a child unregistered -> 등록 필요", () => {
    expect(cardBadge({ sentenceRegistered: false, children: [unregisteredChild] })).toBe("등록 필요");
  });

  // The case that used to lie: the children rollup said 전체 등록됨 while the
  // sentence was still a 전체 등록 target flagging its day in the calendar.
  it("sentence unregistered + every child registered -> still 등록 필요", () => {
    expect(cardBadge({ sentenceRegistered: false, children: [registeredChild] })).toBe("등록 필요");
  });

  it("sentence registered + a child unregistered -> 등록 필요", () => {
    expect(cardBadge({ sentenceRegistered: true, children: [unregisteredChild] })).toBe("등록 필요");
  });

  it("sentence registered + every child registered -> 전체 등록됨", () => {
    expect(cardBadge({ sentenceRegistered: true, children: [registeredChild] })).toBe("전체 등록됨");
  });

  it("a childless sentence reads 등록 필요 until it is registered, then 등록됨", () => {
    expect(cardBadge({ sentenceRegistered: false, children: [] })).toBe("등록 필요");
    expect(cardBadge({ sentenceRegistered: true, children: [] })).toBe("등록됨");
  });
});
