// The desktop app loads the apps/web build by default. NIHONGO_DESKTOP_UI=legacy
// selects the original desktop renderer (backed by SQLite) as a rollback;
// NIHONGO_DESKTOP_UI=web is still accepted explicitly.
function selectDesktopUi(env = process.env) {
  return String(env.NIHONGO_DESKTOP_UI || "").trim().toLowerCase() === "legacy" ? "renderer" : "web";
}

module.exports = { selectDesktopUi };
