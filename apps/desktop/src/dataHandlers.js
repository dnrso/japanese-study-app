const { dataChannels } = require("./dataChannels");

function recordOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function registerDataHandlers(ipcMain, store) {
  ipcMain.handle(dataChannels.getState, (_event, studyDate) => store.getState(studyDate));
  ipcMain.handle(dataChannels.saveStudyLog, (_event, studyLog) => store.saveStudyLog(recordOrEmpty(studyLog)));
  ipcMain.handle(dataChannels.addDailyEntry, (_event, entry) => store.addDailyEntry(recordOrEmpty(entry)));
  ipcMain.handle(dataChannels.deleteDailyEntry, (_event, id, studyDate) => store.deleteDailyEntry(id, studyDate));
  ipcMain.handle(dataChannels.registerDailyEntries, (_event, ids, studyDate) => store.registerDailyEntries(arrayOrEmpty(ids), studyDate));
  ipcMain.handle(dataChannels.addTask, (_event, task) => store.addTask(recordOrEmpty(task)));
  ipcMain.handle(dataChannels.updateTaskDone, (_event, id, done, studyDate) => store.updateTaskDone(id, done, studyDate));
  ipcMain.handle(dataChannels.upsertItem, (_event, item) => store.upsertItem(recordOrEmpty(item)));
  ipcMain.handle(dataChannels.deleteItem, (_event, id, studyDate) => store.deleteItem(id, studyDate));
  ipcMain.handle(dataChannels.updateItemReview, (_event, id, review, studyDate) => store.updateItemReview(id, review, studyDate));
  ipcMain.handle(dataChannels.completeReview, (_event, ids, studyDate) => store.completeReview(arrayOrEmpty(ids), studyDate));
  ipcMain.handle(dataChannels.submitWordQuizAnswer, (_event, payload) => store.submitWordQuizAnswer(recordOrEmpty(payload)));
  ipcMain.handle(dataChannels.resetSample, () => store.resetSampleData());
  ipcMain.handle(dataChannels.exportData, () => store.exportData());
  ipcMain.handle(dataChannels.importCsv, (_event, studyDate) => store.importCsvExports(studyDate));
  ipcMain.handle(dataChannels.importBackup, () => store.importFullBackup());
  ipcMain.handle(dataChannels.getPaths, () => store.paths);
}

module.exports = { registerDataHandlers };
