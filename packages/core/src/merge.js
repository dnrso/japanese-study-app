// Pure backup-merge logic: no DOM, no storage access. Dependency-free so it
// can be shared between the web and desktop apps.

export function parseBackupFile(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("JSON 백업 파일을 읽을 수 없습니다.");
  }

  const data = backupData(backup);
  if (!isBackupData(data)) {
    throw new Error("일본어 공부노트 백업 파일 형식이 아닙니다.");
  }
  return backup;
}

export function backupData(backup) {
  return backup?.data && typeof backup.data === "object" ? backup.data : backup;
}

export function isBackupData(data) {
  return Boolean(data && typeof data === "object" && [
    "studyDays",
    "dailyEntries",
    "allDailyEntries",
    "dailyEntryLinks",
    "tasks",
    "items"
  ].some(name => Array.isArray(data[name])));
}

export function mergeBackupData(currentData, importedData, fallbackDate) {
  const idMap = new Map();
  const studyDays = mergeUniqueRows(
    rows(currentData.studyDays),
    rows(importedData.studyDays),
    studyDayKeys
  );
  const dailyEntries = mergeDailyEntries(
    rows(currentData.allDailyEntries || currentData.dailyEntries),
    rows(importedData.allDailyEntries || importedData.dailyEntries),
    idMap
  );
  const tasks = mergeUniqueRows(
    rows(currentData.tasks),
    rows(importedData.tasks),
    taskKeys
  );
  const items = mergeUniqueRows(
    rows(currentData.items),
    rows(importedData.items),
    itemKeys
  );
  const dailyEntryLinks = mergeUniqueRows(
    rows(currentData.dailyEntryLinks),
    rows(importedData.dailyEntryLinks)
      .map(link => remapDailyEntryLink(link, idMap))
      .filter(link => link.entryId && link.sentenceId),
    dailyEntryLinkKeys
  );

  return {
    data: {
      selectedDate: currentData.selectedDate || fallbackDate || importedData.selectedDate,
      studyDays: studyDays.rows,
      dailyEntries: dailyEntries.rows,
      dailyEntryLinks: dailyEntryLinks.rows,
      tasks: tasks.rows,
      items: items.rows
    },
    summary: sumMergeSummaries([studyDays, dailyEntries, dailyEntryLinks, tasks, items])
  };
}

