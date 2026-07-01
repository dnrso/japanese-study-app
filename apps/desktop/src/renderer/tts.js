const TTS_STORAGE_KEY = "nihongo-tts-settings";

let ttsService = null;
let ttsServiceLoading = null;
let ttsSettings = null;
let ttsControlsBound = false;
let browserVoices = [];
let browserVoicesLoading = null;
let voicevoxSpeakers = [];
let voicevoxLoading = null;
let activeAudio = null;
let activeAudioUrl = "";
let activeUtterance = null;

async function loadTtsService() {
  if (!ttsServiceLoading) {
    ttsServiceLoading = import("../../../../packages/tts/src/index.js");
  }
  ttsService = await ttsServiceLoading;
  return ttsService;
}

async function ensureTtsReady({ bindControls = false } = {}) {
  await loadTtsService();
  if (!ttsSettings) {
    ttsSettings = loadTtsSettings();
  }
  if (bindControls && !ttsControlsBound) {
    bindTtsControls();
    ttsControlsBound = true;
  }
}

function loadTtsSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(TTS_STORAGE_KEY) || "{}");
    return ttsService.normalizeTtsSettings(saved);
  } catch {
    return { ...ttsService.ttsDefaultSettings };
  }
}

function saveTtsSettings() {
  localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(ttsSettings));
}

function ttsElement(id) {
  return document.getElementById(id);
}

async function initJapaneseTts() {
  await ensureTtsReady({ bindControls: true });
  applyTtsSettingsToControls();
  loadActiveTtsVoices().catch(error => showTtsError(error, { toast: false }));
}

function bindTtsControls() {
  ttsElement("ttsEngineSelect")?.addEventListener("change", event => {
    ttsSettings.engine = ttsService.normalizeTtsEngine(event.target.value);
    saveTtsSettings();
    applyTtsSettingsToControls();
    loadActiveTtsVoices(true).catch(error => showTtsError(error, { toast: false }));
  });

  ttsElement("ttsBrowserVoiceSelect")?.addEventListener("change", event => {
    ttsSettings.browserVoiceURI = event.target.value;
    saveTtsSettings();
  });

  ttsElement("ttsVoicevoxSpeakerSelect")?.addEventListener("change", event => {
    ttsSettings.voicevoxSpeakerId = event.target.value;
    saveTtsSettings();
  });

  ttsElement("ttsRateRange")?.addEventListener("input", event => {
    ttsSettings.rate = ttsService.normalizeTtsRate(event.target.value);
    ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
    saveTtsSettings();
  });

  ttsElement("ttsRefreshBtn")?.addEventListener("click", () => {
    loadActiveTtsVoices(true).catch(error => showTtsError(error, { toast: false }));
  });
}

function applyTtsSettingsToControls() {
  const engineSelect = ttsElement("ttsEngineSelect");
  const browserVoiceSelect = ttsElement("ttsBrowserVoiceSelect");
  const voicevoxSpeakerSelect = ttsElement("ttsVoicevoxSpeakerSelect");
  const rateRange = ttsElement("ttsRateRange");

  if (engineSelect) engineSelect.value = ttsSettings.engine;
  if (browserVoiceSelect) browserVoiceSelect.value = ttsSettings.browserVoiceURI;
  if (voicevoxSpeakerSelect) voicevoxSpeakerSelect.value = ttsSettings.voicevoxSpeakerId;
  if (rateRange) rateRange.value = ttsSettings.rate;
  ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
  updateTtsControlVisibility();
}

function updateTtsControlVisibility() {
  const isVoicevox = ttsSettings.engine === ttsService.TTS_ENGINE_VOICEVOX;
  const browserField = ttsElement("ttsBrowserVoiceField");
  const voicevoxField = ttsElement("ttsVoicevoxSpeakerField");
  const refreshButton = ttsElement("ttsRefreshBtn");

  if (browserField) browserField.hidden = isVoicevox;
  if (voicevoxField) voicevoxField.hidden = !isVoicevox;
  if (refreshButton) refreshButton.textContent = isVoicevox ? "VOICEVOX 목록 새로고침" : "음성 목록 새로고침";
}

function loadActiveTtsVoices(force = false) {
  return ttsSettings.engine === ttsService.TTS_ENGINE_VOICEVOX
    ? loadVoicevoxSpeakers(force)
    : loadBrowserVoices(force);
}

function hasBrowserTts() {
  return ttsService.hasBrowserTts(window);
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

  const japaneseVoices = browserVoices.filter(ttsService.isJapaneseBrowserVoice);
  select.disabled = japaneseVoices.length === 0;
  select.appendChild(new Option(japaneseVoices.length ? "자동 선택 (일본어)" : "일본어 음성 없음", ""));
  japaneseVoices.forEach(voice => select.appendChild(new Option(ttsService.browserVoiceLabel(voice), voice.voiceURI)));

  select.value = japaneseVoices.some(voice => voice.voiceURI === ttsSettings.browserVoiceURI)
    ? ttsSettings.browserVoiceURI
    : "";
}

function updateBrowserTtsStatus() {
  if (!hasBrowserTts()) {
    setTtsStatus("오류: 이 브라우저는 기본 TTS를 지원하지 않습니다.", "error");
    return;
  }

  const japaneseVoices = browserVoices.filter(ttsService.isJapaneseBrowserVoice);
  if (!browserVoices.length) {
    setTtsStatus("오류: 브라우저 TTS 음성 목록을 찾을 수 없습니다. Windows 음성 기능을 확인한 뒤 새로고침하세요.", "error");
    return;
  }
  if (!japaneseVoices.length) {
    setTtsStatus("오류: 일본어 TTS 음성을 찾을 수 없습니다. Windows 일본어 언어/음성 기능을 설치한 뒤 새로고침하세요.", "error");
    return;
  }

  const voice = selectedBrowserVoice();
  setTtsStatus(`브라우저 기본 TTS 감지됨: ${ttsService.browserVoiceLabel(voice)}`, "ok");
}

