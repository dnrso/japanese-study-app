export function speakerButton(text, { escapeHtml }) {
  return `<button class="speaker-btn" data-speak-text="${escapeHtml(text)}" title="음성 재생" aria-label="음성 재생">🔊</button>`;
}
