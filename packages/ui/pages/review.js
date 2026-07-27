import { empty, speakerButton } from "../components/index.js";

// 전체 sentinel option for the 복습 큐 종류 filter, worded like the 단어 page's
// "전체 품사"/"전체 문자"/"전체 복습" selects.
const ALL_KINDS_LABEL = "전체 종류";

// The <select id="reviewKindFilter"> shell lives in each app's markup (web:
// apps/web/src/templates.js, desktop: apps/desktop/src/renderer/index.html),
// exactly like the 단어 page's filter selects; its <option> list and current
// value are patched from here so neither app owns a copy of the kind list.
//
// Only the select's children are replaced, never the select itself, so a
// keyboard user who changes the filter keeps focus on the control across the
// re-render it triggers.
export function renderReviewPage({ reviewItems, kindFilter = "", kindFilterOptions = [], helpers }) {
  return {
    html: {
      reviewKindFilter: [
        `<option value="">${ALL_KINDS_LABEL}</option>`,
        ...kindFilterOptions.map(kind => `<option value="${helpers.escapeHtml(kind)}">${helpers.escapeHtml(helpers.kindLabels[kind] || kind)}</option>`)
      ].join(""),
      reviewCards: reviewItems.length ? reviewItems.map(item => {
        const isActive = helpers.reviewQueueReview(item) !== "대기";
        return `
        <article class="study-card ${isActive ? "review-card--active" : ""}" data-item-id="${helpers.escapeHtml(item.id)}">
          <span class="badge ${helpers.badgeClassByKind[item.kind] || "green"}">${helpers.kindLabels[item.kind]}</span>
          <h3>${speakerButton(item.title, helpers)}<span>${helpers.highlight(item.title)}</span></h3>
          <p>${helpers.highlight([item.reading, item.meaning].filter(Boolean).join(" · "))}</p>
          <div class="card-actions">
            <button class="ghost-btn" data-cycle-review-queue="${helpers.escapeHtml(item.id)}">복습: ${helpers.escapeHtml(helpers.reviewQueueStatusText(item))}</button>
          </div>
        </article>
      `;
      }).join("") : empty(kindFilter
        ? `${helpers.kindLabels[kindFilter] || kindFilter} 종류에 복습할 항목이 없습니다.`
        : "오늘 복습할 항목이 없습니다.")
    },
    value: {
      // applyPagePatch writes html before value, so this re-selects the
      // active kind on the freshly rebuilt <option> list.
      reviewKindFilter: kindFilter
    }
  };
}
