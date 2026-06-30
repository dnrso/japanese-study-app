const TTS_STORAGE_KEY = "nihongo-tts-settings";
const VOICEVOX_BASE_URL = "http://localhost:50021";
const TTS_ENGINE_BROWSER = "browser";
const TTS_ENGINE_VOICEVOX = "voicevox";

const ttsDefaultSettings = {
  engine: TTS_ENGINE_BROWSER,
  browserVoiceURI: "",
  voicevoxSpeakerId: "",
  rate: 1
};

let ttsSettings = loadTtsSettings();
let browserVoices = [];
let browserVoicesLoading = null;
let voicevoxSpeakers = [];
let voicevoxLoading = null;
let activeAudio = null;
let activeAudioUrl = "";
let activeUtterance = null;

function loadTtsSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(TTS_STORAGE_KEY) || "{}");
    return {
      engine: normalizeTtsEngine(saved.engine),
      browserVoiceURI: String(saved.browserVoiceURI || ttsDefaultSettings.browserVoiceURI),
      voicevoxSpeakerId: String(saved.voicevoxSpeakerId || ttsDefaultSettings.voicevoxSpeakerId),
      rate: normalizeTtsRate(saved.rate)
    };
  } catch {
    return { ...ttsDefaultSettings };
  }
}

function normalizeTtsEngine(engine) {
  return engine === TTS_ENGINE_VOICEVOX ? TTS_ENGINE_VOICEVOX : TTS_ENGINE_BROWSER;
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
  if (ttsSettings.engine === TTS_ENGINE_BROWSER) {
    loadBrowserVoices().catch(showTtsError);
  } else {
    setTtsStatus("VOICEVOX 엔진을 선택했습니다. 목록 새로고침 또는 스피커 버튼으로 연결을 확인하세요.");
  }
}

