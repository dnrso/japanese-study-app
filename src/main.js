const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const store = require("./dbBridge");
const { registerDataHandlers } = require("./dataHandlers");

const VOICEVOX_BASE_URL = "http://localhost:50021";

async function fetchVoicevox(pathname, params = {}, options = {}) {
  const url = new URL(pathname, VOICEVOX_BASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`VOICEVOX 요청 실패: ${pathname} (${response.status})`);
  }
  return response;
}

function registerTtsHandlers(ipcMain) {
  ipcMain.handle("tts:voicevox-speakers", async () => {
    const response = await fetchVoicevox("/speakers");
    return response.json();
  });

  ipcMain.handle("tts:voicevox-synthesize", async (_event, payload) => {
    const text = String(payload?.text || "").trim();
    const speaker = String(payload?.speakerId || "").trim();
    if (!text || !speaker) {
      throw new Error("VOICEVOX 합성에 필요한 텍스트 또는 speaker가 없습니다.");
    }

    const queryResponse = await fetchVoicevox("/audio_query", { text, speaker }, { method: "POST" });
    const audioQuery = await queryResponse.json();
    audioQuery.speedScale = Number(payload?.rate || 1);

    const synthesisResponse = await fetchVoicevox("/synthesis", { speaker }, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audioQuery)
    });
    return {
      mimeType: synthesisResponse.headers.get("content-type") || "audio/wav",
      audioData: Buffer.from(await synthesisResponse.arrayBuffer())
    };
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f6f4ef",
    title: "NihonGo Study",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  store.initDatabase();
  registerDataHandlers(ipcMain, store);
  registerTtsHandlers(ipcMain);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
