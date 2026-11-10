const CHOICE_ATTRIBUTES = {
  word: "data-word-quiz-choice",
  kanji: "data-kanji-quiz-choice",
  sentence: "data-sentence-quiz-choice"
};

// Renders one quiz run: the question view while the session is in progress,
// or the result view once it is finished. `family` is word | kanji | sentence;
// `restartKind` is the data-quiz-kind that starts the same quiz again.
export function quizPanel({ quiz, family, title, promptText, promptHtml, cumulativeLabel, layout = "grid", restartKind }, helpers) {
  if (!quiz.question || !quiz.session) {
    return { hidden: true, html: "" };
  }
  if (quiz.session.finished) {
    return { hidden: false, html: quizResult({ session: quiz.session, title, restartKind }, helpers) };
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

function quizResult({ session, title, restartKind }, { escapeHtml, highlight }) {
  const missed = session.missed.length
    ? `<ul class="quiz-missed-list">${session.missed.map(entry => `
        <li><span class="quiz-missed-prompt">${highlight(entry.prompt)}</span><span class="quiz-missed-arrow" aria-hidden="true">→</span><strong>${highlight(entry.answer)}</strong></li>
      `).join("")}</ul>`
    : `<p class="quiz-missed-empty">모두 맞혔습니다!</p>`;
  return `
    <div class="quiz-session-header">
      <strong class="quiz-session-title">${title} 결과</strong>
    </div>
    <div class="quiz-result">
      <p class="quiz-result-score">${session.total}문제 중 <strong>${session.correct}문제</strong> 정답</p>
      ${session.missed.length ? `<h3 class="quiz-missed-title">틀린 문제</h3>` : ""}
      ${missed}
      <div class="quiz-result-actions">
        <button class="primary-btn" type="button" data-quiz-kind="${escapeHtml(restartKind)}">다시 풀기</button>
        <button class="ghost-btn" type="button" data-quiz-exit>목록으로</button>
      </div>
    </div>
  `;
}
