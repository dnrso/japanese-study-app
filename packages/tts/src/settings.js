export const TTS_ENGINE_BROWSER = "browser";
export const TTS_ENGINE_VOICEVOX = "voicevox";

export const ttsDefaultSettings = Object.freeze({
  engine: TTS_ENGINE_BROWSER,
  browserVoiceURI: "",
  voicevoxSpeakerId: "",
  rate: 1
});

export function normalizeTtsEngine(engine) {
  return engine === TTS_ENGINE_VOICEVOX ? TTS_ENGINE_VOICEVOX : TTS_ENGINE_BROWSER;
}

export function normalizeTtsRate(rate) {
  const value = Number(rate || ttsDefaultSettings.rate);
  return Number.isFinite(value) ? Math.min(2, Math.max(0.5, value)) : ttsDefaultSettings.rate;
}

export function normalizeTtsSettings(settings = {}) {
  return {
    engine: normalizeTtsEngine(settings.engine),
    browserVoiceURI: String(settings.browserVoiceURI || ttsDefaultSettings.browserVoiceURI),
    voicevoxSpeakerId: String(settings.voicevoxSpeakerId || ttsDefaultSettings.voicevoxSpeakerId),
    rate: normalizeTtsRate(settings.rate)
  };
}
