import { text } from "./values.js";

export const tombstoneTtlMs = 90 * 24 * 60 * 60 * 1000;

export function normalizeDeletedAt(value) {
  return value ? text(value) : null;
}

export function pruneStaleTombstones(records) {
  const cutoff = Date.now() - tombstoneTtlMs;
  return records.filter(record => {
    if (!record.deletedAt) {
      return true;
    }
    const deletedAtMs = Date.parse(record.deletedAt);
    return !Number.isFinite(deletedAtMs) || deletedAtMs >= cutoff;
  });
}
