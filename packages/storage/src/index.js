// The canonical storage adapter contract.
//
// Both adapters (@nihongo-study/storage-sqlite for desktop, and
// @nihongo-study/storage-idb for web/android) must satisfy this contract, and
// `tests/storage-conformance.test.js` drives its behavioral assertions off the
// table below so the contract and the parity suite cannot drift apart.
//
// `params` lists the declared parameter names of the canonical signature. It
// is the *maximum* an implementation may declare: `assertStorageAdapter`
// rejects a method whose `Function.length` exceeds it (that always means the
// adapter demands more arguments than every call site passes). It cannot be an
// equality check, because a defaulted parameter does not count toward
// `Function.length`, and the two adapters default different parameters.
//
// `returns` is documentation only (nothing can assert it statically):
//   "state"       -> the getState() envelope
//   "stateResult" -> { state, result }
//   "export"      -> the exportData() envelope
//   "handle"      -> the underlying database handle
const storageContract = [
  {
    name: "initDatabase",
    params: [],
    returns: "handle",
    note: "Creates/opens and migrates the store. sqlite is synchronous, idb returns a promise; callers must await either way."
  },
  {
    name: "getState",
    params: ["studyDate"],
    returns: "state",
    note: "studyDate defaults to today on both adapters."
  },
  { name: "saveStudyLog", params: ["studyLog"], returns: "state" },
  { name: "addDailyEntry", params: ["entry"], returns: "state" },
  { name: "deleteDailyEntry", params: ["id", "studyDate"], returns: "state" },
  {
    name: "registerDailyEntries",
    params: ["ids", "studyDate"],
    returns: "stateResult",
    note: "result is { registered, duplicates, linked, errors } (all string arrays)."
  },
  { name: "addTask", params: ["task"], returns: "state" },
  { name: "updateTaskDone", params: ["id", "done", "studyDate"], returns: "state" },
  { name: "upsertItem", params: ["item"], returns: "state" },
  { name: "deleteItem", params: ["id", "studyDate"], returns: "state" },
  { name: "updateItemReview", params: ["id", "review", "studyDate"], returns: "state" },
  {
    name: "completeReview",
    params: ["targets", "studyDate"],
    returns: "state",
    note: "targets accept both bare ids and { id, review } objects (normalizeReviewCompletionTargets)."
  },
  { name: "submitWordQuizAnswer", params: ["payload"], returns: "stateResult" },
  { name: "resetSampleData", params: [], returns: "state" },
  { name: "clearAllData", params: [], returns: "state" },
  { name: "exportData", params: [], returns: "export" },
  {
    name: "importCsvExports",
    // Canonical signature is the two-argument form; storage-sqlite still only
    // implements importCsvExports(studyDate) and reads exports/*.csv off disk.
    // See tests/storage-conformance.test.js (KNOWN DIVERGENCE D15).
    params: ["backup", "studyDate"],
    returns: "state"
  },
  {
    name: "importFullBackup",
    // Canonical signature is the object form that packages/sync/src/index.js:73
    // and apps/web/src/main.js:1315 already call; storage-sqlite ignores the
    // argument and reads backups/full-backup.yaml off disk instead. See
    // tests/storage-conformance.test.js (KNOWN DIVERGENCE D14).
    params: ["backup"],
    returns: "state"
  }
];

// Kept for backwards compatibility with the original export; derived from the
// contract so a new method can only be declared in one place.
const storageMethodNames = storageContract.map(entry => entry.name);

const storagePathKeys = ["appDataDir", "exportsDir", "backupsDir", "dbPath"];

// Shape of the getState() envelope. `allDailyEntries` is only optional because
// storage-sqlite does not return it yet even though apps/web/src/main.js:549
// depends on it; it belongs in `required` once sqlite catches up. See
// tests/storage-conformance.test.js (KNOWN DIVERGENCE D1).
const storageStateShape = {
  required: ["selectedDate", "studyLog", "studyDays", "dailyEntries", "tasks", "items"],
  optional: ["allDailyEntries"],
  arrays: ["studyDays", "dailyEntries", "tasks", "items"],
  studyLogKeys: ["minutes", "summary", "note", "totalMinutes"]
};

// `strict: true` additionally rejects function-valued properties that the
// contract above does not declare, so an adapter cannot quietly grow a method
// that only one platform implements. The desktop boot path
// (apps/desktop/src/dataStore.js) deliberately calls the non-strict form so a
// purely additive adapter change cannot brick the app; the conformance suite
// runs strict.
function assertStorageAdapter(store, { strict = false } = {}) {
  if (!store || typeof store !== "object") {
    throw new TypeError("Storage adapter must be an object.");
  }

  const missingMethods = storageMethodNames.filter(name => typeof store[name] !== "function");
  if (missingMethods.length > 0) {
    throw new TypeError(`Storage adapter is missing methods: ${missingMethods.join(", ")}`);
  }

  const arityViolations = storageContract
    .filter(entry => store[entry.name].length > entry.params.length)
    .map(entry => `${entry.name} declares ${store[entry.name].length} required parameters, contract allows at most ${entry.params.length} (${entry.params.join(", ") || "none"})`);
  if (arityViolations.length > 0) {
    throw new TypeError(`Storage adapter has incompatible method signatures: ${arityViolations.join("; ")}`);
  }

  if (strict) {
    const declared = new Set(storageMethodNames);
    const undeclared = Object.keys(store).filter(key => typeof store[key] === "function" && !declared.has(key));
    if (undeclared.length > 0) {
      throw new TypeError(
        `Storage adapter exposes methods that the contract does not declare: ${undeclared.join(", ")}. ` +
        "Add them to storageContract in packages/storage/src/index.js (and to the conformance suite) or keep them private."
      );
    }
  }

  if (!store.paths || typeof store.paths !== "object") {
    throw new TypeError("Storage adapter must expose a paths object.");
  }

  storagePathKeys.forEach(name => {
    if (typeof store.paths[name] !== "string") {
      throw new TypeError(`Storage adapter paths.${name} must be a string.`);
    }
    if (!store.paths[name]) {
      throw new TypeError(`Storage adapter paths.${name} must be a non-empty string.`);
    }
  });

  return store;
}

module.exports = {
  storageContract,
  storageMethodNames,
  storagePathKeys,
  storageStateShape,
  assertStorageAdapter
};
