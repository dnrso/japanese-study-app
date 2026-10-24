// Main-process side of the one-time "legacy SQLite -> web IndexedDB" migration.
//
// State lives in <userData>/migration.json:
//   { status: "pending" | "done" | "failed", completedAt?, counts?, error? }
// The SQLite file itself is never renamed, moved or deleted here, so a failed
// migration can be retried and the old data stays available as a backup.
const fs = require("fs");
const path = require("path");
const { migrationChannels } = require("./migrationChannels");
const { readLegacySqlite } = require("./legacySqliteReader");

const COUNT_KEYS = ["studyDays", "dailyEntries", "dailyEntryLinks", "tasks", "items"];

function createLegacyMigration({ userDataDir, appDataDir, now = () => new Date() }) {
  const statePath = path.join(userDataDir, "migration.json");
  const dbPath = path.join(appDataDir, "nihongo.sqlite");
  let cached = null;

  function readState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : { status: "pending" };
    } catch {
      return { status: "pending" };
    }
  }

  function writeState(state) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  function recordFailure(message) {
    writeState({ status: "failed", failedAt: now().toISOString(), error: String(message || "unknown error") });
  }

  // null: nothing to migrate. Otherwise { data, counts } (read lazily, once per session).
  function getPending() {
    if (readState().status === "done" || !fs.existsSync(dbPath)) {
      return null;
    }
    if (!cached) {
      try {
        cached = readLegacySqlite(dbPath);
      } catch (error) {
        recordFailure(error.message);
        // The renderer cannot do anything useful with a broken database, but it
        // must be able to tell the user their data was not migrated.
        return { error: error.message, data: null, counts: null };
      }
      writeState({ status: "pending" });
    }
    return cached;
  }

  function complete(payload) {
    if (!cached) {
      return { ok: false, error: "No pending migration data was read in this session." };
    }
    const reported = payload && payload.counts;
    const mismatched = COUNT_KEYS.filter(key => !reported || Number(reported[key]) !== cached.counts[key]);
    if (mismatched.length) {
      const message = `Migrated counts do not match the legacy database (${mismatched.join(", ")}).`;
      recordFailure(message);
      return { ok: false, error: message };
    }
    writeState({ status: "done", completedAt: now().toISOString(), counts: cached.counts });
    cached = null;
    return { ok: true };
  }

  function fail(payload) {
    const message = payload && payload.message ? payload.message : "unknown error";
    recordFailure(message);
    // Next launch re-reads the database and retries.
    cached = null;
    return { ok: true };
  }

  return { getPending, complete, fail, statePath, dbPath };
}

function registerMigrationHandlers(ipcMain, migration) {
  ipcMain.handle(migrationChannels.getPending, () => migration.getPending());
  ipcMain.handle(migrationChannels.complete, (_event, payload) => migration.complete(payload));
  ipcMain.handle(migrationChannels.fail, (_event, payload) => migration.fail(payload));
}

module.exports = { createLegacyMigration, registerMigrationHandlers };
