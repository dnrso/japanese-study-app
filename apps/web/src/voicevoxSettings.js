import { escapeHtml } from "./templates.js";
import { voicevoxSpeakerOptions } from "@nihongo-study/tts";

const VOICEVOX_PREFS_KEY = "nihongo-web-voicevox-prefs";
const TEST_PHRASE = "こんにちは。VOICEVOXのテストです。";

function clampRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
}

export function loadVoicevoxPrefs(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(VOICEVOX_PREFS_KEY) || "{}");
    return { speakerId: String(saved?.speakerId || ""), rate: clampRate(saved?.rate ?? 1) };
  } catch {
    return { speakerId: "", rate: 1 };
  }
}

function saveVoicevoxPrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage.setItem(VOICEVOX_PREFS_KEY, JSON.stringify({
      speakerId: String(prefs.speakerId || ""),
      rate: clampRate(prefs.rate)
    }));
  } catch {
    // localStorage unavailable - the choice just will not survive a reload.
  }
}

export function renderSpeakerOptions(options, selectedId) {
  if (!options.length) {
    return `<option value="">사용 가능한 speaker 없음</option>`;
  }
  return options.map(option =>
    `<option value="${escapeHtml(option.id)}"${option.id === selectedId ? " selected" : ""}>${escapeHtml(option.label)}</option>`
  ).join("");
}

// Wires the (desktop-only) VOICEVOX settings section. `testSpeak(text)` plays
// through the VOICEVOX provider and rejects on failure.
export function initVoicevoxSettings({ root = document, bridgeTts, testSpeak, storage = globalThis.localStorage }) {
  const section = root.getElementById("settings-voicevox");
  if (!section || !bridgeTts) {
    return;
  }
  section.hidden = false;

  const el = id => root.getElementById(id);
  const urlInput = el("voicevoxBaseUrlInput");
  const urlStatus = el("voicevoxUrlStatus");
  const healthStatus = el("voicevoxHealthStatus");
  const speakerSelect = el("voicevoxSpeakerSelect");
  const rateRange = el("voicevoxRateRange");
  const rateValue = el("voicevoxRateValue");
  const testStatus = el("voicevoxTestStatus");

  const prefs = loadVoicevoxPrefs(storage);
  rateRange.value = String(prefs.rate);
  rateValue.textContent = prefs.rate.toFixed(1);

  function setStatus(element, message, tone) {
    element.textContent = message;
    element.classList.toggle("status-ok", tone === "ok");
    element.classList.toggle("status-error", tone === "error");
  }

  async function loadSpeakers() {
    try {
      const options = voicevoxSpeakerOptions(await bridgeTts.speakers());
      const selected = options.some(option => option.id === prefs.speakerId) ? prefs.speakerId : (options[0]?.id || "");
      speakerSelect.innerHTML = renderSpeakerOptions(options, selected);
      speakerSelect.disabled = !options.length;
      if (selected && selected !== prefs.speakerId) {
        prefs.speakerId = selected;
        saveVoicevoxPrefs(prefs, storage);
      }
    } catch {
      speakerSelect.innerHTML = renderSpeakerOptions([], "");
      speakerSelect.disabled = true;
    }
  }

  async function checkHealth() {
    setStatus(healthStatus, "엔진 연결 확인 중...", "info");
    try {
      const health = await bridgeTts.health();
      if (health.ok) {
        setStatus(healthStatus, `VOICEVOX 엔진 연결됨${health.version ? ` (v${health.version})` : ""} - ${health.baseUrl}`, "ok");
        await loadSpeakers();
      } else {
        setStatus(healthStatus, health.error || "VOICEVOX 엔진에 연결할 수 없습니다.", "error");
        speakerSelect.innerHTML = renderSpeakerOptions([], "");
        speakerSelect.disabled = true;
      }
    } catch (error) {
      setStatus(healthStatus, error?.message || "VOICEVOX 상태를 확인하지 못했습니다.", "error");
    }
  }

  el("voicevoxSaveUrlBtn").addEventListener("click", async () => {
    try {
      const saved = await bridgeTts.setConfig({ baseUrl: urlInput.value });
      urlInput.value = saved.baseUrl;
      setStatus(urlStatus, "엔진 URL을 저장했습니다.", "ok");
      await checkHealth();
    } catch (error) {
      setStatus(urlStatus, error?.message || "엔진 URL을 저장하지 못했습니다.", "error");
    }
  });

  el("voicevoxRecheckBtn").addEventListener("click", () => { checkHealth(); });

  speakerSelect.addEventListener("change", () => {
    prefs.speakerId = speakerSelect.value;
    saveVoicevoxPrefs(prefs, storage);
  });

  rateRange.addEventListener("input", () => {
    prefs.rate = clampRate(rateRange.value);
    rateValue.textContent = prefs.rate.toFixed(1);
    saveVoicevoxPrefs(prefs, storage);
  });

  el("voicevoxTestBtn").addEventListener("click", async () => {
    setStatus(testStatus, "합성 중...", "info");
    try {
      await testSpeak(TEST_PHRASE);
      setStatus(testStatus, "재생을 시작했습니다.", "ok");
    } catch (error) {
      setStatus(testStatus, error?.message || "재생에 실패했습니다.", "error");
    }
  });

  bridgeTts.getConfig()
    .then(config => { urlInput.value = config.baseUrl; })
    .catch(() => {});
  checkHealth();
}
