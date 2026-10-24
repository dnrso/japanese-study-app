const fs = require("node:fs");

const DEFAULT_BASE_URL = "http://127.0.0.1:50021";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

// VOICEVOX is a local engine. Only loopback hosts are accepted so the main
// process cannot be turned into an arbitrary HTTP client by the renderer.
function normalizeBaseUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    throw new Error("엔진 URL을 입력하세요.");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("올바른 URL 형식이 아닙니다. 예: http://127.0.0.1:50021");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error("http 또는 https URL만 사용할 수 있습니다.");
  }
  if (url.username || url.password) {
    throw new Error("URL에 계정 정보를 포함할 수 없습니다.");
  }
  if (!ALLOWED_HOSTNAMES.has(url.hostname)) {
    throw new Error("로컬 엔진 주소(127.0.0.1, localhost, [::1])만 사용할 수 있습니다.");
  }
  return url.origin;
}

function readTtsConfig(filePath, fsImpl = fs) {
  try {
    const saved = JSON.parse(fsImpl.readFileSync(filePath, "utf8"));
    return { baseUrl: normalizeBaseUrl(saved?.baseUrl) };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL };
  }
}

function writeTtsConfig(filePath, config, fsImpl = fs) {
  const saved = { baseUrl: normalizeBaseUrl(config?.baseUrl) };
  fsImpl.writeFileSync(filePath, JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

module.exports = { DEFAULT_BASE_URL, normalizeBaseUrl, readTtsConfig, writeTtsConfig };
