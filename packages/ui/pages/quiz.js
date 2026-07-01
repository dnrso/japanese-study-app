import { quizPanel, speakerButton } from "../components/index.js";

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
