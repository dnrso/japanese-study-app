import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { dataChannels } = require("../apps/desktop/src/dataChannels");
const { registerDataHandlers } = require("../apps/desktop/src/dataHandlers");

const recordHandlers = [
  [dataChannels.saveStudyLog, "saveStudyLog"],
  [dataChannels.addDailyEntry, "addDailyEntry"],
  [dataChannels.addTask, "addTask"],
  [dataChannels.upsertItem, "upsertItem"],
  [dataChannels.submitWordQuizAnswer, "submitWordQuizAnswer"]
];

const arrayHandlers = [
  [dataChannels.registerDailyEntries, "registerDailyEntries"],
  [dataChannels.completeReview, "completeReview"]
];

describe("desktop data IPC argument normalization (D19)", () => {
  let handlers;
  let store;

  beforeEach(() => {
    handlers = new Map();
    store = Object.fromEntries(
      [
        "getState",
        "saveStudyLog",
        "addDailyEntry",
        "deleteDailyEntry",
        "registerDailyEntries",
        "addTask",
        "updateTaskDone",
        "upsertItem",
        "deleteItem",
        "updateItemReview",
        "completeReview",
        "submitWordQuizAnswer",
        "resetSampleData",
        "exportData",
        "importCsvExports",
        "importFullBackup"
      ].map(method => [method, vi.fn()])
    );
    store.paths = {};

    registerDataHandlers(
      {
        handle: vi.fn((channel, handler) => handlers.set(channel, handler))
      },
      store
    );
  });

  it.each(recordHandlers)("%s preserves valid record payloads", async (channel, method) => {
    const payload = { value: "valid" };

    await handlers.get(channel)(null, payload);

    expect(store[method]).toHaveBeenCalledWith(payload);
  });

  it.each(recordHandlers)("%s normalizes omitted and malformed records to an empty record", async (channel, method) => {
    for (const payload of [undefined, null, "invalid", 42, true, []]) {
      store[method].mockClear();

      await handlers.get(channel)(null, payload);

      expect(store[method]).toHaveBeenCalledWith({});
    }
  });

  it.each(arrayHandlers)("%s preserves valid array payloads and trailing arguments", async (channel, method) => {
    const payload = [{ id: "item-1" }];

    await handlers.get(channel)(null, payload, "2026-07-27");

    expect(store[method]).toHaveBeenCalledWith(payload, "2026-07-27");
  });

  it.each(arrayHandlers)("%s normalizes omitted and malformed arrays to an empty array", async (channel, method) => {
    for (const payload of [undefined, null, "invalid", 42, true, {}]) {
      store[method].mockClear();

      await handlers.get(channel)(null, payload, "2026-07-27");

      expect(store[method]).toHaveBeenCalledWith([], "2026-07-27");
    }
  });
});
