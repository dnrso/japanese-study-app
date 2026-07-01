export function sourceSentenceLinks(sourceSentences = [], { core, highlight }) {
  const uniqueSentences = core.uniqueSourceSentences(sourceSentences);
  if (!uniqueSentences.length) {
    return `<span class="muted">-</span>`;
  }
  return `<div class="word-source-links">
    ${uniqueSentences.map(sentence => `<button class="source-link" data-jump-sentence="${sentence.id}" data-source-date="${sentence.studyDate || ""}">${highlight(sentence.title || "문장 보기")}</button>`).join("")}
  </div>`;
}
