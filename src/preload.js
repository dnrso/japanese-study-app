const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  name: "NihonGo Study"
});

contextBridge.exposeInMainWorld("studyData", {
  getState: studyDate => ipcRenderer.invoke("data:get-state", studyDate),
  saveStudyLog: studyLog => ipcRenderer.invoke("data:save-study-log", studyLog),
  addDailyEntry: entry => ipcRenderer.invoke("data:add-daily-entry", entry),
  deleteDailyEntry: (id, studyDate) => ipcRenderer.invoke("data:delete-daily-entry", id, studyDate),
  registerDailyEntry: id => ipcRenderer.invoke("data:register-daily-entry", id),
  addTask: task => ipcRenderer.invoke("data:add-task", task),
  updateTaskDone: (id, done, studyDate) => ipcRenderer.invoke("data:update-task-done", id, done, studyDate),
  upsertItem: item => ipcRenderer.invoke("data:upsert-item", item),
  deleteItem: (id, studyDate) => ipcRenderer.invoke("data:delete-item", id, studyDate),
  updateItemReview: (id, review, studyDate) => ipcRenderer.invoke("data:update-item-review", id, review, studyDate),
  completeReview: (ids, studyDate) => ipcRenderer.invoke("data:complete-review", ids, studyDate),
  resetSampleData: () => ipcRenderer.invoke("data:reset-sample"),
  exportData: () => ipcRenderer.invoke("data:export"),
  importCsv: studyDate => ipcRenderer.invoke("data:import-csv", studyDate),
  importBackup: () => ipcRenderer.invoke("data:import-backup"),
  getPaths: () => ipcRenderer.invoke("data:get-paths")
});
