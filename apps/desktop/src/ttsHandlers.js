const path = require("node:path");
const { ttsChannels } = require("./ttsChannels");
const { readTtsConfig, writeTtsConfig } = require("./ttsConfig");

const MAX_TEXT_LENGTH = 1000;
const MIN_RATE = 0.5;
const MAX_RATE = 2;
const HEALTH_TIMEOUT_MS = 2000;

let voicevoxModulePromise = null;

function loadVoicevoxModule() {
  if (!voicevoxModulePromise) {
    voicevoxModulePromise = import("../../../packages/tts/src/index.js");
  }
  return voicevoxModulePromise;
}

async function defaultCreateClient(baseUrl, fetchImpl) {
  const { createVoicevoxClient } = await loadVoicevoxModule();
  return createVoicevoxClient({ baseUrl, fetchImpl });
}

function defaultConfigPath() {
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "tts.json");
}

function validateSynthesizePayload(payload) {
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new Error("재생할 텍스트가 비어 있습니다.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`텍스트가 너무 깁니다. (최대 ${MAX_TEXT_LENGTH}자)`);
  }
  // The legacy renderer sends speakerId as a numeric string; accept both.
  const speakerValue = typeof payload.speakerId === "string" && /^\d+$/.test(payload.speakerId.trim())
    ? Number(payload.speakerId)
    : payload.speakerId;
  if (!Number.isInteger(speakerValue) || speakerValue < 0) {
    throw new Error("speakerId가 올바르지 않습니다.");
  }
  let rate = 1;
  if (payload.rate !== undefined && payload.rate !== null && payload.rate !== "") {
    rate = Number(payload.rate);
    if (!Number.isFinite(rate)) {
      throw new Error("rate가 올바르지 않습니다.");
    }
  }
  return {
    text,
    speakerId: String(speakerValue),
    rate: Math.min(MAX_RATE, Math.max(MIN_RATE, rate))
  };
}

// deps (all optional, for tests): configPath, fetchImpl, createClient(baseUrl, fetchImpl), fs.
function registerTtsHandlers(ipcMain, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const createClient = deps.createClient || defaultCreateClient;
  const configFile = () => deps.configPath || defaultConfigPath();
  const currentConfig = () => readTtsConfig(configFile(), deps.fs);
  const clientFor = () => createClient(currentConfig().baseUrl, fetchImpl);

  ipcMain.handle(ttsChannels.voicevoxSpeakers, async () => {
    const voicevoxClient = await clientFor();
    return voicevoxClient.getSpeakers();
  });

  ipcMain.handle(ttsChannels.voicevoxSynthesize, async (_event, payload) => {
    const request = validateSynthesizePayload(payload);
    const voicevoxClient = await clientFor();
    const result = await voicevoxClient.synthesize(request);
    return {
      mimeType: result.mimeType,
      audioData: Buffer.from(result.audioData)
    };
  });

  ipcMain.handle(ttsChannels.voicevoxHealth, async () => {
    const { baseUrl } = currentConfig();
    try {
      const response = await fetchImpl(new URL("/version", baseUrl), {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
      });
      if (!response.ok) {
        return { ok: false, baseUrl, error: `VOICEVOX 엔진이 오류를 반환했습니다. (${response.status})` };
      }
      const version = await response.json().catch(() => "");
      return { ok: true, version: String(version || ""), baseUrl };
    } catch {
      return { ok: false, baseUrl, error: `VOICEVOX 엔진에 연결할 수 없습니다. (${baseUrl}) 엔진이 실행 중인지 확인하세요.` };
    }
  });

  ipcMain.handle(ttsChannels.getConfig, async () => currentConfig());

  ipcMain.handle(ttsChannels.setConfig, async (_event, config) => writeTtsConfig(configFile(), config, deps.fs));
}

module.exports = { registerTtsHandlers, validateSynthesizePayload };
