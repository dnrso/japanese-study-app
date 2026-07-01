export function quizPanel({ quiz, badge, promptText, promptHtml, choiceAttribute, nextAttribute }, helpers) {
  if (!quiz.question) {
    return { hidden: true, html: "" };
  }

  const { item, choices } = quiz.question;
  return {
    hidden: false,
    html: `
      <div class="word-quiz-question">
        <div>
          <span class="badge ${item.kind === "kanji" ? "yellow" : "red"}">${badge}</span>
          <p class="word-quiz-prompt-label">${promptText(quiz.question)}</p>
          ${promptHtml(quiz.question)}
        </div>
        <div class="word-quiz-score">
          <span>정답 ${Number(item.quizCorrectCount || 0)}</span>
          <span>오답 ${Number(item.quizWrongCount || 0)}</span>
        </div>
      </div>
      <div class="word-quiz-choices">
        ${choices.map(choice => quizChoice(choice, quiz, choiceAttribute, helpers)).join("")}
      </div>
      ${quizFeedback(quiz, nextAttribute, helpers)}
    `
  };
}

function quizChoice(choice, quiz, choiceAttribute, { escapeHtml, highlight }) {
  const isSelected = quiz.selectedAnswer === choice;
  const isCorrect = quiz.answered && choice === quiz.question.correctAnswer;
  const isWrong = quiz.answered && isSelected && !isCorrect;
  return `
    <button class="word-quiz-choice ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}" type="button" ${choiceAttribute}="${escapeHtml(choice)}" ${quiz.answered ? "disabled" : ""}>
      ${highlight(choice || "-")}
    </button>
  `;
}

function quizFeedback(quiz, nextAttribute, { highlight }) {
  if (!quiz.answered) {
    return "";
  }
  const correct = quiz.result?.correct;
  const correctAnswer = quiz.result?.correctAnswer || quiz.question.correctAnswer;
  return `
    <div class="word-quiz-feedback ${correct ? "correct" : "wrong"}">
      <strong>${correct ? "정답입니다." : "오답입니다."}</strong>
      <span>정답: ${highlight(correctAnswer)}</span>
      <button class="primary-btn" type="button" ${nextAttribute}>다음 문제</button>
    </div>
  `;
}
