import { sourceSentenceLinks } from "./sourceLinks.js";
import { speakerButton } from "./speech.js";

export function studyCard(item, helpers) {
  const { badgeClassByKind, escapeHtml, highlight, kindLabels, reviewStatusText } = helpers;
  const meaningText = String(item.meaning || "").trim();
  const noteText = String(item.note || "").trim();
  const note = noteText && noteText !== meaningText ? item.note : "";
  return `
    <article class="study-card" data-item-id="${item.id}">
      <span class="badge ${badgeClassByKind[item.kind] || "green"}">${kindLabels[item.kind] || item.kind}</span>
      <h3>${speakerButton(item.title, helpers)}<span>${highlight(item.title)}</span></h3>
      <p>${highlight([item.reading, item.meaning, item.level].filter(Boolean).join(" · "))}</p>
      ${note ? `<p class="muted">${highlight(note)}</p>` : ""}
      ${item.kind === "grammar" ? `<div class="source-link-list">${sourceSentenceLinks(item.sourceSentences, helpers)}</div>` : ""}
      <div class="card-actions">
        ${item.review ? `<button class="ghost-btn" data-cycle-review="${item.id}">복습: ${escapeHtml(reviewStatusText(item))}</button>` : ""}
        <button class="ghost-btn" data-edit-item="${item.id}">수정</button>
        <button class="danger-btn" data-delete-item="${item.id}">삭제</button>
      </div>
    </article>
  `;
}
