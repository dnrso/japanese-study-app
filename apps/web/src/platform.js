// The Electron preload exposes window.desktopBridge; it is absent in browsers
// and the Android (Capacitor) shell.
export function isDesktopApp(win = globalThis.window) {
  return win?.desktopBridge?.platform === "electron";
}
