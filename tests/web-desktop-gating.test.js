import { describe, expect, it } from "vitest";
import { tocByPage } from "@nihongo-study/ui";
import { isDesktopApp } from "../apps/web/src/platform.js";
import { applyDesktopGating, filterTocForPlatform } from "../apps/web/src/desktopGating.js";
import { createDisabledSync } from "../apps/web/src/syncSetup.js";

function fakeRoot(selectors) {
  const elements = {};
  const make = () => ({ hidden: false, style: {} });
  selectors.forEach(selector => { elements[selector] = make(); });
  const checkbox = { checked: true, disabled: false };
  return {
    elements,
    checkbox,
    querySelectorAll: selector => elements[selector] ? [elements[selector]] : [],
    querySelector: selector => selector === "#aiSentenceAnalysisCheckbox" ? checkbox : null
  };
}

describe("isDesktopApp", () => {
  it("is true only when the Electron desktopBridge is present", () => {
    expect(isDesktopApp({ desktopBridge: { platform: "electron" } })).toBe(true);
    expect(isDesktopApp({ desktopBridge: { platform: "other" } })).toBe(false);
    expect(isDesktopApp({})).toBe(false);
    expect(isDesktopApp(undefined)).toBe(false);
  });
});

describe("applyDesktopGating", () => {
  it("hides (does not remove) the account section and AI toggle, and disables the AI checkbox", () => {
    const root = fakeRoot(["#settings-account", ".ai-sentence-analysis-toggle"]);
    applyDesktopGating(root);
    Object.values(root.elements).forEach(element => {
      expect(element.hidden).toBe(true);
      expect(element.style.display).toBe("none");
    });
    expect(root.checkbox.checked).toBe(false);
    expect(root.checkbox.disabled).toBe(true);
  });
});

describe("filterTocForPlatform", () => {
  it("drops the account entry on desktop only", () => {
    const toc = tocByPage.settings;
    expect(filterTocForPlatform(toc, true).map(item => item[0])).not.toContain("settings-account");
    expect(filterTocForPlatform(toc, false)).toEqual(toc);
  });
});

describe("createDisabledSync", () => {
  it("is permanently disabled and never signs in", async () => {
    const sync = createDisabledSync();
    expect(sync.isEnabled).toBe(false);
    expect(await sync.getSession()).toBeNull();
    expect(await sync.syncNow()).toEqual({ skipped: true, reason: "disabled" });
    expect(await sync.signInWithGoogle()).toEqual({ skipped: true, reason: "disabled" });
    const seen = [];
    sync.onAuthChange(session => seen.push(session));
    await Promise.resolve();
    expect(seen).toEqual([null]);
  });
});
