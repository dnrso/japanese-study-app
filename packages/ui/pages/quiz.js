import { quizPanel, speakerButton, icon, noteCard } from "../components/index.js";
import { kanjiCard } from "./kanji.js";
import { sentenceCard } from "./sentences.js";

const SENTENCE_QUIZ_TITLES = {
  meaning: "문장 뜻 고르기",
  listen: "듣고 문장 고르기"
};

// Missed items are shown with the same cards the tabs use. `itemById(id)`
// returns the CURRENT item from app state (null when it was deleted).
export function renderWordQuizPage({ quiz, itemById = () => null, reviewOptions = [], helpers }) {
  const panel = quizPanel({
    quiz,
    family: "word",
    title: "단어 퀴즈",
    restartKind: "word",
    cumulativeLabel: "단어",
    itemById,
    missedListClass: "cards study-card-grid",
    missedCard: item => noteCard(item, reviewOptions, helpers, { showKind: false }),
    promptText: question => question.answerType === "title" ? "뜻" : "일본어",
    promptHtml: question => question.answerType === "title"
      ? `<h3><span>${helpers.highlight(question.item.meaning)}</span></h3>`
      : `<h3>${speakerButton(question.item.title, helpers)}<span>${helpers.highlight(question.item.title)}</span></h3>${question.item.reading ? `<p>${helpers.highlight(question.item.reading)}</p>` : ""}`
  }, helpers);
  return {
    html: { wordQuizPanel: panel.html },
    hidden: { wordQuizPanel: panel.hidden }
  };
}

export function renderKanjiQuizPage({ quiz, itemById = () => null, reviewOptions = [], wordsFor = () => [], wordLimit = 3, helpers }) {
  const panel = quizPanel({
    quiz,
    family: "kanji",
    title: "한자 퀴즈",
    restartKind: "kanji",
    cumulativeLabel: "한자",
    itemById,
    missedListClass: "kanji-grid",
    missedCard: item => kanjiCard(item, { reviewOptions, wordsFor, wordLimit, helpers }),
    promptText: question => question.answerType === "title" ? "뜻" : "한자",
    promptHtml: question => question.answerType === "title"
      ? `<h3><span>${helpers.highlight(question.item.meaning)}</span></h3>`
      : `<h3><span>${helpers.highlight(question.item.title)}</span></h3>`
  }, helpers);
  return {
    html: { kanjiQuizPanel: panel.html },
    hidden: { kanjiQuizPanel: panel.hidden }
  };
}

export function renderSentenceQuizPage({ quiz, itemById = () => null, helpers }) {
  const mode = quiz.question?.mode;
  const panel = quizPanel({
    quiz,
    family: "sentence",
    title: SENTENCE_QUIZ_TITLES[mode] || "문장 퀴즈",
    restartKind: mode === "listen" ? "sentence-listen" : "sentence-meaning",
    layout: "list",
    itemById,
    missedListClass: "sentence-list",
    missedCard: item => sentenceCard(item, helpers, { domId: false, open: true }),
    promptText: (question, currentQuiz) => question.mode === "listen" && !currentQuiz.answered ? "" : "일본어 문장",
    promptHtml: (question, currentQuiz) => sentencePromptHtml(question, currentQuiz, helpers)
  }, helpers);
  return {
    html: { sentenceQuizPanel: panel.html },
    hidden: { sentenceQuizPanel: panel.hidden }
  };
}

function sentencePromptHtml(question, quiz, helpers) {
  const { item, mode } = question;
  if (mode === "listen" && !quiz.answered) {
    return `
      <div class="quiz-listen">
        <button class="quiz-listen-btn" type="button" data-speak-text="${helpers.escapeHtml(item.title)}" title="다시 듣기" aria-label="다시 듣기">${icon("volume")}</button>
        <span class="quiz-listen-replay">다시 듣기</span>
        <p class="quiz-listen-caption">문장을 듣고 맞는 문장을 고르세요</p>
      </div>
    `;
  }
  const revealedMeaning = mode === "listen" ? `<p>${helpers.highlight(item.meaning)}</p>` : "";
  return `
    <h3>${speakerButton(item.title, helpers)}<span>${helpers.highlight(item.title)}</span></h3>
    ${item.reading ? `<p>${helpers.highlight(item.reading)}</p>` : ""}
    ${revealedMeaning}
  `;
}
