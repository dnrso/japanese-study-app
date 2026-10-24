import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Starts the Electron desktop app with the apps/web build as its UI
// (NIHONGO_DESKTOP_UI=web). Run via `npm run desktop:web`, which builds the web
// app first. `npm start` also runs the prestart native-module preparation.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync("npm", ["start"], {
  cwd: rootDir,
  env: { ...process.env, NIHONGO_DESKTOP_UI: "web" },
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
