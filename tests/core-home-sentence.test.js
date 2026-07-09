import { describe, it, expect } from "vitest";
import { pickRandomSentence, sentenceHasCompleteRegistration } from "@nihongo-study/core";

function sentence(id, overrides = {}) {
  return { id, kind: "sentence", title: `문장 ${id}`, meaning: "뜻", studyDate: "2026-07-09", ...overrides };
}

function child(kind, sentenceId, registered) {
  return { id: `${kind}-${sentenceId}`, kind, registered, parentId: sentenceId, title: kind, meaning: "뜻" };
}

describe("sentenceHasCompleteRegistration", () => {
  it("is false when a sentence has no linked children", () => {
    expect(sentenceHasCompleteRegistration([sentence("s1")], "s1")).toBe(false);
  });

  it("is false when any linked child is unregistered", () => {
    const entries = [sentence("s1"), child("word", "s1", true), child("grammar", "s1", false)];
    expect(sentenceHasCompleteRegistration(entries, "s1")).toBe(false);
  });

  it("is true once every linked child is registered", () => {
    const entries = [sentence("s1"), child("word", "s1", true), child("grammar", "s1", true)];
    expect(sentenceHasCompleteRegistration(entries, "s1")).toBe(true);
  });
});

describe("pickRandomSentence", () => {
  it("returns null when there are no sentence entries", () => {
    expect(pickRandomSentence([], () => 0)).toBeNull();
  });

  it("ignores non-root sentences (with a parentId) and non-sentence kinds", () => {
    const entries = [
      sentence("s1"),
      { ...sentence("s2"), parentId: "s1" },
      { id: "w1", kind: "word", title: "단어" }
    ];
    const picked = pickRandomSentence(entries, () => 0);
    expect(picked.id).toBe("s1");
  });

  it("prefers sentences whose linked children are all registered", () => {
    const entries = [
      sentence("s1"),
      child("word", "s1", false),
      sentence("s2"),
      child("word", "s2", true)
    ];
    // random() => 0 would normally pick the first candidate in the pool;
    // since only s2 is registration-complete, it should always win.
    const picked = pickRandomSentence(entries, () => 0);
    expect(picked.id).toBe("s2");
  });

  it("falls back to any sentence when none are registration-complete", () => {
    const entries = [sentence("s1"), sentence("s2"), child("word", "s1", false)];
    const picked = pickRandomSentence(entries, () => 0.99);
    expect(["s1", "s2"]).toContain(picked.id);
  });

  it("excludes the current sentence on reroll, falling back to the full pool once the complete pool is exhausted", () => {
    // Only s1 is registration-complete; s2/s3/s4 have no linked children.
    // Excluding s1 (the currently shown sentence) should not return null or
    // s1 again - it should fall back to the other sentences instead.
    const entries = [
      sentence("s1"),
      child("word", "s1", true),
      sentence("s2"),
      sentence("s3"),
      sentence("s4")
    ];
    for (let i = 0; i < 10; i += 1) {
      const picked = pickRandomSentence(entries, () => i / 10, { excludeId: "s1" });
      expect(picked).not.toBeNull();
      expect(picked.id).not.toBe("s1");
      expect(["s2", "s3", "s4"]).toContain(picked.id);
    }
  });

  it("re-shows the same sentence when it is the only one in storage", () => {
    const entries = [sentence("s1")];
    const picked = pickRandomSentence(entries, () => 0, { excludeId: "s1" });
    expect(picked.id).toBe("s1");
  });
});
