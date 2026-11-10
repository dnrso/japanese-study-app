import { empty, icon, speakerButton } from "../components/index.js";
import { manualEntryPlaceholders, sentenceEntryExample } from "../config.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const ENTRY_MODES = [
  ["sentence", "문장"],
  ["word", "단어"],
  ["grammar", "문법"],
  ["expression", "표현"]
];

export function sentenceEntryPanel() {
  return `
    <section class="panel section" id="today-log">
      <div class="panel-header">
        <h2 class="panel-title" id="selectedDateTitle">기록</h2>
      </div>
      <div class="entry-mode-tabs" role="tablist" aria-label="입력 종류">
        ${ENTRY_MODES.map(([mode, label], index) => `
          <button class="entry-mode-tab ${index ? "" : "active"}" type="button" role="tab" data-entry-mode="${mode}" aria-selected="${index ? "false" : "true"}">${label}</button>
        `).join("")}
      </div>
      <div id="sentenceEntryFields">
        <label class="settings-check ai-sentence-analysis-toggle">
          <input id="aiSentenceAnalysisCheckbox" type="checkbox" />
          <span>AI 문장 분석</span>
          <span class="login-only-marker">${icon("lock")}로그인 후 사용 가능</span>
        </label>
        <textarea id="dailyEntryInput" class="daily-entry-input" placeholder="${sentenceEntryExample.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></textarea>
      </div>
      <div id="manualEntryFields" hidden>
        <textarea id="manualEntryInput" class="daily-entry-input manual-entry-input" placeholder=""></textarea>
      </div>
      <p class="muted ai-sentence-analysis-status" id="aiSentenceAnalysisStatus"></p>
      <div class="entry-footer">
        <button class="entry-help-toggle" id="entryHelpToggle" type="button" aria-expanded="false" aria-controls="entryFormatHelp">입력 형식 도움말</button>
        <div class="entry-footer-actions">
          <span class="entry-shortcut-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
          <button class="primary-btn" id="addDailyEntryBtn" type="button">문장 추가</button>
          <button class="primary-btn" id="addManualEntryBtn" type="button" hidden>단어 추가</button>
        </div>
      </div>
      <div class="entry-format-help" id="entryFormatHelp" hidden></div>
    </section>
  `;
}

// Format guide shown under the input for the active entry mode.
export function entryFormatHelp(mode, { escapeHtml }) {
  const rules = mode === "sentence"
    ? [
        "<code># 문장</code> 첫 줄에 일본어 문장",
        "<code>읽기 …</code> / <code>해석 …</code> 줄로 읽기와 뜻",
        "<code>단어장</code> 다음 줄부터 <code>`단어` (읽기) 뜻 | 한자=… | 품사=… | 문자=…</code>",
        "<code>한자=雨(비 우)</code>처럼 괄호 안에 한자의 뜻·음을 쓰면 한자 노트에 함께 등록",
        "<code>문법</code> · <code>표현</code> 다음 줄부터 <code>`항목` 설명</code>"
      ]
    : mode === "word"
      ? [
          "<code>`단어` (읽기) 뜻 | 한자=… | 품사=… | 문자=…</code>",
          "<code>한자=雨(비 우)</code>처럼 괄호 안에 한자의 뜻·음을 쓰면 한자 노트에 함께 등록"
        ]
      : mode === "grammar"
        ? ["<code>`문법` 설명</code>"]
        : ["<code>`표현` (읽기) 뜻과 쓰임</code>"];
  const example = mode === "sentence" ? sentenceEntryExample : manualEntryPlaceholders[mode];
  return `
    <ul>${rules.map(rule => `<li>${rule}</li>`).join("")}</ul>
    <pre lang="ja">${escapeHtml(example)}</pre>
    <button class="ghost-btn tiny-action-btn" id="insertEntryExampleBtn" type="button">예시 넣기</button>
  `;
}

function dateParts(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day, weekday: WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()] };
}

