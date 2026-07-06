import { empty, speakerButton } from "../components/index.js";

export function renderReviewPage({ reviewItems, helpers }) {
  return {
    html: {
      reviewCards: reviewItems.length ? reviewItems.map(item => {
        const isActive = helpers.reviewQueueReview(item) !== "대기";
        return `
        <article class="study-card ${isActive ? "review-card--active" : ""}" data-item-id="${item.id}">
          <span class="badge ${helpers.badgeClassByKind[item.kind] || "green"}">${helpers.kindLabels[item.kind]}</span>
          <h3>${speakerButton(item.title, helpers)}<span>${helpers.highlight(item.title)}</span></h3>
          <p>${helpers.highlight([item.reading, item.meaning].filter(Boolean).join(" · "))}</p>
          <div class="card-actions">
            <button class="ghost-btn" data-cycle-review-queue="${item.id}">복습: ${helpers.escapeHtml(helpers.reviewQueueStatusText(item))}</button>
          </div>
        </article>
      `;
      }).join("") : empty("오늘 복습할 항목이 없습니다.")
    }
  };
}
