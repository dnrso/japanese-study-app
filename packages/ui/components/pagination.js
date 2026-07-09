// Shared client-side pagination: a pure slicing helper plus a small
// prev/status/next control bar, reused by the 문장/단어/문법/표현/한자 list
// pages. Kept generic (no page-specific knowledge) so any list can opt in
// by calling `paginate()` before rendering and `paginationControls()` for
// the control bar markup.

export function paginate(items = [], page = 1, pageSize = 10) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  // Out-of-range pages (including ones left stale after the underlying
  // data shrank) fall back to page 1 rather than clamping to the new last
  // page - matches the "resets to 1" behavior used for filter/search/sort
  // changes elsewhere.
  const validPage = page >= 1 && page <= totalPages ? page : 1;
  const start = (validPage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: validPage,
    pageSize,
    totalItems,
    totalPages
  };
}

export function paginationControls({ page, totalPages, pageName }) {
  if (!totalPages || totalPages <= 1) {
    return "";
  }
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  return `
    <div class="pagination-controls" data-pagination-for="${pageName}">
      <button class="ghost-btn tiny-action-btn" type="button" data-page-nav="prev" data-page-name="${pageName}" ${prevDisabled ? "disabled" : ""}>이전</button>
      <span class="pagination-status">${page} / ${totalPages}</span>
      <button class="ghost-btn tiny-action-btn" type="button" data-page-nav="next" data-page-name="${pageName}" ${nextDisabled ? "disabled" : ""}>다음</button>
    </div>
  `;
}