async function loadVoicevoxSpeakers(force = false) {
  const select = ttsElement("ttsVoicevoxSpeakerSelect");
  if (!select) {
    return;
  }
  if (voicevoxSpeakers.length && !force) {
    renderVoicevoxSpeakers();
    updateVoicevoxTtsStatus();
    return voicevoxSpeakers;
  }
  if (voicevoxLoading && !force) {
    return voicevoxLoading;
  }

  select.innerHTML = "";
  select.appendChild(new Option("VOICEVOX 목록 불러오는 중", ""));
  setTtsStatus("VOICEVOX speaker 목록을 불러오는 중입니다.");

  voicevoxLoading = requestVoicevoxSpeakers()
    .then(speakers => {
      voicevoxSpeakers = Array.isArray(speakers) ? speakers : [];
      renderVoicevoxSpeakers();
      updateVoicevoxTtsStatus();
      return voicevoxSpeakers;
    })
    .finally(() => {
      voicevoxLoading = null;
    });

  return voicevoxLoading;
}

function renderVoicevoxSpeakers() {
  const select = ttsElement("ttsVoicevoxSpeakerSelect");
  if (!select) {
    return;
  }

  select.innerHTML = "";
  const options = voicevoxSpeakerOptions();

  if (!options.length) {
    select.appendChild(new Option("사용 가능한 speaker 없음", ""));
    select.disabled = true;
    return;
  }

  select.disabled = false;
  options.forEach(option => select.appendChild(new Option(option.label, option.id)));

  if (ttsSettings.voicevoxSpeakerId && options.some(option => option.id === ttsSettings.voicevoxSpeakerId)) {
    select.value = ttsSettings.voicevoxSpeakerId;
  } else {
    select.value = options[0].id;
    ttsSettings.voicevoxSpeakerId = select.value;
    saveTtsSettings();
  }
}

function updateVoicevoxTtsStatus() {
  const options = voicevoxSpeakerOptions();
  if (!options.length) {
    setTtsStatus("오류: VOICEVOX 엔진 또는 사용 가능한 speaker를 찾을 수 없습니다. http://localhost:50021 실행 상태를 확인하세요.", "error");
    return;
  }
  const selected = options.find(option => option.id === ttsSettings.voicevoxSpeakerId) || options[0];
  setTtsStatus(`VOICEVOX 엔진 감지됨: ${selected.label}`, "ok");
}

function voicevoxSpeakerOptions() {
  return ttsService.voicevoxSpeakerOptions(voicevoxSpeakers);
}

async function speakJapanese(text) {
  await ensureTtsReady();
  const targetText = String(text || "").trim();
  if (!targetText) {
    showTtsError(new Error("재생할 일본어 텍스트가 없습니다."));
    return;
  }

  try {
    stopCurrentTts();
    if (ttsSettings.engine === ttsService.TTS_ENGINE_VOICEVOX) {
      await speakWithVoicevox(targetText);
      return;
    }
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
  return ttsService.selectBrowserVoice(browserVoices, ttsSettings.browserVoiceURI);
}

async function speakWithVoicevox(text) {
  await loadVoicevoxSpeakers();
  const speakerId = ttsSettings.voicevoxSpeakerId;
  if (!speakerId) {
    throw new Error("VOICEVOX speaker를 선택할 수 없습니다.");
  }

  setTtsStatus("VOICEVOX 음성을 합성하는 중입니다.");
  const { audioData, mimeType } = await synthesizeVoicevoxAudio(text, speakerId);
  const audioBlob = new Blob([toAudioBlobPart(audioData)], { type: mimeType || "audio/wav" });
  activeAudioUrl = URL.createObjectURL(audioBlob);
  activeAudio = new Audio(activeAudioUrl);
  activeAudio.onplay = () => setTtsStatus("VOICEVOX 음성을 재생 중입니다.");
  activeAudio.onended = () => {
    releaseActiveAudio();
    setTtsStatus("음성 재생이 완료되었습니다.");
  };
  activeAudio.onerror = () => {
    releaseActiveAudio();
    showTtsError(new Error("VOICEVOX 오디오 재생에 실패했습니다."));
  };
  await activeAudio.play();
}

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

async function requestVoicevoxSpeakers() {
  if (!window.ttsApi?.getVoicevoxSpeakers) {
    throw new Error("TTS IPC API를 사용할 수 없습니다.");
  }
  return window.ttsApi.getVoicevoxSpeakers();
}

async function synthesizeVoicevoxAudio(text, speakerId) {
  if (!window.ttsApi?.synthesizeVoicevox) {
    throw new Error("TTS IPC API를 사용할 수 없습니다.");
  }
  return window.ttsApi.synthesizeVoicevox({ text, speakerId, rate: ttsSettings.rate });
}

function stopCurrentTts() {
  if (activeAudio) {
    activeAudio.pause();
    releaseActiveAudio();
  }
  if (activeUtterance && hasBrowserTts()) {
    activeUtterance = null;
    window.speechSynthesis.cancel();
  }
}

function releaseActiveAudio() {
  activeAudio = null;
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = "";
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
  const friendly = ttsService?.friendlyTtsErrorMessage
    ? ttsService.friendlyTtsErrorMessage(error)
    : message;
  setTtsStatus(`오류: ${friendly}`, "error");
  if (options.toast !== false) {
    showTtsToast(`음성 재생 오류: ${friendly}`);
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
  speak: speakJapanese,
  showError: showTtsError
};
