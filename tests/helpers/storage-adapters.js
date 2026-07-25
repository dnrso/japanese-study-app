// Shared plumbing for the storage test suites.
//
// The important part is `describeStorageSuite`: a suite that cannot run
// locally (better-sqlite3 built for Electron's ABI instead of plain Node) must
// still be a HARD FAILURE in CI. A `describe.skip` on CI means tests silently
// vanish while the build stays green, which is exactly how the parity drift
// this suite exists to catch shipped in the first place.
import { describe, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

export const isCi = Boolean(process.env.CI);

// ABI CAVEAT: better-sqlite3 in this repo may be compiled against Electron's
// NODE_MODULE_VERSION (the desktop app rebuilds it via electron-rebuild),
// which will not load under a plain Node runtime. We probe the native binding
// once here; `npm rebuild better-sqlite3` fixes it locally, and CI runs a
// fresh `npm ci` which builds the addon for plain Node.
export function loadSqliteAdapter() {
  try {
    const Database = require("better-sqlite3");
    const probe = new Database(":memory:");
    probe.close();
    const { createSqliteStorage } = require("../../packages/storage-sqlite/src/index.js");
    return { Database, createSqliteStorage, loadError: null };
  } catch (error) {
    return { Database: null, createSqliteStorage: null, loadError: error };
  }
}

const localFixHint =
  "better-sqlite3's native binding does not match this Node ABI (likely built for Electron " +
  "instead of plain Node). Run `npm rebuild better-sqlite3` to run this suite locally.";

export function describeStorageSuite(suiteName, loadError, defineTests) {
  if (!loadError) {
    describe(suiteName, defineTests);
    return;
  }

  if (isCi) {
    // Do not register the (unrunnable) body: one unmistakable failure beats N
    // cascading "store is undefined" errors.
    describe(`${suiteName} [UNAVAILABLE]`, () => {
      it("must run in CI - a storage adapter suite may never self-skip here", () => {
        throw new Error(
          `${suiteName} could not load its storage adapter, and CI is set, so skipping is not allowed ` +
          `(a skipped adapter suite hides parity drift). ${localFixHint} Original error: ${loadError.message}`
        );
      });
    });
    return;
  }

  console.warn(`[${suiteName}] Skipping suite (local dev only; this is a hard failure when CI=1). ${localFixHint} Original error: ${loadError.message}`);
  describe.skip(suiteName, defineTests);
}

// Temp app-data directories for the sqlite adapter.
export function createTmpDirs(label) {
  const dirs = [];
  return {
    make(suffix) {
      const dir = path.join(os.tmpdir(), `nihongo-${label}-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      fs.mkdirSync(dir, { recursive: true });
      dirs.push(dir);
      return dir;
    },
    // Best-effort cleanup: createSqliteStorage exposes no close(), so on
    // Windows the WAL/db handle may still be open and rmSync fails with
    // EPERM. That is a harmless OS-temp-dir leak, not a test failure.
    cleanup() {
      for (const dir of dirs) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (error) {
          console.warn(`[${label}] Could not clean up temp dir ${dir}: ${error.message}`);
        }
      }
      dirs.length = 0;
    }
  };
}
