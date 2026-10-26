const { app, BrowserWindow, dialog, ipcMain, protocol } = require("electron");
const path = require("path");
const { registerTtsHandlers } = require("./ttsHandlers");
const {
  APP_SCHEME,
  APP_ENTRY_URL,
  createAppProtocolHandler,
  webDistExists,
  webDistRoot
} = require("./appProtocol");

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f6f4ef",
    title: "NihonGo Study",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(APP_ENTRY_URL);
}

function appBaseDir() {
  return app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : path.resolve(__dirname, "..", "..", "..");
}

// NIHONGO_PORTABLE_ROOT (developer/testing option) relocates user-data under
// the given directory instead of next to the executable / repo root, so a test
// run never touches real study data.
function configurePortablePaths(env = process.env) {
  const override = String(env.NIHONGO_PORTABLE_ROOT || "").trim();
  const baseDir = override ? path.resolve(override) : appBaseDir();
  const userDataDir = path.join(baseDir, "user-data");
  app.setPath("userData", userDataDir);
  app.setPath("sessionData", userDataDir);
  return { userDataDir };
}

configurePortablePaths();

app.whenReady().then(() => {
  registerTtsHandlers(ipcMain);
  const distRoot = webDistRoot();
  if (!webDistExists(distRoot)) {
    dialog.showErrorBox(
      "Web UI build not found",
      "Could not find " + path.join(distRoot, "index.html") + ".\nRun \"npm run web:build\" first, then start the desktop app again."
    );
    app.quit();
    return;
  }
  protocol.handle(APP_SCHEME, createAppProtocolHandler(distRoot));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
