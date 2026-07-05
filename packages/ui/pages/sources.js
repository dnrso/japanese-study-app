import { empty } from "../components/index.js";

export function renderSourcesPage({ sources, helpers }) {
  return {
    html: {
      sourceCards: sources.length ? sources.map(item => {
        const progress = helpers.core.sourceProgress(item);
        const meta = [
          item.level,
          progress ? `진행률 ${progress}%` : "",
          item.note || item.meaning
        ].filter(Boolean).join(" · ");
        return `
        <article class="source-card" data-item-id="${helpers.escapeHtml(item.id)}">
          <span class="badge green">${helpers.highlight(item.reading || "자료")}</span>
          <div class="source-title">${helpers.highlight(item.title)}</div>
          <p class="muted">${helpers.highlight(meta)}</p>
          <div class="card-actions">
            ${sourceLink(item.source, helpers)}
            <button class="ghost-btn" data-show-kanji-words="${helpers.escapeHtml(item.title)}">단어보기</button>
            <button class="ghost-btn" data-edit-item="${helpers.escapeHtml(item.id)}">수정</button>
          </div>
        </article>
      `;
      }).join("") : empty("자료를 추가해 보세요.")
    }
  };
}

export function safeSourceUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function sourceLink(value, helpers) {
  const url = safeSourceUrl(value);
  return url
    ? `<a class="ghost-btn" href="${helpers.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">링크 열기</a>`
    : "";
}
