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

function configureDataPath() {
  const appDataDir = app.isPackaged
    ? path.resolve(path.dirname(app.getPath("exe")), "..", "app-data")
    : path.resolve(__dirname, "..", "app-data");
  process.env.NIHONGO_APP_DATA_DIR = appDataDir;
}

app.whenReady().then(() => {
  configureDataPath();
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
