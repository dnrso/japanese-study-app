import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ttsChannels } = require("../apps/desktop/src/ttsChannels.js");

// The preload is evaluated with a fake require("electron"), the same way
// Electron's sandboxed preload sees it (no access to local files).
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

describe("desktop preload", () => {
  it("exposes desktopBridge.tts wired to the tts channels", async () => {
    const { exposed, ipcRenderer } = loadPreload();
    const bridge = exposed.desktopBridge;
    expect(bridge.platform).toBe("electron");
    expect(Object.keys(bridge.tts).sort()).toEqual(["getConfig", "health", "setConfig", "speakers", "synthesize"]);
    expect(bridge.ipcRenderer).toBeUndefined();

    await bridge.tts.speakers();
    await bridge.tts.synthesize({ text: "あ", speakerId: 1, rate: 1 });
    await bridge.tts.health();
    await bridge.tts.getConfig();
    await bridge.tts.setConfig({ baseUrl: "http://127.0.0.1:50021" });
    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [ttsChannels.voicevoxSpeakers],
      [ttsChannels.voicevoxSynthesize, { text: "あ", speakerId: 1, rate: 1 }],
      [ttsChannels.voicevoxHealth],
      [ttsChannels.getConfig],
      [ttsChannels.setConfig, { baseUrl: "http://127.0.0.1:50021" }]
    ]);
  });

  it("keeps the legacy ttsApi exposure on the same channels", async () => {
    const { exposed, ipcRenderer } = loadPreload();
    await exposed.ttsApi.getVoicevoxSpeakers();
    await exposed.ttsApi.synthesizeVoicevox({ text: "x" });
    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ["tts:voicevox-speakers"],
      ["tts:voicevox-synthesize", { text: "x" }]
    ]);
    expect(exposed.appInfo).toBeDefined();
    expect(exposed.studyData).toBeDefined();
  });
});
