const { execFileSync } = require("child_process");
const path = require("path");

const cliPath = path.join(__dirname, "dbCli.js");

function call(action, payload = {}) {
  const output = execFileSync("node", [cliPath, action, JSON.stringify(payload)], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true
  });
  return JSON.parse(output);
}

module.exports = {
  initDatabase: () => call("init"),
  getState: studyDate => call("getState", { studyDate }),
  saveStudyLog: studyLog => call("saveStudyLog", studyLog),
  addDailyEntry: entry => call("addDailyEntry", entry),
  deleteDailyEntry: (id, studyDate) => call("deleteDailyEntry", { id, studyDate }),
  registerDailyEntry: id => call("registerDailyEntry", { id }),
  registerDailyEntries: (ids, studyDate) => call("registerDailyEntries", { ids, studyDate }),
  addTask: task => call("addTask", task),
  updateTaskDone: (id, done, studyDate) => call("updateTaskDone", { id, done, studyDate }),
  upsertItem: item => call("upsertItem", item),
  deleteItem: (id, studyDate) => call("deleteItem", { id, studyDate }),
  updateItemReview: (id, review, studyDate) => call("updateItemReview", { id, review, studyDate }),
  completeReview: (ids, studyDate) => call("completeReview", { ids, studyDate }),
  submitWordQuizAnswer: payload => call("submitWordQuizAnswer", payload),
  resetSampleData: () => call("resetSampleData"),
  clearAllData: () => call("clearAllData"),
  exportData: () => call("exportData"),
  importCsvExports: studyDate => call("importCsvExports", { studyDate }),
  importFullBackup: () => call("importFullBackup"),
  paths: call("paths")
};
