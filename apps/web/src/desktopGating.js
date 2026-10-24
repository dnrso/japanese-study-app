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

export function filterTocForPlatform(tocItems, desktop) {
  return desktop ? tocItems.filter(item => !DESKTOP_HIDDEN_TOC_IDS.has(item[0])) : tocItems;
}
