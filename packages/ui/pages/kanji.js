import { empty, speakerButton } from "../components/index.js";

export function renderKanjiPage({ kanji, helpers }) {
  return {
    html: {
      kanjiCards: kanji.length ? kanji.map(item => `
        <article class="kanji-card" data-item-id="${item.id}">
          <div class="kanji-card-top">
            ${speakerButton(item.title, helpers)}
            <button class="danger-btn tiny-action-btn" data-delete-item="${item.id}">삭제</button>
          </div>
          <div class="kanji-char"><span>${helpers.highlight(item.title)}</span></div>
          <div class="kanji-info">
            <strong>${helpers.highlight(item.meaning || "-")}</strong>
            <p>${helpers.highlight(item.reading || "-")}</p>
          </div>
          <div class="card-actions">
            <button class="ghost-btn" data-show-kanji-words="${helpers.escapeHtml(item.title)}">단어보기</button>
            <button class="ghost-btn" data-cycle-review="${item.id}">복습: ${helpers.escapeHtml(helpers.reviewStatusText(item))}</button>
            <button class="danger-btn" data-delete-item="${item.id}">삭제</button>
          </div>
        </article>
      `).join("") : empty("한자를 추가해 보세요.")
    }
  };
}
