export const syncMutationMethods = Object.freeze([
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
  "importCsvExports",
  "importFullBackup"
]);

function skippedResult(reason, error) {
  return {
    skipped: true,
    reason,
    ...(error ? { error } : {})
  };
}

function copyState(state) {
  return { ...state };
}

export function createSyncCoordinator({
  sync,
  debounceMs = 750,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
  now = () => new Date(),
  onStateChange = () => {},
  onSyncSuccess = () => {},
  onError = () => {}
} = {}) {
  if (!sync || typeof sync.syncNow !== "function") {
    throw new TypeError("A sync implementation with syncNow() is required.");
  }

  let session = null;
  let timer = null;
  let runningPromise = null;
  let followUpRequested = false;
  let syncState = {
    status: "idle",
    lastSuccessAt: null,
    error: null
  };

  function getState() {
    return {
      ...copyState(syncState),
      authenticated: Boolean(session)
    };
  }

  function publish(patch) {
    syncState = { ...syncState, ...patch };
    onStateChange(getState());
  }

  function canSync() {
    return Boolean(sync.isEnabled && session);
  }

  function currentUserId() {
    return session?.user?.id || null;
  }

  function cancelTimer() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function setSession(nextSession) {
    session = nextSession || null;
    if (!canSync()) {
      cancelTimer();
      followUpRequested = false;
      publish({ status: "idle", error: null });
    }
  }

  function unavailableResult() {
    return skippedResult(sync.isEnabled ? "no-session" : "disabled");
  }

  function reportError(error) {
    const normalized = error instanceof Error ? error : new Error(String(error || "Unknown sync error"));
    publish({ status: "error", error: normalized });
    onError(normalized);
    return skippedResult("error", normalized);
  }

  async function runLoop() {
    let lastResult = unavailableResult();

    do {
      followUpRequested = false;
      publish({ status: "syncing", error: null });
      const runUserId = currentUserId();

      try {
        lastResult = await sync.syncNow();
      } catch (error) {
        if (!canSync() || currentUserId() !== runUserId) {
          lastResult = skippedResult("session-changed");
          continue;
        }
        lastResult = reportError(error);
      }

      if (!canSync() || currentUserId() !== runUserId) {
        lastResult = skippedResult("session-changed");
        continue;
      }

      if (lastResult?.skipped) {
        if (lastResult.reason === "disabled" || lastResult.reason === "no-session") {
          if (lastResult.reason === "no-session") {
            session = null;
          }
          publish({ status: "idle", error: null });
        } else if (lastResult.reason === "error" && syncState.status !== "error") {
          lastResult = reportError(lastResult.error || new Error("Sync failed."));
        }
      } else {
        const lastSuccessAt = now().toISOString();
        publish({ status: "success", lastSuccessAt, error: null });
        try {
          await onSyncSuccess(lastResult);
        } catch (error) {
          lastResult = reportError(error);
        }
      }
    } while (followUpRequested && canSync());

    return lastResult;
  }

  function startRun() {
    if (!canSync()) {
      return Promise.resolve(unavailableResult());
    }
    if (runningPromise) {
      return runningPromise;
    }

    runningPromise = runLoop().finally(() => {
      runningPromise = null;
    });
    return runningPromise;
  }

  function schedule() {
    if (!canSync()) {
      return { scheduled: false, reason: sync.isEnabled ? "no-session" : "disabled" };
    }

    followUpRequested = true;
    if (runningPromise) {
      return { scheduled: true, followUp: true };
    }

    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void startRun();
    }, debounceMs);
    return { scheduled: true, followUp: false };
  }

  function syncNow() {
    if (!canSync()) {
      return Promise.resolve(unavailableResult());
    }

    cancelTimer();
    followUpRequested = true;
    return startRun();
  }

  function destroy() {
    cancelTimer();
    followUpRequested = false;
  }

  return {
    getState,
    setSession,
    schedule,
    syncNow,
    destroy
  };
}

export function createSyncingStorage(storage, {
  scheduleSync,
  mutationMethods = syncMutationMethods
} = {}) {
  if (!storage || typeof storage !== "object") {
    throw new TypeError("A storage adapter is required.");
  }
  if (typeof scheduleSync !== "function") {
    throw new TypeError("scheduleSync must be a function.");
  }

  const mutations = new Set(mutationMethods);
  const methodCache = new Map();

  return new Proxy(storage, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (methodCache.has(property)) {
        return methodCache.get(property);
      }

      const method = mutations.has(property)
        ? async (...args) => {
            const result = await value.apply(target, args);
            scheduleSync(property);
            return result;
          }
        : value.bind(target);
      methodCache.set(property, method);
      return method;
    }
  });
}
