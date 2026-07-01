const storageMethodNames = [
  "initDatabase",
  "getState",
  "saveStudyLog",
  "addDailyEntry",
  "deleteDailyEntry",
  "registerDailyEntries",
  "addTask",
  "updateTaskDone",
  "upsertItem",
  "deleteItem",
  "updateItemReview",
  "completeReview",
  "submitWordQuizAnswer",
  "resetSampleData",
  "clearAllData",
  "exportData",
  "importCsvExports",
  "importFullBackup"
];

function assertStorageAdapter(store) {
  if (!store || typeof store !== "object") {
    throw new TypeError("Storage adapter must be an object.");
  }

  const missingMethods = storageMethodNames.filter(name => typeof store[name] !== "function");
  if (missingMethods.length > 0) {
    throw new TypeError(`Storage adapter is missing methods: ${missingMethods.join(", ")}`);
  }

  if (!store.paths || typeof store.paths !== "object") {
    throw new TypeError("Storage adapter must expose a paths object.");
  }

  ["appDataDir", "exportsDir", "backupsDir", "dbPath"].forEach(name => {
    if (typeof store.paths[name] !== "string") {
      throw new TypeError(`Storage adapter paths.${name} must be a string.`);
    }
  });

  return store;
}

module.exports = {
  storageMethodNames,
  assertStorageAdapter
};
