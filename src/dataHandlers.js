const { dataChannels } = require("./dataChannels");

function registerDataHandlers(ipcMain, store) {
  ipcMain.handle(dataChannels.getState, (_event, studyDate) => store.getState(studyDate));
  ipcMain.handle(dataChannels.saveStudyLog, (_event, studyLog) => store.saveStudyLog(studyLog));
  ipcMain.handle(dataChannels.addDailyEntry, (_event, entry) => store.addDailyEntry(entry));
  ipcMain.handle(dataChannels.deleteDailyEntry, (_event, id, studyDate) => store.deleteDailyEntry(id, studyDate));
  ipcMain.handle(dataChannels.registerDailyEntry, (_event, id) => store.registerDailyEntry(id));
  ipcMain.handle(dataChannels.registerDailyEntries, (_event, ids, studyDate) => store.registerDailyEntries(ids, studyDate));
  ipcMain.handle(dataChannels.addTask, (_event, task) => store.addTask(task));
  ipcMain.handle(dataChannels.updateTaskDone, (_event, id, done, studyDate) => store.updateTaskDone(id, done, studyDate));
  ipcMain.handle(dataChannels.upsertItem, (_event, item) => store.upsertItem(item));
  ipcMain.handle(dataChannels.deleteItem, (_event, id, studyDate) => store.deleteItem(id, studyDate));
  ipcMain.handle(dataChannels.updateItemReview, (_event, id, review, studyDate) => store.updateItemReview(id, review, studyDate));
  ipcMain.handle(dataChannels.completeReview, (_event, ids, studyDate) => store.completeReview(ids, studyDate));
  ipcMain.handle(dataChannels.submitWordQuizAnswer, (_event, payload) => store.submitWordQuizAnswer(payload));
  ipcMain.handle(dataChannels.resetSample, () => store.resetSampleData());
  ipcMain.handle(dataChannels.exportData, () => store.exportData());
  ipcMain.handle(dataChannels.importCsv, (_event, studyDate) => store.importCsvExports(studyDate));
  ipcMain.handle(dataChannels.importBackup, () => store.importFullBackup());
  ipcMain.handle(dataChannels.getPaths, () => store.paths);
}

module.exports = { registerDataHandlers };
