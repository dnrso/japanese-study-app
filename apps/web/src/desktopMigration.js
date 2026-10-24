// One-time import of the legacy desktop SQLite data into the web app's
// IndexedDB. The Electron main process reads the old database (see
// apps/desktop/src/legacySqliteReader.js) and exposes it through
// desktopBridge.migration; this module decides between "replace" and "merge",
// performs the import, and reports the outcome to the user.
import { mergeBackupData } from "@nihongo-study/core";
import { isPristine } from "@nihongo-study/storage-idb";

// Key field of each backup collection, used to confirm every legacy row landed.
// (Counts alone cannot be compared: importFullBackup() always adds an empty
// study day for the selected date when none exists.)
const ROW_KEYS = { studyDays: "studyDate", dailyEntries: "id", dailyEntryLinks: "id", tasks: "id", items: "id" };
const NOTICE_ID = "desktopMigrationNotice";

function describeCounts(counts) {
  return `학습일 ${counts.studyDays} · 카드 ${counts.dailyEntries} · 할 일 ${counts.tasks} · 학습 항목 ${counts.items}`;
}

function showNotice(doc, { kind, message }) {
  if (!doc?.body) {
    return;
  }
  doc.getElementById?.(NOTICE_ID)?.remove();
  const box = doc.createElement("div");
  box.id = NOTICE_ID;
  box.setAttribute("role", kind === "error" ? "alert" : "status");
  Object.assign(box.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    maxWidth: "420px",
    padding: "12px 40px 12px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
    background: kind === "error" ? "#7a1f1f" : "#1f5f3a",
    color: "#fff",
    font: "14px/1.5 sans-serif",
    zIndex: "10000"
  });
  const text = doc.createElement("span");
  text.textContent = message;
  const close = doc.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "닫기");
  Object.assign(close.style, {
    position: "absolute",
    top: "6px",
    right: "10px",
    background: "none",
    border: "0",
    color: "inherit",
    fontSize: "18px",
    cursor: "pointer"
  });
  close.addEventListener("click", () => box.remove());
  box.append(text, close);
  doc.body.appendChild(box);
}

function setLocked(doc, locked) {
  const root = doc?.getElementById?.("app");
  if (root) {
    root.inert = locked;
  }
}

// Returns { status: "skipped" | "imported" | "merged" | "failed", counts?, error? }.
// Never throws: any failure is reported to the main process (so the next launch
// retries) and shown as a notice, and the app stays usable.
export async function runDesktopMigration({ bridge, store, today, doc = globalThis.document }) {
  const migration = bridge?.migration;
  if (!migration || typeof migration.getPending !== "function") {
    return { status: "skipped" };
  }

  let pending;
  try {
    pending = await migration.getPending();
  } catch (error) {
    return reportFailure(migration, doc, error);
  }
  if (!pending) {
    return { status: "skipped" };
  }

  setLocked(doc, true);
  try {
    if (pending.error || !pending.data) {
      // Main already recorded the failure (unreadable database, invalid ids...).
      throw new Error(pending.error || "legacy data could not be read");
    }
    const { data, counts } = pending;
    const fresh = await isPristine(store);
    let status;
    if (fresh) {
      await store.importFullBackup({ data });
      const written = (await store.exportData()).data;
      const missing = Object.entries(ROW_KEYS).filter(([name, keyField]) => {
        const present = new Set((written[name] || []).map(row => row[keyField]));
        return data[name].some(row => !present.has(row[keyField]));
      }).map(([name]) => name);
      if (missing.length) {
        throw new Error(`가져온 데이터가 일부 누락되었습니다 (${missing.join(", ")}).`);
      }
      status = "imported";
    } else {
      const current = (await store.exportData()).data;
      const merged = mergeBackupData(current, data, today);
      await store.importFullBackup({ data: merged.data });
      status = "merged";
    }

    const result = await migration.complete(counts);
    if (result && result.ok === false) {
      throw new Error(result.error || "migration:complete rejected");
    }
    showNotice(doc, {
      kind: "success",
      message: `이전 데스크톱 데이터를 가져왔습니다. ${describeCounts(counts)}`
    });
    return { status, counts };
  } catch (error) {
    return reportFailure(migration, doc, error);
  } finally {
    setLocked(doc, false);
  }
}

async function reportFailure(migration, doc, error) {
  const message = error?.message || String(error);
  try {
    await migration.fail?.(message);
  } catch {
    // Best effort; the failure is still shown below.
  }
  showNotice(doc, {
    kind: "error",
    message: `이전 데스크톱 데이터를 가져오지 못했습니다. 기존 데이터는 아직 옮겨지지 않았으며 다음 실행 때 다시 시도합니다. (${message})`
  });
  return { status: "failed", error: message };
}
