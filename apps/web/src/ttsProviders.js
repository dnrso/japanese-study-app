// Speech providers behind main.js speak(). Order of preference:
//   desktop bridge (VOICEVOX) -> Capacitor native TTS -> browser speechSynthesis.
// A provider is { id, isAvailable(), speak(text, opts), stop() }.

import { voicevoxSpeakerOptions } from "@nihongo-study/tts";

export const VOICEVOX_FALLBACK_NOTICE = "VOICEVOX 엔진을 사용할 수 없어 브라우저 음성으로 재생합니다.";

function toAudioBlobPart(audioData) {
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

// Higher-quality Japanese voices first: Edge/Windows neural ("Natural"/"Online",
// e.g. Microsoft Nanami), Chrome's "Google 日本語", Apple Kyoko / O-ren.
const PREFERRED_VOICE_PATTERNS = [/natural|online/i, /google/i, /kyoko|o-?ren/i];

function isJapaneseVoice(voice) {
  return /^ja([-_]|$)/i.test(String(voice?.lang || ""));
}

// Picks the best Japanese voice from speechSynthesis.getVoices(), or null.
// Order: preferred name pattern -> localService -> first Japanese voice.
export function pickJapaneseVoice(voices) {
  const japanese = Array.from(voices || []).filter(isJapaneseVoice);
  if (!japanese.length) return null;
  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    const match = japanese.find(voice => pattern.test(voice.name || ""));
    if (match) return match;
  }
  return japanese.find(voice => voice.localService) || japanese[0];
}

export function createBrowserProvider({
  getSynth = () => globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance
} = {}) {
  let cachedVoice; // undefined = not resolved yet, null = no Japanese voice
  let watched = null;

  function refreshVoice(synth) {
    const voices = synth.getVoices?.() || [];
    // Chrome returns [] until voices load; stay unresolved so we retry.
    cachedVoice = voices.length ? pickJapaneseVoice(voices) : undefined;
  }

  function japaneseVoice(synth) {
    if (watched !== synth && synth.addEventListener) {
      watched = synth;
      synth.addEventListener("voiceschanged", () => refreshVoice(synth));
    }
    if (cachedVoice === undefined) refreshVoice(synth);
    return cachedVoice || null;
  }

  // Start loading the voice list early so the first speak() already has it.
  const initialSynth = getSynth();
  if (initialSynth) japaneseVoice(initialSynth);

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
      const voice = japaneseVoice(synth);
      if (voice) utterance.voice = voice;
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
