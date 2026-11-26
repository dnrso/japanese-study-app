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

export const BROWSER_JA_VOICE_MISSING_NOTICE =
  "일본어 음성이 설치되어 있지 않아 다른 언어 음성으로 읽힐 수 있습니다. OS 설정에서 일본어 음성을 추가하세요.";

// Higher-quality Japanese voices first: Edge/Windows neural ("Natural"/"Online",
// e.g. Microsoft Nanami), Chrome's "Google 日本語", Apple Kyoko / O-ren.
const PREFERRED_VOICE_PATTERNS = [/natural|online/i, /google/i, /kyoko|o-?ren/i];

function isJapaneseVoice(voice) {
  return /^ja([-_]|$)/i.test(String(voice?.lang || ""));
}

// Picks the best Japanese voice from speechSynthesis.getVoices(), or null.
// Order: preferred name pattern -> ja-JP localService -> localService -> ja-JP -> first Japanese voice.
export function pickJapaneseVoice(voices) {
  const japanese = Array.from(voices || []).filter(isJapaneseVoice);
  if (!japanese.length) return null;
  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    const match = japanese.find(voice => pattern.test(voice.name || ""));
    if (match) return match;
  }
  const isJaJp = voice => /^ja[-_]jp$/i.test(String(voice?.lang || ""));
  return japanese.find(voice => isJaJp(voice) && voice.localService)
    || japanese.find(voice => voice.localService)
    || japanese.find(isJaJp)
    || japanese[0];
}

// Firefox ignores utterance.lang when choosing a voice and uses the system
// default (e.g. Korean), so the Japanese voice must be set explicitly.
// The voice list loads asynchronously (getVoices() is [] until "voiceschanged"
// fires, notably on the first call in Chrome/Firefox).
export function createBrowserProvider({
  getSynth = () => globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  onMissingVoice = () => {},
  voiceTimeoutMs = 1500
} = {}) {
  let token = 0;
  let warnedMissing = false;
  let cachedVoices = [];
  let cachedVoice = null;
  let voicesLoaded = false;
  let watchedSynth = null;
  let listenedSynth = null;
  const waiters = new Set();

  function flushWaiters() {
    for (const resolve of waiters) resolve();
    waiters.clear();
  }

  function refreshVoices(synth) {
    const voices = synth.getVoices?.() || [];
    cachedVoices = voices;
    if (voices.length) {
      voicesLoaded = true;
      cachedVoice = pickJapaneseVoice(voices);
    } else {
      voicesLoaded = false;
      cachedVoice = null;
    }
  }

  function ensureSynth(synth) {
    if (watchedSynth !== synth) {
      watchedSynth = synth;
      cachedVoices = [];
      cachedVoice = null;
      voicesLoaded = false;
      flushWaiters();
    }
    if (listenedSynth !== synth && typeof synth.addEventListener === "function") {
      listenedSynth = synth;
      synth.addEventListener("voiceschanged", () => {
        if (watchedSynth !== synth) return;
        refreshVoices(synth);
        flushWaiters();
      });
    }
    if (!voicesLoaded) {
      refreshVoices(synth);
    }
  }

  function waitForVoices(synth) {
    if (voicesLoaded || typeof synth.addEventListener !== "function") {
      return null;
    }
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const timer = setTimeout(() => {
        if (watchedSynth === synth && !voicesLoaded) {
          refreshVoices(synth);
        }
        finish();
      }, voiceTimeoutMs);
    });
  }

  // Start loading the voice list early so the first speak() already has it.
  const initialSynth = getSynth();
  if (initialSynth) ensureSynth(initialSynth);

  return {
    id: "browser",
    isAvailable: () => Boolean(getSynth()),
    async speak(text) {
      const synth = getSynth();
      if (!synth) {
        return;
      }
      synth.cancel();
      const myToken = ++token;
      ensureSynth(synth);
      const pending = waitForVoices(synth);
      if (pending) {
        await pending;
        if (myToken !== token) return; // superseded by a newer speak()/stop()
      }

      const utterance = new Utterance(text);
      utterance.lang = "ja-JP";
      if (cachedVoice) {
        utterance.voice = cachedVoice;
      } else if (cachedVoices.length && !warnedMissing) {
        warnedMissing = true;
        onMissingVoice(BROWSER_JA_VOICE_MISSING_NOTICE);
      }
      synth.speak(utterance);
    },
    stop() {
      token += 1;
      flushWaiters();
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
