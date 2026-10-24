import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createIdbStorage, isPristine } from "@nihongo-study/storage-idb";
import { createSampleState } from "../apps/web/src/sampleState.js";
import { runDesktopMigration } from "../apps/web/src/desktopMigration.js";

const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/legacy-desktop.expected.json"), "utf8"));
const TODAY = "2026-07-06";
const BAD_ID = "bad id\"><x";

let dbName;
beforeEach(() => {
  dbName = `desktop-migration-${Math.random().toString(16).slice(2)}`;
});

function openStore() {
  return createIdbStorage({ dbName, seedState: () => createSampleState(() => TODAY) });
}

function fakeDoc() {
  const element = () => {
    const el = {
      style: {},
      children: [],
      attrs: {},
      listeners: {},
      setAttribute(name, value) { el.attrs[name] = value; },
      addEventListener(name, fn) { el.listeners[name] = fn; },
      append(...nodes) { el.children.push(...nodes); },
      remove() { el.removed = true; }
    };
    return el;
  };
  const appRoot = { inertHistory: [], _inert: false };
  Object.defineProperty(appRoot, "inert", {
    get() { return this._inert; },
    set(value) { this._inert = value; this.inertHistory.push(value); }
  });
  const body = { children: [], appendChild(node) { body.children.push(node); } };
  return {
    body,
    appRoot,
    getElementById: id => (id === "app" ? appRoot : body.children.find(node => node.id === id && !node.removed) || null),
    createElement: element,
    notices: () => body.children.filter(node => !node.removed),
    text: node => node.children.map(child => child.textContent ?? "").join("")
  };
}

function bridgeWith(pending, overrides = {}) {
  return {
    platform: "electron",
    migration: {
      getPending: vi.fn(async () => pending),
      complete: vi.fn(async () => ({ ok: true })),
      fail: vi.fn(async () => ({ ok: true })),
      ...overrides
    }
  };
}

const pendingFixture = () => ({ data: structuredClone(expected.data), counts: { ...expected.counts } });

async function countsOf(store) {
  const { data } = await store.exportData();
  return Object.fromEntries(["studyDays", "dailyEntries", "dailyEntryLinks", "tasks", "items"].map(key => [key, data[key].length]));
}

// importFullBackup() always makes sure the selected date (today) has a study
// day, so studyDays may be one more than the legacy count when the legacy data
// has no row for today.
async function expectLegacyCounts(store) {
  const counts = await countsOf(store);
  expect({ ...counts, studyDays: undefined }).toEqual({ ...expected.counts, studyDays: undefined });
  expect(counts.studyDays).toBeGreaterThanOrEqual(expected.counts.studyDays);
  expect(counts.studyDays).toBeLessThanOrEqual(expected.counts.studyDays + 1);
}

