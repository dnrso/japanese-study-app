(function attachDomUtils() {
  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function empty(message) {
    return `<div class="empty-state">${message}</div>`;
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function localTodayKey() {
    return toDateKey(new Date());
  }

  window.NihonGoUtils = {
    byId,
    escapeHtml,
    empty,
    toDateKey,
    localTodayKey
  };
})();
