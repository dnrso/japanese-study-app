const TTS_STORAGE_KEY = "nihongo-tts-settings";

const ttsDefaultSettings = {
  browserVoiceURI: "",
  rate: 1
};

let ttsSettings = loadTtsSettings();
let browserVoices = [];
let browserVoicesLoading = null;
let activeUtterance = null;

function loadTtsSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(TTS_STORAGE_KEY) || "{}");
    return {
      browserVoiceURI: String(saved.browserVoiceURI || ttsDefaultSettings.browserVoiceURI),
      rate: normalizeTtsRate(saved.rate)
    };
  } catch {
    return { ...ttsDefaultSettings };
  }
}

function normalizeTtsRate(rate) {
  const value = Number(rate || ttsDefaultSettings.rate);
  return Number.isFinite(value) ? Math.min(2, Math.max(0.5, value)) : ttsDefaultSettings.rate;
}

function saveTtsSettings() {
  localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(ttsSettings));
}

function ttsElement(id) {
  return document.getElementById(id);
}

function initJapaneseTts() {
  bindTtsControls();
  applyTtsSettingsToControls();
  loadBrowserVoices().catch(error => showTtsError(error, { toast: false }));
}

function bindTtsControls() {
  ttsElement("ttsBrowserVoiceSelect")?.addEventListener("change", event => {
    ttsSettings.browserVoiceURI = event.target.value;
    saveTtsSettings();
  });

  ttsElement("ttsRateRange")?.addEventListener("input", event => {
    ttsSettings.rate = normalizeTtsRate(event.target.value);
    ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
    saveTtsSettings();
  });

  ttsElement("ttsRefreshBtn")?.addEventListener("click", () => {
    loadBrowserVoices(true).catch(error => showTtsError(error, { toast: false }));
  });
}

function applyTtsSettingsToControls() {
  const browserVoiceSelect = ttsElement("ttsBrowserVoiceSelect");
  const rateRange = ttsElement("ttsRateRange");

  if (browserVoiceSelect) browserVoiceSelect.value = ttsSettings.browserVoiceURI;
  if (rateRange) rateRange.value = ttsSettings.rate;
  ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
}

function hasBrowserTts() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function loadBrowserVoices(force = false) {
  const select = ttsElement("ttsBrowserVoiceSelect");
  if (!select) {
    return Promise.resolve([]);
  }
  if (!hasBrowserTts()) {
    browserVoices = [];
    renderBrowserVoices();
    setTtsStatus("오류: 이 브라우저는 기본 TTS를 지원하지 않습니다.", "error");
    return Promise.resolve([]);
  }

  const immediateVoices = window.speechSynthesis.getVoices();
  if (immediateVoices.length) {
    browserVoices = immediateVoices;
    renderBrowserVoices();
    updateBrowserTtsStatus();
    return Promise.resolve(browserVoices);
  }
  if (browserVoices.length && !force) {
    renderBrowserVoices();
    updateBrowserTtsStatus();
    return Promise.resolve(browserVoices);
  }
  if (browserVoicesLoading && !force) {
    return browserVoicesLoading;
  }

  select.innerHTML = "";
  select.appendChild(new Option("브라우저 음성 목록 확인 중", ""));
  setTtsStatus("브라우저 음성 목록을 불러오는 중입니다.");

  browserVoicesLoading = new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timerId);
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      browserVoices = window.speechSynthesis.getVoices();
      renderBrowserVoices();
      updateBrowserTtsStatus();
      resolve(browserVoices);
    };
    const timerId = window.setTimeout(finish, 1200);
    window.speechSynthesis.addEventListener("voiceschanged", finish);
  }).finally(() => {
    browserVoicesLoading = null;
  });

  return browserVoicesLoading;
}

function renderBrowserVoices() {
  const select = ttsElement("ttsBrowserVoiceSelect");
  if (!select) {
    return;
  }

  select.innerHTML = "";
  if (!hasBrowserTts()) {
    select.appendChild(new Option("브라우저 TTS 지원 안 함", ""));
    select.disabled = true;
    return;
  }

  const japaneseVoices = browserVoices.filter(isJapaneseBrowserVoice);
  select.disabled = japaneseVoices.length === 0;
  select.appendChild(new Option(japaneseVoices.length ? "자동 선택 (일본어)" : "일본어 음성 없음", ""));
  japaneseVoices.forEach(voice => select.appendChild(new Option(browserVoiceLabel(voice), voice.voiceURI)));

  select.value = japaneseVoices.some(voice => voice.voiceURI === ttsSettings.browserVoiceURI)
    ? ttsSettings.browserVoiceURI
    : "";
}

