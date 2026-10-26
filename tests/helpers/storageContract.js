// The storage adapter contract, used only by the tests.
//
// @nihongo-study/storage-idb (web, Android and the desktop web UI) is the only
// adapter and must satisfy this contract; `tests/storage-conformance.test.js`
// drives its behavioral assertions off the table below so the contract and the
// suite cannot drift apart.
//
// `params` lists the declared parameter names of the canonical signature. It
// is the *maximum* an implementation may declare: `assertStorageAdapter`
// rejects a method whose `Function.length` exceeds it (that always means the
// adapter demands more arguments than every call site passes). It cannot be an
// equality check, because a defaulted parameter does not count toward
// `Function.length`.
//
// `returns` is documentation only (nothing can assert it statically):
//   "state"       -> the getState() envelope
//   "stateResult" -> { state, result }
//   "export"      -> the exportData() envelope
//   "applied"     -> { state, data }: the post-merge state plus the merged data
//   "handle"      -> the underlying database handle
//   "none"        -> nothing meaningful (callers must not rely on the value)
const storageContract = [
  {
    name: "initDatabase",
    params: [],
    returns: "handle",
    note: "Creates/opens and migrates the store. Returns a promise; callers must await it."
  },
  {
    name: "getState",
    params: ["studyDate"],
    returns: "state",
    note: "studyDate defaults to today."
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
    params: ["backup", "studyDate"],
    returns: "state"
  },
  {
    name: "importFullBackup",
    params: ["backup"],
    returns: "state"
  },
  {
    name: "applyRemoteSnapshot",
    params: ["remote", "merge"],
    returns: "applied",
    note: "merge(localData, remoteData) => { data } must be synchronous; it runs inside one write transaction against current local rows. Returns { state, data }."
  },
  {
    name: "close",
    params: [],
    returns: "none",
    note: "Releases the underlying database handle (closes the IDBDatabase). Idempotent; safe to call before initDatabase()/twice. Only tests and shutdown paths need it."
  }
];

// Kept for backwards compatibility with the original export; derived from the
// contract so a new method can only be declared in one place.
const storageMethodNames = storageContract.map(entry => entry.name);

const storageStateShape = {
  required: ["selectedDate", "studyLog", "studyDays", "dailyEntries", "allDailyEntries", "tasks", "items"],
  optional: [],
  arrays: ["studyDays", "dailyEntries", "allDailyEntries", "tasks", "items"],
  studyLogKeys: ["minutes", "summary", "note", "totalMinutes"]
};

// `strict: true` additionally rejects function-valued properties that the
// contract above does not declare, so an adapter cannot quietly grow a method
// that only one platform implements. Boot paths should use the non-strict form so
// a purely additive adapter change cannot brick the app; the conformance suite
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
        "Add them to storageContract in tests/helpers/storageContract.js (and to the conformance suite) or keep them private."
      );
    }
  }

  return store;
}

export {
  storageContract,
  storageMethodNames,
  storageStateShape,
  assertStorageAdapter
};
