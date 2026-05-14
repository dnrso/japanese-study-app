const { contextBridge, ipcRenderer } = require("electron");

const dataChannels = {
  getState: "data:get-state",
  saveStudyLog: "data:save-study-log",
  addDailyEntry: "data:add-daily-entry",
  deleteDailyEntry: "data:delete-daily-entry",
  registerDailyEntry: "data:register-daily-entry",
  registerDailyEntries: "data:register-daily-entries",
  addTask: "data:add-task",
  updateTaskDone: "data:update-task-done",
  upsertItem: "data:upsert-item",
  deleteItem: "data:delete-item",
  updateItemReview: "data:update-item-review",
  completeReview: "data:complete-review",
  resetSample: "data:reset-sample",
  exportData: "data:export",
  importCsv: "data:import-csv",
  importBackup: "data:import-backup",
  getPaths: "data:get-paths"
};

contextBridge.exposeInMainWorld("appInfo", {
  name: "NihonGo Study"
});

contextBridge.exposeInMainWorld("studyData", {
  getState: studyDate => ipcRenderer.invoke(dataChannels.getState, studyDate),
  saveStudyLog: studyLog => ipcRenderer.invoke(dataChannels.saveStudyLog, studyLog),
  addDailyEntry: entry => ipcRenderer.invoke(dataChannels.addDailyEntry, entry),
  deleteDailyEntry: (id, studyDate) => ipcRenderer.invoke(dataChannels.deleteDailyEntry, id, studyDate),
  registerDailyEntry: id => ipcRenderer.invoke(dataChannels.registerDailyEntry, id),
  registerDailyEntries: (ids, studyDate) => ipcRenderer.invoke(dataChannels.registerDailyEntries, ids, studyDate),
  addTask: task => ipcRenderer.invoke(dataChannels.addTask, task),
  updateTaskDone: (id, done, studyDate) => ipcRenderer.invoke(dataChannels.updateTaskDone, id, done, studyDate),
  upsertItem: item => ipcRenderer.invoke(dataChannels.upsertItem, item),
  deleteItem: (id, studyDate) => ipcRenderer.invoke(dataChannels.deleteItem, id, studyDate),
  updateItemReview: (id, review, studyDate) => ipcRenderer.invoke(dataChannels.updateItemReview, id, review, studyDate),
  completeReview: (ids, studyDate) => ipcRenderer.invoke(dataChannels.completeReview, ids, studyDate),
  resetSampleData: () => ipcRenderer.invoke(dataChannels.resetSample),
  exportData: () => ipcRenderer.invoke(dataChannels.exportData),
  importCsv: studyDate => ipcRenderer.invoke(dataChannels.importCsv, studyDate),
  importBackup: () => ipcRenderer.invoke(dataChannels.importBackup),
  getPaths: () => ipcRenderer.invoke(dataChannels.getPaths)
});

contextBridge.exposeInMainWorld("ttsApi", {
  getVoicevoxSpeakers: () => ipcRenderer.invoke("tts:voicevox-speakers"),
  synthesizeVoicevox: payload => ipcRenderer.invoke("tts:voicevox-synthesize", payload)
});
