import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const srcDir = path.resolve(__dirname, "../apps/desktop/src");
const files = fs
  .readdirSync(srcDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(srcDir, name));

describe("desktop sources", () => {
  it.each(files)("%s passes node --check", (file) => {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
