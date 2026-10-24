const { app, BrowserWindow, dialog, ipcMain, protocol } = require("electron");
const path = require("path");
const { registerDataHandlers } = require("./dataHandlers");
const { registerTtsHandlers } = require("./ttsHandlers");
const { selectDesktopUi } = require("./uiMode");
const {
  APP_SCHEME,
  APP_ENTRY_URL,
  createAppProtocolHandler,
  webDistExists,
  webDistRoot
} = require("./appProtocol");

const useWebUi = selectDesktopUi() === "web";

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

  if (useWebUi) {
    mainWindow.loadURL(APP_ENTRY_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  }
}

function appBaseDir() {
  return app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : path.resolve(__dirname, "..", "..", "..");
}

function configurePortablePaths() {
  const baseDir = appBaseDir();
  const userDataDir = path.join(baseDir, "user-data");
  app.setPath("userData", userDataDir);
  app.setPath("sessionData", userDataDir);
  process.env.NIHONGO_APP_DATA_DIR = path.join(baseDir, "app-data");
}

configurePortablePaths();

app.whenReady().then(() => {
  const store = require("./dataStore");
  store.initDatabase();
  registerDataHandlers(ipcMain, store);
  registerTtsHandlers(ipcMain);
  if (useWebUi) {
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
  }
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
