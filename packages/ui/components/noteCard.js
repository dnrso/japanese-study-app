import { icon } from "./icons.js";
import { speakerButton } from "./speech.js";

const stripBackticks = value => String(value || "").replace(/`/g, "").replace(/\s+/g, " ").trim();

// A note that only repeats the card (the meaning, or the raw "`title` meaning"
// line it was registered from) is noise, not a 메모.
function usefulNote(item) {
  const note = String(item.note || "").trim();
  // A sentence item's note is the raw input block it was registered from.
  if (!note || item.kind === "sentence") {
    return "";
  }
  const title = stripBackticks(item.title);
  const meaning = stripBackticks(item.meaning);
  const flat = stripBackticks(note);
  const withoutTitle = flat.startsWith(title) ? flat.slice(title.length).trim() : flat;
  const reading = stripBackticks(item.reading);
  const rawLines = [`${title} ${meaning}`, `${title} (${reading}) ${meaning}`].map(line => line.trim());
  const reading0 = stripBackticks(item.reading);
  const combos = [title, reading0, meaning, [title, reading0, meaning].filter(Boolean).join(" "), [reading0, meaning].filter(Boolean).join(" ")];
  if (flat === meaning || withoutTitle === meaning || rawLines.includes(flat) || note === meaning || combos.includes(flat)) {
    return "";
  }
  return note;
}

// The part of an example sentence that matches the card's title (leading/
// trailing 〜/~ and whitespace stripped) gets <strong class="example-hit">.
// The raw sentence is split first and each piece is highlighted separately, so
// search marks and the emphasis never nest into broken markup.
function exampleSentenceHtml(sentenceTitle, itemTitle, { highlight }) {
  const text = String(sentenceTitle || "");
  const needle = String(itemTitle || "").replace(/^[\s〜~]+|[\s〜~]+$/g, "");
  const at = needle ? text.indexOf(needle) : -1;
  if (at < 0) {
    return highlight(text);
  }
  return `${highlight(text.slice(0, at))}<strong class="example-hit">${highlight(needle)}</strong>${highlight(text.slice(at + needle.length))}`;
}

function exampleBlock(item, helpers) {
  const { escapeHtml, highlight } = helpers;
  const sentences = helpers.core.uniqueSourceSentences(item.sourceSentences);
  if (!sentences.length) {
    return "";
  }
  const rows = sentences.map(sentence => {
    const meaning = helpers.sentenceMeaning ? String(helpers.sentenceMeaning(sentence.id) || "").trim() : "";
    const speaker = item.kind === "grammar" && sentence.title
      ? `<span class="note-example-speaker">${speakerButton(sentence.title, helpers)}</span>`
      : "";
    return `<li class="note-example">
      ${speaker}
      <div class="note-example-body">
        <button class="source-link note-example-link" type="button" data-jump-sentence="${escapeHtml(sentence.id)}" data-source-date="${escapeHtml(sentence.studyDate || "")}" title="${escapeHtml(sentence.title || "")}"><span class="note-example-text" lang="ja">${sentence.title ? exampleSentenceHtml(sentence.title, item.title, helpers) : "문장 보기"}</span><span class="note-example-chevron" aria-hidden="true">›</span></button>
        ${meaning ? `<p class="note-example-meaning">${highlight(meaning)}</p>` : ""}
      </div>
    </li>`;
  }).join("");
  return `<div class="note-card-source"><span class="note-card-source-label">예문</span><ul class="note-example-list">${rows}</ul></div>`;
}

// Study card: title row (optional kind badge, speaker, title, review select,
// edit/delete), reading, meaning, note, source sentences. `options.showKind`
// adds the kind badge (home list mixes kinds); without `item.review` the select
// is only rendered on the 문법/표현 tabs (no showKind), defaulting to "대기".
export function noteCard(item, reviewOptions, helpers, options = {}) {
  const { badgeClassByKind, escapeHtml, highlight, kindLabels } = helpers;
  const { showKind = false } = options;
  const id = escapeHtml(item.id);
  const review = item.review || "대기";
  const reading = item.reading && item.reading !== item.title ? item.reading : "";
  const note = usefulNote(item);
  const kindBadge = showKind
    ? `<span class="badge note-card-kind ${badgeClassByKind[item.kind] || "green"}">${kindLabels[item.kind] || escapeHtml(item.kind)}</span>`
    : "";
  const reviewSelect = !showKind || item.review
    ? `<select class="review-select review-select-sm ${review === "오늘" ? "is-today" : ""}" data-review-select="${id}" aria-label="복습 시기">
            ${reviewOptions.map(option => `<option value="${escapeHtml(option)}" ${option === review ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>`
    : "";
  return `
    <article class="study-card note-card" data-item-id="${id}">
      <div class="note-card-head">
        <h3 class="note-card-title">${kindBadge}${item.kind === "grammar" ? "" : speakerButton(item.title, helpers)}<span lang="ja">${highlight(item.title)}</span></h3>
        <div class="note-card-actions">
          ${reviewSelect}
          <button class="icon-btn row-action-btn" type="button" data-edit-item="${id}" title="수정" aria-label="수정">${icon("pencil")}</button>
        </div>
      </div>
      ${reading ? `<p class="note-card-reading" lang="ja">${highlight(reading)}</p>` : ""}
      ${item.meaning || item.level ? `<p class="note-card-meaning">${highlight(item.meaning || "")}${item.level ? ` <span class="note-card-level">${highlight(item.level)}</span>` : ""}</p>` : ""}
      ${note ? `<p class="note-card-note"><span class="note-card-note-label">메모</span>${highlight(note)}</p>` : ""}
      ${exampleBlock(item, helpers)}
    </article>
  `;
}

// A kanji's note is auto-filled with the source word it was registered from
// ("雨 (あめ)"). That is bookkeeping, not a user 메모: return the note only when
// it is not exactly one of the linked words' `title` / `title (reading)`.
export function kanjiMemo(item, linkedWords = []) {
  const note = String(item.note || "").trim();
  if (!note) {
    return "";
  }
  const flat = value => String(value || "").replace(/\s+/g, " ").trim();
  const autoNotes = linkedWords.flatMap(word => {
    const title = flat(word.title);
    const reading = flat(word.reading);
    return reading ? [title, `${title} (${reading})`] : [title];
  });
  return autoNotes.includes(flat(note)) ? "" : note;
}

// Fields for the 문법/표현/한자 add/edit dialog. `linkedWords` (한자 only) are
// the word items using the kanji, used to hide the auto-generated source note.
export function noteFormFields({ kind, item = {}, escapeHtml, linkedWords = [] }) {
  const value = key => escapeHtml(item[key] || "");
  if (kind === "kanji") {
    return `
      <div class="form-grid">
        <label class="form-field"><span>한자 <em>*</em></span><input name="title" lang="ja" required maxlength="8" value="${value("title")}" placeholder="例) 雨" /></label>
        <label class="form-field"><span>뜻</span><input name="meaning" value="${value("meaning")}" placeholder="예: 비 우" /></label>
        <label class="form-field form-field-wide"><span>읽기</span><input name="reading" lang="ja" value="${value("reading")}" placeholder="예: 음 ウ / 훈 あめ" /></label>
        <label class="form-field form-field-wide"><span>메모</span><input name="note" value="${escapeHtml(kanjiMemo(item, linkedWords))}" /></label>
      </div>
    `;
  }
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
