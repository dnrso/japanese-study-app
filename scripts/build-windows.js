const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const asar = require("@electron/asar");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const unpackedDir = path.join(distDir, "win-unpacked");
const appDataDir = path.join(distDir, "app-data");
const legacyAppDataDir = path.join(unpackedDir, "app-data");
const schemaPath = path.join(rootDir, "src", "dataSchema.js");
const schemaMarkerPath = path.join(appDataDir, ".data-schema-hash");
const backupRootDir = path.join(distDir, "app-data-backup");
const builderCliPath = path.join(rootDir, "node_modules", "electron-builder", "cli.js");

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trim() : "";
}

function previousSchemaHash() {
  const markerHash = readText(schemaMarkerPath);
  if (markerHash) {
    return markerHash;
  }

  const archivePath = path.join(unpackedDir, "resources", "app.asar");
  if (!fs.existsSync(archivePath)) {
    return "";
  }

  try {
    return hash(asar.extractFile(archivePath, "src/dataSchema.js"));
  } catch {
    return "";
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function removeRootBuildArtifacts() {
  if (!fs.existsSync(distDir)) {
    return;
  }

  fs.readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .forEach(entry => fs.rmSync(path.join(distDir, entry.name), { force: true }));
}

function assertDataFilesReadable(dataDir) {
  if (!fs.existsSync(dataDir)) {
    return;
  }

  const lockedFiles = fs.readdirSync(dataDir)
    .filter(name => name.startsWith("nihongo.sqlite"))
    .filter(name => {
      const filePath = path.join(dataDir, name);
      let handle;
      try {
        handle = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(1);
        fs.readSync(handle, buffer, 0, 1, 0);
        return false;
      } catch {
        return true;
      } finally {
        if (handle !== undefined) {
          fs.closeSync(handle);
        }
      }
    });

  if (lockedFiles.length > 0) {
    throw new Error(
      `Close NihonGo Study before building. Locked data files: ${lockedFiles.join(", ")}`
    );
  }
}

function migrateLegacyAppData() {
  if (!fs.existsSync(legacyAppDataDir)) {
    return;
  }

  assertDataFilesReadable(legacyAppDataDir);
  if (!fs.existsSync(appDataDir)) {
    fs.renameSync(legacyAppDataDir, appDataDir);
    console.log(`Existing app data moved to the persistent location: ${appDataDir}`);
    return;
  }

  const backupDir = path.join(backupRootDir, `legacy-${timestamp()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.renameSync(legacyAppDataDir, path.join(backupDir, "app-data"));
  console.log(`Legacy app data was not merged because persistent data already exists. Backed up to ${backupDir}`);
}

function backupForSchemaChange(currentSchemaHash) {
  if (!fs.existsSync(appDataDir)) {
    return;
  }

  const priorSchemaHash = previousSchemaHash();
  if (!priorSchemaHash || priorSchemaHash === currentSchemaHash) {
    return;
  }

  assertDataFilesReadable(appDataDir);
  const backupDir = path.join(backupRootDir, timestamp());
  fs.mkdirSync(backupDir, { recursive: true });
  fs.cpSync(appDataDir, path.join(backupDir, "app-data"), { recursive: true });
  console.log(`Data schema changed. Existing app data was preserved and backed up to ${backupDir}`);
}

function run() {
  const currentSchemaHash = hash(fs.readFileSync(schemaPath));
  removeRootBuildArtifacts();
  migrateLegacyAppData();
  backupForSchemaChange(currentSchemaHash);

  const result = spawnSync(process.execPath, [builderCliPath, "--win", "--x64", "--dir"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error.message);
    }
    process.exit(result.status || 1);
  }

  fs.mkdirSync(appDataDir, { recursive: true });
  fs.writeFileSync(schemaMarkerPath, `${currentSchemaHash}\n`, "utf8");
  removeRootBuildArtifacts();
  console.log(`Windows unpacked build created at ${unpackedDir}`);
  console.log(`Persistent app data is stored outside the build output at ${appDataDir}`);
}

run();
