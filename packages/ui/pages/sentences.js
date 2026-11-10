import { empty, icon, speakerButton } from "../components/index.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const CHILD_KINDS = [["word", "단어"], ["grammar", "문법"], ["expression", "표현"]];

export const SENTENCE_STATUS_FILTERS = [["all", "전체"], ["pending", "등록 필요"], ["registered", "등록됨"]];
export const SENTENCE_PERIOD_FILTERS = [["all", "전체 기간"], ["week", "최근 7일"], ["month", "이번 달"]];

export function sentenceDateLabel(dateKey) {
  if (!dateKey) {
    return "날짜 없음";
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${month}월 ${day}일 (${WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]})`;
}

// sentences arrive already filtered, sorted (newest date first) and paged;
// consecutive sentences sharing a studyDate are grouped under one heading.
export function renderSentencesPage({ sentences, summary, helpers }) {
  const groups = [];
  sentences.forEach(entry => {
    const last = groups[groups.length - 1];
    if (last && last.date === (entry.studyDate || "")) {
      last.entries.push(entry);
    } else {
      groups.push({ date: entry.studyDate || "", entries: [entry] });
    }
  });

  return {
    html: {
      sentencePageDate: [
        `전체 ${summary.total}개`,
        summary.pending ? `<span class="sentence-summary-pending">등록 필요 ${summary.pending}개</span>` : "",
        summary.shown !== summary.total ? `표시 ${summary.shown}개` : ""
      ].filter(Boolean).join(" · "),
      sentenceCards: groups.length
        ? groups.map(group => `
          <section class="sentence-date-group">
            <h3 class="sentence-date-heading">
              <button type="button" data-open-study-date="${helpers.escapeHtml(group.date)}" title="오늘 공부에서 이 날짜 보기">${sentenceDateLabel(group.date)}</button>
              <span>${group.entries.length}개</span>
            </h3>
            ${group.entries.map(entry => sentenceCard(entry, helpers)).join("")}
          </section>
        `).join("")
        : empty(summary.total ? "조건에 맞는 문장이 없습니다." : "오늘 공부에서 문장을 저장하면 이곳에 표시됩니다.")
    },
    text: {
      sentenceUnregisteredCount: String(summary.pending)
    },
    hidden: {
      sentenceRegisterBar: !summary.pending
    }
  };
}

export function sentenceChildren(entry, helpers) {
  return Object.fromEntries(CHILD_KINDS.map(([kind]) => [kind, helpers.linkedEntriesForSentence(kind, entry.id)]));
}

// One sentence row. Shared by the 문장 tab and the quiz result view; the quiz
// passes `domId: false` so the element id stays unique on the page.
export function sentenceCard(entry, helpers, { domId = true, open = false } = {}) {
  const children = sentenceChildren(entry, helpers);
  const allChildren = CHILD_KINDS.flatMap(([kind]) => children[kind]);
  // Same rollup as today.js's dailyEntryCard: 전체 등록 targets the sentence
  // itself (which becomes a 문장 item) as well as its
  // word/grammar/expression children, so the "needs registration" mark covers
  // the sentence AND its children.
  const needsRegistration = [entry, ...allChildren].some(item => helpers.core.entryNeedsRegistration(item));
  const counts = CHILD_KINDS
    .filter(([kind]) => children[kind].length)
    .map(([kind, label]) => `${label} ${children[kind].length}`)
    .join(" · ");
  const id = helpers.escapeHtml(entry.id);

  return `
    <details class="sentence-row ${needsRegistration ? "" : "is-registered"}" ${domId ? `id="sentence-card-${id}"` : ""} data-daily-entry-id="${id}" ${open ? "open" : ""}>
      <summary>
        <span class="sentence-row-title" lang="ja">${speakerButton(entry.title, helpers)}<span>${helpers.highlight(entry.title)}</span></span>
        <span class="sentence-row-counts">${counts || "연결 항목 없음"}</span>
        ${needsRegistration
          ? `<span class="badge yellow">등록 필요</span>`
          : `<span class="badge green">${allChildren.length ? "전체 등록됨" : "등록됨"}</span>`}
        <span class="sentence-row-chevron" aria-hidden="true"></span>
      </summary>
      <div class="sentence-row-body">
        <div class="daily-reading-meaning">
          <section>
            <span>읽기</span>
            <p lang="ja">${helpers.highlight(entry.reading || "-")}</p>
          </section>
          <section>
            <span>해석</span>
            <p class="sentence-meaning" data-reveal-meaning>${helpers.highlight(entry.meaning || "-")}</p>
          </section>
        </div>
        ${allChildren.length ? `
          <div class="sentence-items">
            ${CHILD_KINDS.filter(([kind]) => children[kind].length).map(([kind, label]) => `
              <div class="sentence-item-group">
                <span class="sentence-item-kind">${label}</span>
                <ul>
                  ${children[kind].map(item => `
                    <li>
                      <strong lang="ja">${helpers.highlight(item.title)}</strong>
                      ${item.reading ? `<span class="sentence-item-reading" lang="ja">${helpers.highlight(item.reading)}</span>` : ""}
                      <span class="sentence-meaning" data-reveal-meaning>${helpers.highlight(item.meaning || "-")}</span>
                    </li>
                  `).join("")}
                </ul>
              </div>
            `).join("")}
          </div>
        ` : ""}
        <div class="sentence-row-actions">
          ${needsRegistration ? `<button class="ghost-btn tiny-action-btn" type="button" data-register-sentence="${id}">등록</button>` : ""}
          <button class="icon-btn row-delete-btn" type="button" data-delete-daily-entry="${id}" title="삭제" aria-label="삭제">${icon("trash")}</button>
        </div>
      </div>
    </details>
  `;
}
