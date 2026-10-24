import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createLegacyMigration, registerMigrationHandlers } = require("../apps/desktop/src/legacyMigration.js");
const { migrationChannels } = require("../apps/desktop/src/migrationChannels.js");

const fixturePath = path.resolve(__dirname, "fixtures/legacy-desktop.sqlite");
const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/legacy-desktop.expected.json"), "utf8"));

const tmpDirs = [];
function setup({ withDb = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nihongo-legacy-migration-"));
  tmpDirs.push(root);
  const userDataDir = path.join(root, "user-data");
  const appDataDir = path.join(root, "app-data");
  fs.mkdirSync(appDataDir, { recursive: true });
  if (withDb) {
    fs.copyFileSync(fixturePath, path.join(appDataDir, "nihongo.sqlite"));
  }
  const create = () => createLegacyMigration({ userDataDir, appDataDir });
  const readState = () => JSON.parse(fs.readFileSync(path.join(userDataDir, "migration.json"), "utf8"));
  return { root, userDataDir, appDataDir, create, readState, migration: create() };
}

afterEach(() => {
  tmpDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

describe("legacy migration state machine", () => {
  it("returns null when there is no legacy database", () => {
    const { migration, userDataDir } = setup({ withDb: false });
    expect(migration.getPending()).toBeNull();
    expect(fs.existsSync(path.join(userDataDir, "migration.json"))).toBe(false);
  });

  it("returns { data, counts } while pending and records the pending state", () => {
    const { migration, readState } = setup();
    const pending = migration.getPending();
    expect(pending.counts).toEqual(expected.counts);
    expect(Object.keys(pending.data).sort()).toEqual(["dailyEntries", "dailyEntryLinks", "items", "studyDays", "tasks"]);
    expect(readState()).toEqual({ status: "pending" });
    // Cached for the session: same object, not re-read.
    expect(migration.getPending()).toBe(pending);
  });

  it("complete() with matching counts writes done and later launches get null", () => {
    const { migration, create, readState, appDataDir } = setup();
    const { counts } = migration.getPending();
    expect(migration.complete({ counts })).toEqual({ ok: true });
    const state = readState();
    expect(state.status).toBe("done");
    expect(state.counts).toEqual(counts);
    expect(Number.isNaN(Date.parse(state.completedAt))).toBe(false);
    expect(migration.getPending()).toBeNull();
    expect(create().getPending()).toBeNull();
    // The SQLite file is left in place (legacy rollback still sees the data).
    expect(fs.existsSync(path.join(appDataDir, "nihongo.sqlite"))).toBe(true);
  });

  it("complete() with mismatched counts records a failure and the next launch retries", () => {
    const { migration, create, readState } = setup();
    const { counts } = migration.getPending();
    const result = migration.complete({ counts: { ...counts, items: counts.items - 1 } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/items/);
    expect(readState().status).toBe("failed");
    expect(create().getPending().counts).toEqual(counts);
  });

  it("complete() without a prior read or without counts fails safely", () => {
    const { migration, readState } = setup();
    expect(migration.complete({ counts: expected.counts }).ok).toBe(false);
    migration.getPending();
    expect(migration.complete({}).ok).toBe(false);
    expect(readState().status).toBe("failed");
  });

  it("fail() records failed and a retry returns the data again", () => {
    const { migration, readState } = setup();
    migration.getPending();
    expect(migration.fail({ message: "boom" })).toEqual({ ok: true });
    expect(readState()).toMatchObject({ status: "failed", error: "boom" });
    const retry = migration.getPending();
    expect(retry.counts).toEqual(expected.counts);
    expect(readState().status).toBe("pending");
  });

  it("an unreadable database yields an error payload and a failed state", () => {
    const { migration, appDataDir, readState } = setup();
    fs.writeFileSync(path.join(appDataDir, "nihongo.sqlite"), "not a database");
    const pending = migration.getPending();
    expect(pending.data).toBeNull();
    expect(pending.error).toMatch(/Could not read legacy database/);
    expect(readState().status).toBe("failed");
  });

  it("registers the three ipc handlers on the shared channel names", async () => {
    const { migration } = setup();
    const handlers = new Map();
    registerMigrationHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, migration);
    expect([...handlers.keys()].sort()).toEqual(Object.values(migrationChannels).sort());
    const pending = await handlers.get(migrationChannels.getPending)({});
    expect(await handlers.get(migrationChannels.complete)({}, { counts: pending.counts })).toEqual({ ok: true });
    expect(await handlers.get(migrationChannels.getPending)({})).toBeNull();
  });
});