function updateBrowserTtsStatus() {
  if (!hasBrowserTts()) {
    setTtsStatus("오류: 이 브라우저는 기본 TTS를 지원하지 않습니다.", "error");
    return;
  }

  const japaneseVoices = browserVoices.filter(isJapaneseBrowserVoice);
  if (!browserVoices.length) {
    setTtsStatus("오류: 브라우저 TTS 음성 목록을 찾을 수 없습니다. Windows 음성 기능을 확인한 뒤 새로고침하세요.", "error");
    return;
  }
  if (!japaneseVoices.length) {
    setTtsStatus("오류: 일본어 TTS 음성을 찾을 수 없습니다. Windows 일본어 언어/음성 기능을 설치한 뒤 새로고침하세요.", "error");
    return;
  }

  const voice = selectedBrowserVoice();
  setTtsStatus(`브라우저 기본 TTS 감지됨: ${browserVoiceLabel(voice)}`, "ok");
}

function isJapaneseBrowserVoice(voice) {
  return /^ja([-_]|$)/i.test(String(voice.lang || ""));
}

function browserVoiceLabel(voice) {
  return [voice.name, voice.lang].filter(Boolean).join(" / ");
}

async function speakJapanese(text) {
  const targetText = String(text || "").trim();
  if (!targetText) {
    showTtsError(new Error("재생할 일본어 텍스트가 없습니다."));
    return;
  }

  try {
    stopCurrentTts();
    await speakWithBrowserTts(targetText);
  } catch (error) {
    showTtsError(error);
  }
}

async function speakWithBrowserTts(text) {
  if (!hasBrowserTts()) {
    throw new Error("이 브라우저는 기본 TTS를 지원하지 않습니다.");
  }

  await loadBrowserVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = selectedBrowserVoice();
  if (!voice) {
    throw new Error("일본어 TTS 음성을 찾을 수 없습니다. Windows 일본어 언어/음성 기능을 설치한 뒤 새로고침하세요.");
  }
  utterance.voice = voice;
  utterance.lang = voice.lang || "ja-JP";
  utterance.rate = ttsSettings.rate;

  return new Promise((resolve, reject) => {
    activeUtterance = utterance;
    utterance.onstart = () => setTtsStatus("브라우저 기본 TTS를 재생 중입니다.");
    utterance.onend = () => {
      activeUtterance = null;
      setTtsStatus("음성 재생이 완료되었습니다.");
      resolve();
    };
    utterance.onerror = event => {
      activeUtterance = null;
      reject(new Error(`브라우저 TTS 재생 실패${event.error ? ` (${event.error})` : ""}`));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function selectedBrowserVoice() {
  if (ttsSettings.browserVoiceURI) {
    const selected = browserVoices.find(voice => voice.voiceURI === ttsSettings.browserVoiceURI);
    if (selected && isJapaneseBrowserVoice(selected)) {
      return selected;
    }
  }
  return browserVoices.find(voice => isJapaneseBrowserVoice(voice) && voice.default) ||
    browserVoices.find(isJapaneseBrowserVoice) ||
    null;
}

function stopCurrentTts() {
  if (activeUtterance && hasBrowserTts()) {
    activeUtterance = null;
    window.speechSynthesis.cancel();
  }
}

function setTtsStatus(message, tone = "info") {
  const status = ttsElement("ttsStatus");
  if (status) {
    status.textContent = message;
    status.classList.toggle("status-error", tone === "error");
    status.classList.toggle("status-ok", tone === "ok");
  }
}

function showTtsError(error, options = {}) {
  const message = error?.message || String(error);
  setTtsStatus(`오류: ${message}`, "error");
  if (options.toast !== false) {
    showTtsToast(`음성 재생 오류: ${message}`);
  }
}

function showTtsToast(message) {
  const toast = ttsElement("ttsToast");
  if (!toast) {
    window.alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showTtsToast.timer);
  showTtsToast.timer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 4200);
}

window.NihonGoTts = {
  init: initJapaneseTts,
  speak: speakJapanese
};
