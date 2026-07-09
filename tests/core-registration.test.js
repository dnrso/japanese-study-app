import { describe, it, expect } from "vitest";
import { entryNeedsRegistration, hasUnregisteredEntries, unregisteredStudyDates } from "@nihongo-study/core";

const unregisteredWord = { kind: "word", registered: false, studyDate: "2026-07-09" };
const registeredWord = { kind: "word", registered: true, studyDate: "2026-07-09" };
const unregisteredSentence = { kind: "sentence", registered: false, studyDate: "2026-07-10" };

describe("entryNeedsRegistration", () => {
  it("is true for an unregistered word/grammar/expression entry", () => {
    expect(entryNeedsRegistration(unregisteredWord)).toBe(true);
    expect(entryNeedsRegistration({ kind: "grammar", registered: false })).toBe(true);
    expect(entryNeedsRegistration({ kind: "expression", registered: false })).toBe(true);
  });

  it("is false once registered", () => {
    expect(entryNeedsRegistration(registeredWord)).toBe(false);
  });

  it("is false for sentence entries regardless of registered flag (sentences are never registerDailyEntries targets)", () => {
    expect(entryNeedsRegistration(unregisteredSentence)).toBe(false);
    expect(entryNeedsRegistration({ kind: "sentence", registered: true })).toBe(false);
  });
});

describe("hasUnregisteredEntries", () => {
  it("is true when at least one entry still needs registration", () => {
    expect(hasUnregisteredEntries([registeredWord, unregisteredWord])).toBe(true);
  });

  it("is false when every registerable entry is registered", () => {
    expect(hasUnregisteredEntries([registeredWord, unregisteredSentence])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasUnregisteredEntries([])).toBe(false);
  });
});

describe("unregisteredStudyDates", () => {
  it("collects only the dates with a registerable-but-unregistered entry", () => {
    const dates = unregisteredStudyDates([unregisteredWord, registeredWord, unregisteredSentence]);
    expect(dates.has("2026-07-09")).toBe(true);
    expect(dates.has("2026-07-10")).toBe(false);
    expect(dates.size).toBe(1);
  });
});
