import { toNumber } from "./values.js";

// Per-item quiz statistics that drive the "약한 항목" (weak items) features.
// Pure: no storage access. The adapter persists the returned fields on the
// item, and normalizeItem keeps them, so they ride along in backups and in the
// sync snapshot (an opaque JSON blob) like every other item field.
//
//  - quizWrongCount     total wrong answers (already existed before this)
//  - quizCorrectStreak  consecutive correct answers since the last wrong one
//  - lastQuizWrongAt    ISO time of the last wrong answer ("" = never)

// Weak = answered wrong at least once and not yet two correct answers in a row
// since.
export const WEAK_ITEM_CORRECT_STREAK = 2;

// Fields to merge into the item after one answer. `now` is an ISO string (or
// Date); a wrong answer stamps it as lastQuizWrongAt and resets the streak.
export function recordQuizStat(item = {}, correct = false, now = new Date().toISOString()) {
  const stamp = now instanceof Date ? now.toISOString() : String(now ?? "");
  const wrongCount = Math.max(0, Math.trunc(toNumber(item?.quizWrongCount)));
  const streak = Math.max(0, Math.trunc(toNumber(item?.quizCorrectStreak)));
  return correct
    ? {
        quizWrongCount: wrongCount,
        quizCorrectStreak: streak + 1,
        lastQuizWrongAt: String(item?.lastQuizWrongAt ?? "")
      }
    : {
        quizWrongCount: wrongCount + 1,
        quizCorrectStreak: 0,
        lastQuizWrongAt: stamp
      };
}

export function isWeakItem(item) {
  if (!item || item.deletedAt) {
    return false;
  }
  return toNumber(item.quizWrongCount) >= 1 && toNumber(item.quizCorrectStreak) < WEAK_ITEM_CORRECT_STREAK;
}

// Weak items of one kind (all kinds when `kind` is empty), in input order.
export function weakItems(items = [], kind = "") {
  return items.filter(item => (!kind || item.kind === kind) && isWeakItem(item));
}
