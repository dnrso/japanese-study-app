import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopHtml = readFileSync(
  path.join(rootDir, "apps", "desktop", "src", "renderer", "index.html"),
  "utf8"
);
const desktopRender = readFileSync(
  path.join(rootDir, "apps", "desktop", "src", "renderer", "render.js"),
  "utf8"
);

describe("desktop sentences page wiring", () => {
  it("exposes the same sentence tab and page targets as the web app", () => {
    expect(desktopHtml).toContain('data-page="sentences"');
    expect(desktopHtml).toContain('id="sentences"');
    expect(desktopHtml).toContain('id="sentences-list"');
    expect(desktopHtml).toContain('id="sentencePageDate"');
    expect(desktopHtml).toContain('id="sentenceCards"');
  });

  it("renders sentences from the full daily-entry history", () => {
    expect(desktopRender).toContain("renderSentences();");
    expect(desktopRender).toContain("uiPages.renderSentencesPage({");
    expect(desktopRender).toContain("state.allDailyEntries || state.dailyEntries || []");
    expect(desktopRender).toContain("linkedEntriesForSentence: linkedEntriesForAnySentence");
  });
});
