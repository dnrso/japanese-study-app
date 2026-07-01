const { assertStorageAdapter } = require("../../../packages/storage");
const { createSqliteStorage } = require("../../../packages/storage-sqlite");

const store = createSqliteStorage({
  appDataDir: process.env.NIHONGO_APP_DATA_DIR
});

module.exports = assertStorageAdapter(store);