describe("runDesktopMigration", () => {
  it("is a no-op without a bridge, without migration support, or with nothing pending", async () => {
    const store = openStore();
    await store.initDatabase();
    const before = await countsOf(store);
    const doc = fakeDoc();

    expect(await runDesktopMigration({ bridge: undefined, store, today: TODAY, doc })).toEqual({ status: "skipped" });
    expect(await runDesktopMigration({ bridge: { platform: "electron" }, store, today: TODAY, doc })).toEqual({ status: "skipped" });
    const bridge = bridgeWith(null);
    expect(await runDesktopMigration({ bridge, store, today: TODAY, doc })).toEqual({ status: "skipped" });
    expect(bridge.migration.complete).not.toHaveBeenCalled();
    expect(bridge.migration.fail).not.toHaveBeenCalled();
    expect(doc.notices()).toEqual([]);
    expect(await countsOf(store)).toEqual(before);
  });

  it("replaces a fresh (just seeded) IndexedDB with the legacy data and shows a success notice", async () => {
    const store = openStore();
    await store.initDatabase();
    expect((await store.exportData()).data.dailyEntries.map(entry => entry.id)).toEqual(["sentence-onboarding"]);
    const doc = fakeDoc();
    const bridge = bridgeWith(pendingFixture());

    const result = await runDesktopMigration({ bridge, store, today: TODAY, doc });

    expect(result).toEqual({ status: "imported", counts: expected.counts });
    await expectLegacyCounts(store);
    const { data } = await store.exportData();
    expect(data.dailyEntries.some(entry => entry.id === "sentence-onboarding")).toBe(false); // sample gone
    expect(data.items.map(item => item.id).sort()).toEqual(expected.data.items.map(item => item.id).sort());
    expect(data.items.some(item => item.title === "勉強")).toBe(true);
    expect(bridge.migration.complete).toHaveBeenCalledWith(expected.counts);
    expect(bridge.migration.fail).not.toHaveBeenCalled();

    const notices = doc.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0].attrs.role).toBe("status");
    expect(doc.text(notices[0])).toContain(`학습일 ${expected.counts.studyDays}`);
    // The UI was locked during the import and unlocked afterwards.
    expect(doc.appRoot.inertHistory).toEqual([true, false]);
  });

  it("treats a completely empty IndexedDB as fresh", async () => {
    const store = createIdbStorage({ dbName }); // no seed
    await store.initDatabase();
    const result = await runDesktopMigration({ bridge: bridgeWith(pendingFixture()), store, today: TODAY, doc: fakeDoc() });
    expect(result.status).toBe("imported");
    await expectLegacyCounts(store);
  });

  it("merges into an IndexedDB that already has user data instead of replacing it", async () => {
    const store = openStore();
    await store.initDatabase();
    await store.addTask({ id: "mine-1", title: "내 할 일", note: "", tag: "", studyDate: TODAY });
    expect(await isPristine(store)).toBe(false);
    const before = await store.exportData();
    const doc = fakeDoc();
    const bridge = bridgeWith(pendingFixture());

    const result = await runDesktopMigration({ bridge, store, today: TODAY, doc });

    expect(result.status).toBe("merged");
    const after = (await store.exportData()).data;
    // Legacy rows arrived...
    expect(after.items.some(item => item.id === "item-word-1")).toBe(true);
    expect(after.tasks.some(task => task.id === "task-1")).toBe(true);
    // ...and everything that was there before is still there.
    before.data.items.forEach(item => expect(after.items.some(row => row.title === item.title && row.kind === item.kind)).toBe(true));
    expect(after.tasks.some(task => task.id === "mine-1")).toBe(true);
    expect(bridge.migration.complete).toHaveBeenCalledWith(expected.counts);
    expect(doc.notices()[0].attrs.role).toBe("status");
  });

  it("reports failures: fail() is called, an error notice is shown, and nothing throws", async () => {
    const store = openStore();
    await store.initDatabase();
    const doc = fakeDoc();
    const bridge = bridgeWith(pendingFixture());
    vi.spyOn(store, "importFullBackup").mockRejectedValue(new Error("quota exceeded"));

    const result = await runDesktopMigration({ bridge, store, today: TODAY, doc });

    expect(result).toMatchObject({ status: "failed", error: "quota exceeded" });
    expect(bridge.migration.fail).toHaveBeenCalledWith("quota exceeded");
    expect(bridge.migration.complete).not.toHaveBeenCalled();
    const [notice] = doc.notices();
    expect(notice.attrs.role).toBe("alert");
    expect(doc.text(notice)).toContain("다음 실행");
    expect(doc.appRoot.inertHistory.at(-1)).toBe(false);
  });

  it("rejects unsafe ids from a merge before touching the store", async () => {
    const store = openStore();
    await store.initDatabase();
    await store.addTask({ id: "mine-1", title: "x", studyDate: TODAY });
    const before = await countsOf(store);
    const bad = pendingFixture();
    bad.data.items[0].id = BAD_ID;
    const bridge = bridgeWith(bad);

    const result = await runDesktopMigration({ bridge, store, today: TODAY, doc: fakeDoc() });

    expect(result.status).toBe("failed");
    expect(bridge.migration.fail).toHaveBeenCalled();
    expect(await countsOf(store)).toEqual(before);
  });

  it("surfaces a main-process read error and tells main to retry later", async () => {
    const store = openStore();
    await store.initDatabase();
    const doc = fakeDoc();
    const bridge = bridgeWith({ error: "Could not read legacy database: corrupt", data: null, counts: null });
    const result = await runDesktopMigration({ bridge, store, today: TODAY, doc });
    expect(result.status).toBe("failed");
    expect(bridge.migration.fail).toHaveBeenCalledWith("Could not read legacy database: corrupt");
    expect(doc.notices()[0].attrs.role).toBe("alert");
  });

  it("fails (and notifies) when main rejects the completion", async () => {
    const store = openStore();
    await store.initDatabase();
    const bridge = bridgeWith(pendingFixture(), { complete: vi.fn(async () => ({ ok: false, error: "counts mismatch" })) });
    const doc = fakeDoc();
    const result = await runDesktopMigration({ bridge, store, today: TODAY, doc });
    expect(result).toMatchObject({ status: "failed", error: "counts mismatch" });
    expect(doc.notices()[0].attrs.role).toBe("alert");
  });

  it("does not throw when getPending itself rejects", async () => {
    const store = openStore();
    await store.initDatabase();
    const bridge = bridgeWith(null, { getPending: vi.fn(async () => { throw new Error("ipc down"); }) });
    const doc = fakeDoc();
    expect((await runDesktopMigration({ bridge, store, today: TODAY, doc })).status).toBe("failed");
    expect(doc.notices()).toHaveLength(1);
  });
});
