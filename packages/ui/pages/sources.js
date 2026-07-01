import { empty } from "../components/index.js";

export function renderSourcesPage({ sources, helpers }) {
  return {
    html: {
      sourceCards: sources.length ? sources.map(item => `
        <article class="source-card" data-item-id="${item.id}">
          <span class="badge green">${helpers.highlight(item.reading || "자료")}</span>
          <div class="source-title">${helpers.highlight(item.title)}</div>
          <p class="muted">${helpers.highlight([item.level, item.note || item.meaning].filter(Boolean).join(" · "))}</p>
          <div class="card-actions">
            ${item.source ? `<a class="ghost-btn" href="${helpers.escapeHtml(item.source)}" target="_blank" rel="noreferrer">링크 열기</a>` : ""}
            <button class="ghost-btn" data-show-kanji-words="${helpers.escapeHtml(item.title)}">단어보기</button>
            <button class="ghost-btn" data-edit-item="${item.id}">수정</button>
          </div>
        </article>
      `).join("") : empty("자료를 추가해 보세요.")
    }
  };
}
