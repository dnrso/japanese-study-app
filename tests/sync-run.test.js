// Drives runSnapshotSync() (the pull-merge-push sequence behind syncNow) against
// the storage adapter with fake pull/push functions. The point is the
// ordering guarantee: local rows are read AFTER the pull finishes, inside the
// storage transaction, so a write made while the pull was in flight survives.
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import { mergeBackupData } from "../packages/core/src/index.js";
import { runSnapshotSync } from "../packages/sync/src/syncRun.js";

const mergeSnapshots = (local, remote) => mergeBackupData(local, remote);

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deferred() {
  let resolve;
  const promise = new Promise(next => {
    resolve = next;
  });
  return { promise, resolve };
}

function item(fields) {
  return { kind: "word", reading: "", ...fields };
}

const adapters = [
  {
    name: "storage-idb",
    async create() {
      const store = createIdbStorage({ dbName: unique("sync-run-idb") });
      await store.initDatabase();
      return store;
    }
  }
];

for (const adapter of adapters) {
  describe(`runSnapshotSync: ${adapter.name}`, () => {
    it("merges a local write made while the pull was in flight instead of overwriting it", async () => {
      const store = await adapter.create();
      await store.upsertItem(item({ id: "item-a", title: "あ", meaning: "A" }));

      const pulling = deferred();
      const pull = vi.fn(() => pulling.promise);
      const push = vi.fn().mockResolvedValue(undefined);
      const running = runSnapshotSync({ storage: store, mergeSnapshots, pull, push });

      await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
      await store.upsertItem(item({ id: "local-new", title: "新", meaning: "new" }));
      pulling.resolve({
        snapshot: {
          items: [item({ id: "remote-r", title: "ア", meaning: "R", updatedAt: "2999-01-01T00:00:00.000Z" })]
        }
      });

      const result = await running;

      expect(result.skipped).toBe(false);
      const ids = items => items.map(row => row.id);
      expect(ids((await store.getState()).items)).toEqual(expect.arrayContaining(["item-a", "local-new", "remote-r"]));
      expect(ids(result.state.items)).toEqual(expect.arrayContaining(["item-a", "local-new", "remote-r"]));
      expect(push).toHaveBeenCalledTimes(1);
      expect(ids(push.mock.calls[0][0].items)).toEqual(expect.arrayContaining(["item-a", "local-new", "remote-r"]));
    });

    it("pushes a write made during the pull when the server has no snapshot yet", async () => {
      const store = await adapter.create();

      const pulling = deferred();
      const pull = vi.fn(() => pulling.promise);
      const push = vi.fn().mockResolvedValue(undefined);
      const running = runSnapshotSync({ storage: store, mergeSnapshots, pull, push });

      await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
      await store.upsertItem(item({ id: "mid-pull", title: "中", meaning: "mid" }));
      pulling.resolve(null);

      const result = await running;

      expect(result.skipped).toBe(false);
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0][0].items.map(row => row.id)).toContain("mid-pull");
    });

    it("rejects without touching local data or pushing when the remote snapshot is unsafe", async () => {
      const store = await adapter.create();
      await store.upsertItem(item({ id: "item-a", title: "あ", meaning: "A" }));
      const push = vi.fn();

      await expect(runSnapshotSync({
        storage: store,
        mergeSnapshots,
        pull: async () => ({ snapshot: { items: [item({ id: "bad id<", title: "悪", meaning: "bad" })] } }),
        push
      })).rejects.toThrow();

      expect((await store.getState()).items.map(row => row.id)).toEqual(["item-a"]);
      expect(push).not.toHaveBeenCalled();
    });
  });
}
