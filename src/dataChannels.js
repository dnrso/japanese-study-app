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

module.exports = { dataChannels };
