import { empty, sourceSentenceLinks, speakerButton, taxonomyChip } from "../components/index.js";

export function renderWordsPage({ rows, helpers }) {
  return {
    html: {
      wordRows: rows.length ? rows.map(item => `
        <tr data-item-id="${item.id}">
          <td><div class="japanese word-table-title">${speakerButton(item.title, helpers)}<span>${helpers.highlight(item.title)}</span></div></td>
          <td>${helpers.highlight(item.reading || "-")}</td>
          <td>${helpers.highlight(item.meaning)}</td>
          <td>${helpers.highlight(item.kanji || "없음")}</td>
          <td><span class="badge blue">${helpers.highlight(item.part || "-")}</span></td>
          <td><span class="badge green">${helpers.highlight(item.script || "-")}</span></td>
          <td>${sourceSentenceLinks(item.sourceSentences, helpers)}</td>
          <td><button class="badge ${item.review === "오늘" ? "red" : "yellow"}" data-cycle-review="${item.id}">${helpers.highlight(helpers.reviewStatusText(item))}</button></td>
          <td>
            <div class="word-row-actions">
              <button class="ghost-btn" data-edit-item="${item.id}">수정</button>
              <button class="danger-btn" data-delete-item="${item.id}">삭제</button>
            </div>
          </td>
        </tr>
      `).join("") : `<tr><td colspan="9">${empty("조건에 맞는 단어가 없습니다.")}</td></tr>`
    }
  };
}

export function renderTaxonomyPage({ partOptions, scriptOptions, selectedPart, selectedScript, helpers }) {
  return {
    html: {
      partChips: partOptions.map(option => taxonomyChip("part", option, selectedPart === option, helpers)).join(""),
      scriptChips: scriptOptions.map(option => taxonomyChip("script", option, selectedScript === option, helpers)).join("")
    }
  };
}
