const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const rendererDir = path.join(rootDir, "src", "renderer");
const docsDir = path.join(rootDir, "docs");

function assertInsideRoot(targetPath) {
  const relative = path.relative(rootDir, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe output path: ${targetPath}`);
  }
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      return;
    }
    copyFile(sourcePath, targetPath);
  });
}

function webIndexHtml() {
  return fs.readFileSync(path.join(rendererDir, "index.html"), "utf8");
}

function build() {
  assertInsideRoot(docsDir);
  fs.rmSync(docsDir, { recursive: true, force: true });
  fs.mkdirSync(docsDir, { recursive: true });

  [
    "styles.css",
    "config.js",
    "domUtils.js",
    "browserDataStore.js",
    "api.js",
    "state.js",
    "render.js",
    "tts.js",
    "actions.js",
    "events.js",
    "app.js"
  ].forEach(fileName => {
    copyFile(path.join(rendererDir, fileName), path.join(docsDir, fileName));
  });

  copyDirectory(path.join(rendererDir, "styles"), path.join(docsDir, "styles"));

  fs.writeFileSync(path.join(docsDir, "index.html"), webIndexHtml(), "utf8");
  fs.writeFileSync(path.join(docsDir, ".nojekyll"), "", "utf8");
  fs.writeFileSync(path.join(docsDir, "README.md"), [
    "# NihonGo Study Web",
    "",
    "GitHub Pages 배포용 정적 산출물입니다.",
    "",
    "- 생성 명령: `npm run build:web`",
    "- 배포 루트: `docs/`",
    "- 데이터 저장: 브라우저 IndexedDB",
    "- 로그인/동기화 없이 현재 브라우저에만 저장합니다.",
    ""
  ].join("\n"), "utf8");
}

build();