function bindTtsControls() {
  ttsElement("ttsEngineSelect")?.addEventListener("change", event => {
    ttsSettings.engine = normalizeTtsEngine(event.target.value);
    saveTtsSettings();
    applyTtsSettingsToControls();
    loadActiveTtsVoices(true).catch(showTtsError);
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
    ttsSettings.rate = normalizeTtsRate(event.target.value);
    ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
    saveTtsSettings();
  });

  ttsElement("ttsRefreshBtn")?.addEventListener("click", () => {
    loadActiveTtsVoices(true).catch(showTtsError);
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
  const isVoicevox = ttsSettings.engine === TTS_ENGINE_VOICEVOX;
  const browserField = ttsElement("ttsBrowserVoiceField");
  const voicevoxField = ttsElement("ttsVoicevoxSpeakerField");
  const refreshButton = ttsElement("ttsRefreshBtn");

  if (browserField) browserField.hidden = isVoicevox;
  if (voicevoxField) voicevoxField.hidden = !isVoicevox;
  if (refreshButton) refreshButton.textContent = isVoicevox ? "VOICEVOX 목록 새로고침" : "음성 목록 새로고침";
}

function loadActiveTtsVoices(force = false) {
  return ttsSettings.engine === TTS_ENGINE_VOICEVOX
    ? loadVoicevoxSpeakers(force)
    : loadBrowserVoices(force);
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
    setTtsStatus("이 브라우저는 기본 TTS를 지원하지 않습니다.");
    return Promise.resolve([]);
  }

  const immediateVoices = window.speechSynthesis.getVoices();
  if (immediateVoices.length) {
    browserVoices = immediateVoices;
    renderBrowserVoices();
    setTtsStatus("브라우저 기본 TTS를 사용할 수 있습니다.");
    return Promise.resolve(browserVoices);
  }
  if (browserVoices.length && !force) {
    renderBrowserVoices();
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
      setTtsStatus(browserVoices.length
        ? "브라우저 기본 TTS를 사용할 수 있습니다."
        : "브라우저 음성 목록이 비어 있습니다. 자동 일본어 설정으로 재생을 시도합니다.");
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

  select.disabled = false;
  select.appendChild(new Option("자동 선택 (일본어)", ""));
  const japaneseVoices = browserVoices.filter(isJapaneseBrowserVoice);
  const options = japaneseVoices.length ? japaneseVoices : browserVoices;
  options.forEach(voice => select.appendChild(new Option(browserVoiceLabel(voice), voice.voiceURI)));

  select.value = options.some(voice => voice.voiceURI === ttsSettings.browserVoiceURI)
    ? ttsSettings.browserVoiceURI
    : "";
}

function isJapaneseBrowserVoice(voice) {
  return /^ja([-_]|$)/i.test(String(voice.lang || ""));
}

function browserVoiceLabel(voice) {
  return [voice.name, voice.lang].filter(Boolean).join(" / ");
}

async function loadVoicevoxSpeakers(force = false) {
  const select = ttsElement("ttsVoicevoxSpeakerSelect");
  if (!select) {
    return;
  }
  if (voicevoxSpeakers.length && !force) {
    renderVoicevoxSpeakers();
    return;
  }
  if (voicevoxLoading && !force) {
    return voicevoxLoading;
  }

  select.innerHTML = "";
  select.appendChild(new Option("VOICEVOX 목록 불러오는 중", ""));
  setTtsStatus("VOICEVOX speaker 목록을 불러오는 중입니다.");

  voicevoxLoading = requestVoicevoxSpeakers()
    .then(speakers => {
      voicevoxSpeakers = speakers;
      renderVoicevoxSpeakers();
      setTtsStatus("VOICEVOX speaker 목록을 불러왔습니다.");
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
  const options = voicevoxSpeakers.flatMap(speaker =>
    (speaker.styles || [])
      .filter(style => !style.type || style.type === "talk")
      .map(style => ({
        id: String(style.id),
        label: `${speaker.name} / ${style.name} (#${style.id})`
      }))
  );

  if (!options.length) {
    select.appendChild(new Option("사용 가능한 speaker 없음", ""));
    return;
  }

  options.forEach(option => select.appendChild(new Option(option.label, option.id)));

  if (ttsSettings.voicevoxSpeakerId && options.some(option => option.id === ttsSettings.voicevoxSpeakerId)) {
    select.value = ttsSettings.voicevoxSpeakerId;
  } else {
    select.value = options[0].id;
    ttsSettings.voicevoxSpeakerId = select.value;
    saveTtsSettings();
  }
}

async function speakJapanese(text) {
  const targetText = String(text || "").trim();
  if (!targetText) {
    showTtsError(new Error("재생할 일본어 텍스트가 없습니다."));
    return;
  }

  try {
    stopCurrentTts();
    if (ttsSettings.engine === TTS_ENGINE_VOICEVOX) {
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
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || "ja-JP";
  } else {
    utterance.lang = "ja-JP";
  }
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
    if (selected) {
      return selected;
    }
  }
  return browserVoices.find(voice => isJapaneseBrowserVoice(voice) && voice.default) ||
    browserVoices.find(isJapaneseBrowserVoice) ||
    null;
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
  if (window.ttsApi?.getVoicevoxSpeakers) {
    return window.ttsApi.getVoicevoxSpeakers();
  }

  const response = await fetch(`${VOICEVOX_BASE_URL}/speakers`);
  if (!response.ok) {
    throw new Error(`VOICEVOX speakers 요청 실패 (${response.status})`);
  }
  return response.json();
}

async function synthesizeVoicevoxAudio(text, speakerId) {
  if (window.ttsApi?.synthesizeVoicevox) {
    return window.ttsApi.synthesizeVoicevox({ text, speakerId, rate: ttsSettings.rate });
  }

  const queryResponse = await fetch(`${VOICEVOX_BASE_URL}/audio_query?${new URLSearchParams({ text, speaker: speakerId })}`, {
    method: "POST"
  });
  if (!queryResponse.ok) {
    throw new Error(`VOICEVOX audio_query 실패 (${queryResponse.status})`);
  }

  const audioQuery = await queryResponse.json();
  audioQuery.speedScale = ttsSettings.rate;
  const synthesisResponse = await fetch(`${VOICEVOX_BASE_URL}/synthesis?${new URLSearchParams({ speaker: speakerId })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(audioQuery)
  });
  if (!synthesisResponse.ok) {
    throw new Error(`VOICEVOX synthesis 실패 (${synthesisResponse.status})`);
  }

  return {
    audioData: await synthesisResponse.arrayBuffer(),
    mimeType: synthesisResponse.headers.get("content-type") || "audio/wav"
  };
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

function setTtsStatus(message) {
  const status = ttsElement("ttsStatus");
  if (status) {
    status.textContent = message;
  }
}

function showTtsError(error) {
  const message = error?.message || String(error);
  const friendly = message.includes("Failed to fetch") || message.includes("fetch failed") || message.includes("ECONNREFUSED")
    ? "VOICEVOX 엔진 연결에 실패했습니다. http://localhost:50021 실행 상태를 확인하세요."
    : message;
  setTtsStatus(`오류: ${friendly}`);
  showTtsToast(`음성 재생 오류: ${friendly}`);
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
