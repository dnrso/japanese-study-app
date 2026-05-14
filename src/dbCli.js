const store = require("./dataStore");

const action = process.argv[2];
const payload = process.argv[3] ? JSON.parse(process.argv[3]) : {};

function run() {
  store.initDatabase();

  switch (action) {
    case "init":
      return store.paths;
    case "getState":
      return store.getState(payload.studyDate);
    case "saveStudyLog":
      return store.saveStudyLog(payload);
    case "addDailyEntry":
      return store.addDailyEntry(payload);
    case "deleteDailyEntry":
      return store.deleteDailyEntry(payload.id, payload.studyDate);
    case "registerDailyEntry":
      return store.registerDailyEntry(payload.id);
    case "registerDailyEntries":
      return store.registerDailyEntries(payload.ids || [], payload.studyDate);
    case "addTask":
      return store.addTask(payload);
    case "updateTaskDone":
      return store.updateTaskDone(payload.id, payload.done, payload.studyDate);
    case "upsertItem":
      return store.upsertItem(payload);
    case "deleteItem":
      return store.deleteItem(payload.id, payload.studyDate);
    case "updateItemReview":
      return store.updateItemReview(payload.id, payload.review, payload.studyDate);
    case "completeReview":
      return store.completeReview(payload.ids || [], payload.studyDate);
    case "submitWordQuizAnswer":
      return store.submitWordQuizAnswer(payload);
    case "resetSampleData":
      return store.resetSampleData();
    case "clearAllData":
      return store.clearAllData();
    case "exportData":
      return store.exportData();
    case "importCsvExports":
      return store.importCsvExports(payload.studyDate);
    case "importFullBackup":
      return store.importFullBackup();
    case "paths":
      return store.paths;
    default:
      throw new Error(`Unknown DB action: ${action}`);
  }
}

try {
  process.stdout.write(JSON.stringify(run()));
} catch (error) {
  process.stderr.write(error.stack || error.message);
  process.exit(1);
}
