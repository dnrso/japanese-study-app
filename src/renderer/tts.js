const TTS_STORAGE_KEY = "nihongo-tts-settings";
const VOICEVOX_BASE_URL = "http://localhost:50021";

const ttsDefaultSettings = {
  voicevoxSpeakerId: "",
  rate: 1
};

let ttsSettings = loadTtsSettings();
let voicevoxSpeakers = [];
let voicevoxLoading = null;
let activeAudio = null;
let activeAudioUrl = "";

function loadTtsSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(TTS_STORAGE_KEY) || "{}");
    return {
      voicevoxSpeakerId: String(saved.voicevoxSpeakerId || ttsDefaultSettings.voicevoxSpeakerId),
      rate: Number(saved.rate || ttsDefaultSettings.rate)
    };
  } catch {
    return { ...ttsDefaultSettings };
  }
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
  loadVoicevoxSpeakers().catch(showTtsError);
}

function bindTtsControls() {
  ttsElement("ttsVoicevoxSpeakerSelect")?.addEventListener("change", event => {
    ttsSettings.voicevoxSpeakerId = event.target.value;
    saveTtsSettings();
  });

  ttsElement("ttsRateRange")?.addEventListener("input", event => {
    ttsSettings.rate = Number(event.target.value);
    ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
    saveTtsSettings();
  });

  ttsElement("ttsRefreshBtn")?.addEventListener("click", () => {
    loadVoicevoxSpeakers(true).catch(showTtsError);
  });
}

function applyTtsSettingsToControls() {
  const voicevoxSpeakerSelect = ttsElement("ttsVoicevoxSpeakerSelect");
  const rateRange = ttsElement("ttsRateRange");

  if (voicevoxSpeakerSelect) voicevoxSpeakerSelect.value = ttsSettings.voicevoxSpeakerId;
  if (rateRange) rateRange.value = ttsSettings.rate;
  ttsElement("ttsRateValue").textContent = ttsSettings.rate.toFixed(1);
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
    await speakWithVoicevox(targetText);
  } catch (error) {
    showTtsError(error);
  }
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
  const friendly = message.includes("Failed to fetch")
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
