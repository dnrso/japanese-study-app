export function taxonomyChip(type, option, isActive, { escapeHtml }) {
  return `<button class="taxonomy-chip ${isActive ? "active" : ""}" type="button" data-word-taxonomy="${type}" data-word-taxonomy-value="${escapeHtml(option)}" aria-pressed="${isActive}">${escapeHtml(option)}</button>`;
}
