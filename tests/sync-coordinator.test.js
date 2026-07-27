import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSyncCoordinator,
  createSyncingStorage
} from "../packages/sync/src/index.js";
import {
  renderAccountStatus,
  wireAuthChange
} from "../apps/web/src/syncSetup.js";

function session(id = "user-1") {
  return { user: { id, email: `${id}@example.com` } };
}

function successfulResult(state = { selectedDate: "2026-07-27" }) {
  return { skipped: false, state };
}

function deferred() {
  let resolve;
  const promise = new Promise(next => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSyncCoordinator", () => {
  it("debounces local changes into one authenticated sync", async () => {
    vi.useFakeTimers();
    const sync = {
      isEnabled: true,
      syncNow: vi.fn().mockResolvedValue(successfulResult())
    };
    const coordinator = createSyncCoordinator({ sync, debounceMs: 50 });
    coordinator.setSession(session());

    coordinator.schedule();
    coordinator.schedule();
    await vi.advanceTimersByTimeAsync(49);
    expect(sync.syncNow).not.toHaveBeenCalled();

    coordinator.schedule();
    await vi.advanceTimersByTimeAsync(50);
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().status).toBe("success");
  });

  it("coalesces changes during a run into one follow-up run", async () => {
    const first = deferred();
    const sync = {
      isEnabled: true,
      syncNow: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValue(successfulResult())
    };
    const coordinator = createSyncCoordinator({ sync });
    coordinator.setSession(session());

    const running = coordinator.syncNow();
    await vi.waitFor(() => expect(sync.syncNow).toHaveBeenCalledTimes(1));
    coordinator.schedule();
    coordinator.schedule();
    first.resolve(successfulResult());

    await running;
    expect(sync.syncNow).toHaveBeenCalledTimes(2);
  });

  it("exposes a failed sync and recovers through manual retry", async () => {
    const error = new Error("offline");
    const onError = vi.fn();
    const sync = {
      isEnabled: true,
      syncNow: vi.fn()
        .mockResolvedValueOnce({ skipped: true, reason: "error", error })
        .mockResolvedValueOnce(successfulResult())
    };
    const coordinator = createSyncCoordinator({
      sync,
      now: () => new Date("2026-07-27T03:04:05.000Z"),
      onError
    });
    coordinator.setSession(session());

    await coordinator.syncNow();
    expect(coordinator.getState()).toMatchObject({ status: "error", error });
    expect(onError).toHaveBeenCalledWith(error);

    await coordinator.syncNow();
    expect(coordinator.getState()).toMatchObject({
      status: "success",
      error: null,
      lastSuccessAt: "2026-07-27T03:04:05.000Z"
    });
  });

  it("does not call the sync implementation while disabled or signed out", async () => {
    const disabledSync = { isEnabled: false, syncNow: vi.fn() };
    const disabled = createSyncCoordinator({ sync: disabledSync });
    disabled.setSession(session());

    expect(disabled.schedule()).toMatchObject({ scheduled: false, reason: "disabled" });
    await expect(disabled.syncNow()).resolves.toMatchObject({ skipped: true, reason: "disabled" });
    expect(disabledSync.syncNow).not.toHaveBeenCalled();

    const signedOutSync = { isEnabled: true, syncNow: vi.fn() };
    const signedOut = createSyncCoordinator({ sync: signedOutSync });
    expect(signedOut.schedule()).toMatchObject({ scheduled: false, reason: "no-session" });
    await expect(signedOut.syncNow()).resolves.toMatchObject({ skipped: true, reason: "no-session" });
    expect(signedOutSync.syncNow).not.toHaveBeenCalled();
    expect(signedOut.getState().authenticated).toBe(false);
  });

  it("stops scheduling after the sync implementation reports an expired session", async () => {
    const sync = {
      isEnabled: true,
      syncNow: vi.fn().mockResolvedValue({ skipped: true, reason: "no-session" })
    };
    const coordinator = createSyncCoordinator({ sync });
    coordinator.setSession(session());

    await coordinator.syncNow();
    expect(coordinator.getState()).toMatchObject({ status: "idle", authenticated: false });
    expect(coordinator.schedule()).toMatchObject({ scheduled: false, reason: "no-session" });
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
  });

  it("ignores an in-flight result after the user signs out", async () => {
    const inFlight = deferred();
    const onSyncSuccess = vi.fn();
    const sync = {
      isEnabled: true,
      syncNow: vi.fn().mockImplementation(() => inFlight.promise)
    };
    const coordinator = createSyncCoordinator({ sync, onSyncSuccess });
    coordinator.setSession(session());

    const running = coordinator.syncNow();
    await vi.waitFor(() => expect(sync.syncNow).toHaveBeenCalledTimes(1));
    coordinator.setSession(null);
    inFlight.resolve(successfulResult({ selectedDate: "2026-07-28" }));

    await expect(running).resolves.toMatchObject({
      skipped: true,
      reason: "session-changed"
    });
    expect(onSyncSuccess).not.toHaveBeenCalled();
    expect(coordinator.getState()).toMatchObject({
      status: "idle",
      authenticated: false,
      lastSuccessAt: null
    });
  });
});

