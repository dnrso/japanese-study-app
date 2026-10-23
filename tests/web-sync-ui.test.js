import { describe, expect, it, vi } from "vitest";
import { applySyncResult } from "../apps/web/src/syncSetup.js";

function createCtx() {
  return {
    setState: vi.fn(),
    loadState: vi.fn(async date => ({ selectedDate: date, loaded: true })),
    getSelectedDate: vi.fn(() => "2026-01-02"),
    resetTransientUiState: vi.fn(),
    renderAll: vi.fn()
  };
}

describe("applySyncResult", () => {
  it("reloads the browsed date for a background sync and keeps transient UI state", async () => {
    const ctx = createCtx();

    const applied = await applySyncResult(ctx, { skipped: false, state: { selectedDate: "2026-07-27" } });

    expect(applied).toBe(true);
    expect(ctx.loadState).toHaveBeenCalledWith("2026-01-02");
    expect(ctx.setState).toHaveBeenCalledWith({ selectedDate: "2026-01-02", loaded: true });
    expect(ctx.resetTransientUiState).not.toHaveBeenCalled();
    expect(ctx.renderAll).toHaveBeenCalledTimes(1);
  });

  it("adopts the result state and resets transient UI state when resetUi is set", async () => {
    const ctx = createCtx();
    const state = { selectedDate: "2026-07-27" };

    const applied = await applySyncResult(ctx, { skipped: false, state }, { resetUi: true });

    expect(applied).toBe(true);
    expect(ctx.setState).toHaveBeenCalledWith(state);
    expect(ctx.resetTransientUiState).toHaveBeenCalledTimes(1);
    expect(ctx.loadState).not.toHaveBeenCalled();
    expect(ctx.renderAll).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a skipped result", { skipped: true, reason: "no-session" }],
    ["a result without state", { skipped: false }],
    ["no result", undefined]
  ])("does nothing for %s", async (_label, result) => {
    for (const options of [undefined, { resetUi: true }]) {
      const ctx = createCtx();

      expect(await applySyncResult(ctx, result, options)).toBe(false);

      expect(ctx.setState).not.toHaveBeenCalled();
      expect(ctx.loadState).not.toHaveBeenCalled();
      expect(ctx.resetTransientUiState).not.toHaveBeenCalled();
      expect(ctx.renderAll).not.toHaveBeenCalled();
    }
  });
});
