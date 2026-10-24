import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { migrationChannels } = require("../apps/desktop/src/migrationChannels.js");

function loadPreload() {
  const exposed = {};
  const ipcRenderer = { invoke: vi.fn(async () => "result") };
  const contextBridge = { exposeInMainWorld: (name, api) => { exposed[name] = api; } };
  const source = fs.readFileSync(path.resolve(__dirname, "../apps/desktop/src/preload.js"), "utf8");
  const fakeRequire = id => {
    if (id !== "electron") throw new Error(`unexpected require: ${id}`);
    return { contextBridge, ipcRenderer };
  };
  new Function("require", source)(fakeRequire);
  return { exposed, ipcRenderer };
}

describe("desktop preload migration bridge", () => {
  it("exposes desktopBridge.migration wired to the (inlined) migration channels", async () => {
    const { exposed, ipcRenderer } = loadPreload();
    const migration = exposed.desktopBridge.migration;
    expect(Object.keys(migration).sort()).toEqual(["complete", "fail", "getPending"]);

    await migration.getPending();
    await migration.complete({ items: 3 });
    await migration.fail("boom");
    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [migrationChannels.getPending],
      [migrationChannels.complete, { counts: { items: 3 } }],
      [migrationChannels.fail, { message: "boom" }]
    ]);
  });

  it("keeps the preload's inlined channel names identical to migrationChannels.js", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../apps/desktop/src/preload.js"), "utf8");
    const block = /const migrationChannels = (\{[\s\S]*?\});/.exec(source)[1];
    expect(new Function(`return ${block}`)()).toEqual(migrationChannels);
  });
});
