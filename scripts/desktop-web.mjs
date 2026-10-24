import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Starts the Electron desktop app. The web UI (apps/web build) is the default;
// pass "legacy" to start the original SQLite-backed renderer instead
// (NIHONGO_DESKTOP_UI=legacy). Run via `npm run desktop:web` (builds the web app
// first) or `npm run desktop:legacy`. `npm start` also runs the prestart
// native-module preparation.
const mode = process.argv[2] === "legacy" ? "legacy" : "web";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync("npm", ["start"], {
  cwd: rootDir,
  env: { ...process.env, NIHONGO_DESKTOP_UI: mode },
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
