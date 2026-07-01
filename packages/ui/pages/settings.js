export function renderStoragePathsPage({ storagePaths }) {
  if (!storagePaths) {
    return {};
  }
  return {
    text: {
      appDataPath: storagePaths.appDataDir,
      sqlitePath: storagePaths.dbPath,
      exportPath: storagePaths.exportsDir,
      backupPath: storagePaths.backupsDir
    }
  };
}

export function renderQuizSettingsPage({
  quizQuestionFontSize,
  quizReviewOnCorrect,
  quizCorrectReview,
  scheduledReviewOptions,
  helpers
}) {
  return {
    value: {
      quizQuestionFontSizeRange: String(quizQuestionFontSize),
      quizCorrectReviewSelect: quizCorrectReview
    },
    text: {
      quizQuestionFontSizeValue: `${quizQuestionFontSize}px`
    },
    html: {
      quizCorrectReviewSelect: [
        `<option value="">변경 안 함</option>`,
        ...scheduledReviewOptions.map(option => `<option value="${helpers.escapeHtml(option)}">${helpers.escapeHtml(option)}</option>`)
      ].join("")
    },
    disabled: {
      quizCorrectReviewSelect: !quizReviewOnCorrect
    }
  };
}
