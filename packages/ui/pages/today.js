import { empty, speakerButton } from "../components/index.js";

export function sentenceEntryPanel() {
  return `
    <section class="panel section" id="today-log">
      <div class="panel-header">
        <h2 class="panel-title" id="selectedDateTitle">문장 추가</h2>
        <div class="panel-header-actions">
          <button class="primary-btn" id="addDailyEntryBtn" type="button">문장 추가</button>
        </div>
      </div>
      <label class="settings-check ai-sentence-analysis-toggle">
        <input id="aiSentenceAnalysisCheckbox" type="checkbox" />
        <span>AI 문장 분석</span>
        <span class="login-only-marker"><span class="login-only-icon" aria-hidden="true">!</span>(로그인 유저만 사용 가능)</span>
      </label>
      <textarea id="dailyEntryInput" class="daily-entry-input" placeholder="# 私なんか気に障ることしたかな
읽기 わたし なんか きにさわる こと したかな
해석 나 따위가 기분 상할 만한 일을 한 걸까
단어장
\`気に障る\` (きにさわる) 기분에 거슬리다 | 한자=気, 障 | 품사=동사표현 | 문자=한자+히라가나
문법
\`なんか\` 자신을 낮추거나 가볍게 말할 때 쓰는 표현"></textarea>
      <p class="muted ai-sentence-analysis-status" id="aiSentenceAnalysisStatus"></p>
    </section>
  `;
}

export function renderTodayPage({ selectedDate, sentenceEntries, helpers }) {
  return {
    text: {
      selectedDateTitle: `${selectedDate} 문장 추가`
    },
    html: {
      dailyEntryCards: sentenceEntries.length
        ? sentenceEntries.map(entry => dailyEntryCard(entry, helpers)).join("")
        : empty("이 날짜에 추가한 기록이 없습니다. 위 입력창에 문장, 단어, 문법, 표현을 붙여넣어 보세요.")
    }
  };
}

export function renderCalendarPage({ calendarMonth, selectedDate, studyDays, toDateKey, unregisteredDates }) {
  const days = new Map((studyDays || []).map(day => [day.studyDate, day]));
  const [year, month] = calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  return {
    text: {
      calendarTitle: `${calendarMonth.replace("-", ".")} 학습 캘린더`
    },
    html: {
      calendarGrid: Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const key = toDateKey(date);
        const day = days.get(key);
        const isSelected = key === selectedDate;
        const isOtherMonth = date.getMonth() !== month - 1;
        const needsRegistration = Boolean(unregisteredDates && unregisteredDates.has(key));
        return `
          <button class="calendar-day ${isSelected ? "selected" : ""} ${isOtherMonth ? "other-month" : ""}" data-calendar-date="${key}">
            <strong>${date.getDate()}${needsRegistration ? `<sup class="calendar-day-flag" title="등록 필요">!</sup>` : ""}</strong>
            ${day ? `<span>${day.minutes || 0}분 · ${day.entryCount || 0}개</span>` : ""}
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
  // A sentence's own `registered` flag never flips to true (only its
  // word/grammar/expression children are ever registered - see
  // storage-idb's registerDailyEntries) - so the "needs registration" mark
  // on a sentence card is a rollup over its children, not entry.registered.
  const needsRegistration = children.length ? children.some(child => !child.registered) : false;
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
    <article class="study-card daily-entry-card" id="daily-entry-${entry.id}" data-daily-entry-id="${entry.id}">
      <div class="daily-entry-card-head">
        <div class="daily-entry-tags">
          <span class="badge ${helpers.badgeClassByKind[entry.kind] || "green"}">${helpers.kindLabels[entry.kind] || entry.kind}</span>
          ${needsRegistration
            ? `<span class="badge red">등록 필요</span>`
            : children.length
              ? `<span class="badge green">전체 등록됨</span>`
              : `<span class="badge yellow">오늘 기록</span>`}
          <button class="danger-btn tiny-action-btn" data-delete-daily-entry="${entry.id}">삭제</button>
        </div>
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

function learnedCard(entry, helpers) {
  const parsed = entry.parsed || {};
  const sourceSentences = entry.sourceSentences?.length
    ? entry.sourceSentences
    : entry.parentId
      ? [{ id: entry.parentId, title: entry.parentTitle || "문장 보기" }]
      : [];
  return `
    <article class="learned-card" data-daily-entry-id="${entry.id}">
      <div class="learned-card-head">
        <div class="learned-card-tags">
          <span class="badge ${helpers.badgeClassByKind[entry.kind] || "green"}">${helpers.kindLabels[entry.kind]}</span>
          ${entry.registered ? `<span class="badge green">등록됨</span>` : `<span class="badge red">등록 필요</span>`}
          <button class="danger-btn tiny-action-btn" data-delete-daily-entry="${entry.id}">삭제</button>
        </div>
      </div>
      <h4>${speakerButton(entry.title, helpers)}<span>${helpers.highlight(entry.title)}</span>${entry.reading ? `<span class="learned-inline-reading">${helpers.highlight(entry.reading)}</span>` : ""}</h4>
      <p class="learned-meaning item-meaning-text">${helpers.highlight(entry.meaning || "-")}</p>
      ${entry.kind === "word" ? `<div class="word-meta learned-meta">
        ${parsed.kanji ? `<span>한자 ${helpers.highlight(parsed.kanji)}</span>` : ""}
        ${parsed.part ? `<span>품사 ${helpers.highlight(parsed.part)}</span>` : ""}
        ${parsed.script ? `<span>문자 ${helpers.highlight(parsed.script)}</span>` : ""}
      </div>` : ""}
      ${sourceSentences.length ? `<div class="source-link-list">
        ${sourceSentences.map(sentence => `<button class="source-link" data-jump-sentence="${sentence.id}">사용 문장: ${helpers.highlight(sentence.title || "문장 보기")}</button>`).join("")}
      </div>` : `<span class="source-link muted">직접 추가</span>`}
    </article>
  `;
}

function wordCandidate(word, helpers) {
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

function grammarCandidate(item, helpers) {
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
