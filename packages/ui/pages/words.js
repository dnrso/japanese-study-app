import { empty, icon, sourceSentenceLinks, speakerButton } from "../components/index.js";

export function renderWordsPage({ rows, reviewOptions = [], helpers }) {
  return {
    html: {
      wordRows: rows.length ? rows.map(item => wordRow(item, reviewOptions, helpers)).join("") : `<tr><td colspan="8">${empty("조건에 맞는 단어가 없습니다.")}</td></tr>`
    }
  };
}

function wordRow(item, reviewOptions, helpers) {
  const id = helpers.escapeHtml(item.id);
  const review = item.review || "대기";
  // Kana-only words read the same as they're written: skip the duplicate.
  const reading = item.reading && item.reading !== item.title ? helpers.highlight(item.reading) : "";
  const meta = [item.part, item.script].filter(Boolean).map(value => helpers.highlight(value)).join(" · ");
  return `
    <tr data-item-id="${id}">
      <td><div class="japanese word-table-title">${speakerButton(item.title, helpers)}<span lang="ja">${helpers.highlight(item.title)}</span></div></td>
      <td class="word-reading" lang="ja">${reading}</td>
      <td class="word-meaning">${helpers.highlight(item.meaning || "")}</td>
      <td class="word-kanji" lang="ja">${item.kanji ? helpers.highlight(item.kanji) : `<span class="muted">–</span>`}</td>
      <td class="word-meta-cell">${meta || `<span class="muted">–</span>`}</td>
      <td class="word-source-cell">${sourceSentenceLinks(item.sourceSentences, helpers)}</td>
      <td>
        <div class="review-cell">
          <select class="review-select ${review === "오늘" ? "is-today" : ""}" data-review-select="${id}" aria-label="복습 시기">
            ${reviewOptions.map(option => `<option value="${helpers.escapeHtml(option)}" ${option === review ? "selected" : ""}>${helpers.escapeHtml(option)}</option>`).join("")}
          </select>
        </div>
      </td>
      <td>
        <div class="word-row-actions">
          <button class="icon-btn row-action-btn" type="button" data-edit-item="${id}" title="수정" aria-label="수정">${icon("pencil")}</button>
          <button class="icon-btn row-delete-btn" type="button" data-delete-item="${id}" title="삭제" aria-label="삭제">${icon("trash")}</button>
        </div>
      </td>
    </tr>
  `;
}

// 단어 추가/수정 dialog fields; `word` is empty for a new word.
export function wordFormFields({ word = {}, partOptions = [], scriptOptions = [], escapeHtml }) {
  const value = key => escapeHtml(word[key] || "");
  const select = (name, label, options, current) => `
    <label class="form-field">
      <span>${label}</span>
      <select name="${name}">
        <option value="">선택 안 함</option>
        ${options.map(option => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
  return `
    <div class="form-grid">
      <label class="form-field"><span>단어 <em>*</em></span><input name="title" lang="ja" required value="${value("title")}" placeholder="例) 傘" /></label>
      <label class="form-field"><span>읽기</span><input name="reading" lang="ja" value="${value("reading")}" placeholder="かさ" /></label>
      <label class="form-field form-field-wide"><span>뜻 <em>*</em></span><input name="meaning" required value="${value("meaning")}" placeholder="우산" /></label>
      <label class="form-field"><span>한자</span><input name="kanji" lang="ja" value="${value("kanji")}" placeholder="傘" /></label>
      ${select("part", "품사", partOptions, word.part)}
      ${select("script", "문자", scriptOptions, word.script)}
    </div>
  `;
}
