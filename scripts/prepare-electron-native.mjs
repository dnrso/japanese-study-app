import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const require = createRequire(import.meta.url);

function readPackage(packageName) {
  const packagePath = require.resolve(`${packageName}/package.json`);
  return {
    path: packagePath,
    directory: path.dirname(packagePath),
    data: JSON.parse(fs.readFileSync(packagePath, "utf8"))
  };
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function createNativeTarget({
  electronVersion,
  betterSqlite3Version,
  platform = process.platform,
  arch = process.arch
}) {
  return {
    runtime: "electron",
    electronVersion,
    betterSqlite3Version,
    platform,
    arch
  };
}

export function markerMatches(marker, target, bindingSha256) {
  return Boolean(
    marker
    && bindingSha256
    && marker.bindingSha256 === bindingSha256
    && Object.entries(target).every(([key, value]) => marker[key] === value)
  );
}

function readMarker(markerPath) {
  try {
    return JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch {
    return null;
  }
}

export function prepareElectronNative() {
  const electronPackage = readPackage("electron");
  const sqlitePackage = readPackage("better-sqlite3");
  const bindingPath = path.join(sqlitePackage.directory, "build", "Release", "better_sqlite3.node");
  const markerPath = path.join(rootDir, "node_modules", ".cache", "nihongo-study", "electron-native.json");
  const target = createNativeTarget({
    electronVersion: electronPackage.data.version,
    betterSqlite3Version: sqlitePackage.data.version
  });
  const bindingSha256 = fs.existsSync(bindingPath) ? hashFile(bindingPath) : "";

  if (markerMatches(readMarker(markerPath), target, bindingSha256)) {
    console.log(`better-sqlite3 is ready for Electron ${target.electronVersion}.`);
    return;
  }

  const packageRequire = createRequire(sqlitePackage.path);
  const prebuildInstallPath = packageRequire.resolve("prebuild-install/bin.js");
  const result = spawnSync(process.execPath, [
    prebuildInstallPath,
    "--runtime=electron",
    `--target=${target.electronVersion}`,
    `--platform=${target.platform}`,
    `--arch=${target.arch}`
  ], {
    cwd: sqlitePackage.directory,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 || !fs.existsSync(bindingPath)) {
    throw new Error(
      `Failed to prepare better-sqlite3 for Electron ${target.electronVersion}.`
    );
  }

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${JSON.stringify({
    ...target,
    bindingSha256: hashFile(bindingPath)
  }, null, 2)}\n`, "utf8");
  console.log(`Prepared better-sqlite3 for Electron ${target.electronVersion}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    prepareElectronNative();
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
