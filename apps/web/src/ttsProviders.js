// Speech providers behind main.js speak(). Order of preference:
//   desktop bridge (VOICEVOX) -> Capacitor native TTS -> browser speechSynthesis.
// A provider is { id, isAvailable(), speak(text, opts), stop() }.

import { voicevoxSpeakerOptions } from "@nihongo-study/tts";

export const VOICEVOX_FALLBACK_NOTICE = "VOICEVOX 엔진을 사용할 수 없어 브라우저 음성으로 재생합니다.";

export function toAudioBlobPart(audioData) {
  if (audioData instanceof ArrayBuffer || ArrayBuffer.isView(audioData)) {
    return audioData;
  }
  if (Array.isArray(audioData)) {
    return new Uint8Array(audioData);
  }
  if (Array.isArray(audioData?.data)) {
    return new Uint8Array(audioData.data);
  }
  return audioData;
}

// getSettings() -> { speakerId, rate } (both optional). When no speaker has
// been chosen the first available talk style is used.
export function createDesktopVoicevoxProvider(bridgeTts, {
  AudioCtor = globalThis.Audio,
  URL: UrlApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  getSettings = () => ({})
} = {}) {
  let current = null; // { audio, url }
  let token = 0;
  let defaultSpeakerId = "";

  function release(entry) {
    if (!entry) return;
    if (current === entry) current = null;
    if (entry.url) {
      UrlApi.revokeObjectURL(entry.url);
      entry.url = "";
    }
  }

  function stop() {
    token += 1;
    const entry = current;
    if (entry) {
      entry.audio.pause();
      release(entry);
    }
  }

  async function resolveSpeakerId(opts) {
    const chosen = opts.speakerId ?? getSettings().speakerId;
    if (chosen !== undefined && chosen !== null && chosen !== "") return String(chosen);
    if (!defaultSpeakerId) {
      defaultSpeakerId = voicevoxSpeakerOptions(await bridgeTts.speakers())[0]?.id || "";
    }
    if (!defaultSpeakerId) throw new Error("사용 가능한 VOICEVOX speaker가 없습니다.");
    return defaultSpeakerId;
  }

  async function speak(text, opts = {}) {
    stop();
    const myToken = token;
    const speakerId = await resolveSpeakerId(opts);
    const rate = opts.rate ?? getSettings().rate ?? 1;
    const result = await bridgeTts.synthesize({ text, speakerId: Number(speakerId), rate });
    if (myToken !== token) return; // superseded by a newer speak()/stop()

    const blob = new BlobCtor([toAudioBlobPart(result.audioData)], { type: result.mimeType || "audio/wav" });
    const entry = { audio: null, url: UrlApi.createObjectURL(blob) };
    entry.audio = new AudioCtor(entry.url);
    entry.audio.onended = () => release(entry);
    entry.audio.onerror = () => release(entry);
    current = entry;
    try {
      await entry.audio.play();
    } catch (error) {
      release(entry);
      throw error;
    }
  }

  return {
    id: "voicevox",
    isAvailable: () => Boolean(bridgeTts?.synthesize),
    speak,
    stop
  };
}

export function createCapacitorProvider(TextToSpeech, { isNative = () => false, warn = console.warn } = {}) {
  return {
    id: "capacitor",
    isAvailable: () => Boolean(isNative()),
    speak(text) {
      TextToSpeech.speak({ text, lang: "ja-JP", rate: 0.95 }).catch(error => {
        // e.g. no TTS engine or no Japanese voice installed on the device -
        // degrade to silence instead of crashing the UI.
        warn("네이티브 TTS 재생에 실패했습니다:", error);
      });
    },
    stop() {}
  };
}

export function createBrowserProvider({
  getSynth = () => globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance
} = {}) {
  return {
    id: "browser",
    isAvailable: () => Boolean(getSynth()),
    speak(text) {
      const synth = getSynth();
      if (!synth) {
        return;
      }
      synth.cancel();
      const utterance = new Utterance(text);
      utterance.lang = "ja-JP";
      synth.speak(utterance);
    },
    stop() {
      getSynth()?.cancel();
    }
  };
}

// Ordered provider list for the current platform.
export function selectSpeechProviders({ desktopTts, isNative, voicevox, capacitor, browser }) {
  if (desktopTts) return [voicevox, browser];
  if (isNative) return [capacitor];
  return [browser];
}

// Calls the first available provider. If VOICEVOX fails (engine down), the
// same call falls back to the browser provider and onNotice() is told.
export function createSpeechChain(providers, { onNotice = () => {}, warn = console.warn } = {}) {
  let latest = 0;

  async function speak(text) {
    const targetText = String(text || "").trim();
    if (!targetText) {
      return;
    }
    const [primary, ...rest] = providers.filter(provider => provider.isAvailable());
    if (!primary) {
      return;
    }
    const call = ++latest;
    providers.filter(provider => provider !== primary).forEach(provider => provider.stop());
    try {
      await primary.speak(targetText);
    } catch (error) {
      const fallback = rest[0];
      if (call !== latest) {
        return; // a newer speak() superseded this one; do not speak stale text
      }
      if (!fallback) {
        warn("음성 재생에 실패했습니다:", error);
        return;
      }
      warn(`${primary.id} 재생에 실패하여 ${fallback.id}로 대체합니다:`, error);
      onNotice(VOICEVOX_FALLBACK_NOTICE);
      await fallback.speak(targetText);
    }
  }

  function stop() {
    latest += 1;
    providers.forEach(provider => provider.stop());
  }

  return { speak, stop };
}
