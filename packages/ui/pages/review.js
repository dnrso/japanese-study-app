import { empty, speakerButton } from "../components/index.js";
import { sentenceDateLabel } from "./sentences.js";

// Short button labels for the scheduled intervals (config.scheduledReviewOptions);
// the full label and the resulting date go in the tooltip.
const INTERVAL_SHORT_LABELS = {
  "내일": "내일",
  "3일 후": "3일",
  "일주일": "일주일",
  "2주일": "2주",
  "한달": "한달"
};

// The shell (title count, kind tab group, 뜻 가리기 checkbox, progress line,
// list) lives in each app's markup (web: apps/web/src/templates.js); this
// only patches their contents, so the 뜻 가리기 checkbox keeps focus across the
// re-render it triggers.
//
// reviewItems: queue rows, already narrowed by search + kind filter.
// kindCounts: { all, word, ... } from core.reviewKindCounts.
// progress: { done, remaining, percent } from core.reviewQueueProgress.
export function renderReviewPage({
  reviewItems,
  kindFilter = "",
  kindFilterOptions = [],
  kindCounts = {},
  progress = { done: 0, remaining: reviewItems.length, percent: 0 },
  scheduledReviewOptions = [],
  hideMeaning = true,
  revealedIds = new Set(),
  helpers
}) {
  const { escapeHtml } = helpers;
  const kindLabel = kind => helpers.kindLabels[kind] || kind;
  const tab = (value, label, count, disabled) => `<button class="segmented-btn ${kindFilter === value ? "active" : ""}" type="button" data-review-kind="${escapeHtml(value)}" aria-pressed="${kindFilter === value}" ${disabled ? "disabled" : ""}>${escapeHtml(label)} <span class="review-tab-count">${count}</span></button>`;

  const intervalButtons = item => scheduledReviewOptions.map(review => {
    const dueDate = helpers.core.reviewQueueDueDate(review);
    const title = dueDate ? `${review} · ${sentenceDateLabel(dueDate)}` : review;
    return `<button class="review-interval-btn" type="button" data-review-item="${escapeHtml(item.id)}" data-review-value="${escapeHtml(review)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${item.title} 복습: ${title}`)}">${escapeHtml(INTERVAL_SHORT_LABELS[review] || review)}</button>`;
  }).join("");

  const detail = item => {
    if (hideMeaning && !revealedIds.has(item.id)) {
      return `<button class="review-reveal" type="button" data-review-reveal="${escapeHtml(item.id)}">정답 보기</button>`;
    }
    // 문장 readings/meanings are long: one line each instead of " · ".
    if (item.kind === "sentence") {
      return [
        item.reading ? `<span class="review-reading" lang="ja">${helpers.highlight(item.reading)}</span>` : "",
        item.meaning ? `<span class="review-meaning">${helpers.highlight(item.meaning)}</span>` : ""
      ].join("");
    }
    const line = [item.reading, item.meaning].filter(Boolean).join(" · ");
    return line ? `<span class="review-meaning">${helpers.highlight(line)}</span>` : "";
  };

  const row = item => `
    <div class="review-row" data-item-id="${escapeHtml(item.id)}">
      <div class="review-row-main">
        <div class="review-row-text">
          <div class="review-row-title" lang="ja">${speakerButton(item.title, helpers)}<strong>${helpers.highlight(item.title)}</strong></div>
          <div class="review-row-detail">${detail(item)}</div>
        </div>
      </div>
      <div class="review-row-actions" role="group" aria-label="${escapeHtml(`${item.title} 복습 간격`)}">${intervalButtons(item)}</div>
    </div>
  `;

  let list;
  if (reviewItems.length) {
    list = kindFilter
      ? reviewItems.map(row).join("")
      : helpers.core.groupReviewItemsByKind(reviewItems).map(group => `
        <section class="review-group">
          <h3 class="review-group-heading">${escapeHtml(kindLabel(group.kind))} <span>${group.items.length}개</span></h3>
          ${group.items.map(row).join("")}
        </section>
      `).join("");
  } else if (progress.remaining === 0 && progress.done > 0 && !kindFilter) {
    list = empty("오늘 복습을 모두 마쳤습니다");
  } else {
    list = empty(kindFilter
      ? `${kindLabel(kindFilter)} 종류에 복습할 항목이 없습니다.`
      : "오늘 복습할 항목이 없습니다.");
  }

  return {
    text: {
      reviewTotalCount: `${progress.remaining}개`
    },
    html: {
      reviewKindTabs: [
        tab("", "전체", kindCounts.all ?? 0, false),
        ...kindFilterOptions.map(kind => tab(kind, kindLabel(kind), kindCounts[kind] ?? 0, !(kindCounts[kind] ?? 0) && kindFilter !== kind))
      ].join(""),
      reviewProgress: `
        <p class="review-progress-text">오늘 ${progress.done}개 완료 · ${progress.remaining}개 남음</p>
        <div class="review-progress-bar" role="progressbar" aria-label="오늘 복습 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span style="width: ${progress.percent}%"></span></div>
      `,
      reviewCards: list
    }
  };
}
