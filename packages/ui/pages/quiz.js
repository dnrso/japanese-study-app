import { quizPanel, speakerButton, empty } from "../components/index.js";

const SENTENCE_QUIZ_BADGES = {
  meaning: "문장 뜻 고르기",
  listen: "듣고 문장 고르기"
};

export function renderWordQuizPage({ quiz, helpers }) {
  const panel = quizPanel({
    quiz,
    badge: "단어 퀴즈",
    promptText: question => question.answerType === "title" ? "뜻" : "일본어",
    promptHtml: question => question.answerType === "title"
      ? `<h3><span>${helpers.highlight(question.item.meaning)}</span></h3>`
      : `<h3>${speakerButton(question.item.title, helpers)}<span>${helpers.highlight(question.item.title)}</span></h3>${question.item.reading ? `<p>${helpers.highlight(question.item.reading)}</p>` : ""}`,
    choiceAttribute: "data-word-quiz-choice",
    nextAttribute: "data-next-word-quiz"
  }, helpers);
  return {
    html: { wordQuizPanel: panel.html },
    hidden: { wordQuizPanel: panel.hidden }
  };
}

export function renderKanjiQuizPage({ quiz, helpers }) {
  const panel = quizPanel({
    quiz,
    badge: "한자 퀴즈",
    promptText: question => question.answerType === "title" ? "뜻" : "한자",
    promptHtml: question => question.answerType === "title"
      ? `<h3><span>${helpers.highlight(question.item.meaning)}</span></h3>`
      : `<h3><span>${helpers.highlight(question.item.title)}</span></h3>`,
    choiceAttribute: "data-kanji-quiz-choice",
    nextAttribute: "data-next-kanji-quiz"
  }, helpers);
  return {
    html: { kanjiQuizPanel: panel.html },
    hidden: { kanjiQuizPanel: panel.hidden }
  };
}

export function renderSentenceQuizPage({ quiz, helpers }) {
  if (!quiz.question) {
    return {
      html: { sentenceQuizPanel: quiz.insufficientData ? empty("문장이 4개 이상 필요합니다. 오늘 공부에서 문장을 4개 이상 등록해 보세요.") : "" },
      hidden: { sentenceQuizPanel: !quiz.insufficientData }
    };
  }

  const mode = quiz.question.mode;
  const panel = quizPanel({
    quiz,
    badge: SENTENCE_QUIZ_BADGES[mode] || "문장 퀴즈",
    promptText: question => question.answerType === "title" ? "음성" : "일본어 문장",
    promptHtml: (question, currentQuiz) => sentencePromptHtml(question, currentQuiz, helpers),
    choiceAttribute: "data-sentence-quiz-choice",
    nextAttribute: "data-next-sentence-quiz"
  }, helpers);
  return {
    html: { sentenceQuizPanel: panel.html },
    hidden: { sentenceQuizPanel: panel.hidden }
  };
}

function sentencePromptHtml(question, quiz, helpers) {
  const { item, mode } = question;
  if (mode === "listen" && !quiz.answered) {
    return `<h3>${speakerButton(item.title, helpers)}<span>문장을 듣고 정답을 고르세요</span></h3>`;
  }
  const revealedMeaning = mode === "listen" ? `<p>${helpers.highlight(item.meaning)}</p>` : "";
  return `
    <h3>${speakerButton(item.title, helpers)}<span>${helpers.highlight(item.title)}</span></h3>
    ${item.reading ? `<p>${helpers.highlight(item.reading)}</p>` : ""}
    ${revealedMeaning}
  `;
}
