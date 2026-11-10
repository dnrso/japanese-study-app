// Features that are not available in the desktop app: account/sync and the
// login-only AI sentence analysis toggle. The elements are hidden rather than
// removed because main.js bindEvents() attaches listeners to controls inside
// them. The global [hidden] rule (display:none !important) guarantees hiding.
const DESKTOP_HIDDEN_SELECTORS = ["#settings-account", ".ai-sentence-analysis-toggle"];
const DESKTOP_HIDDEN_TOC_IDS = new Set(["settings-account"]);

const DESKTOP_TTS_DESCRIPTION =
  "스피커 버튼을 누르면 로컬 VOICEVOX 엔진이 실행 중일 때 VOICEVOX로, 연결할 수 없으면 브라우저 기본 음성으로 일본어를 읽어 줍니다.";

const APP_STORAGE_NOTE =
  "공부 데이터는 이 앱에만 저장됩니다. 앱 데이터를 지우거나 앱을 삭제하면 함께 사라지니 백업해 두세요.";

// Desktop and native (Capacitor) builds keep data in the app, not a browser tab.
export function applyAppStorageWording(root = document) {
  const note = root.querySelector?.("#storageNote");
  if (note) {
    note.textContent = APP_STORAGE_NOTE;
  }
}

export function applyDesktopGating(root = document) {
  applyAppStorageWording(root);
  const ttsDescription = root.querySelector?.("#ttsDescription");
  if (ttsDescription) {
    ttsDescription.textContent = DESKTOP_TTS_DESCRIPTION;
  }
  DESKTOP_HIDDEN_SELECTORS.forEach(selector => {
    root.querySelectorAll(selector).forEach(element => {
      element.hidden = true;
      if (element.style) element.style.display = "none";
    });
  });
  const checkbox = root.querySelector?.("#aiSentenceAnalysisCheckbox");
  if (checkbox) {
    checkbox.checked = false;
    checkbox.disabled = true;
  }
}

// Entries that exist only on desktop, inserted after the given toc id.
const DESKTOP_ONLY_TOC = [{ after: "settings-tts", item: ["settings-voicevox", "VOICEVOX 음성", ""] }];

export function filterTocForPlatform(tocItems, desktop) {
  if (!desktop) return tocItems;
  const visible = tocItems.filter(item => !DESKTOP_HIDDEN_TOC_IDS.has(item[0]));
  return DESKTOP_ONLY_TOC.reduce((items, extra) => {
    const index = items.findIndex(item => item[0] === extra.after);
    return index < 0 ? items : [...items.slice(0, index + 1), extra.item, ...items.slice(index + 1)];
  }, visible);
}
