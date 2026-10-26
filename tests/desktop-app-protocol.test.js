import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  APP_ORIGIN,
  CONTENT_SECURITY_POLICY,
  contentTypeFor,
  resolveAppRequest,
  webDistExists
} = require("../apps/desktop/src/appProtocol.js");

let tempRoot;
let distRoot;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nihongo-app-protocol-"));
  distRoot = path.join(tempRoot, "dist");
  fs.mkdirSync(path.join(distRoot, "assets"), { recursive: true });
  fs.writeFileSync(path.join(distRoot, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(distRoot, "assets", "app.js"), "1");
  fs.writeFileSync(path.join(distRoot, "assets", "app.css"), "1");
  // Sits next to dist; must never be reachable.
  fs.writeFileSync(path.join(tempRoot, "secret.txt"), "secret");
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("app origin", () => {
  it("is the fixed app://nihongo origin", () => {
    expect(APP_ORIGIN).toBe("app://nihongo");
  });
});

describe("resolveAppRequest", () => {
  it("serves index.html for the root and explicit index", () => {
    for (const url of ["app://nihongo/", "app://nihongo", "app://nihongo/index.html"]) {
      const result = resolveAppRequest(url, distRoot);
      expect(result.status).toBe(200);
      expect(result.filePath).toBe(path.join(distRoot, "index.html"));
      expect(result.isHtml).toBe(true);
    }
  });

  it("serves existing assets with their content type and no CSP", () => {
    const js = resolveAppRequest("app://nihongo/assets/app.js", distRoot);
    expect(js).toMatchObject({ status: 200, isHtml: false, csp: null });
    expect(js.filePath).toBe(path.join(distRoot, "assets", "app.js"));
    expect(js.contentType).toBe("text/javascript; charset=utf-8");
    expect(resolveAppRequest("app://nihongo/assets/app.css", distRoot).contentType).toBe("text/css; charset=utf-8");
  });

  it("adds the CSP only to html responses", () => {
    expect(resolveAppRequest("app://nihongo/index.html", distRoot).csp).toBe(CONTENT_SECURITY_POLICY);
    expect(resolveAppRequest("app://nihongo/assets/app.js", distRoot).csp).toBeNull();
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
  });

  it("falls back to index.html for extension-less routes", () => {
    const result = resolveAppRequest("app://nihongo/some/route", distRoot);
    expect(result.status).toBe(200);
    expect(result.filePath).toBe(path.join(distRoot, "index.html"));
    expect(result.isHtml).toBe(true);
  });

  it("returns 404 for missing assets with an extension", () => {
    const result = resolveAppRequest("app://nihongo/assets/missing.js", distRoot);
    expect(result.status).toBe(404);
    expect(result.filePath).toBeNull();
  });

  it("returns 404 for other hosts and schemes", () => {
    expect(resolveAppRequest("app://evil/index.html", distRoot).status).toBe(404);
    expect(resolveAppRequest("app://nihongo.evil.com/index.html", distRoot).status).toBe(404);
    expect(resolveAppRequest("https://nihongo/index.html", distRoot).status).toBe(404);
    expect(resolveAppRequest("not a url", distRoot).status).toBe(404);
  });

  it.each([
    "app://nihongo/../secret.txt",
    "app://nihongo/assets/../../secret.txt",
    "app://nihongo/%2e%2e/secret.txt",
    "app://nihongo/%2E%2E%2Fsecret.txt",
    "app://nihongo/assets/%2e%2e/%2e%2e/secret.txt",
    "app://nihongo/..%5Csecret.txt",
    "app://nihongo/assets%5C..%5C..%5Csecret.txt",
    "app://nihongo/%00",
    "app://nihongo/%E0%A4%A"
  ])("never serves files outside dist: %s", url => {
    const result = resolveAppRequest(url, distRoot);
    expect(result.filePath).toBeNull();
    expect([403, 404]).toContain(result.status);
  });

  it("returns 404 when dist has no index.html for a route", () => {
    const emptyDist = path.join(tempRoot, "empty");
    fs.mkdirSync(emptyDist);
    expect(resolveAppRequest("app://nihongo/route", emptyDist).status).toBe(404);
    expect(webDistExists(emptyDist)).toBe(false);
    expect(webDistExists(distRoot)).toBe(true);
  });
});

describe("contentTypeFor", () => {
  it.each([
    ["a.html", "text/html; charset=utf-8"],
    ["a.js", "text/javascript; charset=utf-8"],
    ["a.css", "text/css; charset=utf-8"],
    ["a.svg", "image/svg+xml"],
    ["a.png", "image/png"],
    ["a.jpg", "image/jpeg"],
    ["a.webp", "image/webp"],
    ["a.ico", "image/x-icon"],
    ["a.json", "application/json; charset=utf-8"],
    ["a.woff2", "font/woff2"],
    ["a.webmanifest", "application/manifest+json; charset=utf-8"],
    ["a.wav", "audio/wav"],
    ["a.unknown", "application/octet-stream"]
  ])("maps %s", (file, type) => {
    expect(contentTypeFor(file)).toBe(type);
  });
});
