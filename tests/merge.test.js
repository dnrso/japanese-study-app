// Ported from scratchpad merge-lww-test.mjs.
// The scratchpad script originally replicated the merge logic inline because
// main.js was a monolith with browser-only top-level imports. Merge logic now
// lives dependency-free in packages/core, so we import the real module
// directly instead of re-implementing it.
import { describe, it, expect } from "vitest";
import { isSafeRecordId, mergeBackupData, parseBackupFile, unsafeRecordIds } from "../packages/core/src/index.js";

describe("mergeBackupData (LWW merge)", () => {
  it("(a) newer local tombstone survives over older remote live copy", () => {
    const local = {
      items: [
        { id: "item-1", kind: "word", title: "물", reading: "", meaning: "water", deletedAt: "2026-07-06T10:00:00.000Z", updatedAt: "2026-07-06T10:00:00.000Z" }
      ]
    };
    const remote = {
      items: [
        { id: "item-1", kind: "word", title: "물", reading: "", meaning: "water", deletedAt: null, updatedAt: "2026-07-05T09:00:00.000Z" }
      ]
    };
    const result = mergeBackupData(local, remote);
    const merged = result.data.items.find(item => item.id === "item-1");
    expect(merged?.deletedAt).toBe("2026-07-06T10:00:00.000Z");
  });

  it("(b) newer remote live edit survives over older local tombstone", () => {
    const local = {
      items: [
        { id: "item-2", kind: "word", title: "불", reading: "", meaning: "fire", deletedAt: "2026-07-05T09:00:00.000Z", updatedAt: "2026-07-05T09:00:00.000Z" }
      ]
    };
    const remote = {
      items: [
        { id: "item-2", kind: "word", title: "불", reading: "", meaning: "fire (edited)", deletedAt: null, updatedAt: "2026-07-06T12:00:00.000Z" }
      ]
    };
    const result = mergeBackupData(local, remote);
    const merged = result.data.items.find(item => item.id === "item-2");
    expect(merged?.deletedAt).toBeFalsy();
    expect(merged?.meaning).toBe("fire (edited)");
  });

  it("(c) one-sided records preserved from both local-only and remote-only sets", () => {
    const local = {
      items: [
        { id: "only-local", kind: "word", title: "산", reading: "", meaning: "mountain", updatedAt: "2026-07-01T00:00:00.000Z" }
      ]
    };
    const remote = {
      items: [
        { id: "only-remote", kind: "word", title: "강", reading: "", meaning: "river", updatedAt: "2026-07-01T00:00:00.000Z" }
      ]
    };
    const result = mergeBackupData(local, remote);
    expect(result.data.items.some(item => item.id === "only-local")).toBe(true);
    expect(result.data.items.some(item => item.id === "only-remote")).toBe(true);
  });

  it("(c) one-sided local tombstone preserved when remote never had the record", () => {
    const localTombstoneOnly = {
      items: [
        { id: "local-tombstone-only", kind: "word", title: "돌", reading: "", meaning: "stone", deletedAt: "2026-07-06T00:00:00.000Z", updatedAt: "2026-07-06T00:00:00.000Z" }
      ]
    };
    const remoteEmpty = { items: [] };
    const result = mergeBackupData(localTombstoneOnly, remoteEmpty);
    expect(
      result.data.items.some(item => item.id === "local-tombstone-only" && item.deletedAt)
    ).toBe(true);
  });

  it("(d) merging legacy records without updatedAt does not throw, tie keeps current/local side", () => {
    const local = {
      items: [
        { id: "legacy-1", kind: "word", title: "나무", reading: "", meaning: "tree (local, no updatedAt)" }
      ]
    };
    const remote = {
      items: [
        { id: "legacy-1", kind: "word", title: "나무", reading: "", meaning: "tree (remote, no updatedAt)" }
      ]
    };
    let result;
    expect(() => {
      result = mergeBackupData(local, remote);
    }).not.toThrow();
    const merged = result.data.items.find(item => item.id === "legacy-1");
    expect(merged?.meaning).toBe("tree (local, no updatedAt)");
  });

  it("(extra) daily entry content-key collision: newer local tombstone wins, no duplicate row created", () => {
    const local = {
      allDailyEntries: [
        { id: "local-entry-1", studyDate: "2026-07-01", kind: "sentence", title: "こんにちは", reading: "", meaning: "hello", parentId: "", deletedAt: "2026-07-06T08:00:00.000Z", updatedAt: "2026-07-06T08:00:00.000Z" }
      ]
    };
    const remote = {
      allDailyEntries: [
        { id: "remote-entry-1", studyDate: "2026-07-01", kind: "sentence", title: "こんにちは", reading: "", meaning: "hello", parentId: "", deletedAt: null, updatedAt: "2026-07-05T08:00:00.000Z" }
      ]
    };
    const result = mergeBackupData(local, remote);
    const merged = result.data.dailyEntries.find(entry => entry.studyDate === "2026-07-01" && entry.title === "こんにちは");
    expect(result.data.dailyEntries.length).toBe(1);
    expect(merged?.deletedAt).toBeTruthy();
  });
});

