// NIHONGO_DESKTOP_UI=web loads the apps/web build; anything else keeps the
// original desktop renderer.
function selectDesktopUi(env = process.env) {
  return String(env.NIHONGO_DESKTOP_UI || "").trim().toLowerCase() === "web" ? "web" : "renderer";
}

module.exports = { selectDesktopUi };