describe("createSyncingStorage", () => {
  it("schedules only after a successful mutation", async () => {
    const scheduleSync = vi.fn();
    const error = new Error("write failed");
    const storage = {
      paths: { appDataDir: "idb", exportsDir: "downloads", backupsDir: "downloads", dbPath: "idb" },
      getState: vi.fn().mockResolvedValue({}),
      addTask: vi.fn().mockResolvedValue({ tasks: [] }),
      upsertItem: vi.fn().mockRejectedValue(error)
    };
    const wrapped = createSyncingStorage(storage, { scheduleSync });

    await wrapped.getState();
    expect(scheduleSync).not.toHaveBeenCalled();

    await wrapped.addTask({ title: "복습" });
    expect(scheduleSync).toHaveBeenCalledWith("addTask");

    await expect(wrapped.upsertItem({ title: "실패" })).rejects.toBe(error);
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });
});

describe("web auth and status wiring", () => {
  it("runs the initial pull once when an authenticated session appears", async () => {
    let authCallback;
    let accountSession = null;
    const sync = {
      isEnabled: true,
      onAuthChange: vi.fn(callback => {
        authCallback = callback;
        return () => {};
      })
    };
    const syncCoordinator = {
      setSession: vi.fn(),
      syncNow: vi.fn().mockResolvedValue(successfulResult()),
      getState: vi.fn(() => ({ status: "idle", lastSuccessAt: null, error: null }))
    };
    const ctx = {
      sync,
      syncCoordinator,
      getAccountSession: () => accountSession,
      setAccountSession: next => {
        accountSession = next;
      },
      renderAccountStatus: vi.fn()
    };

    wireAuthChange(ctx);
    await authCallback(null);
    expect(syncCoordinator.syncNow).not.toHaveBeenCalled();

    const authenticated = session();
    await authCallback(authenticated);
    expect(syncCoordinator.setSession).toHaveBeenLastCalledWith(authenticated);
    expect(syncCoordinator.syncNow).toHaveBeenCalledTimes(1);

    await authCallback(authenticated);
    expect(syncCoordinator.syncNow).toHaveBeenCalledTimes(1);
  });

  it("renders idle, syncing, success, error, last-success, and retry availability", () => {
    const elements = new Map([
      ["googleSignInBtn", {}],
      ["googleSignOutBtn", {}],
      ["accountStatus", {}],
      ["syncStatus", {}],
      ["syncLastSuccess", {}],
      ["syncRetryBtn", {}]
    ]);
    const account = session();
    let coordinatorState = {
      status: "idle",
      lastSuccessAt: null,
      error: null,
      authenticated: true
    };
    const ctx = {
      byId: id => elements.get(id),
      sync: { isEnabled: true },
      syncCoordinator: {
        getState: () => coordinatorState
      },
      getAccountSession: () => account,
      getAiSentenceAnalysisEnabled: () => false,
      setAiSentenceAnalysisEnabled: vi.fn(),
      updateDailyEntryPlaceholder: vi.fn()
    };

    renderAccountStatus(ctx);
    expect(elements.get("syncStatus").textContent).toBe("동기화 대기");

    coordinatorState = { ...coordinatorState, status: "syncing" };
    renderAccountStatus(ctx);
    expect(elements.get("syncStatus").textContent).toBe("동기화 중");
    expect(elements.get("syncRetryBtn").disabled).toBe(true);

    coordinatorState = {
      status: "success",
      lastSuccessAt: "2026-07-27T03:04:05.000Z",
      error: null,
      authenticated: true
    };
    renderAccountStatus(ctx);
    expect(elements.get("syncStatus").textContent).toBe("동기화 완료");
    expect(elements.get("syncLastSuccess").textContent).toContain("마지막 성공:");

    coordinatorState = { ...coordinatorState, status: "error", error: new Error("offline") };
    renderAccountStatus(ctx);
    expect(elements.get("syncStatus").textContent).toBe("동기화 실패: offline");
    expect(elements.get("syncRetryBtn").disabled).toBe(false);
  });
});