export function renderTodayPage({ selectedDate, sentenceEntries, unregisteredCount = 0, helpers }) {
  const { month, day, weekday } = dateParts(selectedDate);
  return {
    text: {
      selectedDateTitle: `${month}월 ${day}일 (${weekday}) 기록`,
      todayUnregisteredCount: String(unregisteredCount)
    },
    hidden: {
      todayRegisterBar: !unregisteredCount
    },
    html: {
      dailyEntryCards: sentenceEntries.length
        ? sentenceEntries.map(entry => dailyEntryCard(entry, helpers)).join("")
        : empty("이 날짜에 추가한 기록이 없습니다. 위 입력창에 문장, 단어, 문법, 표현을 붙여넣어 보세요.")
    }
  };
}

export function renderCalendarPage({ calendarMonth, selectedDate, todayDate, studyDays, toDateKey, unregisteredDates }) {
  const days = new Map((studyDays || []).map(day => [day.studyDate, day]));
  const [year, month] = calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  return {
    text: {
      calendarTitle: `${year}년 ${month}월`
    },
    html: {
      calendarGrid: Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const key = toDateKey(date);
        const day = days.get(key);
        const studied = Boolean(day && (day.minutes || day.entryCount));
        const isOtherMonth = date.getMonth() !== month - 1;
        const needsRegistration = Boolean(unregisteredDates && unregisteredDates.has(key));
        const classes = [
          "calendar-day",
          key === selectedDate ? "selected" : "",
          key === todayDate ? "is-today" : "",
          isOtherMonth ? "other-month" : ""
        ].filter(Boolean).join(" ");
        const details = [
          `${date.getMonth() + 1}월 ${date.getDate()}일`,
          studied ? `${day.minutes || 0}분 · ${day.entryCount || 0}개 기록` : "",
          needsRegistration ? "등록 필요" : ""
        ].filter(Boolean).join(" · ");
        return `
          <button class="${classes}" type="button" data-calendar-date="${key}" title="${details}" aria-label="${details}">
            <strong>${date.getDate()}</strong>
            <span class="calendar-day-marks">${studied ? `<i class="calendar-dot studied"></i>` : ""}${needsRegistration ? `<i class="calendar-dot pending"></i>` : ""}</span>
          </button>
        `;
      }).join("")
    }
  };
}

export function renderLearnedSectionsPage({ entriesByKind, helpers }) {
  return {
    html: {
      learnedWordCards: learnedKind(entriesByKind.word, "word", helpers),
      learnedGrammarCards: learnedKind(entriesByKind.grammar, "grammar", helpers),
      learnedExpressionCards: learnedKind(entriesByKind.expression, "expression", helpers)
    }
  };
}

function learnedKind(entries, kind, helpers) {
  return entries.length
    ? entries.map(entry => learnedCard(entry, helpers)).join("")
    : empty(`${helpers.kindLabels[kind]} 기록이 없습니다.`);
}

