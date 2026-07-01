let voicevoxClientPromise = null;

async function getVoicevoxClient() {
  if (!voicevoxClientPromise) {
    voicevoxClientPromise = import("../../../packages/tts/src/index.js")
      .then(({ createVoicevoxClient }) => createVoicevoxClient());
  }
  return voicevoxClientPromise;
}

function registerTtsHandlers(ipcMain) {
  ipcMain.handle("tts:voicevox-speakers", async () => {
    const voicevoxClient = await getVoicevoxClient();
    return voicevoxClient.getSpeakers();
  });

  ipcMain.handle("tts:voicevox-synthesize", async (_event, payload) => {
    const voicevoxClient = await getVoicevoxClient();
    const result = await voicevoxClient.synthesize(payload);
    return {
      mimeType: result.mimeType,
      audioData: Buffer.from(result.audioData)
    };
  });
}

module.exports = { registerTtsHandlers };
