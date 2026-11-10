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
  settings: [["settings-general", "일반 설정", ""], ["settings-account", "계정 및 동기화", ""], ["settings-quiz", "퀴즈 표시", ""], ["settings-tts", "음성 재생", ""]]
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

export const sentenceEntryExample = `# みんな心配してるよ
읽기 みんな しんぱい してる よ
해석 다들 걱정하고 있어
단어장
\`みんな\` (みんな) 모두, 다들 | 품사=명사 | 문자=히라가나
\`心配する\` (しんぱいする) 걱정하다 | 한자=心 (마음 심), 配 (나눌 배) | 품사=サ변동사 | 문자=한자+히라가나
문법
\`〜てる\` 동작의 진행이나 상태를 나타내는 \`〜ている\`에서 \`い\`가 생략된 구어(회화체) 축약 표현입니다.
\`〜よ\` 문장 끝에 붙어 상대방에게 주의를 환기시키거나 정보를 부드럽게 알려주는 종조사입니다.
표현
\`みんな心配してるよ\` 상대방에게 "모두가 너를 염려하고 있다"는 사실을 전하며 안심시키거나 상황을 다독일 때 일상 회화에서 매우 자주 쓰이는 다정한 표현입니다.`;

export const manualEntryPlaceholders = {
  word: "`私` (わたし) 나, 저 | 한자=私(사사 사) | 품사=대명사 | 문자=한자",
  grammar: "`したかな` 동사 'する'의 과거형 'した'에 의문을 나타내는 종조사 'かな'가 붙어, 자신의 행동을 되돌아보며 자문하는 뉘앙스를 나타냅니다.",
  expression: "`お疲れさまです` (おつかれさまです) 수고하셨습니다. 직장이나 모임에서 인사, 감사, 마무리 인사로 넓게 쓰는 표현입니다."
};
