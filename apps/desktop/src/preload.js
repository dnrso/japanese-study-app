const { contextBridge, ipcRenderer } = require("electron");

// Duplicated from ttsChannels.js: a sandboxed preload cannot require local
// files. tests/desktop-tts-preload.test.js guards against drift.
const ttsChannels = {
  voicevoxSpeakers: "tts:voicevox-speakers",
  voicevoxSynthesize: "tts:voicevox-synthesize",
  voicevoxHealth: "tts:voicevox-health",
  getConfig: "tts:get-config",
  setConfig: "tts:set-config"
};

contextBridge.exposeInMainWorld("desktopBridge", {
  platform: "electron",
  tts: {
    speakers: () => ipcRenderer.invoke(ttsChannels.voicevoxSpeakers),
    synthesize: payload => ipcRenderer.invoke(ttsChannels.voicevoxSynthesize, payload),
    health: () => ipcRenderer.invoke(ttsChannels.voicevoxHealth),
    getConfig: () => ipcRenderer.invoke(ttsChannels.getConfig),
    setConfig: config => ipcRenderer.invoke(ttsChannels.setConfig, config)
  }
});
