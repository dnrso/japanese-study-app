import { describe, expect, it, vi } from "vitest";
import { tocByPage } from "@nihongo-study/ui";
import { voicevoxSpeakerOptions } from "@nihongo-study/tts";
import {
  VOICEVOX_FALLBACK_NOTICE,
  createBrowserProvider,
  createCapacitorProvider,
  createDesktopVoicevoxProvider,
  createSpeechChain,
  selectSpeechProviders
} from "../apps/web/src/ttsProviders.js";
import { filterTocForPlatform } from "../apps/web/src/desktopGating.js";
import { renderSpeakerOptions } from "../apps/web/src/voicevoxSettings.js";

function fakeEnv() {
  const audios = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.pause = vi.fn();
      this.play = vi.fn(async () => {});
      audios.push(this);
    }
  }
  let counter = 0;
  const URLApi = {
    createObjectURL: vi.fn(() => `blob:fake-${++counter}`),
    revokeObjectURL: vi.fn()
  };
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  }
  return { audios, AudioCtor: FakeAudio, URL: URLApi, BlobCtor: FakeBlob };
}

function bridge(overrides = {}) {
  return {
    speakers: vi.fn(async () => [{ name: "A", styles: [{ id: 2, name: "n" }, { id: 9, name: "x", type: "sing" }] }]),
    synthesize: vi.fn(async () => ({ mimeType: "audio/wav", audioData: new Uint8Array([1, 2]) })),
    ...overrides
  };
}

