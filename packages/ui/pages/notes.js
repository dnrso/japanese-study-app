import { empty } from "../components/emptyState.js";
import { icon } from "../components/icons.js";
import { speakerButton } from "../components/speech.js";

export const NOTES_VIEWS = ["list", "read", "edit"];

// How many card chips a list row shows before folding the rest into "+N".
export const NOTE_ROW_CHIP_LIMIT = 10;

// "오늘 14:20" / "어제" / "11월 9일" / "2025년 3월 2일". `now` is injectable so
// the label is testable.
export function noteDateLabel(isoString, now = new Date()) {
  const date = new Date(isoString);
  if (!isoString || Number.isNaN(date.getTime())) {
    return "";
  }
  const startOfDay = value => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (dayDiff === 0) {
    return `오늘 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  if (dayDiff === 1) {
    return "어제";
  }
  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear() ? monthDay : `${date.getFullYear()}년 ${monthDay}`;
}

// A linked card as a chip, coloured like that kind's badge everywhere else in
// the app. Clicking it opens the card preview (main.js handles
// [data-note-card-title]). A link whose card is not registered is drawn
// muted.
export function noteCardChip(link, helpers) {
  const { badgeClassByKind, escapeHtml, kindLabels } = helpers;
  const title = escapeHtml(link.title);
  const kind = link.item ? link.kind : "";
  const tone = kind ? `badge ${badgeClassByKind[kind] || "green"}` : "notebook-chip--missing";
  const label = kind ? `${kindLabels[kind] || kind} 카드` : "등록되지 않은 카드";
  return `<button type="button" class="notebook-chip ${tone}" lang="ja" data-note-card-kind="${escapeHtml(kind)}" data-note-card-title="${title}" title="${escapeHtml(label)}">${title}</button>`;
}

export function noteCardChips(links, helpers, { limit = Infinity } = {}) {
  const shown = links.slice(0, limit);
  const rest = links.length - shown.length;
  return shown.map(link => noteCardChip(link, helpers)).join("")
    + (rest > 0 ? `<span class="notebook-chip notebook-chip--more">+${rest}</span>` : "");
}

function noteRow(note, { helpers, now, linksFor }) {
  const { core, escapeHtml, highlight } = helpers;
  const id = escapeHtml(note.id);
  const links = linksFor(note);
  // The chips say what the note is about; the body preview is only needed
  // when there are none.
  const preview = links.length ? "" : core.notePreview(note);
  const pinned = Boolean(note.pinned);
  // The row's actions live in a <details> menu: main.js positions the list
  // when it opens and closes it on an outside click.
  return `
    <article class="notebook-row${pinned ? " notebook-row--pinned" : ""}" data-note-id="${id}">
      <button class="notebook-row-main" type="button" data-open-note="${id}">
        <span class="notebook-row-title">${pinned ? `<span class="notebook-row-pin" title="고정됨" aria-label="고정됨">${icon("pin")}</span>` : ""}<span class="notebook-row-title-text">${highlight(core.noteDisplayTitle(note))}</span></span>
        ${preview ? `<span class="notebook-row-preview">${highlight(preview)}</span>` : ""}
      </button>
      <span class="notebook-row-date">${escapeHtml(noteDateLabel(core.noteEditedAt(note), now))}</span>
      <details class="notebook-menu notebook-row-actions">
        <summary class="icon-btn row-action-btn" title="노트 메뉴" aria-label="노트 메뉴">${icon("dots")}</summary>
        <div class="notebook-menu-list">
          <button type="button" data-pin-note="${id}">${pinned ? "고정 해제" : "맨 위에 고정"}</button>
          <button type="button" data-edit-note="${id}">수정</button>
          <button type="button" data-duplicate-note="${id}">복제</button>
          <button type="button" class="notebook-menu-danger" data-delete-note="${id}">삭제</button>
        </div>
      </details>
      ${links.length ? `<div class="notebook-chips notebook-row-chips">${noteCardChips(links, helpers, { limit: NOTE_ROW_CHIP_LIMIT })}</div>` : ""}
    </article>
  `;
}

// The editor (#notesEditView) is static markup owned by the app shell and is
// deliberately absent from this patch: every renderAll() runs this function,
// and re-writing the editor's fields would throw away what is being typed.
// Only its visibility is patched here.
//
//   view      "list" | "read" | "edit"
//   notes     notes to list (already filtered and sorted)
//   total     number of notes before the search filter
//   note      the open note (read view), or null
//   rendered  { html } from renderMarkdown(note.body) for the read view
//   linksFor  note => its card links (core.noteCardLinks), for the chips
//   matched   notes matching the search across every page (defaults to
//             notes.length for an unpaged list)
//   sort      the active sort key, re-selected in #noteSortSelect
//   pagination  markup for the prev/next bar ("" when there is one page)
export function renderNotesPage({ view = "list", notes = [], total = 0, matched = notes.length, note = null, rendered = null, searchTerm = "", sort = "", pagination = "", now = new Date(), linksFor = () => [], helpers }) {
  const { core, escapeHtml } = helpers;
  const activeView = view === "read" && !note ? "list" : view;
  const emptyMessage = searchTerm
    ? `'${escapeHtml(searchTerm)}' 검색 결과가 없습니다.`
    : "공부하면서 정리한 내용을 노트로 남겨 보세요. Markdown 표와 목록을 그대로 붙여 넣을 수 있습니다.";
  const edited = note ? noteDateLabel(core.noteEditedAt(note), now) : "";
  const title = note ? String(note.title || "").trim() : "";
  const openLinks = note ? linksFor(note) : [];

  return {
    hidden: {
      notesReadTitle: !title,
      notesReadLinks: !openLinks.length,
      notesListView: activeView !== "list",
      notesReadView: activeView !== "read",
      notesEditView: activeView !== "edit"
    },
    text: {
      notesCount: searchTerm && matched !== total ? `노트 ${matched}개 / 전체 ${total}개` : `노트 ${total}개`,
      notePinBtn: note?.pinned ? "고정 해제" : "고정",
      // Only a title the user typed gets the big heading: a derived title is
      // the body's own first line and would just be shown twice.
      notesReadTitle: title,
      notesReadMeta: edited ? `마지막 수정 ${edited}` : ""
    },
    html: {
      notesList: notes.length
        ? notes.map(item => noteRow(item, { helpers, now, linksFor })).join("")
        : empty(emptyMessage),
      notesPagination: pagination,
      notesReadLinks: openLinks.length
        ? `<span class="notebook-links-label">연결된 카드 ${openLinks.length}</span>${noteCardChips(openLinks, helpers)}`
        : "",
      notesReadBody: note
        ? (String(note.body || "").trim() ? rendered?.html || "" : empty("본문이 비어 있습니다."))
        : ""
    },
    // applyPagePatch writes html before value; the <select> itself is static.
    value: sort ? { noteSortSelect: sort } : {}
  };
}

// The editor's 연결된 카드 box. The search <input> itself is static markup
// (re-rendering it would drop focus mid-typing); this fills what surrounds it.
//
//   links     core.noteCardLinks() of what is currently in the editor
//   excluded  auto links the user switched off ({ kind, title })
//   results   cards matching the search box
//   query     the search box's text
export function renderNoteLinkEditor({ links = [], excluded = [], results = [], query = "", helpers }) {
  const { badgeClassByKind, escapeHtml, kindLabels } = helpers;
  const linkAttrs = (prefix, link) => `data-${prefix}-kind="${escapeHtml(link.kind)}" data-${prefix}-title="${escapeHtml(link.title)}"`;

  const chips = links.map(link => {
    // A [[제목]] link lives in the body: it goes away by editing the text.
    const removable = link.origin !== "wiki";
    return `<span class="notebook-chip-group">${noteCardChip(link, helpers)}${removable
      ? `<button type="button" class="notebook-chip-remove" ${linkAttrs("note-link-remove", link)} data-note-link-origin="${escapeHtml(link.origin)}" aria-label="${escapeHtml(link.title)} 연결 해제" title="연결 해제">×</button>`
      : ""}</span>`;
  }).join("");

  const resultRows = results.map(item => `
    <button type="button" class="notebook-link-result" ${linkAttrs("note-link-add", item)}>
      <span class="badge ${badgeClassByKind[item.kind] || "green"}">${escapeHtml(kindLabels[item.kind] || item.kind)}</span>
      <span class="notebook-link-result-title" lang="ja">${escapeHtml(item.title)}</span>
      <span class="notebook-link-result-meaning">${escapeHtml([item.reading, item.meaning].filter(Boolean).join(" · "))}</span>
    </button>
  `).join("");

  const restores = excluded.map(link => `
    <button type="button" class="notebook-chip notebook-chip--excluded" lang="ja" ${linkAttrs("note-link-restore", link)} title="다시 연결">${escapeHtml(link.title)} ↩</button>
  `).join("");

  return {
    text: {
      noteLinkCount: links.length ? String(links.length) : ""
    },
    hidden: {
      noteLinkResults: !query.trim(),
      noteLinkExcluded: !excluded.length
    },
    html: {
      noteLinkChips: chips || `<span class="notebook-links-empty">본문에 등록된 한자·단어가 나오면 자동으로 연결됩니다. <code>[[제목]]</code>으로 직접 연결할 수도 있습니다.</span>`,
      noteLinkResults: query.trim()
        ? (resultRows || `<span class="notebook-links-empty">'${escapeHtml(query.trim())}'에 맞는 카드가 없습니다.</span>`)
        : "",
      noteLinkExcluded: excluded.length ? `<span class="notebook-links-label">자동 연결에서 제외</span>${restores}` : ""
    }
  };
}

// Preview shown when a card chip or a [[제목]] link is clicked. `item` is the
// registered card, or null when the link points at nothing.
export function noteCardPopover({ title, item, pageLabel = "", helpers }) {
  const { badgeClassByKind, escapeHtml, kindLabels } = helpers;
  if (!item) {
    return `
      <p class="notebook-popover-title" lang="ja">${escapeHtml(title)}</p>
      <p class="notebook-popover-missing">등록된 카드가 없습니다.</p>
    `;
  }
  const reading = item.reading && item.reading !== item.title ? item.reading : "";
  return `
    <div class="notebook-popover-head">
      <span class="badge ${badgeClassByKind[item.kind] || "green"}">${escapeHtml(kindLabels[item.kind] || item.kind)}</span>
      ${speakerButton(item.title, helpers)}
      <span class="notebook-popover-title" lang="ja">${escapeHtml(item.title)}</span>
    </div>
    ${reading ? `<p class="notebook-popover-reading" lang="ja">${escapeHtml(reading)}</p>` : ""}
    ${item.meaning ? `<p class="notebook-popover-meaning">${escapeHtml(item.meaning)}</p>` : ""}
    <button type="button" class="link-btn" data-note-card-open-kind="${escapeHtml(item.kind)}" data-note-card-open-title="${escapeHtml(item.title)}">${escapeHtml(pageLabel || "카드")} 탭에서 보기</button>
  `;
}
