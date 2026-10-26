const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const desktopDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(desktopDir, "..", "..");
const distDir = path.join(rootDir, "dist");
const unpackedDir = path.join(distDir, "win-unpacked");
const userDataDir = path.join(unpackedDir, "user-data");
const preserveDir = path.join(rootDir, ".portable-data-preserve");
const preservedUserDataDir = path.join(preserveDir, "user-data");
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

function preservePortableData() {
  fs.rmSync(preserveDir, { recursive: true, force: true });

  if (fs.existsSync(userDataDir)) {
    fs.mkdirSync(preserveDir, { recursive: true });
    copyDirectory(userDataDir, preservedUserDataDir);
  }
}

function restorePortableData() {
  if (fs.existsSync(preservedUserDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    copyDirectory(preservedUserDataDir, userDataDir);
  }
  fs.rmSync(preserveDir, { recursive: true, force: true });
}

function buildWebUi() {
  // The packaged app loads the web UI, so apps/web/dist must exist.
  const result = spawnSync("npm", ["run", "web:build"], { cwd: rootDir, env: process.env, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function run() {
  buildWebUi();
  removeRootBuildArtifacts();
  preservePortableData();

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

  restorePortableData();
  removeRootBuildArtifacts();
  console.log(`Windows unpacked build created at ${unpackedDir}`);
  console.log(`Portable user data is stored inside the app folder at ${userDataDir}`);
}

run();
