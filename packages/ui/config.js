export const tocByPage = {
  home: [["home-overview", "오늘 개요", ""], ["home-stats", "요약 지표", "4"], ["home-today", "오늘 할 일", ""], ["home-recent", "최근 추가", ""], ["home-queue", "복습 큐", ""]],
  today: [["today-log", "기록 입력", ""], ["today-calendar", "학습 캘린더", ""], ["today-sentences", "문장 카드", ""], ["today-learned", "오늘 배운 항목", ""]],
  sources: [["sources-library", "자료 라이브러리", ""]],
  sentences: [["sentences-list", "문장 목록", ""]],
  words: [["words-list", "단어 목록", ""]],
  grammar: [["grammar-detail", "문법 상세", ""]],
  expressions: [["expressions-list", "표현 목록", ""]],
  kanji: [["kanji-grid", "한자 목록", ""]],
  quiz: [["quiz-select", "퀴즈 선택", "4"]],
  review: [["review-queue", "복습 큐", ""]],
  stats: [["stats-overview", "주간 통계", ""]],
  settings: [["settings-display", "화면 표시", ""], ["settings-quiz", "퀴즈", ""], ["settings-tts", "음성", ""], ["settings-account", "계정 및 동기화", ""], ["settings-data", "데이터", ""]]
};

export const kindLabels = {
  word: "단어",
  grammar: "문법",
  expression: "표현",
  kanji: "한자",
  sentence: "문장",
  source: "자료"
};

export const badgeClassByKind = {
  word: "red",
  grammar: "blue",
  expression: "green",
  kanji: "yellow",
  sentence: "purple",
  source: "green"
};

export const reviewOptions = ["오늘", "내일", "3일 후", "일주일", "2주일", "한달", "대기"];
export const scheduledReviewOptions = ["내일", "3일 후", "일주일", "2주일", "한달"];
export const partOptions = ["명사", "대명사", "동사", "い형용사", "な형용사", "부사", "조사", "조동사", "접속사", "감탄사", "표현", "동사표현", "형용사표현", "부사표현", "문법표현", "サ변동사"];
export const scriptOptions = ["한자", "히라가나", "가타카나", "한자+히라가나", "한자+가타카나", "혼합"];

export const sentenceEntryExample = `# 今日疲れた
읽기 きょう つかれた
해석 오늘 피곤했어
단어장
\`今日\` (きょう) 오늘 | 한자=今 (이제 금), 日 (날 일) | 품사=명사 | 문자=한자
\`疲れる\` (つかれる) 피곤하다, 지치다 | 한자=疲 (피곤할 피) | 품사=동사 | 문자=한자+히라가나
문법
\`疲れた\` 동사 \`疲れる\`의 연용형에 과거·완료를 나타내는 조동사 \`た\`가 결합한 형태입니다. 과거의 일뿐만 아니라, 피로가 누적된 결과인 현재의 상태("피곤해진 상태이다")를 나타냅니다.
표현
\`疲れた\` 일본어에서는 지금 피곤함을 느낄 때 현재형(\`疲れる\`)이 아닌 완료형(\`疲れた\`)을 사용하여 표현합니다. 하루를 마치거나 일과 후 혼잣말 또는 일상 회화에서 "지쳤다", "피곤하다"라는 의미로 매우 자주 쓰입니다.`;

export const manualEntryPlaceholders = {
  word: "`私` (わたし) 나, 저 | 한자=私(사사 사) | 품사=대명사 | 문자=한자",
  grammar: "`したかな` 동사 'する'의 과거형 'した'에 의문을 나타내는 종조사 'かな'가 붙어, 자신의 행동을 되돌아보며 자문하는 뉘앙스를 나타냅니다.",
  expression: "`お疲れさまです` (おつかれさまです) 수고하셨습니다. 직장이나 모임에서 인사, 감사, 마무리 인사로 넓게 쓰는 표현입니다."
};
