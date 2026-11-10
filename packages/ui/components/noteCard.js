import { icon } from "./icons.js";
import { sourceSentenceLinks } from "./sourceLinks.js";
import { speakerButton } from "./speech.js";

const stripBackticks = value => String(value || "").replace(/`/g, "").replace(/\s+/g, " ").trim();

// A note that only repeats the card (the meaning, or the raw "`title` meaning"
// line it was registered from) is noise, not a 메모.
function usefulNote(item) {
  const note = String(item.note || "").trim();
  if (!note) {
    return "";
  }
  const title = stripBackticks(item.title);
  const meaning = stripBackticks(item.meaning);
  const flat = stripBackticks(note);
  const withoutTitle = flat.startsWith(title) ? flat.slice(title.length).trim() : flat;
  const reading = stripBackticks(item.reading);
  const rawLines = [`${title} ${meaning}`, `${title} (${reading}) ${meaning}`].map(line => line.trim());
  if (flat === meaning || withoutTitle === meaning || rawLines.includes(flat) || note === meaning) {
    return "";
  }
  return note;
}

// 문법/표현 tab card: title row with edit/delete, reading, meaning, note,
// source sentences, then a 복습 footer.
export function noteCard(item, reviewOptions, helpers) {
  const { escapeHtml, highlight } = helpers;
  const id = escapeHtml(item.id);
  const review = item.review || "대기";
  const reading = item.reading && item.reading !== item.title ? item.reading : "";
  const note = usefulNote(item);
  const hasSources = helpers.core.uniqueSourceSentences(item.sourceSentences).length > 0;
  return `
    <article class="study-card note-card" data-item-id="${id}">
      <div class="note-card-head">
        <h3 class="note-card-title">${speakerButton(item.title, helpers)}<span lang="ja">${highlight(item.title)}</span></h3>
        <div class="note-card-actions">
          <button class="icon-btn row-action-btn" type="button" data-edit-item="${id}" title="수정" aria-label="수정">${icon("pencil")}</button>
          <button class="icon-btn row-delete-btn" type="button" data-delete-item="${id}" title="삭제" aria-label="삭제">${icon("trash")}</button>
        </div>
      </div>
      ${reading ? `<p class="note-card-reading" lang="ja">${highlight(reading)}</p>` : ""}
      ${item.meaning || item.level ? `<p class="note-card-meaning">${highlight(item.meaning || "")}${item.level ? ` <span class="note-card-level">${highlight(item.level)}</span>` : ""}</p>` : ""}
      ${note ? `<p class="note-card-note">${highlight(note)}</p>` : ""}
      ${hasSources ? `<div class="note-card-source"><span class="note-card-source-label">예문</span>${sourceSentenceLinks(item.sourceSentences, helpers)}</div>` : ""}
      <div class="note-card-footer">
        <span class="note-card-footer-label">복습</span>
        <select class="review-select ${review === "오늘" ? "is-today" : ""}" data-review-select="${id}" aria-label="복습 시기">
          ${reviewOptions.map(option => `<option value="${escapeHtml(option)}" ${option === review ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </div>
    </article>
  `;
}

// Fields for the 문법/표현 add/edit dialog.
export function noteFormFields({ kind, item = {}, escapeHtml }) {
  const value = key => escapeHtml(item[key] || "");
  if (kind === "grammar") {
    return `
      <div class="form-grid">
        <label class="form-field form-field-wide"><span>패턴 <em>*</em></span><input name="title" lang="ja" required value="${value("title")}" placeholder="例) 〜てしまう" /></label>
        <label class="form-field form-field-wide"><span>설명 <em>*</em></span><textarea name="meaning" rows="3" required placeholder="동작의 완료나 후회·유감을 나타낸다">${value("meaning")}</textarea></label>
        <label class="form-field form-field-wide"><span>메모</span><input name="note" value="${escapeHtml(usefulNote(item))}" /></label>
      </div>
    `;
  }
  return `
    <div class="form-grid">
      <label class="form-field"><span>표현 <em>*</em></span><input name="title" lang="ja" required value="${value("title")}" placeholder="例) お疲れ様です" /></label>
      <label class="form-field"><span>읽기</span><input name="reading" lang="ja" value="${value("reading")}" placeholder="おつかれさまです" /></label>
      <label class="form-field form-field-wide"><span>뜻 <em>*</em></span><input name="meaning" required value="${value("meaning")}" placeholder="수고하셨습니다" /></label>
      <label class="form-field form-field-wide"><span>메모</span><input name="note" value="${escapeHtml(usefulNote(item))}" /></label>
    </div>
  `;
}
