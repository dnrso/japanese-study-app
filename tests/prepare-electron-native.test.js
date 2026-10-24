import { describe, expect, it } from "vitest";
import {
  createNativeTarget,
  markerMatches
} from "../scripts/prepare-electron-native.mjs";

describe("Electron native dependency preparation", () => {
  const target = createNativeTarget({
    electronVersion: "41.7.2",
    betterSqlite3Version: "12.10.0",
    platform: "win32",
    arch: "x64"
  });

  it("describes the exact native runtime target", () => {
    expect(target).toEqual({
      runtime: "electron",
      electronVersion: "41.7.2",
      betterSqlite3Version: "12.10.0",
      platform: "win32",
      arch: "x64"
    });
  });

  it("reuses a binding only when its target and hash still match", () => {
    const marker = { ...target, bindingSha256: "electron-binding" };

    expect(markerMatches(marker, target, "electron-binding")).toBe(true);
    expect(markerMatches(marker, target, "node-binding")).toBe(false);
    expect(markerMatches(marker, { ...target, electronVersion: "42.0.0" }, "electron-binding")).toBe(false);
  });
});
