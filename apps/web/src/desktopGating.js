// Features that are not available in the desktop app: account/sync and the
// login-only AI sentence analysis toggle. The elements are hidden rather than
// removed because main.js bindEvents() attaches listeners to controls inside
// them. The global [hidden] rule (display:none !important) guarantees hiding.
const DESKTOP_HIDDEN_SELECTORS = ["#settings-account", ".ai-sentence-analysis-toggle"];
const DESKTOP_HIDDEN_TOC_IDS = new Set(["settings-account"]);

export function applyDesktopGating(root = document) {
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
