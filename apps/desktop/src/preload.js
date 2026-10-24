const { contextBridge, ipcRenderer } = require("electron");

const dataChannels = {
  getState: "data:get-state",
  saveStudyLog: "data:save-study-log",
  addDailyEntry: "data:add-daily-entry",
  deleteDailyEntry: "data:delete-daily-entry",
  registerDailyEntries: "data:register-daily-entries",
  addTask: "data:add-task",
  updateTaskDone: "data:update-task-done",
  upsertItem: "data:upsert-item",
  deleteItem: "data:delete-item",
  updateItemReview: "data:update-item-review",
  completeReview: "data:complete-review",
  submitWordQuizAnswer: "data:submit-word-quiz-answer",
  resetSample: "data:reset-sample",
  exportData: "data:export",
  importCsv: "data:import-csv",
  importBackup: "data:import-backup",
  getPaths: "data:get-paths"
};

// Duplicated from ttsChannels.js: a sandboxed preload cannot require local
// files. tests/desktop-tts-preload.test.js guards against drift.
const ttsChannels = {
  voicevoxSpeakers: "tts:voicevox-speakers",
  voicevoxSynthesize: "tts:voicevox-synthesize",
  voicevoxHealth: "tts:voicevox-health",
  getConfig: "tts:get-config",
  setConfig: "tts:set-config"
};

// Duplicated from migrationChannels.js (same reason). tests/desktop-migration-preload.test.js
// guards against drift.
const migrationChannels = {
  getPending: "migration:get-pending",
  complete: "migration:complete",
  fail: "migration:fail"
};

contextBridge.exposeInMainWorld("appInfo", {
  name: "NihonGo Study"
});

contextBridge.exposeInMainWorld("desktopBridge", {
  platform: "electron",
  tts: {
    speakers: () => ipcRenderer.invoke(ttsChannels.voicevoxSpeakers),
    synthesize: payload => ipcRenderer.invoke(ttsChannels.voicevoxSynthesize, payload),
    health: () => ipcRenderer.invoke(ttsChannels.voicevoxHealth),
    getConfig: () => ipcRenderer.invoke(ttsChannels.getConfig),
    setConfig: config => ipcRenderer.invoke(ttsChannels.setConfig, config)
  },
  migration: {
    getPending: () => ipcRenderer.invoke(migrationChannels.getPending),
    complete: counts => ipcRenderer.invoke(migrationChannels.complete, { counts }),
    fail: message => ipcRenderer.invoke(migrationChannels.fail, { message })
  }
});

contextBridge.exposeInMainWorld("studyData", {
  getState: studyDate => ipcRenderer.invoke(dataChannels.getState, studyDate),
  saveStudyLog: studyLog => ipcRenderer.invoke(dataChannels.saveStudyLog, studyLog),
  addDailyEntry: entry => ipcRenderer.invoke(dataChannels.addDailyEntry, entry),
  deleteDailyEntry: (id, studyDate) => ipcRenderer.invoke(dataChannels.deleteDailyEntry, id, studyDate),
  registerDailyEntries: (ids, studyDate) => ipcRenderer.invoke(dataChannels.registerDailyEntries, ids, studyDate),
  addTask: task => ipcRenderer.invoke(dataChannels.addTask, task),
  updateTaskDone: (id, done, studyDate) => ipcRenderer.invoke(dataChannels.updateTaskDone, id, done, studyDate),
  upsertItem: item => ipcRenderer.invoke(dataChannels.upsertItem, item),
  deleteItem: (id, studyDate) => ipcRenderer.invoke(dataChannels.deleteItem, id, studyDate),
  updateItemReview: (id, review, studyDate) => ipcRenderer.invoke(dataChannels.updateItemReview, id, review, studyDate),
  completeReview: (ids, studyDate) => ipcRenderer.invoke(dataChannels.completeReview, ids, studyDate),
  submitWordQuizAnswer: payload => ipcRenderer.invoke(dataChannels.submitWordQuizAnswer, payload),
  resetSampleData: () => ipcRenderer.invoke(dataChannels.resetSample),
  exportData: () => ipcRenderer.invoke(dataChannels.exportData),
  importCsv: studyDate => ipcRenderer.invoke(dataChannels.importCsv, studyDate),
  importBackup: () => ipcRenderer.invoke(dataChannels.importBackup),
  getPaths: () => ipcRenderer.invoke(dataChannels.getPaths)
});

contextBridge.exposeInMainWorld("ttsApi", {
  getVoicevoxSpeakers: () => ipcRenderer.invoke(ttsChannels.voicevoxSpeakers),
  synthesizeVoicevox: payload => ipcRenderer.invoke(ttsChannels.voicevoxSynthesize, payload)
});
