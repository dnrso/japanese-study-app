import { empty, speakerButton } from "../components/index.js";

export function renderSentencesPage({ sentences, caption, helpers }) {
  return {
    text: {
      sentencePageDate: caption
    },
    html: {
      sentenceCards: sentences.length
        ? sentences.map(entry => sentenceCard(entry, helpers)).join("")
        : empty("오늘 공부에서 문장을 저장하면 이곳에 표시됩니다.")
    }
  };
}

function sentenceCard(entry, helpers) {
  const words = helpers.linkedEntriesForSentence("word", entry.id);
  const grammar = helpers.linkedEntriesForSentence("grammar", entry.id);
  const expressions = helpers.linkedEntriesForSentence("expression", entry.id);
  const summary = [
    words.length ? `단어 ${words.length}` : "",
    grammar.length ? `문법 ${grammar.length}` : "",
    expressions.length ? `표현 ${expressions.length}` : ""
  ].filter(Boolean).join(" · ");

  return `
    <article class="study-card daily-entry-card sentence-card" id="sentence-card-${helpers.escapeHtml(entry.id)}" data-daily-entry-id="${helpers.escapeHtml(entry.id)}">
      <div class="daily-entry-card-head">
        <div class="daily-entry-tags">
          <span class="badge ${helpers.badgeClassByKind.sentence || "purple"}">문장</span>
          <span class="badge yellow">${helpers.escapeHtml(entry.studyDate || "")}</span>
          ${entry.registered ? `<span class="badge green">등록됨</span>` : ""}
        </div>
        <button class="danger-btn tiny-action-btn" data-delete-daily-entry="${helpers.escapeHtml(entry.id)}">삭제</button>
      </div>
      <h3 class="daily-sentence-title">${speakerButton(entry.title, helpers)}<span>${helpers.highlight(entry.title)}</span></h3>
      <div class="daily-reading-meaning">
        <section>
          <span>읽기</span>
          <p>${helpers.highlight(entry.reading || "-")}</p>
        </section>
        <section>
          <span>해석</span>
          <p>${helpers.highlight(entry.meaning || "-")}</p>
        </section>
      </div>
      <div class="card-actions">
        ${summary ? `<span class="source-link muted">${helpers.escapeHtml(summary)}</span>` : `<span class="source-link muted">연결된 새 항목 없음</span>`}
        <button class="ghost-btn" data-jump-sentence="${helpers.escapeHtml(entry.id)}" data-source-date="${helpers.escapeHtml(entry.studyDate || "")}">오늘 공부에서 보기</button>
      </div>
    </article>
  `;
}
