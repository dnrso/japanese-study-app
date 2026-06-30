const dataApiMethods = [
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
  "exportData",
  "importCsv",
  "importBackup",
  "getPaths"
];

function createDataApi(adapter, platform) {
  return dataApiMethods.reduce((api, methodName) => {
    api[methodName] = (...args) => adapter[methodName](...args);
    return api;
  }, { platform });
}

function createUnavailableDataApi() {
  const message = "데이터 API를 찾을 수 없습니다. browserDataStore를 먼저 로드하세요.";
  return dataApiMethods.reduce((api, methodName) => {
    api[methodName] = () => Promise.reject(new Error(message));
    return api;
  }, { platform: "unavailable" });
}

const dataApi = (() => {
  if (window.browserDataStore) {
    return createDataApi(window.browserDataStore, "web");
  }
  return createUnavailableDataApi();
})();

window.NihonGoDataApi = dataApi;
