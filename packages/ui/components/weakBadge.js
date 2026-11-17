// Small muted-red "오답 N" marker for an item the user keeps getting wrong in
// quizzes. `helpers.isWeakItem` (core's isWeakItem, injected by the app so this
// package stays dependency-free) decides; empty string for every other item,
// so callers can interpolate it unconditionally.
export function weakBadge(item, helpers = {}) {
  if (!helpers.isWeakItem?.(item)) {
    return "";
  }
  const count = Math.max(0, Math.trunc(Number(item.quizWrongCount) || 0));
  // The label sits in its own span so a narrow host (the 한자 card's top bar)
  // can swap it for a compact "✕" in CSS.
  return `<span class="weak-badge" title="퀴즈에서 ${count}번 틀린 항목" aria-label="오답 ${count}"><span class="weak-badge-label">오답</span>${count}</span>`;
}
