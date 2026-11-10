import { speakerButton } from "./speech.js";

const CHOICE_ATTRIBUTES = {
  word: "data-word-quiz-choice",
  kanji: "data-kanji-quiz-choice",
  sentence: "data-sentence-quiz-choice"
};

// Renders one quiz run: the question view while the session is in progress,
// or the result view once it is finished. `family` is word | kanji | sentence;
// `restartKind` is the data-quiz-kind that starts the same quiz again.
export function quizPanel({ quiz, family, title, promptText, promptHtml, cumulativeLabel, layout = "grid", restartKind, wordsFor }, helpers) {
  if (!quiz.question || !quiz.session) {
    return { hidden: true, html: "" };
  }
  if (quiz.session.finished) {
    return { hidden: false, html: quizResult({ session: quiz.session, family, title, restartKind, wordsFor }, helpers) };
  }

  const { item, choices } = quiz.question;
  const { session } = quiz;
  const label = promptText(quiz.question, quiz);
  const answeredCount = session.index + (quiz.answered ? 1 : 0);
  const percent = session.total ? Math.round((answeredCount / session.total) * 100) : 0;
  return {
    hidden: false,
    html: `
      <div class="quiz-session-header">
        <strong class="quiz-session-title">${title}</strong>
        <span class="quiz-session-progress">${session.index + 1} / ${session.total}</span>
        <button class="ghost-btn compact-action-btn" type="button" data-quiz-exit>그만하기</button>
      </div>
      <div class="quiz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${session.total}" aria-valuenow="${answeredCount}"><span style="width: ${percent}%"></span></div>
      <div class="word-quiz-question">
        ${label ? `<p class="word-quiz-prompt-label">${label}</p>` : ""}
        ${promptHtml(quiz.question, quiz)}
        ${cumulativeLabel ? `<p class="quiz-item-record">이 ${cumulativeLabel} 누적: 정답 ${Number(item.quizCorrectCount || 0)} · 오답 ${Number(item.quizWrongCount || 0)}</p>` : ""}
      </div>
      <div class="word-quiz-choices ${layout === "list" ? "list" : ""}">
        ${choices.map((choice, index) => quizChoice(choice, index, quiz, CHOICE_ATTRIBUTES[family], helpers)).join("")}
      </div>
      ${quizFeedback(quiz, family)}
    `
  };
}

function quizChoice(choice, index, quiz, choiceAttribute, { escapeHtml, highlight }) {
  const isSelected = quiz.selectedAnswer === choice;
  const isCorrect = quiz.answered && choice === quiz.question.correctAnswer;
  const isWrong = quiz.answered && isSelected && !isCorrect;
  return `
    <button class="word-quiz-choice ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}" type="button" ${choiceAttribute}="${escapeHtml(choice)}" ${quiz.answered ? "disabled" : ""}>
      <span class="word-quiz-choice-index" aria-hidden="true">${index + 1}</span>
      <span class="word-quiz-choice-text">${highlight(choice || "-")}</span>
    </button>
  `;
}

function quizFeedback(quiz, family) {
  if (!quiz.answered) {
    return "";
  }
  const correct = Boolean(quiz.result?.correct);
  const last = quiz.session.index + 1 >= quiz.session.total;
  return `
    <div class="word-quiz-feedback ${correct ? "correct" : "wrong"}" role="status">
      <strong>${correct ? "✓ 정답입니다" : "✕ 오답입니다"}</strong>
      <button class="primary-btn" type="button" data-quiz-next="${family}">${last ? "결과 보기" : "다음 문제"}</button>
    </div>
  `;
}

const MISSED_KANJI_WORDS = 3;

// Read-only info card for one missed item. Falls back to the prompt/answer
// pair when the entry carries no item (older sessions).
function quizMissedCard(entry, family, helpers, wordsFor) {
  const { escapeHtml } = helpers;
  const item = entry.item || { title: entry.prompt, meaning: entry.answer };
  const reading = item.reading && item.reading !== item.title ? item.reading : "";
  const wrong = String(entry.selectedAnswer || "").trim();
  const wrongLine = wrong ? `<p class="quiz-missed-wrong">내 답: <span>${escapeHtml(wrong)}</span></p>` : "";
  let body;
  if (family === "kanji") {
    const words = (typeof wordsFor === "function" ? wordsFor(item) : []).slice(0, MISSED_KANJI_WORDS);
    body = `
      <span class="quiz-missed-kanji" lang="ja">${escapeHtml(item.title)}</span>
      ${item.meaning ? `<p class="quiz-missed-meaning">${escapeHtml(item.meaning)}</p>` : ""}
      ${item.reading ? `<p class="quiz-missed-reading" lang="ja">${escapeHtml(item.reading)}</p>` : ""}
      ${words.length ? `<ul class="quiz-missed-words">${words.map(word => `
        <li>
          ${speakerButton(word.title, helpers)}
          <span class="quiz-missed-word-text"><strong lang="ja">${escapeHtml(word.title)}</strong>${word.reading ? ` <span class="quiz-missed-reading" lang="ja">${escapeHtml(word.reading)}</span>` : ""}${word.meaning ? ` <span class="quiz-missed-word-meaning">${escapeHtml(word.meaning)}</span>` : ""}</span>
        </li>`).join("")}</ul>` : ""}
    `;
  } else {
    const meta = family === "word" ? [item.part, item.script].filter(Boolean).map(escapeHtml).join(" · ") : "";
    body = `
      <h4 class="quiz-missed-title-row">${item.title ? speakerButton(item.title, helpers) : ""}<span lang="ja">${escapeHtml(item.title || "")}</span></h4>
      ${reading ? `<p class="quiz-missed-reading" lang="ja">${escapeHtml(reading)}</p>` : ""}
      ${item.meaning ? `<p class="quiz-missed-meaning">${escapeHtml(item.meaning)}</p>` : ""}
      ${meta ? `<p class="quiz-missed-meta">${meta}</p>` : ""}
      ${family === "word" && item.kanji ? `<p class="quiz-missed-meta">한자 <span lang="ja">${escapeHtml(item.kanji)}</span></p>` : ""}
    `;
  }
  return `<article class="quiz-missed-card">${body}${wrongLine}</article>`;
}

function quizResult({ session, family, title, restartKind, wordsFor }, helpers) {
  const { escapeHtml } = helpers;
  const seen = new Set();
  const missed = session.missed.filter(entry => {
    const key = entry.id ?? `${entry.prompt}\u0000${entry.answer}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return `
    <div class="quiz-session-header">
      <strong class="quiz-session-title">${title} 결과</strong>
    </div>
    <div class="quiz-result">
      <p class="quiz-result-score">${session.total}문제 중 <strong>${session.correct}문제</strong> 정답</p>
      <div class="quiz-result-actions">
        <button class="primary-btn" type="button" data-quiz-kind="${escapeHtml(restartKind)}">다시 풀기</button>
        <button class="ghost-btn" type="button" data-quiz-exit>목록으로</button>
      </div>
      ${missed.length
        ? `<h3 class="quiz-missed-title">틀린 문제 ${missed.length}개</h3>
           <div class="quiz-missed-grid">${missed.map(entry => quizMissedCard(entry, family, helpers, wordsFor)).join("")}</div>`
        : `<p class="quiz-missed-empty">모두 맞혔습니다!</p>`}
    </div>
  `;
}
