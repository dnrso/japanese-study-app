import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { portableDataDirNames, preservePortableData, restorePortableData } = require("../apps/desktop/scripts/build-windows.js");

describe("build-windows portable data preservation", () => {
  let tempDir;
  let unpacked;
  let preserve;

  const write = (root, name, content) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, "data.txt"), content);
  };
  const read = (root, name) => fs.readFileSync(path.join(root, name, "data.txt"), "utf8");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "build-windows-test-"));
    unpacked = path.join(tempDir, "win-unpacked");
    preserve = path.join(tempDir, "preserve");
    fs.mkdirSync(unpacked, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("preserves and restores user-data and app-data", () => {
    expect(portableDataDirNames).toEqual(["user-data", "app-data"]);
    write(unpacked, "user-data", "u");
    write(unpacked, "app-data", "a");

    preservePortableData(unpacked, preserve, portableDataDirNames);
    fs.rmSync(unpacked, { recursive: true, force: true });
    fs.mkdirSync(unpacked, { recursive: true });
    restorePortableData(preserve, unpacked, portableDataDirNames);

    expect(read(unpacked, "user-data")).toBe("u");
    expect(read(unpacked, "app-data")).toBe("a");
    expect(fs.existsSync(preserve)).toBe(false);
  });

  it("keeps leftover preserved data when the live dir is missing, then restores it", () => {
    write(preserve, "user-data", "old");

    preservePortableData(unpacked, preserve, portableDataDirNames);
    expect(read(preserve, "user-data")).toBe("old");

    restorePortableData(preserve, unpacked, portableDataDirNames);
    expect(read(unpacked, "user-data")).toBe("old");
    expect(fs.existsSync(preserve)).toBe(false);
  });
});
