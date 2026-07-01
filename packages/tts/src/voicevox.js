import { normalizeTtsRate } from "./settings.js";

export const VOICEVOX_BASE_URL = "http://localhost:50021";

export function createVoicevoxClient(options = {}) {
  const baseUrl = options.baseUrl || VOICEVOX_BASE_URL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("VOICEVOX 요청에 사용할 fetch 구현이 없습니다.");
  }

  async function fetchVoicevox(pathname, params = {}, requestOptions = {}) {
    const url = new URL(pathname, baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetchImpl(url, requestOptions);
    if (!response.ok) {
      throw new Error(`VOICEVOX 요청 실패: ${pathname} (${response.status})`);
    }
    return response;
  }

  return {
    async getSpeakers() {
      const response = await fetchVoicevox("/speakers");
      return response.json();
    },

    async synthesize(payload = {}) {
      const text = String(payload.text || "").trim();
      const speaker = String(payload.speakerId || "").trim();
      if (!text || !speaker) {
        throw new Error("VOICEVOX 합성에 필요한 텍스트 또는 speaker가 없습니다.");
      }

      const queryResponse = await fetchVoicevox("/audio_query", { text, speaker }, { method: "POST" });
      const audioQuery = await queryResponse.json();
      audioQuery.speedScale = normalizeTtsRate(payload.rate);

      const synthesisResponse = await fetchVoicevox("/synthesis", { speaker }, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audioQuery)
      });
      return {
        mimeType: synthesisResponse.headers.get("content-type") || "audio/wav",
        audioData: await synthesisResponse.arrayBuffer()
      };
    }
  };
}

export function voicevoxSpeakerOptions(speakers = []) {
  return speakers.flatMap(speaker =>
    (speaker.styles || [])
      .filter(style => !style.type || style.type === "talk")
      .map(style => ({
        id: String(style.id),
        label: `${speaker.name} / ${style.name} (#${style.id})`
      }))
  );
}

export function friendlyTtsErrorMessage(error) {
  const message = error?.message || String(error);
  return message.includes("Failed to fetch") || message.includes("fetch failed") || message.includes("ECONNREFUSED")
    ? "VOICEVOX 엔진 연결에 실패했습니다. http://localhost:50021 실행 상태를 확인하세요."
    : message;
}
