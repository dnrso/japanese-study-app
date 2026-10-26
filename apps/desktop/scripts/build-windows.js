const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const desktopDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(desktopDir, "..", "..");
const distDir = path.join(rootDir, "dist");
const unpackedDir = path.join(distDir, "win-unpacked");
const portableDataDirNames = ["user-data", "app-data"];
const userDataDir = path.join(unpackedDir, "user-data");
const preserveDir = path.join(rootDir, ".portable-data-preserve");
const builderCliPath = path.join(rootDir, "node_modules", "electron-builder", "cli.js");

function removeRootBuildArtifacts() {
  if (!fs.existsSync(distDir)) {
    return;
  }

  fs.readdirSync(distDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .forEach(entry => fs.rmSync(path.join(distDir, entry.name), { force: true }));
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(entry => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      return;
    }

    if (entry.isSymbolicLink()) {
      fs.rmSync(targetPath, { force: true });
      fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
}

function preservePortableData(sourceRoot = unpackedDir, targetRoot = preserveDir, dirNames = portableDataDirNames) {
  // A leftover preserve dir from a failed run is only replaced per directory, and only
  // when the live copy exists. Otherwise it is kept so restorePortableData can bring it back.
  dirNames.forEach(name => {
    const sourcePath = path.join(sourceRoot, name);
    if (!fs.existsSync(sourcePath)) {
      return;
    }
    const targetPath = path.join(targetRoot, name);
    fs.rmSync(targetPath, { recursive: true, force: true });
    copyDirectory(sourcePath, targetPath);
  });
}

function restorePortableData(sourceRoot = preserveDir, targetRoot = unpackedDir, dirNames = portableDataDirNames) {
  dirNames.forEach(name => {
    const preservedPath = path.join(sourceRoot, name);
    if (!fs.existsSync(preservedPath)) {
      return;
    }
    const targetPath = path.join(targetRoot, name);
    fs.rmSync(targetPath, { recursive: true, force: true });
    copyDirectory(preservedPath, targetPath);
  });
  // Only reached once every preserved directory has been copied back.
  fs.rmSync(sourceRoot, { recursive: true, force: true });
}

function failBuild(status, message) {
  if (message) {
    console.error(message);
  }
  try {
    restorePortableData();
  } catch (error) {
    console.error(`Failed to restore portable data; it is kept in ${preserveDir}: ${error.message}`);
  }
  process.exit(status || 1);
}

function buildWebUi() {
  // The packaged app loads the web UI, so apps/web/dist must exist.
  // A single command string avoids Node DEP0190 (args array combined with shell: true).
  const result = spawnSync("npm run web:build", { cwd: rootDir, env: process.env, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    failBuild(result.status, result.error && result.error.message);
  }
}

function run() {
  removeRootBuildArtifacts();
  preservePortableData();
  buildWebUi();

  const result = spawnSync(process.execPath, [builderCliPath, "--win", "--x64", "--dir"], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    failBuild(result.status, result.error && result.error.message);
  }

  restorePortableData();
  removeRootBuildArtifacts();
  console.log(`Windows unpacked build created at ${unpackedDir}`);
  console.log(`Portable user data is stored inside the app folder at ${userDataDir}`);
}

if (require.main === module) {
  run();
}

module.exports = { portableDataDirNames, preservePortableData, restorePortableData };
