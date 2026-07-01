import { empty, studyCard } from "../components/index.js";

export function renderStudyCardsPage({ kind, targetId, list, helpers }) {
  return {
    html: {
      [targetId]: list.length ? list.map(item => studyCard(item, helpers)).join("") : empty(`${helpers.kindLabels[kind]} 항목을 추가해 보세요.`)
    }
  };
}