export function mergeDailyEntries(currentRows, importedRows, idMap) {
  const existing = new Map();
  currentRows.forEach(row => {
    dailyEntryKeys(row).forEach(key => existing.set(key, row.id));
  });

  importedRows.forEach(row => {
    const matchedId = dailyEntryKeys(row).map(key => existing.get(key)).find(Boolean);
    if (matchedId && row.id) {
      idMap.set(String(row.id), matchedId);
    }
  });

  const mergedRows = [...currentRows];
  const indexById = new Map(mergedRows.map((row, index) => [row.id, index]));
  let added = 0;
  let skipped = 0;
  let updated = 0;

  importedRows.forEach(rawRow => {
    const row = remapDailyEntry(rawRow, idMap);
    const keys = dailyEntryKeys(row);
    const matchedId = keys.map(key => existing.get(key)).find(Boolean);
    if (matchedId) {
      if (rawRow.id) {
        idMap.set(String(rawRow.id), matchedId);
      }
      const matchedIndex = indexById.get(matchedId);
      const currentRow = matchedIndex === undefined ? undefined : mergedRows[matchedIndex];
      if (currentRow && matchedIndex !== undefined) {
        const winner = pickNewer(currentRow, row);
        if (winner !== currentRow) {
          mergedRows[matchedIndex] = { ...winner, id: matchedId };
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        skipped += 1;
      }
      return;
    }

    mergedRows.push(row);
    indexById.set(row.id, mergedRows.length - 1);
    if (rawRow.id) {
      idMap.set(String(rawRow.id), row.id);
    }
    keys.forEach(key => existing.set(key, row.id));
    added += 1;
  });

  return { rows: mergedRows, added, skipped, updated };
}

export function mergeUniqueRows(currentRows, importedRows, keyFactory) {
  const existing = new Map();
  currentRows.forEach((row, index) => {
    keyFactory(row).forEach(key => existing.set(key, index));
  });
  const mergedRows = [...currentRows];
  let added = 0;
  let skipped = 0;
  let updated = 0;

  importedRows.forEach(row => {
    const keys = keyFactory(row);
    const matchedIndex = keys.map(rowKey => existing.get(rowKey)).find(index => index !== undefined);
    if (matchedIndex !== undefined) {
      const currentRow = mergedRows[matchedIndex];
      const winner = pickNewer(currentRow, row);
      if (winner !== currentRow) {
        mergedRows[matchedIndex] = winner;
        updated += 1;
      } else {
        skipped += 1;
      }
      return;
    }
    mergedRows.push(row);
    keys.forEach(key => existing.set(key, mergedRows.length - 1));
    added += 1;
  });

  return { rows: mergedRows, added, skipped, updated };
}

// Last-write-wins for a single key collision: newer `updatedAt` wins; ties (and
// legacy records missing `updatedAt` on both sides) keep the current/local row.
// Records without `updatedAt` are treated as epoch 0 so they lose to any
// timestamped record on the other side.
export function pickNewer(currentRow, importedRow) {
  const currentMs = updatedAtMs(currentRow);
  const importedMs = updatedAtMs(importedRow);
  return importedMs > currentMs ? importedRow : currentRow;
}

export function updatedAtMs(row) {
  const parsed = Date.parse(row?.updatedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function remapDailyEntry(entry, idMap) {
  const parentId = remappedId(entry.parentId, idMap);
  return {
    ...entry,
    parentId,
    sourceSentences: rows(entry.sourceSentences).map(sentence => ({
      ...sentence,
      id: remappedId(sentence.id, idMap)
    }))
  };
}

export function remapDailyEntryLink(link, idMap) {
  const entryId = remappedId(link.entryId || link.entry_id, idMap);
  const sentenceId = remappedId(link.sentenceId || link.sentence_id, idMap);
  return {
    ...link,
    id: link.id || `${entryId}::${sentenceId}`,
    entryId,
    sentenceId
  };
}

export function remappedId(id, idMap) {
  const key = String(id || "");
  return key ? idMap.get(key) || key : "";
}

export function studyDayKeys(row) {
  return compactKeys([key("studyDay", row.studyDate)]);
}

export function dailyEntryKeys(row) {
  return compactKeys([
    key("dailyEntryId", row.id),
    key("dailyEntry", row.studyDate, row.kind, row.title, row.reading, row.meaning, row.parentTitle || row.parentId)
  ]);
}

export function dailyEntryLinkKeys(row) {
  return compactKeys([
    key("dailyEntryLinkId", row.id),
    key("dailyEntryLink", row.entryId || row.entry_id, row.sentenceId || row.sentence_id)
  ]);
}

export function taskKeys(row) {
  return compactKeys([
    key("taskId", row.id),
    key("task", row.studyDate, row.title, row.note, row.tag)
  ]);
}

export function itemKeys(row) {
  return compactKeys([
    key("itemId", row.id),
    key("item", row.kind, row.title, row.reading, row.meaning)
  ]);
}

export function compactKeys(keys) {
  return keys.filter(Boolean);
}

export function key(scope, ...parts) {
  const normalized = parts.map(keyPart);
  if (!normalized.some(Boolean)) {
    return "";
  }
  return `${scope}:${normalized.join("|")}`;
}

export function keyPart(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function rows(value) {
  return Array.isArray(value) ? value : [];
}

export function sumMergeSummaries(results) {
  return results.reduce((summary, result) => ({
    added: summary.added + result.added,
    skipped: summary.skipped + result.skipped,
    updated: summary.updated + (result.updated || 0)
  }), { added: 0, skipped: 0, updated: 0 });
}