// Defense in depth for the record-id XSS class (see tests/ui-id-escaping.test.js
// for the render-side half): ids from a backup file or a pulled sync snapshot
// are foreign input and were previously persisted verbatim.
describe("record id validation on import", () => {
  const HOSTILE_ID = `x" autofocus onfocus="alert(1)`;

  it("accepts every id shape the app actually generates", () => {
    [
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",           // crypto.randomUUID()
      "word-3f2504e0-4f89-11d3-9a0c-0305e82c3301",      // apps/web nextId()
      "1721890000000-3f4a5b",                            // randomUUID-less fallback
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301::9a0c0305", // dailyEntryLinks id
      "item-1",                                          // repo fixtures / legacy rows
      "w1",
      "s5",
      "legacy_entry.1"
    ].forEach(id => expect(isSafeRecordId(id)).toBe(true));
  });

  it("rejects ids carrying characters that could escape an HTML attribute", () => {
    [HOSTILE_ID, `a'b`, "a<b", "a>b", "a&b", "a b", "a\nb", ""].forEach(id =>
      expect(isSafeRecordId(id)).toBe(false)
    );
  });

  it("finds unsafe ids in every id-bearing field, including nested references", () => {
    expect(unsafeRecordIds({
      items: [{ id: "item-1", sourceSentences: [{ id: HOSTILE_ID }] }],
      allDailyEntries: [{ id: "entry-1", parentId: `bad"1` }],
      dailyEntryLinks: [{ id: "link-1", entryId: "entry-1", sentence_id: `bad"2` }],
      tasks: [{ id: "task-1" }]
    }).sort()).toEqual([HOSTILE_ID, `bad"1`, `bad"2`].sort());
  });

  it("parseBackupFile rejects a backup file containing an unsafe id", () => {
    const text = JSON.stringify({ data: { items: [{ id: HOSTILE_ID, kind: "word", title: "水" }] } });
    expect(() => parseBackupFile(text)).toThrow(/사용할 수 없는 문자/);
  });

  it("parseBackupFile still accepts a well-formed backup", () => {
    const text = JSON.stringify({ data: { items: [{ id: "word-1", kind: "word", title: "水" }] } });
    expect(() => parseBackupFile(text)).not.toThrow();
  });

  it("mergeBackupData rejects the imported side (this is the Supabase sync path)", () => {
    expect(() => mergeBackupData(
      { items: [] },
      { items: [{ id: HOSTILE_ID, kind: "word", title: "水" }] }
    )).toThrow(/사용할 수 없는 문자/);
  });

  it("mergeBackupData leaves already-stored local rows alone so one bad legacy row cannot wedge sync", () => {
    expect(() => mergeBackupData(
      { items: [{ id: HOSTILE_ID, kind: "word", title: "水" }] },
      { items: [{ id: "word-1", kind: "word", title: "火" }] }
    )).not.toThrow();
  });
});
