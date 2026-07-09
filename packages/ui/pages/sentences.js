import { empty, speakerButton } from "../components/index.js";
import { grammarCandidate, wordCandidate } from "./today.js";

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
  const childWords = helpers.linkedEntriesForSentence("word", entry.id);
  const childGrammar = helpers.linkedEntriesForSentence("grammar", entry.id);
  const childExpressions = helpers.linkedEntriesForSentence("expression", entry.id);
  const children = [...childWords, ...childGrammar, ...childExpressions];
  // Same rollup as today.js's dailyEntryCard: a sentence's own `registered`
  // flag never flips to true (only its word/grammar/expression children are
  // ever registered - see storage-idb's registerDailyEntries), so the
  // "needs registration" mark here is a rollup over its children.
  const needsRegistration = children.length ? children.some(child => helpers.core.entryNeedsRegistration(child)) : false;

  const leftCandidates = childWords.length ? `
    <section class="candidate-section">
      <div class="candidate-title">단어</div>
      <div class="word-candidate-grid">${childWords.map(helpers.entryToCandidate).map(word => wordCandidate(word, helpers)).join("")}</div>
    </section>
  ` : "";
  const rightCandidates = [
    childGrammar.length ? `
      <section class="candidate-section">
        <div class="candidate-title">문법</div>
        <div class="grammar-candidate-list">${childGrammar.map(item => grammarCandidate(item, helpers)).join("")}</div>
      </section>
    ` : "",
    childExpressions.length ? `
      <section class="candidate-section">
        <div class="candidate-title">표현</div>
        <div class="grammar-candidate-list">${childExpressions.map(item => grammarCandidate(item, helpers)).join("")}</div>
      </section>
    ` : ""
  ].join("");
  const candidateLayout = leftCandidates || rightCandidates ? `
    <div class="daily-candidate-layout">
      ${leftCandidates ? `<div class="daily-candidate-column">${leftCandidates}</div>` : ""}
      ${rightCandidates ? `<div class="daily-candidate-column">${rightCandidates}</div>` : ""}
    </div>
  ` : "";

  return `
    <article class="study-card daily-entry-card sentence-card" id="sentence-card-${helpers.escapeHtml(entry.id)}" data-daily-entry-id="${helpers.escapeHtml(entry.id)}">
      <div class="daily-entry-card-head">
        <div class="daily-entry-tags">
          <span class="badge ${helpers.badgeClassByKind.sentence || "purple"}">문장</span>
          <span class="badge yellow">${helpers.escapeHtml(entry.studyDate || "")}</span>
          ${needsRegistration
            ? `<span class="badge red">등록 필요</span>`
            : children.length
              ? `<span class="badge green">전체 등록됨</span>`
              : ""}
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
      ${candidateLayout}
      <div class="card-actions">
        ${children.length ? "" : `<span class="source-link muted">연결된 항목 없음</span>`}
        <button class="ghost-btn" data-jump-sentence="${helpers.escapeHtml(entry.id)}" data-source-date="${helpers.escapeHtml(entry.studyDate || "")}">오늘 공부에서 보기</button>
      </div>
    </article>
  `;
}