describe("desktop voicevox provider", () => {
  it("synthesizes, plays from a blob URL and revokes it when playback ends", async () => {
    const env = fakeEnv();
    const tts = bridge();
    const provider = createDesktopVoicevoxProvider(tts, { ...env, getSettings: () => ({ speakerId: "3", rate: 1.2 }) });
    expect(provider.id).toBe("voicevox");
    expect(provider.isAvailable()).toBe(true);

    await provider.speak("猫");
    expect(tts.synthesize).toHaveBeenCalledWith({ text: "猫", speakerId: 3, rate: 1.2 });
    expect(env.URL.createObjectURL.mock.calls[0][0].type).toBe("audio/wav");
    expect(env.audios[0].url).toBe("blob:fake-1");
    expect(env.audios[0].play).toHaveBeenCalled();
    expect(env.URL.revokeObjectURL).not.toHaveBeenCalled();

    env.audios[0].onended();
    expect(env.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");
    env.audios[0].onended();
    expect(env.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes on error and on play() rejection (and rethrows)", async () => {
    const env = fakeEnv();
    const provider = createDesktopVoicevoxProvider(bridge(), env);
    await provider.speak("a");
    env.audios[0].onerror();
    expect(env.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");

    const failingEnv = fakeEnv();
    failingEnv.AudioCtor = class { constructor() { this.play = async () => { throw new Error("blocked"); }; this.pause = vi.fn(); } };
    const failing = createDesktopVoicevoxProvider(bridge(), failingEnv);
    await expect(failing.speak("a")).rejects.toThrow("blocked");
    expect(failingEnv.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");
  });

  it("stop() pauses the current audio and revokes its URL", async () => {
    const env = fakeEnv();
    const provider = createDesktopVoicevoxProvider(bridge(), env);
    await provider.speak("a");
    provider.stop();
    expect(env.audios[0].pause).toHaveBeenCalled();
    expect(env.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");
    provider.stop();
    expect(env.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("a new speak() cancels the previous one, including one still synthesizing", async () => {
    const env = fakeEnv();
    let release;
    const tts = bridge({
      synthesize: vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ audioData: new Uint8Array([1]) }); }))
        .mockImplementation(async () => ({ audioData: new Uint8Array([2]) }))
    });
    const provider = createDesktopVoicevoxProvider(tts, { ...env, getSettings: () => ({ speakerId: "1" }) });
    const first = provider.speak("one");
    const second = provider.speak("two");
    await second;
    release();
    await first;
    expect(env.audios).toHaveLength(1); // the stale synthesis was dropped
    await provider.speak("three");
    expect(env.audios[0].pause).toHaveBeenCalled();
    expect(env.URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-1");
  });

  it("picks the first talk speaker when none is chosen", async () => {
    const env = fakeEnv();
    const tts = bridge();
    await createDesktopVoicevoxProvider(tts, env).speak("a");
    expect(tts.synthesize.mock.calls[0][0].speakerId).toBe(2);
  });

  it("is unavailable without a bridge", () => {
    expect(createDesktopVoicevoxProvider(undefined, fakeEnv()).isAvailable()).toBe(false);
  });
});

describe("browser and capacitor providers", () => {
  it("browser provider cancels then speaks ja-JP, and is unavailable without speechSynthesis", () => {
    const synth = { cancel: vi.fn(), speak: vi.fn() };
    class Utterance { constructor(text) { this.text = text; } }
    const provider = createBrowserProvider({ getSynth: () => synth, Utterance });
    provider.speak("猫");
    expect(synth.cancel).toHaveBeenCalledBefore(synth.speak);
    expect(synth.speak.mock.calls[0][0]).toMatchObject({ text: "猫", lang: "ja-JP" });
    expect(createBrowserProvider({ getSynth: () => undefined, Utterance }).isAvailable()).toBe(false);
  });

  it("capacitor provider keeps lang/rate and swallows failures", async () => {
    const TextToSpeech = { speak: vi.fn(async () => { throw new Error("no engine"); }) };
    const warn = vi.fn();
    const provider = createCapacitorProvider(TextToSpeech, { isNative: () => true, warn });
    provider.speak("猫");
    expect(TextToSpeech.speak).toHaveBeenCalledWith({ text: "猫", lang: "ja-JP", rate: 0.95 });
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    expect(createCapacitorProvider(TextToSpeech, { isNative: () => false }).isAvailable()).toBe(false);
  });
});

describe("provider selection and fallback chain", () => {
  const parts = {
    voicevox: { id: "voicevox" },
    capacitor: { id: "capacitor" },
    browser: { id: "browser" }
  };

  it("desktop bridge -> voicevox then browser; native -> capacitor; else browser", () => {
    expect(selectSpeechProviders({ desktopTts: true, isNative: false, ...parts }).map(p => p.id)).toEqual(["voicevox", "browser"]);
    expect(selectSpeechProviders({ desktopTts: true, isNative: true, ...parts }).map(p => p.id)).toEqual(["voicevox", "browser"]);
    expect(selectSpeechProviders({ desktopTts: false, isNative: true, ...parts }).map(p => p.id)).toEqual(["capacitor"]);
    expect(selectSpeechProviders({ desktopTts: false, isNative: false, ...parts }).map(p => p.id)).toEqual(["browser"]);
  });

  function provider(id, speak = vi.fn(async () => {}), available = true) {
    return { id, isAvailable: () => available, speak, stop: vi.fn() };
  }

  it("falls back to the browser provider and notifies when voicevox fails", async () => {
    const voicevox = provider("voicevox", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const browser = provider("browser");
    const onNotice = vi.fn();
    const chain = createSpeechChain([voicevox, browser], { onNotice, warn: () => {} });
    await chain.speak("  猫 ");
    expect(voicevox.speak).toHaveBeenCalledWith("猫");
    expect(browser.speak).toHaveBeenCalledWith("猫");
    expect(onNotice).toHaveBeenCalledWith(VOICEVOX_FALLBACK_NOTICE);
  });

  it("does not fall back or notify when voicevox succeeds", async () => {
    const voicevox = provider("voicevox");
    const browser = provider("browser");
    const onNotice = vi.fn();
    await createSpeechChain([voicevox, browser], { onNotice }).speak("猫");
    expect(browser.speak).not.toHaveBeenCalled();
    expect(browser.stop).toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("ignores empty text, unavailable providers, and does not throw when the only provider fails", async () => {
    const browser = provider("browser", vi.fn(async () => { throw new Error("x"); }));
    const chain = createSpeechChain([provider("voicevox", undefined, false), browser], { warn: () => {} });
    await chain.speak("   ");
    expect(browser.speak).not.toHaveBeenCalled();
    await expect(chain.speak("猫")).resolves.toBeUndefined();
    expect(browser.speak).toHaveBeenCalledWith("猫");
  });

  it("stop() stops every provider", () => {
    const a = provider("a");
    const b = provider("b");
    createSpeechChain([a, b]).stop();
    expect(a.stop).toHaveBeenCalled();
    expect(b.stop).toHaveBeenCalled();
  });
});

describe("voicevox settings helpers", () => {
  it("lists talk styles only and escapes engine-provided names", () => {
    const options = voicevoxSpeakerOptions([{ name: `<img src=x onerror="a">`, styles: [{ id: 1, name: "ok" }, { id: 2, name: "s", type: "sing" }] }]);
    expect(options.map(o => o.id)).toEqual(["1"]);
    const html = renderSpeakerOptions(options, "1");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("selected");
    expect(renderSpeakerOptions([], "")).toContain("speaker 없음");
  });

  it("toc entry for VOICEVOX appears only on desktop", () => {
    const ids = desktop => filterTocForPlatform(tocByPage.settings, desktop).map(item => item[0]);
    expect(ids(false)).not.toContain("settings-voicevox");
    expect(ids(true)).toContain("settings-voicevox");
    expect(ids(true).indexOf("settings-voicevox")).toBe(ids(true).indexOf("settings-tts") + 1);
  });
});
