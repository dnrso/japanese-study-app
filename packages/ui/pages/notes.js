import { empty } from "../components/emptyState.js";
import { icon } from "../components/icons.js";

export const NOTES_VIEWS = ["list", "read", "edit"];

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

function noteRow(note, { helpers, now }) {
  const { core, escapeHtml, highlight } = helpers;
  const id = escapeHtml(note.id);
  const preview = core.notePreview(note);
  return `
    <article class="notebook-row" data-note-id="${id}">
      <button class="notebook-row-main" type="button" data-open-note="${id}">
        <span class="notebook-row-title">${highlight(core.noteDisplayTitle(note))}</span>
        ${preview ? `<span class="notebook-row-preview">${highlight(preview)}</span>` : ""}
      </button>
      <span class="notebook-row-date">${escapeHtml(noteDateLabel(note.updatedAt, now))}</span>
      <div class="notebook-row-actions">
        <button class="icon-btn row-action-btn" type="button" data-edit-note="${id}" title="수정" aria-label="수정">${icon("pencil")}</button>
        <button class="icon-btn row-delete-btn" type="button" data-delete-note="${id}" title="삭제" aria-label="삭제">${icon("trash")}</button>
      </div>
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
export function renderNotesPage({ view = "list", notes = [], total = 0, note = null, rendered = null, searchTerm = "", now = new Date(), helpers }) {
  const { core, escapeHtml } = helpers;
  const activeView = view === "read" && !note ? "list" : view;
  const emptyMessage = searchTerm
    ? `'${escapeHtml(searchTerm)}' 검색 결과가 없습니다.`
    : "공부하면서 정리한 내용을 노트로 남겨 보세요. Markdown 표와 목록을 그대로 붙여 넣을 수 있습니다.";
  const edited = note ? noteDateLabel(note.updatedAt, now) : "";

  return {
    hidden: {
      notesReadTitle: !(note && String(note.title || "").trim()),
      notesListView: activeView !== "list",
      notesReadView: activeView !== "read",
      notesEditView: activeView !== "edit"
    },
    text: {
      notesCount: searchTerm && notes.length !== total ? `노트 ${notes.length}개 / 전체 ${total}개` : `노트 ${total}개`,
      // Only a title the user typed gets the big heading: a derived title is
      // the body's own first line and would just be shown twice.
      notesReadTitle: note ? String(note.title || "").trim() : "",
      notesReadMeta: edited ? `마지막 수정 ${edited}` : ""
    },
    html: {
      notesList: notes.length
        ? notes.map(item => noteRow(item, { helpers, now })).join("")
        : empty(emptyMessage),
      notesReadBody: note
        ? (String(note.body || "").trim() ? rendered?.html || "" : empty("본문이 비어 있습니다."))
        : ""
    }
  };
}
