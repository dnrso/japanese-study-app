const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const store = require("./dbBridge");

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

app.whenReady().then(() => {
  store.initDatabase();
  registerDataHandlers();
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

function registerDataHandlers() {
  ipcMain.handle("data:get-state", (_event, studyDate) => store.getState(studyDate));
  ipcMain.handle("data:save-study-log", (_event, studyLog) => store.saveStudyLog(studyLog));
  ipcMain.handle("data:add-daily-entry", (_event, entry) => store.addDailyEntry(entry));
  ipcMain.handle("data:delete-daily-entry", (_event, id, studyDate) => store.deleteDailyEntry(id, studyDate));
  ipcMain.handle("data:register-daily-entry", (_event, id) => store.registerDailyEntry(id));
  ipcMain.handle("data:add-task", (_event, task) => store.addTask(task));
  ipcMain.handle("data:update-task-done", (_event, id, done, studyDate) => store.updateTaskDone(id, done, studyDate));
  ipcMain.handle("data:upsert-item", (_event, item) => store.upsertItem(item));
  ipcMain.handle("data:delete-item", (_event, id, studyDate) => store.deleteItem(id, studyDate));
  ipcMain.handle("data:update-item-review", (_event, id, review, studyDate) => store.updateItemReview(id, review, studyDate));
  ipcMain.handle("data:complete-review", (_event, ids, studyDate) => store.completeReview(ids, studyDate));
  ipcMain.handle("data:reset-sample", () => store.resetSampleData());
  ipcMain.handle("data:export", () => store.exportData());
  ipcMain.handle("data:import-csv", (_event, studyDate) => store.importCsvExports(studyDate));
  ipcMain.handle("data:import-backup", () => store.importFullBackup());
  ipcMain.handle("data:get-paths", () => store.paths);
}
