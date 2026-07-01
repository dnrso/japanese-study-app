export function renderStatsPage({ stats }) {
  return {
    text: {
      totalMinutes: `${stats.totalMinutes}분`,
      totalWords: stats.totalWords,
      totalGrammarExpression: stats.totalGrammarExpression,
      completedSources: stats.completedSources
    }
  };
}
