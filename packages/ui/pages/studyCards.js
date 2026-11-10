import { empty, noteCard } from "../components/index.js";

export function renderStudyCardsPage({ targetId, list, reviewOptions = [], emptyMessage, helpers }) {
  return {
    html: {
      [targetId]: list.length ? list.map(item => noteCard(item, reviewOptions, helpers)).join("") : empty(emptyMessage)
    }
  };
}
