const fs = require("fs");
const path = require("path");

// IMPORTANT: this origin must never change. IndexedDB and localStorage are
// keyed by origin, so changing the scheme or host orphans every user's data
// stored by the web UI.
const APP_SCHEME = "app";
const APP_HOST = "nihongo";
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self' data:"
].join("; ");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wav": "audio/wav"
};

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function notFound(status = 404) {
  return { status, filePath: null, isHtml: false, contentType: "text/plain; charset=utf-8" };
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// Maps a request URL to a file inside distRoot. Pure apart from file existence
// checks, so it can be tested without Electron.
// Returns { status, filePath, isHtml, contentType, csp }.
function resolveAppRequest(requestUrl, distRoot) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return notFound(404);
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) {
    return notFound(404);
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(403);
  }
  if (pathname.includes("\0") || pathname.includes("\\")) {
    return notFound(403);
  }

  const root = path.resolve(distRoot);
  const relativePath = pathname.replace(/^\/+/, "");
  const segments = relativePath.split("/");
  if (segments.includes("..")) {
    return notFound(403);
  }

  const indexPath = path.join(root, "index.html");
  let candidate = relativePath ? path.resolve(root, relativePath) : indexPath;
  if (!isInside(root, candidate)) {
    return notFound(403);
  }

  if (fileExists(candidate)) {
    return buildResult(candidate);
  }
  // SPA fallback only for extension-less routes; missing assets are real 404s.
  if (path.extname(candidate) === "" && fileExists(indexPath)) {
    return buildResult(indexPath);
  }
  return notFound(404);
}

function buildResult(filePath) {
  const isHtml = path.extname(filePath).toLowerCase() === ".html";
  return {
    status: 200,
    filePath,
    isHtml,
    contentType: contentTypeFor(filePath),
    csp: isHtml ? CONTENT_SECURITY_POLICY : null
  };
}

// Dev: <repo>/apps/web/dist. Packaged: same relative layout inside app.asar
// (electron-builder `files` includes apps/web/dist/**).
function webDistRoot(baseDir = path.resolve(__dirname, "..", "..", "..")) {
  return path.join(baseDir, "apps", "web", "dist");
}

function webDistExists(distRoot) {
  return fileExists(path.join(distRoot, "index.html"));
}

function createAppProtocolHandler(distRoot) {
  return async request => {
    const resolved = resolveAppRequest(request.url, distRoot);
    if (!resolved.filePath) {
      return new Response(resolved.status === 403 ? "Forbidden" : "Not found", {
        status: resolved.status,
        headers: { "Content-Type": resolved.contentType }
      });
    }
    const headers = { "Content-Type": resolved.contentType };
    if (resolved.csp) {
      headers["Content-Security-Policy"] = resolved.csp;
    }
    const body = await fs.promises.readFile(resolved.filePath);
    return new Response(body, { status: 200, headers });
  };
}

module.exports = {
  APP_SCHEME,
  APP_HOST,
  APP_ORIGIN,
  APP_ENTRY_URL,
  CONTENT_SECURITY_POLICY,
  contentTypeFor,
  resolveAppRequest,
  webDistRoot,
  webDistExists,
  createAppProtocolHandler
};
