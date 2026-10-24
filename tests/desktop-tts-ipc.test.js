import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { registerTtsHandlers } = require("../apps/desktop/src/ttsHandlers.js");
const { ttsChannels } = require("../apps/desktop/src/ttsChannels.js");
const { DEFAULT_BASE_URL, normalizeBaseUrl, readTtsConfig, writeTtsConfig } = require("../apps/desktop/src/ttsConfig.js");

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: (channel, fn) => handlers.set(channel, fn),
    invoke: (channel, ...args) => handlers.get(channel)({}, ...args)
  };
}

let tmpDir;
let configPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nihongo-tts-"));
  configPath = path.join(tmpDir, "tts.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function setup(overrides = {}) {
  const ipc = fakeIpcMain();
  const client = {
    getSpeakers: vi.fn(async () => [{ name: "A", styles: [{ id: 1, name: "n" }] }]),
    synthesize: vi.fn(async () => ({ mimeType: "audio/wav", audioData: new Uint8Array([1, 2, 3]).buffer }))
  };
  const createClient = vi.fn(async () => client);
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => "0.14.0" }));
  registerTtsHandlers(ipc, { configPath, createClient, fetchImpl, ...overrides });
  return { ipc, client, createClient, fetchImpl };
}

describe("tts channels", () => {
  it("registers every channel, keeping the legacy names", () => {
    const { ipc } = setup();
    expect(ttsChannels.voicevoxSpeakers).toBe("tts:voicevox-speakers");
    expect(ttsChannels.voicevoxSynthesize).toBe("tts:voicevox-synthesize");
    expect([...ipc.handlers.keys()].sort()).toEqual(Object.values(ttsChannels).sort());
    expect(Object.values(ttsChannels)).toEqual(expect.arrayContaining(["tts:voicevox-health", "tts:get-config", "tts:set-config"]));
  });
});

describe("tts:voicevox-health", () => {
  it("reports ok with version from the configured base url", async () => {
    const { ipc, fetchImpl } = setup();
    const result = await ipc.invoke(ttsChannels.voicevoxHealth);
    expect(result).toEqual({ ok: true, version: "0.14.0", baseUrl: DEFAULT_BASE_URL });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${DEFAULT_BASE_URL}/version`);
  });

  it("returns ok:false with a friendly error instead of throwing when the engine is down", async () => {
    const { ipc } = setup({ fetchImpl: vi.fn(async () => { throw new TypeError("fetch failed"); }) });
    const result = await ipc.invoke(ttsChannels.voicevoxHealth);
    expect(result.ok).toBe(false);
    expect(result.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(result.error).toContain("VOICEVOX");
    expect(result.error).not.toContain("fetch failed");
  });

  it("returns ok:false on a non-2xx response", async () => {
    const { ipc } = setup({ fetchImpl: vi.fn(async () => ({ ok: false, status: 500 })) });
    expect((await ipc.invoke(ttsChannels.voicevoxHealth)).ok).toBe(false);
  });
});

describe("tts config", () => {
  it("defaults when no file exists", async () => {
    const { ipc } = setup();
    expect(await ipc.invoke(ttsChannels.getConfig)).toEqual({ baseUrl: DEFAULT_BASE_URL });
  });

  it.each([
    "http://example.com:50021",
    "http://192.168.0.5:50021",
    "http://127.0.0.1.evil.com",
    "ftp://127.0.0.1",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://user:pw@127.0.0.1:50021",
    "not a url",
    ""
  ])("rejects %j", async value => {
    const { ipc } = setup();
    await expect(ipc.invoke(ttsChannels.setConfig, { baseUrl: value })).rejects.toThrow();
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("accepts loopback hosts, persists and reloads from file", async () => {
    const { ipc } = setup();
    expect(await ipc.invoke(ttsChannels.setConfig, { baseUrl: "http://localhost:6000/" })).toEqual({ baseUrl: "http://localhost:6000" });
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({ baseUrl: "http://localhost:6000" });
    expect(readTtsConfig(configPath)).toEqual({ baseUrl: "http://localhost:6000" });

    // A fresh registration (app restart) sees the saved value.
    const second = setup();
    expect(await second.ipc.invoke(ttsChannels.getConfig)).toEqual({ baseUrl: "http://localhost:6000" });

    expect(await ipc.invoke(ttsChannels.setConfig, { baseUrl: "https://127.0.0.1:50021" })).toEqual({ baseUrl: "https://127.0.0.1:50021" });
    expect(normalizeBaseUrl("http://[::1]:50021")).toBe("http://[::1]:50021");
  });

  it("falls back to the default for a corrupt or tampered file", () => {
    fs.writeFileSync(configPath, "{not json");
    expect(readTtsConfig(configPath)).toEqual({ baseUrl: DEFAULT_BASE_URL });
    fs.writeFileSync(configPath, JSON.stringify({ baseUrl: "http://evil.example.com" }));
    expect(readTtsConfig(configPath)).toEqual({ baseUrl: DEFAULT_BASE_URL });
    expect(() => writeTtsConfig(configPath, { baseUrl: "http://evil.example.com" })).toThrow();
  });

  it("uses the configured base url for health, speakers and synthesize", async () => {
    const { ipc, createClient, fetchImpl } = setup();
    await ipc.invoke(ttsChannels.setConfig, { baseUrl: "http://localhost:7777" });
    await ipc.invoke(ttsChannels.voicevoxHealth);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://localhost:7777/version");
    await ipc.invoke(ttsChannels.voicevoxSpeakers);
    await ipc.invoke(ttsChannels.voicevoxSynthesize, { text: "こんにちは", speakerId: 3, rate: 1 });
    expect(createClient.mock.calls.map(call => call[0])).toEqual(["http://localhost:7777", "http://localhost:7777"]);
  });
});

describe("tts:voicevox-synthesize", () => {
  it("returns legacy-shaped bytes and normalizes the payload", async () => {
    const { ipc, client } = setup();
    const result = await ipc.invoke(ttsChannels.voicevoxSynthesize, { text: " 猫 ", speakerId: "3", rate: 5 });
    expect(result.mimeType).toBe("audio/wav");
    expect(Buffer.isBuffer(result.audioData)).toBe(true);
    expect([...result.audioData]).toEqual([1, 2, 3]);
    expect(client.synthesize).toHaveBeenCalledWith({ text: "猫", speakerId: "3", rate: 2 });
  });

  it.each([
    ["empty text", { text: "", speakerId: 1 }],
    ["whitespace text", { text: "   ", speakerId: 1 }],
    ["non-string text", { text: 5, speakerId: 1 }],
    ["huge text", { text: "あ".repeat(1001), speakerId: 1 }],
    ["missing speaker", { text: "あ" }],
    ["fractional speaker", { text: "あ", speakerId: 1.5 }],
    ["non-numeric speaker", { text: "あ", speakerId: "abc" }],
    ["negative speaker", { text: "あ", speakerId: -1 }],
    ["NaN rate", { text: "あ", speakerId: 1, rate: "fast" }],
    ["no payload", undefined]
  ])("rejects %s without calling the engine", async (_name, payload) => {
    const { ipc, client } = setup();
    await expect(ipc.invoke(ttsChannels.voicevoxSynthesize, payload)).rejects.toThrow();
    expect(client.synthesize).not.toHaveBeenCalled();
  });
});