function dailyEntryCard(entry, helpers) {
  const childWords = helpers.linkedEntriesForSentence("word", entry.id);
  const childGrammar = helpers.linkedEntriesForSentence("grammar", entry.id);
  const childExpressions = helpers.linkedEntriesForSentence("expression", entry.id);
  const children = [...childWords, ...childGrammar, ...childExpressions];
  // The 전체 등록 button targets the sentence itself as well as its
  // word/grammar/expression children (registering a sentence creates a 문장
  // item), so the "needs
  // registration" mark is a rollup over the sentence AND its children. Both
  // halves matter: a sentence whose children are all registered but which is
  // itself unregistered is still a 전체 등록 target (and still flags its day in
  // the calendar), so it must not claim 전체 등록됨. The rollup is exactly
  // core.entryNeedsRegistration over the same set of entries the calendar's
  // unregisteredStudyDates looks at, which keeps card and calendar in sync.
  const needsRegistration = [entry, ...children].some(item => helpers.core.entryNeedsRegistration(item));
  const leftCandidates = childWords.length ? `
    <section class="candidate-section">
      <div class="candidate-title">새 단어</div>
      <div class="word-candidate-grid">${childWords.map(helpers.entryToCandidate).map(word => wordCandidate(word, helpers)).join("")}</div>
    </section>
  ` : "";
  const rightCandidates = [
    childGrammar.length ? `
      <section class="candidate-section">
        <div class="candidate-title">새 문법</div>
        <div class="grammar-candidate-list">${childGrammar.map(item => grammarCandidate(item, helpers)).join("")}</div>
      </section>
    ` : "",
    childExpressions.length ? `
      <section class="candidate-section">
        <div class="candidate-title">새 표현</div>
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
    <article class="study-card daily-entry-card" id="daily-entry-${helpers.escapeHtml(entry.id)}" data-daily-entry-id="${helpers.escapeHtml(entry.id)}">
      <div class="daily-entry-card-head">
        <div class="daily-entry-tags">
          <span class="badge ${helpers.badgeClassByKind[entry.kind] || "green"}">${helpers.kindLabels[entry.kind] || helpers.escapeHtml(entry.kind)}</span>
          ${needsRegistration
            ? `<span class="badge yellow">등록 필요</span>`
            : children.length
              ? `<span class="badge green">전체 등록됨</span>`
              : `<span class="badge green">등록됨</span>`}
        </div>
        ${deleteButton(entry, helpers)}
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
    </article>
  `;
}

function deleteButton(entry, helpers) {
  return `<button class="icon-btn row-delete-btn" type="button" data-delete-daily-entry="${helpers.escapeHtml(entry.id)}" title="삭제" aria-label="삭제">${icon("trash")}</button>`;
}

// One checklist row per learned entry: registration state, title/reading,
// meaning and where it came from. The full card lives on the sentence card.
function learnedCard(entry, helpers) {
  const parsed = entry.parsed || {};
  const sourceSentences = entry.sourceSentences?.length
    ? entry.sourceSentences
    : entry.parentId
      ? [{ id: entry.parentId, title: entry.parentTitle || "문장 보기" }]
      : [];
  const meta = entry.kind === "word"
    ? [
        parsed.kanji ? `한자 ${helpers.highlight(parsed.kanji)}` : "",
        parsed.part ? `품사 ${helpers.highlight(parsed.part)}` : ""
      ].filter(Boolean).join(" · ")
    : "";
  return `
    <article class="learned-card ${entry.registered ? "is-registered" : ""}" data-daily-entry-id="${helpers.escapeHtml(entry.id)}">
      <span class="learned-status" title="${entry.registered ? "등록됨" : "등록 필요"}" aria-label="${entry.registered ? "등록됨" : "등록 필요"}"></span>
      <div class="learned-card-main">
        <h4>${speakerButton(entry.title, helpers)}<span>${helpers.highlight(entry.title)}</span>${entry.reading ? `<span class="learned-inline-reading">${helpers.highlight(entry.reading)}</span>` : ""}</h4>
        <p class="learned-meaning">${helpers.highlight(entry.meaning || "-")}${meta ? `<span class="learned-meta"> · ${meta}</span>` : ""}</p>
        ${sourceSentences.length
          ? sourceSentences.map(sentence => `<button class="source-link" data-jump-sentence="${helpers.escapeHtml(sentence.id)}">사용 문장: ${helpers.highlight(sentence.title || "문장 보기")}</button>`).join("")
          : `<span class="source-link muted">직접 추가</span>`}
      </div>
      <div class="learned-card-actions">
        ${entry.registered ? "" : `<button class="ghost-btn tiny-action-btn" type="button" data-register-daily-entry="${helpers.escapeHtml(entry.id)}">등록</button>`}
        ${deleteButton(entry, helpers)}
      </div>
    </article>
  `;
}

export function wordCandidate(word, helpers) {
  return `
    <div class="word-candidate">
      <div class="word-candidate-main">
        <div class="word-inline-title">
          ${speakerButton(word.title, helpers)}
          <strong>${helpers.highlight(word.title)}</strong>
          <span>${helpers.highlight(word.reading || "-")}</span>
        </div>
      </div>
      <p class="item-meaning-text">${helpers.highlight(word.meaning || "-")}</p>
      <div class="word-meta">
        ${word.kanji ? `<span>한자 ${helpers.highlight(word.kanji)}</span>` : ""}
        ${word.part ? `<span>품사 ${helpers.highlight(word.part)}</span>` : ""}
        ${word.script ? `<span>문자 ${helpers.highlight(word.script)}</span>` : ""}
      </div>
    </div>
  `;
}

export function grammarCandidate(item, helpers) {
  return `
    <article class="grammar-candidate">
      <div class="grammar-candidate-head">
        ${speakerButton(item.title, helpers)}
        <strong>${helpers.highlight(item.title)}</strong>
      </div>
      <p class="item-meaning-text">${helpers.highlight(item.meaning || "-")}</p>
    </article>
  `;
}
