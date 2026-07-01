const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { registerDataHandlers } = require("./dataHandlers");
const { registerTtsHandlers } = require("./ttsHandlers");

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

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
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
