import { empty, icon, kanjiMemo, speakerButton } from "../components/index.js";

const VISIBLE_WORDS = 3;

// `wordsFor(item)` returns every word item that uses the kanji, newest first
// (computed by the caller so this template never scans app state).
export function renderKanjiPage({ kanji, reviewOptions = [], wordsFor = () => [], emptyMessage = "한자를 추가해 보세요.", helpers }) {
  const { escapeHtml, highlight } = helpers;
  return {
    html: {
      kanjiCards: kanji.length ? kanji.map(item => {
        const id = escapeHtml(item.id);
        const review = item.review || "대기";
        const words = wordsFor(item);
        const memo = kanjiMemo(item, words);
        const hasInfo = Boolean(item.meaning || item.reading);
        const shown = words.slice(0, VISIBLE_WORDS);
        return `
        <article class="kanji-card" data-item-id="${id}">
          <div class="kanji-card-main">
            <span class="kanji-char" lang="ja">${highlight(item.title)}</span>
            <div class="kanji-info">
              ${item.meaning ? `<strong>${highlight(item.meaning)}</strong>` : ""}
              ${item.reading ? `<p lang="ja">${highlight(item.reading)}</p>` : ""}
              ${hasInfo ? "" : `<button class="link-btn" type="button" data-edit-item="${id}">뜻·읽기 추가</button>`}
              ${memo ? `<p class="kanji-memo">${highlight(memo)}</p>` : ""}
            </div>
            <div class="note-card-actions">
              <select class="review-select review-select-sm ${review === "오늘" ? "is-today" : ""}" data-review-select="${id}" aria-label="복습 시기">
                ${reviewOptions.map(option => `<option value="${escapeHtml(option)}" ${option === review ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
              </select>
              <button class="icon-btn row-action-btn" type="button" data-edit-item="${id}" title="수정" aria-label="수정">${icon("pencil")}</button>
              <button class="icon-btn row-delete-btn" type="button" data-delete-item="${id}" title="삭제" aria-label="삭제">${icon("trash")}</button>
            </div>
          </div>
          ${shown.length ? `
          <div class="kanji-words">
            <span class="kanji-words-label">쓰인 단어</span>
            <ul class="kanji-word-list">
              ${shown.map(word => `
              <li class="kanji-word">
                ${speakerButton(word.title, helpers)}
                <strong lang="ja">${highlight(word.title)}</strong>
                ${word.reading ? `<span class="kanji-word-reading" lang="ja">${highlight(word.reading)}</span>` : ""}
                ${word.meaning ? `<span class="kanji-word-meaning">${highlight(word.meaning)}</span>` : ""}
              </li>`).join("")}
            </ul>
            ${words.length > VISIBLE_WORDS ? `<button class="link-btn" type="button" data-show-kanji-words="${escapeHtml(item.title)}">단어 ${words.length}개 모두 보기</button>` : ""}
          </div>` : ""}
        </article>
      `;
      }).join("") : empty(escapeHtml(emptyMessage))
    }
  };
}
