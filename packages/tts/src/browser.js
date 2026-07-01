export function hasBrowserTts(host = globalThis) {
  return Boolean(host?.speechSynthesis && host?.SpeechSynthesisUtterance);
}

export function isJapaneseBrowserVoice(voice) {
  return /^ja([-_]|$)/i.test(String(voice?.lang || ""));
}

export function browserVoiceLabel(voice) {
  return [voice?.name, voice?.lang].filter(Boolean).join(" / ");
}

export function selectBrowserVoice(voices = [], browserVoiceURI = "") {
  if (browserVoiceURI) {
    const selected = voices.find(voice => voice.voiceURI === browserVoiceURI);
    if (selected && isJapaneseBrowserVoice(selected)) {
      return selected;
    }
  }
  return voices.find(voice => isJapaneseBrowserVoice(voice) && voice.default) ||
    voices.find(isJapaneseBrowserVoice) ||
    null;
}
